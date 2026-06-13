<script setup lang="ts">
import { VisArea, VisAxis, VisCrosshair, VisLine, VisTooltip, VisXYContainer } from "@unovis/vue"
import { ReceiptText } from "lucide-vue-next"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import {
  formatAnalyticsCompact,
} from "~~/app/utils/analytics-charts"

interface MonthlyRevenuePoint {
  key?: string | null
  periodMonth?: string | null
  label?: string | null
  revenue?: string | number | null
  value?: string | number | null
}

interface MonthlyRevenueChartDatum {
  key: string
  periodMonth: string
  label: string
  revenue: number
  index: number
}

interface RevenueRangeOption {
  value: string
  label: string
  months: number
}

const props = withDefaults(defineProps<{
  title?: string
  eyebrow?: string
  points: MonthlyRevenuePoint[]
  periodLabel?: string | null
  loading?: boolean
  error?: string | null
  retryLabel?: string | null
  emptyTitle?: string
  emptyDescription?: string
  rangeValue?: string | null
  rangeOptions?: RevenueRangeOption[]
  showRangeSelect?: boolean
  fillMonthKeys?: string[]
  fillLastTwelveMonths?: boolean
  selectable?: boolean
}>(), {
  title: "Monthly revenue",
  eyebrow: "Revenue performance",
  periodLabel: null,
  loading: false,
  error: null,
  retryLabel: null,
  emptyTitle: "No chart data",
  emptyDescription: "No monthly revenue has been posted yet.",
  rangeValue: null,
  rangeOptions: () => [],
  showRangeSelect: false,
  fillMonthKeys: () => [],
  fillLastTwelveMonths: false,
  selectable: false,
})

const emit = defineEmits<{
  "select-month": [point: MonthlyRevenueChartDatum]
  "update:rangeValue": [value: string]
  retry: []
}>()

const chartElement = ref<HTMLElement | null>(null)

const monthlyRevenueChartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

const revenueChartDefs = `
  <linearGradient id="monthly-revenue-area" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0%" stop-color="var(--color-revenue)" stop-opacity="0.34" />
    <stop offset="55%" stop-color="var(--color-revenue)" stop-opacity="0.10" />
    <stop offset="100%" stop-color="var(--color-revenue)" stop-opacity="0" />
  </linearGradient>
`

const compactMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
})

const selectedRangeValue = computed({
  get: () => props.rangeValue ?? props.rangeOptions[0]?.value ?? "",
  set: (value: string | number | null) => {
    emit("update:rangeValue", String(value ?? ""))
  },
})

const selectedRange = computed(() => (
  props.rangeOptions.find((option) => option.value === selectedRangeValue.value) ?? props.rangeOptions[0] ?? null
))

const explicitFillMonthKeys = computed(() => (
  [...new Set(props.fillMonthKeys.map((key) => normalizeMonthKey(key)).filter(Boolean))]
))

const normalizedPoints = computed(() => {
  const pointsByMonth = new Map<string, MonthlyRevenuePoint>()

  for (const point of props.points) {
    const key = normalizeMonthKey(point.periodMonth ?? point.key ?? point.label)

    if (key) {
      pointsByMonth.set(key, point)
    }
  }

  const sourceMonths = explicitFillMonthKeys.value.length
    ? explicitFillMonthKeys.value
    : props.fillLastTwelveMonths
      ? lastTwelveMonthKeys()
      : props.points.map((point) => normalizeMonthKey(point.periodMonth ?? point.key ?? point.label)).filter(Boolean)

  return sourceMonths.map((periodMonth) => {
    const point = pointsByMonth.get(periodMonth)
    const label = point?.label || formatShortMonth(periodMonth)

    return {
      key: periodMonth,
      periodMonth,
      label,
      revenue: normalizedRevenue(point),
    }
  })
})

const visibleMonthlyRevenueChartPoints = computed(() => {
  if (props.showRangeSelect && selectedRange.value) {
    return normalizedPoints.value.slice(-selectedRange.value.months)
  }

  return normalizedPoints.value
})

const monthlyRevenueHasData = computed(() => visibleMonthlyRevenueChartPoints.value.some((point) => point.revenue > 0))
const earningRevenuePoints = computed(() => visibleMonthlyRevenueChartPoints.value.filter((point) => point.revenue > 0))
const visibleRevenueTotal = computed(() => visibleMonthlyRevenueChartPoints.value.reduce((sum, point) => sum + point.revenue, 0))
const bestRevenuePoint = computed(() => (
  earningRevenuePoints.value.reduce<(typeof visibleMonthlyRevenueChartPoints.value)[number] | null>((best, point) => (
    !best || point.revenue > best.revenue ? point : best
  ), null)
))
const latestRevenuePoint = computed(() => {
  const points = visibleMonthlyRevenueChartPoints.value

  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]

    if (point && point.revenue > 0) {
      return { point, index }
    }
  }

  const latestPoint = points.at(-1)
  return latestPoint ? { point: latestPoint, index: points.length - 1 } : null
})
const previousRevenuePoint = computed(() => {
  const latest = latestRevenuePoint.value

  if (!latest || latest.index <= 0) {
    return null
  }

  return visibleMonthlyRevenueChartPoints.value[latest.index - 1] ?? null
})
const latestRevenueDelta = computed(() => {
  const latest = latestRevenuePoint.value?.point
  const previous = previousRevenuePoint.value

  if (!latest || !previous) {
    return null
  }

  return latest.revenue - previous.revenue
})
/* One computed sentence above the chart — the "house analyst" line. */
const revenueInsight = computed(() => {
  const latest = latestRevenuePoint.value?.point
  const previous = previousRevenuePoint.value

  if (!latest || latest.revenue <= 0) {
    return ""
  }

  if (!previous || previous.revenue <= 0) {
    const best = bestRevenuePoint.value
    return best && best.key !== latest.key ? `Best month in view: ${best.label}.` : ""
  }

  const delta = latest.revenue - previous.revenue

  if (delta === 0) {
    return `${latest.label} held steady against ${previous.label}.`
  }

  const percent = Math.round(Math.abs(delta / previous.revenue) * 100)

  if (percent === 0) {
    return `${latest.label} held steady against ${previous.label}.`
  }

  return delta > 0
    ? `${latest.label} is up ${percent}% on ${previous.label}.`
    : `${latest.label} is down ${percent}% from ${previous.label}.`
})

const resolvedPeriodLabel = computed(() => {
  if (props.periodLabel) {
    return props.periodLabel
  }

  const firstPoint = visibleMonthlyRevenueChartPoints.value[0]
  const lastPoint = visibleMonthlyRevenueChartPoints.value.at(-1)

  if (!firstPoint || !lastPoint) {
    return "No posted months"
  }

  return firstPoint.key === lastPoint.key ? firstPoint.label : `${firstPoint.label} to ${lastPoint.label}`
})
const revenueInsightChips = computed(() => [
  {
    label: "Range revenue",
    value: formatMoney(visibleRevenueTotal.value),
    detail: resolvedPeriodLabel.value,
  },
  {
    label: "Latest month",
    value: latestRevenuePoint.value ? formatMoney(latestRevenuePoint.value.point.revenue) : "$0.00",
    detail: latestRevenuePoint.value?.point.label ?? "No earnings yet",
  },
  {
    label: "Monthly change",
    value: latestRevenueDelta.value === null ? "No prior" : formatSignedMoney(latestRevenueDelta.value),
    detail: formatMonthChangeDetail(
      latestRevenueDelta.value,
      latestRevenuePoint.value?.point ?? null,
      previousRevenuePoint.value,
    ),
    tone: latestRevenueDelta.value === null
      ? "neutral"
      : latestRevenueDelta.value > 0
        ? "positive"
        : latestRevenueDelta.value < 0
          ? "negative"
          : "neutral",
  },
  {
    label: "Peak month",
    value: bestRevenuePoint.value ? formatMoney(bestRevenuePoint.value.revenue) : "$0.00",
    detail: bestRevenuePoint.value?.label ?? "No earnings yet",
  },
])
const monthlyRevenueChartData = computed<MonthlyRevenueChartDatum[]>(() => (
  visibleMonthlyRevenueChartPoints.value.map((point, index) => ({
    ...point,
    index,
  }))
))
const monthlyRevenueChartRenderKey = computed(() => [
  selectedRangeValue.value,
  props.selectable ? "selectable" : "static",
  monthlyRevenueChartData.value.length,
  ...monthlyRevenueChartData.value.map((point) => `${point.key}:${point.revenue}:${point.label}`),
].join("|"))
const monthlyRevenueChartTickValues = computed(() => {
  const points = monthlyRevenueChartData.value
  const showEveryLabel = points.length <= 6

  return points
    .filter((point) => showEveryLabel || point.index === 0 || point.index === points.length - 1 || point.index % 3 === 0)
    .map((point) => point.index)
})
const monthlyRevenueChartYDomain = computed<[number, number]>(() => {
  const maxRevenue = monthlyRevenueChartData.value.reduce((max, point) => Math.max(max, point.revenue), 0)
  return [0, maxRevenue > 0 ? maxRevenue * 1.18 : 1]
})
const monthlyRevenueChartXDomain = computed<[number, number]>(() => [
  0,
  Math.max(monthlyRevenueChartData.value.length - 1, 1),
])

function revenueChartX(point: MonthlyRevenueChartDatum) {
  return point.index
}

function revenueChartY(point: MonthlyRevenueChartDatum) {
  return point.revenue
}

function formatRevenueChartTick(value: number | Date) {
  const point = monthlyRevenueChartData.value[Math.round(Number(value))]
  return point?.label ?? ""
}

function formatRevenueChartAxis(value: number | Date) {
  return formatChartAxisMoney(Number(value))
}

function renderRevenueChartTooltip(point: MonthlyRevenueChartDatum) {
  if (!point) {
    return ""
  }

  return `
    <div class="revenue-chart-tooltip-content">
      <strong>${escapeChartHtml(point.label)}</strong>
      <span>${escapeChartHtml(formatMoney(point.revenue))} revenue</span>
    </div>
  `
}

function handleChartClick(event: MouseEvent) {
  if (!props.selectable || monthlyRevenueChartData.value.length === 0 || !chartElement.value) {
    return
  }

  const chartRect = chartElement.value.getBoundingClientRect()
  const relativeX = Math.min(Math.max(event.clientX - chartRect.left, 0), chartRect.width)
  const percentage = chartRect.width > 0 ? relativeX / chartRect.width : 0
  const index = Math.round(percentage * (monthlyRevenueChartData.value.length - 1))
  const point = monthlyRevenueChartData.value[index]

  if (point) {
    emit("select-month", point)
  }
}

function normalizedRevenue(point: MonthlyRevenuePoint | undefined) {
  const amount = Number(point?.revenue ?? point?.value ?? 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

function normalizeMonthKey(value: string | null | undefined) {
  return String(value ?? "").slice(0, 7)
}

function monthKeyFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function addUtcMonths(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
}

function lastTwelveMonthKeys(now = new Date()) {
  const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  return Array.from({ length: 12 }, (_, index) => monthKeyFromDate(addUtcMonths(currentMonth, index - 11)))
}

function formatShortMonth(value: string) {
  const normalized = normalizeMonthKey(value)
  const parsedDate = new Date(`${normalized}-01T00:00:00Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return compactMonthFormatter.format(parsedDate)
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0)
  return `$${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`
}

function formatSignedMoney(value: number) {
  if (value === 0) {
    return "$0.00"
  }

  return `${value > 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`
}

function formatSignedPercent(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return "0.0%"
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
}

function formatMonthChangeDetail(
  value: number | null,
  latest: (typeof visibleMonthlyRevenueChartPoints.value)[number] | null,
  previous: (typeof visibleMonthlyRevenueChartPoints.value)[number] | null,
) {
  if (value === null || !latest || !previous) {
    return "No prior month"
  }

  if (previous.revenue === 0) {
    return `${latest.label} vs ${previous.label}`
  }

  return `${latest.label} vs ${previous.label} / ${formatSignedPercent((value / previous.revenue) * 100)}`
}

function formatChartAxisMoney(value: number) {
  const amount = Number(value ?? 0)

  if (!Number.isFinite(amount)) {
    return "$0"
  }

  if (Math.abs(amount) >= 1000) {
    return `$${formatAnalyticsCompact(amount)}`
  }

  return `$${Math.round(amount).toLocaleString()}`
}

function escapeChartHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
</script>

<template>
  <section class="performance-chart-section revenue-chart-panel">
    <div class="section-header revenue-chart-header">
      <div class="revenue-chart-title">
        <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
        <h3>{{ title }}</h3>
        <span>{{ resolvedPeriodLabel }}</span>
        <p v-if="revenueInsight" class="revenue-insight">{{ revenueInsight }}</p>
      </div>
      <div v-if="showRangeSelect && rangeOptions.length" class="revenue-chart-actions">
        <ReceiptText class="size-5 text-muted-foreground" aria-hidden="true" />
        <NativeSelect
          v-model="selectedRangeValue"
          size="sm"
          class="revenue-range-select"
          aria-label="Revenue chart range"
        >
          <option v-for="option in rangeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </NativeSelect>
      </div>
    </div>

    <AppAlert v-if="error" variant="destructive">
      {{ error }}
      <template v-if="retryLabel" #action>
        <Button variant="secondary" @click="emit('retry')">{{ retryLabel }}</Button>
      </template>
    </AppAlert>

    <div v-else class="revenue-chart-body">
      <Skeleton v-if="loading" class="revenue-chart-loading" />
      <AppEmptyState
        v-else-if="!monthlyRevenueHasData"
        class="revenue-chart-empty"
        compact
        icon="chart"
        :title="emptyTitle"
        :description="emptyDescription"
      />
      <ChartContainer
        v-else
        :config="monthlyRevenueChartConfig"
        class="revenue-shadcn-chart"
        :class="{ 'is-selectable': selectable }"
        @click="handleChartClick"
      >
        <ClientOnly>
          <div ref="chartElement" class="revenue-chart-click-layer">
            <VisXYContainer
              :key="monthlyRevenueChartRenderKey"
              :data="monthlyRevenueChartData"
              :height="270"
              :margin="{ top: 16, right: 16, bottom: 6, left: 8 }"
              :padding="{ top: 8, right: 10, bottom: 0, left: 0 }"
              :x-domain="monthlyRevenueChartXDomain"
              :y-domain="monthlyRevenueChartYDomain"
              :svg-defs="revenueChartDefs"
              aria-label="Monthly revenue chart"
            >
              <VisArea
                :x="revenueChartX"
                :y="revenueChartY"
                color="url(#monthly-revenue-area)"
                curve-type="monotoneX"
              />
              <VisLine
                :x="revenueChartX"
                :y="revenueChartY"
                color="var(--color-revenue)"
                curve-type="monotoneX"
                :line-width="2.5"
              />
              <VisAxis
                type="x"
                :tick-line="false"
                :domain-line="false"
                :grid-line="false"
                :tick-values="monthlyRevenueChartTickValues"
                :tick-format="formatRevenueChartTick"
                tick-text-color="var(--muted-foreground)"
                :tick-text-font-size="11"
              />
              <VisAxis
                type="y"
                :tick-line="false"
                :domain-line="false"
                :grid-line="false"
                :num-ticks="4"
                :tick-format="formatRevenueChartAxis"
                tick-text-color="var(--muted-foreground)"
                :tick-text-font-size="11"
              />
              <VisTooltip class-name="revenue-chart-tooltip-popover" />
              <VisCrosshair
                :x="revenueChartX"
                :y="revenueChartY"
                color="var(--color-revenue)"
                :template="renderRevenueChartTooltip"
              />
            </VisXYContainer>
          </div>
          <template #fallback>
            <Skeleton class="revenue-chart-loading" />
          </template>
        </ClientOnly>
      </ChartContainer>
    </div>

    <div class="revenue-insight-strip">
      <div
        v-for="chip in revenueInsightChips"
        :key="chip.label"
        class="revenue-insight-chip"
        :class="chip.tone ? `is-${chip.tone}` : undefined"
      >
        <span>{{ chip.label }}</span>
        <strong>{{ chip.value }}</strong>
        <small>{{ chip.detail }}</small>
      </div>
    </div>
  </section>
</template>

<style scoped>
.performance-chart-section {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.revenue-chart-panel {
  gap: 14px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.section-header h3 {
  margin: 0;
  color: var(--foreground);
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0;
}

.revenue-chart-header {
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 0;
}

.revenue-chart-title {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.revenue-chart-title span {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revenue-insight {
  margin: 2px 0 0;
  color: color-mix(in srgb, var(--foreground) 76%, var(--muted-foreground));
  font-size: 13px;
  font-weight: 560;
  line-height: 1.4;
}

.revenue-insight::before {
  content: "";
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 7px;
  border-radius: 999px;
  background: var(--priority);
  vertical-align: 2px;
}

.revenue-chart-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.revenue-range-select {
  flex: 0 0 168px;
}

.revenue-chart-body {
  min-width: 0;
  margin-inline: 0;
  overflow: visible;
  border-radius: 0;
  background: transparent;
  padding: 0;
}

.revenue-shadcn-chart,
.revenue-chart-loading,
.revenue-chart-empty {
  min-height: 286px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 2%), color-mix(in srgb, var(--card) 93%, var(--muted) 7%));
}

.revenue-shadcn-chart {
  padding: 12px 10px 4px;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent),
    0 16px 34px -32px rgb(10 10 10 / 46%);
}

.revenue-shadcn-chart.is-selectable {
  cursor: pointer;
}

.revenue-chart-click-layer {
  min-width: 0;
}

.revenue-chart-loading {
  display: block;
}

.revenue-chart-empty {
  display: grid;
  place-items: center;
}

.revenue-shadcn-chart :deep(.unovis-xy-container) {
  min-height: 270px;
}

.revenue-shadcn-chart :deep(svg) {
  overflow: visible;
}

.revenue-shadcn-chart :deep(.vis-axis .tick line),
.revenue-shadcn-chart :deep(.vis-axis .domain) {
  stroke: color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
}

.revenue-shadcn-chart :deep(.vis-axis-grid-line) {
  display: none;
  stroke: transparent;
}

.revenue-shadcn-chart :deep(.vis-line path) {
  filter: drop-shadow(0 10px 12px color-mix(in srgb, var(--chart-1) 18%, transparent));
}

.revenue-shadcn-chart :deep(.vis-crosshair-line) {
  stroke: color-mix(in srgb, var(--chart-1) 42%, transparent);
  stroke-dasharray: 4 6;
}

.revenue-shadcn-chart :deep(.vis-crosshair-circle) {
  fill: var(--card);
  stroke: var(--chart-1);
  stroke-width: 2px;
}

:global(.revenue-chart-tooltip-popover) {
  width: max-content !important;
  min-width: 128px !important;
  max-width: 220px !important;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent) !important;
  border-radius: 10px !important;
  background: var(--popover) !important;
  color: var(--popover-foreground) !important;
  box-shadow: 0 14px 30px rgb(0 0 0 / 26%) !important;
  padding: 0 !important;
  backdrop-filter: blur(14px);
}

:global(.revenue-chart-tooltip-content) {
  display: grid;
  gap: 4px;
  min-width: 124px;
  padding: 10px 12px;
}

:global(.revenue-chart-tooltip-content strong) {
  color: var(--foreground);
  font-size: 12px;
  font-weight: 680;
  line-height: 1.1;
}

:global(.revenue-chart-tooltip-content span) {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.25;
}

:global(.dark) .revenue-shadcn-chart,
:global(.dark) .revenue-chart-loading,
:global(.dark) .revenue-chart-empty {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 64%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 86%, var(--foreground) 3%), color-mix(in srgb, var(--background) 68%, var(--card)));
}

.revenue-insight-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 10px;
  align-items: stretch;
  padding-top: 18px;
}

.revenue-insight-chip {
  display: grid;
  gap: 5px;
  min-width: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0;
  animation: insight-enter 460ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.revenue-insight-chip:nth-child(1) {
  animation-delay: 1600ms;
}

.revenue-insight-chip:nth-child(2) {
  animation-delay: 1680ms;
}

.revenue-insight-chip:nth-child(3) {
  animation-delay: 1760ms;
}

.revenue-insight-chip:nth-child(4) {
  animation-delay: 1840ms;
}

.revenue-insight-chip span,
.revenue-insight-chip small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revenue-insight-chip span {
  font-weight: 650;
  letter-spacing: 0;
  text-transform: uppercase;
}

.revenue-insight-chip strong {
  overflow: hidden;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.revenue-insight-chip.is-positive strong {
  color: var(--status-success, #0f8a5f);
}

.revenue-insight-chip.is-negative strong {
  color: var(--status-warning, #b45309);
}

.performance-chart-section .section-header {
  animation: insight-enter 400ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) 360ms both;
}

@media (max-width: 760px) {
  .revenue-chart-header {
    align-items: stretch;
    flex-direction: column;
  }

  .revenue-chart-actions {
    justify-content: stretch;
    width: 100%;
  }

  .revenue-chart-actions > svg {
    display: none;
  }

  .revenue-range-select {
    flex-basis: auto;
    width: 100%;
  }

  .revenue-shadcn-chart,
  .revenue-chart-loading,
  .revenue-chart-empty {
    min-height: 258px;
    border-radius: 14px;
    padding-inline: 0;
  }

  .revenue-insight-strip {
    grid-template-columns: 1fr;
  }
}

@keyframes insight-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
