<script setup lang="ts">
import { VisAxis, VisCrosshair, VisLine, VisScatter, VisTooltip, VisXYContainer } from "@unovis/vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  analyticsTooltipMedia,
  escapeAnalyticsTooltipHtml,
  formatAnalyticsCompact,
} from "~~/app/utils/analytics-charts"
import { resolveDspChartColor, resolveDspLogo } from "~~/app/utils/dsp-logos"

interface AnalyticsAudiencePoint {
  label: string
  value: number
}

interface AnalyticsAudienceCard {
  key: string
  label: string
  value: number | null
  delta?: number | null
  periodLabel?: string | null
  topCountry?: {
    countryCode: string | null
    countryName: string
    streams: number
  } | null
  points: AnalyticsAudiencePoint[]
}

interface AudienceSeries {
  key: string
  label: string
  metricLabel: string
  color: string
  value: number | null
  delta: number | null
  topCountry: {
    countryCode: string | null
    countryName: string
    streams: number
  } | null
  points: AnalyticsAudiencePoint[]
}

interface AudienceChartDatum {
  key: string
  label: string
  total: number
  index: number
  values: Record<string, number>
}

interface AudienceDateFilterOption {
  value: string
  label: string
}

interface AudienceDataRow extends AudienceSeries {
  total: number
  peak: number
  latestLabel: string
}

const props = withDefaults(defineProps<{
  title: string
  eyebrow?: string
  summary?: string
  cards: AnalyticsAudienceCard[]
  dateFilterOptions?: AudienceDateFilterOption[]
  dateFilterValue?: string
  enableDataView?: boolean
  emptyText?: string
}>(), {
  dateFilterOptions: () => [],
  dateFilterValue: "",
  enableDataView: false,
  emptyText: "No stream data matches the current filters.",
})

const emit = defineEmits<{
  select: [series: AudienceSeries]
  "update:dateFilterValue": [value: string]
  "detail-open-change": [open: boolean]
}>()

const viewMode = ref<"chart" | "table">("chart")
const detailOpen = ref(false)
const chartPalette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

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

function dspBrandColor(key: string | null | undefined, label: string | null | undefined, fallback: string) {
  return resolveDspChartColor(key, null) || resolveDspChartColor(label, fallback) || fallback
}

const platformMeta: Record<string, { label: string }> = {
  spotify: { label: "Spotify" },
  apple_music: { label: "Apple Music" },
  appleMusic: { label: "Apple Music" },
  youtube: { label: "YouTube" },
  youtubeMusic: { label: "YouTube Music" },
  youtubeContentId: { label: "YouTube Content ID" },
  tiktok: { label: "TikTok" },
  meta: { label: "Meta" },
  soundcloud: { label: "SoundCloud" },
  amazonMusic: { label: "Amazon Music" },
}

const monthIndex: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
}

function platformFromKey(key: string) {
  const parts = key.split(":")
  return parts.length >= 3 ? parts[1] : ""
}

function formatCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "No data"
  }

  return formatAnalyticsCompact(value)
}

function formatDelta(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "No prior"
  }

  if (value === 0) {
    return "No change"
  }

  return `${value > 0 ? "+" : ""}${formatAnalyticsCompact(value)}`
}

function dspTooltipMedia(label: string) {
  const logo = resolveDspLogo(label)
  const src = logo?.assets?.onDark || logo?.assets?.onLight || ""

  return analyticsTooltipMedia(src, label, "dsp")
}

function platformLabelFromCard(card: AnalyticsAudienceCard, keyLabel: string) {
  const label = card.label.replace(/\s+streams$/i, "").trim()
  return label || keyLabel || "Streaming store"
}

function metricLabelFromCard(card: AnalyticsAudienceCard, platformLabel: string) {
  const label = card.label
    .replace(/\s+streams$/i, "")
    .replace(platformLabel, "")
    .replace("monthly listeners", "listeners")
    .replace("video creations", "creations")
    .trim()

  return label || "Streams"
}

function periodSortValue(label: string) {
  const [month, year] = label.split(" ")
  const monthValue = monthIndex[month] ?? 0
  const yearValue = Number(year ?? 0)
  return (yearValue + 2000) * 12 + monthValue
}

function updateDateFilter(event: Event) {
  const target = event.target as HTMLSelectElement | null

  if (target) {
    emit("update:dateFilterValue", target.value)
  }
}

const series = computed<AudienceSeries[]>(() => props.cards
  .filter((card) => card.points.length)
  .map((card, index) => {
    const platform = platformFromKey(card.key)
    const meta = platformMeta[platform] ?? { label: card.label.split(" / ")[0] || "DSP" }
    const platformLabel = platformLabelFromCard(card, meta.label)

    return {
      key: card.key,
      label: platformLabel,
      metricLabel: metricLabelFromCard(card, platformLabel),
      color: dspBrandColor(platform, platformLabel, chartPalette[index % chartPalette.length]),
      value: card.value,
      delta: card.delta ?? null,
      topCountry: card.topCountry ?? null,
      points: [...card.points].sort((left, right) => periodSortValue(left.label) - periodSortValue(right.label)),
    }
  }))

const periodLabels = computed(() => [...new Set(series.value.flatMap((entry) => entry.points.map((point) => point.label)))]
  .sort((left, right) => periodSortValue(left) - periodSortValue(right)))

const periodLabel = computed(() => {
  const first = periodLabels.value[0]
  const last = periodLabels.value.at(-1)

  if (!first || !last) {
    return "No stream data"
  }

  return first === last ? first : `${first} to ${last}`
})

const dataRows = computed<AudienceDataRow[]>(() => series.value.map((entry) => {
  const values = entry.points.map((point) => Number(point.value ?? 0))
  const latestPoint = entry.points.at(-1) ?? null
  const total = values.reduce((sum, value) => sum + value, 0)

  return {
    ...entry,
    total,
    peak: values.length ? Math.max(...values) : 0,
    latestLabel: latestPoint?.label ?? "No period",
    topCountry: entry.topCountry ?? (total > 0
      ? {
          countryCode: null,
          countryName: "Unknown country",
          streams: total,
        }
      : null),
  }
}).sort((left, right) => right.total - left.total))
const compactDataRows = computed(() => dataRows.value.slice(0, 5))
const topChartRows = computed(() => dataRows.value.slice(0, 5))
const audienceTotalCount = computed(() => dataRows.value.reduce((sum, row) => sum + row.total, 0))
const audiencePeakCount = computed(() => Math.max(0, ...dataRows.value.map((row) => row.peak)))
const topAudienceRow = computed(() => [...dataRows.value].sort((left, right) => right.total - left.total)[0] ?? null)

const chartPeriodLabels = computed(() => [...new Map(topChartRows.value.flatMap((entry) => entry.points.map((point) => [
  point.label,
  point.label,
]))).entries()]
  .sort((left, right) => periodSortValue(left[0]) - periodSortValue(right[0])))

const chartRows = computed<AudienceChartDatum[]>(() => chartPeriodLabels.value.map(([key, label], index) => {
  const values = Object.fromEntries(topChartRows.value.map((entry) => [
    entry.key,
    entry.points.find((point) => point.label === key)?.value ?? 0,
  ]))

  return {
    key,
    label,
    index,
    total: Object.values(values).reduce((sum, value) => sum + Number(value ?? 0), 0),
    values,
  }
}))

const audienceChartTickValues = computed(() => {
  const rows = chartRows.value
  const showEveryLabel = rows.length <= 6

  return rows
    .filter((row) => showEveryLabel || row.index === 0 || row.index === rows.length - 1 || row.index % 3 === 0)
    .map((row) => row.index)
})
const audienceChartXDomain = computed<[number, number]>(() => [
  0,
  Math.max(chartRows.value.length - 1, 1),
])
const audienceChartYDomain = computed<[number, number]>(() => {
  const maxValue = chartRows.value.reduce((max, row) => Math.max(max, ...Object.values(row.values).map(Number)), 0)
  return [0, maxValue > 0 ? maxValue * 1.18 : 1]
})
const audienceCrosshairYAccessors = computed(() => topChartRows.value.map((entry) => audienceSeriesY(entry.key)))

function audienceChartX(row: AudienceChartDatum) {
  return row.index
}

function audienceSeriesY(seriesKey: string) {
  return (row: AudienceChartDatum) => row.values[seriesKey] ?? 0
}

function audienceChartColor(entry: AudienceDataRow) {
  return dspBrandColor(entry.key, entry.label, entry.color)
}

function formatAudienceXAxis(value: number | Date) {
  const row = chartRows.value[Math.round(Number(value))]
  return row?.label ?? ""
}

function formatAudienceYAxis(value: number | Date) {
  return formatAnalyticsCompact(Number(value ?? 0))
}

function renderAudienceTooltip(point: AudienceChartDatum) {
  if (!point) {
    return ""
  }

  const rows = topChartRows.value
    .map((entry) => ({
      entry,
      value: point.values[entry.key] ?? 0,
    }))
    .filter((row) => row.value > 0)
    .slice(0, 5)
    .map(({ entry, value }) => `
      <span>
        ${dspTooltipMedia(entry.label)}
        <i style="background:${entry.color}"></i>
        ${escapeAnalyticsTooltipHtml(entry.label)}: ${formatAnalyticsCompact(value)}
      </span>
    `)
    .join("")

  return `
    <div class="analytics-chart-tooltip audience-tooltip-content">
      <strong>${escapeAnalyticsTooltipHtml(point.label)}</strong>
      ${rows || "<small>No stream activity</small>"}
    </div>
  `
}
</script>

<template>
  <Card class="audience-pulse-panel analytics-panel">
    <CardHeader class="audience-header">
      <div class="audience-title-block">
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

      <div class="audience-actions">
        <AnalyticsViewControls
          v-if="enableDataView"
          v-model="viewMode"
          expand-label="Open streams data detail"
          @expand="detailOpen = true"
        />

        <div v-if="dateFilterOptions.length && dateFilterValue" class="audience-controls">
          <label class="audience-filter">
            <span>Date range</span>
            <NativeSelect :model-value="dateFilterValue" @change="updateDateFilter">
              <option v-for="option in dateFilterOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </label>
        </div>
      </div>
    </CardHeader>

    <CardContent class="audience-content">
      <div v-if="!enableDataView || viewMode === 'chart'" class="audience-chart">
        <AppEmptyState
          v-if="!topChartRows.length"
          compact
          icon="chart"
          :title="emptyText"
          class="audience-chart-empty"
        />
        <ClientOnly v-else>
          <VisXYContainer
            :data="chartRows"
            :height="330"
            :margin="{ top: 22, right: 20, bottom: 12, left: 12 }"
            :padding="{ top: 6, right: 8, bottom: 0, left: 0 }"
            :x-domain="audienceChartXDomain"
            :y-domain="audienceChartYDomain"
            aria-label="Audience streams trend chart"
          >
            <VisLine
              v-for="entry in topChartRows"
              :key="entry.key"
              :x="audienceChartX"
              :y="audienceSeriesY(entry.key)"
              :color="audienceChartColor(entry)"
              curve-type="monotoneX"
              :line-width="2"
            />
            <VisScatter
              v-for="entry in topChartRows"
              :key="`${entry.key}:points`"
              :x="audienceChartX"
              :y="audienceSeriesY(entry.key)"
              :color="audienceChartColor(entry)"
              stroke-color="var(--card)"
              :stroke-width="1.8"
              :size="7"
            />
            <VisAxis
              type="x"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :tick-values="audienceChartTickValues"
              :tick-format="formatAudienceXAxis"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="11"
            />
            <VisAxis
              type="y"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :num-ticks="4"
              :tick-format="formatAudienceYAxis"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="11"
            />
            <VisTooltip class-name="analytics-chart-tooltip-popover" />
            <VisCrosshair
              :x="audienceChartX"
              :y="audienceCrosshairYAccessors"
              color="var(--chart-1)"
              :template="renderAudienceTooltip"
            />
          </VisXYContainer>
          <template #fallback>
            <div class="audience-chart-empty" />
          </template>
        </ClientOnly>
      </div>

      <div v-else class="audience-data-view">
        <table>
          <thead>
            <tr>
              <th>DSP</th>
              <th>Top country</th>
              <th>Latest</th>
              <th>Change</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in compactDataRows" :key="entry.key">
              <td>
                <DspLogo :name="entry.label" :label="entry.label" size="sm" :interactive="false" />
              </td>
              <td>
                <span v-if="entry.topCountry" class="audience-country-cell">
                  <CountryFlag
                    :code="entry.topCountry.countryCode"
                    :label="entry.topCountry.countryName"
                    show-label
                  />
                  <small>{{ formatAnalyticsCompact(entry.topCountry.streams) }}</small>
                </span>
                <span v-else class="audience-country-empty">No stream country</span>
              </td>
              <td>
                <strong>{{ formatCount(entry.value) }}</strong>
                <small>{{ entry.latestLabel }}</small>
              </td>
              <td>
                <span :class="entry.delta !== null && entry.delta < 0 ? 'negative' : 'positive'">
                  {{ formatDelta(entry.delta) }}
                </span>
              </td>
              <td>{{ formatAnalyticsCompact(entry.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CardContent>

    <CardFooter v-if="topChartRows.length && (!enableDataView || viewMode === 'chart')" class="audience-footer">
      <Button
        v-for="entry in topChartRows"
        :key="entry.key"
        type="button"
        variant="ghost"
        size="sm"
        class="audience-series-row h-auto px-0 py-0"
        :style="{ '--series-color': entry.color }"
        @click="emit('select', entry)"
      >
        <span class="audience-series-dot" aria-hidden="true" />
        <span class="audience-series-copy">
          <strong>
            <DspLogo :name="entry.label" :label="entry.label" size="sm" :interactive="false" />
          </strong>
          <small class="sr-only">{{ entry.metricLabel }}</small>
        </span>
        <span class="audience-series-value">
          <strong>{{ formatAnalyticsCompact(entry.total) }}</strong>
          <small :class="entry.delta !== null && entry.delta < 0 ? 'negative' : 'positive'">
            Latest {{ formatCount(entry.value) }}
          </small>
        </span>
      </Button>
    </CardFooter>

    <Sheet v-model:open="detailOpen">
      <SheetContent
        side="right"
        class="analytics-data-sheet audience-data-sheet"
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
            Streams by DSP detail
          </SheetTitle>
          <SheetDescription class="analytics-data-sheet-description">
            Store-level stream activity across the selected date range.
          </SheetDescription>
        </SheetHeader>

        <div class="analytics-data-sheet-summary">
          <span>
            <small>Total</small>
            <strong>{{ formatAnalyticsCompact(audienceTotalCount) }}</strong>
          </span>
          <span>
            <small>DSPs</small>
            <strong>{{ dataRows.length }}</strong>
          </span>
          <span>
            <small>Peak</small>
            <strong>{{ formatAnalyticsCompact(audiencePeakCount) }}</strong>
          </span>
          <span>
            <small>Leader</small>
            <strong>{{ topAudienceRow?.label || "No data" }}</strong>
          </span>
        </div>

        <div class="analytics-data-sheet-table audience-data-sheet-table">
          <table>
            <thead>
              <tr>
                <th>DSP</th>
                <th>Top country</th>
                <th>Latest</th>
                <th>Change</th>
                <th>Total</th>
                <th>Peak</th>
                <th>Window</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in dataRows" :key="`${entry.key}:detail`">
                <td>
                  <DspLogo :name="entry.label" :label="entry.label" size="sm" :interactive="false" />
                </td>
                <td>
                  <span v-if="entry.topCountry" class="audience-country-cell">
                    <CountryFlag
                      :code="entry.topCountry.countryCode"
                      :label="entry.topCountry.countryName"
                      show-label
                    />
                    <small>{{ formatAnalyticsCompact(entry.topCountry.streams) }}</small>
                  </span>
                  <span v-else class="audience-country-empty">No stream country</span>
                </td>
                <td>
                  <strong>{{ formatCount(entry.value) }}</strong>
                </td>
                <td>
                  <span :class="entry.delta !== null && entry.delta < 0 ? 'negative' : 'positive'">
                    {{ formatDelta(entry.delta) }}
                  </span>
                </td>
                <td>{{ formatAnalyticsCompact(entry.total) }}</td>
                <td>{{ formatAnalyticsCompact(entry.peak) }}</td>
                <td>{{ entry.latestLabel }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  </Card>
</template>

<style scoped>
.audience-pulse-panel {
  height: 100%;
  overflow: hidden;
}

.audience-header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 10px;
}

.audience-title-block {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.audience-actions {
  display: grid;
  justify-items: end;
  gap: 10px;
  min-width: max-content;
}

.audience-controls {
  display: grid;
  justify-items: end;
  min-width: max-content;
  gap: 6px;
}

.audience-controls > span,
.audience-filter span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.audience-controls strong {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.audience-filter {
  display: grid;
  gap: 6px;
  justify-items: end;
}

.audience-filter :deep(select) {
  min-width: 136px;
}

.audience-content {
  padding-bottom: 0;
}

.audience-chart,
.audience-data-view {
  min-height: 330px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 38%, transparent);
  padding: 10px;
}

.audience-data-view {
  overflow-x: auto;
  padding: 0;
}

.audience-chart-empty {
  display: grid;
  min-height: 310px;
  place-items: center;
}

.audience-chart :deep(.unovis-xy-container) {
  min-height: 310px;
}

.audience-chart :deep(svg) {
  overflow: visible;
}

.audience-chart :deep(.vis-axis .tick line),
.audience-chart :deep(.vis-axis .domain),
.audience-chart :deep(.vis-axis-grid-line) {
  display: none;
}

.audience-chart :deep(.vis-line path) {
  filter: drop-shadow(0 8px 10px rgb(0 0 0 / 10%));
}

.audience-chart :deep(.vis-crosshair-line) {
  stroke: color-mix(in srgb, var(--foreground) 36%, transparent);
  stroke-dasharray: 4 6;
}

.audience-chart :deep(.vis-crosshair-circle) {
  fill: var(--card);
  stroke-width: 2px;
}

.audience-data-view table,
.analytics-data-sheet-table table {
  width: 100%;
  min-width: 720px;
  border-collapse: separate;
  border-spacing: 0;
}

.audience-data-view th,
.audience-data-view td,
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

.audience-data-view th:first-child,
.audience-data-view td:first-child,
.analytics-data-sheet-table th:first-child,
.analytics-data-sheet-table td:first-child {
  position: sticky;
  left: 0;
  z-index: 1;
  width: 190px;
  min-width: 190px;
  max-width: 190px;
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
  box-shadow: 1px 0 0 color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
  text-align: left;
}

.audience-data-view th:first-child,
.analytics-data-sheet-table th:first-child {
  z-index: 4;
}

.audience-data-view th,
.analytics-data-sheet-table th {
  background: color-mix(in srgb, var(--card) 90%, transparent);
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 720;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.audience-data-view td strong,
.analytics-data-sheet-table td strong {
  display: block;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 620;
  letter-spacing: 0;
  line-height: 1.2;
}

.audience-data-view td small {
  display: block;
  margin-top: 2px;
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 520;
  line-height: 1.2;
}

.audience-country-cell {
  display: inline-grid;
  justify-items: end;
  gap: 3px;
  max-width: 180px;
  min-width: 0;
}

.audience-country-cell :deep(.country-flag) {
  max-width: 100%;
  justify-content: flex-end;
}

.audience-country-cell :deep(.country-flag-label) {
  max-width: 122px;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 620;
}

.audience-country-cell small,
.audience-country-empty {
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.2;
}

.audience-data-view .positive,
.analytics-data-sheet-table .positive {
  color: var(--status-success);
}

.audience-data-view .negative,
.analytics-data-sheet-table .negative {
  color: var(--destructive);
}

.audience-footer {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
  padding-top: 18px;
}

.audience-series-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  min-height: 54px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 68%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 2%), color-mix(in srgb, var(--card) 88%, var(--muted) 12%));
  padding: 9px 10px;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    border-color 180ms var(--ease-out),
    background 180ms var(--ease-out),
    transform 180ms var(--ease-out);
}

.audience-series-row:hover {
  border-color: color-mix(in srgb, var(--series-color) 48%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, var(--series-color) 8%), color-mix(in srgb, var(--card) 88%, var(--muted) 12%));
  transform: translateY(-1px);
}

.audience-series-dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--series-color);
  box-shadow: none;
}

.audience-series-copy,
.audience-series-value {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.audience-series-copy strong,
.audience-series-value strong {
  display: flex;
  align-items: center;
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audience-series-copy :deep(.dsp-logo-sm) {
  --dsp-logo-box-width: 104px;
  --dsp-logo-box-height: 22px;
}

.audience-series-copy small,
.audience-series-value small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audience-series-value {
  justify-items: end;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}

.audience-series-value small.positive {
  color: var(--status-success);
}

.audience-series-value small.negative {
  color: var(--destructive);
}

:global(.audience-tooltip-content span) {
  display: flex;
  align-items: center;
  gap: 6px;
}

:global(.audience-tooltip-content i) {
  display: inline-block;
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 999px;
}

:global(.audience-data-sheet) {
  width: min(660px, calc(100vw - 18px));
  max-width: min(660px, calc(100vw - 18px)) !important;
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

.audience-data-sheet-table table {
  min-width: 860px;
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

:global(.dark .audience-data-sheet) {
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

:global(.dark) .audience-data-view th:first-child,
:global(.dark) .audience-data-view td:first-child,
:global(.dark) .analytics-data-sheet-table th:first-child,
:global(.dark) .analytics-data-sheet-table td:first-child {
  background: color-mix(in srgb, #0a0a0a 54%, var(--card) 46%);
}

:global(.dark) .analytics-data-sheet-table tbody tr:hover td:first-child {
  background: color-mix(in srgb, color-mix(in srgb, #0a0a0a 54%, var(--card) 46%) 92%, #d7d7d2 8%);
}

@media (max-width: 640px) {
  .audience-header {
    display: grid;
  }

  .audience-actions,
  .audience-controls,
  .audience-filter {
    justify-items: start;
  }

  .audience-footer {
    grid-template-columns: 1fr;
  }
}

@media (min-width: 641px) and (max-width: 980px) {
  .audience-footer {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
