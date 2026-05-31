<script setup lang="ts">
import { VisArea, VisAxis, VisCrosshair, VisLine, VisScatter, VisTooltip, VisXYContainer } from "@unovis/vue"
import { TrendingDown, TrendingUp } from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  escapeAnalyticsTooltipHtml,
  formatAnalyticsCompact,
  formatAnalyticsMoney,
  numeric,
} from "~~/app/utils/analytics-charts"

interface AnalyticsTrendPoint {
  key?: string
  label: string
  value: string | number
  streams?: number
}

interface TrendDatum {
  key: string
  label: string
  revenue: number
  streams: number
  index: number
}

const props = withDefaults(defineProps<{
  title: string
  eyebrow?: string
  summary?: string
  points: AnalyticsTrendPoint[]
  valueLabel?: string
  emptyText?: string
}>(), {
  valueLabel: "Revenue",
  emptyText: "No trend data matches the current filters.",
})

const emit = defineEmits<{
  select: [point: TrendDatum]
}>()

const chartElement = ref<HTMLElement | null>(null)

const chartData = computed<TrendDatum[]>(() => props.points.map((point, index) => ({
  key: point.key || point.label,
  label: point.label,
  revenue: Math.max(0, numeric(point.value)),
  streams: Number(point.streams ?? 0),
  index,
})))

const totalValue = computed(() => chartData.value.reduce((sum, point) => sum + point.revenue, 0))
const bestPoint = computed(() => chartData.value.reduce<TrendDatum | null>((best, point) => (
  !best || point.revenue > best.revenue ? point : best
), null))
const latestPoint = computed(() => chartData.value.at(-1) ?? null)
const priorPoint = computed(() => chartData.value.at(-2) ?? null)
const latestDelta = computed(() => latestPoint.value && priorPoint.value
  ? latestPoint.value.revenue - priorPoint.value.revenue
  : null)
const deltaTone = computed(() => {
  if (latestDelta.value === null || latestDelta.value === 0) {
    return "secondary"
  }

  return latestDelta.value > 0 ? "success" : "destructive"
})
const periodLabel = computed(() => {
  const first = chartData.value[0]?.label
  const last = chartData.value.at(-1)?.label

  if (!first || !last) {
    return "No periods"
  }

  return first === last ? first : `${first} to ${last}`
})

const chartTickValues = computed(() => {
  const points = chartData.value
  const showEveryLabel = points.length <= 6

  return points
    .filter((point) => showEveryLabel || point.index === 0 || point.index === points.length - 1 || point.index % 3 === 0)
    .map((point) => point.index)
})
const chartXDomain = computed<[number, number]>(() => [
  0,
  Math.max(chartData.value.length - 1, 1),
])
const chartYDomain = computed<[number, number]>(() => {
  const maxRevenue = chartData.value.reduce((max, point) => Math.max(max, point.revenue), 0)
  return [0, maxRevenue > 0 ? maxRevenue * 1.18 : 1]
})

function chartX(point: TrendDatum) {
  return point.index
}

function chartY(point: TrendDatum) {
  return point.revenue
}

function formatChartXTick(value: number | Date) {
  const point = chartData.value[Math.round(Number(value))]
  return point?.label ?? ""
}

function formatChartYTick(value: number | Date) {
  const amount = Number(value ?? 0)
  return Math.abs(amount) >= 1000 ? `$${formatAnalyticsCompact(amount)}` : `$${Math.round(amount)}`
}

function renderChartTooltip(point: TrendDatum) {
  if (!point) {
    return ""
  }

  return `
    <div class="analytics-chart-tooltip">
      <strong>${escapeAnalyticsTooltipHtml(point.label)}</strong>
      <span>${formatAnalyticsMoney(point.revenue)} royalty revenue</span>
      <small>${formatAnalyticsCompact(point.streams)} plays + impressions</small>
    </div>
  `
}

function formatSignedMoney(value: number) {
  if (value === 0) {
    return "$0.00"
  }

  return `${value > 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`
}

function handleChartClick(event: MouseEvent) {
  if (!chartData.value.length || !chartElement.value) {
    return
  }

  const rect = chartElement.value.getBoundingClientRect()
  const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width)
  const percentage = rect.width > 0 ? relativeX / rect.width : 0
  const point = chartData.value[Math.round(percentage * (chartData.value.length - 1))]

  if (point) {
    emit("select", point)
  }
}
</script>

<template>
  <Card class="trend-panel analytics-panel">
    <CardHeader class="trend-header">
      <div class="trend-title-block">
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

      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="trend-total h-auto px-0 py-0"
        :disabled="!latestPoint"
        @click="latestPoint && emit('select', latestPoint)"
      >
        <span>{{ valueLabel }}</span>
        <strong>{{ formatAnalyticsMoney(totalValue) }}</strong>
        <small>{{ periodLabel }}</small>
      </Button>
    </CardHeader>

    <CardContent class="trend-content">
      <div ref="chartElement" class="analytics-unovis-frame trend-chart" @click="handleChartClick">
        <AppEmptyState
          v-if="!chartData.length"
          compact
          icon="chart"
          :title="emptyText"
          class="analytics-chart-empty"
        />
        <ClientOnly v-else>
          <VisXYContainer
            :data="chartData"
            :height="306"
            :margin="{ top: 18, right: 18, bottom: 12, left: 10 }"
            :padding="{ top: 6, right: 8, bottom: 0, left: 0 }"
            :x-domain="chartXDomain"
            :y-domain="chartYDomain"
            aria-label="Analytics trend chart"
          >
            <VisArea
              :x="chartX"
              :y="chartY"
              color="color-mix(in srgb, var(--chart-1) 22%, transparent)"
              curve-type="monotoneX"
            />
            <VisLine
              :x="chartX"
              :y="chartY"
              color="var(--chart-1)"
              curve-type="monotoneX"
              :line-width="2.6"
            />
            <VisScatter
              :x="chartX"
              :y="chartY"
              color="var(--chart-1)"
              stroke-color="var(--card)"
              :stroke-width="2"
              :size="9"
            />
            <VisAxis
              type="x"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :tick-values="chartTickValues"
              :tick-format="formatChartXTick"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="11"
            />
            <VisAxis
              type="y"
              :tick-line="false"
              :domain-line="false"
              :grid-line="false"
              :num-ticks="4"
              :tick-format="formatChartYTick"
              tick-text-color="var(--muted-foreground)"
              :tick-text-font-size="11"
            />
            <VisTooltip class-name="analytics-chart-tooltip-popover" />
            <VisCrosshair
              :x="chartX"
              :y="chartY"
              color="var(--chart-1)"
              :template="renderChartTooltip"
            />
          </VisXYContainer>
          <template #fallback>
            <div class="analytics-chart-empty" />
          </template>
        </ClientOnly>
      </div>
    </CardContent>

    <CardFooter v-if="chartData.length" class="trend-footer">
      <Button type="button" variant="ghost" size="sm" class="h-auto justify-start px-0 py-0" :disabled="!latestPoint" @click="latestPoint && emit('select', latestPoint)">
        <span>Latest</span>
        <strong>{{ latestPoint ? `${latestPoint.label} / ${formatAnalyticsMoney(latestPoint.revenue)}` : "No data" }}</strong>
      </Button>
      <div>
        <span>Change</span>
        <Badge :variant="deltaTone">
          <TrendingUp v-if="latestDelta !== null && latestDelta >= 0" class="size-3" aria-hidden="true" />
          <TrendingDown v-else class="size-3" aria-hidden="true" />
          {{ latestDelta === null ? "No prior" : formatSignedMoney(latestDelta) }}
        </Badge>
      </div>
      <Button type="button" variant="ghost" size="sm" class="h-auto justify-start px-0 py-0" :disabled="!bestPoint" @click="bestPoint && emit('select', bestPoint)">
        <span>Peak</span>
        <strong>{{ bestPoint ? `${bestPoint.label} / ${formatAnalyticsMoney(bestPoint.revenue)}` : "No data" }}</strong>
      </Button>
    </CardFooter>
  </Card>
</template>

<style scoped>
.trend-panel {
  height: 100%;
  overflow: hidden;
}

.trend-header {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 10px;
}

.trend-title-block {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.trend-total {
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

.trend-total:disabled {
  cursor: default;
}

.trend-total span,
.trend-footer span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.trend-total strong {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 20px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.trend-total small {
  color: var(--muted-foreground);
  font-size: 12px;
}

.trend-content {
  padding-bottom: 0;
}

.analytics-unovis-frame {
  min-height: 306px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 38%, transparent);
  padding: 10px;
  cursor: pointer;
}

.analytics-chart-empty {
  display: grid;
  min-height: 286px;
  place-items: center;
}

.analytics-unovis-frame :deep(.unovis-xy-container) {
  min-height: 286px;
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
  filter: drop-shadow(0 10px 12px color-mix(in srgb, var(--chart-1) 18%, transparent));
}

.analytics-unovis-frame :deep(.vis-crosshair-line) {
  stroke: color-mix(in srgb, var(--chart-1) 42%, transparent);
  stroke-dasharray: 4 6;
}

.analytics-unovis-frame :deep(.vis-crosshair-circle) {
  fill: var(--card);
  stroke: var(--chart-1);
  stroke-width: 2px;
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

.trend-footer {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  align-items: stretch;
  padding-top: 18px;
}

.trend-footer > button,
.trend-footer > div {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.trend-footer > button {
  cursor: pointer;
}

.trend-footer strong {
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

@media (max-width: 640px) {
  .trend-header {
    display: grid;
  }

  .trend-total {
    justify-items: start;
    text-align: left;
  }

  .trend-footer {
    grid-template-columns: 1fr;
  }
}
</style>
