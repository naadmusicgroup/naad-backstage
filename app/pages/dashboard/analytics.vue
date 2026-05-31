<script setup lang="ts">
import type {
  ArtistAnalyticsAudienceResponse,
  ArtistAnalyticsFilterOption,
  ArtistAnalyticsOverviewResponse,
} from "~~/types/dashboard"
import {
  AudioLines,
  CalendarDays,
  CalendarRange,
  Disc3,
  Globe2,
  RadioTower,
  RotateCcw,
} from "lucide-vue-next"
import {
  ANALYTICS_PERIOD_OPTIONS,
  DEFAULT_ANALYTICS_PERIOD_RANGE,
  analyticsMonthRangeKeys,
  type AnalyticsPeriodRange,
} from "~~/app/utils/analytics-periods"
import { countryNameFor } from "~~/app/utils/country-flags"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

const ALL_FILTER_VALUE = "all"
const EMPTY_FILTER_VALUE = "__none__"

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
const overviewPeriodRange = ref<AnalyticsPeriodRange>(DEFAULT_ANALYTICS_PERIOD_RANGE)
const overviewData = shallowRef<ArtistAnalyticsOverviewResponse | null>(null)
const audienceData = shallowRef<ArtistAnalyticsAudienceResponse | null>(null)
const overviewPending = ref(false)
const audiencePending = ref(false)
const overviewError = shallowRef<any>(null)
const audienceError = shallowRef<any>(null)
const filterDockSentinel = ref<HTMLElement | null>(null)
const filterDocked = ref(false)
const filterDockInteractive = ref(false)
type AnalyticsDetailKey = "platform" | "catalog" | "streams"
const expandedAnalyticsDetails = reactive<Record<AnalyticsDetailKey, boolean>>({
  platform: false,
  catalog: false,
  streams: false,
})
let overviewRequestId = 0
let audienceRequestId = 0
let filterDockObserver: IntersectionObserver | null = null
let stopFilterDockWatch: (() => void) | null = null
let filterDockScrollTarget: HTMLElement | Window | null = null
let filterDockFrame: number | null = null
let filterDockInteractiveTimer: ReturnType<typeof setTimeout> | null = null

const overviewQuery = computed(() => ({
  ...(activeArtistId.value ? { artistId: activeArtistId.value } : {}),
  overviewPeriodRange: overviewPeriodRange.value,
  periodMonth: filters.periodMonth,
  channelId: filters.channelId,
  territory: filters.territory,
  releaseId: filters.releaseId,
  trackId: filters.trackId,
}))
const audienceQuery = computed(() => ({
  ...(activeArtistId.value ? { artistId: activeArtistId.value } : {}),
  audiencePeriodRange: overviewPeriodRange.value,
  periodMonth: filters.periodMonth,
  channelId: filters.channelId,
  territory: filters.territory,
  releaseId: filters.releaseId,
  trackId: filters.trackId,
}))

const overviewPeriodLabel = computed(() => (
  ANALYTICS_PERIOD_OPTIONS.find((option) => option.value === overviewPeriodRange.value)?.label ?? "6 months"
))
const isInitialOverviewLoading = computed(() => overviewPending.value && !overviewData.value)
const isRefreshingOverview = computed(() => overviewPending.value && Boolean(overviewData.value))
const isRefreshingAudience = computed(() => audiencePending.value && Boolean(audienceData.value))
const analyticsDetailExpanded = computed(() => Object.values(expandedAnalyticsDetails).some(Boolean))
const analyticsDetailDockWidth = computed(() => {
  if (expandedAnalyticsDetails.platform) {
    return "min(900px, calc(100vw - 18px))"
  }

  if (expandedAnalyticsDetails.catalog) {
    return "min(680px, calc(100vw - 18px))"
  }

  if (expandedAnalyticsDetails.streams) {
    return "min(660px, calc(100vw - 18px))"
  }

  return "min(760px, calc(100vw - 18px))"
})
const analyticsDetailDockStyle = computed(() => analyticsDetailExpanded.value
  ? { "--analytics-detail-sheet-width": analyticsDetailDockWidth.value }
  : undefined)
const dockSelectContentAlign = computed(() => analyticsDetailExpanded.value ? "center" : "start")
const dockSelectContentClass = computed(() => analyticsDetailExpanded.value ? "analytics-dock-select-content" : undefined)
const dockSelectContentSide = computed(() => analyticsDetailExpanded.value ? "left" : "bottom")
const dockSelectContentSideOffset = computed(() => analyticsDetailExpanded.value ? 12 : 6)
type DockFloatingTooltipSide = "left" | "right"
const dockFloatingTooltip = shallowRef<{
  label: string
  value: string
  side: DockFloatingTooltipSide
  top: number
  anchor: number
} | null>(null)
const dockFloatingTooltipStyle = computed(() => {
  if (!dockFloatingTooltip.value) {
    return undefined
  }

  const position = dockFloatingTooltip.value.side === "right"
    ? { left: `${dockFloatingTooltip.value.anchor}px` }
    : { right: `${dockFloatingTooltip.value.anchor}px` }

  return {
    ...position,
    "--tooltip-enter-x": dockFloatingTooltip.value.side === "right" ? "-5px" : "5px",
    top: `${dockFloatingTooltip.value.top}px`,
  }
})
const summary = computed(() => overviewData.value?.summary ?? {
  totalRoyaltyRevenue: "0.00",
  totalPublishingRevenue: "0.00",
  totalStreams: 0,
  royaltyRowCount: 0,
})
const analyticsMetrics = computed(() => overviewData.value?.metrics ?? [])
const monthlyRevenue = computed(() => overviewData.value?.monthlyRevenue ?? [])
const monthlyRevenueChartMonthKeys = computed(() => {
  if (filters.periodMonth !== ALL_FILTER_VALUE) {
    return [filters.periodMonth]
  }

  const rangeMonthKeys = analyticsMonthRangeKeys(overviewPeriodRange.value)

  if (rangeMonthKeys) {
    return rangeMonthKeys
  }

  return [...new Set(monthlyRevenue.value.map((point) => point.periodMonth).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
})
const countries = computed(() => overviewData.value?.countries ?? [])
const platformRows = computed(() => overviewData.value?.platformRows ?? [])
const platformSeries = computed(() => overviewData.value?.platformSeries ?? [])
const releaseRows = computed(() => overviewData.value?.releaseRows ?? [])
const serverFilterOptions = computed(() => overviewData.value?.filterOptions ?? {
  periodMonths: [],
  channels: [],
  territories: [],
  releases: [],
  tracks: [],
})
const audienceCards = computed(() => audienceData.value?.cards ?? [])
const selectedCountryFilterCode = computed(() => (
  filters.territory !== ALL_FILTER_VALUE && filters.territory !== EMPTY_FILTER_VALUE
    ? filters.territory
    : null
))
const hasAnyAnalyticsData = computed(() => (
  summary.value.royaltyRowCount > 0
  || Number(summary.value.totalPublishingRevenue ?? 0) > 0
  || audienceCards.value.length > 0
))

function withAllOption(label: string, options: ArtistAnalyticsFilterOption[]) {
  return [
    { value: ALL_FILTER_VALUE, label },
    ...options,
  ]
}

const periodOptions = computed(() => withAllOption("All periods", serverFilterOptions.value.periodMonths))
const channelOptions = computed(() => withAllOption("All platforms", serverFilterOptions.value.channels))
const territoryOptions = computed(() => withAllOption("All countries", serverFilterOptions.value.territories))
const releaseOptions = computed(() => withAllOption("All releases", serverFilterOptions.value.releases))
const trackOptions = computed(() => withAllOption("All tracks", serverFilterOptions.value.tracks))
const selectedPeriodLabel = computed(() => periodOptions.value.find((option) => option.value === filters.periodMonth)?.label ?? filters.periodMonth)
const selectedPlatformLabel = computed(() => channelOptions.value.find((option) => option.value === filters.channelId)?.label ?? "Selected platform")
const selectedCountryLabel = computed(() => territoryOptionLabel(territoryOptions.value.find((option) => option.value === filters.territory) ?? {
  value: filters.territory,
  label: "Selected country",
}))
const selectedReleaseLabel = computed(() => releaseOptions.value.find((option) => option.value === filters.releaseId)?.label ?? "Selected release")
const selectedTrackLabel = computed(() => trackOptions.value.find((option) => option.value === filters.trackId)?.label ?? "Selected track")
const activeAnalyticsFilterLabels = computed(() => {
  const labels: string[] = []

  if (filters.periodMonth !== ALL_FILTER_VALUE) {
    labels.push(selectedPeriodLabel.value)
  }

  if (filters.channelId !== ALL_FILTER_VALUE) {
    labels.push(selectedPlatformLabel.value)
  }

  if (filters.territory !== ALL_FILTER_VALUE) {
    labels.push(selectedCountryLabel.value)
  }

  if (filters.releaseId !== ALL_FILTER_VALUE) {
    labels.push(selectedReleaseLabel.value)
  }

  if (filters.trackId !== ALL_FILTER_VALUE) {
    labels.push(selectedTrackLabel.value)
  }

  return labels
})
const analyticsScopeLabel = computed(() => [
  overviewPeriodLabel.value,
  ...activeAnalyticsFilterLabels.value,
].join(" / "))
const royaltyRowCountLabel = computed(() => (
  isRefreshingOverview.value
    ? "updating..."
    : `${summary.value.royaltyRowCount.toLocaleString()} royalty entries`
))
const audiencePulseCards = computed(() => audienceCards.value.map((card) => ({
  key: card.key,
  label: card.label,
  value: card.value,
  delta: card.delta,
  periodLabel: card.periodLabel ? `${card.periodLabel} / ${formatDelta(card.delta)}` : null,
  topCountry: card.topCountry,
  points: card.points,
})))

function formatCount(value: number | null | undefined) {
  return compactNumberFormatter.format(Number(value ?? 0))
}

function formatDelta(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "No prior"
  }

  if (value === 0) {
    return "No change"
  }

  return `${value > 0 ? "+" : ""}${formatCount(value)}`
}

function errorMessage(value: any, fallback: string) {
  return value?.statusMessage || value?.message || fallback
}

function optionExists(options: ArtistAnalyticsFilterOption[], value: string) {
  return value === ALL_FILTER_VALUE || options.some((option) => option.value === value)
}

function territoryOptionLabel(option: ArtistAnalyticsFilterOption) {
  if (option.value === ALL_FILTER_VALUE || option.value === EMPTY_FILTER_VALUE) {
    return option.label
  }

  return countryNameFor(option.value, option.label)
}

function selectPeriod(point: { key: string; label: string }) {
  filters.periodMonth = point.key
}

function selectCountry(country: { countryCode: string | null; countryName: string; revenue: number; share: number }) {
  filters.territory = country.countryCode || EMPTY_FILTER_VALUE
}

function clearCountryFilter() {
  filters.territory = ALL_FILTER_VALUE
}

function selectPlatform(row: { id: string; label: string; revenue: number; share: number }) {
  filters.channelId = row.id
}

function selectRelease(row: { id: string; label: string; value: number; count?: number }) {
  filters.releaseId = row.id
  filters.trackId = ALL_FILTER_VALUE
}

function resetFilters() {
  filters.periodMonth = ALL_FILTER_VALUE
  filters.channelId = ALL_FILTER_VALUE
  filters.territory = ALL_FILTER_VALUE
  filters.releaseId = ALL_FILTER_VALUE
  filters.trackId = ALL_FILTER_VALUE
  hideDockFloatingTooltip()
}

function setAnalyticsDetailExpanded(key: AnalyticsDetailKey, open: boolean) {
  expandedAnalyticsDetails[key] = open
}

function clampTooltipPosition(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function showDockFloatingTooltip(label: string, value: string, event: Event) {
  if (!analyticsDetailExpanded.value || !import.meta.client) {
    return
  }

  if (document.querySelector(".native-select-content")) {
    hideDockFloatingTooltip()
    return
  }

  const target = event.currentTarget

  if (!(target instanceof HTMLElement)) {
    return
  }

  const rect = target.getBoundingClientRect()
  const side: DockFloatingTooltipSide = window.innerWidth <= 960 || rect.left < 190 ? "right" : "left"
  const top = clampTooltipPosition(rect.top + rect.height / 2, 42, window.innerHeight - 42)
  const anchor = side === "right"
    ? clampTooltipPosition(rect.right + 10, 12, Math.max(12, window.innerWidth - 230))
    : Math.max(window.innerWidth - rect.left + 10, 12)

  dockFloatingTooltip.value = {
    label,
    value,
    side,
    top,
    anchor,
  }
}

function hideDockFloatingTooltip() {
  dockFloatingTooltip.value = null
}

async function loadOverview() {
  const requestId = ++overviewRequestId
  overviewPending.value = true
  overviewError.value = null

  try {
    const response = await $fetch("/api/dashboard/analytics", {
      query: { ...overviewQuery.value },
    }) as ArtistAnalyticsOverviewResponse

    if (requestId === overviewRequestId) {
      overviewData.value = response
    }
  } catch (error: any) {
    if (requestId === overviewRequestId) {
      overviewError.value = error
    }
  } finally {
    if (requestId === overviewRequestId) {
      overviewPending.value = false
    }
  }
}

async function loadAudience() {
  const requestId = ++audienceRequestId
  audiencePending.value = true
  audienceError.value = null

  try {
    const response = await $fetch("/api/dashboard/analytics/audience", {
      query: { ...audienceQuery.value },
    }) as ArtistAnalyticsAudienceResponse

    if (requestId === audienceRequestId) {
      audienceData.value = response
    }
  } catch (error: any) {
    if (requestId === audienceRequestId) {
      audienceError.value = error
    }
  } finally {
    if (requestId === audienceRequestId) {
      audiencePending.value = false
    }
  }
}

function refreshAll() {
  void loadOverview()
  void loadAudience()
}

watch(overviewPeriodRange, () => {
  filters.periodMonth = ALL_FILTER_VALUE
})

watch(periodOptions, (value) => {
  if (overviewData.value && !optionExists(value, filters.periodMonth)) {
    filters.periodMonth = ALL_FILTER_VALUE
  }
})

watch(channelOptions, (value) => {
  if (overviewData.value && !optionExists(value, filters.channelId)) {
    filters.channelId = ALL_FILTER_VALUE
  }
})

watch(territoryOptions, (value) => {
  if (overviewData.value && !optionExists(value, filters.territory)) {
    filters.territory = ALL_FILTER_VALUE
  }
})

watch(releaseOptions, (value) => {
  if (overviewData.value && !optionExists(value, filters.releaseId)) {
    filters.releaseId = ALL_FILTER_VALUE
    filters.trackId = ALL_FILTER_VALUE
  }
})

watch(trackOptions, (value) => {
  if (overviewData.value && !optionExists(value, filters.trackId)) {
    filters.trackId = ALL_FILTER_VALUE
  }
})

watch(overviewQuery, () => {
  void loadOverview()
}, { deep: true, immediate: true })

watch(audienceQuery, () => {
  void loadAudience()
}, { deep: true, immediate: true })

watch(analyticsDetailExpanded, (isExpanded) => {
  if (!isExpanded) {
    hideDockFloatingTooltip()
  }
})

watch(filterDocked, (isDocked) => {
  if (filterDockInteractiveTimer !== null) {
    clearTimeout(filterDockInteractiveTimer)
    filterDockInteractiveTimer = null
  }

  filterDockInteractive.value = false

  if (isDocked) {
    filterDockInteractiveTimer = setTimeout(() => {
      filterDockInteractive.value = true
      filterDockInteractiveTimer = null
    }, 140)
  }
})

function getFilterDockOffset(element: HTMLElement) {
  const rawTopbarHeight = getComputedStyle(element).getPropertyValue("--topbar-height").trim()
  const topbarHeight = Number.parseFloat(rawTopbarHeight) || 64

  return topbarHeight + 12
}

function updateFilterDockState() {
  const sentinel = filterDockSentinel.value

  if (!sentinel) {
    filterDocked.value = false
    return
  }

  const sentinelBottom = sentinel.getBoundingClientRect().bottom
  const dockOffset = getFilterDockOffset(sentinel)
  const shouldDock = filterDocked.value
    ? sentinelBottom <= dockOffset + 34
    : sentinelBottom <= dockOffset - 8

  if (filterDocked.value !== shouldDock) {
    filterDocked.value = shouldDock
  }
}

function scheduleFilterDockUpdate() {
  if (filterDockFrame !== null) {
    return
  }

  filterDockFrame = window.requestAnimationFrame(() => {
    filterDockFrame = null
    updateFilterDockState()
  })
}

function getScrollTarget(element: HTMLElement): HTMLElement | Window {
  let parent = element.parentElement

  while (parent && parent !== document.body) {
    const overflowY = getComputedStyle(parent).overflowY

    if (/(auto|scroll|overlay)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
      return parent
    }

    parent = parent.parentElement
  }

  return window
}

function removeFilterDockListeners() {
  filterDockObserver?.disconnect()
  filterDockObserver = null

  filterDockScrollTarget?.removeEventListener("scroll", scheduleFilterDockUpdate)
  filterDockScrollTarget = null
  window.removeEventListener("scroll", scheduleFilterDockUpdate, true)
  window.removeEventListener("resize", scheduleFilterDockUpdate)

  if (filterDockFrame !== null) {
    window.cancelAnimationFrame(filterDockFrame)
    filterDockFrame = null
  }
}

function setupFilterDockObserver(sentinel: HTMLElement | null) {
  removeFilterDockListeners()

  if (!sentinel) {
    filterDocked.value = false
    return
  }

  updateFilterDockState()

  filterDockScrollTarget = getScrollTarget(sentinel)
  filterDockScrollTarget.addEventListener("scroll", scheduleFilterDockUpdate, { passive: true })
  window.addEventListener("scroll", scheduleFilterDockUpdate, { capture: true, passive: true })
  window.addEventListener("resize", scheduleFilterDockUpdate, { passive: true })

  if ("IntersectionObserver" in window) {
    filterDockObserver = new IntersectionObserver(() => {
      updateFilterDockState()
    }, {
      rootMargin: `-${getFilterDockOffset(sentinel)}px 0px 0px 0px`,
      threshold: 0,
    })
    filterDockObserver.observe(sentinel)
  }
}

onMounted(() => {
  stopFilterDockWatch = watch(filterDockSentinel, (sentinel) => {
    setupFilterDockObserver(sentinel)
  }, { immediate: true, flush: "post" })
})

onBeforeUnmount(() => {
  stopFilterDockWatch?.()
  stopFilterDockWatch = null
  removeFilterDockListeners()

  if (filterDockInteractiveTimer !== null) {
    clearTimeout(filterDockInteractiveTimer)
    filterDockInteractiveTimer = null
  }
})
</script>

<template>
  <div class="page analytics-page">
    <PageHeader
      eyebrow="Artist view"
      title="Analytics"
      description="Revenue geography, platform mix, catalog momentum, and streaming activity from posted statements."
    />

    <div v-if="overviewError && !overviewData" class="tl-alerts">
      <AppAlert variant="destructive">{{ errorMessage(overviewError, "Unable to load analytics right now.") }}</AppAlert>
      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" @click="refreshAll">Retry</Button>
      </div>
    </div>

    <DashboardSkeleton v-else-if="isInitialOverviewLoading" layout="analytics" />

    <template v-else>
      <div ref="filterDockSentinel" class="filter-dock-sentinel" aria-hidden="true" />
      <Teleport to="body" :disabled="!analyticsDetailExpanded">
        <div
          class="analytics-toolbar"
          :class="{
            'is-updating': isRefreshingOverview,
            'is-docked': filterDocked || analyticsDetailExpanded,
            'is-dock-interactive': filterDockInteractive || analyticsDetailExpanded,
            'is-detail-expanded': analyticsDetailExpanded,
          }"
          :style="analyticsDetailDockStyle"
          :aria-busy="overviewPending ? 'true' : 'false'"
        >
          <div class="analytics-toolbar-copy">
            <span>Filters</span>
            <strong>{{ analyticsScopeLabel }} / {{ royaltyRowCountLabel }}</strong>
          </div>

          <div class="analytics-filter-strip">
            <label
              class="filter-control"
              :class="{ 'is-active': overviewPeriodRange !== DEFAULT_ANALYTICS_PERIOD_RANGE }"
              :title="analyticsDetailExpanded ? undefined : `Range: ${overviewPeriodLabel}`"
              @pointerenter="showDockFloatingTooltip('Range', overviewPeriodLabel, $event)"
              @pointerleave="hideDockFloatingTooltip"
              @pointerdown="hideDockFloatingTooltip"
              @mouseenter="showDockFloatingTooltip('Range', overviewPeriodLabel, $event)"
              @mouseleave="hideDockFloatingTooltip"
            >
              <span class="filter-dock-icon-shell" aria-hidden="true">
                <CalendarRange class="filter-dock-icon" />
              </span>
              <span class="filter-control-label">Range</span>
              <span class="filter-dock-tooltip" aria-hidden="true">
                <span>Range</span>
                <strong>{{ overviewPeriodLabel }}</strong>
              </span>
              <NativeSelect
                v-model="overviewPeriodRange"
                :content-align="dockSelectContentAlign"
                :content-class="dockSelectContentClass"
                :content-side="dockSelectContentSide"
                :content-side-offset="dockSelectContentSideOffset"
              >
                <option v-for="option in ANALYTICS_PERIOD_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </NativeSelect>
            </label>

          <label
            class="filter-control"
            :class="{ 'is-active': filters.periodMonth !== ALL_FILTER_VALUE }"
            :title="analyticsDetailExpanded ? undefined : `Period: ${selectedPeriodLabel}`"
            @pointerenter="showDockFloatingTooltip('Period', selectedPeriodLabel, $event)"
            @pointerleave="hideDockFloatingTooltip"
            @pointerdown="hideDockFloatingTooltip"
            @mouseenter="showDockFloatingTooltip('Period', selectedPeriodLabel, $event)"
            @mouseleave="hideDockFloatingTooltip"
          >
            <span class="filter-dock-icon-shell" aria-hidden="true">
              <CalendarDays class="filter-dock-icon" />
            </span>
            <span class="filter-control-label">Period</span>
            <span class="filter-dock-tooltip" aria-hidden="true">
              <span>Period</span>
              <strong>{{ selectedPeriodLabel }}</strong>
            </span>
            <NativeSelect
              v-model="filters.periodMonth"
              :content-align="dockSelectContentAlign"
              :content-class="dockSelectContentClass"
              :content-side="dockSelectContentSide"
              :content-side-offset="dockSelectContentSideOffset"
            >
              <option v-for="option in periodOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </label>

          <label
            class="filter-control"
            :class="{ 'is-active': filters.channelId !== ALL_FILTER_VALUE }"
            :title="analyticsDetailExpanded ? undefined : `Platform: ${selectedPlatformLabel}`"
            @pointerenter="showDockFloatingTooltip('Platform', selectedPlatformLabel, $event)"
            @pointerleave="hideDockFloatingTooltip"
            @pointerdown="hideDockFloatingTooltip"
            @mouseenter="showDockFloatingTooltip('Platform', selectedPlatformLabel, $event)"
            @mouseleave="hideDockFloatingTooltip"
          >
            <span class="filter-dock-icon-shell" aria-hidden="true">
              <RadioTower class="filter-dock-icon" />
            </span>
            <span class="filter-control-label">Platform</span>
            <span class="filter-dock-tooltip" aria-hidden="true">
              <span>Platform</span>
              <strong>{{ selectedPlatformLabel }}</strong>
            </span>
            <NativeSelect
              v-model="filters.channelId"
              :content-align="dockSelectContentAlign"
              :content-class="dockSelectContentClass"
              :content-side="dockSelectContentSide"
              :content-side-offset="dockSelectContentSideOffset"
            >
              <NativeSelectOption
                v-for="option in channelOptions"
                :key="option.value"
                :value="option.value"
                :visual="option.value === ALL_FILTER_VALUE ? null : {
                  kind: 'dsp',
                  logoKey: option.logoKey,
                  name: option.label,
                  label: option.label,
                }"
              >
                {{ option.label }}
              </NativeSelectOption>
            </NativeSelect>
          </label>

          <label
            class="filter-control"
            :class="{ 'is-active': filters.territory !== ALL_FILTER_VALUE }"
            :title="analyticsDetailExpanded ? undefined : `Country: ${selectedCountryLabel}`"
            @pointerenter="showDockFloatingTooltip('Country', selectedCountryLabel, $event)"
            @pointerleave="hideDockFloatingTooltip"
            @pointerdown="hideDockFloatingTooltip"
            @mouseenter="showDockFloatingTooltip('Country', selectedCountryLabel, $event)"
            @mouseleave="hideDockFloatingTooltip"
          >
            <span class="filter-dock-icon-shell" aria-hidden="true">
              <Globe2 class="filter-dock-icon" />
            </span>
            <span class="filter-control-label">Country</span>
            <span class="filter-dock-tooltip" aria-hidden="true">
              <span>Country</span>
              <strong>{{ selectedCountryLabel }}</strong>
            </span>
            <NativeSelect
              v-model="filters.territory"
              :content-align="dockSelectContentAlign"
              :content-class="dockSelectContentClass"
              :content-side="dockSelectContentSide"
              :content-side-offset="dockSelectContentSideOffset"
            >
              <NativeSelectOption
                v-for="option in territoryOptions"
                :key="option.value"
                :value="option.value"
                :visual="option.value === ALL_FILTER_VALUE || option.value === EMPTY_FILTER_VALUE ? null : {
                  kind: 'country',
                  code: option.value,
                  label: territoryOptionLabel(option),
                }"
              >
                {{ territoryOptionLabel(option) }}
              </NativeSelectOption>
            </NativeSelect>
          </label>

          <label
            class="filter-control"
            :class="{ 'is-active': filters.releaseId !== ALL_FILTER_VALUE }"
            :title="analyticsDetailExpanded ? undefined : `Release: ${selectedReleaseLabel}`"
            @pointerenter="showDockFloatingTooltip('Release', selectedReleaseLabel, $event)"
            @pointerleave="hideDockFloatingTooltip"
            @pointerdown="hideDockFloatingTooltip"
            @mouseenter="showDockFloatingTooltip('Release', selectedReleaseLabel, $event)"
            @mouseleave="hideDockFloatingTooltip"
          >
            <span class="filter-dock-icon-shell" aria-hidden="true">
              <Disc3 class="filter-dock-icon" />
            </span>
            <span class="filter-control-label">Release</span>
            <span class="filter-dock-tooltip" aria-hidden="true">
              <span>Release</span>
              <strong>{{ selectedReleaseLabel }}</strong>
            </span>
            <NativeSelect
              v-model="filters.releaseId"
              :content-align="dockSelectContentAlign"
              :content-class="dockSelectContentClass"
              :content-side="dockSelectContentSide"
              :content-side-offset="dockSelectContentSideOffset"
            >
              <NativeSelectOption
                v-for="option in releaseOptions"
                :key="option.value"
                :value="option.value"
                :visual="option.value === ALL_FILTER_VALUE ? null : {
                  kind: 'cover',
                  imageUrl: option.imageUrl,
                  label: option.label,
                }"
              >
                {{ option.label }}
              </NativeSelectOption>
            </NativeSelect>
          </label>

          <label
            class="filter-control"
            :class="{ 'is-active': filters.trackId !== ALL_FILTER_VALUE }"
            :title="analyticsDetailExpanded ? undefined : `Track: ${selectedTrackLabel}`"
            @pointerenter="showDockFloatingTooltip('Track', selectedTrackLabel, $event)"
            @pointerleave="hideDockFloatingTooltip"
            @pointerdown="hideDockFloatingTooltip"
            @mouseenter="showDockFloatingTooltip('Track', selectedTrackLabel, $event)"
            @mouseleave="hideDockFloatingTooltip"
          >
            <span class="filter-dock-icon-shell" aria-hidden="true">
              <AudioLines class="filter-dock-icon" />
            </span>
            <span class="filter-control-label">Track</span>
            <span class="filter-dock-tooltip" aria-hidden="true">
              <span>Track</span>
              <strong>{{ selectedTrackLabel }}</strong>
            </span>
            <NativeSelect
              v-model="filters.trackId"
              :content-align="dockSelectContentAlign"
              :content-class="dockSelectContentClass"
              :content-side="dockSelectContentSide"
              :content-side-offset="dockSelectContentSideOffset"
            >
              <NativeSelectOption
                v-for="option in trackOptions"
                :key="option.value"
                :value="option.value"
                :visual="option.value === ALL_FILTER_VALUE ? null : {
                  kind: 'cover',
                  imageUrl: option.imageUrl,
                  label: option.label,
                }"
              >
                {{ option.label }}
              </NativeSelectOption>
            </NativeSelect>
          </label>

            <Button
              variant="secondary"
              type="button"
            class="filter-reset-control"
            :title="analyticsDetailExpanded ? undefined : 'Reset filters'"
            aria-label="Reset filters"
            @pointerenter="showDockFloatingTooltip('Reset', 'Clear filters', $event)"
            @pointerleave="hideDockFloatingTooltip"
            @pointerdown="hideDockFloatingTooltip"
            @mouseenter="showDockFloatingTooltip('Reset', 'Clear filters', $event)"
            @mouseleave="hideDockFloatingTooltip"
            @click="resetFilters"
          >
              <RotateCcw class="filter-dock-icon" aria-hidden="true" />
              <span class="filter-reset-label">Reset</span>
              <span class="filter-dock-tooltip" aria-hidden="true">
                <span>Reset</span>
                <strong>Clear filters</strong>
              </span>
            </Button>
          </div>
        </div>
      </Teleport>
      <Teleport to="body">
        <div
          v-if="analyticsDetailExpanded && dockFloatingTooltip"
          class="filter-dock-floating-tooltip"
          :class="`is-${dockFloatingTooltip.side}`"
          :style="dockFloatingTooltipStyle"
          aria-hidden="true"
        >
          <span>{{ dockFloatingTooltip.label }}</span>
          <strong>{{ dockFloatingTooltip.value }}</strong>
        </div>
      </Teleport>

      <div class="analytics-kpi-grid stagger-enter">
        <StatCard
          v-for="metric in analyticsMetrics"
          :key="metric.label"
          :label="metric.label"
          :value="metric.value"
          :footnote="metric.footnote"
          :tone="metric.tone"
          :value-logo-key="metric.valueLogoKey"
        />
      </div>

      <AppEmptyState
        v-if="!hasAnyAnalyticsData"
        icon="chart"
        title="No analytics yet"
        description="Once earnings are posted, this cockpit will start filling in."
      />

      <div class="analytics-bento stagger-enter">
        <AnalyticsWorldMap
          class="analytics-bento-map analytics-bento-wide"
          title="World revenue map"
          eyebrow="Geography"
          summary="Countries are highlighted by filtered royalty revenue."
          :countries="countries"
          :selected-country-code="selectedCountryFilterCode"
          @select="selectCountry"
          @clear="clearCountryFilter"
        />

        <Card class="analytics-monthly-revenue-card analytics-panel analytics-bento-wide">
          <AnalyticsMonthlyRevenueChartPanel
            title="Monthly revenue"
            eyebrow="Monthly"
            :points="monthlyRevenue"
            :loading="overviewPending && !overviewData"
            :error="overviewError ? overviewError.statusMessage || 'Unable to load monthly revenue right now.' : null"
            empty-title="No monthly revenue"
            empty-description="No monthly revenue matches the current range."
            :fill-month-keys="monthlyRevenueChartMonthKeys"
            selectable
            @select-month="selectPeriod"
          />
        </Card>

        <AnalyticsPlatformMix
          title="Platform revenue trend"
          eyebrow="DSP signal"
          summary="Top DSPs shown as an interactive stacked revenue trend."
          :rows="platformRows"
          :series="platformSeries"
          :earnings-rows="overviewData?.earningsRows ?? []"
          enable-data-view
          @select-platform="selectPlatform"
          @select-period="selectPeriod"
          @detail-open-change="(open) => setAnalyticsDetailExpanded('platform', open)"
        />

        <AnalyticsRankPanel
          title="Catalog momentum"
          eyebrow="Releases"
          summary="Top releases by visible royalty revenue."
          :rows="releaseRows"
          enable-data-view
          @select="selectRelease"
          @detail-open-change="(open) => setAnalyticsDetailExpanded('catalog', open)"
        />

        <div
          class="analytics-bento-wide analytics-audience-panel"
          :class="{ 'is-updating': isRefreshingAudience }"
          :aria-busy="audiencePending ? 'true' : 'false'"
        >
          <AnalyticsAudiencePulse
            title="Top 5 streams by DSP"
            eyebrow="Streaming stores"
            summary="Top streaming stores in the selected date range. Open detail for every DSP."
            :cards="audiencePulseCards"
            enable-data-view
            @detail-open-change="(open) => setAnalyticsDetailExpanded('streams', open)"
          />
        </div>

        <AppAlert v-if="audienceError && !audienceData" variant="destructive" class="analytics-bento-wide">
          {{ errorMessage(audienceError, "Unable to load stream analytics right now.") }}
        </AppAlert>
      </div>
    </template>
  </div>
</template>

<style scoped>
.analytics-page {
  gap: 24px;
}

.tl-alerts {
  display: grid;
  gap: 8px;
}

.filter-dock-sentinel {
  width: 100%;
  height: 1px;
  margin-bottom: -1px;
  pointer-events: none;
}

.analytics-toolbar {
  --filter-morph-duration: 320ms;
  --filter-morph-ease: cubic-bezier(0.22, 1, 0.36, 1);
  position: sticky;
  z-index: 45;
  top: calc(var(--topbar-height, 64px) + 10px);
  isolation: isolate;
  display: grid;
  gap: 16px;
  width: 100%;
  max-width: 100%;
  padding: 18px 20px;
  overflow: hidden;
  border: 1px solid var(--surface-border, var(--border));
  border-top: 2px solid color-mix(in srgb, var(--priority) 38%, var(--border));
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--shadow-card);
  transition:
    max-width var(--filter-morph-duration) var(--filter-morph-ease),
    border-color var(--duration-standard, 200ms) var(--ease-out),
    border-radius var(--filter-morph-duration) var(--filter-morph-ease),
    box-shadow var(--filter-morph-duration) var(--filter-morph-ease),
    gap var(--filter-morph-duration) var(--filter-morph-ease),
    padding var(--filter-morph-duration) var(--filter-morph-ease),
    transform var(--filter-morph-duration) var(--filter-morph-ease);
  will-change: max-width, padding, border-radius, transform;
}

:global(.dark .analytics-toolbar) {
  background: var(--card);
  box-shadow: var(--shadow-card);
}

.analytics-toolbar.is-docked {
  position: sticky;
  top: calc(var(--topbar-height, 64px) + 10px);
  z-index: 55;
  justify-self: stretch;
  width: 100%;
  max-width: 100%;
  gap: 0;
  padding: 0;
  overflow: visible;
  border-color: transparent;
  border-top-color: transparent;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  transform-origin: top center;
  transform: translateY(0) scale(1);
}

:global(.dark .analytics-toolbar.is-docked) {
  background: transparent;
  box-shadow: none;
}

.analytics-toolbar.is-updating::after,
.analytics-audience-panel.is-updating::after {
  content: "";
  position: absolute;
  z-index: 3;
  top: 0;
  left: -35%;
  width: 35%;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary) 88%, #fef9e7 12%), transparent);
  animation: analytics-loading-sweep 1.1s ease-in-out infinite;
}

.analytics-toolbar-copy {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  max-height: 28px;
  overflow: hidden;
  opacity: 1;
  transform: translateY(0);
  transition:
    max-height var(--filter-morph-duration) var(--filter-morph-ease),
    opacity var(--duration-standard, 200ms) var(--ease-out),
    transform var(--filter-morph-duration) var(--filter-morph-ease);
}

.analytics-toolbar-copy span {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.analytics-toolbar-copy strong {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.analytics-filter-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: end;
  transition:
    gap var(--filter-morph-duration) var(--filter-morph-ease),
    transform var(--filter-morph-duration) var(--filter-morph-ease);
}

.analytics-toolbar.is-docked .analytics-filter-strip {
  position: relative;
  isolation: isolate;
  width: fit-content;
  max-width: calc(100vw - 32px);
  justify-self: center;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: 1px solid color-mix(in srgb, var(--priority) 30%, var(--surface-border, var(--border)));
  border-radius: 18px;
  background: linear-gradient(180deg, #fffdf9 0%, #f4ecdc 100%);
  -webkit-backdrop-filter: blur(14px) saturate(1.08);
  backdrop-filter: blur(14px) saturate(1.08);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 82%),
    inset 0 -1px 0 rgb(138 106 40 / 12%),
    0 2px 7px rgb(90 70 38 / 14%),
    0 22px 42px -24px rgb(72 58 34 / 44%);
  transition:
    gap var(--filter-morph-duration) var(--filter-morph-ease),
    padding var(--filter-morph-duration) var(--filter-morph-ease),
    border-color var(--duration-standard, 200ms) var(--ease-out),
    box-shadow var(--duration-standard, 200ms) var(--ease-out),
    transform var(--filter-morph-duration) var(--filter-morph-ease);
}

.analytics-toolbar.is-docked .analytics-filter-strip::before {
  position: absolute;
  z-index: -1;
  inset: -4px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgb(255 253 247 / 82%) 0%, rgb(225 216 197 / 60%) 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 55%),
    0 18px 34px -30px rgb(66 52 30 / 46%);
  content: "";
  pointer-events: none;
}

:global(.dark .analytics-toolbar.is-docked .analytics-filter-strip) {
  border-color: color-mix(in srgb, var(--priority) 18%, rgb(254 249 231 / 14%));
  background:
    radial-gradient(circle at 50% -30%, rgb(255 216 64 / 8%), transparent 60%),
    linear-gradient(180deg, #0a0a0a 0%, #030303 100%) !important;
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
  backdrop-filter: blur(14px) saturate(1.05);
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 10%),
    inset 0 -1px 0 rgb(0 0 0 / 92%),
    0 0 0 1px color-mix(in srgb, var(--priority) 8%, transparent),
    0 2px 7px rgb(0 0 0 / 70%),
    0 22px 42px -24px rgb(0 0 0 / 92%);
}

:global(.dark .analytics-toolbar.is-docked .analytics-filter-strip::before) {
  background: linear-gradient(180deg, rgb(28 28 28 / 82%) 0%, rgb(4 4 4 / 72%) 100%);
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 7%),
    0 18px 36px -28px rgb(0 0 0 / 95%);
}

:global(.light .analytics-toolbar.is-docked .analytics-filter-strip) {
  border-color: color-mix(in srgb, var(--priority) 36%, var(--surface-border, var(--border)));
  background:
    radial-gradient(circle at 50% -28%, rgb(255 221 72 / 16%), transparent 58%),
    linear-gradient(180deg, #fffef9 0%, #f3ead8 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 86%),
    inset 0 -1px 0 rgb(138 106 40 / 13%),
    0 2px 8px rgb(130 96 28 / 14%),
    0 22px 42px -24px rgb(72 58 34 / 46%);
}

.filter-control {
  position: relative;
  display: grid;
  gap: 6px;
  width: min(220px, 100%);
  min-width: 0;
  transition:
    transform var(--filter-morph-duration) var(--filter-morph-ease);
}

.filter-control-label {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
  transition:
    color var(--duration-fast, 150ms) var(--ease-out),
    opacity var(--duration-standard, 200ms) var(--ease-out),
    transform var(--duration-standard, 200ms) var(--ease-out);
}

.filter-dock-icon-shell {
  position: absolute;
  z-index: 2;
  top: 7px;
  left: 7px;
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  opacity: 0;
  pointer-events: none;
  transform: translateY(8px) scale(0.72) rotate(-8deg);
  visibility: hidden;
  transition:
    opacity var(--duration-standard, 200ms) var(--ease-out),
    transform var(--duration-moderate, 300ms) var(--ease-spring),
    visibility 0s linear var(--duration-standard, 200ms);
  will-change: opacity, transform;
}

.filter-dock-tooltip {
  position: absolute;
  z-index: 8;
  top: calc(100% + 10px);
  bottom: auto;
  left: 50%;
  display: grid;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, -6px) scale(0.97);
  visibility: hidden;
}

.filter-reset-control .filter-dock-icon {
  display: block;
  width: 0;
  height: 18px;
  opacity: 0;
  transform: translateY(5px) scale(0.72) rotate(-18deg);
  transition:
    width var(--filter-morph-duration) var(--filter-morph-ease),
    opacity var(--duration-standard, 200ms) var(--ease-out),
    transform var(--duration-moderate, 300ms) var(--ease-spring);
}

.analytics-toolbar.is-docked .analytics-toolbar-copy {
  max-height: 0;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
  white-space: nowrap;
}

.analytics-toolbar.is-docked .filter-control {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  gap: 0;
  overflow: visible;
  border-radius: 14px;
  transform-origin: bottom center;
  transition:
    transform var(--filter-morph-duration) var(--filter-morph-ease),
    filter var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-toolbar.is-docked.is-dock-interactive .filter-control {
  transition:
    width var(--filter-morph-duration) var(--filter-morph-ease),
    transform var(--filter-morph-duration) var(--filter-morph-ease),
    filter var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-toolbar.is-docked .filter-control:hover,
.analytics-toolbar.is-docked .filter-control:focus-within,
.analytics-toolbar.is-docked .filter-control.is-active {
  width: 176px;
  z-index: 6;
  filter: none;
}

.analytics-toolbar.is-docked .filter-control:hover,
.analytics-toolbar.is-docked .filter-control:focus-within {
  transform: translateY(-3px);
}

.analytics-toolbar.is-docked .filter-control.is-active::after {
  position: absolute;
  right: 8px;
  bottom: 7px;
  z-index: 3;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--priority);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--card) 86%, transparent), 0 0 14px color-mix(in srgb, var(--priority) 70%, transparent);
  content: "";
  pointer-events: none;
}

.analytics-toolbar.is-docked .filter-control-label {
  position: absolute;
  z-index: 3;
  top: 10px;
  right: 30px;
  left: 54px;
  width: auto;
  min-width: 0;
  height: auto;
  overflow: hidden;
  clip: auto;
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--priority) 12%);
  font-size: 9px;
  opacity: 0;
  pointer-events: none;
  text-overflow: ellipsis;
  transform: translateY(5px) scale(0.96);
  transform-origin: left center;
  white-space: nowrap;
}

.analytics-toolbar.is-docked .filter-control:hover .filter-control-label,
.analytics-toolbar.is-docked .filter-control:focus-within .filter-control-label,
.analytics-toolbar.is-docked .filter-control.is-active .filter-control-label {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition-delay: 70ms;
}

.analytics-toolbar.is-docked .filter-dock-icon-shell {
  top: 8px;
  left: 8px;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: color-mix(in srgb, var(--foreground) 82%, var(--priority) 18%);
  box-shadow: none;
  opacity: 1;
  transform: translateY(0) scale(1) rotate(0deg);
  visibility: visible;
  transition:
    color var(--duration-fast, 150ms) var(--ease-out),
    opacity var(--duration-standard, 200ms) var(--ease-out),
    transform var(--duration-moderate, 300ms) var(--ease-spring),
    visibility 0s;
}

:global(.dark .analytics-toolbar.is-docked .filter-dock-icon-shell) {
  color: color-mix(in srgb, #fef9e7 84%, var(--priority) 16%);
  background: transparent;
  box-shadow: none;
}

:global(.light .analytics-toolbar.is-docked .filter-dock-icon-shell) {
  color: color-mix(in srgb, var(--foreground) 68%, var(--priority) 32%);
}

.analytics-toolbar.is-docked .filter-control:hover .filter-dock-icon-shell,
.analytics-toolbar.is-docked .filter-control:focus-within .filter-dock-icon-shell,
.analytics-toolbar.is-docked .filter-control.is-active .filter-dock-icon-shell {
  color: var(--priority);
  transform: translateY(0) scale(1.04);
}

.filter-dock-icon {
  width: 18px;
  height: 18px;
  stroke-width: 1.9;
}

.filter-control :deep([data-slot="native-select"]) {
  transition:
    height var(--filter-morph-duration) var(--filter-morph-ease),
    min-height var(--filter-morph-duration) var(--filter-morph-ease),
    padding var(--filter-morph-duration) var(--filter-morph-ease),
    border-color var(--duration-standard, 200ms) var(--ease-out),
    border-radius var(--filter-morph-duration) var(--filter-morph-ease),
    background-color var(--duration-standard, 200ms) var(--ease-out),
    box-shadow var(--duration-standard, 200ms) var(--ease-out);
}

.analytics-toolbar.is-docked .filter-control :deep([data-slot="native-select"]) {
  width: 100%;
  min-width: 0;
  height: 48px;
  min-height: 48px;
  padding: 0 26px 0 48px;
  border: 1px solid color-mix(in srgb, var(--priority) 22%, var(--surface-border, var(--border)));
  border-radius: 14px;
  background: linear-gradient(180deg, #fffdf8 0%, #f6efdf 100%);
  color: var(--foreground);
  font-size: 13px;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 78%),
    inset 0 -1px 0 rgb(142 108 36 / 8%),
    0 8px 18px -16px rgb(10 10 10 / 48%);
  transition:
    height var(--filter-morph-duration) var(--filter-morph-ease),
    min-height var(--filter-morph-duration) var(--filter-morph-ease),
    padding var(--filter-morph-duration) var(--filter-morph-ease),
    border-color var(--duration-standard, 200ms) var(--ease-out),
    border-radius var(--filter-morph-duration) var(--filter-morph-ease),
    background-color var(--duration-standard, 200ms) var(--ease-out),
    box-shadow var(--duration-standard, 200ms) var(--ease-out);
}

:global(.dark .analytics-toolbar.is-docked .filter-control [data-slot="native-select"]) {
  border-color: color-mix(in srgb, var(--priority) 16%, rgb(254 249 231 / 12%));
  background:
    radial-gradient(circle at 50% -36%, rgb(255 216 64 / 8%), transparent 58%),
    linear-gradient(180deg, #151515 0%, #0d0d0d 100%);
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 8%),
    inset 0 -1px 0 rgb(0 0 0 / 86%),
    0 0 0 1px color-mix(in srgb, var(--priority) 7%, transparent),
    0 10px 20px -18px rgb(0 0 0 / 90%);
}

:global(.light .analytics-toolbar.is-docked .filter-control [data-slot="native-select"]) {
  border-color: color-mix(in srgb, var(--priority) 32%, var(--surface-border, var(--border)));
  background:
    radial-gradient(circle at 50% -34%, rgb(255 219 61 / 20%), transparent 58%),
    linear-gradient(180deg, #fffdf7 0%, #f7edda 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 84%),
    inset 0 -1px 0 rgb(142 108 36 / 11%),
    0 0 0 1px rgb(169 128 35 / 5%),
    0 9px 19px -16px rgb(80 61 28 / 50%);
}

.analytics-toolbar.is-docked .filter-control:hover :deep([data-slot="native-select"]),
.analytics-toolbar.is-docked .filter-control:focus-within :deep([data-slot="native-select"]),
.analytics-toolbar.is-docked .filter-control.is-active :deep([data-slot="native-select"]) {
  border-color: color-mix(in srgb, var(--priority) 32%, var(--surface-border, var(--border)));
  background: linear-gradient(180deg, #fffefa 0%, #fbf4e7 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 86%),
    inset 0 -1px 0 rgb(142 108 36 / 10%),
    0 12px 24px -18px rgb(10 10 10 / 50%);
}

:global(.dark .analytics-toolbar.is-docked .filter-control:hover [data-slot="native-select"]),
:global(.dark .analytics-toolbar.is-docked .filter-control:focus-within [data-slot="native-select"]),
:global(.dark .analytics-toolbar.is-docked .filter-control.is-active [data-slot="native-select"]) {
  border-color: rgb(254 249 231 / 20%);
  background: #161616;
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 10%),
    0 14px 26px -20px rgb(0 0 0 / 92%);
}

.analytics-toolbar.is-docked .filter-control:not(.is-active):not(:hover):not(:focus-within) :deep(.native-select-value) {
  opacity: 0;
  transform: translateX(-4px);
}

.analytics-toolbar.is-docked .filter-control:not(.is-active):not(:hover):not(:focus-within) :deep([data-slot="native-select"] > svg) {
  opacity: 0;
  transform: translate(-4px, -50%);
}

.analytics-toolbar.is-docked .filter-control :deep(.native-select-value) {
  transform: translateY(7px);
  transition:
    opacity var(--duration-standard, 200ms) var(--ease-out),
    transform var(--duration-standard, 200ms) var(--ease-out);
}

.analytics-toolbar.is-docked .filter-control :deep([data-slot="native-select"] > svg) {
  transform: translate(0, -50%);
  transition:
    opacity var(--duration-standard, 200ms) var(--ease-out),
    transform var(--duration-standard, 200ms) var(--ease-out);
}

.analytics-toolbar.is-docked .filter-dock-tooltip {
  position: absolute;
  z-index: 8;
  top: calc(100% + 10px);
  bottom: auto;
  left: 50%;
  display: grid;
  min-width: 124px;
  max-width: 220px;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--priority) 18%, var(--surface-border, var(--border)));
  border-radius: 12px;
  background: var(--popover);
  color: var(--popover-foreground);
  box-shadow: var(--shadow-md);
  transform: translate(-50%, -6px) scale(0.97);
  transition:
    opacity var(--duration-fast, 150ms) var(--ease-out),
    transform var(--duration-standard, 200ms) var(--ease-out),
    visibility 0s linear var(--duration-fast, 150ms);
}

.analytics-toolbar.is-docked .filter-dock-tooltip span {
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.analytics-toolbar.is-docked .filter-dock-tooltip strong {
  overflow: hidden;
  color: var(--popover-foreground);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-toolbar.is-docked .filter-control:hover .filter-dock-tooltip,
.analytics-toolbar.is-docked .filter-control:focus-within .filter-dock-tooltip,
.analytics-toolbar.is-docked .filter-reset-control:hover .filter-dock-tooltip,
.analytics-toolbar.is-docked .filter-reset-control:focus-visible .filter-dock-tooltip {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
  visibility: visible;
  transition-delay: 0s;
}

.analytics-toolbar.is-docked .filter-reset-control {
  position: relative;
  width: 44px;
  min-width: 44px;
  max-width: 44px;
  height: 44px;
  flex: 0 0 auto;
  min-height: 44px;
  max-height: 44px;
  aspect-ratio: 1;
  justify-content: center;
  gap: 0;
  padding: 0;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--priority) 44%, transparent);
  border-radius: 50% !important;
  background: linear-gradient(180deg, color-mix(in srgb, var(--priority) 92%, white 8%), var(--priority));
  color: var(--priority-foreground);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 36%),
    0 10px 22px -18px color-mix(in srgb, var(--priority) 70%, rgb(10 10 10 / 70%));
  transform-origin: bottom center;
  transition:
    transform var(--filter-morph-duration) var(--filter-morph-ease),
    box-shadow var(--duration-standard, 200ms) var(--ease-out);
}

.analytics-toolbar.is-docked.is-dock-interactive .filter-reset-control {
  transition:
    width var(--filter-morph-duration) var(--filter-morph-ease),
    max-width var(--filter-morph-duration) var(--filter-morph-ease),
    padding var(--filter-morph-duration) var(--filter-morph-ease),
    gap var(--duration-fast, 150ms) var(--ease-out),
    transform var(--filter-morph-duration) var(--filter-morph-ease),
    box-shadow var(--duration-standard, 200ms) var(--ease-out);
}

.analytics-toolbar.is-docked .filter-reset-control:hover,
.analytics-toolbar.is-docked .filter-reset-control:focus-visible {
  width: 44px;
  max-width: 44px;
  z-index: 6;
  justify-content: center;
  gap: 0;
  padding: 0;
  border-radius: 50% !important;
  transform: translateY(-3px);
}

:global(.dark .analytics-toolbar.is-docked .filter-reset-control) {
  border-color: color-mix(in srgb, var(--priority) 20%, rgb(254 249 231 / 14%));
  background:
    radial-gradient(circle at 50% -36%, rgb(255 216 64 / 10%), transparent 58%),
    linear-gradient(180deg, #171717 0%, #0f0f0f 100%);
  color: color-mix(in srgb, #fef9e7 86%, var(--priority) 14%);
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 8%),
    inset 0 -1px 0 rgb(0 0 0 / 88%),
    0 0 0 1px color-mix(in srgb, var(--priority) 8%, transparent),
    0 10px 20px -18px rgb(0 0 0 / 90%);
}

:global(.dark .analytics-toolbar.is-docked .filter-reset-control:hover),
:global(.dark .analytics-toolbar.is-docked .filter-reset-control:focus-visible) {
  border-color: rgb(254 249 231 / 22%);
  background: linear-gradient(180deg, #1c1c1c 0%, #111 100%);
}

.analytics-toolbar.is-docked .filter-reset-control .filter-dock-icon {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  opacity: 1;
  transform: translateY(0) scale(1) rotate(0deg);
}

.analytics-toolbar.is-docked .filter-reset-label {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateX(-6px);
  transition:
    max-width var(--filter-morph-duration) var(--filter-morph-ease),
    opacity var(--duration-fast, 150ms) var(--ease-out),
    transform var(--filter-morph-duration) var(--filter-morph-ease);
  white-space: nowrap;
}

.analytics-toolbar.is-docked .filter-reset-control:hover .filter-reset-label,
.analytics-toolbar.is-docked .filter-reset-control:focus-visible .filter-reset-label {
  max-width: 0;
  opacity: 0;
  transform: translateX(-6px);
}

.analytics-toolbar.is-docked.is-detail-expanded {
  --detail-dock-button-size: 44px;
  --detail-dock-effective-sheet-width: var(--analytics-detail-sheet-width, min(760px, calc(100vw - 18px)));
  --detail-dock-gap: 7px;
  --detail-dock-rail-width: 60px;
  --detail-dock-sheet-gap: 14px;
  position: fixed;
  z-index: 80;
  top: 50vh;
  right: calc(var(--detail-dock-effective-sheet-width) + var(--detail-dock-sheet-gap));
  left: auto;
  width: auto;
  max-width: none;
  padding: 0;
  pointer-events: auto;
  animation: analytics-detail-dock-enter 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform: translate(0, -50%);
}

.analytics-toolbar.is-docked.is-detail-expanded .analytics-filter-strip {
  display: grid;
  grid-auto-flow: row;
  grid-template-columns: var(--detail-dock-button-size);
  width: var(--detail-dock-rail-width);
  max-width: var(--detail-dock-rail-width);
  max-height: calc(100svh - 24px);
  gap: var(--detail-dock-gap);
  align-items: center;
  justify-content: end;
  justify-items: end;
  justify-self: end;
  overflow: visible;
  padding: 8px;
  border-radius: 24px;
  transform: none;
}

.analytics-toolbar.is-docked.is-detail-expanded .analytics-toolbar-copy {
  display: none;
}

.analytics-toolbar.is-docked.is-detail-expanded .analytics-filter-strip::before {
  inset: -3px;
  border-radius: 27px;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-control {
  width: var(--detail-dock-button-size);
  height: var(--detail-dock-button-size);
  max-width: var(--detail-dock-button-size);
  min-width: var(--detail-dock-button-size);
  overflow: visible;
  transform-origin: right center;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover,
.analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within,
.analytics-toolbar.is-docked.is-detail-expanded .filter-control.is-active {
  width: var(--detail-dock-button-size);
  max-width: var(--detail-dock-button-size);
  min-width: var(--detail-dock-button-size);
  transform: translateX(-4px) scale(1.03);
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-dock-tooltip {
  top: 50%;
  right: calc(100% + 10px);
  bottom: auto;
  left: auto;
  display: grid;
  min-width: 132px;
  max-width: min(220px, calc(100vw - 96px));
  padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, var(--foreground) 10%);
  border-radius: 13px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 96%, var(--foreground) 4%), var(--popover));
  box-shadow:
    0 16px 32px -22px rgb(0 0 0 / 58%),
    0 2px 10px rgb(0 0 0 / 14%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
  opacity: 0;
  transform: translate(8px, -50%) scale(0.97);
  visibility: hidden;
  transition:
    opacity 90ms var(--ease-out),
    transform 140ms var(--ease-out),
    visibility 0s linear 90ms;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover .filter-dock-tooltip,
.analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control:hover .filter-dock-tooltip {
  opacity: 1;
  transform: translate(0, -50%) scale(1);
  visibility: visible;
  transition-delay: 0s;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within:not(:hover) .filter-dock-tooltip,
.analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control:focus-visible:not(:hover) .filter-dock-tooltip {
  opacity: 0;
  transform: translate(8px, -50%) scale(0.97);
  visibility: hidden;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-dock-tooltip span {
  color: color-mix(in srgb, var(--muted-foreground) 84%, var(--foreground) 16%);
  font-size: 9px;
  letter-spacing: 0.085em;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-dock-tooltip strong {
  color: var(--popover-foreground);
  font-size: 12px;
  font-weight: 720;
}

:global(.dark .analytics-toolbar.is-docked.is-detail-expanded .filter-dock-tooltip) {
  border-color: rgb(254 249 231 / 12%);
  background: linear-gradient(180deg, #191919 0%, #101010 100%);
  box-shadow:
    0 18px 34px -22px rgb(0 0 0 / 86%),
    0 0 0 1px rgb(254 249 231 / 4%),
    inset 0 1px 0 rgb(254 249 231 / 7%);
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-dock-tooltip {
  display: none;
}

:global(.filter-dock-floating-tooltip) {
  position: fixed;
  z-index: 140;
  display: grid;
  min-width: 136px;
  max-width: min(228px, calc(100vw - 96px));
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 80%, var(--foreground) 10%);
  border-radius: 14px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--popover) 96%, var(--foreground) 4%), var(--popover));
  color: var(--popover-foreground);
  box-shadow:
    0 18px 38px -24px rgb(0 0 0 / 58%),
    0 2px 12px rgb(0 0 0 / 14%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
  pointer-events: none;
  transform: translate(var(--tooltip-enter-x, 0), -50%) scale(0.98);
  animation: filter-dock-floating-tooltip-in 120ms var(--ease-out) forwards;
}

:global(.filter-dock-floating-tooltip span) {
  color: color-mix(in srgb, var(--muted-foreground) 84%, var(--foreground) 16%);
  font-size: 9px;
  font-weight: 780;
  letter-spacing: 0.085em;
  line-height: 1.1;
  text-transform: uppercase;
}

:global(.filter-dock-floating-tooltip strong) {
  overflow: hidden;
  color: var(--popover-foreground);
  font-size: 12px;
  font-weight: 720;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark .filter-dock-floating-tooltip) {
  border-color: rgb(254 249 231 / 12%);
  background: linear-gradient(180deg, #191919 0%, #101010 100%);
  box-shadow:
    0 18px 36px -22px rgb(0 0 0 / 88%),
    0 0 0 1px rgb(254 249 231 / 4%),
    inset 0 1px 0 rgb(254 249 231 / 7%);
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-control-label,
.analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover .filter-control-label,
.analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within .filter-control-label,
.analytics-toolbar.is-docked.is-detail-expanded .filter-control.is-active .filter-control-label {
  opacity: 0;
  transform: translateY(4px) scale(0.96);
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-dock-icon-shell {
  top: 6px;
  left: 6px;
  width: calc(var(--detail-dock-button-size) - 12px);
  height: calc(var(--detail-dock-button-size) - 12px);
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-control :deep([data-slot="native-select"]) {
  width: var(--detail-dock-button-size);
  min-width: var(--detail-dock-button-size);
  height: var(--detail-dock-button-size);
  min-height: var(--detail-dock-button-size);
  padding: 0;
  border-radius: 16px;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover :deep([data-slot="native-select"]),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within :deep([data-slot="native-select"]),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control.is-active :deep([data-slot="native-select"]) {
  background: linear-gradient(180deg, #fffefa 0%, #fbf4e7 100%);
}

:global(.dark .analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover [data-slot="native-select"]),
:global(.dark .analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within [data-slot="native-select"]),
:global(.dark .analytics-toolbar.is-docked.is-detail-expanded .filter-control.is-active [data-slot="native-select"]) {
  background: #161616;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-control :deep(.native-select-value),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control :deep([data-slot="native-select"] > svg),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover :deep(.native-select-value),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover :deep([data-slot="native-select"] > svg),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within :deep(.native-select-value),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within :deep([data-slot="native-select"] > svg),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control.is-active :deep(.native-select-value),
.analytics-toolbar.is-docked.is-detail-expanded .filter-control.is-active :deep([data-slot="native-select"] > svg) {
  opacity: 0;
  transform: translate(-4px, -50%);
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control {
  width: var(--detail-dock-button-size);
  min-width: var(--detail-dock-button-size);
  max-width: var(--detail-dock-button-size);
  height: var(--detail-dock-button-size);
  min-height: var(--detail-dock-button-size);
  max-height: var(--detail-dock-button-size);
  justify-self: end;
  overflow: visible;
  transform-origin: right center;
}

.analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control:hover,
.analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control:focus-visible {
  width: var(--detail-dock-button-size);
  max-width: var(--detail-dock-button-size);
  transform: translateX(-4px) scale(1.03);
}

:global(.analytics-dock-select-content) {
  z-index: 90;
  width: min(270px, calc(100vw - 104px));
  min-width: min(220px, calc(100vw - 104px)) !important;
  max-width: min(270px, calc(100vw - 104px)) !important;
  max-height: min(360px, calc(100svh - 32px));
  border-radius: 16px;
  box-shadow:
    0 18px 42px -28px rgb(0 0 0 / 58%),
    0 2px 12px rgb(0 0 0 / 12%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
}

:global(.analytics-dock-select-content .native-select-viewport) {
  max-height: min(20rem, calc(100svh - 48px));
}

@keyframes analytics-detail-dock-enter {
  from {
    opacity: 0;
    transform: translate(calc(var(--detail-dock-effective-sheet-width) + var(--detail-dock-sheet-gap)), -50%) scale(0.985);
  }

  42% {
    opacity: 0.94;
  }

  to {
    opacity: 1;
    transform: translate(0, -50%) scale(1);
  }
}

@keyframes filter-dock-floating-tooltip-in {
  from {
    opacity: 0;
    transform: translate(var(--tooltip-enter-x, 0), -50%) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translate(0, -50%) scale(1);
  }
}

.analytics-kpi-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
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
  grid-column: 1 / -1;
  min-height: 100%;
}

.analytics-bento-wide {
  grid-column: 1 / -1;
}

.analytics-monthly-revenue-card {
  min-height: 100%;
  padding: 24px;
}

@keyframes analytics-loading-sweep {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(390%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .analytics-toolbar.is-updating::after,
  .analytics-audience-panel.is-updating::after {
    animation: none;
    left: 0;
    width: 100%;
    opacity: 0.7;
  }

  :global(.filter-dock-floating-tooltip) {
    animation: none;
    opacity: 1;
    transform: translate(0, -50%) scale(1);
  }
}

@media (max-width: 1180px) {
  .analytics-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-bento,
  .analytics-bento > *,
  .analytics-bento-map,
  .analytics-bento-wide {
    grid-column: auto;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .analytics-toolbar {
    top: calc(var(--topbar-height, 64px) + 8px);
    max-height: calc(100svh - var(--topbar-height, 64px) - 16px);
    padding: 16px;
    overflow-y: auto;
  }

  .analytics-toolbar-copy {
    display: grid;
  }

  .analytics-kpi-grid {
    grid-template-columns: 1fr;
  }

  .analytics-filter-strip {
    display: grid;
  }

  .filter-control {
    width: 100%;
  }

  .analytics-toolbar.is-docked {
    top: calc(var(--topbar-height, 64px) + 8px);
    justify-self: stretch;
    width: 100%;
    max-width: none;
    padding: 8px;
    overflow: visible;
    transform: none;
  }

  .analytics-toolbar.is-docked .analytics-filter-strip {
    display: flex;
    overflow-x: auto;
    padding: 4px 2px 6px;
    scrollbar-width: none;
  }

  .analytics-toolbar.is-docked .analytics-filter-strip::-webkit-scrollbar {
    display: none;
  }

  .analytics-toolbar.is-docked .filter-control:hover,
  .analytics-toolbar.is-docked .filter-control:focus-within,
  .analytics-toolbar.is-docked .filter-control.is-active {
    width: 162px;
  }

}

@media (max-width: 960px) {
  .analytics-toolbar.is-docked.is-detail-expanded {
    --detail-dock-button-size: 42px;
    --detail-dock-effective-sheet-width: calc(100vw - 88px);
    --detail-dock-gap: 6px;
    --detail-dock-rail-width: 56px;
    --detail-dock-sheet-gap: 14px;
  }

  .analytics-toolbar.is-docked.is-detail-expanded .analytics-filter-strip {
    justify-content: start;
    justify-items: start;
    justify-self: start;
  }

  .analytics-toolbar.is-docked.is-detail-expanded .filter-dock-tooltip {
    right: auto;
    left: calc(100% + 10px);
    max-width: min(210px, calc(100vw - 88px));
    transform: translate(-8px, -50%) scale(0.97);
  }

  .analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover .filter-dock-tooltip,
  .analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control:hover .filter-dock-tooltip {
    transform: translate(0, -50%) scale(1);
  }

  .analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within:not(:hover) .filter-dock-tooltip,
  .analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control:focus-visible:not(:hover) .filter-dock-tooltip {
    transform: translate(-8px, -50%) scale(0.97);
  }

  .analytics-toolbar.is-docked.is-detail-expanded .filter-control,
  .analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control {
    transform-origin: left center;
  }

  .analytics-toolbar.is-docked.is-detail-expanded .filter-control:hover,
  .analytics-toolbar.is-docked.is-detail-expanded .filter-control:focus-within,
  .analytics-toolbar.is-docked.is-detail-expanded .filter-control.is-active,
  .analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control:hover,
  .analytics-toolbar.is-docked.is-detail-expanded .filter-reset-control:focus-visible {
    transform: translateX(3px);
  }

  :global(.analytics-data-sheet) {
    width: calc(100vw - 88px) !important;
    max-width: calc(100vw - 88px) !important;
  }

  :global(.analytics-dock-select-content) {
    width: min(260px, calc(100vw - 96px));
    min-width: min(210px, calc(100vw - 96px)) !important;
    max-width: min(260px, calc(100vw - 96px)) !important;
  }
}

@media (max-width: 520px) {
  .analytics-toolbar.is-docked.is-detail-expanded {
    --detail-dock-button-size: 40px;
    --detail-dock-effective-sheet-width: calc(100vw - 72px);
    --detail-dock-gap: 6px;
    --detail-dock-rail-width: 52px;
    --detail-dock-sheet-gap: 10px;
  }

  :global(.analytics-data-sheet) {
    width: calc(100vw - 72px) !important;
    max-width: calc(100vw - 72px) !important;
  }

  :global(.analytics-dock-select-content) {
    width: min(236px, calc(100vw - 82px));
    min-width: min(190px, calc(100vw - 82px)) !important;
    max-width: min(236px, calc(100vw - 82px)) !important;
  }
}
</style>
