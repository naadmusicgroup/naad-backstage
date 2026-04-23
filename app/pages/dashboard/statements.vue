<script setup lang="ts">
import type {
  ArtistStatementEarningsBreakdownRow,
  ArtistStatementPublishingBreakdownRow,
  ArtistStatementsResponse,
} from "~~/types/dashboard"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

const ALL_FILTER = "all"

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const { activeArtistId } = useActiveArtist()

const filters = reactive({
  periodMonth: ALL_FILTER,
  releaseId: ALL_FILTER,
  territory: ALL_FILTER,
  channelId: ALL_FILTER,
})

const emptyResponse = computed<ArtistStatementsResponse>(() => ({
  statements: [],
  earningsBreakdownRows: [],
  publishingBreakdownRows: [],
  filterOptions: {
    periodMonths: [],
    releases: [],
    territories: [],
    channels: [],
  },
}))

const { data, error, pending, refresh } = useLazyFetch<ArtistStatementsResponse>(
  "/api/dashboard/statements",
  {
    query: computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined)),
  },
)

const response = computed(() => data.value ?? emptyResponse.value)
const statements = computed(() => response.value.statements)
const earningsBreakdownRows = computed(() => response.value.earningsBreakdownRows)
const publishingBreakdownRows = computed(() => response.value.publishingBreakdownRows)
const filterOptions = computed(() => response.value.filterOptions)

const filteredStatements = computed(() => {
  if (filters.periodMonth === ALL_FILTER) {
    return statements.value
  }

  return statements.value.filter((statement) => statement.periodMonth === filters.periodMonth)
})

const filteredEarningsRows = computed(() => {
  return earningsBreakdownRows.value.filter((row) => {
    return (
      matchesFilter(row.periodMonth, filters.periodMonth) &&
      matchesFilter(row.releaseId, filters.releaseId) &&
      matchesFilter(row.territory, filters.territory) &&
      matchesFilter(row.channelId, filters.channelId)
    )
  })
})

const filteredPublishingRows = computed(() => {
  if (filters.territory !== ALL_FILTER || filters.channelId !== ALL_FILTER) {
    return []
  }

  return publishingBreakdownRows.value.filter((row) => {
    return (
      matchesFilter(row.periodMonth, filters.periodMonth) &&
      matchesFilter(row.releaseId, filters.releaseId)
    )
  })
})

const filteredEarningsTotal = computed(() => {
  return filteredEarningsRows.value.reduce((sum, row) => sum + parseMoney(row.earnings), 0)
})
const filteredPublishingTotal = computed(() => {
  return filteredPublishingRows.value.reduce((sum, row) => sum + parseMoney(row.amount), 0)
})
const filteredUnitsTotal = computed(() => {
  return filteredEarningsRows.value.reduce((sum, row) => sum + row.units, 0)
})
const filteredStatementRowCount = computed(() => {
  return filteredEarningsRows.value.reduce((sum, row) => sum + row.rowCount, 0)
})

const activeFilterCount = computed(() => {
  return Object.values(filters).filter((value) => value !== ALL_FILTER).length
})

const summaryMetrics = computed(() => [
  {
    label: "Filtered earnings",
    value: formatMoneyNumber(filteredEarningsTotal.value),
    footnote: `${filteredStatementRowCount.value.toLocaleString()} processed rows`,
    tone: "accent" as const,
  },
  {
    label: "Publishing",
    value: formatMoneyNumber(filteredPublishingTotal.value),
    footnote: filters.territory !== ALL_FILTER || filters.channelId !== ALL_FILTER
      ? "Hidden by country/channel filter"
      : "Manual publishing credits",
    tone: "default" as const,
  },
  {
    label: "Units",
    value: filteredUnitsTotal.value.toLocaleString(),
    footnote: "Streams or sale units after filters",
    tone: "default" as const,
  },
  {
    label: "Total selected",
    value: formatMoneyNumber(filteredEarningsTotal.value + filteredPublishingTotal.value),
    footnote: activeFilterCount.value ? `${activeFilterCount.value} active filter${activeFilterCount.value === 1 ? "" : "s"}` : "All statement detail",
    tone: "alt" as const,
  },
])

function matchesFilter(value: string | null, filterValue: string) {
  return filterValue === ALL_FILTER || value === filterValue
}

function parseMoney(value: string) {
  return Number(value || 0)
}

function formatMoney(value: string) {
  return formatMoneyNumber(Number(value || 0))
}

function formatMoneyNumber(value: number) {
  return `$${value.toFixed(2)}`
}

function formatPeriodMonth(value: string) {
  return monthFormatter.format(new Date(value))
}

function formatIsoDate(value: string | null) {
  if (!value) {
    return "Not closed"
  }

  return compactDateFormatter.format(new Date(value))
}

function releaseLabel(row: ArtistStatementEarningsBreakdownRow | ArtistStatementPublishingBreakdownRow) {
  return row.releaseTitle || "Catalog-level credit"
}

function trackLabel(row: ArtistStatementEarningsBreakdownRow) {
  if (!row.trackTitle) {
    return "Track not assigned"
  }

  return row.trackIsrc ? `${row.trackTitle} (${row.trackIsrc})` : row.trackTitle
}

function resetFilters() {
  filters.periodMonth = ALL_FILTER
  filters.releaseId = ALL_FILTER
  filters.territory = ALL_FILTER
  filters.channelId = ALL_FILTER
}

async function refreshStatements() {
  await refresh()
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Monthly statements"
      eyebrow="Artist view"
      description="Review statement months, then drill into processed earnings by month, release, platform, and country."
    >
      <div class="button-row">
        <NuxtLink to="/dashboard/settings" class="button button-secondary">Add or review bank details</NuxtLink>
      </div>

      <div v-if="error" class="banner error">
        {{ error.statusMessage || "Unable to load statements right now." }}
        <div class="button-row">
          <button class="button button-secondary" type="button" @click="refreshStatements">Retry</button>
        </div>
      </div>

      <div v-else-if="pending && !data" class="status-message">Loading statements...</div>

      <div v-else-if="!statements.length" class="muted-copy">
        No statement months exist yet. Once an earnings upload is committed, each month will appear here.
      </div>

      <div v-else class="stack">
        <div class="metrics">
          <MetricCard
            v-for="metric in summaryMetrics"
            :key="metric.label"
            :label="metric.label"
            :value="metric.value"
            :footnote="metric.footnote"
            :tone="metric.tone"
          />
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Statement filters"
      eyebrow="Drilldown"
      description="Filter the processed statement detail without exposing CSV files, filenames, or import row numbers."
    >
      <div class="statement-filter-grid">
        <div class="field-row">
          <label for="statement-period">Month</label>
          <select id="statement-period" v-model="filters.periodMonth" class="input">
            <option :value="ALL_FILTER">All months</option>
            <option v-for="option in filterOptions.periodMonths" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="statement-release">Release</label>
          <select id="statement-release" v-model="filters.releaseId" class="input">
            <option :value="ALL_FILTER">All releases</option>
            <option v-for="option in filterOptions.releases" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="statement-territory">Country</label>
          <select id="statement-territory" v-model="filters.territory" class="input">
            <option :value="ALL_FILTER">All countries</option>
            <option v-for="option in filterOptions.territories" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="statement-channel">Platform</label>
          <select id="statement-channel" v-model="filters.channelId" class="input">
            <option :value="ALL_FILTER">All platforms</option>
            <option v-for="option in filterOptions.channels" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="statement-filter-actions">
        <span class="detail-copy">
          {{ activeFilterCount ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}` : "Showing all statement detail" }}
        </span>
        <div class="button-row">
          <button class="button button-secondary" type="button" @click="resetFilters">Reset filters</button>
          <button class="button" type="button" :disabled="pending" @click="refreshStatements">
            {{ pending ? "Refreshing..." : "Refresh statements" }}
          </button>
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Statement months"
      eyebrow="Summary"
      description="Monthly totals remain available, with status and close date for each statement period."
    >
      <div v-if="!filteredStatements.length" class="muted-copy">
        No statement months match the selected month filter.
      </div>

      <div v-else class="catalog-list">
        <article v-for="statement in filteredStatements" :key="statement.periodMonth" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ formatPeriodMonth(statement.periodMonth) }}</strong>
              <span class="detail-copy">Closed at: {{ formatIsoDate(statement.closedAt) }}</span>
            </div>
            <span class="status-pill" :class="statement.status === 'closed' ? 'status-closed' : 'status-open'">
              {{ statement.status === "closed" ? "Closed" : "Open" }}
            </span>
          </div>

          <div class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Earnings</span>
              <strong>{{ formatMoney(statement.earnings) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Publishing</span>
              <strong>{{ formatMoney(statement.publishing) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Processed rows</span>
              <strong>{{ statement.rowCount.toLocaleString() }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Channels / countries / releases</span>
              <strong>{{ statement.channelCount }} / {{ statement.territoryCount }} / {{ statement.releaseCount }}</strong>
            </div>
          </div>
        </article>
      </div>
    </SectionCard>

    <SectionCard
      title="Earnings breakdown"
      eyebrow="Processed detail"
      description="Grouped by release, track, platform, country, and statement month."
    >
      <div v-if="!filteredEarningsRows.length" class="muted-copy">
        No earnings detail matches the current filters.
      </div>

      <div v-else class="catalog-list">
        <article v-for="row in filteredEarningsRows" :key="row.id" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ releaseLabel(row) }}</strong>
              <span class="detail-copy">{{ trackLabel(row) }}</span>
            </div>
            <strong>{{ formatMoney(row.earnings) }}</strong>
          </div>

          <div class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Month</span>
              <strong>{{ formatPeriodMonth(row.periodMonth) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Platform</span>
              <strong>{{ row.channelName }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Country</span>
              <strong>{{ row.territory || "Unknown country" }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Units / processed rows</span>
              <strong>{{ row.units.toLocaleString() }} / {{ row.rowCount.toLocaleString() }}</strong>
            </div>
          </div>
        </article>
      </div>
    </SectionCard>

    <SectionCard
      title="Publishing credits"
      eyebrow="Manual credits"
      description="Publishing is shown as lump-sum credits because it does not have platform or country detail."
    >
      <div v-if="filters.territory !== ALL_FILTER || filters.channelId !== ALL_FILTER" class="muted-copy">
        Publishing credits are hidden while a country or platform filter is active.
      </div>
      <div v-else-if="!filteredPublishingRows.length" class="muted-copy">
        No publishing credits match the current filters.
      </div>

      <div v-else class="catalog-list">
        <article v-for="row in filteredPublishingRows" :key="row.id" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ releaseLabel(row) }}</strong>
              <span class="detail-copy">{{ formatPeriodMonth(row.periodMonth) }}</span>
            </div>
            <strong>{{ formatMoney(row.amount) }}</strong>
          </div>

          <p v-if="row.notes" class="detail-copy">{{ row.notes }}</p>
        </article>
      </div>
    </SectionCard>
  </div>
</template>

<style scoped>
.statement-filter-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.statement-filter-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 18px;
}
</style>
