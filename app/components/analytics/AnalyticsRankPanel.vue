<script setup lang="ts">
import { VisAxis, VisGroupedBar, VisXYContainer } from "@unovis/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  escapeAnalyticsTooltipHtml,
  formatAnalyticsCompact,
  formatAnalyticsMoney,
  numeric,
} from "~~/app/utils/analytics-charts"

interface AnalyticsRankRow {
  id?: string
  label: string
  meta?: string
  value: string | number
  share?: number
  count?: number
  countryCode?: string | null
  imageUrl?: string | null
  coverArtUrl?: string | null
  coverThumbUrl?: string | null
  imageAlt?: string | null
}

interface RankDatum extends AnalyticsRankRow {
  id: string
  value: number
  share: number
  color: string
  index: number
}

interface RankChartDatum extends RankDatum {
  chartIndex: number
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
  eyebrow?: string
  summary?: string
  rows: AnalyticsRankRow[]
  valueKind?: "money" | "count"
  enableDataView?: boolean
  premiumTooltips?: boolean
  emptyText?: string
}>(), {
  valueKind: "money",
  enableDataView: false,
  premiumTooltips: false,
  emptyText: "No ranked data matches the current filters.",
})

const emit = defineEmits<{
  select: [row: RankDatum]
  "detail-open-change": [open: boolean]
}>()

const viewMode = ref<"chart" | "table">("chart")
const detailOpen = ref(false)
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
const premiumTooltipsEnabled = computed(() => props.premiumTooltips)

watch(detailOpen, (open) => {
  emit("detail-open-change", open)
})

onBeforeUnmount(() => {
  emit("detail-open-change", false)
})

function isAnalyticsOverlayTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(".analytics-toolbar, .native-select-content"))
}

function preventAnalyticsOverlayDismiss(event: CustomEvent<{ originalEvent?: Event }>) {
  if (isAnalyticsOverlayTarget(event.detail?.originalEvent?.target ?? event.target)) {
    event.preventDefault()
  }
}

function formatValue(value: string | number) {
  const numberValue = numeric(value)
  return props.valueKind === "count" ? formatAnalyticsCompact(numberValue) : formatAnalyticsMoney(numberValue)
}

const failedImageKeys = ref(new Set<string>())

function rankImageUrl(row: Pick<AnalyticsRankRow, "imageUrl" | "coverThumbUrl" | "coverArtUrl">) {
  return row.imageUrl || row.coverThumbUrl || row.coverArtUrl || null
}

function rankImageKey(row: Pick<AnalyticsRankRow, "id" | "label" | "imageUrl" | "coverThumbUrl" | "coverArtUrl">) {
  return `${row.id || row.label}:${rankImageUrl(row) || ""}`
}

function hasRankImage(row: Pick<AnalyticsRankRow, "id" | "label" | "imageUrl" | "coverThumbUrl" | "coverArtUrl">) {
  const imageUrl = rankImageUrl(row)
  return Boolean(imageUrl && !failedImageKeys.value.has(rankImageKey(row)))
}

function markRankImageFailed(row: Pick<AnalyticsRankRow, "id" | "label" | "imageUrl" | "coverThumbUrl" | "coverArtUrl">) {
  const next = new Set(failedImageKeys.value)
  next.add(rankImageKey(row))
  failedImageKeys.value = next
}

function richTextSafeLabel(value: string) {
  return value.replace(/[{}|]/g, " ").trim()
}

function shortRankLabel(value: string, maxLength = 14) {
  const label = richTextSafeLabel(value)

  if (label.length <= maxLength) {
    return label
  }

  return `${label.slice(0, Math.max(0, maxLength - 3))}...`

}

function rankFallbackInitial(value: string) {
  return richTextSafeLabel(value).charAt(0).toUpperCase() || "R"
}

const allRankedRows = computed<RankDatum[]>(() => {
  const total = props.rows.reduce((sum, row) => sum + Math.max(0, numeric(row.value)), 0) || 1

  return props.rows
    .map((row, index) => {
      const value = Math.max(0, numeric(row.value))

      return {
        ...row,
        id: row.id || row.label,
        value,
        share: typeof row.share === "number" ? row.share : (value / total) * 100,
        color: chartPalette[index % chartPalette.length],
        index,
      }
    })
    .sort((left, right) => numeric(right.value) - numeric(left.value))
    .map((row, index) => ({
      ...row,
      color: chartPalette[index % chartPalette.length],
      index,
    }))
})

const rankedRows = computed(() => allRankedRows.value.slice(0, 8))
const compactDataRows = computed(() => allRankedRows.value.slice(0, 5))
const chartRows = computed<RankChartDatum[]>(() => [...rankedRows.value].reverse().map((row, chartIndex) => ({
  ...row,
  chartIndex,
})))
const rankChartRenderKey = computed(() => [
  props.valueKind,
  rankedRows.value.length,
  ...rankedRows.value.map((row) => `${row.id}:${row.value}:${row.count ?? ""}:${row.label}`),
].join("|"))
const hasArtworkRows = computed(() => rankedRows.value.some((row) => Boolean(rankImageUrl(row))))
const rankChartHeight = computed(() => hasArtworkRows.value ? 332 : 292)
const rankTotalValue = computed(() => allRankedRows.value.reduce((sum, row) => sum + row.value, 0))
const rankTotalCount = computed(() => allRankedRows.value.reduce((sum, row) => sum + Number(row.count ?? 0), 0))
const topRankedRow = computed(() => allRankedRows.value[0] ?? null)

const rankChartXDomain = computed<[number, number]>(() => {
  const maxValue = chartRows.value.reduce((max, row) => Math.max(max, row.value), 0)
  return [0, maxValue > 0 ? maxValue * 1.14 : 1]
})
const rankChartYDomain = computed<[number, number]>(() => [
  0,
  Math.max(chartRows.value.length - 1, 1),
])
const rankChartTickValues = computed(() => chartRows.value.map((row) => row.chartIndex))

function rankChartX(row: RankChartDatum) {
  return row.chartIndex
}

function rankChartY(row: RankChartDatum) {
  return row.value
}

function rankChartColor(row: RankChartDatum) {
  return row.color
}

function formatRankXAxis(value: number | Date) {
  const amount = Number(value ?? 0)
  return props.valueKind === "count" ? formatAnalyticsCompact(amount) : `$${formatAnalyticsCompact(amount)}`
}

function formatRankYAxis(value: number | Date) {
  const row = chartRows.value.find((entry) => entry.chartIndex === Math.round(Number(value)))
  return row ? shortRankLabel(row.label, hasArtworkRows.value ? 16 : 13) : ""
}

function rankTooltipText(row: RankDatum) {
  return `${escapeAnalyticsTooltipHtml(row.label)} / ${formatValue(row.value)} / ${escapeAnalyticsTooltipHtml(row.meta || `${row.share.toFixed(1)}% share`)}`
}

function updatePremiumTooltipPosition(event: MouseEvent | FocusEvent) {
  const target = event.currentTarget instanceof Element
    ? event.currentTarget
    : event.target instanceof Element
      ? event.target
      : null
  const card = target?.closest(".rank-panel")

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

function showRankTooltip(row: RankDatum, event: MouseEvent | FocusEvent) {
  if (!props.premiumTooltips) {
    return
  }

  const countDetail = typeof row.count === "number" ? `${formatAnalyticsCompact(row.count)} streams` : ""

  premiumTooltip.title = row.label
  premiumTooltip.value = formatValue(row.value)
  premiumTooltip.detail = [row.meta || `${row.share.toFixed(1)}% share`, countDetail].filter(Boolean).join(" / ")
  premiumTooltip.accent = row.color
  premiumTooltip.open = true
  updatePremiumTooltipPosition(event)
}

function hidePremiumTooltip() {
  premiumTooltip.open = false
}
</script>

<template>
  <Card
    class="rank-panel analytics-panel"
    :class="{ 'has-premium-tooltips': premiumTooltipsEnabled }"
    @mouseleave="hidePremiumTooltip"
  >
    <CardHeader class="rank-header">
      <div class="rank-title-block">
        <Badge v-if="eyebrow" variant="secondary" class="w-fit">
          {{ eyebrow }}
        </Badge>
        <CardTitle class="text-base">
          {{ title }}
        </CardTitle>
        <CardDescription v-if="summary">
          {{ summary }}
        </CardDescription>
      </div>

      <AnalyticsViewControls
        v-if="enableDataView"
        v-model="viewMode"
        expand-label="Open catalog data detail"
        @expand="detailOpen = true"
      />
    </CardHeader>

    <CardContent class="rank-content">
      <div v-if="!enableDataView || viewMode === 'chart'" class="rank-chart" :class="{ 'has-artwork': hasArtworkRows }">
        <div class="rank-chart-stage" :style="{ '--rank-row-count': chartRows.length }">
          <AppEmptyState
            v-if="!rankedRows.length"
            compact
            icon="chart"
            :title="emptyText"
            class="rank-chart-empty"
          />
          <ClientOnly v-else>
            <VisXYContainer
              :key="rankChartRenderKey"
              :data="chartRows"
              :height="rankChartHeight"
              :margin="{ top: hasArtworkRows ? 10 : 8, right: 28, bottom: 28, left: hasArtworkRows ? 156 : 96 }"
              :padding="{ top: 6, right: 8, bottom: 0, left: 0 }"
              :x-domain="rankChartXDomain"
              :y-domain="rankChartYDomain"
              aria-label="Ranked analytics bar chart"
            >
              <VisGroupedBar
                :x="rankChartX"
                :y="rankChartY"
                :color="rankChartColor"
                orientation="horizontal"
                :rounded-corners="7"
                :group-padding="0.28"
                :group-max-width="hasArtworkRows ? 19 : 14"
                cursor="pointer"
              />
              <VisAxis
                type="x"
                :tick-line="false"
                :domain-line="false"
                :grid-line="false"
                :num-ticks="4"
                :tick-format="formatRankXAxis"
                tick-text-color="var(--muted-foreground)"
                :tick-text-font-size="11"
              />
              <VisAxis
                type="y"
                :tick-line="false"
                :domain-line="false"
                :grid-line="false"
                :tick-values="rankChartTickValues"
                :tick-format="formatRankYAxis"
                tick-text-color="var(--muted-foreground)"
                :tick-text-font-size="11"
              />
            </VisXYContainer>
            <div class="rank-chart-click-layer" aria-hidden="true">
              <button
                v-for="row in rankedRows"
                :key="`rank-chart-hit-${row.id}`"
                type="button"
                :title="premiumTooltipsEnabled ? undefined : rankTooltipText(row)"
                :aria-label="rankTooltipText(row)"
                @mouseenter="showRankTooltip(row, $event)"
                @mousemove="updatePremiumTooltipPosition"
                @focus="showRankTooltip(row, $event)"
                @mouseleave="hidePremiumTooltip"
                @blur="hidePremiumTooltip"
                @click="emit('select', row)"
              />
            </div>
            <template #fallback>
              <div class="rank-chart-empty" />
            </template>
          </ClientOnly>

          <div v-if="hasArtworkRows && rankedRows.length" class="rank-chart-artwork-layer" aria-hidden="true">
            <span v-for="row in rankedRows" :key="`axis-cover-${row.id}`" class="rank-chart-cover-frame">
              <img
                v-if="hasRankImage(row)"
                :src="rankImageUrl(row) || ''"
                alt=""
                class="rank-chart-axis-cover"
                loading="lazy"
                decoding="async"
                @error="markRankImageFailed(row)"
              >
              <span v-else class="rank-chart-axis-cover is-fallback">
                {{ rankFallbackInitial(row.label) }}
              </span>
            </span>
          </div>
        </div>
      </div>

      <div v-else class="rank-data-view">
        <table>
          <thead>
            <tr>
              <th>Release</th>
              <th>{{ valueKind === "count" ? "Count" : "Revenue" }}</th>
              <th>Streams</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in compactDataRows" :key="row.id">
              <td>
                <span class="rank-data-release">
                  <img
                    v-if="hasRankImage(row)"
                    :src="rankImageUrl(row) || ''"
                    :alt="row.imageAlt || `${row.label} cover art`"
                    loading="lazy"
                    decoding="async"
                    @error="markRankImageFailed(row)"
                  >
                  <span v-else class="rank-data-fallback">{{ rankFallbackInitial(row.label) }}</span>
                  <strong>{{ row.label }}</strong>
                </span>
              </td>
              <td>
                <strong>{{ formatValue(row.value) }}</strong>
              </td>
              <td>{{ typeof row.count === "number" ? formatAnalyticsCompact(row.count) : "No data" }}</td>
              <td>{{ row.share.toFixed(1) }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>

    <CardFooter v-if="rankedRows.length && (!enableDataView || viewMode === 'chart')" class="rank-list" :class="{ 'has-artwork': hasArtworkRows }">
      <Button
        v-for="row in rankedRows.slice(0, 5)"
        :key="row.id"
        type="button"
        variant="ghost"
        size="sm"
        class="rank-row h-auto px-0 py-0"
        :style="{ '--rank-color': row.color }"
        @mouseenter="showRankTooltip(row, $event)"
        @mousemove="updatePremiumTooltipPosition"
        @focus="showRankTooltip(row, $event)"
        @mouseleave="hidePremiumTooltip"
        @blur="hidePremiumTooltip"
        @click="emit('select', row)"
      >
        <img
          v-if="hasRankImage(row)"
          :src="rankImageUrl(row) || ''"
          :alt="row.imageAlt || `${row.label} cover art`"
          class="rank-cover"
          loading="lazy"
          decoding="async"
          @error="markRankImageFailed(row)"
        >
        <span v-else class="rank-dot" aria-hidden="true" />
        <span class="rank-copy">
          <strong>
            <CountryFlag
              v-if="row.countryCode"
              :code="row.countryCode"
              :label="row.label"
              show-label
              class="rank-country"
            />
            <span v-else>{{ row.label }}</span>
          </strong>
          <small>{{ row.meta || `${row.share.toFixed(1)}% share` }}</small>
        </span>
        <span class="rank-value">
          <strong>{{ formatValue(row.value) }}</strong>
          <small v-if="typeof row.count === 'number'">{{ formatAnalyticsCompact(row.count) }}</small>
        </span>
      </Button>
    </CardFooter>

    <div
      v-if="premiumTooltipsEnabled && premiumTooltip.open"
      class="rank-premium-tooltip"
      :style="premiumTooltipStyle"
      role="tooltip"
    >
      <span class="rank-premium-tooltip-kicker">
        <i aria-hidden="true" />
        {{ eyebrow || "Rank" }}
      </span>
      <strong>{{ premiumTooltip.title }}</strong>
      <em>{{ premiumTooltip.value }}</em>
      <small v-if="premiumTooltip.detail">{{ premiumTooltip.detail }}</small>
    </div>

    <Sheet v-model:open="detailOpen">
      <SheetContent
        side="right"
        class="analytics-data-sheet rank-data-sheet"
        @focus-outside="preventAnalyticsOverlayDismiss"
        @interact-outside="preventAnalyticsOverlayDismiss"
        @pointer-down-outside="preventAnalyticsOverlayDismiss"
      >
        <SheetHeader class="analytics-data-sheet-header">
          <div class="analytics-data-sheet-kicker">
            <Badge v-if="eyebrow" variant="secondary" class="w-fit">
              {{ eyebrow }}
            </Badge>
            <span>{{ allRankedRows.length }} rows</span>
          </div>
          <SheetTitle class="analytics-data-sheet-title">
            {{ title }} detail
          </SheetTitle>
          <SheetDescription class="analytics-data-sheet-description">
            Ranked catalog performance for the current analytics filters.
          </SheetDescription>
        </SheetHeader>

        <div class="analytics-data-sheet-summary">
          <span>
            <small>{{ valueKind === "count" ? "Count" : "Revenue" }}</small>
            <strong>{{ formatValue(rankTotalValue) }}</strong>
          </span>
          <span>
            <small>Streams</small>
            <strong>{{ formatAnalyticsCompact(rankTotalCount) }}</strong>
          </span>
          <span>
            <small>Items</small>
            <strong>{{ allRankedRows.length }}</strong>
          </span>
          <span>
            <small>Leader</small>
            <strong>{{ topRankedRow?.label || "No data" }}</strong>
          </span>
        </div>

        <div class="analytics-data-sheet-table rank-data-sheet-table">
          <table>
            <thead>
              <tr>
                <th>Release</th>
                <th>{{ valueKind === "count" ? "Count" : "Revenue" }}</th>
                <th>Streams</th>
                <th>Share</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in allRankedRows" :key="`${row.id}:detail`">
                <td>
                  <span class="rank-data-release">
                    <img
                      v-if="hasRankImage(row)"
                      :src="rankImageUrl(row) || ''"
                      :alt="row.imageAlt || `${row.label} cover art`"
                      loading="lazy"
                      decoding="async"
                      @error="markRankImageFailed(row)"
                    >
                    <span v-else class="rank-data-fallback">{{ rankFallbackInitial(row.label) }}</span>
                    <strong>{{ row.label }}</strong>
                  </span>
                </td>
                <td>
                  <strong>{{ formatValue(row.value) }}</strong>
                </td>
                <td>{{ typeof row.count === "number" ? formatAnalyticsCompact(row.count) : "No data" }}</td>
                <td>{{ row.share.toFixed(1) }}%</td>
                <td>{{ row.meta || "No extra detail" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  </Card>
</template>

<style scoped>
.rank-panel {
  position: relative;
  height: 100%;
  overflow: hidden;
}

.rank-header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 10px;
}

.rank-title-block {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.rank-content {
  padding-bottom: 0;
}

.rank-chart,
.rank-data-view {
  min-height: 292px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 38%, transparent);
  padding: 10px;
}

.rank-data-view {
  overflow-x: auto;
  padding: 0;
}

.rank-data-view table,
.analytics-data-sheet-table table {
  width: 100%;
  min-width: 620px;
  border-collapse: separate;
  border-spacing: 0;
}

.rank-data-view th,
.rank-data-view td,
.analytics-data-sheet-table th,
.analytics-data-sheet-table td {
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 62%, transparent);
  padding: 11px 12px;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.25;
  text-align: right;
  white-space: nowrap;
}

.rank-data-view th:first-child,
.rank-data-view td:first-child,
.analytics-data-sheet-table th:first-child,
.analytics-data-sheet-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 238px;
  min-width: 238px;
  max-width: 238px;
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
  box-shadow: 1px 0 0 color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
  text-align: left;
}

.rank-data-view th:first-child,
.analytics-data-sheet-table th:first-child {
  z-index: 4;
}

.rank-data-view th,
.analytics-data-sheet-table th {
  background: color-mix(in srgb, var(--card) 90%, transparent);
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 720;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.rank-data-view td strong,
.analytics-data-sheet-table td strong {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 620;
  letter-spacing: 0;
  line-height: 1.2;
}

.rank-data-release {
  display: inline-flex;
  max-width: 260px;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.rank-data-release img,
.rank-data-fallback {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 58%, transparent);
  object-fit: cover;
}

.rank-data-fallback {
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 680;
}

.rank-data-release strong {
  min-width: 0;
  overflow: hidden;
  color: var(--foreground);
  font-family: var(--font-app-sans) !important;
  font-size: 13px !important;
  font-weight: 670;
  letter-spacing: 0;
  line-height: 1.22;
  text-overflow: ellipsis;
}

.rank-chart.has-artwork {
  min-height: 332px;
  padding: 12px 12px 12px 8px;
}

.rank-chart-stage {
  position: relative;
  min-width: 0;
}

.rank-chart-stage :deep(.unovis-xy-container) {
  min-height: 292px;
}

.rank-chart-stage :deep(svg) {
  overflow: visible;
}

.rank-chart-stage :deep(.vis-axis .tick line),
.rank-chart-stage :deep(.vis-axis .domain),
.rank-chart-stage :deep(.vis-axis-grid-line) {
  display: none;
}

.rank-chart-stage :deep(.vis-grouped-bar rect),
.rank-chart-stage :deep(.vis-grouped-bar path) {
  filter: drop-shadow(0 8px 12px rgb(0 0 0 / 12%));
}

.rank-chart-empty {
  display: grid;
  min-height: 272px;
  place-items: center;
}

.rank-chart-click-layer {
  position: absolute;
  z-index: 3;
  top: 10px;
  right: 28px;
  bottom: 28px;
  left: 156px;
  display: grid;
  grid-template-rows: repeat(var(--rank-row-count, 1), minmax(0, 1fr));
  pointer-events: none;
}

.rank-chart:not(.has-artwork) .rank-chart-click-layer {
  left: 96px;
}

.rank-chart-click-layer button {
  min-width: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}

.rank-chart-click-layer button:hover {
  background: color-mix(in srgb, var(--foreground) 4%, transparent);
}

.rank-chart-artwork-layer {
  position: absolute;
  z-index: 2;
  top: 10px;
  bottom: 26px;
  left: 21px;
  display: grid;
  width: 30px;
  grid-template-rows: repeat(var(--rank-row-count, 1), minmax(0, 1fr));
  pointer-events: none;
}

.rank-chart-cover-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}

.rank-chart-axis-cover {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 8px;
  object-fit: cover;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 58%, transparent);
  box-shadow: 0 8px 16px -14px rgba(0, 0, 0, 0.58);
}

.rank-chart-axis-cover.is-fallback {
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
}

.rank-list {
  display: grid;
  gap: 10px;
  padding-top: 16px;
}

.rank-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.rank-panel.has-premium-tooltips .rank-row:hover,
.rank-panel.has-premium-tooltips .rank-row:focus-visible {
  background: color-mix(in srgb, var(--rank-color) 7%, transparent);
}

.rank-premium-tooltip {
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

.rank-premium-tooltip::after {
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

.rank-premium-tooltip-kicker {
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

.rank-premium-tooltip-kicker i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--tooltip-accent);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--tooltip-accent) 16%, transparent);
}

.rank-premium-tooltip strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 820;
  line-height: 1.22;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-premium-tooltip em {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 15px;
  font-style: normal;
  font-weight: 820;
  line-height: 1.1;
}

.rank-premium-tooltip small {
  display: block;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, var(--muted-foreground) 92%, var(--foreground) 8%);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.35;
}

:global(.dark) .rank-premium-tooltip {
  background:
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--tooltip-accent) 16%, transparent), transparent 44%),
    linear-gradient(180deg, color-mix(in srgb, #15130f 84%, var(--popover) 16%), color-mix(in srgb, #080806 78%, var(--popover) 22%));
  box-shadow:
    0 22px 44px -24px rgb(0 0 0 / 84%),
    inset 0 1px 0 rgb(255 255 255 / 7%);
}

:global(.dark) .rank-premium-tooltip::after {
  background: color-mix(in srgb, #080806 78%, var(--popover) 22%);
}

.rank-list.has-artwork {
  gap: 12px;
  padding-top: 14px;
}

.rank-list.has-artwork .rank-row {
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 12px;
}

.rank-value {
  justify-self: end;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.rank-dot {
  width: 9px;
  height: 9px;
  justify-self: center;
  border-radius: 999px;
  background: var(--rank-color);
  box-shadow: none;
}

.rank-cover {
  width: 34px;
  height: 34px;
  justify-self: start;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent);
  border-radius: 9px;
  object-fit: cover;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 58%, transparent);
  box-shadow: 0 10px 20px -16px rgba(0, 0, 0, 0.56);
}

.rank-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.rank-copy strong {
  display: flex;
  align-items: center;
  min-width: 0;
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-country {
  max-width: 100%;
}

.rank-copy small,
.rank-value small {
  display: block;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-value strong {
  display: block;
  color: var(--foreground);
}

:global(.rank-data-sheet) {
  width: min(680px, calc(100vw - 18px));
  max-width: min(680px, calc(100vw - 18px)) !important;
  height: 100svh;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, var(--foreground) 6%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--background) 4%), color-mix(in srgb, var(--background) 72%, var(--card) 28%));
  box-shadow: -24px 0 60px -42px rgb(0 0 0 / 68%);
  overflow: hidden;
  gap: 0;
  padding: 0;
}

:global(.analytics-data-sheet > button[aria-label="Close"]) {
  top: 18px;
  right: 18px;
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--card) 82%, transparent);
  color: var(--muted-foreground);
  opacity: 1;
}

.analytics-data-sheet-header {
  gap: 8px;
  padding: 24px 64px 16px 28px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 1%), color-mix(in srgb, var(--card) 88%, var(--background) 12%));
}

.analytics-data-sheet-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.analytics-data-sheet-kicker > span {
  overflow: hidden;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-data-sheet-title {
  color: var(--foreground);
  font-size: 19px;
  font-weight: 760;
  line-height: 1.15;
}

.analytics-data-sheet-description {
  max-width: 500px;
  color: color-mix(in srgb, var(--muted-foreground) 92%, var(--foreground) 8%);
  font-size: 13px;
  line-height: 1.45;
}

.analytics-data-sheet-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 16px 18px 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-border, var(--border)) 48%, transparent);
}

.analytics-data-sheet-summary span {
  display: grid;
  gap: 5px;
  min-width: 0;
  background: color-mix(in srgb, var(--card) 92%, var(--background) 8%);
  padding: 12px 14px;
}

.analytics-data-sheet-summary small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.08em;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.analytics-data-sheet-summary strong {
  overflow: hidden;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-data-sheet-table {
  min-height: 0;
  flex: 1;
  margin: 16px 18px 18px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 82%, var(--background) 18%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 34%, transparent);
}

.analytics-data-sheet-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: color-mix(in srgb, var(--card) 96%, var(--background) 4%);
  backdrop-filter: blur(12px);
}

.analytics-data-sheet-table th,
.analytics-data-sheet-table td {
  height: 54px;
  padding: 9px 14px;
  font-size: 12px;
  line-height: 1.25;
}

.analytics-data-sheet-table th {
  height: 46px;
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
  font-size: 10px;
  font-weight: 720;
  letter-spacing: 0.055em;
}

.analytics-data-sheet-table td {
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
}

.analytics-data-sheet-table tbody tr:hover td {
  background-color: color-mix(in srgb, var(--foreground) 3%, transparent);
}

.analytics-data-sheet-table tbody tr:hover td:first-child {
  background: color-mix(in srgb, var(--card) 94%, var(--foreground) 6%);
}

.rank-data-sheet-table table {
  min-width: 780px;
}

.analytics-data-sheet-table::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.analytics-data-sheet-table::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted-foreground) 36%, transparent);
  background-clip: padding-box;
}

:global(.dark .rank-data-sheet) {
  border-color: color-mix(in srgb, #d7d7d2 5%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, #0a0a0a 58%, var(--card) 42%), color-mix(in srgb, #0a0a0a 74%, var(--card) 26%));
  box-shadow: -28px 0 70px -44px rgb(0 0 0 / 88%);
}

:global(.dark) .analytics-data-sheet-header {
  border-bottom-color: color-mix(in srgb, #d7d7d2 5%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, #0a0a0a 48%, var(--card) 52%), color-mix(in srgb, #0a0a0a 66%, var(--card) 34%));
}

:global(.dark) .analytics-data-sheet-summary {
  border-color: color-mix(in srgb, #d7d7d2 5%, transparent);
  background: color-mix(in srgb, #d7d7d2 3%, transparent);
}

:global(.dark) .analytics-data-sheet-summary span,
:global(.dark) .analytics-data-sheet-table {
  background: color-mix(in srgb, #0a0a0a 48%, var(--card) 52%);
}

:global(.dark) .analytics-data-sheet-table th {
  background: color-mix(in srgb, #0a0a0a 50%, var(--card) 50%);
}

:global(.dark) .analytics-data-sheet-table tbody tr:hover td {
  background-color: color-mix(in srgb, #d7d7d2 4%, transparent);
}

:global(.dark) .rank-data-view th:first-child,
:global(.dark) .rank-data-view td:first-child,
:global(.dark) .analytics-data-sheet-table th:first-child,
:global(.dark) .analytics-data-sheet-table td:first-child {
  background: color-mix(in srgb, #0a0a0a 54%, var(--card) 46%);
}

:global(.dark) .analytics-data-sheet-table tbody tr:hover td:first-child {
  background: color-mix(in srgb, color-mix(in srgb, #0a0a0a 54%, var(--card) 46%) 92%, #d7d7d2 8%);
}

@media (max-width: 640px) {
  .rank-header {
    display: grid;
  }
}
</style>
