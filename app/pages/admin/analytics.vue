<script setup lang="ts">
import {
  ANALYTICS_PERIOD_OPTIONS,
  DEFAULT_ANALYTICS_PERIOD_RANGE,
  type AnalyticsPeriodRange,
} from "~~/app/utils/analytics-periods"
import type { AnalyticsDrilldownState } from "~~/app/utils/analytics-charts"
import { countryNameFor } from "~~/app/utils/country-flags"
import type {
  AdminAnalyticsResponse,
  AdminAnalyticsRevenueRow,
} from "~~/types/admin"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const ALL_FILTER = "all"
const UNASSIGNED_CHANNEL = "__unassigned__"
const UNKNOWN_COUNTRY = "__unknown__"

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const compactMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
})

const analyticsFocus = reactive({
  artistId: ALL_FILTER,
  channelId: ALL_FILTER,
  countryCode: ALL_FILTER,
  periodMonth: ALL_FILTER,
})
const overviewPeriodRange = ref<AnalyticsPeriodRange>(DEFAULT_ANALYTICS_PERIOD_RANGE)
const selectedDrilldown = ref<AnalyticsDrilldownState>({
  kind: "overview",
  id: null,
  label: "Network overview",
  meta: "Showing posted revenue, territory, platform, artist, and stream activity.",
})

const { data, pending, error } = useLazyFetch<AdminAnalyticsResponse>("/api/admin/analytics", {
  query: computed(() => ({ periodRange: overviewPeriodRange.value })),
})

const revenueRows = computed(() => data.value?.revenueRows ?? [])

function revenueChannelKey(row: Pick<AdminAnalyticsRevenueRow, "channelId">) {
  return row.channelId || UNASSIGNED_CHANNEL
}

function revenueCountryKey(row: Pick<AdminAnalyticsRevenueRow, "countryCode">) {
  return row.countryCode || UNKNOWN_COUNTRY
}

function matches(selectedValue: string, rowValue: string | null) {
  if (selectedValue === ALL_FILTER) {
    return true
  }

  return rowValue === selectedValue
}

const filteredRevenueRows = computed(() => {
  return revenueRows.value.filter((row) => (
    matches(analyticsFocus.artistId, row.artistId)
    && matches(analyticsFocus.channelId, revenueChannelKey(row))
    && matches(analyticsFocus.countryCode, revenueCountryKey(row))
    && matches(analyticsFocus.periodMonth, row.periodMonth)
  ))
})

const totalRevenue = computed(() => filteredRevenueRows.value.reduce((sum, row) => sum + Number(row.revenue ?? 0), 0))
const totalStreams = computed(() => filteredRevenueRows.value.reduce((sum, row) => sum + Number(row.streams ?? 0), 0))

const geoCountries = computed(() => {
  const byCountry = new Map<string, {
    countryCode: string | null
    countryName: string
    revenue: number
    streams: number
  }>()

  for (const row of filteredRevenueRows.value) {
    const key = revenueCountryKey(row)
    const existing = byCountry.get(key) ?? {
      countryCode: row.countryCode,
      countryName: row.countryName,
      revenue: 0,
      streams: 0,
    }
    existing.revenue += Number(row.revenue ?? 0)
    existing.streams += Number(row.streams ?? 0)
    byCountry.set(key, existing)
  }

  const total = totalRevenue.value || 1

  return [...byCountry.values()]
    .map((country) => ({
      ...country,
      share: (country.revenue / total) * 100,
    }))
    .sort((left, right) => right.revenue - left.revenue)
})

const platformBreakdown = computed(() => {
  const byPlatform = new Map<string, {
    channelId: string | null
    channelName: string
    logoKey: string | null
    revenue: number
    streams: number
  }>()

  for (const row of filteredRevenueRows.value) {
    const key = revenueChannelKey(row)
    const existing = byPlatform.get(key) ?? {
      channelId: row.channelId,
      channelName: row.channelName,
      logoKey: row.logoKey,
      revenue: 0,
      streams: 0,
    }
    existing.revenue += Number(row.revenue ?? 0)
    existing.streams += Number(row.streams ?? 0)
    byPlatform.set(key, existing)
  }

  const total = totalRevenue.value || 1

  return [...byPlatform.values()]
    .map((platform) => ({
      ...platform,
      share: (platform.revenue / total) * 100,
    }))
    .sort((left, right) => right.revenue - left.revenue)
})

const monthlyRevenue = computed(() => {
  const byMonth = new Map<string, { revenue: number; streams: number }>()

  for (const row of filteredRevenueRows.value) {
    const existing = byMonth.get(row.periodMonth) ?? { revenue: 0, streams: 0 }
    existing.revenue += Number(row.revenue ?? 0)
    existing.streams += Number(row.streams ?? 0)
    byMonth.set(row.periodMonth, existing)
  }

  return [...byMonth.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([periodMonth, value]) => ({
      periodMonth,
      revenue: value.revenue,
      streams: value.streams,
    }))
})

const artistLeaderboard = computed(() => {
  const byArtist = new Map<string, {
    artistName: string
    revenue: number
    streams: number
    countries: Set<string>
  }>()

  for (const row of filteredRevenueRows.value) {
    const existing = byArtist.get(row.artistId) ?? {
      artistName: row.artistName,
      revenue: 0,
      streams: 0,
      countries: new Set<string>(),
    }
    existing.revenue += Number(row.revenue ?? 0)
    existing.streams += Number(row.streams ?? 0)

    if (row.countryCode) {
      existing.countries.add(row.countryCode)
    }

    byArtist.set(row.artistId, existing)
  }

  return [...byArtist.entries()]
    .map(([artistId, artist]) => ({
      artistId,
      artistName: artist.artistName,
      revenue: artist.revenue,
      streams: artist.streams,
      countryCount: artist.countries.size,
    }))
    .sort((left, right) => right.revenue - left.revenue)
})

const platformSeries = computed(() => {
  const byPlatform = new Map<string, {
    label: string
    points: Map<string, number>
    total: number
  }>()

  for (const row of filteredRevenueRows.value) {
    const key = revenueChannelKey(row)
    const existing = byPlatform.get(key) ?? {
      label: row.channelName,
      points: new Map<string, number>(),
      total: 0,
    }
    const revenue = Number(row.revenue ?? 0)

    existing.points.set(row.periodMonth, (existing.points.get(row.periodMonth) ?? 0) + revenue)
    existing.total += revenue
    byPlatform.set(key, existing)
  }

  return [...byPlatform.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      total: value.total,
      points: [...value.points.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([periodMonth, revenue]) => ({
          key: periodMonth,
          label: formatShortMonth(periodMonth),
          value: revenue,
        })),
    }))
    .sort((left, right) => right.total - left.total)
})

const topCountry = computed(() => geoCountries.value[0] ?? null)
const topPlatform = computed(() => platformBreakdown.value[0] ?? null)
const topArtist = computed(() => artistLeaderboard.value[0] ?? null)
const overviewPeriodLabel = computed(() => (
  ANALYTICS_PERIOD_OPTIONS.find((option) => option.value === overviewPeriodRange.value)?.label ?? "6 months"
))
const hasAnalyticsFocus = computed(() => (
  analyticsFocus.artistId !== ALL_FILTER
  || analyticsFocus.channelId !== ALL_FILTER
  || analyticsFocus.countryCode !== ALL_FILTER
  || analyticsFocus.periodMonth !== ALL_FILTER
))
const analyticsContext = computed(() => {
  if (selectedDrilldown.value.kind !== "overview") {
    return selectedDrilldown.value
  }

  if (hasAnalyticsFocus.value) {
    return {
      kind: "overview",
      id: null,
      label: "Filtered network view",
      meta: "The dashboard is scoped by the active drill-down filters.",
    } satisfies AnalyticsDrilldownState
  }

  return selectedDrilldown.value
})

const overviewMetrics = computed(() => [
  {
    label: "Network revenue",
    value: formatMoney(totalRevenue.value),
    footnote: `${formatCount(totalStreams.value)} streams from posted earnings`,
    tone: "accent" as const,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Streams",
    value: formatCount(totalStreams.value),
    footnote: topPlatform.value ? `Top DSP ${topPlatform.value.channelName}` : "No stream activity yet",
    tone: "alt" as const,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Top artist",
    value: topArtist.value?.artistName || "No artist",
    footnote: topArtist.value ? `${formatMoney(topArtist.value.revenue)} / ${formatCount(topArtist.value.streams)} streams` : "No earnings posted yet",
    tone: "default" as const,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Top country",
    value: topCountry.value ? countryNameFor(topCountry.value.countryCode, topCountry.value.countryName) : "No country",
    footnote: topCountry.value ? `${Number(topCountry.value.share).toFixed(1)}% of revenue` : "No territory data yet",
    tone: "default" as const,
    valueCountryCode: topCountry.value?.countryCode ?? null,
    valueCountryName: topCountry.value?.countryName ?? null,
  },
])

function formatCount(value: string | number | null | undefined) {
  return compactNumberFormatter.format(Number(value ?? 0))
}

function formatMoney(value: string | number | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function formatShare(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1)}%`
}

function formatShortMonth(value: string) {
  return compactMonthFormatter.format(new Date(value))
}

function resetAnalyticsFocus() {
  analyticsFocus.artistId = ALL_FILTER
  analyticsFocus.channelId = ALL_FILTER
  analyticsFocus.countryCode = ALL_FILTER
  analyticsFocus.periodMonth = ALL_FILTER
  selectedDrilldown.value = {
    kind: "overview",
    id: null,
    label: "Network overview",
    meta: "Showing posted revenue, territory, platform, artist, and stream activity.",
  }
}

function selectAdminPeriod(point: { key: string; label: string }) {
  analyticsFocus.periodMonth = point.key
  selectedDrilldown.value = {
    kind: "period",
    id: point.key,
    label: point.label,
    meta: "Revenue, territory, platform, and artist panels are scoped to this reporting period.",
  }
}

function selectAdminCountry(country: { countryCode: string | null; countryName: string; revenue: string | number; share: number }) {
  analyticsFocus.countryCode = country.countryCode || UNKNOWN_COUNTRY
  selectedDrilldown.value = {
    kind: "country",
    id: country.countryCode,
    label: countryNameFor(country.countryCode, country.countryName),
    meta: `${formatMoney(country.revenue)} / ${formatShare(country.share)} of focused revenue.`,
  }
}

function selectAdminPlatform(row: { id: string; label: string; revenue?: string | number; value?: string | number; share: number }) {
  analyticsFocus.channelId = row.id
  selectedDrilldown.value = {
    kind: "platform",
    id: row.id,
    label: row.label,
    meta: `${formatMoney(row.revenue ?? row.value ?? 0)} / ${formatShare(row.share)} of focused revenue.`,
  }
}

function selectAdminArtist(row: { id: string; label: string; value: string | number; count?: number }) {
  analyticsFocus.artistId = row.id
  selectedDrilldown.value = {
    kind: "artist",
    id: row.id,
    label: row.label,
    meta: `${formatMoney(row.value)} / ${formatCount(row.count ?? 0)} streams after filters.`,
  }
}
</script>

<template>
  <div class="page admin-analytics-page">
    <PageHeader
      eyebrow="Admin intelligence"
      title="Analytics"
      description="Network revenue geography, platform concentration, artist performance, and stream activity."
    />

    <AppAlert v-if="error" variant="destructive">
      {{ error.statusMessage || "Unable to load analytics right now." }}
    </AppAlert>

    <DashboardSkeleton v-if="pending && !data" layout="analytics" />

    <template v-else>
      <div class="analytics-kpi-grid">
        <StatCard
          v-for="metric in overviewMetrics"
          :key="metric.label"
          :label="metric.label"
          :value="metric.value"
          :footnote="metric.footnote"
          :tone="metric.tone"
          :value-country-code="metric.valueCountryCode"
          :value-country-name="metric.valueCountryName"
        />
      </div>

      <div class="analytics-overview-toolbar">
        <div>
          <span>Overview period</span>
          <strong>{{ overviewPeriodLabel }} / {{ filteredRevenueRows.length.toLocaleString() }} revenue rows</strong>
        </div>
        <div class="analytics-overview-actions">
          <NativeSelect v-model="overviewPeriodRange" aria-label="Analytics overview period">
            <option v-for="option in ANALYTICS_PERIOD_OPTIONS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </NativeSelect>
          <Button v-if="hasAnalyticsFocus || analyticsContext.kind !== 'overview'" variant="secondary" type="button" @click="resetAnalyticsFocus">
            Reset focus
          </Button>
        </div>
      </div>

      <div class="analytics-context-panel">
        <div>
          <span>Current focus</span>
          <strong>{{ analyticsContext.label }}</strong>
          <p>{{ analyticsContext.meta }}</p>
        </div>
        <Button v-if="hasAnalyticsFocus || analyticsContext.kind !== 'overview'" variant="secondary" type="button" @click="resetAnalyticsFocus">
          Back to overview
        </Button>
      </div>

      <div class="analytics-bento">
        <AnalyticsWorldMap
          class="analytics-bento-map"
          title="World revenue map"
          eyebrow="Territories"
          summary="Posted royalty revenue grouped by country."
          :countries="geoCountries"
          @select="selectAdminCountry"
        />

        <AnalyticsTrendPanel
          title="Network revenue trend"
          eyebrow="Monthly"
          summary="Posted royalty revenue by month across the selected range."
          :points="monthlyRevenue.map((point) => ({
            key: point.periodMonth,
            label: formatShortMonth(point.periodMonth),
            value: point.revenue,
            streams: point.streams,
          }))"
          @select="selectAdminPeriod"
        />

        <AnalyticsPlatformMix
          title="DSP revenue trend"
          eyebrow="Platforms"
          summary="Top DSP revenue shown as an interactive stacked trend."
          :rows="platformBreakdown.map((row) => ({
            id: row.channelId || UNASSIGNED_CHANNEL,
            label: row.channelName,
            logoKey: row.logoKey,
            revenue: row.revenue,
            streams: row.streams,
            share: row.share,
          }))"
          :series="platformSeries"
          @select-platform="selectAdminPlatform"
          @select-period="selectAdminPeriod"
        />

        <AnalyticsRankPanel
          title="Artist leaderboard"
          eyebrow="Performance"
          summary="Top artists by posted revenue."
          :rows="artistLeaderboard.map((artist) => ({
            id: artist.artistId,
            label: artist.artistName,
            meta: `${formatCount(artist.streams)} streams / ${artist.countryCount} countr${artist.countryCount === 1 ? 'y' : 'ies'}`,
            value: artist.revenue,
            count: artist.streams,
          }))"
          @select="selectAdminArtist"
        />

        <AnalyticsRankPanel
          class="analytics-bento-wide"
          title="DSP streams"
          eyebrow="Streams"
          summary="Stream activity grouped by DSP/channel."
          value-kind="count"
          :rows="platformBreakdown.map((row) => ({
            id: row.channelId || UNASSIGNED_CHANNEL,
            label: row.channelName,
            meta: `${formatMoney(row.revenue)} revenue / ${formatShare(row.share)} share`,
            value: row.streams,
            count: row.streams,
            share: row.share,
          }))"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.admin-analytics-page {
  gap: 24px;
}

.analytics-kpi-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.analytics-overview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

.analytics-overview-toolbar > div {
  display: grid;
  gap: 2px;
}

.analytics-overview-toolbar span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.analytics-overview-toolbar strong {
  color: var(--foreground);
  font-size: 14px;
  font-weight: 700;
}

.analytics-overview-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.analytics-overview-actions :deep(select) {
  min-width: 150px;
}

.analytics-context-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px 18px;
  border: 1px solid color-mix(in srgb, var(--chart-1) 16%, var(--border));
  border-radius: 16px;
  background: color-mix(in srgb, var(--chart-1) 4%, var(--card));
  box-shadow: none;
}

.analytics-context-panel > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.analytics-context-panel span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.analytics-context-panel strong {
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 16px;
  font-weight: 750;
}

.analytics-context-panel p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.55;
}

.analytics-bento {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: stretch;
}

.analytics-bento > * {
  grid-column: span 6;
}

.analytics-bento-map {
  grid-column: span 8;
}

.analytics-bento > :nth-child(2) {
  grid-column: span 4;
}

.analytics-bento-wide {
  grid-column: 1 / -1;
}

:global(.dark .analytics-overview-toolbar) {
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

@media (max-width: 1180px) {
  .analytics-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-bento,
  .analytics-bento > *,
  .analytics-bento-map,
  .analytics-bento > :nth-child(2),
  .analytics-bento-wide {
    grid-column: auto;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .analytics-kpi-grid,
  .analytics-overview-toolbar,
  .analytics-context-panel,
  .analytics-overview-actions {
    grid-template-columns: 1fr;
  }

  .analytics-overview-toolbar,
  .analytics-context-panel,
  .analytics-overview-actions {
    display: grid;
  }
}
</style>
