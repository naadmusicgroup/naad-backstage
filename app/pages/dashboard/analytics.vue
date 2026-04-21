<script setup lang="ts">
import type {
  ArtistAnalyticsEarningsRow,
  ArtistAnalyticsPublishingRow,
  ArtistAnalyticsResponse,
  ArtistAnalyticsSnapshotRow,
} from "~~/types/dashboard"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
})

interface FilterOption {
  value: string
  label: string
}

interface RevenuePoint {
  periodMonth: string
  revenue: number
}

interface BreakdownRow {
  key: string
  label: string
  revenue: number
  share: number
}

interface ReleasePerformanceRow {
  key: string
  label: string
  revenue: number
  territoryCount: number
  channelCount: number
  trackCount: number
}

interface AudienceCard {
  key: string
  label: string
  latestValue: number | null
  latestPeriodMonth: string | null
  previousValue: number | null
  delta: number | null
  points: Array<{
    periodMonth: string
    value: number
  }>
}

const ALL_FILTER_VALUE = "all"
const EMPTY_FILTER_VALUE = "__none__"

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const compactMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
})

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const { activeArtistId } = useActiveArtist()

const filters = reactive({
  periodMonth: ALL_FILTER_VALUE,
  channelId: ALL_FILTER_VALUE,
  territory: ALL_FILTER_VALUE,
  releaseId: ALL_FILTER_VALUE,
  trackId: ALL_FILTER_VALUE,
})

const { data, pending, error, refresh } = useLazyFetch<ArtistAnalyticsResponse>("/api/dashboard/analytics", {
  query: computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined)),
})

const earningsRows = computed(() => data.value?.earningsRows ?? [])
const publishingRows = computed(() => data.value?.publishingRows ?? [])
const audienceSnapshots = computed(() => data.value?.audienceSnapshots ?? [])

function parseMoney(value: string) {
  return Number(value ?? 0)
}

function formatMoney(value: number | string) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function formatMonth(value: string) {
  const parsedDate = new Date(`${value}T00:00:00Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return monthFormatter.format(parsedDate)
}

function formatShortMonth(value: string) {
  const parsedDate = new Date(`${value}T00:00:00Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return compactMonthFormatter.format(parsedDate)
}

function formatCount(value: number | null) {
  if (value === null || value === undefined) {
    return "Not available"
  }

  return compactNumberFormatter.format(value)
}

function formatDelta(value: number | null) {
  if (value === null || value === undefined) {
    return "No prior month"
  }

  if (value === 0) {
    return "No change"
  }

  const prefix = value > 0 ? "+" : ""
  return `${prefix}${compactNumberFormatter.format(value)}`
}

function formatShare(value: number) {
  return `${value.toFixed(1)}%`
}

function optionLabel(label: string | null, fallback: string) {
  return label || fallback
}

function rowMatchesFilter(selectedValue: string, rowValue: string | null) {
  if (selectedValue === ALL_FILTER_VALUE) {
    return true
  }

  if (selectedValue === EMPTY_FILTER_VALUE) {
    return !rowValue
  }

  return rowValue === selectedValue
}

function barWidth(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) {
    return "0%"
  }

  return `${Math.max((value / maxValue) * 100, 6)}%`
}

const periodOptions = computed<FilterOption[]>(() => [
  { value: ALL_FILTER_VALUE, label: "All periods" },
  ...[...new Set(earningsRows.value.map((row) => row.periodMonth))]
    .sort((left, right) => right.localeCompare(left))
    .map((periodMonth) => ({
      value: periodMonth,
      label: formatMonth(periodMonth),
    })),
])

const channelOptions = computed<FilterOption[]>(() => {
  const keyedOptions = new Map<string, string>()

  for (const row of earningsRows.value) {
    const value = row.channelId || EMPTY_FILTER_VALUE
    const label = row.channelId ? row.channelName : "Unassigned channel"
    keyedOptions.set(value, label)
  }

  return [
    { value: ALL_FILTER_VALUE, label: "All channels" },
    ...[...keyedOptions.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label })),
  ]
})

const territoryOptions = computed<FilterOption[]>(() => {
  const keyedOptions = new Map<string, string>()

  for (const row of earningsRows.value) {
    const value = row.territory || EMPTY_FILTER_VALUE
    const label = row.territory || "Unknown territory"
    keyedOptions.set(value, label)
  }

  return [
    { value: ALL_FILTER_VALUE, label: "All territories" },
    ...[...keyedOptions.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label })),
  ]
})

const releaseOptions = computed<FilterOption[]>(() => {
  const keyedOptions = new Map<string, string>()

  for (const row of earningsRows.value) {
    const value = row.releaseId || EMPTY_FILTER_VALUE
    const label = row.releaseId
      ? optionLabel(row.releaseTitle, "Catalog item unavailable")
      : "No linked release"
    keyedOptions.set(value, label)
  }

  return [
    { value: ALL_FILTER_VALUE, label: "All releases" },
    ...[...keyedOptions.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label })),
  ]
})

const trackOptions = computed<FilterOption[]>(() => {
  const keyedOptions = new Map<string, string>()

  for (const row of earningsRows.value) {
    if (!rowMatchesFilter(filters.releaseId, row.releaseId)) {
      continue
    }

    const value = row.trackId || EMPTY_FILTER_VALUE
    const label = row.trackId
      ? optionLabel(row.trackTitle, "Catalog item unavailable")
      : "No linked track"
    keyedOptions.set(value, label)
  }

  return [
    { value: ALL_FILTER_VALUE, label: "All tracks" },
    ...[...keyedOptions.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label })),
  ]
})

watch(trackOptions, (value) => {
  if (!value.some((option) => option.value === filters.trackId)) {
    filters.trackId = ALL_FILTER_VALUE
  }
})

const filteredEarningsRows = computed(() => {
  return earningsRows.value.filter((row) => {
    return (
      rowMatchesFilter(filters.periodMonth, row.periodMonth)
      && rowMatchesFilter(filters.channelId, row.channelId)
      && rowMatchesFilter(filters.territory, row.territory)
      && rowMatchesFilter(filters.releaseId, row.releaseId)
      && rowMatchesFilter(filters.trackId, row.trackId)
    )
  })
})

const filteredPublishingRows = computed(() => {
  return publishingRows.value.filter((row) => rowMatchesFilter(filters.periodMonth, row.periodMonth))
})

const filteredAudienceSnapshots = computed(() => {
  return audienceSnapshots.value.filter((row) => rowMatchesFilter(filters.periodMonth, row.periodMonth))
})

const revenueSeries = computed<RevenuePoint[]>(() => {
  const byMonth = new Map<string, number>()

  for (const row of filteredEarningsRows.value) {
    byMonth.set(row.periodMonth, (byMonth.get(row.periodMonth) ?? 0) + parseMoney(row.revenue))
  }

  return [...byMonth.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([periodMonth, revenue]) => ({
      periodMonth,
      revenue,
    }))
})

const revenueSeriesMax = computed(() => {
  return revenueSeries.value.reduce((maximum, point) => Math.max(maximum, point.revenue), 0)
})

const totalRoyaltyRevenue = computed(() => {
  return filteredEarningsRows.value.reduce((sum, row) => sum + parseMoney(row.revenue), 0)
})

const totalPublishingRevenue = computed(() => {
  return filteredPublishingRows.value.reduce((sum, row) => sum + parseMoney(row.amount), 0)
})

const channelBreakdown = computed<BreakdownRow[]>(() => {
  const byChannel = new Map<string, { label: string; revenue: number }>()

  for (const row of filteredEarningsRows.value) {
    const key = row.channelId || EMPTY_FILTER_VALUE
    const label = row.channelId ? row.channelName : "Unassigned channel"
    const existing = byChannel.get(key) ?? { label, revenue: 0 }
    existing.revenue += parseMoney(row.revenue)
    byChannel.set(key, existing)
  }

  const total = totalRoyaltyRevenue.value || 1

  return [...byChannel.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      revenue: value.revenue,
      share: (value.revenue / total) * 100,
    }))
    .sort((left, right) => right.revenue - left.revenue)
})

const territoryBreakdown = computed<BreakdownRow[]>(() => {
  const byTerritory = new Map<string, { label: string; revenue: number }>()

  for (const row of filteredEarningsRows.value) {
    const key = row.territory || EMPTY_FILTER_VALUE
    const label = row.territory || "Unknown territory"
    const existing = byTerritory.get(key) ?? { label, revenue: 0 }
    existing.revenue += parseMoney(row.revenue)
    byTerritory.set(key, existing)
  }

  const total = totalRoyaltyRevenue.value || 1

  return [...byTerritory.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      revenue: value.revenue,
      share: (value.revenue / total) * 100,
    }))
    .sort((left, right) => right.revenue - left.revenue)
})

const releaseBreakdown = computed<ReleasePerformanceRow[]>(() => {
  const byRelease = new Map<
    string,
    {
      label: string
      revenue: number
      territories: Set<string>
      channels: Set<string>
      tracks: Set<string>
    }
  >()

  for (const row of filteredEarningsRows.value) {
    const key = row.releaseId || EMPTY_FILTER_VALUE
    const label = row.releaseId
      ? optionLabel(row.releaseTitle, "Catalog item unavailable")
      : "No linked release"
    const existing = byRelease.get(key) ?? {
      label,
      revenue: 0,
      territories: new Set<string>(),
      channels: new Set<string>(),
      tracks: new Set<string>(),
    }

    existing.revenue += parseMoney(row.revenue)

    if (row.territory) {
      existing.territories.add(row.territory)
    }

    if (row.channelId) {
      existing.channels.add(row.channelId)
    }

    if (row.trackId) {
      existing.tracks.add(row.trackId)
    }

    byRelease.set(key, existing)
  }

  return [...byRelease.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      revenue: value.revenue,
      territoryCount: value.territories.size,
      channelCount: value.channels.size,
      trackCount: value.tracks.size,
    }))
    .sort((left, right) => right.revenue - left.revenue)
})

const audienceCards = computed<AudienceCard[]>(() => {
  const grouped = new Map<string, { label: string; points: Array<{ periodMonth: string; value: number }> }>()

  for (const row of filteredAudienceSnapshots.value) {
    const existing = grouped.get(row.label) ?? { label: row.label, points: [] }
    existing.points.push({
      periodMonth: row.periodMonth,
      value: row.value,
    })
    grouped.set(row.label, existing)
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const points = [...group.points].sort((left, right) => left.periodMonth.localeCompare(right.periodMonth))
      const latest = points.at(-1) ?? null
      const previous = points.at(-2) ?? null

      return {
        key,
        label: group.label,
        latestValue: latest?.value ?? null,
        latestPeriodMonth: latest?.periodMonth ?? null,
        previousValue: previous?.value ?? null,
        delta: latest && previous ? latest.value - previous.value : null,
        points,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label))
})

const audienceSnapshotRows = computed(() => {
  const byMonth = new Map<string, Record<string, number>>()

  for (const row of filteredAudienceSnapshots.value) {
    const existing = byMonth.get(row.periodMonth) ?? {}
    existing[row.label] = row.value
    byMonth.set(row.periodMonth, existing)
  }

  return [...byMonth.entries()]
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([periodMonth, values]) => ({
      periodMonth,
      values,
    }))
})

const bestMonth = computed(() => {
  return revenueSeries.value.reduce<RevenuePoint | null>((best, point) => {
    if (!best || point.revenue > best.revenue) {
      return point
    }

    return best
  }, null)
})

const topChannel = computed(() => channelBreakdown.value[0] ?? null)
const topTerritory = computed(() => territoryBreakdown.value[0] ?? null)
const topRelease = computed(() => releaseBreakdown.value[0] ?? null)

const analyticsMetrics = computed(() => [
  {
    label: "Royalty revenue",
    value: formatMoney(totalRoyaltyRevenue.value),
    footnote: "Live from posted earnings after your current filters.",
    tone: "accent" as const,
  },
  {
    label: "Publishing credits",
    value: formatMoney(totalPublishingRevenue.value),
    footnote: "Period-scoped only. Publishing is not channel or catalog filtered here.",
    tone: "alt" as const,
  },
  {
    label: "Best month",
    value: bestMonth.value ? formatMoney(bestMonth.value.revenue) : "$0.00",
    footnote: bestMonth.value ? formatMonth(bestMonth.value.periodMonth) : "No earnings posted yet.",
    tone: "default" as const,
  },
  {
    label: "Top channel",
    value: topChannel.value?.label || "No channel data",
    footnote: topChannel.value ? `${formatShare(topChannel.value.share)} of visible royalty revenue.` : "No earnings posted yet.",
    tone: "default" as const,
  },
  {
    label: "Top territory",
    value: topTerritory.value?.label || "No territory data",
    footnote: topTerritory.value ? `${formatShare(topTerritory.value.share)} of visible royalty revenue.` : "No earnings posted yet.",
    tone: "default" as const,
  },
  {
    label: "Top release",
    value: topRelease.value?.label || "No release data",
    footnote: topRelease.value ? formatMoney(topRelease.value.revenue) : "No earnings posted yet.",
    tone: "default" as const,
  },
])

function resetFilters() {
  filters.periodMonth = ALL_FILTER_VALUE
  filters.channelId = ALL_FILTER_VALUE
  filters.territory = ALL_FILTER_VALUE
  filters.releaseId = ALL_FILTER_VALUE
  filters.trackId = ALL_FILTER_VALUE
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Analytics"
      eyebrow="Artist view"
      description="This workspace reads from live posted earnings and the audience snapshots entered during ingestion. Every chart is paired with a numeric drilldown table."
    >
      <div v-if="error" class="form-grid">
        <div class="banner error">{{ error.statusMessage || "Unable to load analytics right now." }}</div>
        <div class="button-row">
          <button class="button button-secondary" @click="() => refresh()">Retry</button>
        </div>
      </div>

      <div v-else-if="pending" class="status-message">Loading analytics...</div>

      <template v-else>
        <div class="metrics">
          <MetricCard
            v-for="metric in analyticsMetrics"
            :key="metric.label"
            :label="metric.label"
            :value="metric.value"
            :footnote="metric.footnote"
            :tone="metric.tone"
          />
        </div>

        <div v-if="!earningsRows.length && !audienceSnapshots.length && !publishingRows.length" class="muted-copy">
          No analytics exist yet. Once admin commits earnings and audience snapshots, your financial and platform trends will appear here.
        </div>

        <template v-else>
          <SectionCard
            title="Filters"
            eyebrow="Drilldown"
            description="Filter royalty analytics by month, channel, territory, release, and track. Audience snapshots remain artist-level monthly signals."
          >
            <div class="catalog-grid catalog-grid-wide">
              <div class="field-row">
                <label for="analytics-period">Period</label>
                <select id="analytics-period" v-model="filters.periodMonth" class="input">
                  <option v-for="option in periodOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div class="field-row">
                <label for="analytics-channel">Channel</label>
                <select id="analytics-channel" v-model="filters.channelId" class="input">
                  <option v-for="option in channelOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div class="field-row">
                <label for="analytics-territory">Territory</label>
                <select id="analytics-territory" v-model="filters.territory" class="input">
                  <option v-for="option in territoryOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div class="field-row">
                <label for="analytics-release">Release</label>
                <select id="analytics-release" v-model="filters.releaseId" class="input">
                  <option v-for="option in releaseOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>

              <div class="field-row">
                <label for="analytics-track">Track</label>
                <select id="analytics-track" v-model="filters.trackId" class="input">
                  <option v-for="option in trackOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </div>
            </div>

            <div class="button-row">
              <button class="button button-secondary" @click="resetFilters">Reset filters</button>
            </div>
          </SectionCard>

          <div class="panel-grid analytics-grid">
            <SectionCard
              title="Revenue over time"
              eyebrow="Trend"
              description="Royalty earnings are plotted by posted statement month after your current filters are applied."
            >
              <div v-if="revenueSeries.length" class="chart-list">
                <div v-for="point in revenueSeries" :key="point.periodMonth" class="chart-row">
                  <div class="chart-meta">
                    <strong>{{ formatShortMonth(point.periodMonth) }}</strong>
                    <span class="detail-copy">{{ formatMoney(point.revenue) }}</span>
                  </div>
                  <div class="chart-bar">
                    <div class="chart-fill" :style="{ width: barWidth(point.revenue, revenueSeriesMax) }" />
                  </div>
                </div>
              </div>

              <p v-else class="muted-copy">
                No royalty earnings match the current filters.
              </p>
            </SectionCard>

            <SectionCard
              title="Channel mix"
              eyebrow="Platform breakdown"
              description="This compares visible royalty revenue across the channels present in your posted earnings."
            >
              <div v-if="channelBreakdown.length" class="chart-list">
                <div v-for="channel in channelBreakdown" :key="channel.key" class="chart-row">
                  <div class="chart-meta">
                    <strong>{{ channel.label }}</strong>
                    <span class="detail-copy">{{ formatMoney(channel.revenue) }} / {{ formatShare(channel.share) }}</span>
                  </div>
                  <div class="chart-bar">
                    <div class="chart-fill chart-fill-secondary" :style="{ width: barWidth(channel.revenue, totalRoyaltyRevenue || 0) }" />
                  </div>
                </div>
              </div>

              <p v-else class="muted-copy">
                No channel revenue matches the current filters.
              </p>
            </SectionCard>
          </div>

          <div class="panel-grid analytics-grid">
            <SectionCard
              title="Territory breakdown"
              eyebrow="Country view"
              description="Every territory total below reconciles back to the visible royalty revenue after your current filters."
            >
              <div v-if="territoryBreakdown.length" class="summary-table">
                <div v-for="territory in territoryBreakdown" :key="territory.key" class="summary-row">
                  <div class="summary-copy">
                    <strong>{{ territory.label }}</strong>
                    <span class="detail-copy">{{ formatShare(territory.share) }} of visible royalty revenue</span>
                  </div>
                  <strong>{{ formatMoney(territory.revenue) }}</strong>
                </div>
              </div>

              <p v-else class="muted-copy">
                No territory revenue matches the current filters.
              </p>
            </SectionCard>

            <SectionCard
              title="Release performance"
              eyebrow="Catalog drilldown"
              description="Release totals stay revenue-safe while still letting you reconcile what part of the catalog is driving results."
            >
              <div v-if="releaseBreakdown.length" class="summary-table">
                <div v-for="release in releaseBreakdown.slice(0, 8)" :key="release.key" class="summary-row">
                  <div class="summary-copy">
                    <strong>{{ release.label }}</strong>
                    <span class="detail-copy">
                      {{ release.trackCount }} track{{ release.trackCount === 1 ? "" : "s" }}
                      / {{ release.channelCount }} channel{{ release.channelCount === 1 ? "" : "s" }}
                      / {{ release.territoryCount }} territor{{ release.territoryCount === 1 ? "y" : "ies" }}
                    </span>
                  </div>
                  <strong>{{ formatMoney(release.revenue) }}</strong>
                </div>
              </div>

              <p v-else class="muted-copy">
                No release revenue matches the current filters.
              </p>
            </SectionCard>
          </div>

          <SectionCard
            title="Audience snapshots"
            eyebrow="Manual signals"
            description="These monthly audience signals are entered by admin during ingestion. They stay artist-level in this slice and are only period-filtered."
          >
            <div v-if="audienceCards.length" class="metrics">
              <MetricCard
                v-for="card in audienceCards"
                :key="card.key"
                :label="card.label"
                :value="card.latestValue === null ? 'No data' : formatCount(card.latestValue)"
                :footnote="card.latestPeriodMonth ? `${formatMonth(card.latestPeriodMonth)} / ${formatDelta(card.delta)}` : 'No snapshot posted yet.'"
                tone="default"
              />
            </div>

            <div v-if="audienceCards.length" class="panel-grid analytics-grid">
              <SectionCard
                title="Snapshot trends"
                eyebrow="Signal history"
                description="The latest available month is shown on the right of each series."
              >
                <div class="chart-list">
                  <div v-for="card in audienceCards" :key="`${card.key}-trend`" class="chart-card">
                    <div class="summary-copy">
                      <strong>{{ card.label }}</strong>
                      <span class="detail-copy">
                        {{ card.latestPeriodMonth ? `${formatMonth(card.latestPeriodMonth)} / ${formatCount(card.latestValue)}` : "No data yet" }}
                      </span>
                    </div>

                    <div v-if="card.points.length" class="sparkline-row">
                      <div
                        v-for="point in card.points"
                        :key="`${card.key}-${point.periodMonth}`"
                        class="sparkline-bar"
                        :title="`${formatMonth(point.periodMonth)}: ${formatCount(point.value)}`"
                      >
                        <div
                          class="sparkline-fill"
                          :style="{ height: barWidth(point.value, Math.max(...card.points.map((entry) => entry.value), 0)) }"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Monthly snapshot table"
                eyebrow="Drilldown"
                description="Every month below shows the manual audience metrics that were posted alongside earnings ingestion."
              >
                <div v-if="audienceSnapshotRows.length" class="catalog-list">
                  <article v-for="row in audienceSnapshotRows" :key="row.periodMonth" class="catalog-item">
                    <div class="catalog-header">
                      <div class="summary-copy">
                        <strong>{{ formatMonth(row.periodMonth) }}</strong>
                        <span class="detail-copy">Artist-level audience metrics</span>
                      </div>
                    </div>

                    <div class="summary-table">
                      <div v-for="card in audienceCards" :key="`${row.periodMonth}-${card.key}`" class="summary-row">
                        <span class="detail-copy">{{ card.label }}</span>
                        <strong>{{ row.values[card.label] === undefined ? "Not entered" : formatCount(row.values[card.label]) }}</strong>
                      </div>
                    </div>
                  </article>
                </div>

                <p v-else class="muted-copy">
                  No audience snapshots match the current period filter.
                </p>
              </SectionCard>
            </div>

            <p v-else class="muted-copy">
              No manual audience snapshots have been posted yet.
            </p>
          </SectionCard>
        </template>
      </template>
    </SectionCard>
  </div>
</template>

<style scoped>
.analytics-grid {
  align-items: start;
}

.chart-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.chart-row {
  display: grid;
  grid-template-columns: minmax(0, 14rem) minmax(0, 1fr);
  gap: 1rem;
  align-items: center;
}

.chart-meta {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.chart-bar {
  height: 0.85rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.chart-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(255, 152, 94, 0.85), rgba(255, 214, 140, 0.9));
}

.chart-fill-secondary {
  background: linear-gradient(90deg, rgba(128, 194, 255, 0.85), rgba(163, 226, 255, 0.9));
}

.chart-card {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.02);
}

.sparkline-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(1.25rem, 1fr));
  gap: 0.5rem;
  align-items: end;
  min-height: 5rem;
}

.sparkline-bar {
  display: flex;
  align-items: end;
  justify-content: center;
  min-height: 5rem;
  padding-bottom: 0.15rem;
}

.sparkline-fill {
  width: 100%;
  min-height: 0.4rem;
  border-radius: 999px 999px 0 0;
  background: linear-gradient(180deg, rgba(255, 173, 118, 0.95), rgba(255, 118, 81, 0.85));
}

@media (max-width: 960px) {
  .chart-row {
    grid-template-columns: 1fr;
  }
}
</style>
