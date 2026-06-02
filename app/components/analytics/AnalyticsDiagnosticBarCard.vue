<script setup lang="ts">
import { VisArea, VisAxis, VisGroupedBar, VisLine, VisScatter, VisXYContainer } from "@unovis/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatAnalyticsCompact,
  formatAnalyticsMoney,
  numeric,
} from "~~/app/utils/analytics-charts"

export interface AnalyticsDiagnosticBarRow {
  id: string
  label: string
  value: string | number
  secondaryValue?: string | number | null
  secondaryLabel?: string | null
  meta?: string | null
  tone?: "positive" | "negative" | "warning" | "info" | "neutral"
  count?: number | null
  countryCode?: string | null
  share?: number | null
}

interface BarDatum extends AnalyticsDiagnosticBarRow {
  value: number
  secondaryValue: number | null
  chartIndex: number
  color: string
}

interface AreaDatum extends BarDatum {
  areaIndex: number
}

interface PremiumTooltipState {
  open: boolean
  title: string
  value: string
  detail: string
  accent: string
  x: number
  y: number
}

const props = withDefaults(defineProps<{
  title: string
  badge: string
  description: string
  rows: AnalyticsDiagnosticBarRow[]
  valueKind?: "money" | "count" | "percent" | "rpm"
  variant?: "bar" | "area" | "donut"
  emptyTitle?: string
  expandLabel: string
  scopeLabel?: string
  totalValue?: string | number | null
  totalLabel?: string
}>(), {
  valueKind: "money",
  variant: "bar",
  emptyTitle: "No chart signal",
  scopeLabel: "",
  totalValue: null,
  totalLabel: "Total",
})

const emit = defineEmits<{
  expand: []
  select: [row: AnalyticsDiagnosticBarRow]
}>()

const chartPalette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
const chartElement = ref<HTMLElement | null>(null)
const premiumTooltip = reactive<PremiumTooltipState>({
  open: false,
  title: "",
  value: "",
  detail: "",
  accent: "var(--chart-1)",
  x: 0,
  y: 0,
})
const premiumTooltipStyle = computed(() => ({
  left: `${premiumTooltip.x}px`,
  top: `${premiumTooltip.y}px`,
  "--tooltip-accent": premiumTooltip.accent,
}))

function rowColor(row: Pick<AnalyticsDiagnosticBarRow, "tone">, index: number) {
  if (row.tone === "positive") {
    return "var(--status-success)"
  }

  if (row.tone === "negative") {
    return "var(--destructive)"
  }

  if (row.tone === "warning") {
    return "var(--priority)"
  }

  if (row.tone === "info") {
    return "var(--chart-2)"
  }

  return chartPalette[index % chartPalette.length]
}

const chartRows = computed<BarDatum[]>(() => props.rows
  .map((row, index) => ({
    ...row,
    value: Math.max(0, numeric(row.value)),
    secondaryValue: row.secondaryValue === null || row.secondaryValue === undefined ? null : Math.max(0, numeric(row.secondaryValue)),
    chartIndex: index,
    color: rowColor(row, index),
  }))
  .filter((row) => row.value > 0 || Number(row.secondaryValue ?? 0) > 0)
  .slice(0, 8)
  .reverse()
  .map((row, index) => ({
    ...row,
    chartIndex: index,
  })))

const displayRows = computed(() => [...chartRows.value].reverse())
const areaRows = computed<AreaDatum[]>(() => displayRows.value.map((row, index) => ({
  ...row,
  areaIndex: index,
})))
const chartRenderKey = computed(() => [
  props.variant,
  props.valueKind,
  props.scopeLabel,
  chartRows.value.length,
  ...chartRows.value.map((row) => `${row.id}:${row.value}:${row.secondaryValue ?? ""}:${row.label}`),
].join("|"))
const emptyDescription = computed(() => (
  props.scopeLabel ? `No matching chart rows inside ${props.scopeLabel}.` : ""
))

const chartHeight = computed(() => Math.max(238, chartRows.value.length * 34 + 64))
const xDomain = computed<[number, number]>(() => {
  const maxValue = chartRows.value.reduce((max, row) => Math.max(max, row.value, row.secondaryValue ?? 0), 0)
  return [0, maxValue > 0 ? maxValue * 1.16 : 1]
})
const yDomain = computed<[number, number]>(() => [
  0,
  Math.max(chartRows.value.length - 1, 1),
])
const tickValues = computed(() => chartRows.value.map((row) => row.chartIndex))
const areaXDomain = computed<[number, number]>(() => [
  0,
  Math.max(areaRows.value.length - 1, 1),
])
const areaYDomain = computed<[number, number]>(() => {
  const maxValue = areaRows.value.reduce((max, row) => Math.max(max, row.value), 0)
  return [0, maxValue > 0 ? maxValue * 1.18 : 1]
})
const areaTickValues = computed(() => {
  const rows = areaRows.value
  return rows
    .filter((row) => rows.length <= 5 || row.areaIndex === 0 || row.areaIndex === rows.length - 1 || row.areaIndex % 2 === 0)
    .map((row) => row.areaIndex)
})
const previewTotal = computed(() => displayRows.value.reduce((sum, row) => sum + row.value, 0))
const explicitTotal = computed(() => (
  props.totalValue === null || props.totalValue === undefined ? null : Math.max(0, numeric(props.totalValue))
))
const shareBasisTotal = computed(() => explicitTotal.value ?? previewTotal.value)
const shareTotalLabel = computed(() => (explicitTotal.value === null ? "Total" : props.totalLabel))
const shareBasisLabel = computed(() => (explicitTotal.value === null ? "visible total" : props.totalLabel).trim().toLowerCase() || "total")
const shareRows = computed(() => displayRows.value.map((row) => ({
  ...row,
  share: typeof row.share === "number" ? row.share : shareBasisTotal.value ? (row.value / shareBasisTotal.value) * 100 : 0,
})))

function chartX(row: BarDatum) {
  return row.chartIndex
}

function chartY(row: BarDatum) {
  return row.value
}

function chartColor(row: BarDatum) {
  return row.color
}

function areaX(row: AreaDatum) {
  return row.areaIndex
}

function areaY(row: AreaDatum) {
  return row.value
}

function areaColor(row: AreaDatum) {
  return row.color
}

function shortLabel(value: string) {
  const safe = value.replace(/[{}|]/g, " ").trim()
  return safe.length > 14 ? `${safe.slice(0, 11)}...` : safe
}

function formatValue(value: string | number | null | undefined) {
  const amount = numeric(value)

  if (props.valueKind === "count") {
    return formatAnalyticsCompact(amount)
  }

  if (props.valueKind === "percent") {
    return `${amount.toFixed(1)}%`
  }

  if (props.valueKind === "rpm") {
    return `$${amount.toFixed(2)} RPM`
  }

  return formatAnalyticsMoney(amount)
}

function formatAxisValue(value: number | Date) {
  const amount = Number(value ?? 0)

  if (props.valueKind === "percent") {
    return `${amount.toFixed(0)}%`
  }

  if (props.valueKind === "rpm") {
    return `$${amount.toFixed(1)}`
  }

  if (props.valueKind === "count") {
    return formatAnalyticsCompact(amount)
  }

  return `$${formatAnalyticsCompact(amount)}`
}

function formatYAxis(value: number | Date) {
  const row = chartRows.value.find((entry) => entry.chartIndex === Math.round(Number(value)))
  return row ? shortLabel(row.label) : ""
}

function formatAreaXAxis(value: number | Date) {
  const row = areaRows.value.find((entry) => entry.areaIndex === Math.round(Number(value)))
  return row ? shortLabel(row.label) : ""
}

function rowTitle(row: Pick<AnalyticsDiagnosticBarRow, "label" | "meta"> & { value: number; secondaryValue?: number | null }) {
  const secondary = row.secondaryValue === null || row.secondaryValue === undefined ? "" : ` / ${formatValue(row.secondaryValue)} prior`
  return `${row.label} / ${formatValue(row.value)}${secondary}${row.meta ? ` / ${row.meta}` : ""}`
}

function selectRow(row: AnalyticsDiagnosticBarRow) {
  emit("select", row)
}

function nearestAreaRow(event: MouseEvent) {
  if (!chartElement.value || !areaRows.value.length) {
    return null
  }

  const rect = chartElement.value.getBoundingClientRect()
  const xPercent = rect.width > 0 ? Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) : 0
  return areaRows.value[Math.round(xPercent * (areaRows.value.length - 1))] ?? null
}

function tooltipDetail(row: Pick<AnalyticsDiagnosticBarRow, "meta" | "secondaryLabel"> & { secondaryValue?: number | null }, fallback = "Click to filter") {
  const parts = [
    row.meta || row.secondaryLabel || props.scopeLabel || fallback,
    row.secondaryValue === null || row.secondaryValue === undefined ? "" : `Prior ${formatValue(row.secondaryValue)}`,
  ].filter(Boolean)

  return parts.join(" / ")
}

function updatePremiumTooltipPosition(event: MouseEvent | FocusEvent) {
  const target = event.currentTarget instanceof Element
    ? event.currentTarget
    : event.target instanceof Element
      ? event.target
      : null
  const card = target?.closest(".diagnostic-chart-card")

  if (!(card instanceof HTMLElement)) {
    return
  }

  const cardRect = card.getBoundingClientRect()
  const targetRect = target?.getBoundingClientRect()
  const clientX = event instanceof MouseEvent ? event.clientX : (targetRect ? targetRect.left + targetRect.width / 2 : cardRect.left + cardRect.width / 2)
  const clientY = event instanceof MouseEvent ? event.clientY : (targetRect ? targetRect.top + targetRect.height / 2 : cardRect.top + 120)
  const x = clientX - cardRect.left
  const y = clientY - cardRect.top

  premiumTooltip.x = Math.min(Math.max(x, 116), Math.max(116, cardRect.width - 116))
  premiumTooltip.y = Math.min(Math.max(y, 92), Math.max(92, cardRect.height - 18))
}

function showRowTooltip(row: BarDatum, event: MouseEvent | FocusEvent) {
  premiumTooltip.title = row.label
  premiumTooltip.value = formatValue(row.value)
  premiumTooltip.detail = tooltipDetail(row)
  premiumTooltip.accent = row.color
  premiumTooltip.open = true
  updatePremiumTooltipPosition(event)
}

function showShareTooltip(row: BarDatum & { share: number }, event: MouseEvent | FocusEvent) {
  premiumTooltip.title = row.label
  premiumTooltip.value = formatValue(row.value)
  premiumTooltip.detail = `${row.share.toFixed(1)}% of ${shareBasisLabel.value}${row.meta ? ` / ${row.meta}` : props.scopeLabel ? ` / ${props.scopeLabel}` : ""}`
  premiumTooltip.accent = row.color
  premiumTooltip.open = true
  updatePremiumTooltipPosition(event)
}

function handleChartFrameMove(event: MouseEvent) {
  if (props.variant !== "area") {
    return
  }

  const row = nearestAreaRow(event)

  if (row) {
    showRowTooltip(row, event)
  }
}

function handleChartFrameClick(event: MouseEvent) {
  if (props.variant !== "area") {
    return
  }

  if (event.target instanceof Element && event.target.closest("button")) {
    return
  }

  const row = nearestAreaRow(event)

  if (row) {
    selectRow(row)
  }
}

function hidePremiumTooltip() {
  premiumTooltip.open = false
}
</script>

<template>
  <Card class="diagnostic-chart-card" @mouseleave="hidePremiumTooltip">
    <CardHeader class="diagnostic-chart-header">
      <div class="diagnostic-chart-title-block">
        <Badge variant="secondary" class="w-fit">
          {{ badge }}
        </Badge>
        <CardTitle>{{ title }}</CardTitle>
        <CardDescription>{{ description }}</CardDescription>
      </div>

      <CardAction class="diagnostic-chart-actions">
        <slot name="actions" />
        <AnalyticsExpandButton :label="expandLabel" @expand="emit('expand')" />
      </CardAction>
    </CardHeader>

    <CardContent class="diagnostic-chart-content">
      <div
        ref="chartElement"
        class="diagnostic-bar-frame"
        :class="`is-${variant}`"
        @click="handleChartFrameClick"
        @mousemove="handleChartFrameMove"
        @mouseleave="variant === 'area' && hidePremiumTooltip()"
      >
        <AppEmptyState
          v-if="!chartRows.length"
          compact
          icon="chart"
          :title="emptyTitle"
          :description="emptyDescription"
          class="diagnostic-chart-empty"
        />
        <ClientOnly v-else-if="variant === 'area'">
          <VisXYContainer
            :key="chartRenderKey"
            :data="areaRows"
            :height="286"
            :margin="{ top: 18, right: 20, bottom: 30, left: 36 }"
            :padding="{ top: 6, right: 8, bottom: 0, left: 0 }"
            :x-domain="areaXDomain"
            :y-domain="areaYDomain"
            aria-label="Diagnostic area chart"
          >
            <VisArea
              :x="areaX"
              :y="areaY"
              color="color-mix(in srgb, var(--chart-1) 24%, transparent)"
              curve-type="monotoneX"
            />
            <VisLine
              :x="areaX"
              :y="areaY"
              color="var(--chart-1)"
              curve-type="monotoneX"
              :line-width="2.4"
            />
            <VisScatter
              :x="areaX"
              :y="areaY"
              :color="areaColor"
              stroke-color="var(--card)"
              :stroke-width="2"
              :size="8"
              cursor="pointer"
            />
            <VisAxis
              type="x"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :tick-values="areaTickValues"
              :tick-format="formatAreaXAxis"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="10"
            />
            <VisAxis
              type="y"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :num-ticks="4"
              :tick-format="formatAxisValue"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="10"
            />
          </VisXYContainer>

          <template #fallback>
            <div class="diagnostic-chart-empty" />
          </template>
        </ClientOnly>

        <ClientOnly v-else-if="variant === 'donut'">
          <div :key="chartRenderKey" class="diagnostic-share-stage" role="img" aria-label="Diagnostic share chart">
            <div class="diagnostic-share-total">
              <span>{{ shareTotalLabel }}</span>
              <strong>{{ formatValue(shareBasisTotal) }}</strong>
            </div>

            <div class="diagnostic-share-strip" aria-hidden="true">
              <button
                v-for="row in shareRows"
                :key="`diagnostic-share-strip-${row.id}`"
                type="button"
                :style="{ '--diagnostic-color': row.color, '--diagnostic-share': `${Math.max(row.share, 3)}%` }"
                :aria-label="`${row.label} / ${formatValue(row.value)} / ${row.share.toFixed(1)}%`"
                @mouseenter="showShareTooltip(row, $event)"
                @mousemove="updatePremiumTooltipPosition"
                @focus="showShareTooltip(row, $event)"
                @mouseleave="hidePremiumTooltip"
                @blur="hidePremiumTooltip"
                @click.stop="selectRow(row)"
              />
            </div>

            <div class="diagnostic-share-list">
              <button
                v-for="row in shareRows.slice(0, 5)"
                :key="`diagnostic-share-row-${row.id}`"
                type="button"
                class="diagnostic-share-row"
                :style="{ '--diagnostic-color': row.color, '--diagnostic-share': `${Math.min(100, Math.max(row.share, 1))}%` }"
                :aria-label="`${row.label} / ${formatValue(row.value)} / ${row.share.toFixed(1)}%`"
                @mouseenter="showShareTooltip(row, $event)"
                @mousemove="updatePremiumTooltipPosition"
                @focus="showShareTooltip(row, $event)"
                @mouseleave="hidePremiumTooltip"
                @blur="hidePremiumTooltip"
                @click.stop="selectRow(row)"
              >
                <span>
                  <i aria-hidden="true" />
                  <strong>{{ row.label }}</strong>
                </span>
                <em>{{ row.share.toFixed(1) }}%</em>
              </button>
            </div>
          </div>

          <template #fallback>
            <div class="diagnostic-chart-empty" />
          </template>
        </ClientOnly>

        <ClientOnly v-else>
          <VisXYContainer
            :key="chartRenderKey"
            :data="chartRows"
            :height="chartHeight"
            :margin="{ top: 10, right: 24, bottom: 28, left: 94 }"
            :padding="{ top: 6, right: 8, bottom: 0, left: 0 }"
            :x-domain="xDomain"
            :y-domain="yDomain"
            aria-label="Diagnostic bar chart"
          >
            <VisGroupedBar
              :x="chartX"
              :y="chartY"
              :color="chartColor"
              orientation="horizontal"
              :rounded-corners="7"
              :group-padding="0.28"
              :group-max-width="15"
              cursor="pointer"
            />
            <VisAxis
              type="x"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :num-ticks="4"
              :tick-format="formatAxisValue"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="10"
            />
            <VisAxis
              type="y"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :tick-values="tickValues"
              :tick-format="formatYAxis"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="10"
            />
          </VisXYContainer>

          <div class="diagnostic-bar-hit-layer" :style="{ '--diagnostic-hit-count': displayRows.length }" aria-hidden="true">
            <button
              v-for="row in displayRows"
              :key="`diagnostic-hit-${row.id}`"
              type="button"
              :aria-label="rowTitle(row)"
              @mouseenter="showRowTooltip(row, $event)"
              @mousemove="updatePremiumTooltipPosition"
              @focus="showRowTooltip(row, $event)"
              @mouseleave="hidePremiumTooltip"
              @blur="hidePremiumTooltip"
              @click.stop="selectRow(row)"
            />
          </div>

          <template #fallback>
            <div class="diagnostic-chart-empty" />
          </template>
        </ClientOnly>
      </div>
    </CardContent>

    <CardFooter v-if="displayRows.length" class="diagnostic-chart-list">
      <Button
        v-for="row in displayRows.slice(0, 5)"
        :key="row.id"
        type="button"
        variant="ghost"
        size="sm"
        class="diagnostic-chart-row h-auto px-0 py-0"
        :style="{ '--diagnostic-color': row.color }"
        @mouseenter="showRowTooltip(row, $event)"
        @mousemove="updatePremiumTooltipPosition"
        @focus="showRowTooltip(row, $event)"
        @mouseleave="hidePremiumTooltip"
        @blur="hidePremiumTooltip"
        @click="selectRow(row)"
      >
        <span class="diagnostic-row-dot" aria-hidden="true" />
        <span class="diagnostic-row-copy">
          <strong>{{ row.label }}</strong>
          <small>{{ row.meta || row.secondaryLabel || "Chart row" }}</small>
        </span>
        <span class="diagnostic-row-value">
          <strong>{{ formatValue(row.value) }}</strong>
          <small v-if="row.secondaryValue !== null && row.secondaryValue !== undefined">
            {{ row.secondaryLabel || "Prior" }} {{ formatValue(row.secondaryValue) }}
          </small>
        </span>
      </Button>
    </CardFooter>

    <div
      v-if="premiumTooltip.open"
      class="diagnostic-premium-tooltip"
      :style="premiumTooltipStyle"
      role="tooltip"
    >
      <span class="diagnostic-premium-tooltip-kicker">
        <i aria-hidden="true" />
        {{ badge }}
      </span>
      <strong>{{ premiumTooltip.title }}</strong>
      <em>{{ premiumTooltip.value }}</em>
      <small v-if="premiumTooltip.detail">{{ premiumTooltip.detail }}</small>
    </div>
  </Card>
</template>

<style scoped>
.diagnostic-chart-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.diagnostic-chart-header {
  gap: 8px;
  padding-bottom: 10px;
}

.diagnostic-chart-title-block {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.diagnostic-chart-title-block :deep([data-slot="card-title"]) {
  font-size: 16px;
  font-weight: 740;
  letter-spacing: 0;
  line-height: 1.2;
}

.diagnostic-chart-title-block :deep([data-slot="card-description"]) {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.diagnostic-chart-actions {
  display: inline-flex;
  gap: 7px;
  align-items: center;
}

.diagnostic-chart-content {
  display: grid;
  gap: 10px;
}

.diagnostic-bar-frame {
  position: relative;
  min-height: 238px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 64%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--foreground) 2%, transparent), transparent),
    color-mix(in srgb, var(--card) 84%, var(--background) 16%);
}

.diagnostic-bar-frame.is-area,
.diagnostic-bar-frame.is-donut {
  min-height: 286px;
}

.diagnostic-bar-frame.is-area {
  cursor: pointer;
}

.diagnostic-chart-empty {
  min-height: 238px;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.diagnostic-bar-frame :deep(.unovis-xy-container) {
  min-height: 238px;
}

.diagnostic-bar-frame.is-area :deep(.unovis-xy-container) {
  min-height: 286px;
}

.diagnostic-bar-frame :deep(svg) {
  overflow: visible;
}

.diagnostic-bar-frame :deep(.vis-axis .tick line),
.diagnostic-bar-frame :deep(.vis-axis .domain) {
  stroke: transparent;
}

.diagnostic-bar-frame :deep(.vis-area path) {
  filter: drop-shadow(0 12px 14px color-mix(in srgb, var(--chart-1) 16%, transparent));
}

.diagnostic-share-stage {
  display: grid;
  min-height: 286px;
  align-content: center;
  gap: 18px;
  padding: 22px;
}

.diagnostic-share-total {
  display: grid;
  gap: 3px;
  justify-items: center;
  text-align: center;
}

.diagnostic-share-total span {
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.diagnostic-share-total strong {
  color: var(--foreground);
  font-family: var(--font-sans);
  font-size: 22px;
  font-weight: 820;
  line-height: 1;
}

.diagnostic-share-strip {
  display: flex;
  min-width: 0;
  height: 18px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 60%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 4%, transparent);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--foreground) 7%, transparent);
}

.diagnostic-share-strip button {
  width: var(--diagnostic-share);
  min-width: 12px;
  border: 0;
  background: var(--diagnostic-color);
  cursor: pointer;
  transition:
    filter var(--duration-fast, 150ms) var(--ease-out),
    opacity var(--duration-fast, 150ms) var(--ease-out);
}

.diagnostic-share-strip button:hover,
.diagnostic-share-strip button:focus-visible {
  filter: brightness(1.08) saturate(1.1);
  opacity: 0.86;
}

.diagnostic-share-list {
  display: grid;
  gap: 9px;
}

.diagnostic-share-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--foreground) 2%, transparent);
  color: inherit;
  cursor: pointer;
  padding: 9px 10px;
  text-align: left;
}

.diagnostic-share-row::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--diagnostic-share);
  background: color-mix(in srgb, var(--diagnostic-color) 14%, transparent);
  content: "";
  pointer-events: none;
}

.diagnostic-share-row:hover,
.diagnostic-share-row:focus-visible {
  border-color: color-mix(in srgb, var(--diagnostic-color) 34%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--diagnostic-color) 8%, transparent);
  outline: none;
}

.diagnostic-share-row span,
.diagnostic-share-row em {
  position: relative;
  z-index: 1;
}

.diagnostic-share-row span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.diagnostic-share-row i {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--diagnostic-color);
}

.diagnostic-share-row strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnostic-share-row em {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-style: normal;
  font-weight: 780;
}

.diagnostic-bar-hit-layer {
  position: absolute;
  inset: 10px 24px 28px 94px;
  display: grid;
  grid-template-rows: repeat(var(--diagnostic-hit-count, 1), minmax(0, 1fr));
  pointer-events: none;
}

.diagnostic-bar-hit-layer button {
  border: 0;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}

.diagnostic-bar-hit-layer button:hover,
.diagnostic-bar-hit-layer button:focus-visible {
  background: color-mix(in srgb, var(--foreground) 4%, transparent);
  outline: none;
}

.diagnostic-chart-list {
  display: grid;
  gap: 7px;
  padding-top: 0;
}

.diagnostic-chart-row {
  display: grid;
  width: 100%;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  color: inherit;
}

.diagnostic-chart-row:hover,
.diagnostic-chart-row:focus-visible {
  background: color-mix(in srgb, var(--diagnostic-color) 7%, transparent);
}

.diagnostic-row-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--diagnostic-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--diagnostic-color) 14%, transparent);
}

.diagnostic-row-copy,
.diagnostic-row-value {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.diagnostic-row-copy strong,
.diagnostic-row-value strong,
.diagnostic-row-copy small,
.diagnostic-row-value small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnostic-row-copy strong,
.diagnostic-row-value strong {
  color: var(--foreground);
  font-size: 12px;
  font-weight: 720;
  line-height: 1.2;
}

.diagnostic-row-value {
  text-align: right;
}

.diagnostic-row-value strong {
  font-family: var(--font-mono);
}

.diagnostic-row-copy small,
.diagnostic-row-value small {
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 680;
  letter-spacing: 0.035em;
  text-transform: uppercase;
}

:global(.dark) .diagnostic-bar-frame {
  border-color: color-mix(in srgb, #d7d7d2 5%, transparent);
  background: color-mix(in srgb, #0a0a0a 48%, var(--card) 52%);
}

:global(.analytics-chart-tooltip-popover) {
  width: max-content !important;
  min-width: 136px !important;
  max-width: 240px !important;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent) !important;
  border-radius: 10px !important;
  background: var(--popover) !important;
  color: var(--popover-foreground) !important;
  box-shadow: 0 14px 30px rgb(0 0 0 / 26%) !important;
  padding: 0 !important;
  backdrop-filter: blur(14px);
}

:global(.diagnostic-tooltip-content span) {
  display: block;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 760;
}

:global(.diagnostic-tooltip-content small) {
  display: block;
  margin-top: 3px;
  color: var(--muted-foreground);
  font-size: 11px;
}

.diagnostic-premium-tooltip {
  position: absolute;
  z-index: 30;
  display: grid;
  width: max-content;
  min-width: 176px;
  max-width: 252px;
  gap: 5px;
  transform: translate(-50%, calc(-100% - 14px));
  border: 1px solid color-mix(in srgb, var(--tooltip-accent) 24%, var(--surface-border, var(--border)));
  border-radius: 14px;
  background:
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--tooltip-accent) 18%, transparent), transparent 44%),
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 96%, white 4%), color-mix(in srgb, var(--popover) 90%, var(--background) 10%));
  color: var(--popover-foreground);
  padding: 11px 12px 12px;
  box-shadow:
    0 22px 44px -26px rgb(0 0 0 / 60%),
    inset 0 1px 0 color-mix(in srgb, white 52%, transparent);
  pointer-events: none;
  backdrop-filter: blur(16px) saturate(1.08);
}

.diagnostic-premium-tooltip::after {
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 11px;
  height: 11px;
  transform: translateX(-50%) rotate(45deg);
  border-right: 1px solid color-mix(in srgb, var(--tooltip-accent) 18%, var(--surface-border, var(--border)));
  border-bottom: 1px solid color-mix(in srgb, var(--tooltip-accent) 18%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--popover) 92%, var(--background) 8%);
  content: "";
}

.diagnostic-premium-tooltip-kicker {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.075em;
  line-height: 1;
  text-transform: uppercase;
}

.diagnostic-premium-tooltip-kicker i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--tooltip-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--tooltip-accent) 16%, transparent);
}

.diagnostic-premium-tooltip strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 820;
  line-height: 1.22;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnostic-premium-tooltip em {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 15px;
  font-style: normal;
  font-weight: 820;
  line-height: 1.1;
}

.diagnostic-premium-tooltip small {
  display: block;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, var(--muted-foreground) 92%, var(--foreground) 8%);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
}

:global(.dark) .diagnostic-premium-tooltip {
  background:
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--tooltip-accent) 16%, transparent), transparent 44%),
    linear-gradient(180deg, color-mix(in srgb, #15130f 84%, var(--popover) 16%), color-mix(in srgb, #080806 78%, var(--popover) 22%));
  box-shadow:
    0 22px 44px -24px rgb(0 0 0 / 84%),
    inset 0 1px 0 rgb(255 255 255 / 7%);
}

:global(.dark) .diagnostic-premium-tooltip::after {
  background: color-mix(in srgb, #080806 78%, var(--popover) 22%);
}

@media (max-width: 760px) {
  .diagnostic-chart-header {
    display: grid;
  }

  .diagnostic-chart-actions {
    justify-content: flex-start;
  }

  .diagnostic-bar-frame {
    min-height: 226px;
  }

  .diagnostic-share-stage {
    min-height: 260px;
    padding: 18px;
  }
}
</style>
