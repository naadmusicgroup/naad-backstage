<script setup lang="ts">
import { VisAxis, VisCrosshair, VisLine, VisScatter, VisTooltip, VisXYContainer } from "@unovis/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  analyticsTooltipMedia,
  escapeAnalyticsTooltipHtml,
  formatAnalyticsCompact,
  formatAnalyticsMoney,
  formatAnalyticsShare,
  numeric,
} from "~~/app/utils/analytics-charts"
import { resolveDspChartColor, resolveDspLogo } from "~~/app/utils/dsp-logos"

interface AnalyticsPlatformRow {
  id?: string
  label: string
  logoKey?: string | null
  revenue: string | number
  streams?: number
  share?: number
}

interface AnalyticsPlatformSeriesPoint {
  key?: string
  label: string
  value: string | number
}

interface AnalyticsPlatformSeries {
  key: string
  label: string
  points: AnalyticsPlatformSeriesPoint[]
}

interface AnalyticsPlatformEarningsRow {
  periodMonth: string
  channelId: string | null
  channelName: string
  releaseId: string | null
  releaseTitle: string | null
  revenue: string | number
  streams: number
}

interface PlatformDatum extends AnalyticsPlatformRow {
  id: string
  revenue: number
  streams: number
  share: number
  color: string
}

interface PlatformSeries {
  key: string
  label: string
  color: string
  total: number
  points: Array<{
    key: string
    label: string
    value: number
  }>
}

interface PlatformChartDatum {
  key: string
  label: string
  total: number
  index: number
  values: Record<string, number>
}

interface PlatformMatrixRow {
  id: string
  label: string
  totalRevenue: number
  totalStreams: number
  values: Record<string, {
    revenue: number
    streams: number
  }>
}

const props = withDefaults(defineProps<{
  title: string
  eyebrow?: string
  summary?: string
  rows: AnalyticsPlatformRow[]
  series?: AnalyticsPlatformSeries[]
  earningsRows?: AnalyticsPlatformEarningsRow[]
  enableDataView?: boolean
  emptyText?: string
  chartHeight?: number
}>(), {
  series: () => [],
  earningsRows: () => [],
  enableDataView: false,
  emptyText: "No platform revenue matches the current filters.",
  chartHeight: 318,
})

const emit = defineEmits<{
  "select-platform": [row: PlatformDatum]
  "select-period": [point: { key: string; label: string }]
  "detail-open-change": [open: boolean]
}>()

const chartElement = ref<HTMLElement | null>(null)
const viewMode = ref<"chart" | "table">("chart")
const detailOpen = ref(false)
const chartPalette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

watch(detailOpen, (open) => {
  emit("detail-open-change", open)
})

onBeforeUnmount(() => {
  emit("detail-open-change", false)
})

function platformBrandColor(key: string | null | undefined, label: string | null | undefined, fallback: string) {
  return resolveDspChartColor(key, null) || resolveDspChartColor(label, fallback) || fallback
}

function isAnalyticsOverlayTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(".analytics-toolbar, .native-select-content"))
}

function preventAnalyticsOverlayDismiss(event: CustomEvent<{ originalEvent?: Event }>) {
  if (isAnalyticsOverlayTarget(event.detail?.originalEvent?.target ?? event.target)) {
    event.preventDefault()
  }
}

const sortedRows = computed<PlatformDatum[]>(() => {
  const total = props.rows.reduce((sum, row) => sum + Math.max(0, numeric(row.revenue)), 0) || 1

  return props.rows
    .map((row, index) => {
      const revenue = Math.max(0, numeric(row.revenue))

      return {
        ...row,
        id: row.id || row.label,
        revenue,
        streams: Number(row.streams ?? 0),
        share: typeof row.share === "number" ? row.share : (revenue / total) * 100,
        color: platformBrandColor(row.logoKey, row.label, chartPalette[index % chartPalette.length]),
      }
    })
    .sort((left, right) => right.revenue - left.revenue)
    .map((row, index) => ({
      ...row,
      color: platformBrandColor(row.logoKey, row.label, chartPalette[index % chartPalette.length]),
    }))
})

const chartSeries = computed<PlatformSeries[]>(() => {
  const sourceSeries = props.series.length
    ? props.series
    : sortedRows.value.map((row) => ({
        key: row.id,
        label: row.label,
        points: [{ key: "visible", label: "Visible", value: row.revenue }],
      }))
  const rowOrder = new Map(sortedRows.value.map((row, index) => [row.id || row.label, index]))

  const mappedSeries = sourceSeries.map((entry, index) => {
    const points = entry.points
      .map((point) => ({
        key: point.key || point.label,
        label: point.label,
        value: Math.max(0, numeric(point.value)),
      }))
      .sort((left, right) => left.key.localeCompare(right.key))

    return {
      key: entry.key,
      label: entry.label,
      color: platformBrandColor(entry.key, entry.label, chartPalette[index % chartPalette.length]),
      total: points.reduce((sum, point) => sum + point.value, 0),
      points,
    }
  })

  const hasPositiveSeries = mappedSeries.some((entry) => entry.total > 0)

  return mappedSeries
    .filter((entry) => hasPositiveSeries ? entry.total > 0 : entry.points.length > 0)
    .sort((left, right) => {
      const leftOrder = rowOrder.get(left.key) ?? 999
      const rightOrder = rowOrder.get(right.key) ?? 999
      return leftOrder - rightOrder
    })
    .slice(0, 5)
})

const periodLabels = computed(() => [...new Map(chartSeries.value.flatMap((entry) => entry.points.map((point) => [
  point.key,
  point.label,
]))).entries()]
  .sort((left, right) => left[0].localeCompare(right[0])))

const chartRows = computed<PlatformChartDatum[]>(() => periodLabels.value.map(([key, label], index) => {
  const values = Object.fromEntries(chartSeries.value.map((entry) => [
    entry.key,
    entry.points.find((point) => point.key === key)?.value ?? 0,
  ]))

  return {
    key,
    label,
    index,
    total: Object.values(values).reduce((sum, value) => sum + Number(value ?? 0), 0),
    values,
  }
}))
const platformChartRenderKey = computed(() => [
  chartSeries.value.length,
  chartRows.value.length,
  ...chartSeries.value.map((entry) => `${entry.key}:${entry.total}:${entry.points.map((point) => `${point.key}:${point.value}`).join(",")}`),
  ...sortedRows.value.map((row) => `${row.id}:${row.revenue}:${row.streams}`),
].join("|"))

const topRows = computed(() => sortedRows.value.slice(0, 6))
const topPlatform = computed(() => sortedRows.value[0] ?? null)
const totalRevenue = computed(() => sortedRows.value.reduce((sum, row) => sum + row.revenue, 0))
const matrixPlatformColumns = computed(() => sortedRows.value)
const compactMatrixPlatformColumns = computed(() => matrixPlatformColumns.value.slice(0, 4))
const platformMatrixRows = computed<PlatformMatrixRow[]>(() => {
  const grouped = new Map<string, PlatformMatrixRow>()

  for (const row of props.earningsRows) {
    const releaseKey = row.releaseId || "__none__"
    const platformKey = row.channelId || "__none__"
    const existing = grouped.get(releaseKey) ?? {
      id: releaseKey,
      label: row.releaseTitle || "No linked release",
      totalRevenue: 0,
      totalStreams: 0,
      values: {},
    }
    const revenue = numeric(row.revenue)
    const streams = Number(row.streams ?? 0)
    const cell = existing.values[platformKey] ?? { revenue: 0, streams: 0 }

    cell.revenue += revenue
    cell.streams += streams
    existing.values[platformKey] = cell
    existing.totalRevenue += revenue
    existing.totalStreams += streams
    grouped.set(releaseKey, existing)
  }

  if (!grouped.size) {
    return sortedRows.value.map((row) => ({
      id: row.id,
      label: row.label,
      totalRevenue: row.revenue,
      totalStreams: row.streams,
      values: {
        [row.id]: {
          revenue: row.revenue,
          streams: row.streams,
        },
      },
    }))
  }

  return [...grouped.values()].sort((left, right) => right.totalRevenue - left.totalRevenue)
})
const compactPlatformMatrixRows = computed(() => platformMatrixRows.value.slice(0, 5))
const platformMatrixMaxRevenue = computed(() => Math.max(
  1,
  ...platformMatrixRows.value.flatMap((row) => matrixPlatformColumns.value.map((column) => row.values[column.id]?.revenue ?? 0)),
))
const periodLabel = computed(() => {
  const first = chartRows.value[0]?.label
  const last = chartRows.value.at(-1)?.label

  if (!first || !last) {
    return "No periods"
  }

  return first === last ? first : `${first} to ${last}`
})

const platformChartTickValues = computed(() => {
  const rows = chartRows.value
  const showEveryLabel = rows.length <= 6

  return rows
    .filter((row) => showEveryLabel || row.index === 0 || row.index === rows.length - 1 || row.index % 3 === 0)
    .map((row) => row.index)
})
const platformChartXDomain = computed<[number, number]>(() => [
  0,
  Math.max(chartRows.value.length - 1, 1),
])
const platformChartYDomain = computed<[number, number]>(() => {
  const maxRevenue = chartRows.value.reduce((max, row) => Math.max(max, ...Object.values(row.values).map(Number)), 0)
  return [0, maxRevenue > 0 ? maxRevenue * 1.18 : 1]
})
const platformCrosshairYAccessors = computed(() => chartSeries.value.map((entry) => platformSeriesY(entry.key)))

function platformChartX(row: PlatformChartDatum) {
  return row.index
}

function platformSeriesY(seriesKey: string) {
  return (row: PlatformChartDatum) => row.values[seriesKey] ?? 0
}

function platformChartColor(entry: PlatformSeries) {
  return platformBrandColor(entry.key, entry.label, entry.color)
}

function formatPlatformXAxis(value: number | Date) {
  const row = chartRows.value[Math.round(Number(value))]
  return row?.label ?? ""
}

function formatPlatformYAxis(value: number | Date) {
  const amount = Number(value ?? 0)
  return Math.abs(amount) >= 1000 ? `$${formatAnalyticsCompact(amount)}` : `$${Math.round(amount)}`
}

function renderPlatformTooltip(point: PlatformChartDatum) {
  if (!point) {
    return ""
  }

  const rows = chartSeries.value
    .map((entry) => ({
      entry,
      value: point.values[entry.key] ?? 0,
    }))
    .filter((row) => row.value > 0)
    .slice(0, 5)
    .map(({ entry, value }) => `
      <span>
        ${platformTooltipMedia(entry.key, entry.label)}
        <i style="background:${entry.color}"></i>
        ${escapeAnalyticsTooltipHtml(entry.label)}: ${formatAnalyticsMoney(value)}
      </span>
    `)
    .join("")

  return `
    <div class="analytics-chart-tooltip platform-tooltip-content">
      <strong>${escapeAnalyticsTooltipHtml(point.label)}</strong>
      ${rows || "<small>No platform revenue</small>"}
    </div>
  `
}

function platformTooltipMedia(platformKey: string | undefined, label: string) {
  const row = sortedRows.value.find((entry) => entry.id === platformKey || entry.label === label)
  const logo = resolveDspLogo(row?.logoKey || label)
  const src = logo?.assets?.onDark || logo?.assets?.onLight || ""

  return analyticsTooltipMedia(src, label, "dsp")
}

function handleChartClick(event: MouseEvent) {
  if (!chartRows.value.length || !chartElement.value) {
    return
  }

  const rect = chartElement.value.getBoundingClientRect()
  const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  const percentage = rect.width > 0 ? relativeX / rect.width : 0
  const row = chartRows.value[Math.round(percentage * (chartRows.value.length - 1))]

  if (row?.key && row.key !== "visible") {
    emit("select-period", {
      key: row.key,
      label: row.label,
    })
  }
}

function platformMatrixCell(row: PlatformMatrixRow, platform: PlatformDatum) {
  return row.values[platform.id] ?? { revenue: 0, streams: 0 }
}

function platformCellStyle(value: number) {
  const intensity = Math.max(0, Math.min(1, value / platformMatrixMaxRevenue.value))

  return {
    "--cell-tone": value > 0 ? `${Math.round(2 + intensity * 8)}%` : "0%",
    "--cell-dark-tone": value > 0 ? `${Math.round(4 + intensity * 10)}%` : "0%",
  }
}

</script>

<template>
  <Card class="platform-mix-panel analytics-panel">
    <CardHeader class="platform-header">
      <div class="platform-title-block">
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
        expand-label="Open platform data detail"
        @expand="detailOpen = true"
      />

      <Button
        v-else
        type="button"
        variant="ghost"
        size="sm"
        class="platform-total h-auto px-0 py-0"
        :disabled="!topPlatform"
        @click="topPlatform && emit('select-platform', topPlatform)"
      >
        <span>
          <DspLogo
            :logo-key="topPlatform?.logoKey"
            :name="topPlatform?.label || 'No platform'"
            :label="topPlatform?.label || 'No platform'"
            size="sm"
            :interactive="false"
          />
        </span>
        <strong>{{ formatAnalyticsMoney(totalRevenue) }}</strong>
        <small>{{ periodLabel }}</small>
      </Button>
    </CardHeader>

    <CardContent class="platform-content">
      <div
        v-if="!enableDataView || viewMode === 'chart'"
        ref="chartElement"
        class="analytics-unovis-frame platform-chart"
        @click="handleChartClick"
      >
        <AppEmptyState
          v-if="!chartSeries.length"
          compact
          icon="chart"
          :title="emptyText"
          class="platform-chart-empty"
        />
        <ClientOnly v-else>
          <VisXYContainer
            :key="platformChartRenderKey"
            :data="chartRows"
            :height="chartHeight"
            :margin="{ top: 22, right: 20, bottom: 12, left: 12 }"
            :padding="{ top: 6, right: 8, bottom: 0, left: 0 }"
            :x-domain="platformChartXDomain"
            :y-domain="platformChartYDomain"
            aria-label="Platform revenue trend chart"
          >
            <VisLine
              v-for="entry in chartSeries"
              :key="entry.key"
              :x="platformChartX"
              :y="platformSeriesY(entry.key)"
              :color="platformChartColor(entry)"
              curve-type="monotoneX"
              :line-width="2"
            />
            <VisScatter
              v-for="entry in chartSeries"
              :key="`${entry.key}:points`"
              :x="platformChartX"
              :y="platformSeriesY(entry.key)"
              :color="platformChartColor(entry)"
              stroke-color="var(--card)"
              :stroke-width="1.8"
              :size="7"
            />
            <VisAxis
              type="x"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :tick-values="platformChartTickValues"
              :tick-format="formatPlatformXAxis"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="11"
            />
            <VisAxis
              type="y"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :num-ticks="4"
              :tick-format="formatPlatformYAxis"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="11"
            />
            <VisTooltip class-name="analytics-chart-tooltip-popover" />
            <VisCrosshair
              :x="platformChartX"
              :y="platformCrosshairYAccessors"
              color="var(--chart-1)"
              :template="renderPlatformTooltip"
            />
          </VisXYContainer>
          <template #fallback>
            <div class="platform-chart-empty" />
          </template>
        </ClientOnly>
      </div>

      <div v-else class="platform-data-view">
        <table>
          <thead>
            <tr>
              <th>Release</th>
              <th v-for="platform in compactMatrixPlatformColumns" :key="platform.id">
                <DspLogo
                  :logo-key="platform.logoKey"
                  :name="platform.label"
                  :label="platform.label"
                  size="xs"
                  :interactive="false"
                />
              </th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in compactPlatformMatrixRows" :key="row.id">
              <td>
                <strong>{{ row.label }}</strong>
              </td>
              <td v-for="platform in compactMatrixPlatformColumns" :key="`${row.id}:${platform.id}`">
                <span
                  class="platform-matrix-cell"
                  :style="platformCellStyle(platformMatrixCell(row, platform).revenue)"
                >
                  {{ formatAnalyticsMoney(platformMatrixCell(row, platform).revenue) }}
                </span>
              </td>
              <td>
                <strong>{{ formatAnalyticsMoney(row.totalRevenue) }}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>

    <CardFooter v-if="topRows.length && (!enableDataView || viewMode === 'chart')" class="platform-footer">
      <Button
        v-for="row in topRows"
        :key="row.id"
        type="button"
        variant="ghost"
        size="sm"
        class="platform-row h-auto px-0 py-0"
        :style="{ '--platform-color': row.color }"
        @click="emit('select-platform', row)"
      >
        <span class="platform-dot" aria-hidden="true" />
        <span class="platform-copy">
          <strong>
            <DspLogo
              :logo-key="row.logoKey"
              :name="row.label"
              :label="row.label"
              size="sm"
              :interactive="false"
            />
          </strong>
          <small>{{ formatAnalyticsMoney(row.revenue) }} visible revenue</small>
        </span>
        <span class="platform-share">{{ formatAnalyticsShare(row.share) }}</span>
      </Button>
    </CardFooter>

    <Sheet v-model:open="detailOpen">
      <SheetContent
        side="right"
        class="analytics-data-sheet platform-data-sheet"
        @focus-outside="preventAnalyticsOverlayDismiss"
        @interact-outside="preventAnalyticsOverlayDismiss"
        @pointer-down-outside="preventAnalyticsOverlayDismiss"
      >
        <SheetHeader class="analytics-data-sheet-header">
          <div class="analytics-data-sheet-kicker">
            <Badge v-if="eyebrow" variant="secondary" class="w-fit">
              {{ eyebrow }}
            </Badge>
            <span>{{ periodLabel }}</span>
          </div>
          <SheetTitle class="analytics-data-sheet-title">
            Platform revenue detail
          </SheetTitle>
          <SheetDescription class="analytics-data-sheet-description">
            Release x DSP revenue from the current analytics filters.
          </SheetDescription>
        </SheetHeader>

        <div class="analytics-data-sheet-summary">
          <span>
            <small>Revenue</small>
            <strong>{{ formatAnalyticsMoney(totalRevenue) }}</strong>
          </span>
          <span>
            <small>Releases</small>
            <strong>{{ platformMatrixRows.length }}</strong>
          </span>
          <span>
            <small>DSPs</small>
            <strong>{{ matrixPlatformColumns.length }}</strong>
          </span>
          <span>
            <small>Leader</small>
            <strong>{{ topPlatform?.label || "No data" }}</strong>
          </span>
        </div>

        <div class="analytics-data-sheet-table platform-data-sheet-table">
          <table>
            <thead>
              <tr>
                <th>Release</th>
                <th>Total</th>
                <th v-for="platform in matrixPlatformColumns" :key="platform.id">
                  <DspLogo
                    :logo-key="platform.logoKey"
                    :name="platform.label"
                    :label="platform.label"
                    size="xs"
                    :interactive="false"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in platformMatrixRows" :key="row.id">
                <td>
                  <strong>{{ row.label }}</strong>
                  <small>Release</small>
                </td>
                <td class="platform-total-data">
                  <strong>{{ formatAnalyticsMoney(row.totalRevenue) }}</strong>
                </td>
                <td v-for="platform in matrixPlatformColumns" :key="`${row.id}:${platform.id}:detail`">
                  <span
                    class="platform-matrix-cell"
                    :style="platformCellStyle(platformMatrixCell(row, platform).revenue)"
                  >
                    {{ formatAnalyticsMoney(platformMatrixCell(row, platform).revenue) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  </Card>
</template>

<style scoped>
.platform-mix-panel {
  height: 100%;
  overflow: hidden;
}

.platform-header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
}

.platform-title-block {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.platform-total {
  display: grid;
  justify-items: end;
  min-width: max-content;
  gap: 2px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: right;
}

.platform-total:disabled {
  cursor: default;
}

.platform-total span {
  display: flex;
  justify-content: flex-end;
  max-width: 180px;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.platform-total strong {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.platform-total small {
  color: var(--muted-foreground);
  font-size: 12px;
}

.platform-content {
  padding-bottom: 0;
}

.analytics-unovis-frame,
.platform-data-view {
  min-height: 318px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 38%, transparent);
  padding: 10px;
}

.analytics-unovis-frame {
  cursor: pointer;
}

.platform-chart-empty {
  display: grid;
  min-height: 298px;
  place-items: center;
}

.analytics-unovis-frame :deep(.unovis-xy-container) {
  min-height: 298px;
}

.analytics-unovis-frame :deep(svg) {
  overflow: visible;
}

.analytics-unovis-frame :deep(.vis-axis .tick line),
.analytics-unovis-frame :deep(.vis-axis .domain),
.analytics-unovis-frame :deep(.vis-axis-grid-line) {
  display: none;
}

.analytics-unovis-frame :deep(.vis-line path) {
  filter: drop-shadow(0 8px 10px rgb(0 0 0 / 10%));
}

.analytics-unovis-frame :deep(.vis-crosshair-line) {
  stroke: color-mix(in srgb, var(--foreground) 36%, transparent);
  stroke-dasharray: 4 6;
}

.analytics-unovis-frame :deep(.vis-crosshair-circle) {
  fill: var(--card);
  stroke-width: 2px;
}

.platform-data-view {
  overflow-x: auto;
  padding: 0;
}

.platform-data-view table,
.analytics-data-sheet-table table {
  width: 100%;
  min-width: 680px;
  border-collapse: separate;
  border-spacing: 0;
}

.platform-data-view th,
.platform-data-view td,
.analytics-data-sheet-table th,
.analytics-data-sheet-table td {
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 62%, transparent);
  padding: 10px 12px;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.25;
  text-align: right;
  white-space: nowrap;
}

.platform-data-view th:first-child,
.platform-data-view td:first-child,
.analytics-data-sheet-table th:first-child,
.analytics-data-sheet-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  max-width: 220px;
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
  text-align: left;
}

.platform-data-view th:first-child,
.analytics-data-sheet-table th:first-child {
  z-index: 4;
}

.platform-data-view th {
  height: 44px;
  background: color-mix(in srgb, var(--card) 88%, transparent);
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
  font-size: 10px;
  font-weight: 720;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.platform-data-view td strong,
.analytics-data-sheet-table td strong {
  display: block;
  overflow: hidden;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 620;
  letter-spacing: 0;
  line-height: 1.2;
  text-overflow: ellipsis;
}

.platform-data-view td:first-child strong,
.analytics-data-sheet-table td:first-child strong {
  font-family: var(--font-app-sans);
  font-size: 13px;
  font-weight: 670;
  letter-spacing: 0;
  line-height: 1.22;
}

.platform-data-view td small {
  display: block;
  margin-top: 2px;
  color: var(--muted-foreground);
  font-size: 11px;
}

.platform-matrix-cell {
  display: inline-flex;
  min-width: 74px;
  justify-content: flex-end;
  border-radius: 6px;
  background: color-mix(in srgb, var(--foreground) var(--cell-tone, 0%), transparent);
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 560;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
  line-height: 1.15;
  padding: 4px 7px;
}

.platform-footer {
  display: grid;
  gap: 10px;
  padding-top: 18px;
}

.platform-row {
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

.platform-share {
  justify-self: end;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.platform-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--platform-color);
  box-shadow: none;
}

.platform-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.platform-copy strong {
  display: flex;
  align-items: center;
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.platform-copy small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.platform-tooltip-content span) {
  display: flex;
  align-items: center;
  gap: 6px;
}

:global(.platform-tooltip-content i) {
  display: inline-block;
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 999px;
}

:global(.platform-data-sheet) {
  width: min(900px, calc(100vw - 18px));
  max-width: min(900px, calc(100vw - 18px)) !important;
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
  transition:
    background var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out),
    border-color var(--duration-fast, 150ms) var(--ease-out);
}

:global(.analytics-data-sheet > button[aria-label="Close"]:hover) {
  border-color: color-mix(in srgb, var(--foreground) 14%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--foreground) 5%, var(--card));
  color: var(--foreground);
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
  max-width: 560px;
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
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 82%, var(--background) 18%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 34%, transparent);
}

.platform-data-sheet-table table {
  min-width: 1080px;
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
  text-transform: uppercase;
}

.analytics-data-sheet-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: color-mix(in srgb, var(--card) 96%, var(--background) 4%);
  backdrop-filter: blur(12px);
}

.analytics-data-sheet-table td {
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
}

.analytics-data-sheet-table tbody tr:hover td {
  background-color: color-mix(in srgb, var(--foreground) 3%, transparent);
}

.analytics-data-sheet-table th:first-child,
.analytics-data-sheet-table td:first-child {
  width: 228px;
  min-width: 228px;
  max-width: 228px;
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
  box-shadow: 1px 0 0 color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
}

.analytics-data-sheet-table tbody tr:hover td:first-child {
  background: color-mix(in srgb, var(--card) 94%, var(--foreground) 6%);
}

.analytics-data-sheet-table td:first-child small {
  display: block;
  margin-top: 4px;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 640;
}

.analytics-data-sheet-table th:nth-child(2),
.analytics-data-sheet-table td:nth-child(2) {
  min-width: 104px;
}

.analytics-data-sheet-table td:nth-child(2) strong {
  color: var(--foreground);
  font-size: 12.5px;
  font-weight: 620;
}

.platform-total-data {
  background: color-mix(in srgb, var(--foreground) 2.6%, transparent);
}

.platform-data-sheet-table .platform-matrix-cell {
  width: 100%;
  min-width: 88px;
  border-radius: 5px;
}

:global(.dark) .platform-matrix-cell {
  background: color-mix(in srgb, #d7d7d2 var(--cell-dark-tone, 0%), transparent);
}

.analytics-data-sheet-table::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.analytics-data-sheet-table::-webkit-scrollbar-track {
  background: transparent;
}

.analytics-data-sheet-table::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted-foreground) 36%, transparent);
  background-clip: padding-box;
}

.analytics-data-sheet-table::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--muted-foreground) 52%, transparent);
  background-clip: padding-box;
}

:global(.dark .platform-data-sheet) {
  border-color: color-mix(in srgb, #d7d7d2 5%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, #0a0a0a 58%, var(--card) 42%), color-mix(in srgb, #0a0a0a 74%, var(--card) 26%));
  box-shadow: -28px 0 70px -44px rgb(0 0 0 / 88%);
}

:global(.dark .analytics-data-sheet > button[aria-label="Close"]) {
  border-color: color-mix(in srgb, #d7d7d2 5%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, #0a0a0a 64%, var(--card) 36%);
}

:global(.dark .analytics-data-sheet > button[aria-label="Close"]:hover) {
  border-color: color-mix(in srgb, #d7d7d2 12%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, #d7d7d2 5%, var(--card));
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

:global(.dark) .platform-data-view th:first-child,
:global(.dark) .platform-data-view td:first-child,
:global(.dark) .analytics-data-sheet-table th:first-child,
:global(.dark) .analytics-data-sheet-table td:first-child {
  background: color-mix(in srgb, #0a0a0a 54%, var(--card) 46%);
}

:global(.dark) .analytics-data-sheet-table tbody tr:hover td:first-child {
  background: color-mix(in srgb, color-mix(in srgb, #0a0a0a 54%, var(--card) 46%) 92%, #d7d7d2 8%);
}

@media (max-width: 640px) {
  .platform-header {
    display: grid;
  }

  .platform-total {
    justify-items: start;
    text-align: left;
  }
}
</style>
