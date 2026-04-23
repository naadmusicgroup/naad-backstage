<script setup lang="ts">
import type { AdminEarningsLedgerFilterOption, AdminEarningsLedgerResponse } from "~~/types/admin"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const ALL_FILTER = "all"
const PAGE_SIZE_OPTIONS = [25, 50, 100]

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const filters = reactive({
  artistId: ALL_FILTER,
  releaseId: ALL_FILTER,
  trackId: ALL_FILTER,
  channelId: ALL_FILTER,
  territory: ALL_FILTER,
  periodMonth: ALL_FILTER,
  earningType: ALL_FILTER,
})
const page = ref(1)
const pageSize = ref(25)

const query = computed(() => ({
  page: page.value,
  pageSize: pageSize.value,
  ...(filters.artistId !== ALL_FILTER ? { artistId: filters.artistId } : {}),
  ...(filters.releaseId !== ALL_FILTER ? { releaseId: filters.releaseId } : {}),
  ...(filters.trackId !== ALL_FILTER ? { trackId: filters.trackId } : {}),
  ...(filters.channelId !== ALL_FILTER ? { channelId: filters.channelId } : {}),
  ...(filters.territory !== ALL_FILTER ? { territory: filters.territory } : {}),
  ...(filters.periodMonth !== ALL_FILTER ? { periodMonth: filters.periodMonth } : {}),
  ...(filters.earningType !== ALL_FILTER ? { earningType: filters.earningType } : {}),
}))

const { data, pending, error, refresh } = useLazyFetch<AdminEarningsLedgerResponse>("/api/admin/earnings", {
  query,
})

const emptyResponse = computed<AdminEarningsLedgerResponse>(() => ({
  rows: [],
  summary: {
    rowCount: 0,
    totalRevenue: "0.00000000",
    totalUnits: 0,
    artistCount: 0,
    releaseCount: 0,
    trackCount: 0,
    channelCount: 0,
    territoryCount: 0,
  },
  filterOptions: {
    artists: [],
    releases: [],
    tracks: [],
    channels: [],
    territories: [],
    periodMonths: [],
    earningTypes: [],
  },
  pagination: {
    page: page.value,
    pageSize: pageSize.value,
    totalCount: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
}))

const response = computed(() => data.value ?? emptyResponse.value)
const rows = computed(() => response.value.rows)
const summary = computed(() => response.value.summary)
const filterOptions = computed(() => response.value.filterOptions)
const pagination = computed(() => response.value.pagination)

const releaseOptions = computed(() => {
  if (filters.artistId === ALL_FILTER) {
    return filterOptions.value.releases
  }

  return filterOptions.value.releases.filter((option) => option.meta === filters.artistId)
})

const trackOptions = computed(() => {
  if (filters.releaseId !== ALL_FILTER) {
    return filterOptions.value.tracks.filter((option) => option.meta === filters.releaseId)
  }

  if (filters.artistId !== ALL_FILTER) {
    const releaseIds = new Set(releaseOptions.value.map((option) => option.value))
    return filterOptions.value.tracks.filter((option) => option.meta && releaseIds.has(option.meta))
  }

  return filterOptions.value.tracks
})

const summaryMetrics = computed(() => [
  {
    label: "Filtered revenue",
    value: formatMoney(summary.value.totalRevenue),
    footnote: `${summary.value.rowCount.toLocaleString()} ledger rows`,
    tone: "accent" as const,
  },
  {
    label: "Units",
    value: summary.value.totalUnits.toLocaleString(),
    footnote: "Streams or sale units",
    tone: "default" as const,
  },
  {
    label: "Artists",
    value: summary.value.artistCount.toLocaleString(),
    footnote: `${summary.value.releaseCount.toLocaleString()} releases`,
    tone: "default" as const,
  },
  {
    label: "Channels",
    value: summary.value.channelCount.toLocaleString(),
    footnote: `${summary.value.territoryCount.toLocaleString()} territories`,
    tone: "alt" as const,
  },
])

const paginationSummary = computed(() => {
  const totalCount = pagination.value.totalCount

  if (!totalCount) {
    return "No earnings rows found"
  }

  const from = (pagination.value.page - 1) * pagination.value.pageSize + 1
  const to = Math.min(pagination.value.page * pagination.value.pageSize, totalCount)
  return `Showing ${from.toLocaleString()}-${to.toLocaleString()} of ${totalCount.toLocaleString()} rows`
})

watch(
  () => [
    filters.artistId,
    filters.releaseId,
    filters.trackId,
    filters.channelId,
    filters.territory,
    filters.periodMonth,
    filters.earningType,
    pageSize.value,
  ],
  () => {
    page.value = 1
  },
)

watch(
  () => data.value?.pagination?.page,
  (value) => {
    if (typeof value === "number" && value !== page.value) {
      page.value = value
    }
  },
)

watch(
  () => filters.artistId,
  () => {
    if (filters.releaseId !== ALL_FILTER && !releaseOptions.value.some((option) => option.value === filters.releaseId)) {
      filters.releaseId = ALL_FILTER
    }
  },
)

watch(
  () => [filters.artistId, filters.releaseId],
  () => {
    if (filters.trackId !== ALL_FILTER && !trackOptions.value.some((option) => option.value === filters.trackId)) {
      filters.trackId = ALL_FILTER
    }
  },
)

function formatMoney(value: string | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not set"
  }

  return dateFormatter.format(new Date(value))
}

function formatPeriodMonth(value: string | null) {
  if (!value) {
    return "Unknown period"
  }

  return monthFormatter.format(new Date(value))
}

function formatEarningType(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function optionLabel(option: AdminEarningsLedgerFilterOption) {
  return option.meta ? `${option.label}` : option.label
}

function statusClass(value: string) {
  switch (value) {
    case "original":
      return "status-completed"
    case "adjustment":
      return "status-processing"
    case "reversal":
      return "status-reversed"
    default:
      return "status-open"
  }
}

function resetFilters() {
  filters.artistId = ALL_FILTER
  filters.releaseId = ALL_FILTER
  filters.trackId = ALL_FILTER
  filters.channelId = ALL_FILTER
  filters.territory = ALL_FILTER
  filters.periodMonth = ALL_FILTER
  filters.earningType = ALL_FILTER
  page.value = 1
}

async function refreshLedger() {
  await refresh()
}

function goToPreviousPage() {
  if (pagination.value.hasPreviousPage) {
    page.value -= 1
  }
}

function goToNextPage() {
  if (pagination.value.hasNextPage) {
    page.value += 1
  }
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Earnings ledger"
      eyebrow="Earnings (All)"
      description="A complete admin view of imported earnings rows across artists, releases, tracks, channels, territories, periods, and earning types."
    >
      <div class="stack">
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

        <div v-if="error" class="banner error">
          {{ error.statusMessage || "Unable to load the earnings ledger right now." }}
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Ledger filters"
      eyebrow="Search"
      description="Use filters together to audit a period, one artist, a release, a DSP/channel, or a specific earnings type."
    >
      <div class="earnings-filter-grid">
        <div class="field-row">
          <label for="earnings-artist">Artist</label>
          <select id="earnings-artist" v-model="filters.artistId" class="input">
            <option :value="ALL_FILTER">All artists</option>
            <option v-for="option in filterOptions.artists" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="earnings-release">Release</label>
          <select id="earnings-release" v-model="filters.releaseId" class="input">
            <option :value="ALL_FILTER">All releases</option>
            <option v-for="option in releaseOptions" :key="option.value" :value="option.value">
              {{ optionLabel(option) }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="earnings-track">Track</label>
          <select id="earnings-track" v-model="filters.trackId" class="input">
            <option :value="ALL_FILTER">All tracks</option>
            <option v-for="option in trackOptions" :key="option.value" :value="option.value">
              {{ optionLabel(option) }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="earnings-channel">Channel</label>
          <select id="earnings-channel" v-model="filters.channelId" class="input">
            <option :value="ALL_FILTER">All channels</option>
            <option v-for="option in filterOptions.channels" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="earnings-territory">Territory</label>
          <select id="earnings-territory" v-model="filters.territory" class="input">
            <option :value="ALL_FILTER">All territories</option>
            <option v-for="option in filterOptions.territories" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="earnings-period">Period</label>
          <select id="earnings-period" v-model="filters.periodMonth" class="input">
            <option :value="ALL_FILTER">All periods</option>
            <option v-for="option in filterOptions.periodMonths" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="earnings-type">Type</label>
          <select id="earnings-type" v-model="filters.earningType" class="input">
            <option :value="ALL_FILTER">All earning types</option>
            <option v-for="option in filterOptions.earningTypes" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="earnings-page-size">Rows per page</label>
          <select id="earnings-page-size" v-model="pageSize" class="input">
            <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </div>
      </div>

      <div class="earnings-filter-actions">
        <span class="detail-copy">{{ paginationSummary }}</span>
        <div class="button-row">
          <button class="button button-secondary" type="button" :disabled="pending" @click="resetFilters">
            Reset filters
          </button>
          <button class="button" type="button" :disabled="pending" @click="refreshLedger">
            {{ pending ? "Refreshing..." : "Refresh ledger" }}
          </button>
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Ledger rows"
      eyebrow="Audit trail"
      :description="pending && data ? 'Refreshing rows with the selected filters.' : paginationSummary"
    >
      <div v-if="pending && !data" class="muted-copy">Loading earnings rows...</div>
      <div v-else-if="!rows.length" class="muted-copy">No earnings rows match these filters yet.</div>
      <div v-else class="catalog-list">
        <article v-for="row in rows" :key="row.id" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ row.trackTitle }}</strong>
              <span class="detail-copy">{{ row.releaseTitle }} - {{ row.artistName }}</span>
            </div>
            <div class="earnings-row-total">
              <strong>{{ formatMoney(row.totalAmount) }}</strong>
              <span class="status-pill" :class="statusClass(row.earningType)">
                {{ formatEarningType(row.earningType) }}
              </span>
            </div>
          </div>

          <div class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Period</span>
              <strong>{{ formatPeriodMonth(row.periodMonth) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Sale / accounting date</span>
              <strong>{{ formatDate(row.saleDate) }} / {{ formatDate(row.accountingDate) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Channel</span>
              <strong>{{ row.channelName }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Territory</span>
              <strong>{{ row.territory || "Unspecified" }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Units / unit price</span>
              <strong>{{ row.units.toLocaleString() }} / {{ formatMoney(row.unitPrice) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Upload</span>
              <strong>{{ row.uploadFilename || "Unknown upload" }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Currency / reporting date</span>
              <strong>{{ row.originalCurrency || "USD" }} / {{ formatDate(row.reportingDate) }}</strong>
            </div>
          </div>
        </article>
      </div>

      <div v-if="pagination.totalCount" class="earnings-pagination">
        <span class="detail-copy">Page {{ pagination.page }} of {{ pagination.totalPages }}</span>
        <div class="button-row">
          <button class="button button-secondary" type="button" :disabled="!pagination.hasPreviousPage || pending" @click="goToPreviousPage">
            Previous page
          </button>
          <button class="button button-secondary" type="button" :disabled="!pagination.hasNextPage || pending" @click="goToNextPage">
            Next page
          </button>
        </div>
      </div>
    </SectionCard>
  </div>
</template>

<style scoped>
.earnings-filter-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.earnings-filter-actions,
.earnings-pagination,
.earnings-row-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.earnings-filter-actions,
.earnings-pagination {
  margin-top: 18px;
  flex-wrap: wrap;
}

.earnings-row-total {
  flex-wrap: wrap;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .earnings-filter-actions,
  .earnings-pagination,
  .earnings-row-total {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
