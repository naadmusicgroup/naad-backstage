<script setup lang="ts">
import { VisAxis, VisScatter, VisXYContainer } from "@unovis/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  formatAnalyticsCompact,
  formatAnalyticsMoney,
  numeric,
} from "~~/app/utils/analytics-charts"

export interface AnalyticsDiagnosticScatterPoint {
  id: string
  label: string
  x: string | number
  y: string | number
  value?: string | number | null
  meta?: string | null
  tone?: "positive" | "negative" | "warning" | "info" | "neutral"
}

interface ScatterDatum extends AnalyticsDiagnosticScatterPoint {
  x: number
  y: number
  value: number
  color: string
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
  points: AnalyticsDiagnosticScatterPoint[]
  xKind?: "money" | "count" | "percent" | "rpm"
  yKind?: "money" | "count" | "percent" | "rpm"
  emptyTitle?: string
  expandLabel: string
  scopeLabel?: string
}>(), {
  xKind: "count",
  yKind: "rpm",
  emptyTitle: "No scatter signal",
  scopeLabel: "",
})

const emit = defineEmits<{
  expand: []
  select: [point: AnalyticsDiagnosticScatterPoint]
}>()

const chartElement = ref<HTMLElement | null>(null)
const chartPalette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
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

function pointColor(point: Pick<AnalyticsDiagnosticScatterPoint, "tone">, index: number) {
  if (point.tone === "negative") {
    return "var(--destructive)"
  }

  if (point.tone === "warning") {
    return "var(--priority)"
  }

  if (point.tone === "positive") {
    return "var(--status-success)"
  }

  if (point.tone === "info") {
    return "var(--chart-2)"
  }

  return chartPalette[index % chartPalette.length]
}

const chartPoints = computed<ScatterDatum[]>(() => props.points
  .map((point, index) => ({
    ...point,
    x: Math.max(0, numeric(point.x)),
    y: Math.max(0, numeric(point.y)),
    value: Math.max(0, numeric(point.value)),
    color: pointColor(point, index),
  }))
  .filter((point) => point.x > 0 || point.y > 0 || point.value > 0)
  .slice(0, 18))
const chartRenderKey = computed(() => [
  props.xKind,
  props.yKind,
  props.scopeLabel,
  chartPoints.value.length,
  ...chartPoints.value.map((point) => `${point.id}:${point.x}:${point.y}:${point.value}:${point.label}`),
].join("|"))
const emptyDescription = computed(() => (
  props.scopeLabel ? `No matching scatter points inside ${props.scopeLabel}.` : ""
))

const xDomain = computed<[number, number]>(() => {
  const maxValue = chartPoints.value.reduce((max, point) => Math.max(max, point.x), 0)
  return [0, maxValue > 0 ? maxValue * 1.16 : 1]
})
const yDomain = computed<[number, number]>(() => {
  const maxValue = chartPoints.value.reduce((max, point) => Math.max(max, point.y), 0)
  return [0, maxValue > 0 ? maxValue * 1.22 : 1]
})

function chartX(point: ScatterDatum) {
  return point.x
}

function chartY(point: ScatterDatum) {
  return point.y
}

function chartColor(point: ScatterDatum) {
  return point.color
}

function formatByKind(value: string | number | null | undefined, kind: "money" | "count" | "percent" | "rpm") {
  const amount = numeric(value)

  if (kind === "money") {
    return formatAnalyticsMoney(amount)
  }

  if (kind === "percent") {
    return `${amount.toFixed(1)}%`
  }

  if (kind === "rpm") {
    return `$${amount.toFixed(2)} RPM`
  }

  return formatAnalyticsCompact(amount)
}

function formatAxis(kind: "money" | "count" | "percent" | "rpm") {
  return (value: number | Date) => {
    const amount = Number(value ?? 0)

    if (kind === "money") {
      return `$${formatAnalyticsCompact(amount)}`
    }

    if (kind === "percent") {
      return `${amount.toFixed(0)}%`
    }

    if (kind === "rpm") {
      return `$${amount.toFixed(1)}`
    }

    return formatAnalyticsCompact(amount)
  }
}

function selectPoint(point: AnalyticsDiagnosticScatterPoint) {
  emit("select", point)
}

function nearestPoint(event: MouseEvent) {
  if (!chartElement.value || !chartPoints.value.length) {
    return null
  }

  const rect = chartElement.value.getBoundingClientRect()
  const xPercent = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
  const yPercent = Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1)
  const targetX = xDomain.value[0] + xPercent * (xDomain.value[1] - xDomain.value[0])
  const targetY = yDomain.value[1] - yPercent * (yDomain.value[1] - yDomain.value[0])

  const nearest = chartPoints.value.reduce<ScatterDatum | null>((best, point) => {
    const bestDistance = best
      ? Math.hypot((best.x - targetX) / xDomain.value[1], (best.y - targetY) / yDomain.value[1])
      : Infinity
    const pointDistance = Math.hypot((point.x - targetX) / xDomain.value[1], (point.y - targetY) / yDomain.value[1])
    return pointDistance < bestDistance ? point : best
  }, null)

  return nearest
}

function updatePremiumTooltipPosition(event: MouseEvent | FocusEvent) {
  const target = event.currentTarget instanceof Element
    ? event.currentTarget
    : event.target instanceof Element
      ? event.target
      : null
  const card = target?.closest(".diagnostic-scatter-card")

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

function showPointTooltip(point: ScatterDatum, event: MouseEvent | FocusEvent) {
  premiumTooltip.title = point.label
  premiumTooltip.value = point.value > 0 ? formatByKind(point.value, "money") : formatByKind(point.x, props.xKind)
  premiumTooltip.detail = `${formatByKind(point.x, props.xKind)} x-axis / ${formatByKind(point.y, props.yKind)} y-axis${point.meta ? ` / ${point.meta}` : props.scopeLabel ? ` / ${props.scopeLabel}` : ""}`
  premiumTooltip.accent = point.color
  premiumTooltip.open = true
  updatePremiumTooltipPosition(event)
}

function handleChartPointerMove(event: MouseEvent) {
  const nearest = nearestPoint(event)

  if (nearest) {
    showPointTooltip(nearest, event)
  }
}

function handleChartClick(event: MouseEvent) {
  const nearest = nearestPoint(event)

  if (nearest) {
    selectPoint(nearest)
  }
}

function hidePremiumTooltip() {
  premiumTooltip.open = false
}
</script>

<template>
  <Card class="diagnostic-scatter-card" @mouseleave="hidePremiumTooltip">
    <CardHeader class="diagnostic-scatter-header">
      <div class="diagnostic-scatter-title-block">
        <Badge variant="secondary" class="w-fit">
          {{ badge }}
        </Badge>
        <CardTitle>{{ title }}</CardTitle>
        <CardDescription>{{ description }}</CardDescription>
      </div>

      <CardAction class="diagnostic-scatter-actions">
        <slot name="actions" />
        <AnalyticsExpandButton :label="expandLabel" @expand="emit('expand')" />
      </CardAction>
    </CardHeader>

    <CardContent class="diagnostic-scatter-content">
      <div
        ref="chartElement"
        class="diagnostic-scatter-frame"
        @click="handleChartClick"
        @mousemove="handleChartPointerMove"
        @mouseleave="hidePremiumTooltip"
      >
        <AppEmptyState
          v-if="!chartPoints.length"
          compact
          icon="chart"
          :title="emptyTitle"
          :description="emptyDescription"
          class="diagnostic-scatter-empty"
        />
        <ClientOnly v-else>
          <VisXYContainer
            :key="chartRenderKey"
            :data="chartPoints"
            :height="288"
            :margin="{ top: 18, right: 20, bottom: 28, left: 34 }"
            :padding="{ top: 6, right: 10, bottom: 0, left: 4 }"
            :x-domain="xDomain"
            :y-domain="yDomain"
            aria-label="Diagnostic scatter chart"
          >
            <VisScatter
              :x="chartX"
              :y="chartY"
              :color="chartColor"
              stroke-color="var(--card)"
              :stroke-width="2"
              :size="10"
              cursor="pointer"
            />
            <VisAxis
              type="x"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :num-ticks="4"
              :tick-format="formatAxis(xKind)"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="10"
            />
            <VisAxis
              type="y"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :num-ticks="4"
              :tick-format="formatAxis(yKind)"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="10"
            />
          </VisXYContainer>

          <template #fallback>
            <div class="diagnostic-scatter-empty" />
          </template>
        </ClientOnly>
      </div>
    </CardContent>

    <CardFooter v-if="chartPoints.length" class="diagnostic-scatter-list">
      <Button
        v-for="point in chartPoints.slice(0, 5)"
        :key="point.id"
        type="button"
        variant="ghost"
        size="sm"
        class="diagnostic-scatter-row h-auto px-0 py-0"
        :style="{ '--diagnostic-color': point.color }"
        @mouseenter="showPointTooltip(point, $event)"
        @mousemove="updatePremiumTooltipPosition"
        @focus="showPointTooltip(point, $event)"
        @mouseleave="hidePremiumTooltip"
        @blur="hidePremiumTooltip"
        @click="selectPoint(point)"
      >
        <span class="diagnostic-scatter-dot" aria-hidden="true" />
        <span class="diagnostic-scatter-copy">
          <strong>{{ point.label }}</strong>
          <small>{{ point.meta || "Scatter point" }}</small>
        </span>
        <span class="diagnostic-scatter-value">
          <strong>{{ formatByKind(point.x, xKind) }}</strong>
          <small>{{ formatByKind(point.y, yKind) }}</small>
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
.diagnostic-scatter-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.diagnostic-scatter-header {
  gap: 8px;
  padding-bottom: 10px;
}

.diagnostic-scatter-title-block {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.diagnostic-scatter-title-block :deep([data-slot="card-title"]) {
  font-size: 16px;
  font-weight: 740;
  letter-spacing: 0;
  line-height: 1.2;
}

.diagnostic-scatter-title-block :deep([data-slot="card-description"]) {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.diagnostic-scatter-actions {
  display: inline-flex;
  gap: 7px;
  align-items: center;
}

.diagnostic-scatter-frame {
  min-height: 288px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 64%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--foreground) 2%, transparent), transparent),
    color-mix(in srgb, var(--card) 84%, var(--background) 16%);
  cursor: pointer;
}

.diagnostic-scatter-empty {
  min-height: 288px;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.diagnostic-scatter-frame :deep(.unovis-xy-container) {
  min-height: 288px;
}

.diagnostic-scatter-frame :deep(svg) {
  overflow: visible;
}

.diagnostic-scatter-frame :deep(.vis-axis .tick line),
.diagnostic-scatter-frame :deep(.vis-axis .domain) {
  stroke: transparent;
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

.diagnostic-scatter-list {
  display: grid;
  gap: 7px;
  padding-top: 0;
}

.diagnostic-scatter-row {
  display: grid;
  width: 100%;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  color: inherit;
}

.diagnostic-scatter-row:hover,
.diagnostic-scatter-row:focus-visible {
  background: color-mix(in srgb, var(--diagnostic-color) 7%, transparent);
}

.diagnostic-scatter-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--diagnostic-color);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--diagnostic-color) 14%, transparent);
}

.diagnostic-scatter-copy,
.diagnostic-scatter-value {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.diagnostic-scatter-copy strong,
.diagnostic-scatter-copy small,
.diagnostic-scatter-value strong,
.diagnostic-scatter-value small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnostic-scatter-copy strong,
.diagnostic-scatter-value strong {
  color: var(--foreground);
  font-size: 12px;
  font-weight: 720;
  line-height: 1.2;
}

.diagnostic-scatter-value {
  text-align: right;
}

.diagnostic-scatter-value strong {
  font-family: var(--font-mono);
}

.diagnostic-scatter-copy small,
.diagnostic-scatter-value small {
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 680;
  letter-spacing: 0.035em;
  text-transform: uppercase;
}

:global(.dark) .diagnostic-scatter-frame {
  border-color: color-mix(in srgb, #d7d7d2 5%, transparent);
  background: color-mix(in srgb, #0a0a0a 48%, var(--card) 52%);
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
  .diagnostic-scatter-header {
    display: grid;
  }

  .diagnostic-scatter-actions {
    justify-content: flex-start;
  }
}
</style>
