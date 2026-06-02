<script setup lang="ts">
import { ChevronDown, RefreshCw, RotateCcw, Settings, SlidersHorizontal } from "lucide-vue-next"
import { countryNameFor } from "~~/app/utils/country-flags"
import type {
  ArtistStatementEarningsBreakdownRow,
  ArtistStatementEarningsResponse,
  ArtistStatementFilterOption,
  ArtistStatementPublishingBreakdownRow,
  ArtistStatementsResponse,
} from "~~/types/dashboard"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

const ALL_FILTER = "all"
const STATEMENT_EARNINGS_PAGE_SIZES = [10, 50, 100]

type StatementTab = "statements" | "earnings" | "publishing"

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

const activeTab = ref<StatementTab>("statements")
const mobileFiltersOpen = ref(false)
const filters = reactive({
  releaseId: ALL_FILTER,
  territory: ALL_FILTER,
  channelId: ALL_FILTER,
})
const earningsPage = ref(1)
const earningsPageSize = ref(10)
const earningsPageSizeModel = computed({
  get: () => String(earningsPageSize.value),
  set: (value: string) => {
    const parsed = Number(value)

    if (STATEMENT_EARNINGS_PAGE_SIZES.includes(parsed)) {
      earningsPageSize.value = parsed
    }
  },
})

const emptyResponse = computed<ArtistStatementsResponse>(() => ({
  defaultPeriodMonth: null,
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

const earningsQuery = computed(() => ({
  artistId: activeArtistId.value ?? "",
  page: earningsPage.value,
  pageSize: earningsPageSize.value,
  releaseId: filters.releaseId === ALL_FILTER ? "" : filters.releaseId,
  channelId: filters.channelId === ALL_FILTER ? "" : filters.channelId,
  territory: filters.territory === ALL_FILTER ? "" : filters.territory,
}))

const {
  data: earningsData,
  error: earningsError,
  pending: earningsPending,
  refresh: refreshEarnings,
} = useLazyFetch<ArtistStatementEarningsResponse>(
  "/api/dashboard/statements/earnings",
  {
    query: earningsQuery,
    watch: [earningsQuery],
  },
)

const response = computed(() => data.value ?? emptyResponse.value)
const statements = computed(() => response.value.statements)
const publishingBreakdownRows = computed(() => response.value.publishingBreakdownRows)
const filterOptions = computed(() => response.value.filterOptions)
const earningsRows = computed(() => earningsData.value?.rows ?? [])
const earningsPagination = computed(() => earningsData.value?.pagination ?? {
  page: 1,
  pageSize: earningsPageSize.value,
  totalCount: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
})
const earningsSummary = computed(() => earningsData.value?.summary ?? {
  totalRevenue: "0.00",
  totalUnits: 0,
  processedRowCount: 0,
  groupedRowCount: 0,
})
const dropdownReleases = computed(() => earningsData.value?.filterOptions?.releases ?? [])
const dropdownTerritories = computed(() => earningsData.value?.filterOptions?.territories ?? [])
const dropdownChannels = computed(() => earningsData.value?.filterOptions?.channels ?? [])
const selectedChannelOption = computed(() => dropdownChannels.value.find((option) => option.value === filters.channelId) ?? null)

const filteredStatements = computed(() => {
  return statements.value
})

const filteredPublishingRows = computed(() => {
  if (filters.territory !== ALL_FILTER || filters.channelId !== ALL_FILTER) {
    return []
  }

  return publishingBreakdownRows.value.filter((row) => {
    return (
      matchesFilter(row.releaseId, filters.releaseId)
    )
  })
})

const filteredEarningsTotal = computed(() => parseMoney(earningsSummary.value.totalRevenue))
const filteredPublishingTotal = computed(() => (
  filteredPublishingRows.value.reduce((sum, row) => sum + parseMoney(row.amount), 0)
))
const activeFilterCount = computed(() => [
  filters.releaseId,
  filters.territory,
  filters.channelId,
].filter((value) => value !== ALL_FILTER).length)
const filterSummary = computed(() => (
  activeFilterCount.value
    ? `${activeFilterCount.value} active filter${activeFilterCount.value === 1 ? "" : "s"}`
    : "No active filters"
))
const activeFilterChips = computed(() => [
  filters.releaseId !== ALL_FILTER
    ? filterLabel(dropdownReleases.value, filters.releaseId, "Selected release")
    : "",
  filters.territory !== ALL_FILTER
    ? countryFilterLabel(filters.territory)
    : "",
  filters.channelId !== ALL_FILTER
    ? filterLabel(dropdownChannels.value, filters.channelId, "Selected platform")
    : "",
].filter(Boolean))
const earningsPaginationSummary = computed(() => {
  if (!earningsPagination.value.totalCount) {
    return "No earnings entries found"
  }

  const from = (earningsPagination.value.page - 1) * earningsPagination.value.pageSize + 1
  const to = Math.min(
    earningsPagination.value.page * earningsPagination.value.pageSize,
    earningsPagination.value.totalCount,
  )
  return `Showing ${from.toLocaleString()}-${to.toLocaleString()} of ${earningsPagination.value.totalCount.toLocaleString()} earnings entries`
})
const publishingHiddenByFilters = computed(() => filters.territory !== ALL_FILTER || filters.channelId !== ALL_FILTER)
const publishingEmptyDescription = computed(() => (
  publishingHiddenByFilters.value
    ? "Publishing credits are hidden while a country or platform filter is active."
    : "No publishing credits match the current filters."
))

const summaryMetrics = computed(() => [
  {
    label: "Filtered earnings",
    value: formatMoneyNumber(filteredEarningsTotal.value),
    footnote: activeFilterCount.value ? filterSummary.value : "All statement detail",
    tone: "accent" as const,
  },
  {
    label: "Publishing",
    value: formatMoneyNumber(filteredPublishingTotal.value),
    footnote: publishingHiddenByFilters.value ? "Hidden by country/channel filter" : "Manual publishing credits",
    tone: "default" as const,
  },
  {
    label: "Total selected",
    value: formatMoneyNumber(filteredEarningsTotal.value + filteredPublishingTotal.value),
    footnote: activeFilterCount.value ? filterSummary.value : "All statement detail",
    tone: "alt" as const,
  },
])

const statementTabs = computed(() => [
  {
    label: "Statement months",
    value: "statements",
    badge: filteredStatements.value.length || "",
  },
  {
    label: "Earnings breakdown",
    value: "earnings",
    badge: earningsPagination.value.totalCount || "",
  },
  {
    label: "Publishing credits",
    value: "publishing",
    badge: filteredPublishingRows.value.length || "",
  },
])

const statementColumns = [
  { key: "periodMonth", label: "Month", accessor: (row: any) => formatPeriodMonth(row.periodMonth), sortable: true },
  { key: "status", label: "Status", accessor: (row: any) => row.status, sortable: true },
  { key: "earnings", label: "Earnings", align: "right" as const, accessor: (row: any) => Number(row.earnings || 0), sortable: true },
  { key: "publishing", label: "Publishing", align: "right" as const, accessor: (row: any) => Number(row.publishing || 0), sortable: true },
  { key: "detail", label: "Ch / Co / Re", align: "center" as const, accessor: (row: any) => `${row.channelCount} / ${row.territoryCount} / ${row.releaseCount}`, sortable: false },
  { key: "closedAt", label: "Close date", accessor: (row: any) => formatIsoDate(row.closedAt), sortable: true },
]

const earningsColumns = [
  { key: "release", label: "Release / track", accessor: (row: any) => `${releaseLabel(row)} ${trackLabel(row)}`, sortable: true },
  { key: "periodMonth", label: "Month", accessor: (row: any) => formatPeriodMonth(row.periodMonth), sortable: true },
  {
    key: "channelName",
    label: "Platform",
    align: "center" as const,
    class: "statement-platform-column",
    accessor: (row: any) => row.channelName,
    sortable: true,
  },
  { key: "territory", label: "Country", accessor: (row: any) => countryNameFor(row.territory, "Unknown country"), sortable: true },
  { key: "units", label: "Units", align: "right" as const, accessor: (row: any) => row.units, sortable: true },
  { key: "earnings", label: "Earnings", align: "right" as const, accessor: (row: any) => Number(row.earnings || 0), sortable: true },
]

const publishingColumns = [
  { key: "release", label: "Release", accessor: (row: any) => releaseLabel(row), sortable: true },
  { key: "periodMonth", label: "Month", accessor: (row: any) => formatPeriodMonth(row.periodMonth), sortable: true },
  { key: "notes", label: "Notes", accessor: (row: any) => row.notes || "-", sortable: false },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0), sortable: true },
]

watch([
  () => filters.releaseId,
  () => filters.territory,
  () => filters.channelId,
  () => earningsPageSize.value,
], () => {
  earningsPage.value = 1
})

function initializeStatementEarnings(value: ArtistStatementsResponse | null) {
  void value
}

watch(() => data.value, (newVal) => {
  if (newVal) {
    initializeStatementEarnings(data.value)
  }
}, { immediate: true })

function matchesFilter(value: string | null, filterValue: string) {
  return filterValue === ALL_FILTER || value === filterValue
}

function parseMoney(value: string | number | null | undefined) {
  return Number(value || 0)
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

function statusTone(status: string) {
  return status === "closed" ? "success" : "warning"
}

function filterLabel(options: ArtistStatementFilterOption[], value: string, fallback: string) {
  if (value === ALL_FILTER) {
    return fallback
  }

  return options.find((option) => option.value === value)?.label ?? fallback
}

function countryFilterLabel(value: string) {
  if (value === ALL_FILTER) {
    return "All countries"
  }

  const fallback = dropdownTerritories.value.find((option) => option.value === value)?.label ?? "Selected country"
  return countryNameFor(value, fallback)
}

function resetFilters() {
  filters.releaseId = ALL_FILTER
  filters.territory = ALL_FILTER
  filters.channelId = ALL_FILTER
}

function goToPreviousPage() {
  if (earningsPagination.value.hasPreviousPage) {
    earningsPage.value--
  }
}

function goToNextPage() {
  if (earningsPagination.value.hasNextPage) {
    earningsPage.value++
  }
}

async function refreshStatements() {
  await Promise.all([refresh(), refreshEarnings()])
}
</script>

<template>
  <div class="page statements-page">
    <PageHeader
      eyebrow="Artist view"
      title="Monthly statements"
      description="Review statement months, then drill into processed earnings by month, release, platform, and country."
    >
      <template #actions>
        <NuxtLink
          :to="{ path: '/dashboard/settings', query: { section: 'bank' }, hash: '#bank-details' }"
          class="button button-secondary statement-settings-link"
        >
          <Settings class="size-4" aria-hidden="true" />
          Add or review bank details
        </NuxtLink>
      </template>
    </PageHeader>

    <AppAlert v-if="error" variant="destructive">
      {{ error.statusMessage || "Unable to load statements right now." }}
      <template #action>
        <Button type="button" variant="secondary" size="sm" @click="refreshStatements">
          <RefreshCw class="mr-2 size-4" aria-hidden="true" />
          Retry
        </Button>
      </template>
    </AppAlert>

    <DashboardSkeleton v-else-if="pending && !data" layout="statements" />

    <template v-else>
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

      <DataPanel
        title="Statement workspace"
        eyebrow="Royalty archive"
        description="Filter once, then move between monthly totals, detailed earnings, and publishing credits."
        class="statement-workspace"
      >
        <div class="statement-filter-shell">
          <div class="statement-filter-title">
            <SlidersHorizontal class="size-4" aria-hidden="true" />
            <span>Filters</span>
            <strong>{{ filterSummary }}</strong>
          </div>

          <div class="statement-mobile-filter-bar">
            <button type="button" class="statement-mobile-filter-button statement-cream-button" @click="mobileFiltersOpen = true">
              <SlidersHorizontal class="mr-2 size-4" aria-hidden="true" />
              Filters
              <Badge v-if="activeFilterCount" variant="secondary">{{ activeFilterCount }}</Badge>
            </button>
            <Sheet v-model:open="mobileFiltersOpen">
              <SheetContent side="bottom" class="statement-filter-sheet">
                <SheetHeader>
                  <SheetTitle>Statement filters</SheetTitle>
                  <SheetDescription>{{ filterSummary }}</SheetDescription>
                </SheetHeader>

                <div class="statement-sheet-fields">
                  <div class="field-row">
                    <label for="statement-mobile-release">Release</label>
                    <NativeSelect id="statement-mobile-release" v-model="filters.releaseId">
                      <option :value="ALL_FILTER">All releases</option>
                      <option v-for="option in dropdownReleases" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </NativeSelect>
                  </div>

                  <div class="field-row">
                    <label for="statement-mobile-country">Country</label>
                    <NativeSelect id="statement-mobile-country" v-model="filters.territory">
                      <option :value="ALL_FILTER">All countries</option>
                      <option v-for="option in dropdownTerritories" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </NativeSelect>
                  </div>

                  <div class="field-row">
                    <label for="statement-mobile-platform">Platform</label>
                    <NativeSelect id="statement-mobile-platform" v-model="filters.channelId">
                      <option :value="ALL_FILTER">All platforms</option>
                      <option v-for="option in dropdownChannels" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </NativeSelect>
                  </div>
                </div>

                <SheetFooter class="statement-filter-sheet-actions">
                  <Button type="button" variant="secondary" class="statement-cream-button" @click="resetFilters">
                    Reset filters
                  </Button>
                  <Button type="button" @click="mobileFiltersOpen = false">
                    Apply
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
            <Button type="button" variant="secondary" class="statement-cream-button" :disabled="pending || earningsPending" @click="refreshStatements">
              <RefreshCw class="mr-2 size-4" :class="{ 'animate-spin': pending || earningsPending }" aria-hidden="true" />
              Refresh
            </Button>
            <div v-if="activeFilterChips.length" class="statement-filter-chips" aria-label="Active filters">
              <span v-for="chip in activeFilterChips" :key="chip">{{ chip }}</span>
              <button type="button" @click="resetFilters">Clear</button>
            </div>
          </div>

          <div class="statement-filter-grid statement-desktop-filters">
            <div class="statement-menu-field">
              <span>Release</span>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button type="button" variant="secondary" class="statement-filter-trigger">
                    {{ filterLabel(dropdownReleases, filters.releaseId, "All releases") }}
                    <ChevronDown class="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="statement-filter-menu">
                  <DropdownMenuLabel>Release</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup v-model="filters.releaseId">
                    <DropdownMenuGroup>
                      <DropdownMenuRadioItem :value="ALL_FILTER">All releases</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem
                        v-for="option in dropdownReleases"
                        :key="option.value"
                        :value="option.value"
                      >
                        {{ option.label }}
                      </DropdownMenuRadioItem>
                    </DropdownMenuGroup>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div class="statement-menu-field">
              <span>Country</span>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button type="button" variant="secondary" class="statement-filter-trigger">
                    <span v-if="filters.territory === ALL_FILTER">All countries</span>
                    <CountryFlag
                      v-else
                      :code="filters.territory"
                      :label="countryFilterLabel(filters.territory)"
                      show-label
                      class="statement-country-trigger"
                    />
                    <ChevronDown class="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="statement-filter-menu">
                  <DropdownMenuLabel>Country</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup v-model="filters.territory">
                    <DropdownMenuGroup>
                      <DropdownMenuRadioItem :value="ALL_FILTER">All countries</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem
                        v-for="option in dropdownTerritories"
                        :key="option.value"
                        :value="option.value"
                      >
                        <CountryFlag :code="option.value" :label="option.label" show-label class="statement-country-option" />
                      </DropdownMenuRadioItem>
                    </DropdownMenuGroup>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div class="statement-menu-field">
              <span>Platform</span>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button type="button" variant="secondary" class="statement-filter-trigger">
                    <span v-if="filters.channelId === ALL_FILTER">All platforms</span>
                    <span v-else-if="selectedChannelOption" class="statement-platform-trigger">
                      <DspLogo
                        :logo-key="selectedChannelOption.logoKey"
                        :name="selectedChannelOption.label"
                        :label="selectedChannelOption.label"
                        size="xs"
                        :interactive="false"
                      />
                      <span class="sr-only">{{ selectedChannelOption.label }}</span>
                    </span>
                    <span v-else>Selected platform</span>
                    <ChevronDown class="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" class="statement-filter-menu">
                  <DropdownMenuLabel>Platform</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup v-model="filters.channelId">
                    <DropdownMenuGroup>
                      <DropdownMenuRadioItem :value="ALL_FILTER">All platforms</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem
                        v-for="option in dropdownChannels"
                        :key="option.value"
                        :value="option.value"
                      >
                        <span class="statement-platform-option">
                          <DspLogo
                            :logo-key="option.logoKey"
                            :name="option.label"
                            :label="option.label"
                            size="xs"
                            :interactive="false"
                          />
                          <span class="sr-only">{{ option.label }}</span>
                        </span>
                      </DropdownMenuRadioItem>
                    </DropdownMenuGroup>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div class="statement-filter-actions statement-desktop-filters">
            <Button type="button" variant="secondary" class="statement-cream-button" @click="resetFilters">
              <RotateCcw class="mr-2 size-4" aria-hidden="true" />
              Reset filters
            </Button>
            <Button type="button" variant="secondary" class="statement-cream-button" :disabled="pending || earningsPending" @click="refreshStatements">
              <RefreshCw class="mr-2 size-4" :class="{ 'animate-spin': pending || earningsPending }" aria-hidden="true" />
              {{ pending || earningsPending ? "Refreshing..." : "Refresh statements" }}
            </Button>
          </div>
        </div>

        <WorkspaceFolderGrid
          v-model="activeTab"
          :items="statementTabs"
          label="Statement views"
          class="statement-tabs"
        />

        <section v-if="activeTab === 'statements'" class="statement-tab-panel" aria-label="Statement months">
          <div class="statement-mobile-list">
            <article v-for="row in filteredStatements" :key="row.periodMonth" class="statement-mobile-card">
              <div class="statement-mobile-card-header">
                <strong>{{ formatPeriodMonth(row.periodMonth) }}</strong>
                <StatusBadge :tone="statusTone(row.status)">
                  {{ row.status === "closed" ? "Closed" : "Open" }}
                </StatusBadge>
              </div>
              <dl class="statement-mobile-card-grid">
                <div>
                  <dt>Earnings</dt>
                  <dd><MoneyValue :value="row.earnings" size="sm" /></dd>
                </div>
                <div>
                  <dt>Publishing</dt>
                  <dd><MoneyValue :value="row.publishing" size="sm" /></dd>
                </div>
                <div>
                  <dt>Detail</dt>
                  <dd>{{ row.channelCount }} channels / {{ row.territoryCount }} countries / {{ row.releaseCount }} releases</dd>
                </div>
                <div>
                  <dt>Close date</dt>
                  <dd>{{ formatIsoDate(row.closedAt) }}</dd>
                </div>
              </dl>
            </article>
            <AppEmptyState
              v-if="!filteredStatements.length"
              compact
              title="No statement months"
              description="No statement months match the current filters."
              icon="file"
            />
          </div>

          <DataTable
            :columns="statementColumns"
            :data="filteredStatements"
            empty-title="No statement months"
            empty-description="No statement months match the current filters."
            empty-icon="file"
            search-placeholder="Search statement months..."
            enable-column-visibility
            row-key="periodMonth"
            table-class="statement-premium-table"
            wrapper-class="statement-data-table statement-desktop-table"
          >
            <template #cell-periodMonth="{ row }">
              <strong>{{ formatPeriodMonth(row.periodMonth) }}</strong>
            </template>
            <template #cell-status="{ row }">
              <StatusBadge :tone="statusTone(row.status)">
                {{ row.status === "closed" ? "Closed" : "Open" }}
              </StatusBadge>
            </template>
            <template #cell-earnings="{ row }">
              <MoneyValue :value="row.earnings" size="sm" />
            </template>
            <template #cell-publishing="{ row }">
              <MoneyValue :value="row.publishing" size="sm" />
            </template>
            <template #cell-detail="{ row }">
              <span class="statement-detail-pill">{{ row.channelCount }} / {{ row.territoryCount }} / {{ row.releaseCount }}</span>
            </template>
            <template #cell-closedAt="{ row }">
              <span class="detail-copy">{{ formatIsoDate(row.closedAt) }}</span>
            </template>
          </DataTable>
        </section>

        <section v-else-if="activeTab === 'earnings'" class="statement-tab-panel" aria-label="Earnings breakdown">
          <div class="statement-table-toolbar">
            <span class="detail-copy">{{ earningsPaginationSummary }}</span>
            <div class="statement-table-actions">
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button type="button" variant="secondary" class="statement-page-size-trigger">
                    {{ earningsPageSize }} entries
                    <ChevronDown class="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="statement-page-size-menu w-44">
                  <DropdownMenuLabel>Entries per page</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup v-model="earningsPageSizeModel">
                    <DropdownMenuGroup>
                      <DropdownMenuRadioItem
                        v-for="option in STATEMENT_EARNINGS_PAGE_SIZES"
                        :key="option"
                        :value="String(option)"
                      >
                        {{ option }} entries
                      </DropdownMenuRadioItem>
                    </DropdownMenuGroup>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <AppAlert v-if="earningsError" variant="destructive">
            {{ earningsError.statusMessage || "Unable to load earnings detail right now." }}
          </AppAlert>

          <DataTable
            :columns="earningsColumns"
            :data="earningsRows"
            empty-title="No earnings match"
            empty-description="No earnings detail matches the current filters."
            empty-icon="file"
            search-placeholder="Search current earnings page..."
            enable-column-visibility
            row-key="id"
            table-class="statement-premium-table"
            wrapper-class="statement-data-table statement-desktop-table"
          >
            <template #cell-release="{ row }">
              <div class="statement-release-cell">
                <strong>{{ releaseLabel(row) }}</strong>
                <span>{{ trackLabel(row) }}</span>
              </div>
            </template>
            <template #cell-periodMonth="{ row }">
              <strong>{{ formatPeriodMonth(row.periodMonth) }}</strong>
            </template>
            <template #cell-channelName="{ row }">
              <div class="statement-platform-cell">
                <DspLogo
                  :logo-key="row.logoKey"
                  :name="row.channelName"
                  :label="row.channelName"
                  size="sm"
                  class="statement-platform-logo"
                />
              </div>
            </template>
            <template #cell-territory="{ row }">
              <CountryFlag :code="row.territory" :label="row.territory || 'Unknown country'" show-label class="statement-country-cell" />
            </template>
            <template #cell-units="{ row }">
              <strong class="tabular-nums">{{ row.units.toLocaleString() }}</strong>
            </template>
            <template #cell-earnings="{ row }">
              <MoneyValue :value="row.earnings" size="sm" />
            </template>
          </DataTable>

          <div class="statement-mobile-list">
            <article v-for="row in earningsRows" :key="row.id" class="statement-mobile-card">
              <div class="statement-mobile-card-header">
                <strong>{{ releaseLabel(row) }}</strong>
                <MoneyValue :value="row.earnings" size="sm" />
              </div>
              <p class="statement-mobile-subtitle">{{ trackLabel(row) }}</p>
              <dl class="statement-mobile-card-grid">
                <div>
                  <dt>Month</dt>
                  <dd>{{ formatPeriodMonth(row.periodMonth) }}</dd>
                </div>
                <div>
                  <dt>Platform</dt>
                  <dd>{{ row.channelName }}</dd>
                </div>
                <div>
                  <dt>Country</dt>
                  <dd>{{ countryNameFor(row.territory, "Unknown country") }}</dd>
                </div>
                <div>
                  <dt>Units</dt>
                  <dd>{{ row.units.toLocaleString() }}</dd>
                </div>
              </dl>
            </article>
            <AppEmptyState
              v-if="!earningsRows.length"
              compact
              title="No earnings match"
              description="No earnings detail matches the current filters."
              icon="file"
            />
          </div>

          <AppPagination
            v-if="earningsPagination.totalPages > 1"
            :page="earningsPagination.page"
            :page-size="earningsPagination.pageSize"
            :total-count="earningsPagination.totalCount"
            :total-pages="earningsPagination.totalPages"
            :pending="earningsPending"
            :summary="earningsPaginationSummary"
            aria-label="Statement earnings pagination"
            @update:page="(newPage) => earningsPage = newPage"
          />
        </section>

        <section v-else class="statement-tab-panel" aria-label="Publishing credits">
          <AppAlert v-if="publishingHiddenByFilters" variant="default">
            Publishing credits are hidden while a country or platform filter is active.
          </AppAlert>

          <DataTable
            :columns="publishingColumns"
            :data="filteredPublishingRows"
            empty-title="No publishing credits"
            :empty-description="publishingEmptyDescription"
            empty-icon="file"
            search-placeholder="Search publishing credits..."
            enable-column-visibility
            row-key="id"
            table-class="statement-premium-table"
            wrapper-class="statement-data-table statement-desktop-table"
          >
            <template #cell-release="{ row }">
              <strong>{{ releaseLabel(row) }}</strong>
            </template>
            <template #cell-periodMonth="{ row }">
              <strong>{{ formatPeriodMonth(row.periodMonth) }}</strong>
            </template>
            <template #cell-notes="{ row }">
              <span class="statement-note">{{ row.notes || "-" }}</span>
            </template>
            <template #cell-amount="{ row }">
              <MoneyValue :value="row.amount" size="sm" />
            </template>
          </DataTable>

          <div class="statement-mobile-list">
            <article v-for="row in filteredPublishingRows" :key="row.id" class="statement-mobile-card">
              <div class="statement-mobile-card-header">
                <strong>{{ releaseLabel(row) }}</strong>
                <MoneyValue :value="row.amount" size="sm" />
              </div>
              <dl class="statement-mobile-card-grid">
                <div>
                  <dt>Month</dt>
                  <dd>{{ formatPeriodMonth(row.periodMonth) }}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{{ row.notes || "-" }}</dd>
                </div>
              </dl>
            </article>
            <AppEmptyState
              v-if="!filteredPublishingRows.length"
              compact
              title="No publishing credits"
              :description="publishingEmptyDescription"
              icon="file"
            />
          </div>
        </section>
      </DataPanel>
    </template>
  </div>
</template>

<style scoped>
.statements-page {
  display: grid;
  gap: 24px;
}

.statement-settings-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.statement-workspace :deep(.data-panel) {
  border-color: var(--surface-border, var(--border));
}

.statement-filter-shell {
  display: grid;
  gap: 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  padding-bottom: 18px;
}

.statement-filter-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.statement-filter-title strong {
  margin-left: auto;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 700;
  text-transform: none;
}

.statement-mobile-filter-bar,
.statement-mobile-list {
  display: none;
}

.statement-mobile-filter-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  border: 1px solid color-mix(in srgb, var(--priority) 22%, rgb(10 10 10 / 12%) 78%);
  border-radius: 8px;
  background: linear-gradient(180deg, var(--premium-button-gold-start, #fffdf4), var(--premium-button-gold-end, #e8dec7));
  padding: 8px 16px;
  color: var(--premium-button-foreground, #0a0a0a);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out);
}

.statement-mobile-filter-button:hover {
  background: linear-gradient(180deg, var(--premium-button-hover-start, #fffef8), var(--premium-button-hover-end, #eee5cf));
}

.statement-mobile-filter-button:active {
  background: linear-gradient(180deg, var(--premium-button-active-start, #e6dcc3), var(--premium-button-active-end, #d6c8a8));
}

.statement-mobile-filter-button svg {
  flex-shrink: 0;
  pointer-events: none;
}

.statement-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.statement-filter-chips span,
.statement-filter-chips button {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 80%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 26%, var(--card));
  color: var(--foreground);
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 700;
}

.statement-filter-chips button {
  color: var(--muted-foreground);
}

.statement-filter-sheet {
  max-height: 88svh;
  overflow-y: auto;
}

.statement-sheet-fields {
  display: grid;
  gap: 14px;
}

.statement-filter-sheet-actions {
  flex-direction: row;
  gap: 10px;
}

.statement-filter-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.statement-menu-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.statement-menu-field > span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.statement-filter-trigger,
.statement-page-size-trigger {
  justify-content: space-between;
  min-width: 0;
  width: 100%;
  gap: 12px;
}

.statement-filter-trigger {
  position: relative;
  isolation: isolate;
  min-height: 54px;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  border-radius: 12px !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 2%), color-mix(in srgb, var(--card) 92%, var(--muted) 8%));
  color: var(--foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    var(--shadow-card);
  font-weight: 500;
  --silver-glow: color-mix(in srgb, var(--foreground) 5%, transparent);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out);
  transform: none !important;
}

.statement-filter-trigger::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    linear-gradient(145deg, var(--silver-glow), transparent 46%),
    radial-gradient(circle at 14% 0%, color-mix(in srgb, var(--foreground) 6%, transparent), transparent 36%);
  opacity: 0.7;
  pointer-events: none;
}

.statement-filter-trigger > :deep(*) {
  position: relative;
  z-index: 1;
}

.statement-filter-trigger:hover {
  border-color: color-mix(in srgb, var(--priority) 38%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--priority) 4%), color-mix(in srgb, var(--card) 90%, var(--muted) 10%));
  color: var(--foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent),
    var(--shadow-card-hover);
  transform: none !important;
}

.statement-filter-trigger:hover::before {
  opacity: 1;
}

.statement-filter-trigger:active {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 2%), color-mix(in srgb, var(--card) 90%, var(--muted) 10%));
  color: var(--foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    inset 0 10px 18px -16px color-mix(in srgb, var(--foreground) 28%, transparent),
    var(--shadow-sm);
  transform: none !important;
}

:global(.dark .statement-filter-trigger) {
  --silver-glow: transparent;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  background:
    radial-gradient(115% 165% at 50% 42%, color-mix(in srgb, var(--card) 92%, var(--foreground) 4%) 0%, color-mix(in srgb, var(--card) 76%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 70%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 68%, var(--background)), color-mix(in srgb, var(--background) 62%, var(--card)));
  color: var(--foreground);
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 2.6%),
    inset 0 0 16px rgb(254 249 231 / 1.8%),
    inset 0 1px 0 rgb(254 249 231 / 5.2%),
    inset 0 -1px 0 rgb(0 0 0 / 34%),
    0 1px 0 rgb(254 249 231 / 2.8%),
    0 14px 26px -20px rgb(0 0 0 / 86%);
}

:global(.dark .statement-filter-trigger::before) {
  opacity: 0;
}

:global(.dark .statement-filter-trigger:hover) {
  border-color: color-mix(in srgb, var(--priority) 12%, var(--surface-border, var(--border)));
  background:
    radial-gradient(115% 165% at 50% 42%, color-mix(in srgb, var(--card) 94%, var(--foreground) 5%) 0%, color-mix(in srgb, var(--card) 78%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 66%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 70%, var(--background)), color-mix(in srgb, var(--background) 58%, var(--card)));
  color: var(--foreground);
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 3.2%),
    inset 0 0 18px rgb(254 249 231 / 2.4%),
    inset 0 1px 0 rgb(254 249 231 / 6.5%),
    inset 0 -1px 0 rgb(0 0 0 / 28%),
    0 1px 0 rgb(254 249 231 / 3.4%),
    0 18px 32px -21px rgb(0 0 0 / 92%);
}

:global(.dark .statement-filter-trigger:hover::before) {
  opacity: 0.34;
}

:global(.dark .statement-filter-trigger:active) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 70%, transparent);
  background:
    radial-gradient(105% 145% at 50% 45%, color-mix(in srgb, var(--card) 82%, var(--foreground) 2%) 0%, color-mix(in srgb, var(--card) 68%, var(--background)) 42%, transparent 72%),
    radial-gradient(135% 120% at 50% 115%, color-mix(in srgb, var(--background) 74%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 58%, var(--background)), color-mix(in srgb, var(--background) 68%, var(--card)));
  color: var(--foreground);
  box-shadow:
    inset 0 0 0 1px rgb(254 249 231 / 2.4%),
    inset 0 10px 20px -16px rgb(0 0 0 / 84%),
    inset 0 1px 0 rgb(254 249 231 / 3.4%),
    inset 0 -1px 0 rgb(0 0 0 / 44%),
    0 8px 18px -18px rgb(0 0 0 / 86%);
  transform: none !important;
}

.statement-filter-trigger :deep(span),
.statement-filter-trigger {
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.statement-filter-menu) {
  max-height: min(18rem, var(--radix-dropdown-menu-content-available-height, calc(100vh - 120px)));
  width: var(--radix-dropdown-menu-trigger-width);
  min-width: var(--radix-dropdown-menu-trigger-width);
  max-width: min(var(--radix-dropdown-menu-trigger-width), calc(100vw - 24px));
}

:global(.statement-page-size-menu) {
  max-height: min(16rem, var(--radix-dropdown-menu-content-available-height, calc(100vh - 120px)));
}

.statement-filter-actions,
.statement-table-toolbar,
.statement-table-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.statement-cream-button,
.statement-data-table :deep(.premium-box-button-secondary) {
  --premium-button-gold-start: #fffdf4;
  --premium-button-gold-end: #e8dec7;
  --premium-button-hover-start: #fffef8;
  --premium-button-hover-end: #eee5cf;
  --premium-button-active-start: #e6dcc3;
  --premium-button-active-end: #d6c8a8;
  --premium-button-foreground: #0a0a0a;
  --premium-button-top-light: rgb(255 255 255 / 72%);
  --premium-button-bottom-edge: rgb(94 74 32 / 12%);
  --premium-button-drop: rgb(10 10 10 / 22%);
  border-color: color-mix(in srgb, var(--priority) 22%, rgb(10 10 10 / 12%) 78%);
  color: var(--premium-button-foreground);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 82%),
    inset 0 -1px 0 var(--premium-button-bottom-edge),
    0 10px 20px -18px var(--premium-button-drop);
}

.statement-cream-button:hover,
.statement-data-table :deep(.premium-box-button-secondary:hover) {
  border-color: color-mix(in srgb, var(--priority) 28%, rgb(10 10 10 / 14%) 72%);
  color: var(--premium-button-foreground);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 88%),
    inset 0 -1px 0 var(--premium-button-bottom-edge),
    0 12px 22px -18px rgb(10 10 10 / 24%);
}

:global(.dark .statement-cream-button),
:global(.dark .statement-data-table .premium-box-button-secondary) {
  border-color: rgb(254 249 231 / 34%);
  color: #0a0a0a;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 76%),
    inset 0 -1px 0 rgb(94 74 32 / 14%),
    0 12px 24px -20px rgb(0 0 0 / 72%);
}

:global(.dark .statement-cream-button:hover),
:global(.dark .statement-data-table .premium-box-button-secondary:hover) {
  border-color: color-mix(in srgb, var(--priority) 24%, rgb(254 249 231 / 40%) 76%);
  color: #0a0a0a;
}

.statement-table-actions {
  justify-content: flex-end;
}

.statement-tabs {
  margin-top: 2px;
}

.statement-tab-panel {
  display: grid;
  gap: 16px;
}

.statement-mobile-card {
  display: grid;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  border-radius: 12px;
  background: var(--card);
  padding: 14px;
  box-shadow: var(--shadow-card);
}

.statement-mobile-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.statement-mobile-card-header > strong {
  min-width: 0;
  color: var(--foreground);
  line-height: 1.25;
}

.statement-mobile-subtitle {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.statement-mobile-card-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.statement-mobile-card-grid div {
  min-width: 0;
}

.statement-mobile-card-grid dt {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.statement-mobile-card-grid dd {
  margin: 3px 0 0;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.35;
}

.statement-detail-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 78px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 24%, var(--card));
  color: var(--secondary-foreground);
  padding: 4px 8px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
}

.statement-release-cell {
  display: grid;
  gap: 3px;
  min-width: 220px;
}

.statement-release-cell strong {
  color: var(--foreground);
}

.statement-release-cell span,
.statement-note {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.statement-platform-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 136px;
}

.statement-platform-logo {
  flex-shrink: 0;
}

.statement-platform-option,
.statement-platform-trigger {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  gap: 8px;
}

.statement-platform-option > span:last-child,
.statement-platform-trigger > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.statement-country-cell,
.statement-country-option,
.statement-country-trigger {
  max-width: 190px;
}

:global(.statement-platform-column) {
  width: 148px;
  min-width: 148px;
}

.statement-premium-table {
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1180px) {
  .statement-filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .statement-mobile-filter-bar,
  .statement-mobile-list {
    display: grid;
    gap: 12px;
  }

  .statement-desktop-filters,
  .statement-desktop-table {
    display: none;
  }

  .statement-mobile-filter-button,
  .statement-mobile-filter-bar > .statement-cream-button {
    min-height: 44px;
    justify-content: center;
    width: 100%;
  }

  .statement-filter-chips {
    align-items: flex-start;
  }

  .statement-mobile-card-grid {
    grid-template-columns: 1fr;
  }

  .statement-filter-grid,
  .statement-filter-actions,
  .statement-table-toolbar,
  .statement-table-actions {
    grid-template-columns: 1fr;
  }

  .statement-filter-actions,
  .statement-table-toolbar,
  .statement-table-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .statement-filter-title {
    align-items: flex-start;
    flex-direction: column;
  }

  .statement-filter-title strong {
    margin-left: 0;
  }
}
</style>
