<script setup lang="ts">
import {
  AudioLines,
  CalendarDays,
  CalendarRange,
  Disc3,
  FileWarning,
  Globe2,
  Info,
  RadioTower,
  RotateCcw,
  UserRound,
} from "lucide-vue-next"
import AnalyticsExpandButton from "@/components/analytics/AnalyticsExpandButton.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ANALYTICS_PERIOD_OPTIONS,
  DEFAULT_ANALYTICS_PERIOD_RANGE,
  analyticsMonthRangeKeys,
  analyticsPeriodMonthDateKey,
  type AnalyticsPeriodRange,
} from "~~/app/utils/analytics-periods"
import { countryNameFor } from "~~/app/utils/country-flags"
import type {
  AdminAnalyticsFinancialArtistRow,
  AdminAnalyticsResponse,
  AdminAnalyticsRevenueRow,
} from "~~/types/admin"
import type {
  AdminReconciliationArtistResult,
  AdminReconciliationResponse,
  AdminReconciliationStatus,
} from "~~/types/settings"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const ALL_FILTER = "all"
const UNASSIGNED_CHANNEL = "__unassigned__"
const UNKNOWN_COUNTRY = "__unknown__"
const UNLINKED_RELEASE = "__unlinked_release__"
const UNLINKED_TRACK = "__unlinked_track__"

type InsightTone = "critical" | "warning" | "success" | "info"
type AdminContextKind = "overview" | "period" | "country" | "platform" | "artist" | "release" | "track"
type DiagnosticKey = "growth" | "drops" | "concentration" | "artistRisk" | "platformRpm" | "countryRpm" | "weakRpm" | "csvQuality"

interface FilterOption {
  value: string
  label: string
  logoKey?: string | null
  countryCode?: string | null
  imageUrl?: string | null
  meta?: string | null
}

interface AdminAnalyticsContext {
  kind: AdminContextKind
  id: string | null
  label: string
  meta: string
}

interface AggregateAccumulator {
  id: string
  label: string
  revenue: number
  streams: number
  rowCount: number
  logoKey: string | null
  countryCode: string | null
  imageUrl: string | null
  meta: string | null
  artistIds: Set<string>
  countryCodes: Set<string>
  releaseIds: Set<string>
  trackIds: Set<string>
  platformIds: Set<string>
  periodMonths: Set<string>
}

interface AggregateRow {
  id: string
  label: string
  revenue: number
  streams: number
  rowCount: number
  share: number
  rpm: number
  logoKey: string | null
  countryCode: string | null
  imageUrl: string | null
  meta: string | null
  artistCount: number
  countryCount: number
  releaseCount: number
  trackCount: number
  platformCount: number
  periodCount: number
}

interface GrowthRow {
  id: string
  label: string
  latestRevenue: number
  priorRevenue: number
  latestStreams: number
  priorStreams: number
  revenueDelta: number
  streamDelta: number
  revenueChangePct: number | null
  streamChangePct: number | null
  totalRevenue: number
  totalStreams: number
}

interface Recommendation {
  tone: InsightTone
  label: string
  title: string
  detail: string
  metric: string
}

interface CsvQualityDetailRow {
  key: string
  issue: string
  row: AdminAnalyticsRevenueRow
}

interface DiagnosticSummaryItem {
  label: string
  value: string
}

interface AdminDspStreamCard {
  key: string
  label: string
  value: number | null
  delta: number | null
  periodLabel: string | null
  topCountry: {
    countryCode: string | null
    countryName: string
    streams: number
  } | null
  points: Array<{
    label: string
    value: number
  }>
}

interface DiagnosticChartRow {
  id: string
  label: string
  value: string | number
  secondaryValue?: string | number | null
  secondaryLabel?: string | null
  meta?: string | null
  tone?: "positive" | "negative" | "warning" | "info" | "neutral"
  count?: number | null
  countryCode?: string | null
  share?: number | null
}

interface DiagnosticScatterPoint {
  id: string
  label: string
  x: string | number
  y: string | number
  value?: string | number | null
  meta?: string | null
  tone?: "positive" | "negative" | "warning" | "info" | "neutral"
}

type FinancialSortKey = "availableBalance" | "payoutExposure" | "totalEarned" | "totalPayouts" | "visibleRevenue"
type ActionSeverity = "critical" | "warning" | "info" | "success"

interface FinancialControlRow {
  artistId: string
  artistName: string
  visibleRevenue: number
  visibleStreams: number
  lifetimeEarned: number
  totalDues: number
  artistDues: number
  pendingPayouts: number
  approvedPayouts: number
  payoutExposure: number
  totalPayouts: number
  availableBalance: number
  payoutRatio: number
}

interface ActionQueueItem {
  severity: ActionSeverity
  label: string
  title: string
  detail: string
  metric: string
  priority: number
}

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
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

const analyticsFocus = reactive({
  artistId: ALL_FILTER,
  releaseId: ALL_FILTER,
  trackId: ALL_FILTER,
  channelId: ALL_FILTER,
  countryCode: ALL_FILTER,
  periodMonth: ALL_FILTER,
})
const overviewPeriodRange = ref<AnalyticsPeriodRange>(DEFAULT_ANALYTICS_PERIOD_RANGE)
const filterDockSentinel = ref<HTMLElement | null>(null)
const filterDocked = ref(false)
const filterMotionActive = ref(false)
const expandedDiagnostic = ref<DiagnosticKey | null>(null)
const rpmInfoOpen = ref(false)
const importCoverageIssueFilter = ref(ALL_FILTER)
const importCoveragePage = ref(1)
const importCoveragePageSize = ref(50)
const financialSort = ref<FinancialSortKey>("availableBalance")
const reconciliation = ref<AdminReconciliationResponse | null>(null)
const reconciliationPending = ref(false)
const reconciliationError = ref("")
const selectedDrilldown = ref<AdminAnalyticsContext>({
  kind: "overview",
  id: null,
  label: "Network overview",
  meta: "Posted CSV royalty revenue grouped across artists, catalog, DSPs, territories, and uploads.",
})
let filterDockObserver: IntersectionObserver | null = null

const { data, pending, error, refresh } = useLazyFetch<AdminAnalyticsResponse>("/api/admin/analytics", {
  query: computed(() => ({ periodRange: overviewPeriodRange.value })),
})

const revenueRows = computed(() => data.value?.revenueRows ?? [])
const financialArtists = computed(() => data.value?.financialArtists ?? [])
const isRefreshing = computed(() => pending.value && Boolean(data.value))
const filterBorderActive = computed(() => isRefreshing.value || filterMotionActive.value)
let filterMotionTimeout: number | null = null

function numeric(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function formatCount(value: string | number | null | undefined) {
  return compactNumberFormatter.format(numeric(value))
}

function formatMoney(value: string | number | null | undefined) {
  return `$${numeric(value).toFixed(2)}`
}

function formatShare(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1)}%`
}

function formatRpm(value: string | number | null | undefined) {
  return `$${numeric(value).toFixed(2)} RPM`
}

function rpm(revenue: number, streams: number) {
  return streams > 0 ? (revenue / streams) * 1000 : 0
}

function percentChange(current: number, prior: number) {
  if (prior === 0) {
    return current === 0 ? 0 : null
  }

  return ((current - prior) / Math.abs(prior)) * 100
}

function formatSignedPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "New"
  }

  if (value === 0) {
    return "Flat"
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
}

function sumBy<T>(rows: T[], valueFor: (row: T) => number) {
  return rows.reduce((sum, row) => sum + valueFor(row), 0)
}

function monthDate(value: string | null | undefined) {
  return value ? `${String(value).slice(0, 10)}T00:00:00Z` : ""
}

function formatMonth(value: string | null | undefined) {
  const date = new Date(monthDate(value))

  return Number.isNaN(date.getTime()) ? String(value ?? "Unknown period") : monthFormatter.format(date)
}

function formatShortMonth(value: string | null | undefined) {
  const date = new Date(monthDate(value))

  return Number.isNaN(date.getTime()) ? String(value ?? "Unknown") : compactMonthFormatter.format(date)
}

function revenueChannelKey(row: Pick<AdminAnalyticsRevenueRow, "channelId">) {
  return row.channelId || UNASSIGNED_CHANNEL
}

function revenueCountryKey(row: Pick<AdminAnalyticsRevenueRow, "countryCode">) {
  return row.countryCode || UNKNOWN_COUNTRY
}

function revenueReleaseKey(row: Pick<AdminAnalyticsRevenueRow, "releaseId">) {
  return row.releaseId || UNLINKED_RELEASE
}

function revenueTrackKey(row: Pick<AdminAnalyticsRevenueRow, "trackId">) {
  return row.trackId || UNLINKED_TRACK
}

function revenueUploadKey(row: Pick<AdminAnalyticsRevenueRow, "uploadId">) {
  return row.uploadId || "manual-or-legacy"
}

function rowMatches(selectedValue: string, rowValue: string) {
  return selectedValue === ALL_FILTER || rowValue === selectedValue
}

function uniqueOptions(
  rows: AdminAnalyticsRevenueRow[],
  keyFor: (row: AdminAnalyticsRevenueRow) => string,
  optionFor: (row: AdminAnalyticsRevenueRow, key: string) => FilterOption,
) {
  const options = new Map<string, FilterOption>()

  for (const row of rows) {
    const key = keyFor(row)

    if (!options.has(key)) {
      options.set(key, optionFor(row, key))
    }
  }

  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label))
}

function withAllOption(label: string, options: FilterOption[]) {
  return [{ value: ALL_FILTER, label }, ...options]
}

function optionLabel(options: FilterOption[], value: string, fallback: string) {
  return options.find((option) => option.value === value)?.label ?? fallback
}

function optionExists(options: FilterOption[], value: string) {
  return value === ALL_FILTER || options.some((option) => option.value === value)
}

const overviewPeriodLabel = computed(() => (
  ANALYTICS_PERIOD_OPTIONS.find((option) => option.value === overviewPeriodRange.value)?.label ?? "Last 6 months"
))

const artistOptions = computed(() => withAllOption("All artists", uniqueOptions(
  revenueRows.value,
  (row) => row.artistId,
  (row) => ({ value: row.artistId, label: row.artistName }),
)))
const releaseOptions = computed(() => withAllOption("All releases", uniqueOptions(
  revenueRows.value,
  revenueReleaseKey,
  (row, key) => ({
    value: key,
    label: row.releaseTitle || "No linked release",
    imageUrl: row.releaseCoverThumbUrl || row.releaseCoverArtUrl || null,
  }),
)))
const trackOptions = computed(() => withAllOption("All tracks", uniqueOptions(
  revenueRows.value.filter((row) => analyticsFocus.releaseId === ALL_FILTER || revenueReleaseKey(row) === analyticsFocus.releaseId),
  revenueTrackKey,
  (row, key) => ({
    value: key,
    label: row.trackIsrc ? `${row.trackTitle || "No linked track"} (${row.trackIsrc})` : row.trackTitle || "No linked track",
    imageUrl: row.releaseCoverThumbUrl || row.releaseCoverArtUrl || null,
  }),
)))
const channelOptions = computed(() => withAllOption("All platforms", uniqueOptions(
  revenueRows.value,
  revenueChannelKey,
  (row, key) => ({ value: key, label: row.channelName, logoKey: row.logoKey }),
)))
const countryOptions = computed(() => withAllOption("All countries", uniqueOptions(
  revenueRows.value,
  revenueCountryKey,
  (row, key) => ({
    value: key,
    label: key === UNKNOWN_COUNTRY ? "Unknown country" : countryNameFor(row.countryCode, row.countryName),
    countryCode: row.countryCode,
  }),
)))
const periodOptions = computed(() => withAllOption("All periods", uniqueOptions(
  revenueRows.value,
  (row) => row.periodMonth,
  (row) => ({ value: row.periodMonth, label: formatMonth(row.periodMonth) }),
).sort((left, right) => right.value.localeCompare(left.value))))

const selectedArtistLabel = computed(() => optionLabel(artistOptions.value, analyticsFocus.artistId, "Selected artist"))
const selectedReleaseLabel = computed(() => optionLabel(releaseOptions.value, analyticsFocus.releaseId, "Selected release"))
const selectedTrackLabel = computed(() => optionLabel(trackOptions.value, analyticsFocus.trackId, "Selected track"))
const selectedPlatformLabel = computed(() => optionLabel(channelOptions.value, analyticsFocus.channelId, "Selected platform"))
const selectedCountryLabel = computed(() => optionLabel(countryOptions.value, analyticsFocus.countryCode, "Selected country"))
const selectedPeriodLabel = computed(() => optionLabel(periodOptions.value, analyticsFocus.periodMonth, "Selected period"))

const filteredRevenueRows = computed(() => revenueRows.value.filter((row) => (
  rowMatches(analyticsFocus.artistId, row.artistId)
  && rowMatches(analyticsFocus.releaseId, revenueReleaseKey(row))
  && rowMatches(analyticsFocus.trackId, revenueTrackKey(row))
  && rowMatches(analyticsFocus.channelId, revenueChannelKey(row))
  && rowMatches(analyticsFocus.countryCode, revenueCountryKey(row))
  && rowMatches(analyticsFocus.periodMonth, row.periodMonth)
)))

function aggregateRows(
  rows: AdminAnalyticsRevenueRow[],
  keyFor: (row: AdminAnalyticsRevenueRow) => string,
  baseFor: (row: AdminAnalyticsRevenueRow, key: string) => Partial<AggregateAccumulator> & Pick<AggregateAccumulator, "label">,
) {
  const groups = new Map<string, AggregateAccumulator>()

  for (const row of rows) {
    const key = keyFor(row)
    const existing = groups.get(key)
    const group = existing ?? {
      id: key,
      label: baseFor(row, key).label,
      revenue: 0,
      streams: 0,
      rowCount: 0,
      logoKey: baseFor(row, key).logoKey ?? null,
      countryCode: baseFor(row, key).countryCode ?? null,
      imageUrl: baseFor(row, key).imageUrl ?? null,
      meta: baseFor(row, key).meta ?? null,
      artistIds: new Set<string>(),
      countryCodes: new Set<string>(),
      releaseIds: new Set<string>(),
      trackIds: new Set<string>(),
      platformIds: new Set<string>(),
      periodMonths: new Set<string>(),
    }

    const revenue = numeric(row.revenue)
    group.revenue += revenue
    group.streams += Number(row.streams ?? 0)
    group.rowCount += Number(row.rowCount ?? 1)
    group.artistIds.add(row.artistId)
    group.periodMonths.add(row.periodMonth)

    if (row.countryCode) {
      group.countryCodes.add(row.countryCode)
    }

    if (row.releaseId) {
      group.releaseIds.add(row.releaseId)
    }

    if (row.trackId) {
      group.trackIds.add(row.trackId)
    }

    if (row.channelId) {
      group.platformIds.add(row.channelId)
    }

    groups.set(key, group)
  }

  const totalRevenue = [...groups.values()].reduce((sum, row) => sum + row.revenue, 0) || 1

  return [...groups.values()]
    .map((group): AggregateRow => ({
      id: group.id,
      label: group.label,
      revenue: group.revenue,
      streams: group.streams,
      rowCount: group.rowCount,
      share: (group.revenue / totalRevenue) * 100,
      rpm: rpm(group.revenue, group.streams),
      logoKey: group.logoKey,
      countryCode: group.countryCode,
      imageUrl: group.imageUrl,
      meta: group.meta,
      artistCount: group.artistIds.size,
      countryCount: group.countryCodes.size,
      releaseCount: group.releaseIds.size,
      trackCount: group.trackIds.size,
      platformCount: group.platformIds.size,
      periodCount: group.periodMonths.size,
    }))
    .sort((left, right) => right.revenue - left.revenue)
}

const summaryStats = computed(() => {
  const rows = filteredRevenueRows.value
  const totalRevenue = rows.reduce((sum, row) => sum + numeric(row.revenue), 0)
  const totalStreams = rows.reduce((sum, row) => sum + Number(row.streams ?? 0), 0)
  const csvRowCount = rows.reduce((sum, row) => sum + Number(row.rowCount ?? 1), 0)

  return {
    totalRevenue,
    totalStreams,
    csvRowCount,
    groupedRowCount: rows.length,
    artistCount: new Set(rows.map((row) => row.artistId)).size,
    releaseCount: new Set(rows.map((row) => row.releaseId).filter(Boolean)).size,
    trackCount: new Set(rows.map((row) => row.trackId).filter(Boolean)).size,
    countryCount: new Set(rows.map((row) => row.countryCode).filter(Boolean)).size,
    platformCount: new Set(rows.map((row) => row.channelId).filter(Boolean)).size,
    uploadCount: new Set(rows.map(revenueUploadKey)).size,
    periodCount: new Set(rows.map((row) => row.periodMonth)).size,
    rpm: rpm(totalRevenue, totalStreams),
  }
})

const artistLeaderboard = computed(() => aggregateRows(filteredRevenueRows.value, (row) => row.artistId, (row) => ({
  label: row.artistName,
})))
const releaseLeaderboard = computed(() => aggregateRows(filteredRevenueRows.value, revenueReleaseKey, (row) => ({
  label: row.releaseTitle || "No linked release",
  imageUrl: row.releaseCoverThumbUrl || row.releaseCoverArtUrl || null,
})))
const trackLeaderboard = computed(() => aggregateRows(filteredRevenueRows.value, revenueTrackKey, (row) => ({
  label: row.trackTitle || "No linked track",
  imageUrl: row.releaseCoverThumbUrl || row.releaseCoverArtUrl || null,
  meta: row.trackIsrc,
})))
const platformBreakdown = computed(() => aggregateRows(filteredRevenueRows.value, revenueChannelKey, (row) => ({
  label: row.channelName,
  logoKey: row.logoKey,
})))
const countryBreakdown = computed(() => aggregateRows(filteredRevenueRows.value, revenueCountryKey, (row, key) => ({
  label: key === UNKNOWN_COUNTRY ? "Unknown country" : countryNameFor(row.countryCode, row.countryName),
  countryCode: row.countryCode,
})))

const monthlyRevenue = computed(() => {
  const groups = new Map<string, { revenue: number; streams: number; rowCount: number }>()

  for (const row of filteredRevenueRows.value) {
    const existing = groups.get(row.periodMonth) ?? { revenue: 0, streams: 0, rowCount: 0 }
    existing.revenue += numeric(row.revenue)
    existing.streams += Number(row.streams ?? 0)
    existing.rowCount += Number(row.rowCount ?? 1)
    groups.set(row.periodMonth, existing)
  }

  return [...groups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([periodMonth, value]) => ({ periodMonth, ...value }))
})

const monthlyRevenueChartMonthKeys = computed(() => {
  if (analyticsFocus.periodMonth !== ALL_FILTER) {
    return [analyticsFocus.periodMonth]
  }

  const rangeMonthKeys = analyticsMonthRangeKeys(overviewPeriodRange.value)

  if (rangeMonthKeys) {
    return rangeMonthKeys
  }

  return [...new Set(monthlyRevenue.value.map((point) => point.periodMonth).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
})

const platformSeries = computed(() => {
  const byPlatform = new Map<string, { label: string; points: Map<string, number>; total: number }>()

  for (const row of filteredRevenueRows.value) {
    const key = revenueChannelKey(row)
    const existing = byPlatform.get(key) ?? { label: row.channelName, points: new Map<string, number>(), total: 0 }
    const revenue = numeric(row.revenue)

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

const dspStreamPulseCards = computed<AdminDspStreamCard[]>(() => {
  const byPlatform = new Map<string, {
    label: string
    points: Map<string, number>
    countryStreams: Map<string, { countryCode: string | null; countryName: string; streams: number }>
    total: number
  }>()

  for (const row of filteredRevenueRows.value) {
    const platformKey = revenueChannelKey(row)
    const platform = byPlatform.get(platformKey) ?? {
      label: row.channelName || "Unassigned DSP",
      points: new Map<string, number>(),
      countryStreams: new Map<string, { countryCode: string | null; countryName: string; streams: number }>(),
      total: 0,
    }
    const streams = Number(row.streams ?? 0)
    const countryKey = revenueCountryKey(row)
    const country = platform.countryStreams.get(countryKey) ?? {
      countryCode: row.countryCode,
      countryName: countryKey === UNKNOWN_COUNTRY ? "Unknown country" : countryNameFor(row.countryCode, row.countryName),
      streams: 0,
    }

    platform.points.set(row.periodMonth, (platform.points.get(row.periodMonth) ?? 0) + streams)
    platform.total += streams
    country.streams += streams
    platform.countryStreams.set(countryKey, country)
    byPlatform.set(platformKey, platform)
  }

  return [...byPlatform.entries()]
    .map(([key, platform]) => {
      const points = [...platform.points.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([periodMonth, value]) => ({
          label: formatShortMonth(periodMonth),
          value,
        }))
      const latestPoint = points.at(-1) ?? null
      const priorPoint = points.at(-2) ?? null
      const topCountry = [...platform.countryStreams.values()].sort((left, right) => right.streams - left.streams)[0] ?? null

      return {
        key: `admin:${key}:streams`,
        label: `${platform.label} streams`,
        value: latestPoint?.value ?? null,
        delta: latestPoint && priorPoint ? latestPoint.value - priorPoint.value : null,
        periodLabel: latestPoint?.label ?? null,
        topCountry,
        points,
        total: platform.total,
      }
    })
    .filter((card) => card.total > 0)
    .sort((left, right) => right.total - left.total)
    .slice(0, 8)
})

function buildGrowthRows(
  rows: AdminAnalyticsRevenueRow[],
  keyFor: (row: AdminAnalyticsRevenueRow) => string,
  labelFor: (row: AdminAnalyticsRevenueRow) => string,
) {
  const groups = new Map<string, { label: string; months: Map<string, { revenue: number; streams: number }> }>()

  for (const row of rows) {
    const key = keyFor(row)
    const group = groups.get(key) ?? { label: labelFor(row), months: new Map<string, { revenue: number; streams: number }>() }
    const month = group.months.get(row.periodMonth) ?? { revenue: 0, streams: 0 }

    month.revenue += numeric(row.revenue)
    month.streams += Number(row.streams ?? 0)
    group.months.set(row.periodMonth, month)
    groups.set(key, group)
  }

  return [...groups.entries()]
    .map(([id, group]) => {
      const months = [...group.months.entries()].sort((left, right) => left[0].localeCompare(right[0]))
      const latest = months.at(-1)?.[1] ?? { revenue: 0, streams: 0 }
      const prior = months.at(-2)?.[1] ?? { revenue: 0, streams: 0 }
      const totalRevenue = months.reduce((sum, month) => sum + month[1].revenue, 0)
      const totalStreams = months.reduce((sum, month) => sum + month[1].streams, 0)

      return {
        id,
        label: group.label,
        latestRevenue: latest.revenue,
        priorRevenue: prior.revenue,
        latestStreams: latest.streams,
        priorStreams: prior.streams,
        revenueDelta: latest.revenue - prior.revenue,
        streamDelta: latest.streams - prior.streams,
        revenueChangePct: percentChange(latest.revenue, prior.revenue),
        streamChangePct: percentChange(latest.streams, prior.streams),
        totalRevenue,
        totalStreams,
      } satisfies GrowthRow
    })
    .filter((row) => row.latestRevenue > 0 || row.priorRevenue > 0 || row.latestStreams > 0 || row.priorStreams > 0)
}

const artistGrowthRows = computed(() => buildGrowthRows(filteredRevenueRows.value, (row) => row.artistId, (row) => row.artistName))
const artistGrowthDetailRows = computed(() => [...artistGrowthRows.value]
  .sort((left, right) => right.revenueDelta - left.revenueDelta || (right.revenueChangePct ?? -Infinity) - (left.revenueChangePct ?? -Infinity)))
const artistDeclineDetailRows = computed(() => [...artistGrowthRows.value]
  .sort((left, right) => left.revenueDelta - right.revenueDelta || (left.revenueChangePct ?? Infinity) - (right.revenueChangePct ?? Infinity)))
const fastestGrowingArtists = computed(() => artistGrowthDetailRows.value
  .filter((row) => row.revenueDelta > 0)
  .slice(0, 6))
const decliningArtists = computed(() => artistDeclineDetailRows.value
  .filter((row) => row.revenueDelta < 0)
  .slice(0, 6))

const topArtist = computed(() => artistLeaderboard.value[0] ?? null)
const topRelease = computed(() => releaseLeaderboard.value[0] ?? null)
const topTrack = computed(() => trackLeaderboard.value[0] ?? null)
const topPlatform = computed(() => platformBreakdown.value[0] ?? null)
const topCountry = computed(() => countryBreakdown.value[0] ?? null)

const concentrationRows = computed(() => [
  {
    label: "Top artist share",
    value: artistLeaderboard.value.slice(0, 1).reduce((sum, row) => sum + row.revenue, 0),
    share: artistLeaderboard.value[0]?.share ?? 0,
    detail: topArtist.value?.label ?? "No artist",
  },
  {
    label: "Top 5 artists",
    value: artistLeaderboard.value.slice(0, 5).reduce((sum, row) => sum + row.revenue, 0),
    share: summaryStats.value.totalRevenue ? (artistLeaderboard.value.slice(0, 5).reduce((sum, row) => sum + row.revenue, 0) / summaryStats.value.totalRevenue) * 100 : 0,
    detail: `${Math.min(5, artistLeaderboard.value.length)} artists`,
  },
  {
    label: "Top 10 tracks",
    value: trackLeaderboard.value.slice(0, 10).reduce((sum, row) => sum + row.revenue, 0),
    share: summaryStats.value.totalRevenue ? (trackLeaderboard.value.slice(0, 10).reduce((sum, row) => sum + row.revenue, 0) / summaryStats.value.totalRevenue) * 100 : 0,
    detail: `${Math.min(10, trackLeaderboard.value.length)} tracks`,
  },
  {
    label: "Top platform share",
    value: platformBreakdown.value.slice(0, 1).reduce((sum, row) => sum + row.revenue, 0),
    share: topPlatform.value?.share ?? 0,
    detail: topPlatform.value?.label ?? "No platform",
  },
])

const concentrationDetailRows = computed(() => [
  ...artistLeaderboard.value.map((row) => ({ ...row, kind: "Artist" as const })),
  ...trackLeaderboard.value.map((row) => ({ ...row, kind: "Track" as const })),
  ...releaseLeaderboard.value.map((row) => ({ ...row, kind: "Release" as const })),
  ...platformBreakdown.value.map((row) => ({ ...row, kind: "Platform" as const })),
].sort((left, right) => right.share - left.share || right.revenue - left.revenue))

const catalogDependencyDetailRows = computed(() => {
  const byArtist = new Map<string, { label: string; total: number; tracks: Map<string, { id: string; label: string; revenue: number; streams: number }> }>()

  for (const row of filteredRevenueRows.value) {
    const artist = byArtist.get(row.artistId) ?? { label: row.artistName, total: 0, tracks: new Map<string, { id: string; label: string; revenue: number; streams: number }>() }
    const trackKey = revenueTrackKey(row)
    const track = artist.tracks.get(trackKey) ?? { id: trackKey, label: row.trackTitle || "No linked track", revenue: 0, streams: 0 }
    const revenue = numeric(row.revenue)

    artist.total += revenue
    track.revenue += revenue
    track.streams += Number(row.streams ?? 0)
    artist.tracks.set(trackKey, track)
    byArtist.set(row.artistId, artist)
  }

  return [...byArtist.entries()]
    .map(([artistId, artist]) => {
      const top = [...artist.tracks.values()].sort((left, right) => right.revenue - left.revenue)[0] ?? null

      return {
        artistId,
        artistName: artist.label,
        trackId: top?.id ?? UNLINKED_TRACK,
        trackTitle: top?.label ?? "No track",
        revenue: top?.revenue ?? 0,
        streams: top?.streams ?? 0,
        artistRevenue: artist.total,
        share: artist.total ? ((top?.revenue ?? 0) / artist.total) * 100 : 0,
      }
    })
    .filter((row) => row.revenue > 0)
    .sort((left, right) => right.share - left.share)
})
const catalogDependencyRows = computed(() => catalogDependencyDetailRows.value.slice(0, 6))

const platformRpmRows = computed(() => platformBreakdown.value
  .filter((row) => row.streams > 0)
  .sort((left, right) => right.rpm - left.rpm))
const countryMarketRows = computed(() => [...countryBreakdown.value]
  .filter((row) => row.revenue > 0 || row.streams > 0)
  .sort((left, right) => right.revenue - left.revenue || right.streams - left.streams || right.rpm - left.rpm))
const lowRpmHighStreamTrackRows = computed(() => {
  const averageRpm = summaryStats.value.rpm
  const streamFloor = Math.max(1, summaryStats.value.totalStreams * 0.01)

  return trackLeaderboard.value
    .filter((row) => row.streams >= streamFloor && row.rpm < averageRpm * 0.55)
    .sort((left, right) => right.streams - left.streams)
})
const lowRpmHighStreamTracks = computed(() => lowRpmHighStreamTrackRows.value.slice(0, 6))

const latestMovement = computed(() => {
  const latest = monthlyRevenue.value.at(-1) ?? null
  const prior = monthlyRevenue.value.at(-2) ?? null

  return {
    latest,
    prior,
    revenueDelta: latest && prior ? latest.revenue - prior.revenue : 0,
    streamDelta: latest && prior ? latest.streams - prior.streams : 0,
    revenueChangePct: latest && prior ? percentChange(latest.revenue, prior.revenue) : null,
    streamChangePct: latest && prior ? percentChange(latest.streams, prior.streams) : null,
  }
})

const dataQuality = computed(() => {
  const rows = filteredRevenueRows.value
  const missingCountryRows = rows.filter((row) => !row.countryCode)
  const missingReleaseRows = rows.filter((row) => !row.releaseId)
  const missingTrackRows = rows.filter((row) => !row.trackId)
  const unassignedChannelRows = rows.filter((row) => !row.channelId)
  const revenueWithoutStreams = rows.filter((row) => numeric(row.revenue) > 0 && Number(row.streams ?? 0) <= 0)
  const streamsWithoutRevenue = rows.filter((row) => Number(row.streams ?? 0) > 0 && numeric(row.revenue) <= 0)

  return {
    missingCountryRows,
    missingReleaseRows,
    missingTrackRows,
    unassignedChannelRows,
    revenueWithoutStreams,
    streamsWithoutRevenue,
    missingCountryCsvRows: missingCountryRows.reduce((sum, row) => sum + Number(row.rowCount ?? 1), 0),
    missingReleaseCsvRows: missingReleaseRows.reduce((sum, row) => sum + Number(row.rowCount ?? 1), 0),
    missingTrackCsvRows: missingTrackRows.reduce((sum, row) => sum + Number(row.rowCount ?? 1), 0),
    unassignedChannelCsvRows: unassignedChannelRows.reduce((sum, row) => sum + Number(row.rowCount ?? 1), 0),
  }
})

const growthChartRows = computed<DiagnosticChartRow[]>(() => fastestGrowingArtists.value.map((artist) => ({
  id: artist.id,
  label: artist.label,
  value: artist.latestRevenue,
  secondaryValue: artist.priorRevenue,
  secondaryLabel: "Prior",
  meta: `${formatSignedPercent(artist.revenueChangePct)} / ${formatCount(artist.latestStreams)} streams`,
  tone: "positive",
  count: artist.latestStreams,
})))
const declineChartRows = computed<DiagnosticChartRow[]>(() => decliningArtists.value.map((artist) => ({
  id: artist.id,
  label: artist.label,
  value: artist.latestRevenue,
  secondaryValue: artist.priorRevenue,
  secondaryLabel: "Prior",
  meta: `${formatSignedPercent(artist.revenueChangePct)} / ${formatMoney(Math.abs(artist.revenueDelta))} decline`,
  tone: "negative",
  count: artist.latestStreams,
})))
const concentrationChartRows = computed<DiagnosticChartRow[]>(() => concentrationRows.value.map((item) => ({
  id: item.label,
  label: item.label,
  value: item.share,
  meta: `${item.detail} / ${formatMoney(item.value)}`,
  tone: item.share >= 75 ? "warning" : "info",
})))
const artistRiskChartRows = computed<DiagnosticChartRow[]>(() => catalogDependencyRows.value.map((item) => ({
  id: item.artistId,
  label: item.artistName,
  value: item.share,
  meta: `${item.trackTitle} / ${formatMoney(item.revenue)}`,
  tone: item.share >= 75 ? "negative" : "warning",
  count: item.streams,
})))
const platformRpmChartRows = computed<DiagnosticChartRow[]>(() => platformRpmRows.value.slice(0, 8).map((row) => ({
  id: row.id,
  label: row.label,
  value: row.rpm,
  meta: `${formatMoney(row.revenue)} / ${formatCount(row.streams)} streams`,
  tone: "info",
  count: row.streams,
})))
const countryRevenueChartRows = computed<DiagnosticChartRow[]>(() => countryMarketRows.value.slice(0, 8).map((row) => ({
  id: row.id,
  label: row.label,
  value: row.revenue,
  meta: `${formatCount(row.streams)} streams / ${formatRpm(row.rpm)}`,
  tone: "neutral",
  count: row.streams,
  countryCode: row.countryCode,
  share: row.share,
})))
const weakRpmScatterPoints = computed<DiagnosticScatterPoint[]>(() => lowRpmHighStreamTrackRows.value.slice(0, 18).map((row) => ({
  id: row.id,
  label: row.label,
  x: row.streams,
  y: row.rpm,
  value: row.revenue,
  meta: `${formatMoney(row.revenue)} / scope ${formatRpm(summaryStats.value.rpm)}`,
  tone: "negative",
})))
const importCoverageChartRows = computed<DiagnosticChartRow[]>(() => [
  {
    id: "Missing country",
    label: "Missing country",
    value: dataQuality.value.missingCountryCsvRows,
    meta: "CSV rows without listener territory",
    tone: "warning" as const,
  },
  {
    id: "Missing release",
    label: "Missing release",
    value: dataQuality.value.missingReleaseCsvRows,
    meta: "CSV rows not linked to release",
    tone: "warning" as const,
  },
  {
    id: "Missing track",
    label: "Missing track",
    value: dataQuality.value.missingTrackCsvRows,
    meta: "CSV rows not linked to track",
    tone: "warning" as const,
  },
  {
    id: "Unassigned DSP",
    label: "Unassigned DSP",
    value: dataQuality.value.unassignedChannelCsvRows,
    meta: "CSV rows without platform assignment",
    tone: "warning" as const,
  },
  {
    id: "Revenue no streams",
    label: "Revenue no streams",
    value: sumBy(dataQuality.value.revenueWithoutStreams, (row) => Number(row.rowCount ?? 1)),
    meta: "Revenue rows with zero streams",
    tone: "info" as const,
  },
  {
    id: "Streams no revenue",
    label: "Streams no revenue",
    value: sumBy(dataQuality.value.streamsWithoutRevenue, (row) => Number(row.rowCount ?? 1)),
    meta: "Stream rows with zero revenue",
    tone: "info" as const,
  },
].filter((row) => row.value > 0).sort((left, right) => right.value - left.value))

const csvQualityDetailRows = computed<CsvQualityDetailRow[]>(() => {
  const rows: CsvQualityDetailRow[] = []
  const addRows = (issue: string, issueRows: AdminAnalyticsRevenueRow[]) => {
    issueRows.forEach((row, index) => {
      rows.push({
        key: `${issue}:${row.periodMonth}:${row.artistId}:${revenueReleaseKey(row)}:${revenueTrackKey(row)}:${revenueChannelKey(row)}:${index}`,
        issue,
        row,
      })
    })
  }

  addRows("Missing country", dataQuality.value.missingCountryRows)
  addRows("Missing release", dataQuality.value.missingReleaseRows)
  addRows("Missing track", dataQuality.value.missingTrackRows)
  addRows("Unassigned DSP", dataQuality.value.unassignedChannelRows)
  addRows("Revenue no streams", dataQuality.value.revenueWithoutStreams)
  addRows("Streams no revenue", dataQuality.value.streamsWithoutRevenue)

  return rows.sort((left, right) => (
    left.issue.localeCompare(right.issue)
    || right.row.periodMonth.localeCompare(left.row.periodMonth)
    || left.row.artistName.localeCompare(right.row.artistName)
  ))
})

const importCoverageDialogOpen = computed({
  get: () => expandedDiagnostic.value === "csvQuality",
  set: (open: boolean) => {
    if (!open && expandedDiagnostic.value === "csvQuality") {
      expandedDiagnostic.value = null
    }
  },
})

const diagnosticSheetOpen = computed({
  get: () => expandedDiagnostic.value !== null && expandedDiagnostic.value !== "csvQuality",
  set: (open: boolean) => {
    if (!open) {
      expandedDiagnostic.value = null
    }
  },
})

const importCoverageIssueOptions = computed(() => [
  { value: ALL_FILTER, label: "All issues" },
  ...[...new Set(csvQualityDetailRows.value.map((item) => item.issue))]
    .sort((left, right) => left.localeCompare(right))
    .map((issue) => ({ value: issue, label: issue })),
])

const importCoverageFilteredRows = computed(() => csvQualityDetailRows.value.filter((item) => (
  importCoverageIssueFilter.value === ALL_FILTER || item.issue === importCoverageIssueFilter.value
)))

const importCoverageTotalRows = computed(() => importCoverageFilteredRows.value.length)
const importCoverageTotalPages = computed(() => Math.max(1, Math.ceil(importCoverageTotalRows.value / importCoveragePageSize.value)))
const importCoverageCurrentPage = computed(() => Math.min(Math.max(1, importCoveragePage.value), importCoverageTotalPages.value))
const importCoveragePagedRows = computed(() => {
  const start = (importCoverageCurrentPage.value - 1) * importCoveragePageSize.value

  return importCoverageFilteredRows.value.slice(start, start + importCoveragePageSize.value)
})
const importCoverageCsvRowCount = computed(() => (
  sumBy(importCoverageFilteredRows.value, (item) => Number(item.row.rowCount ?? 1))
))
const importCoverageSummary = computed(() => {
  if (!importCoverageTotalRows.value) {
    return "No rows in the current scope"
  }

  const start = (importCoverageCurrentPage.value - 1) * importCoveragePageSize.value + 1
  const end = Math.min(importCoverageCurrentPage.value * importCoveragePageSize.value, importCoverageTotalRows.value)

  return `Showing ${start.toLocaleString()}-${end.toLocaleString()} of ${importCoverageTotalRows.value.toLocaleString()} issue rows`
})

const diagnosticDetailInfo = computed(() => {
  switch (expandedDiagnostic.value) {
    case "growth":
      return {
        badge: "Growth",
        title: "Artist movement detail",
        description: "All artists with visible month-over-month movement inside the current filters.",
        rowCount: artistGrowthDetailRows.value.length,
      }
    case "drops":
      return {
        badge: "Drops",
        title: "Artist decline detail",
        description: "All artists sorted by the largest latest-month revenue decline in the current filters.",
        rowCount: artistDeclineDetailRows.value.length,
      }
    case "concentration":
      return {
        badge: "Concentration",
        title: "Portfolio dependency detail",
        description: "Full revenue concentration across artists, tracks, releases, and platforms.",
        rowCount: concentrationDetailRows.value.length,
      }
    case "artistRisk":
      return {
        badge: "Artist risk",
        title: "Single-track dependency detail",
        description: "All artists ranked by how much their top track carries visible revenue.",
        rowCount: catalogDependencyDetailRows.value.length,
      }
    case "platformRpm":
      return {
        badge: "Platform RPM",
        title: "Platform RPM detail",
        description: "Every platform with streams in scope, ranked by revenue per thousand streams.",
        rowCount: platformRpmRows.value.length,
      }
    case "countryRpm":
      return {
        badge: "Market",
        title: "Country market detail",
        description: "Every listener territory in scope, ranked by revenue impact with streams and RPM shown as supporting context.",
        rowCount: countryMarketRows.value.length,
      }
    case "weakRpm":
      return {
        badge: "Low RPM",
        title: "High-stream weak-earner detail",
        description: "All tracks above the stream threshold but below the current scope RPM benchmark.",
        rowCount: lowRpmHighStreamTrackRows.value.length,
      }
    case "csvQuality":
      return {
        badge: "CSV quality",
        title: "Import coverage detail",
        description: "Every grouped CSV analytics row contributing to coverage or revenue/stream mismatches.",
        rowCount: csvQualityDetailRows.value.length,
      }
    default:
      return null
  }
})

const diagnosticSheetSummary = computed<DiagnosticSummaryItem[]>(() => {
  switch (expandedDiagnostic.value) {
    case "growth":
      return [
        { label: "Artists", value: String(artistGrowthDetailRows.value.length) },
        { label: "Latest revenue", value: formatMoney(sumBy(artistGrowthDetailRows.value, (row) => row.latestRevenue)) },
        { label: "Prior revenue", value: formatMoney(sumBy(artistGrowthDetailRows.value, (row) => row.priorRevenue)) },
        { label: "Growing", value: String(artistGrowthDetailRows.value.filter((row) => row.revenueDelta > 0).length) },
      ]
    case "drops":
      return [
        { label: "Artists", value: String(artistDeclineDetailRows.value.length) },
        { label: "Declining", value: String(artistDeclineDetailRows.value.filter((row) => row.revenueDelta < 0).length) },
        { label: "Largest drop", value: formatMoney(Math.abs(artistDeclineDetailRows.value[0]?.revenueDelta ?? 0)) },
        { label: "Latest revenue", value: formatMoney(sumBy(artistDeclineDetailRows.value, (row) => row.latestRevenue)) },
      ]
    case "concentration":
      return [
        { label: "Rows", value: String(concentrationDetailRows.value.length) },
        { label: "Network revenue", value: formatMoney(summaryStats.value.totalRevenue) },
        { label: "Top share", value: formatShare(concentrationDetailRows.value[0]?.share ?? 0) },
        { label: "Scope RPM", value: formatRpm(summaryStats.value.rpm) },
      ]
    case "artistRisk":
      return [
        { label: "Artists", value: String(catalogDependencyDetailRows.value.length) },
        { label: "High risk", value: String(catalogDependencyDetailRows.value.filter((row) => row.share >= 75).length) },
        { label: "Top share", value: formatShare(catalogDependencyDetailRows.value[0]?.share ?? 0) },
        { label: "Top-track revenue", value: formatMoney(sumBy(catalogDependencyDetailRows.value, (row) => row.revenue)) },
      ]
    case "platformRpm":
      return [
        { label: "Platforms", value: String(platformRpmRows.value.length) },
        { label: "Best RPM", value: formatRpm(platformRpmRows.value[0]?.rpm ?? 0) },
        { label: "Revenue", value: formatMoney(sumBy(platformRpmRows.value, (row) => row.revenue)) },
        { label: "Streams", value: formatCount(sumBy(platformRpmRows.value, (row) => row.streams)) },
      ]
    case "countryRpm":
      return [
        { label: "Countries", value: String(countryMarketRows.value.length) },
        { label: "Top market", value: countryMarketRows.value[0]?.label ?? "No country" },
        { label: "Revenue", value: formatMoney(sumBy(countryMarketRows.value, (row) => row.revenue)) },
        { label: "Streams", value: formatCount(sumBy(countryMarketRows.value, (row) => row.streams)) },
      ]
    case "weakRpm":
      return [
        { label: "Tracks", value: String(lowRpmHighStreamTrackRows.value.length) },
        { label: "Streams", value: formatCount(sumBy(lowRpmHighStreamTrackRows.value, (row) => row.streams)) },
        { label: "Revenue", value: formatMoney(sumBy(lowRpmHighStreamTrackRows.value, (row) => row.revenue)) },
        { label: "Scope RPM", value: formatRpm(summaryStats.value.rpm) },
      ]
    case "csvQuality":
      return [
        { label: "Issue rows", value: String(csvQualityDetailRows.value.length) },
        { label: "CSV rows", value: sumBy(csvQualityDetailRows.value, (item) => Number(item.row.rowCount ?? 1)).toLocaleString() },
        { label: "Grouped rows", value: String(new Set(csvQualityDetailRows.value.map((item) => item.key.replace(/:[0-9]+$/, ""))).size) },
        { label: "Data gaps", value: String(dataQuality.value.missingCountryRows.length + dataQuality.value.missingReleaseRows.length + dataQuality.value.missingTrackRows.length) },
      ]
    default:
      return []
  }
})

const rpmExampleRow = computed(() => (
  countryMarketRows.value.find((row) => row.revenue > 0 && row.streams > 0)
  ?? platformRpmRows.value.find((row) => row.revenue > 0 && row.streams > 0)
  ?? trackLeaderboard.value.find((row) => row.revenue > 0 && row.streams > 0)
  ?? null
))

const rpmExampleFormula = computed(() => {
  const row = rpmExampleRow.value

  if (!row) {
    return "RPM = (Revenue / Streams) Ã— 1,000"
  }

  return `(${formatMoney(row.revenue)} / ${formatCount(row.streams)} streams) Ã— 1,000 = ${formatRpm(row.rpm)}`
})

const overviewMetrics = computed(() => [
  {
    label: "Network revenue",
    value: formatMoney(summaryStats.value.totalRevenue),
    footnote: `${summaryStats.value.csvRowCount.toLocaleString()} CSV rows / ${summaryStats.value.groupedRowCount.toLocaleString()} groups`,
    tone: "accent" as const,
    valueLogoKey: null,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Streams",
    value: formatCount(summaryStats.value.totalStreams),
    footnote: `${formatRpm(summaryStats.value.rpm)} average`,
    tone: "alt" as const,
    valueLogoKey: null,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Artists",
    value: String(summaryStats.value.artistCount),
    footnote: topArtist.value ? `${topArtist.value.label} leads at ${formatShare(topArtist.value.share)}` : "No artist activity",
    tone: "default" as const,
    valueLogoKey: null,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Top platform",
    value: topPlatform.value?.label || "No platform",
    footnote: topPlatform.value ? `${formatMoney(topPlatform.value.revenue)} / ${formatShare(topPlatform.value.share)}` : "No DSP data",
    tone: "default" as const,
    valueLogoKey: topPlatform.value?.logoKey ?? null,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Top track",
    value: topTrack.value?.label || "No track",
    footnote: topTrack.value ? `${formatCount(topTrack.value.streams)} streams / ${formatShare(topTrack.value.share)}` : "No track data",
    tone: "default" as const,
    valueLogoKey: null,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Top country",
    value: topCountry.value?.label || "No country",
    footnote: topCountry.value ? `${formatMoney(topCountry.value.revenue)} / ${formatShare(topCountry.value.share)}` : "No territory data",
    tone: "default" as const,
    valueLogoKey: null,
    valueCountryCode: topCountry.value?.countryCode ?? null,
    valueCountryName: topCountry.value?.label ?? null,
  },
  {
    label: "Uploads",
    value: String(summaryStats.value.uploadCount),
    footnote: `${summaryStats.value.periodCount} reporting periods in scope`,
    tone: "alt" as const,
    valueLogoKey: null,
    valueCountryCode: null,
    valueCountryName: null,
  },
  {
    label: "Data gaps",
    value: String(dataQuality.value.missingCountryRows.length + dataQuality.value.missingReleaseRows.length + dataQuality.value.missingTrackRows.length),
    footnote: `${dataQuality.value.revenueWithoutStreams.length} revenue groups without streams`,
    tone: "default" as const,
    valueLogoKey: null,
    valueCountryCode: null,
    valueCountryName: null,
  },
])

const hasAnalyticsFocus = computed(() => (
  analyticsFocus.artistId !== ALL_FILTER
  || analyticsFocus.releaseId !== ALL_FILTER
  || analyticsFocus.trackId !== ALL_FILTER
  || analyticsFocus.channelId !== ALL_FILTER
  || analyticsFocus.countryCode !== ALL_FILTER
  || analyticsFocus.periodMonth !== ALL_FILTER
))

const activeFilterLabels = computed(() => {
  const labels: string[] = []

  if (analyticsFocus.periodMonth !== ALL_FILTER) {
    labels.push(selectedPeriodLabel.value)
  }

  if (analyticsFocus.artistId !== ALL_FILTER) {
    labels.push(selectedArtistLabel.value)
  }

  if (analyticsFocus.releaseId !== ALL_FILTER) {
    labels.push(selectedReleaseLabel.value)
  }

  if (analyticsFocus.trackId !== ALL_FILTER) {
    labels.push(selectedTrackLabel.value)
  }

  if (analyticsFocus.channelId !== ALL_FILTER) {
    labels.push(selectedPlatformLabel.value)
  }

  if (analyticsFocus.countryCode !== ALL_FILTER) {
    labels.push(selectedCountryLabel.value)
  }

  return labels
})

const analyticsScopeLabel = computed(() => [
  overviewPeriodLabel.value,
  ...activeFilterLabels.value,
].join(" / "))

const analyticsContext = computed<AdminAnalyticsContext>(() => {
  if (selectedDrilldown.value.kind !== "overview") {
    return selectedDrilldown.value
  }

  if (hasAnalyticsFocus.value) {
    return {
      kind: "overview",
      id: null,
      label: "Filtered network view",
      meta: `${analyticsScopeLabel.value} across ${summaryStats.value.csvRowCount.toLocaleString()} CSV rows.`,
    }
  }

  return selectedDrilldown.value
})

const visibleArtistFinancialStats = computed(() => {
  const groups = new Map<string, { revenue: number; streams: number }>()

  for (const row of filteredRevenueRows.value) {
    const existing = groups.get(row.artistId) ?? { revenue: 0, streams: 0 }

    existing.revenue += numeric(row.revenue)
    existing.streams += Number(row.streams ?? 0)
    groups.set(row.artistId, existing)
  }

  return groups
})

function mapFinancialControlRow(row: AdminAnalyticsFinancialArtistRow, visible: { revenue: number; streams: number } | undefined): FinancialControlRow {
  const lifetimeEarned = numeric(row.totalEarned)
  const totalPayouts = numeric(row.totalWithdrawn)
  const pendingPayouts = numeric(row.pendingPayouts)
  const approvedPayouts = numeric(row.approvedPayouts)

  return {
    artistId: row.artistId,
    artistName: row.artistName,
    visibleRevenue: visible?.revenue ?? 0,
    visibleStreams: visible?.streams ?? 0,
    lifetimeEarned,
    totalDues: numeric(row.totalDues),
    artistDues: numeric(row.artistDues),
    pendingPayouts,
    approvedPayouts,
    payoutExposure: pendingPayouts + approvedPayouts,
    totalPayouts,
    availableBalance: numeric(row.availableBalance),
    payoutRatio: lifetimeEarned > 0 ? (totalPayouts / lifetimeEarned) * 100 : 0,
  }
}

const financialControlRows = computed(() => {
  const visibleStats = visibleArtistFinancialStats.value
  const scopedRows = financialArtists.value
    .map((row) => mapFinancialControlRow(row, visibleStats.get(row.artistId)))
    .filter((row) => {
      const hasFinancialActivity = (
        row.visibleRevenue !== 0
        || row.lifetimeEarned !== 0
        || row.totalDues !== 0
        || row.artistDues !== 0
        || row.payoutExposure !== 0
        || row.totalPayouts !== 0
        || row.availableBalance !== 0
      )

      if (analyticsFocus.artistId !== ALL_FILTER) {
        return row.artistId === analyticsFocus.artistId
      }

      if (hasAnalyticsFocus.value || overviewPeriodRange.value !== DEFAULT_ANALYTICS_PERIOD_RANGE) {
        return visibleStats.has(row.artistId)
      }

      return hasFinancialActivity
    })

  return scopedRows.sort((left, right) => {
    const valueFor = (row: FinancialControlRow) => {
      switch (financialSort.value) {
        case "payoutExposure":
          return row.payoutExposure
        case "totalEarned":
          return row.lifetimeEarned
        case "totalPayouts":
          return row.totalPayouts
        case "visibleRevenue":
          return row.visibleRevenue
        case "availableBalance":
        default:
          return row.availableBalance
      }
    }

    return valueFor(right) - valueFor(left) || right.visibleRevenue - left.visibleRevenue || left.artistName.localeCompare(right.artistName)
  })
})

const financialControlSummary = computed(() => financialControlRows.value.reduce((summary, row) => ({
  lifetimeEarned: summary.lifetimeEarned + row.lifetimeEarned,
  totalDues: summary.totalDues + row.totalDues,
  artistDues: summary.artistDues + row.artistDues,
  pendingPayouts: summary.pendingPayouts + row.pendingPayouts,
  approvedPayouts: summary.approvedPayouts + row.approvedPayouts,
  payoutExposure: summary.payoutExposure + row.payoutExposure,
  totalPayouts: summary.totalPayouts + row.totalPayouts,
  availableBalance: summary.availableBalance + row.availableBalance,
  visibleRevenue: summary.visibleRevenue + row.visibleRevenue,
  visibleStreams: summary.visibleStreams + row.visibleStreams,
}), {
  lifetimeEarned: 0,
  totalDues: 0,
  artistDues: 0,
  pendingPayouts: 0,
  approvedPayouts: 0,
  payoutExposure: 0,
  totalPayouts: 0,
  availableBalance: 0,
  visibleRevenue: 0,
  visibleStreams: 0,
}))

const reconciliationByArtist = computed(() => new Map(
  (reconciliation.value?.artists ?? []).map((row) => [row.artistId, row]),
))

const financialControlMetrics = computed(() => [
  {
    label: "Lifetime earnings",
    value: formatMoney(financialControlSummary.value.lifetimeEarned),
    detail: `${financialControlRows.value.length.toLocaleString()} artists in scope`,
    status: "neutral" as const,
  },
  {
    label: "Total withdrawn till now",
    value: formatMoney(financialControlSummary.value.totalPayouts),
    detail: `${formatShare(financialControlSummary.value.lifetimeEarned ? (financialControlSummary.value.totalPayouts / financialControlSummary.value.lifetimeEarned) * 100 : 0)} of lifetime earned`,
    status: "neutral" as const,
  },
  {
    label: "Artist dues",
    value: formatMoney(financialControlSummary.value.artistDues),
    detail: `${formatMoney(financialControlSummary.value.totalDues)} total deductions from wallet`,
    status: financialControlSummary.value.artistDues > 0 ? "warning" as const : "success" as const,
  },
  {
    label: "Remaining to withdraw",
    value: formatMoney(Math.max(0, financialControlSummary.value.availableBalance)),
    detail: `${financialControlRows.value.filter((row) => row.availableBalance >= 50).length.toLocaleString()} artists at payout threshold`,
    status: financialControlSummary.value.availableBalance < 0 ? "critical" as const : financialControlSummary.value.availableBalance > 0 ? "warning" as const : "success" as const,
  },
  {
    label: "Payout exposure",
    value: formatMoney(financialControlSummary.value.payoutExposure),
    detail: `${formatMoney(financialControlSummary.value.pendingPayouts)} pending / ${formatMoney(financialControlSummary.value.approvedPayouts)} approved`,
    status: financialControlSummary.value.payoutExposure > 0 ? "warning" as const : "success" as const,
  },
  {
    label: "Visible CSV revenue",
    value: formatMoney(financialControlSummary.value.visibleRevenue),
    detail: `${formatCount(financialControlSummary.value.visibleStreams)} streams in active filters`,
    status: "neutral" as const,
  },
  {
    label: "Trust check",
    value: reconciliationPending.value
      ? "Running"
      : !reconciliation.value
        ? "Not run"
        : reconciliationScopeSummary.value.failCount
          ? "Failed"
          : reconciliationScopeSummary.value.warningCount
            ? "Review"
            : "Passed",
    detail: reconciliation.value
      ? `${reconciliationScopeSummary.value.passCount.toLocaleString()} passed / ${reconciliationScopeSummary.value.warningCount.toLocaleString()} warnings`
      : "Run check to compare wallet, statement, payout, dues, upload, and ledger math",
    status: reconciliationScopeSummary.value.failCount ? "critical" as const : reconciliationScopeSummary.value.warningCount ? "warning" as const : reconciliation.value ? "success" as const : "neutral" as const,
  },
  {
    label: "Balance gap",
    value: reconciliation.value ? formatMoney(reconciliationScopeSummary.value.walletExpectedGap) : "-",
    detail: reconciliation.value ? `${reconciliationScopeSummary.value.issueCount.toLocaleString()} reconciliation issues` : "Waiting for trust check",
    status: reconciliationScopeSummary.value.walletExpectedGap > 0.01 ? "critical" as const : reconciliation.value ? "success" as const : "neutral" as const,
  },
])

const financialControlPreviewRows = computed(() => financialControlRows.value.slice(0, 7))

const reconciliationScopeRows = computed(() => {
  const rows = reconciliation.value?.artists ?? []
  const visibleArtistIds = new Set(filteredRevenueRows.value.map((row) => row.artistId))
  const hasBusinessActivity = (row: AdminReconciliationArtistResult) => (
    row.issueCount > 0
    || visibleArtistIds.has(row.artistId)
    || numeric(row.walletEarned) !== 0
    || numeric(row.statementEarned) !== 0
    || numeric(row.activeEarningsSum) !== 0
    || numeric(row.publishingSum) !== 0
    || numeric(row.duesSum) !== 0
    || numeric(row.payoutReservedSum) !== 0
    || numeric(row.payoutPaidSum) !== 0
    || numeric(row.walletAvailableBalance) !== 0
    || numeric(row.expectedAvailableBalance) !== 0
    || numeric(row.ledgerAmountSum) !== 0
    || numeric(row.latestLedgerBalance) !== 0
    || row.completedUploadCount > 0
  )

  if (analyticsFocus.artistId !== ALL_FILTER) {
    return rows.filter((row) => row.artistId === analyticsFocus.artistId)
  }

  if (hasAnalyticsFocus.value || overviewPeriodRange.value !== DEFAULT_ANALYTICS_PERIOD_RANGE) {
    return rows.filter((row) => visibleArtistIds.has(row.artistId))
  }

  return rows.filter(hasBusinessActivity)
})

const reconciliationScopeSummary = computed(() => reconciliationScopeRows.value.reduce((summary, row) => {
  summary.artistCount += 1
  summary.issueCount += row.issueCount
  summary.walletAvailable += numeric(row.walletAvailableBalance)
  summary.expectedAvailable += numeric(row.expectedAvailableBalance)
  summary.walletExpectedGap += Math.abs(numeric(row.walletAvailableBalance) - numeric(row.expectedAvailableBalance))
  summary.statementWalletGap += Math.abs(numeric(row.walletEarned) - numeric(row.statementEarned))

  if (row.status === "pass") {
    summary.passCount += 1
  } else if (row.status === "warning") {
    summary.warningCount += 1
  } else {
    summary.failCount += 1
  }

  return summary
}, {
  artistCount: 0,
  passCount: 0,
  warningCount: 0,
  failCount: 0,
  issueCount: 0,
  walletAvailable: 0,
  expectedAvailable: 0,
  walletExpectedGap: 0,
  statementWalletGap: 0,
}))

function reconciliationStatusLabel(status: AdminReconciliationStatus) {
  return status === "fail" ? "Fail" : status === "warning" ? "Warning" : "Pass"
}

function financialTrustRow(artistId: string) {
  return reconciliationByArtist.value.get(artistId) ?? null
}

function financialTrustStatusLabel(artistId: string) {
  const row = financialTrustRow(artistId)

  return row ? reconciliationStatusLabel(row.status) : "Not checked"
}

function financialTrustIssueCount(artistId: string) {
  return financialTrustRow(artistId)?.issueCount ?? 0
}

function financialTrustBalanceGap(artistId: string) {
  const row = financialTrustRow(artistId)

  return row ? Math.abs(numeric(row.walletAvailableBalance) - numeric(row.expectedAvailableBalance)) : null
}

const catalogHealthMetrics = computed(() => {
  const totalGroups = Math.max(1, filteredRevenueRows.value.length)
  const linkedReleaseGroups = filteredRevenueRows.value.filter((row) => row.releaseId).length
  const linkedTrackGroups = filteredRevenueRows.value.filter((row) => row.trackId).length
  const countryGroups = filteredRevenueRows.value.filter((row) => row.countryCode).length
  const dspGroups = filteredRevenueRows.value.filter((row) => row.channelId).length
  const monetizationIssues = dataQuality.value.revenueWithoutStreams.length + dataQuality.value.streamsWithoutRevenue.length
  const highDependencyArtists = catalogDependencyDetailRows.value.filter((row) => row.share >= 75).length

  return [
    {
      label: "Track linkage",
      value: formatShare((linkedTrackGroups / totalGroups) * 100),
      detail: `${dataQuality.value.missingTrackCsvRows.toLocaleString()} CSV rows missing track context`,
      status: linkedTrackGroups / totalGroups >= 0.95 ? "success" : "warning",
    },
    {
      label: "Release linkage",
      value: formatShare((linkedReleaseGroups / totalGroups) * 100),
      detail: `${dataQuality.value.missingReleaseCsvRows.toLocaleString()} CSV rows missing release context`,
      status: linkedReleaseGroups / totalGroups >= 0.95 ? "success" : "warning",
    },
    {
      label: "Country coverage",
      value: formatShare((countryGroups / totalGroups) * 100),
      detail: `${dataQuality.value.missingCountryCsvRows.toLocaleString()} CSV rows missing territory`,
      status: countryGroups / totalGroups >= 0.9 ? "success" : "warning",
    },
    {
      label: "DSP assignment",
      value: formatShare((dspGroups / totalGroups) * 100),
      detail: `${dataQuality.value.unassignedChannelCsvRows.toLocaleString()} CSV rows unassigned`,
      status: dspGroups / totalGroups >= 0.98 ? "success" : "warning",
    },
    {
      label: "Monetization anomalies",
      value: monetizationIssues.toLocaleString(),
      detail: "Revenue/stream mismatches in active scope",
      status: monetizationIssues ? "warning" : "success",
    },
    {
      label: "Dependency risk",
      value: highDependencyArtists.toLocaleString(),
      detail: "Artists with 75%+ revenue from one track",
      status: highDependencyArtists ? "warning" : "success",
    },
  ]
})

const adminActionQueue = computed<ActionQueueItem[]>(() => {
  const actions: ActionQueueItem[] = []
  const push = (item: ActionQueueItem) => actions.push(item)
  const approvedPayoutRows = financialControlRows.value.filter((row) => row.approvedPayouts > 0)
  const pendingPayoutRows = financialControlRows.value.filter((row) => row.pendingPayouts > 0)
  const payableRows = financialControlRows.value.filter((row) => row.availableBalance >= 50)
  const reconciliationSummary = reconciliationScopeSummary.value

  if (reconciliation.value && reconciliationSummary.failCount) {
    push({
      severity: "critical",
      label: "Reconcile",
      title: "Money views disagree",
      detail: "Wallet, statement, payout, dues, upload, or ledger totals are not aligned for artists in this scope.",
      metric: `${reconciliationSummary.failCount.toLocaleString()} failed`,
      priority: 105,
    })
  } else if (reconciliation.value && reconciliationSummary.warningCount) {
    push({
      severity: "warning",
      label: "Reconcile",
      title: "Money views need review",
      detail: "Reconciliation found cleanup warnings before these balances should be treated as final.",
      metric: `${reconciliationSummary.warningCount.toLocaleString()} warnings`,
      priority: 95,
    })
  }

  if (approvedPayoutRows.length) {
    push({
      severity: "critical",
      label: "Payout",
      title: "Approved payouts need payment",
      detail: `${approvedPayoutRows.length} artists have approved payouts waiting to be marked paid.`,
      metric: formatMoney(sumBy(approvedPayoutRows, (row) => row.approvedPayouts)),
      priority: 100,
    })
  }

  if (pendingPayoutRows.length) {
    push({
      severity: "warning",
      label: "Payout",
      title: "Pending payout requests need review",
      detail: `${pendingPayoutRows.length} artists have requested payouts in the current financial scope.`,
      metric: formatMoney(sumBy(pendingPayoutRows, (row) => row.pendingPayouts)),
      priority: 90,
    })
  }

  if (payableRows.length) {
    push({
      severity: "info",
      label: "Liability",
      title: "Artists are above payout threshold",
      detail: "These balances are not requests yet, but they are payable exposure for the business.",
      metric: `${payableRows.length} artists`,
      priority: 72,
    })
  }

  if (dataQuality.value.missingCountryRows.length + dataQuality.value.missingReleaseRows.length + dataQuality.value.missingTrackRows.length > 0) {
    push({
      severity: "warning",
      label: "Import",
      title: "CSV coverage has missing dimensions",
      detail: "Missing country, release, or track context reduces how much the admin can trust downstream analytics.",
      metric: `${(dataQuality.value.missingCountryCsvRows + dataQuality.value.missingReleaseCsvRows + dataQuality.value.missingTrackCsvRows).toLocaleString()} CSV rows`,
      priority: 84,
    })
  }

  if (dataQuality.value.streamsWithoutRevenue.length) {
    push({
      severity: "warning",
      label: "Monetization",
      title: "Streams are present with no revenue",
      detail: "This is not automatically AI. Review platform, territory, reporting delay, and invalid-stream adjustments.",
      metric: `${dataQuality.value.streamsWithoutRevenue.length.toLocaleString()} groups`,
      priority: 78,
    })
  }

  if (lowRpmHighStreamTrackRows.value.length) {
    push({
      severity: "warning",
      label: "Yield",
      title: "High-stream tracks have weak revenue yield",
      detail: "Prioritize DSP/territory review for tracks with meaningful streams below the scope RPM benchmark.",
      metric: `${lowRpmHighStreamTrackRows.value.length.toLocaleString()} tracks`,
      priority: 76,
    })
  }

  const dependency = catalogDependencyDetailRows.value[0]
  if (dependency && dependency.share >= 75) {
    push({
      severity: "warning",
      label: "Catalog",
      title: "Single-track dependency is high",
      detail: `${dependency.artistName} depends on ${dependency.trackTitle} for ${formatShare(dependency.share)} of visible revenue.`,
      metric: formatMoney(dependency.revenue),
      priority: 74,
    })
  }

  const decline = decliningArtists.value[0]
  if (decline && (decline.revenueChangePct ?? 0) <= -30) {
    push({
      severity: "critical",
      label: "Drop",
      title: "Artist revenue dropped sharply",
      detail: `${decline.label} is down ${formatSignedPercent(decline.revenueChangePct)} vs their previous visible month.`,
      metric: formatMoney(Math.abs(decline.revenueDelta)),
      priority: 82,
    })
  }

  if (!actions.length && filteredRevenueRows.value.length) {
    push({
      severity: "success",
      label: "Clear",
      title: "No major action queue items",
      detail: "The current scope has no payout, catalog coverage, dependency, or monetization warnings above the review thresholds.",
      metric: "OK",
      priority: 1,
    })
  }

  return actions.sort((left, right) => right.priority - left.priority).slice(0, 9)
})

const recommendations = computed<Recommendation[]>(() => {
  const insights: Recommendation[] = []
  const push = (tone: InsightTone, label: string, title: string, detail: string, metric: string) => {
    insights.push({ tone, label, title, detail, metric })
  }

  if (!filteredRevenueRows.value.length) {
    push("info", "CSV", "No analytics rows in scope", "Upload or widen the date range to inspect artist, catalog, platform, and territory performance.", "0 rows")
    return insights
  }

  if ((topArtist.value?.share ?? 0) >= 55) {
    push("warning", "Portfolio", "Revenue is concentrated in one artist", `${topArtist.value?.label} owns ${formatShare(topArtist.value?.share)} of focused revenue. Track dependency and payout exposure should be reviewed together.`, formatMoney(topArtist.value?.revenue ?? 0))
  }

  if ((topPlatform.value?.share ?? 0) >= 70) {
    push("warning", "DSP risk", "Platform dependency is high", `${topPlatform.value?.label} carries ${formatShare(topPlatform.value?.share)} of revenue. Compare RPM by platform before prioritizing campaigns.`, formatShare(topPlatform.value?.share))
  }

  if ((topCountry.value?.share ?? 0) >= 70) {
    push("info", "Market", "Country concentration is high", `${topCountry.value?.label} accounts for ${formatShare(topCountry.value?.share)} of revenue in this scope.`, formatMoney(topCountry.value?.revenue ?? 0))
  }

  const dependency = catalogDependencyRows.value[0]
  if (dependency && dependency.share >= 75) {
    push("warning", "Catalog", "One track carries an artist", `${dependency.trackTitle} contributes ${formatShare(dependency.share)} of ${dependency.artistName}'s revenue.`, formatMoney(dependency.revenue))
  }

  const growth = fastestGrowingArtists.value[0]
  if (growth && (growth.revenueChangePct === null || growth.revenueChangePct >= 30)) {
    push("success", "Growth", "Artist momentum is accelerating", `${growth.label} is up ${formatSignedPercent(growth.revenueChangePct)} vs their prior visible month.`, formatMoney(growth.revenueDelta))
  }

  const decline = decliningArtists.value[0]
  if (decline && (decline.revenueChangePct ?? 0) <= -30) {
    push("critical", "Drop", "Artist revenue dropped sharply", `${decline.label} is down ${formatSignedPercent(decline.revenueChangePct)} vs their prior visible month.`, formatMoney(Math.abs(decline.revenueDelta)))
  }

  if (latestMovement.value.latest && latestMovement.value.prior && latestMovement.value.revenueDelta < 0 && latestMovement.value.streamDelta > 0) {
    push("warning", "RPM", "Streams rose while revenue fell", `${formatShortMonth(latestMovement.value.latest.periodMonth)} added ${formatCount(latestMovement.value.streamDelta)} streams but revenue moved ${formatMoney(latestMovement.value.revenueDelta)}.`, formatSignedPercent(latestMovement.value.revenueChangePct))
  }

  const lowRpmTrack = lowRpmHighStreamTracks.value[0]
  if (lowRpmTrack) {
    push("warning", "RPM", "High-stream track has weak RPM", `${lowRpmTrack.label} has ${formatCount(lowRpmTrack.streams)} streams at ${formatRpm(lowRpmTrack.rpm)}, below the scope average.`, formatMoney(lowRpmTrack.revenue))
  }

  if (dataQuality.value.missingCountryRows.length || dataQuality.value.missingReleaseRows.length || dataQuality.value.missingTrackRows.length) {
    push("info", "CSV quality", "Some grouped rows are missing dimensions", `${dataQuality.value.missingCountryCsvRows + dataQuality.value.missingReleaseCsvRows + dataQuality.value.missingTrackCsvRows} CSV rows are missing country, release, or track context.`, `${dataQuality.value.missingCountryRows.length + dataQuality.value.missingReleaseRows.length + dataQuality.value.missingTrackRows.length} groups`)
  }

  return insights.slice(0, 8)
})

function resetAnalyticsFocus() {
  analyticsFocus.artistId = ALL_FILTER
  analyticsFocus.releaseId = ALL_FILTER
  analyticsFocus.trackId = ALL_FILTER
  analyticsFocus.channelId = ALL_FILTER
  analyticsFocus.countryCode = ALL_FILTER
  analyticsFocus.periodMonth = ALL_FILTER
  selectedDrilldown.value = {
    kind: "overview",
    id: null,
    label: "Network overview",
    meta: "Posted CSV royalty revenue grouped across artists, catalog, DSPs, territories, and uploads.",
  }
}

function resetImportCoverageFilters() {
  importCoverageIssueFilter.value = ALL_FILTER
  resetAnalyticsFocus()
}

function setContext(kind: AdminContextKind, id: string | null, label: string, meta: string) {
  selectedDrilldown.value = { kind, id, label, meta }
}

function selectAdminPeriod(point: { key: string; label: string }) {
  const periodMonth = analyticsPeriodMonthDateKey(point.key) || ALL_FILTER

  analyticsFocus.periodMonth = periodMonth
  setContext("period", periodMonth, point.label, "Revenue, catalog, territory, platform, and artist panels are scoped to this reporting period.")
}

function selectAdminCountry(country: { countryCode: string | null; countryName: string; revenue: string | number; share: number }) {
  analyticsFocus.countryCode = country.countryCode || UNKNOWN_COUNTRY
  setContext("country", country.countryCode, countryNameFor(country.countryCode, country.countryName), `${formatMoney(country.revenue)} / ${formatShare(country.share)} of focused revenue.`)
}

function selectAdminPlatform(row: { id: string; label: string; revenue?: string | number; value?: string | number; share: number }) {
  analyticsFocus.channelId = row.id
  setContext("platform", row.id, row.label, `${formatMoney(row.revenue ?? row.value ?? 0)} / ${formatShare(row.share)} of focused revenue.`)
}

function selectAdminArtist(row: { id: string; label: string; value: string | number; count?: number }) {
  analyticsFocus.artistId = row.id
  setContext("artist", row.id, row.label, `${formatMoney(row.value)} / ${formatCount(row.count ?? 0)} streams after filters.`)
}

function selectAdminRelease(row: { id: string; label: string; value: string | number; count?: number }) {
  analyticsFocus.releaseId = row.id
  analyticsFocus.trackId = ALL_FILTER
  setContext("release", row.id, row.label, `${formatMoney(row.value)} / ${formatCount(row.count ?? 0)} streams after filters.`)
}

function selectAdminTrack(row: { id: string; label: string; value: string | number; count?: number }) {
  analyticsFocus.trackId = row.id
  setContext("track", row.id, row.label, `${formatMoney(row.value)} / ${formatCount(row.count ?? 0)} streams after filters.`)
}

function selectAdminStreamPlatform(series: { key: string; label: string; value?: number | null; points?: Array<{ value: number }> }) {
  const keyParts = series.key.split(":")
  const platformId = keyParts.length >= 3 ? keyParts[1] : series.key
  const totalStreams = series.points?.reduce((sum, point) => sum + Number(point.value ?? 0), 0) ?? Number(series.value ?? 0)

  analyticsFocus.channelId = platformId
  setContext("platform", platformId, series.label.replace(/\s+streams$/i, ""), `${formatCount(totalStreams)} streams in the active analytics scope.`)
}

function selectDiagnosticArtistChartRow(row: DiagnosticChartRow) {
  selectAdminArtist({ id: row.id, label: row.label, value: row.value, count: row.count ?? 0 })
}

function selectDiagnosticArtistRiskChartRow(row: DiagnosticChartRow) {
  const dependency = catalogDependencyDetailRows.value.find((item) => item.artistId === row.id)

  if (dependency) {
    analyticsFocus.artistId = dependency.artistId
    analyticsFocus.trackId = dependency.trackId
    setContext("artist", dependency.artistId, dependency.artistName, `${dependency.trackTitle} carries ${formatShare(dependency.share)} of visible artist revenue.`)
  }
}

function selectConcentrationChartRow(row: DiagnosticChartRow) {
  if (row.id === "Top artist share" && topArtist.value) {
    selectAdminArtist({ id: topArtist.value.id, label: topArtist.value.label, value: topArtist.value.revenue, count: topArtist.value.streams })
  } else if (row.id === "Top 10 tracks" && topTrack.value) {
    selectAdminTrack({ id: topTrack.value.id, label: topTrack.value.label, value: topTrack.value.revenue, count: topTrack.value.streams })
  } else if (row.id === "Top platform share" && topPlatform.value) {
    selectAdminPlatform({ id: topPlatform.value.id, label: topPlatform.value.label, value: topPlatform.value.revenue, share: topPlatform.value.share })
  }
}

function selectDiagnosticPlatformChartRow(row: DiagnosticChartRow) {
  const platform = platformBreakdown.value.find((item) => item.id === row.id)

  if (platform) {
    selectAdminPlatform({ id: platform.id, label: platform.label, value: platform.revenue, share: platform.share })
  }
}

function selectDiagnosticCountryChartRow(row: DiagnosticChartRow) {
  const country = countryMarketRows.value.find((item) => item.id === row.id)

  if (country) {
    selectAdminCountry({ countryCode: country.countryCode, countryName: country.label, revenue: country.revenue, share: country.share })
  }
}

function selectWeakRpmScatterPoint(point: DiagnosticScatterPoint) {
  const track = trackLeaderboard.value.find((item) => item.id === point.id)

  if (track) {
    selectAdminTrack({ id: track.id, label: track.label, value: track.revenue, count: track.streams })
  }
}

function selectImportCoverageChartRow(row: DiagnosticChartRow) {
  importCoverageIssueFilter.value = row.id
  importCoveragePage.value = 1
  openDiagnostic("csvQuality")
}

function openDiagnostic(key: DiagnosticKey) {
  expandedDiagnostic.value = key
}

function closeDiagnosticSheet() {
  expandedDiagnostic.value = null
}

function pulseFilterBorder() {
  if (!import.meta.client) {
    return
  }

  filterMotionActive.value = true

  if (filterMotionTimeout) {
    window.clearTimeout(filterMotionTimeout)
  }

  filterMotionTimeout = window.setTimeout(() => {
    filterMotionActive.value = false
    filterMotionTimeout = null
  }, 2800)
}

function isAnalyticsOverlayTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(target.closest([
    ".admin-analytics-toolbar",
    ".import-coverage-dialog",
    ".import-coverage-filter-strip",
    ".native-select-content",
    ".native-select-item",
    "[data-slot='native-select']",
    "[data-slot='native-select-wrapper']",
    "[role='listbox']",
    "[role='option']",
  ].join(",")))
}

function hasOpenNativeSelectMenu() {
  return import.meta.client && Boolean(document.querySelector(".native-select-content"))
}

function preventAnalyticsOverlayDismiss(event: CustomEvent<{ originalEvent?: Event }>) {
  if (
    isAnalyticsOverlayTarget(event.detail?.originalEvent?.target ?? null)
    || isAnalyticsOverlayTarget(event.target)
    || hasOpenNativeSelectMenu()
  ) {
    event.preventDefault()
  }
}

function selectDiagnosticArtist(row: GrowthRow) {
  selectAdminArtist({ id: row.id, label: row.label, value: row.latestRevenue, count: row.latestStreams })
  closeDiagnosticSheet()
}

function selectDiagnosticConcentrationRow(row: AggregateRow & { kind: "Artist" | "Track" | "Release" | "Platform" }) {
  if (row.kind === "Artist") {
    selectAdminArtist({ id: row.id, label: row.label, value: row.revenue, count: row.streams })
  } else if (row.kind === "Track") {
    selectAdminTrack({ id: row.id, label: row.label, value: row.revenue, count: row.streams })
  } else if (row.kind === "Release") {
    selectAdminRelease({ id: row.id, label: row.label, value: row.revenue, count: row.streams })
  } else {
    selectAdminPlatform({ id: row.id, label: row.label, value: row.revenue, share: row.share })
  }

  closeDiagnosticSheet()
}

function selectDiagnosticDependencyRow(row: { artistId: string; artistName: string; trackId: string; trackTitle: string; revenue: number; streams: number; share: number }) {
  analyticsFocus.artistId = row.artistId
  analyticsFocus.trackId = row.trackId
  setContext("artist", row.artistId, row.artistName, `${row.trackTitle} carries ${formatShare(row.share)} of visible artist revenue.`)
  closeDiagnosticSheet()
}

function selectDiagnosticPlatform(row: AggregateRow) {
  selectAdminPlatform({ id: row.id, label: row.label, value: row.revenue, share: row.share })
  closeDiagnosticSheet()
}

function selectDiagnosticCountry(row: AggregateRow) {
  selectAdminCountry({ countryCode: row.countryCode, countryName: row.label, revenue: row.revenue, share: row.share })
  closeDiagnosticSheet()
}

function selectDiagnosticTrack(row: AggregateRow) {
  selectAdminTrack({ id: row.id, label: row.label, value: row.revenue, count: row.streams })
  closeDiagnosticSheet()
}

function selectDiagnosticCsvRow(row: AdminAnalyticsRevenueRow) {
  analyticsFocus.periodMonth = row.periodMonth
  analyticsFocus.artistId = row.artistId
  analyticsFocus.releaseId = revenueReleaseKey(row)
  analyticsFocus.trackId = revenueTrackKey(row)
  analyticsFocus.channelId = revenueChannelKey(row)
  analyticsFocus.countryCode = revenueCountryKey(row)
  setContext("overview", null, row.artistName, `${formatMoney(row.revenue)} / ${formatCount(row.streams)} streams in ${formatMonth(row.periodMonth)}.`)
  expandedDiagnostic.value = null
}

async function runFinancialReconciliation() {
  reconciliationPending.value = true
  reconciliationError.value = ""

  try {
    reconciliation.value = await $fetch("/api/admin/reconciliation") as AdminReconciliationResponse
  } catch (fetchError: any) {
    reconciliationError.value = fetchError?.data?.statusMessage || fetchError?.message || "Unable to run financial reconciliation."
  } finally {
    reconciliationPending.value = false
  }
}

watch(importCoveragePageSize, () => {
  importCoveragePage.value = 1
})

watch(importCoverageIssueFilter, () => {
  importCoveragePage.value = 1
})

watch(() => [
  analyticsFocus.artistId,
  analyticsFocus.releaseId,
  analyticsFocus.trackId,
  analyticsFocus.channelId,
  analyticsFocus.countryCode,
  analyticsFocus.periodMonth,
], () => {
  importCoveragePage.value = 1
  pulseFilterBorder()
})

watch(importCoverageTotalRows, () => {
  importCoveragePage.value = Math.min(importCoverageCurrentPage.value, importCoverageTotalPages.value)
})

watch(overviewPeriodRange, () => {
  analyticsFocus.periodMonth = ALL_FILTER
  importCoveragePage.value = 1
  pulseFilterBorder()
})

watch(releaseOptions, (options) => {
  if (!optionExists(options, analyticsFocus.releaseId)) {
    analyticsFocus.releaseId = ALL_FILTER
    analyticsFocus.trackId = ALL_FILTER
  }

  importCoveragePage.value = 1
})

watch(trackOptions, (options) => {
  if (!optionExists(options, analyticsFocus.trackId)) {
    analyticsFocus.trackId = ALL_FILTER
  }

  importCoveragePage.value = 1
})

watch(channelOptions, (options) => {
  if (!optionExists(options, analyticsFocus.channelId)) {
    analyticsFocus.channelId = ALL_FILTER
  }

  importCoveragePage.value = 1
})

watch(countryOptions, (options) => {
  if (!optionExists(options, analyticsFocus.countryCode)) {
    analyticsFocus.countryCode = ALL_FILTER
  }

  importCoveragePage.value = 1
})

watch(periodOptions, (options) => {
  if (!optionExists(options, analyticsFocus.periodMonth)) {
    analyticsFocus.periodMonth = ALL_FILTER
  }

  importCoveragePage.value = 1
})

function setupFilterDockObserver() {
  filterDockObserver?.disconnect()
  filterDockObserver = null

  const sentinel = filterDockSentinel.value

  if (!sentinel || !import.meta.client || !("IntersectionObserver" in window)) {
    filterDocked.value = false
    return
  }

  filterDockObserver = new IntersectionObserver(([entry]) => {
    filterDocked.value = !entry.isIntersecting
  }, {
    rootMargin: "-76px 0px 0px 0px",
    threshold: 0,
  })
  filterDockObserver.observe(sentinel)
}

onMounted(() => {
  setupFilterDockObserver()
  void runFinancialReconciliation()
})

onBeforeUnmount(() => {
  filterDockObserver?.disconnect()
  filterDockObserver = null

  if (filterMotionTimeout) {
    window.clearTimeout(filterMotionTimeout)
    filterMotionTimeout = null
  }
})
</script>

<template>
  <div class="page admin-analytics-page">
    <PageHeader
      eyebrow="Admin intelligence"
      title="Analytics"
      description="CSV royalty revenue, catalog concentration, platform RPM, artist growth, and data-quality signals."
    />

    <AppAlert v-if="error" variant="destructive">
      {{ error.statusMessage || "Unable to load analytics right now." }}
    </AppAlert>

    <DashboardSkeleton v-if="pending && !data" layout="analytics" />

    <template v-else>
      <div ref="filterDockSentinel" class="admin-filter-dock-sentinel" aria-hidden="true" />

      <div
        class="admin-analytics-toolbar"
        :class="{ 'is-docked': filterDocked, 'is-filter-loading': filterBorderActive }"
        :aria-busy="pending ? 'true' : 'false'"
      >
        <div class="admin-toolbar-copy">
          <span>Date range</span>
          <strong>{{ analyticsScopeLabel }}</strong>
        </div>

        <div class="admin-filter-strip">
          <label class="admin-filter-control" :class="{ 'is-active': overviewPeriodRange !== DEFAULT_ANALYTICS_PERIOD_RANGE }" :title="`Date range: ${overviewPeriodLabel}`">
            <span class="admin-filter-icon" aria-hidden="true">
              <CalendarRange class="size-4" />
            </span>
            <span class="admin-filter-label">Date range</span>
            <NativeSelect v-model="overviewPeriodRange" content-align="start">
              <option v-for="option in ANALYTICS_PERIOD_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </label>

          <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.periodMonth !== ALL_FILTER }" :title="`Period: ${selectedPeriodLabel}`">
            <span class="admin-filter-icon" aria-hidden="true">
              <CalendarDays class="size-4" />
            </span>
            <span class="admin-filter-label">Period</span>
            <NativeSelect v-model="analyticsFocus.periodMonth" content-align="start">
              <option v-for="option in periodOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </label>

          <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.artistId !== ALL_FILTER }" :title="`Artist: ${selectedArtistLabel}`">
            <span class="admin-filter-icon" aria-hidden="true">
              <UserRound class="size-4" />
            </span>
            <span class="admin-filter-label">Artist</span>
            <NativeSelect v-model="analyticsFocus.artistId" content-align="start">
              <option v-for="option in artistOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </label>

          <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.releaseId !== ALL_FILTER }" :title="`Release: ${selectedReleaseLabel}`">
            <span class="admin-filter-icon" aria-hidden="true">
              <Disc3 class="size-4" />
            </span>
            <span class="admin-filter-label">Release</span>
            <NativeSelect
              v-model="analyticsFocus.releaseId"
              content-align="start"
              searchable
              search-placeholder="Search releases"
              lazy-options
              :lazy-option-initial-count="12"
              :lazy-option-batch-size="12"
            >
              <NativeSelectOption
                v-for="option in releaseOptions"
                :key="option.value"
                :value="option.value"
                :visual="option.value === ALL_FILTER ? null : {
                  kind: 'cover',
                  imageUrl: option.imageUrl,
                  label: option.label,
                }"
              >
                {{ option.label }}
              </NativeSelectOption>
            </NativeSelect>
          </label>

          <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.trackId !== ALL_FILTER }" :title="`Track: ${selectedTrackLabel}`">
            <span class="admin-filter-icon" aria-hidden="true">
              <AudioLines class="size-4" />
            </span>
            <span class="admin-filter-label">Track</span>
            <NativeSelect
              v-model="analyticsFocus.trackId"
              content-align="start"
              searchable
              search-placeholder="Search tracks"
              lazy-options
              :lazy-option-initial-count="12"
              :lazy-option-batch-size="12"
            >
              <NativeSelectOption
                v-for="option in trackOptions"
                :key="option.value"
                :value="option.value"
                :visual="option.value === ALL_FILTER ? null : {
                  kind: 'cover',
                  imageUrl: option.imageUrl,
                  label: option.label,
                }"
              >
                {{ option.label }}
              </NativeSelectOption>
            </NativeSelect>
          </label>

          <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.channelId !== ALL_FILTER }" :title="`Platform: ${selectedPlatformLabel}`">
            <span class="admin-filter-icon" aria-hidden="true">
              <RadioTower class="size-4" />
            </span>
            <span class="admin-filter-label">Platform</span>
            <NativeSelect
              v-model="analyticsFocus.channelId"
              content-align="start"
              searchable
              search-placeholder="Search platforms"
              lazy-options
              :lazy-option-initial-count="12"
              :lazy-option-batch-size="12"
            >
              <NativeSelectOption
                v-for="option in channelOptions"
                :key="option.value"
                :value="option.value"
                :visual="option.value === ALL_FILTER ? null : {
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

          <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.countryCode !== ALL_FILTER }" :title="`Country: ${selectedCountryLabel}`">
            <span class="admin-filter-icon" aria-hidden="true">
              <Globe2 class="size-4" />
            </span>
            <span class="admin-filter-label">Country</span>
            <NativeSelect
              v-model="analyticsFocus.countryCode"
              content-align="start"
              searchable
              search-placeholder="Search countries"
              lazy-options
              :lazy-option-initial-count="12"
              :lazy-option-batch-size="12"
            >
              <NativeSelectOption
                v-for="option in countryOptions"
                :key="option.value"
                :value="option.value"
                :visual="option.value === ALL_FILTER || option.value === UNKNOWN_COUNTRY ? null : {
                  kind: 'country',
                  code: option.countryCode || option.value,
                  label: option.label,
                }"
              >
                {{ option.label }}
              </NativeSelectOption>
            </NativeSelect>
          </label>

          <Button
            type="button"
            variant="secondary"
            class="admin-filter-reset"
            :disabled="!hasAnalyticsFocus && overviewPeriodRange === DEFAULT_ANALYTICS_PERIOD_RANGE"
            aria-label="Reset analytics filters"
            @click="resetAnalyticsFocus"
          >
            <RotateCcw class="size-4" aria-hidden="true" />
            <span>Reset</span>
          </Button>
        </div>
      </div>

      <div class="analytics-kpi-grid">
        <StatCard
          v-for="metric in overviewMetrics"
          :key="metric.label"
          surface="slab"
          :label="metric.label"
          :value="metric.value"
          :footnote="metric.footnote"
          :tone="metric.tone"
          :value-logo-key="metric.valueLogoKey"
          :value-country-code="metric.valueCountryCode"
          :value-country-name="metric.valueCountryName"
        />
      </div>

      <Card class="analytics-context-panel" aria-label="Current analytics focus">
        <CardContent class="analytics-context-content">
          <div>
            <span>Current focus</span>
            <strong>{{ analyticsContext.label }}</strong>
            <p>{{ analyticsContext.meta }}</p>
          </div>
          <Button v-if="hasAnalyticsFocus || analyticsContext.kind !== 'overview'" variant="secondary" type="button" @click="resetAnalyticsFocus">
            Back to overview
          </Button>
        </CardContent>
      </Card>

      <Card class="recommendation-panel" aria-label="Admin recommendations">
        <CardHeader class="section-heading">
          <div>
            <Badge variant="secondary">Recommendations</Badge>
            <CardTitle>What needs admin attention</CardTitle>
          </div>
          <CardAction>
            <Button type="button" variant="ghost" size="sm" :disabled="pending" @click="refresh()">
              Refresh
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent class="recommendation-grid">
          <article
            v-for="item in recommendations"
            :key="`${item.label}:${item.title}`"
            class="recommendation-row"
            :class="`tone-${item.tone}`"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.title }}</strong>
            <p>{{ item.detail }}</p>
            <em>{{ item.metric }}</em>
          </article>
        </CardContent>
      </Card>

      <section class="admin-ops-grid" aria-label="Admin operations analytics">
        <Card class="financial-control-panel">
          <CardHeader class="section-heading financial-control-heading">
            <div>
              <Badge variant="secondary">Financial control</Badge>
              <CardTitle>Lifetime earnings and payouts</CardTitle>
              <CardDescription>Lifetime money, artist dues, withdrawable balance, visible CSV revenue, and statement trust in the active scope.</CardDescription>
            </div>

            <CardAction class="financial-heading-actions">
              <label class="financial-sort-control">
                <span>Sort</span>
                <NativeSelect v-model="financialSort" content-align="end">
                  <option value="availableBalance">Remaining to withdraw</option>
                  <option value="payoutExposure">Payout exposure</option>
                  <option value="totalEarned">Lifetime earnings</option>
                  <option value="totalPayouts">Total withdrawn</option>
                  <option value="visibleRevenue">Visible CSV revenue</option>
                </NativeSelect>
              </label>

              <Button type="button" variant="secondary" :disabled="reconciliationPending" @click="runFinancialReconciliation">
                {{ reconciliationPending ? "Checking..." : "Run check" }}
              </Button>
            </CardAction>
          </CardHeader>

          <AppAlert v-if="reconciliationError" variant="destructive" class="financial-alert">
            {{ reconciliationError }}
          </AppAlert>

          <CardContent class="financial-control-content">
            <div class="financial-metric-grid">
              <span v-for="metric in financialControlMetrics" :key="metric.label" :class="`status-${metric.status}`">
                <small>{{ metric.label }}</small>
                <strong>{{ metric.value }}</strong>
                <em>{{ metric.detail }}</em>
              </span>
            </div>

            <div class="financial-control-table">
              <Table class="financial-shadcn-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Artist</TableHead>
                    <TableHead>Trust</TableHead>
                    <TableHead>Lifetime earned</TableHead>
                    <TableHead>Withdrawn</TableHead>
                    <TableHead>Artist dues</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Approved</TableHead>
                    <TableHead>Balance gap</TableHead>
                    <TableHead>Visible revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="row in financialControlPreviewRows"
                    :key="row.artistId"
                    :class="`trust-${financialTrustRow(row.artistId)?.status ?? 'unchecked'}`"
                  >
                    <TableCell>
                      <button type="button" class="financial-artist-link" @click="selectAdminArtist({ id: row.artistId, label: row.artistName, value: row.visibleRevenue, count: row.visibleStreams })">
                        <strong>{{ row.artistName }}</strong>
                        <small>{{ formatShare(row.payoutRatio) }} lifetime paid out</small>
                      </button>
                    </TableCell>
                    <TableCell>
                      <span>{{ financialTrustStatusLabel(row.artistId) }}</span>
                      <small>{{ financialTrustIssueCount(row.artistId) }} issues</small>
                    </TableCell>
                    <TableCell>{{ formatMoney(row.lifetimeEarned) }}</TableCell>
                    <TableCell>{{ formatMoney(row.totalPayouts) }}</TableCell>
                    <TableCell>{{ formatMoney(row.artistDues) }}</TableCell>
                    <TableCell><strong>{{ formatMoney(Math.max(0, row.availableBalance)) }}</strong></TableCell>
                    <TableCell>{{ formatMoney(row.pendingPayouts) }}</TableCell>
                    <TableCell>{{ formatMoney(row.approvedPayouts) }}</TableCell>
                    <TableCell>
                      <span>{{ financialTrustBalanceGap(row.artistId) === null ? "-" : formatMoney(financialTrustBalanceGap(row.artistId)) }}</span>
                      <small>{{ financialTrustRow(row.artistId) ? "wallet vs expected" : "run check" }}</small>
                    </TableCell>
                    <TableCell>
                      <span>{{ formatMoney(row.visibleRevenue) }}</span>
                      <small>{{ formatCount(row.visibleStreams) }} streams</small>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <AppEmptyState
              v-if="!financialControlPreviewRows.length"
              compact
              icon="chart"
              title="No financial rows in scope"
              description="The active analytics filters do not match any artist financial rows."
              class="financial-empty-state"
            />
          </CardContent>
        </Card>

        <Card class="admin-action-panel">
          <CardHeader class="section-heading compact">
            <div>
              <Badge variant="secondary">Action queue</Badge>
              <CardTitle>Admin review list</CardTitle>
            </div>
          </CardHeader>

          <CardContent class="admin-action-list">
            <article
              v-for="item in adminActionQueue"
              :key="`${item.label}:${item.title}`"
              class="admin-action-row"
              :class="`severity-${item.severity}`"
            >
              <span>{{ item.label }}</span>
              <strong>{{ item.title }}</strong>
              <p>{{ item.detail }}</p>
              <em>{{ item.metric }}</em>
            </article>
          </CardContent>
        </Card>

        <Card class="catalog-health-panel">
          <CardHeader class="section-heading compact">
            <div>
              <Badge variant="secondary">Data health</Badge>
              <CardTitle>Catalog and import control</CardTitle>
            </div>
          </CardHeader>

          <CardContent class="catalog-health-grid">
            <article
              v-for="metric in catalogHealthMetrics"
              :key="metric.label"
              :class="`status-${metric.status}`"
            >
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
              <p>{{ metric.detail }}</p>
            </article>
          </CardContent>
        </Card>
      </section>

      <div class="analytics-bento">
        <AnalyticsWorldMap
          class="analytics-bento-map analytics-bento-wide"
          title="World revenue map"
          eyebrow="Territories"
          summary="CSV royalty revenue grouped by country."
          :countries="countryBreakdown.map((country) => ({
            countryCode: country.countryCode,
            countryName: country.label,
            revenue: country.revenue,
            streams: country.streams,
            share: country.share,
          }))"
          :selected-country-code="analyticsFocus.countryCode === UNKNOWN_COUNTRY || analyticsFocus.countryCode === ALL_FILTER ? null : analyticsFocus.countryCode"
          @select="selectAdminCountry"
          @clear="analyticsFocus.countryCode = ALL_FILTER"
        />

        <Card class="analytics-monthly-revenue-card analytics-panel analytics-bento-trend analytics-bento-wide">
          <AnalyticsMonthlyRevenueChartPanel
            title="Network revenue trend"
            eyebrow="Monthly"
            :points="monthlyRevenue.map((point) => ({
              periodMonth: point.periodMonth,
              label: formatShortMonth(point.periodMonth),
              revenue: point.revenue,
            }))"
            :loading="pending && !data"
            :error="error ? error.statusMessage || 'Unable to load monthly revenue right now.' : null"
            empty-title="No monthly revenue"
            empty-description="No monthly revenue matches the current admin filters."
            :fill-month-keys="monthlyRevenueChartMonthKeys"
            selectable
            @select-month="selectAdminPeriod"
          />
        </Card>

        <AnalyticsPlatformMix
          class="analytics-bento-platform analytics-bento-wide"
          title="DSP revenue trend"
          eyebrow="Platforms"
          summary="Platform revenue trend and DSP share for the active filters."
          :rows="platformBreakdown.map((row) => ({
            id: row.id,
            label: row.label,
            logoKey: row.logoKey,
            revenue: row.revenue,
            streams: row.streams,
            share: row.share,
          }))"
          :series="platformSeries"
          :earnings-rows="filteredRevenueRows.map((row) => ({
            periodMonth: row.periodMonth,
            channelId: row.channelId,
            channelName: row.channelName,
            releaseId: row.releaseId,
            releaseTitle: row.releaseTitle,
            revenue: row.revenue,
            streams: row.streams,
          }))"
          enable-data-view
          :chart-height="390"
          @select-platform="selectAdminPlatform"
          @select-period="selectAdminPeriod"
        />

        <div class="analytics-bento-streams analytics-bento-wide">
          <AnalyticsAudiencePulse
            title="DSP streaming trend"
            eyebrow="Streaming"
            summary="Top DSPs by streams over time from the active CSV analytics scope."
            :cards="dspStreamPulseCards"
            enable-data-view
            :chart-height="390"
            @select="selectAdminStreamPlatform"
          />
        </div>

        <AnalyticsRankPanel
          enable-data-view
          premium-tooltips
          title="Artist leaderboard"
          eyebrow="Performance"
          summary="Top artists by posted CSV royalty revenue."
          :rows="artistLeaderboard.map((artist) => ({
            id: artist.id,
            label: artist.label,
            meta: `${formatCount(artist.streams)} streams / ${artist.countryCount} countr${artist.countryCount === 1 ? 'y' : 'ies'} / ${formatRpm(artist.rpm)}`,
            value: artist.revenue,
            count: artist.streams,
            share: artist.share,
          }))"
          @select="selectAdminArtist"
        />

        <AnalyticsRankPanel
          title="Track revenue"
          eyebrow="Tracks"
          summary="Top tracks by revenue, useful for catalog dependency and payout review."
          enable-data-view
          premium-tooltips
          :rows="trackLeaderboard.map((track) => ({
            id: track.id,
            label: track.label,
            meta: `${formatCount(track.streams)} streams / ${formatRpm(track.rpm)}${track.meta ? ` / ${track.meta}` : ''}`,
            value: track.revenue,
            count: track.streams,
            share: track.share,
            imageUrl: track.imageUrl,
          }))"
          @select="selectAdminTrack"
        />
      </div>

      <div class="analytics-diagnostic-grid">
        <AnalyticsDiagnosticBarCard
          title="Fastest growing artists"
          badge="Growth"
          description="Latest visible month compared with each artist's previous visible month."
          :rows="growthChartRows"
          value-kind="money"
          variant="area"
          empty-title="No growth signal"
          expand-label="Open growth detail"
          :scope-label="analyticsScopeLabel"
          @select="selectDiagnosticArtistChartRow"
          @expand="openDiagnostic('growth')"
        />

        <AnalyticsDiagnosticBarCard
          title="Artists losing revenue"
          badge="Drops"
          description="Declines that may need catalog, platform, or statement review."
          :rows="declineChartRows"
          value-kind="money"
          variant="area"
          empty-title="No decline signal"
          expand-label="Open decline detail"
          :scope-label="analyticsScopeLabel"
          @select="selectDiagnosticArtistChartRow"
          @expand="openDiagnostic('drops')"
        />

        <AnalyticsDiagnosticBarCard
          title="Portfolio dependency"
          badge="Concentration"
          description="How much of the network is carried by a small number of artists, tracks, or platforms."
          :rows="concentrationChartRows"
          value-kind="percent"
          variant="bar"
          empty-title="No concentration signal"
          expand-label="Open concentration detail"
          :scope-label="analyticsScopeLabel"
          @select="selectConcentrationChartRow"
          @expand="openDiagnostic('concentration')"
        />

        <AnalyticsDiagnosticBarCard
          title="Single-track dependency"
          badge="Artist risk"
          description="Artists where one track contributes most visible revenue."
          :rows="artistRiskChartRows"
          value-kind="percent"
          variant="bar"
          empty-title="No dependency signal"
          expand-label="Open single-track dependency detail"
          :scope-label="analyticsScopeLabel"
          @select="selectDiagnosticArtistRiskChartRow"
          @expand="openDiagnostic('artistRisk')"
        />
      </div>

      <div class="analytics-diagnostic-grid">
        <AnalyticsDiagnosticBarCard
          title="Best paying platforms"
          badge="Platform RPM"
          description="Revenue per thousand streams by DSP."
          :rows="platformRpmChartRows"
          value-kind="rpm"
          variant="bar"
          empty-title="No RPM signal"
          expand-label="Open platform RPM detail"
          :scope-label="analyticsScopeLabel"
          @select="selectDiagnosticPlatformChartRow"
          @expand="openDiagnostic('platformRpm')"
        >
          <template #actions>
            <button type="button" class="rpm-info-button" aria-label="Explain RPM" title="Explain RPM" @click="rpmInfoOpen = true">
              <Info aria-hidden="true" />
            </button>
          </template>
        </AnalyticsDiagnosticBarCard>

        <AnalyticsDiagnosticBarCard
          title="Top earning countries"
          badge="Market"
          description="Revenue and stream contribution by listener territory."
          :rows="countryRevenueChartRows"
          value-kind="money"
          variant="donut"
          empty-title="No country revenue"
          expand-label="Open country market detail"
          :scope-label="analyticsScopeLabel"
          :total-value="summaryStats.totalRevenue"
          total-label="Scope revenue"
          @select="selectDiagnosticCountryChartRow"
          @expand="openDiagnostic('countryRpm')"
        >
          <template #actions>
            <button type="button" class="rpm-info-button" aria-label="Explain RPM" title="Explain RPM" @click="rpmInfoOpen = true">
              <Info aria-hidden="true" />
            </button>
          </template>
        </AnalyticsDiagnosticBarCard>

        <AnalyticsDiagnosticScatterCard
          title="High-stream weak earners"
          badge="Low RPM"
          description="Tracks with meaningful streams but below-average revenue per thousand streams."
          :points="weakRpmScatterPoints"
          x-kind="count"
          y-kind="rpm"
          empty-title="No weak RPM tracks"
          expand-label="Open weak-RPM track detail"
          :scope-label="analyticsScopeLabel"
          @select="selectWeakRpmScatterPoint"
          @expand="openDiagnostic('weakRpm')"
        >
          <template #actions>
            <button type="button" class="rpm-info-button" aria-label="Explain RPM" title="Explain RPM" @click="rpmInfoOpen = true">
              <Info aria-hidden="true" />
            </button>
          </template>
        </AnalyticsDiagnosticScatterCard>

        <AnalyticsDiagnosticBarCard
          title="Import coverage"
          badge="CSV quality"
          description="Dimension coverage and mismatches in the active CSV analytics scope."
          :rows="importCoverageChartRows"
          value-kind="count"
          variant="bar"
          empty-title="No import coverage issues"
          expand-label="Open import coverage detail"
          :scope-label="analyticsScopeLabel"
          @select="selectImportCoverageChartRow"
          @expand="openDiagnostic('csvQuality')"
        />
      </div>

      <Sheet v-model:open="diagnosticSheetOpen">
        <SheetContent
          v-if="diagnosticDetailInfo"
          side="right"
          class="analytics-data-sheet diagnostic-data-sheet"
          @focus-outside="preventAnalyticsOverlayDismiss"
          @interact-outside="preventAnalyticsOverlayDismiss"
          @pointer-down-outside="preventAnalyticsOverlayDismiss"
        >
          <SheetHeader class="analytics-data-sheet-header">
            <div class="analytics-data-sheet-kicker">
              <Badge variant="secondary" class="w-fit">
                {{ diagnosticDetailInfo.badge }}
              </Badge>
              <span>{{ diagnosticDetailInfo.rowCount.toLocaleString() }} rows / {{ analyticsScopeLabel }}</span>
            </div>
            <SheetTitle class="analytics-data-sheet-title">
              {{ diagnosticDetailInfo.title }}
            </SheetTitle>
            <SheetDescription class="analytics-data-sheet-description">
              {{ diagnosticDetailInfo.description }}
            </SheetDescription>
          </SheetHeader>

          <div class="analytics-data-sheet-summary">
            <span v-for="item in diagnosticSheetSummary" :key="item.label">
              <small>{{ item.label }}</small>
              <strong>{{ item.value }}</strong>
            </span>
          </div>

          <AppEmptyState
            v-if="diagnosticDetailInfo.rowCount === 0"
            compact
            icon="chart"
            title="No detail rows"
            description="The current admin filters do not have matching detail rows for this insight."
            class="diagnostic-detail-empty"
          />

          <div v-else class="analytics-data-sheet-table diagnostic-data-sheet-table">
            <Table v-if="expandedDiagnostic === 'growth' || expandedDiagnostic === 'drops'">
              <TableHeader>
                <TableRow>
                  <TableHead>Artist</TableHead>
                  <TableHead>Latest</TableHead>
                  <TableHead>Previous</TableHead>
                  <TableHead>Revenue change</TableHead>
                  <TableHead>Stream change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="artist in expandedDiagnostic === 'growth' ? artistGrowthDetailRows : artistDeclineDetailRows"
                  :key="`${expandedDiagnostic}:${artist.id}`"
                >
                  <TableCell>
                    <button type="button" class="diagnostic-sheet-link" @click="selectDiagnosticArtist(artist)">
                      <strong>{{ artist.label }}</strong>
                      <small>{{ formatMoney(artist.totalRevenue) }} total / {{ formatCount(artist.totalStreams) }} streams</small>
                    </button>
                  </TableCell>
                  <TableCell>
                    <strong>{{ formatMoney(artist.latestRevenue) }}</strong>
                    <small>{{ formatCount(artist.latestStreams) }} streams</small>
                  </TableCell>
                  <TableCell>
                    <strong>{{ formatMoney(artist.priorRevenue) }}</strong>
                    <small>{{ formatCount(artist.priorStreams) }} streams</small>
                  </TableCell>
                  <TableCell>
                    <strong :class="artist.revenueDelta >= 0 ? 'positive' : 'negative'">{{ formatMoney(artist.revenueDelta) }}</strong>
                    <small>{{ formatSignedPercent(artist.revenueChangePct) }}</small>
                  </TableCell>
                  <TableCell>
                    <strong :class="artist.streamDelta >= 0 ? 'positive' : 'negative'">{{ formatCount(artist.streamDelta) }}</strong>
                    <small>{{ formatSignedPercent(artist.streamChangePct) }}</small>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Table v-else-if="expandedDiagnostic === 'concentration'">
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Streams</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in concentrationDetailRows" :key="`${row.kind}:${row.id}`">
                  <TableCell>{{ row.kind }}</TableCell>
                  <TableCell>
                    <button type="button" class="diagnostic-sheet-link" @click="selectDiagnosticConcentrationRow(row)">
                      <strong>{{ row.label }}</strong>
                      <small>{{ row.meta || `${row.rowCount.toLocaleString()} CSV rows` }}</small>
                    </button>
                  </TableCell>
                  <TableCell><strong>{{ formatMoney(row.revenue) }}</strong></TableCell>
                  <TableCell>{{ formatCount(row.streams) }}</TableCell>
                  <TableCell>{{ formatShare(row.share) }}</TableCell>
                  <TableCell>{{ row.artistCount }} artists / {{ row.periodCount }} periods</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Table v-else-if="expandedDiagnostic === 'artistRisk'">
              <TableHeader>
                <TableRow>
                  <TableHead>Artist</TableHead>
                  <TableHead>Top track</TableHead>
                  <TableHead>Top-track revenue</TableHead>
                  <TableHead>Artist revenue</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead>Streams</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in catalogDependencyDetailRows" :key="`${row.artistId}:${row.trackId}`">
                  <TableCell>
                    <button type="button" class="diagnostic-sheet-link" @click="selectDiagnosticDependencyRow(row)">
                      <strong>{{ row.artistName }}</strong>
                      <small>{{ row.share >= 75 ? "High dependency" : "Moderate dependency" }}</small>
                    </button>
                  </TableCell>
                  <TableCell>{{ row.trackTitle }}</TableCell>
                  <TableCell><strong>{{ formatMoney(row.revenue) }}</strong></TableCell>
                  <TableCell>{{ formatMoney(row.artistRevenue) }}</TableCell>
                  <TableCell><strong :class="{ negative: row.share >= 75 }">{{ formatShare(row.share) }}</strong></TableCell>
                  <TableCell>{{ formatCount(row.streams) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Table v-else-if="expandedDiagnostic === 'platformRpm'">
              <TableHeader>
                <TableRow>
                  <TableHead>Platform</TableHead>
                  <TableHead>RPM</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Streams</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead>CSV rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="row in platformRpmRows"
                  :key="`${expandedDiagnostic}:${row.id}`"
                >
                  <TableCell>
                    <button
                      type="button"
                      class="diagnostic-sheet-link"
                      @click="selectDiagnosticPlatform(row)"
                    >
                      <strong>{{ row.label }}</strong>
                      <small>{{ row.periodCount }} periods / {{ row.artistCount }} artists</small>
                    </button>
                  </TableCell>
                  <TableCell><strong>{{ formatRpm(row.rpm) }}</strong></TableCell>
                  <TableCell>{{ formatMoney(row.revenue) }}</TableCell>
                  <TableCell>{{ formatCount(row.streams) }}</TableCell>
                  <TableCell>{{ formatShare(row.share) }}</TableCell>
                  <TableCell>{{ row.rowCount.toLocaleString() }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Table v-else-if="expandedDiagnostic === 'countryRpm'">
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Streams</TableHead>
                  <TableHead>RPM</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead>CSV rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in countryMarketRows" :key="`${expandedDiagnostic}:${row.id}`">
                  <TableCell>
                    <button type="button" class="diagnostic-sheet-link" @click="selectDiagnosticCountry(row)">
                      <strong>{{ row.label }}</strong>
                      <small>{{ row.periodCount }} periods / {{ row.artistCount }} artists</small>
                    </button>
                  </TableCell>
                  <TableCell><strong>{{ formatMoney(row.revenue) }}</strong></TableCell>
                  <TableCell>{{ formatCount(row.streams) }}</TableCell>
                  <TableCell>{{ formatRpm(row.rpm) }}</TableCell>
                  <TableCell>{{ formatShare(row.share) }}</TableCell>
                  <TableCell>{{ row.rowCount.toLocaleString() }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Table v-else-if="expandedDiagnostic === 'weakRpm'">
              <TableHeader>
                <TableRow>
                  <TableHead>Track</TableHead>
                  <TableHead>RPM</TableHead>
                  <TableHead>Scope RPM</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Streams</TableHead>
                  <TableHead>Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in lowRpmHighStreamTrackRows" :key="row.id">
                  <TableCell>
                    <button type="button" class="diagnostic-sheet-link" @click="selectDiagnosticTrack(row)">
                      <strong>{{ row.label }}</strong>
                      <small>{{ row.meta || `${row.rowCount.toLocaleString()} CSV rows` }}</small>
                    </button>
                  </TableCell>
                  <TableCell><strong class="negative">{{ formatRpm(row.rpm) }}</strong></TableCell>
                  <TableCell>{{ formatRpm(summaryStats.rpm) }}</TableCell>
                  <TableCell>{{ formatMoney(row.revenue) }}</TableCell>
                  <TableCell>{{ formatCount(row.streams) }}</TableCell>
                  <TableCell>{{ formatShare(row.share) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <Table v-else-if="expandedDiagnostic === 'csvQuality'">
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Artist</TableHead>
                  <TableHead>Release</TableHead>
                  <TableHead>Track</TableHead>
                  <TableHead>DSP</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Revenue</TableHead>
                  <TableHead>Streams</TableHead>
                  <TableHead>CSV rows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="item in csvQualityDetailRows" :key="item.key">
                  <TableCell>
                    <button type="button" class="diagnostic-sheet-link" @click="selectDiagnosticCsvRow(item.row)">
                      <strong>{{ item.issue }}</strong>
                      <small>Apply row scope</small>
                    </button>
                  </TableCell>
                  <TableCell>{{ formatMonth(item.row.periodMonth) }}</TableCell>
                  <TableCell>{{ item.row.artistName }}</TableCell>
                  <TableCell>{{ item.row.releaseTitle || "No linked release" }}</TableCell>
                  <TableCell>{{ item.row.trackTitle || "No linked track" }}</TableCell>
                  <TableCell>{{ item.row.channelName }}</TableCell>
                  <TableCell>{{ item.row.countryCode ? countryNameFor(item.row.countryCode, item.row.countryName) : "Unknown country" }}</TableCell>
                  <TableCell>{{ formatMoney(item.row.revenue) }}</TableCell>
                  <TableCell>{{ formatCount(item.row.streams) }}</TableCell>
                  <TableCell>{{ Number(item.row.rowCount ?? 1).toLocaleString() }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog v-model:open="importCoverageDialogOpen">
        <DialogContent
          class="import-coverage-dialog"
          @focus-outside="preventAnalyticsOverlayDismiss"
          @interact-outside="preventAnalyticsOverlayDismiss"
          @pointer-down-outside="preventAnalyticsOverlayDismiss"
        >
          <DialogHeader class="import-coverage-dialog-header">
            <div class="analytics-data-sheet-kicker">
              <Badge variant="secondary" class="w-fit">
                CSV quality
              </Badge>
              <span>{{ analyticsScopeLabel }}</span>
            </div>
            <DialogTitle class="analytics-data-sheet-title">
              Import coverage detail
            </DialogTitle>
            <DialogDescription class="analytics-data-sheet-description">
              Every grouped CSV analytics row contributing to coverage or revenue/stream mismatches.
            </DialogDescription>
          </DialogHeader>

          <div class="import-coverage-summary">
            <span>
              <small>Issue rows</small>
              <strong>{{ importCoverageTotalRows.toLocaleString() }}</strong>
            </span>
            <span>
              <small>CSV rows</small>
              <strong>{{ importCoverageCsvRowCount.toLocaleString() }}</strong>
            </span>
            <span>
              <small>Data gaps</small>
              <strong>{{ (dataQuality.missingCountryRows.length + dataQuality.missingReleaseRows.length + dataQuality.missingTrackRows.length).toLocaleString() }}</strong>
            </span>
            <span>
              <small>Monetization</small>
              <strong>{{ (dataQuality.revenueWithoutStreams.length + dataQuality.streamsWithoutRevenue.length).toLocaleString() }}</strong>
            </span>
          </div>

          <div class="import-coverage-filter-strip admin-filter-strip">
            <label class="admin-filter-control" :class="{ 'is-active': overviewPeriodRange !== DEFAULT_ANALYTICS_PERIOD_RANGE }" :title="`Date range: ${overviewPeriodLabel}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <CalendarRange class="size-4" />
              </span>
              <span class="admin-filter-label">Date range</span>
              <NativeSelect v-model="overviewPeriodRange" content-align="start">
                <option v-for="option in ANALYTICS_PERIOD_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </NativeSelect>
            </label>

            <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.periodMonth !== ALL_FILTER }" :title="`Period: ${selectedPeriodLabel}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <CalendarDays class="size-4" />
              </span>
              <span class="admin-filter-label">Period</span>
              <NativeSelect v-model="analyticsFocus.periodMonth" content-align="start">
                <option v-for="option in periodOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </NativeSelect>
            </label>

            <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.artistId !== ALL_FILTER }" :title="`Artist: ${selectedArtistLabel}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <UserRound class="size-4" />
              </span>
              <span class="admin-filter-label">Artist</span>
              <NativeSelect v-model="analyticsFocus.artistId" content-align="start">
                <option v-for="option in artistOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </NativeSelect>
            </label>

            <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.releaseId !== ALL_FILTER }" :title="`Release: ${selectedReleaseLabel}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <Disc3 class="size-4" />
              </span>
              <span class="admin-filter-label">Release</span>
              <NativeSelect
                v-model="analyticsFocus.releaseId"
                content-align="start"
                searchable
                search-placeholder="Search releases"
                lazy-options
                :lazy-option-initial-count="12"
                :lazy-option-batch-size="12"
              >
                <NativeSelectOption
                  v-for="option in releaseOptions"
                  :key="option.value"
                  :value="option.value"
                  :visual="option.value === ALL_FILTER ? null : {
                    kind: 'cover',
                    imageUrl: option.imageUrl,
                    label: option.label,
                  }"
                >
                  {{ option.label }}
                </NativeSelectOption>
              </NativeSelect>
            </label>

            <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.trackId !== ALL_FILTER }" :title="`Track: ${selectedTrackLabel}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <AudioLines class="size-4" />
              </span>
              <span class="admin-filter-label">Track</span>
              <NativeSelect
                v-model="analyticsFocus.trackId"
                content-align="start"
                searchable
                search-placeholder="Search tracks"
                lazy-options
                :lazy-option-initial-count="12"
                :lazy-option-batch-size="12"
              >
                <NativeSelectOption
                  v-for="option in trackOptions"
                  :key="option.value"
                  :value="option.value"
                  :visual="option.value === ALL_FILTER ? null : {
                    kind: 'cover',
                    imageUrl: option.imageUrl,
                    label: option.label,
                  }"
                >
                  {{ option.label }}
                </NativeSelectOption>
              </NativeSelect>
            </label>

            <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.channelId !== ALL_FILTER }" :title="`Platform: ${selectedPlatformLabel}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <RadioTower class="size-4" />
              </span>
              <span class="admin-filter-label">Platform</span>
              <NativeSelect
                v-model="analyticsFocus.channelId"
                content-align="start"
                searchable
                search-placeholder="Search platforms"
                lazy-options
                :lazy-option-initial-count="12"
                :lazy-option-batch-size="12"
              >
                <NativeSelectOption
                  v-for="option in channelOptions"
                  :key="option.value"
                  :value="option.value"
                  :visual="option.value === ALL_FILTER ? null : {
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

            <label class="admin-filter-control" :class="{ 'is-active': analyticsFocus.countryCode !== ALL_FILTER }" :title="`Country: ${selectedCountryLabel}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <Globe2 class="size-4" />
              </span>
              <span class="admin-filter-label">Country</span>
              <NativeSelect
                v-model="analyticsFocus.countryCode"
                content-align="start"
                searchable
                search-placeholder="Search countries"
                lazy-options
                :lazy-option-initial-count="12"
                :lazy-option-batch-size="12"
              >
                <NativeSelectOption
                  v-for="option in countryOptions"
                  :key="option.value"
                  :value="option.value"
                  :visual="option.value === ALL_FILTER || option.value === UNKNOWN_COUNTRY ? null : {
                    kind: 'country',
                    code: option.countryCode || option.value,
                    label: option.label,
                  }"
                >
                  {{ option.label }}
                </NativeSelectOption>
              </NativeSelect>
            </label>

            <label class="admin-filter-control" :class="{ 'is-active': importCoverageIssueFilter !== ALL_FILTER }" :title="`Issue: ${optionLabel(importCoverageIssueOptions, importCoverageIssueFilter, 'Selected issue')}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <FileWarning class="size-4" />
              </span>
              <span class="admin-filter-label">Issue</span>
              <NativeSelect v-model="importCoverageIssueFilter" content-align="start">
                <option v-for="option in importCoverageIssueOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </NativeSelect>
            </label>

            <label class="admin-filter-control import-coverage-page-size" :title="`Rows: ${importCoveragePageSize}`">
              <span class="admin-filter-icon" aria-hidden="true">
                <FileWarning class="size-4" />
              </span>
              <span class="admin-filter-label">Rows</span>
              <NativeSelect v-model="importCoveragePageSize" content-align="end">
                <option :value="50">50</option>
                <option :value="100">100</option>
              </NativeSelect>
            </label>

            <Button
              type="button"
              variant="secondary"
              class="admin-filter-reset"
              :disabled="!hasAnalyticsFocus && overviewPeriodRange === DEFAULT_ANALYTICS_PERIOD_RANGE && importCoverageIssueFilter === ALL_FILTER"
              aria-label="Reset import coverage filters"
              @click="resetImportCoverageFilters"
            >
              <RotateCcw class="size-4" aria-hidden="true" />
              <span>Reset</span>
            </Button>
          </div>

          <AppEmptyState
            v-if="!importCoverageTotalRows"
            compact
            icon="chart"
            title="No import coverage rows"
            description="The current admin filters do not have matching import coverage rows."
            class="import-coverage-empty"
          />

          <template v-else>
            <div class="analytics-data-sheet-table diagnostic-data-sheet-table import-coverage-table">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Issue</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Artist</TableHead>
                    <TableHead>Release</TableHead>
                    <TableHead>Track</TableHead>
                    <TableHead>DSP</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Streams</TableHead>
                    <TableHead>CSV rows</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="item in importCoveragePagedRows" :key="item.key">
                    <TableCell>
                      <button type="button" class="diagnostic-sheet-link" @click="selectDiagnosticCsvRow(item.row)">
                        <strong>{{ item.issue }}</strong>
                        <small>Row scope</small>
                      </button>
                    </TableCell>
                    <TableCell>{{ formatMonth(item.row.periodMonth) }}</TableCell>
                    <TableCell>{{ item.row.artistName }}</TableCell>
                    <TableCell>{{ item.row.releaseTitle || "No linked release" }}</TableCell>
                    <TableCell>{{ item.row.trackTitle || "No linked track" }}</TableCell>
                    <TableCell>{{ item.row.channelName }}</TableCell>
                    <TableCell>{{ item.row.countryCode ? countryNameFor(item.row.countryCode, item.row.countryName) : "Unknown country" }}</TableCell>
                    <TableCell>{{ formatMoney(item.row.revenue) }}</TableCell>
                    <TableCell>{{ formatCount(item.row.streams) }}</TableCell>
                    <TableCell>{{ Number(item.row.rowCount ?? 1).toLocaleString() }}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <AppPagination
              class="import-coverage-pagination"
              :page="importCoverageCurrentPage"
              :page-size="importCoveragePageSize"
              :total-count="importCoverageTotalRows"
              :total-pages="importCoverageTotalPages"
              :summary="importCoverageSummary"
              aria-label="Import coverage pagination"
              @update:page="importCoveragePage = $event"
            />
          </template>
        </DialogContent>
      </Dialog>

      <Sheet v-model:open="rpmInfoOpen">
        <SheetContent side="right" class="analytics-data-sheet rpm-info-sheet">
          <SheetHeader class="analytics-data-sheet-header">
            <div class="analytics-data-sheet-kicker">
              <Badge variant="secondary" class="w-fit">
                RPM
              </Badge>
              <span>Revenue per 1,000 streams</span>
            </div>
            <SheetTitle class="analytics-data-sheet-title">
              What RPM means
            </SheetTitle>
            <SheetDescription class="analytics-data-sheet-description">
              RPM is a comparison metric. It helps you understand how efficiently streams are turning into revenue.
            </SheetDescription>
          </SheetHeader>

          <div class="rpm-info-content">
            <section class="rpm-info-hero">
              <span>Formula</span>
              <strong>RPM = (Revenue / Streams) Ã— 1,000</strong>
              <p>
                RPM stands for revenue per mille. Mille means one thousand, so RPM means revenue per 1,000 streams.
              </p>
            </section>

            <section class="rpm-info-card">
              <span>Current example</span>
              <strong>{{ rpmExampleRow?.label || "No streamed row in scope" }}</strong>
              <p>{{ rpmExampleFormula }}</p>
              <small v-if="rpmExampleRow">
                Read this as {{ formatRpm(rpmExampleRow.rpm) }} for every 1,000 streams in the current filter scope.
              </small>
            </section>

            <div class="rpm-info-grid">
              <section>
                <span>Use it for</span>
                <strong>Efficiency comparison</strong>
                <p>Compare DSPs, countries, releases, or tracks after accounting for stream volume.</p>
              </section>
              <section>
                <span>Do not read it as</span>
                <strong>A payer or fixed rate</strong>
                <p>A country does not pay you directly. RPM is not a guaranteed per-stream payout.</p>
              </section>
              <section>
                <span>High revenue, low RPM</span>
                <strong>Large market, lower yield</strong>
                <p>This can still be very important because the stream volume is carrying revenue.</p>
              </section>
              <section>
                <span>High RPM, low streams</span>
                <strong>Efficient but small</strong>
                <p>This may be interesting, but it should not outrank real revenue impact by itself.</p>
              </section>
            </div>

            <section class="rpm-info-card">
              <span>Why RPM changes</span>
              <p>
                RPM can move because of subscription vs ad-supported listening, territory rates, DSP mix,
                content type, currency conversion, reporting lag, claims, and the number of paid streams in the sample.
              </p>
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </template>
  </div>
</template>

<style scoped>
@property --admin-filter-border-angle {
  syntax: "<angle>";
  inherits: false;
  initial-value: 0deg;
}

.admin-analytics-page {
  gap: 24px;
}

.admin-filter-dock-sentinel {
  height: 1px;
}

.admin-analytics-toolbar {
  --admin-filter-loader-size: 2px;
  --admin-filter-loader-rail: rgb(86 70 36 / 28%);
  --admin-filter-loader-edge: rgb(112 81 21 / 86%);
  --admin-filter-loader-gleam: rgb(212 165 45 / 78%);
  --admin-filter-loader-inner: rgb(255 247 219 / 56%);
  --admin-filter-loader-breath: rgb(112 81 21 / 12%);
  position: sticky;
  isolation: isolate;
  z-index: 40;
  top: calc(var(--topbar-height, 64px) + 10px);
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-depth-quiet, var(--shadow-card)));
  transition:
    border-color var(--duration-standard, 200ms) var(--ease-out),
    box-shadow var(--duration-standard, 200ms) var(--ease-out),
    transform var(--duration-standard, 200ms) var(--ease-out);
}

.admin-analytics-toolbar::before {
  position: absolute;
  z-index: 2;
  inset: calc(var(--admin-filter-loader-size) * -1);
  border-radius: inherit;
  background:
    conic-gradient(
      from var(--admin-filter-border-angle),
      transparent 0deg 218deg,
      var(--admin-filter-loader-rail) 246deg,
      var(--admin-filter-loader-edge) 272deg,
      var(--admin-filter-loader-gleam) 284deg,
      var(--admin-filter-loader-edge) 296deg,
      var(--admin-filter-loader-rail) 322deg,
      transparent 350deg,
      transparent 360deg
    );
  content: "";
  opacity: 0;
  padding: var(--admin-filter-loader-size);
  pointer-events: none;
  transition: opacity 180ms ease;
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  mask-composite: exclude;
}

.admin-analytics-toolbar::after {
  position: absolute;
  z-index: 1;
  inset: 1px;
  border-radius: inherit;
  background: transparent;
  content: "";
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease, box-shadow 180ms ease;
}

.admin-analytics-toolbar > * {
  position: relative;
  z-index: 3;
}

.admin-analytics-toolbar.is-docked {
  border-color: color-mix(in srgb, var(--primary) 22%, var(--surface-border, var(--border)));
  box-shadow: 0 16px 40px -32px rgb(0 0 0 / 62%), var(--shadow-sm);
}

.admin-analytics-toolbar.is-filter-loading {
  border-color: rgb(112 81 21 / 58%);
  box-shadow:
    0 16px 34px -30px rgb(40 31 13 / 46%),
    0 0 0 1px rgb(112 81 21 / 16%),
    var(--shadow-sm);
}

.admin-analytics-toolbar.is-filter-loading::before {
  animation: admin-filter-border-revolve 2.8s linear infinite;
  opacity: 1;
}

.admin-analytics-toolbar.is-filter-loading::after {
  animation: admin-filter-card-breath 2.8s ease-in-out infinite;
  box-shadow:
    inset 0 0 0 1px var(--admin-filter-loader-inner),
    inset 0 1px 0 rgb(255 255 255 / 36%),
    inset 0 -18px 34px -30px var(--admin-filter-loader-breath);
  opacity: 0.58;
}

:global(.dark) .admin-analytics-toolbar {
  --admin-filter-loader-size: 1px;
  --admin-filter-loader-rail: color-mix(in srgb, var(--foreground) 12%, transparent);
  --admin-filter-loader-edge: color-mix(in srgb, var(--priority) 64%, #5d4817 36%);
  --admin-filter-loader-gleam: color-mix(in srgb, #f7e6a5 34%, var(--priority) 66%);
  --admin-filter-loader-inner: rgb(244 238 223 / 10%);
  --admin-filter-loader-breath: rgb(216 173 37 / 8%);
}

:global(.dark) .admin-analytics-toolbar.is-filter-loading {
  border-color: color-mix(in srgb, var(--priority) 46%, var(--surface-border, var(--border)));
  box-shadow:
    0 14px 32px -30px rgb(0 0 0 / 82%),
    0 0 0 1px color-mix(in srgb, var(--priority) 10%, transparent),
    var(--shadow-sm);
}

@keyframes admin-filter-border-revolve {
  to {
    --admin-filter-border-angle: 360deg;
  }
}

@keyframes admin-filter-card-breath {
  0%,
  100% {
    opacity: 0.36;
  }

  42% {
    opacity: 0.64;
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-analytics-toolbar.is-filter-loading::before,
  .admin-analytics-toolbar.is-filter-loading::after {
    animation: none;
  }
}

.admin-toolbar-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.admin-toolbar-copy span,
.section-heading span,
.recommendation-row span,
.diagnostic-row small,
.quality-grid span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 720;
  letter-spacing: 0.075em;
  text-transform: uppercase;
}

.admin-toolbar-copy strong {
  max-width: 100%;
  overflow: hidden;
  color: var(--foreground);
  font-size: 14px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-filter-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(112px, 1fr)) auto;
  gap: 8px;
  align-items: center;
}

.admin-filter-control {
  position: relative;
  display: grid;
  min-width: 0;
  gap: 7px;
}

.admin-filter-label {
  padding-left: 32px;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.075em;
  line-height: 1;
  text-transform: uppercase;
}

.admin-filter-icon {
  position: absolute;
  z-index: 2;
  left: 10px;
  bottom: 8px;
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--foreground) 5%, transparent);
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
  pointer-events: none;
}

.admin-filter-control.is-active .admin-filter-icon {
  background: color-mix(in srgb, var(--priority) 14%, transparent);
  color: var(--foreground);
}

.admin-filter-control :deep([data-slot="native-select"]) {
  height: 40px;
  padding-left: 42px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 82%, var(--card) 18%);
}

.admin-filter-control.is-active :deep([data-slot="native-select"]) {
  border-color: color-mix(in srgb, var(--primary) 28%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--primary) 5%, var(--background));
}

.admin-filter-reset {
  align-self: end;
  height: 40px;
  min-width: 84px;
  border-radius: 10px;
}

.analytics-kpi-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.analytics-context-panel {
  min-width: 0;
  overflow: hidden;
}

.analytics-context-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.analytics-context-content > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.analytics-context-content span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: uppercase;
}

.analytics-context-content strong {
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 16px;
  font-weight: 750;
}

.analytics-context-content p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.55;
}

.recommendation-panel {
  min-width: 0;
  overflow: hidden;
}

.section-heading {
  align-items: center;
  gap: 16px;
}

.section-heading > div {
  display: grid;
  gap: 8px;
}

.section-heading :deep([data-slot="card-title"]) {
  margin: 0;
  color: var(--foreground);
  font-size: 18px;
  font-weight: 760;
  letter-spacing: 0;
}

.recommendation-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.recommendation-row {
  display: grid;
  gap: 7px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--surface-border, var(--border));
  border-left: 3px solid var(--status-info);
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: var(--card);
  box-shadow: var(--surface-depth-edge, var(--shadow-card));
}

.recommendation-row.tone-warning {
  border-left-color: var(--status-warning);
}

.recommendation-row.tone-critical {
  border-left-color: var(--destructive);
}

.recommendation-row.tone-success {
  border-left-color: var(--status-success);
}

.recommendation-row strong,
.diagnostic-row strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
}

.recommendation-row p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.recommendation-row em,
.diagnostic-row em {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-style: normal;
  font-variant-numeric: tabular-nums;
  font-weight: 680;
}

.admin-ops-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-areas:
    "financial financial"
    "actions health";
}

.financial-control-panel,
.admin-action-panel,
.catalog-health-panel {
  min-width: 0;
  overflow: hidden;
}

.financial-control-panel {
  display: grid;
  grid-area: financial;
  grid-template-rows: auto auto minmax(0, 1fr);
  overflow: hidden;
}

.admin-action-panel {
  grid-area: actions;
}

.catalog-health-panel {
  grid-area: health;
}

.financial-control-heading :deep([data-slot="card-description"]) {
  margin: 6px 0 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.45;
}

.section-heading.compact {
  margin-bottom: 12px;
}

.section-heading.compact :deep([data-slot="card-title"]) {
  font-size: 16px;
}

.financial-heading-actions {
  display: flex;
  align-items: end;
  justify-content: flex-end;
  gap: 10px;
  min-width: min(360px, 100%);
}

.financial-sort-control {
  display: grid;
  width: min(230px, 100%);
  gap: 7px;
}

.financial-sort-control > span {
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.075em;
  line-height: 1;
  text-transform: uppercase;
}

.financial-sort-control :deep([data-slot="native-select"]) {
  height: 38px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 82%, var(--card) 18%);
}

.financial-alert {
  margin: 0 16px;
}

.financial-control-content {
  display: grid;
  gap: 14px;
  padding-bottom: 16px;
}

.financial-metric-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(140px, 1fr));
}

.financial-metric-grid > span {
  display: grid;
  gap: 6px;
  min-width: 0;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--radius-xl, calc(var(--radius) + 4px));
  background: var(--card);
  box-shadow: var(--surface-depth-edge, var(--shadow-card));
  padding: 12px;
}

.financial-metric-grid > span.status-success {
  border-color: color-mix(in srgb, var(--status-success) 22%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--status-success) 6%, transparent);
}

.financial-metric-grid > span.status-warning {
  border-color: color-mix(in srgb, var(--priority) 26%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--priority) 7%, transparent);
}

.financial-metric-grid > span.status-critical {
  border-color: color-mix(in srgb, var(--destructive) 26%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--destructive) 7%, transparent);
}

.financial-metric-grid small,
.catalog-health-grid span,
.admin-action-row span {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.financial-metric-grid strong {
  overflow: hidden;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.financial-metric-grid em {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 11px;
  font-style: normal;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.financial-control-table {
  min-height: 0;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 86%, var(--background) 14%);
}

.financial-control-table :deep(table) {
  width: 100%;
  min-width: 1380px;
  border-collapse: collapse;
}

.financial-control-table :deep(th),
.financial-control-table :deep(td) {
  height: 52px;
  padding: 9px 13px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 48%, transparent);
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
  font-size: 12px;
  line-height: 1.25;
  text-align: left;
}

.financial-control-table :deep(th) {
  position: sticky;
  z-index: 2;
  top: 0;
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0;
  text-transform: uppercase;
}

.financial-control-table :deep(td) {
  font-variant-numeric: tabular-nums;
}

.financial-control-table :deep(tbody tr.trust-fail td) {
  background: color-mix(in srgb, var(--destructive) 5%, transparent);
}

.financial-control-table :deep(tbody tr.trust-warning td) {
  background: color-mix(in srgb, var(--priority) 5%, transparent);
}

.financial-control-table :deep(tbody tr.trust-pass td) {
  background: color-mix(in srgb, var(--status-success) 4%, transparent);
}

.financial-control-table :deep(tbody tr.trust-unchecked td) {
  background: color-mix(in srgb, var(--foreground) 1%, transparent);
}

.financial-control-table :deep(td strong),
.financial-control-table :deep(td span) {
  display: block;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
}

.financial-control-table :deep(td small) {
  display: block;
  margin-top: 4px;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.financial-artist-link {
  display: grid;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.financial-artist-link:hover strong {
  color: var(--primary);
}

.financial-empty-state {
  min-height: 220px;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.admin-action-list,
.catalog-health-grid {
  display: grid;
  gap: 10px;
}

.admin-action-row,
.catalog-health-grid article {
  display: grid;
  gap: 7px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--foreground) 2%, transparent);
  padding: 12px;
}

.admin-action-row strong,
.catalog-health-grid strong {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 820;
  line-height: 1.2;
}

.admin-action-row p,
.catalog-health-grid p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.38;
}

.admin-action-row em {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
}

.admin-action-row.severity-critical {
  border-color: color-mix(in srgb, var(--destructive) 24%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--destructive) 6%, transparent);
}

.admin-action-row.severity-warning,
.catalog-health-grid article.status-warning {
  border-color: color-mix(in srgb, var(--priority) 26%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--priority) 7%, transparent);
}

.admin-action-row.severity-success,
.catalog-health-grid article.status-success {
  border-color: color-mix(in srgb, var(--status-success) 22%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--status-success) 6%, transparent);
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

.analytics-bento-wide,
.analytics-bento-trend,
.analytics-bento-map,
.analytics-bento-platform,
.analytics-bento-streams {
  grid-column: 1 / -1;
}

.analytics-monthly-revenue-card,
.analytics-bento-streams {
  min-width: 0;
  overflow: hidden;
}

.analytics-diagnostic-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.analytics-diagnostic-card {
  min-width: 0;
  overflow: hidden;
}

.analytics-diagnostic-card :deep([data-slot="card-header"]) {
  gap: 8px;
  padding-bottom: 12px;
}

.analytics-diagnostic-card :deep([data-slot="card-action"]) {
  margin-top: -2px;
}

.diagnostic-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.rpm-info-button {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, white 18%);
  border-radius: 999px;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 58%), rgb(255 255 255 / 20%)),
    color-mix(in srgb, var(--card) 70%, transparent);
  color: color-mix(in srgb, var(--foreground) 62%, var(--muted-foreground));
  backdrop-filter: blur(12px) saturate(1.05);
  box-shadow:
    inset 1px 1px 0 rgb(255 255 255 / 68%),
    inset -1px -2px 4px rgb(0 0 0 / 5%),
    0 7px 18px -16px rgb(0 0 0 / 30%);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out),
    transform var(--duration-fast, 150ms) var(--ease-out);
}

.rpm-info-button svg {
  width: 14px;
  height: 14px;
  stroke-width: 2.2;
}

.rpm-info-button:hover {
  border-color: color-mix(in srgb, var(--foreground) 14%, var(--surface-border, var(--border)));
  color: var(--foreground);
  transform: none;
}

.rpm-info-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ring) 74%, var(--foreground));
  outline-offset: 2px;
}

.analytics-diagnostic-card :deep([data-slot="card-title"]) {
  font-size: 16px;
  font-weight: 740;
  letter-spacing: 0;
}

.diagnostic-list {
  display: grid;
  gap: 8px;
}

.diagnostic-row {
  display: grid;
  width: 100%;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.diagnostic-row:hover {
  border-color: color-mix(in srgb, var(--primary) 18%, transparent);
  background: color-mix(in srgb, var(--foreground) 3%, transparent);
}

.diagnostic-row.is-static {
  cursor: default;
}

.diagnostic-row.is-static:hover {
  border-color: transparent;
  background: transparent;
}

.diagnostic-row > span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.diagnostic-row strong,
.diagnostic-row small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnostic-row .positive {
  color: var(--status-success);
}

.diagnostic-row .negative {
  color: var(--destructive);
}

.quality-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.quality-grid > div {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 34%, transparent);
}

.quality-grid svg {
  color: var(--muted-foreground);
}

.quality-grid strong {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: 720;
}

:global(.diagnostic-data-sheet) {
  width: min(760px, calc(100vw - 18px));
  max-width: min(760px, calc(100vw - 18px)) !important;
  height: 100svh;
  gap: 0;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, var(--foreground) 6%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--background) 4%), color-mix(in srgb, var(--background) 72%, var(--card) 28%));
  box-shadow: -24px 0 60px -42px rgb(0 0 0 / 68%);
  padding: 0;
}

:global(.rpm-info-sheet) {
  width: min(540px, calc(100vw - 18px));
  max-width: min(540px, calc(100vw - 18px)) !important;
  height: 100svh;
  gap: 0;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, var(--foreground) 6%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--background) 4%), color-mix(in srgb, var(--background) 72%, var(--card) 28%));
  box-shadow: -24px 0 60px -42px rgb(0 0 0 / 68%);
  padding: 0;
}

:global(.diagnostic-data-sheet > button[aria-label="Close"]) {
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

:global(.rpm-info-sheet > button[aria-label="Close"]) {
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
  max-width: 560px;
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
  letter-spacing: 0;
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

.diagnostic-detail-empty {
  margin: 18px;
  min-height: 240px;
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

.diagnostic-data-sheet-table :deep(table) {
  width: 100%;
  min-width: 840px;
  border-collapse: collapse;
}

.diagnostic-data-sheet-table :deep(th) {
  position: sticky;
  z-index: 2;
  top: 0;
  height: 46px;
  background: color-mix(in srgb, var(--card) 96%, var(--background) 4%);
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
  font-size: 10px;
  font-weight: 720;
  letter-spacing: 0.055em;
  text-align: left;
  text-transform: uppercase;
}

.diagnostic-data-sheet-table :deep(th),
.diagnostic-data-sheet-table :deep(td) {
  height: 54px;
  padding: 9px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground) 12%);
  font-size: 12px;
  line-height: 1.25;
  vertical-align: middle;
}

.diagnostic-data-sheet-table :deep(td strong) {
  display: block;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.diagnostic-data-sheet-table :deep(td small) {
  display: block;
  margin-top: 4px;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.diagnostic-data-sheet-table :deep(tbody tr:hover td) {
  background-color: color-mix(in srgb, var(--foreground) 3%, transparent);
}

.diagnostic-sheet-link {
  display: grid;
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.diagnostic-sheet-link:hover strong {
  color: var(--primary);
}

.diagnostic-data-sheet-table :deep(.positive) {
  color: var(--status-success);
}

.diagnostic-data-sheet-table :deep(.negative) {
  color: var(--destructive);
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

.import-coverage-dialog {
  display: grid;
  width: min(calc(100vw - 28px), 1240px);
  max-width: min(calc(100vw - 28px), 1240px);
  height: min(88svh, 900px);
  max-height: calc(100svh - 28px);
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 0;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--background) 6%), color-mix(in srgb, var(--card) 84%, var(--background) 16%));
  padding: 0;
  box-shadow:
    0 34px 90px -54px rgb(0 0 0 / 58%),
    inset 0 1px 0 color-mix(in srgb, white 44%, transparent);
}

.import-coverage-dialog-header {
  display: grid;
  gap: 9px;
  padding: 22px 54px 18px 22px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--background) 3%), color-mix(in srgb, var(--card) 90%, var(--background) 10%));
}

.import-coverage-summary {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 14px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  background: color-mix(in srgb, var(--foreground) 2%, transparent);
}

.import-coverage-summary span {
  display: grid;
  gap: 5px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--card) 88%, var(--background) 12%);
  padding: 11px 13px;
}

.import-coverage-summary small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.import-coverage-summary strong {
  overflow: hidden;
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-coverage-filter-strip.admin-filter-strip {
  grid-template-columns: repeat(5, minmax(128px, 1fr));
  align-items: end;
  padding: 14px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  background: color-mix(in srgb, var(--card) 72%, var(--background) 28%);
}

.import-coverage-filter-strip .admin-filter-reset {
  width: 100%;
}

.import-coverage-page-size {
  min-width: 112px;
}

.import-coverage-table.analytics-data-sheet-table {
  height: 100%;
  min-height: 0;
  margin: 0 18px;
  border-radius: 12px;
}

.import-coverage-table :deep(table) {
  min-width: 1120px;
}

.import-coverage-empty {
  margin: 18px;
  min-height: 280px;
}

.import-coverage-pagination {
  padding: 14px 18px 18px;
  border-top: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  background: color-mix(in srgb, var(--card) 88%, var(--background) 12%);
}

:global(.import-coverage-dialog) {
  display: grid !important;
  width: min(calc(100vw - 28px), 1240px) !important;
  max-width: min(calc(100vw - 28px), 1240px) !important;
  height: min(88svh, 900px) !important;
  max-height: calc(100svh - 28px) !important;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 0;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--background) 6%), color-mix(in srgb, var(--card) 84%, var(--background) 16%));
  padding: 0 !important;
  box-shadow:
    0 34px 90px -54px rgb(0 0 0 / 58%),
    inset 0 1px 0 color-mix(in srgb, white 44%, transparent);
}

:global(.import-coverage-dialog .import-coverage-dialog-header) {
  display: grid;
  gap: 9px;
  padding: 22px 54px 18px 22px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--background) 3%), color-mix(in srgb, var(--card) 90%, var(--background) 10%));
}

:global(.import-coverage-dialog .import-coverage-summary) {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 14px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  background: color-mix(in srgb, var(--foreground) 2%, transparent);
}

:global(.import-coverage-dialog .import-coverage-filter-strip.admin-filter-strip) {
  grid-template-columns: repeat(5, minmax(128px, 1fr));
  align-items: end;
  padding: 14px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  background: color-mix(in srgb, var(--card) 72%, var(--background) 28%);
}

:global(.import-coverage-dialog .import-coverage-table.analytics-data-sheet-table) {
  height: 100%;
  min-height: 0;
  margin: 0 18px;
  border-radius: 12px;
}

:global(.import-coverage-dialog .import-coverage-pagination) {
  padding: 14px 18px 18px;
  border-top: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 54%, transparent);
  background: color-mix(in srgb, var(--card) 88%, var(--background) 12%);
}

.rpm-info-content {
  display: grid;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
}

.rpm-info-hero,
.rpm-info-card,
.rpm-info-grid section {
  display: grid;
  gap: 8px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 86%, var(--background) 14%);
  padding: 16px;
}

.rpm-info-hero {
  border-color: color-mix(in srgb, var(--primary) 18%, var(--surface-border, var(--border)));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--primary) 7%, var(--card)), color-mix(in srgb, var(--card) 88%, var(--background) 12%));
}

.rpm-info-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.rpm-info-content span {
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0;
  text-transform: uppercase;
}

.rpm-info-content strong {
  color: var(--foreground);
  font-size: 15px;
  font-weight: 760;
  line-height: 1.2;
}

.rpm-info-hero strong {
  font-family: var(--font-mono);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.rpm-info-content p,
.rpm-info-content small {
  margin: 0;
  color: color-mix(in srgb, var(--muted-foreground) 92%, var(--foreground) 8%);
  font-size: 13px;
  line-height: 1.5;
}

.rpm-info-content small {
  font-size: 12px;
}

:global(.dark .admin-analytics-page) {
  --card: #211f1b;
  --popover: #28251f;
  --surface-glass: #211f1b;
  --surface-glass-strong: #28251f;
  --surface-border: rgba(244, 238, 223, 0.15);
  --muted-foreground: #bdb39f;
}

:global(.dark .admin-analytics-toolbar),
:global(.dark .recommendation-row),
:global(.dark .quality-grid > div) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, var(--foreground) 8%), var(--card));
}

:global(.dark) .rpm-info-button {
  border-color: color-mix(in srgb, var(--foreground) 14%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 4%)),
    color-mix(in srgb, var(--card) 88%, var(--foreground) 12%);
  color: color-mix(in srgb, var(--foreground) 80%, var(--muted-foreground));
  box-shadow:
    inset 1px 1px 0 rgb(255 255 255 / 8%),
    inset -1px -2px 4px rgb(0 0 0 / 24%),
    0 7px 18px -15px rgb(0 0 0 / 86%);
}

:global(.dark) .rpm-info-button:hover {
  border-color: color-mix(in srgb, var(--foreground) 22%, var(--surface-border, var(--border)));
  color: var(--foreground);
}

:global(.dark .diagnostic-data-sheet) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 90%, var(--foreground) 10%), color-mix(in srgb, var(--card) 92%, var(--background) 8%));
  box-shadow: -28px 0 70px -44px rgb(0 0 0 / 72%);
}

:global(.dark .rpm-info-sheet) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 90%, var(--foreground) 10%), color-mix(in srgb, var(--card) 92%, var(--background) 8%));
  box-shadow: -28px 0 70px -44px rgb(0 0 0 / 72%);
}

:global(.dark) .analytics-data-sheet-header {
  border-bottom-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 90%, var(--foreground) 10%), var(--card));
}

:global(.dark) .analytics-data-sheet-summary {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background: color-mix(in srgb, var(--foreground) 5%, transparent);
}

:global(.dark) .analytics-data-sheet-summary span,
:global(.dark) .analytics-data-sheet-table {
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
}

:global(.dark) .import-coverage-dialog {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 90%, var(--foreground) 10%), color-mix(in srgb, var(--card) 92%, var(--background) 8%));
  box-shadow: 0 34px 90px -54px rgb(0 0 0 / 72%);
}

:global(.dark) .import-coverage-dialog-header,
:global(.dark) .import-coverage-pagination {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background: color-mix(in srgb, var(--card) 94%, var(--foreground) 6%);
}

:global(.dark) .import-coverage-summary,
:global(.dark) .import-coverage-filter-strip {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background: color-mix(in srgb, var(--foreground) 5%, transparent);
}

:global(.dark) .import-coverage-summary span {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
}

:global(.dark) .financial-control-panel,
:global(.dark) .admin-action-panel,
:global(.dark) .catalog-health-panel {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, var(--foreground) 8%), var(--card));
}

:global(.dark) .financial-metric-grid > span,
:global(.dark) .financial-control-table,
:global(.dark) .admin-action-row,
:global(.dark) .catalog-health-grid article {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
}

:global(.dark) .financial-control-table :deep(th) {
  background: color-mix(in srgb, var(--card) 88%, var(--foreground) 12%);
}

:global(.dark) .diagnostic-data-sheet-table :deep(th) {
  background: color-mix(in srgb, var(--card) 88%, var(--foreground) 12%);
}

:global(.dark) .diagnostic-data-sheet-table :deep(tbody tr:hover td) {
  background-color: color-mix(in srgb, var(--foreground) 6%, transparent);
}

:global(.dark) .rpm-info-hero,
:global(.dark) .rpm-info-card,
:global(.dark) .rpm-info-grid section {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background: color-mix(in srgb, var(--card) 94%, var(--background) 6%);
}

@media (max-width: 1280px) {
  .admin-filter-strip {
    grid-template-columns: repeat(4, minmax(142px, 1fr));
  }

  .admin-ops-grid {
    grid-template-columns: 1fr;
    grid-template-areas:
      "financial"
      "actions"
      "health";
  }

  .financial-metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .import-coverage-filter-strip.admin-filter-strip {
    grid-template-columns: repeat(3, minmax(142px, 1fr));
  }

  :global(.import-coverage-dialog .import-coverage-filter-strip.admin-filter-strip) {
    grid-template-columns: repeat(3, minmax(142px, 1fr));
  }

  .admin-filter-reset {
    width: 100%;
  }

  .recommendation-grid,
  .analytics-diagnostic-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 1180px) {
  .analytics-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-bento,
  .analytics-bento > *,
  .analytics-bento-map,
  .analytics-bento-platform,
  .analytics-bento-trend,
  .analytics-bento-wide {
    grid-column: auto;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .analytics-diagnostic-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .admin-toolbar-copy,
  .analytics-context-panel,
  .section-heading {
    display: grid;
    justify-content: stretch;
  }

  .admin-filter-strip,
  .import-coverage-filter-strip.admin-filter-strip,
    .analytics-kpi-grid,
    .financial-metric-grid,
    .recommendation-grid,
    .analytics-diagnostic-grid,
    .quality-grid {
    grid-template-columns: 1fr;
  }

  .admin-analytics-toolbar {
    top: calc(var(--topbar-height, 64px) + 8px);
    max-height: calc(100svh - var(--topbar-height, 64px) - 16px);
    overflow: auto;
  }

  .financial-control-heading,
  .financial-metric-grid {
    padding-right: 12px;
    padding-left: 12px;
  }

  .financial-heading-actions {
    justify-content: stretch;
  }

  .financial-heading-actions > * {
    width: 100%;
  }

  .financial-control-table {
    margin-right: 12px;
    margin-left: 12px;
  }

  .import-coverage-dialog {
    width: calc(100vw - 16px);
    max-width: calc(100vw - 16px);
    height: calc(100svh - 16px);
    max-height: calc(100svh - 16px);
    border-radius: 14px;
  }

  :global(.import-coverage-dialog) {
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
    height: calc(100svh - 16px) !important;
    max-height: calc(100svh - 16px) !important;
    border-radius: 14px;
  }

  .import-coverage-dialog-header {
    padding: 18px 48px 14px 16px;
  }

  :global(.import-coverage-dialog .import-coverage-dialog-header) {
    padding: 18px 48px 14px 16px;
  }

  .import-coverage-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 12px;
  }

  :global(.import-coverage-dialog .import-coverage-summary) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 12px;
  }

  .import-coverage-filter-strip.admin-filter-strip {
    max-height: 34svh;
    overflow-y: auto;
    padding: 12px;
  }

  :global(.import-coverage-dialog .import-coverage-filter-strip.admin-filter-strip) {
    grid-template-columns: 1fr;
    max-height: 34svh;
    overflow-y: auto;
    padding: 12px;
  }

  .import-coverage-table.analytics-data-sheet-table {
    margin: 0 12px;
  }

  :global(.import-coverage-dialog .import-coverage-table.analytics-data-sheet-table) {
    margin: 0 12px;
  }

  .import-coverage-pagination {
    padding: 12px;
  }

  :global(.import-coverage-dialog .import-coverage-pagination) {
    padding: 12px;
  }
}
</style>
