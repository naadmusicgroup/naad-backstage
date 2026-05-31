<script setup lang="ts">
import { countryNameFor } from "~~/app/utils/country-flags"
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
    footnote: "Current ledger view",
    tone: "accent" as const,
  },
  {
    label: "Units",
    value: summary.value.totalUnits.toLocaleString(),
    footnote: "Plays + impressions or sale units",
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

const ledgerColumns = [
  { key: "track", label: "Track", accessor: (row: any) => row.trackTitle },
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "period", label: "Period", accessor: (row: any) => row.periodMonth },
  { key: "channel", label: "Channel", accessor: (row: any) => row.channelName },
  { key: "territory", label: "Country", accessor: (row: any) => countryNameFor(row.territory, "Unspecified") },
  { key: "units", label: "Units", align: "right" as const, accessor: (row: any) => row.units },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.totalAmount || 0) },
  { key: "type", label: "Type", accessor: (row: any) => row.earningType },
]

const paginationSummary = computed(() => {
  const totalCount = pagination.value.totalCount

  if (!totalCount) {
    return "No earnings entries found"
  }

  const from = (pagination.value.page - 1) * pagination.value.pageSize + 1
  const to = Math.min(pagination.value.page * pagination.value.pageSize, totalCount)
  return `Showing ${from.toLocaleString()}-${to.toLocaleString()} of ${totalCount.toLocaleString()} entries`
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

function earningTypeTone(value: string) {
  switch (value) {
    case "original":
      return "success"
    case "adjustment":
      return "warning"
    case "reversal":
      return "info"
    default:
      return "warning"
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
</script>

<template>
  <div class="page">
    <PageHeader
      title="Earnings ledger"
      eyebrow="Earnings (All)"
      description="A complete admin view of imported earnings across artists, releases, tracks, channels, territories, periods, and earning types."
    />

    <div class="metrics">
      <StatCard
        v-for="metric in summaryMetrics"
        :key="metric.label"
        :label="metric.label"
        :value="metric.value"
        :footnote="metric.footnote"
        :tone="metric.tone"
      />
    </div>

    <AppAlert v-if="error" variant="destructive">
      {{ error.statusMessage || "Unable to load the earnings ledger right now." }}
    </AppAlert>

    <DataPanel
      title="Ledger filters"
      eyebrow="Search"
      description="Use filters together to audit a period, one artist, a release, a DSP/channel, or a specific earnings type."
    >
      <div class="earnings-filter-grid">
        <div class="field-row">
          <label for="earnings-artist">Artist</label>
          <NativeSelect id="earnings-artist" v-model="filters.artistId">
            <option :value="ALL_FILTER">All artists</option>
            <option v-for="option in filterOptions.artists" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="earnings-release">Release</label>
          <NativeSelect id="earnings-release" v-model="filters.releaseId">
            <option :value="ALL_FILTER">All releases</option>
            <option v-for="option in releaseOptions" :key="option.value" :value="option.value">
              {{ optionLabel(option) }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="earnings-track">Track</label>
          <NativeSelect id="earnings-track" v-model="filters.trackId">
            <option :value="ALL_FILTER">All tracks</option>
            <option v-for="option in trackOptions" :key="option.value" :value="option.value">
              {{ optionLabel(option) }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="earnings-channel">Channel</label>
          <NativeSelect id="earnings-channel" v-model="filters.channelId">
            <option :value="ALL_FILTER">All channels</option>
            <NativeSelectOption
              v-for="option in filterOptions.channels"
              :key="option.value"
              :value="option.value"
              :visual="{
                kind: 'dsp',
                logoKey: option.logoKey,
                name: option.label,
                label: option.label,
              }"
            >
              {{ option.label }}
            </NativeSelectOption>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="earnings-territory">Territory</label>
          <NativeSelect id="earnings-territory" v-model="filters.territory">
            <option :value="ALL_FILTER">All territories</option>
            <NativeSelectOption
              v-for="option in filterOptions.territories"
              :key="option.value"
              :value="option.value"
              :visual="{
                kind: 'country',
                code: option.value,
                label: countryNameFor(option.value, option.label),
              }"
            >
              {{ countryNameFor(option.value, option.label) }}
            </NativeSelectOption>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="earnings-period">Period</label>
          <NativeSelect id="earnings-period" v-model="filters.periodMonth">
            <option :value="ALL_FILTER">All periods</option>
            <option v-for="option in filterOptions.periodMonths" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="earnings-type">Type</label>
          <NativeSelect id="earnings-type" v-model="filters.earningType">
            <option :value="ALL_FILTER">All earning types</option>
            <option v-for="option in filterOptions.earningTypes" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="earnings-page-size">Entries per page</label>
          <NativeSelect id="earnings-page-size" v-model="pageSize">
            <option v-for="option in PAGE_SIZE_OPTIONS" :key="option" :value="option">
              {{ option }}
            </option>
          </NativeSelect>
        </div>
      </div>

      <div class="earnings-filter-actions">
        <span class="detail-copy">{{ paginationSummary }}</span>
        <div class="flex flex-wrap gap-2">
          <Button variant="secondary" type="button" :disabled="pending" @click="resetFilters">
            Reset filters
          </Button>
          <Button type="button" :disabled="pending" @click="refreshLedger">
            {{ pending ? "Refreshing..." : "Refresh ledger" }}
          </Button>
        </div>
      </div>
    </DataPanel>

    <DataPanel
      title="Ledger entries"
      eyebrow="Audit trail"
      :description="pending && data ? 'Refreshing entries with the selected filters.' : paginationSummary"
    >
      <DashboardSkeleton v-if="pending && !data" :rows="8" table />
      <DataTable
        v-else
        :columns="ledgerColumns"
        :data="rows"
        empty-title="No earnings entries"
        empty-description="No earnings entries match these filters yet."
        row-key="id"
        :row-class="() => 'ledger-table-row'"
      >
        <template #cell-track="{ row }">
          <div class="ledger-primary-cell">
            <strong>{{ row.trackTitle }}</strong>
            <span>{{ row.releaseTitle }}</span>
            <span>{{ formatDate(row.saleDate) }} / {{ formatDate(row.accountingDate) }}</span>
          </div>
        </template>
        <template #cell-artist="{ row }">{{ row.artistName }}</template>
        <template #cell-period="{ row }">{{ formatPeriodMonth(row.periodMonth) }}</template>
        <template #cell-channel="{ row }">
          <DspLogo :logo-key="row.logoKey" :name="row.channelName" :label="row.channelName" size="sm" />
        </template>
        <template #cell-territory="{ row }">
          <CountryFlag :code="row.territory" :label="row.territory || 'Unspecified'" show-label class="admin-country-cell" />
        </template>
        <template #cell-units="{ row }">
          <span class="tabular-nums">{{ row.units.toLocaleString() }}</span>
        </template>
        <template #cell-amount="{ row }">
          <MoneyValue :value="row.totalAmount" size="sm" />
          <div class="ledger-secondary-money">{{ row.originalCurrency || "USD" }} / {{ formatDate(row.reportingDate) }}</div>
        </template>
        <template #cell-type="{ row }">
          <StatusBadge :tone="earningTypeTone(row.earningType)">
            {{ formatEarningType(row.earningType) }}
          </StatusBadge>
        </template>
      </DataTable>

      <AppPagination
        v-if="pagination.totalCount"
        :page="pagination.page"
        :page-size="pagination.pageSize"
        :total-count="pagination.totalCount"
        :total-pages="pagination.totalPages"
        :pending="pending"
        :summary="paginationSummary"
        aria-label="Earnings ledger pagination"
        class="mt-5"
        @update:page="page = $event"
      />
    </DataPanel>
  </div>
</template>

<style scoped>
.earnings-filter-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.earnings-filter-actions,
.earnings-row-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.earnings-filter-actions {
  margin-top: 18px;
  flex-wrap: wrap;
}

.earnings-row-total {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ledger-table-row {
  color: var(--muted-foreground);
}

.ledger-table-row strong {
  color: var(--foreground);
}

.ledger-primary-cell {
  display: grid;
  gap: 3px;
  min-width: 220px;
}

.ledger-primary-cell span,
.ledger-secondary-money {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.5;
}

.admin-country-cell {
  max-width: 180px;
}

.ledger-mobile-row {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-bottom: 1px solid var(--border);
}

.ledger-mobile-row:last-child {
  border-bottom: 0;
}

@media (max-width: 720px) {
  .earnings-filter-actions,
  .earnings-row-total {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
