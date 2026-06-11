import { getQuery } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import {
  analyticsMonthRangeBounds,
  analyticsMonthRange,
  analyticsPeriodMonthDateKey,
  analyticsPeriodMonthKey,
  DEFAULT_ANALYTICS_PERIOD_RANGE,
  type AnalyticsPeriodRange,
} from "~~/app/utils/analytics-periods"
import { toMoneyString } from "~~/server/utils/money"
import { fetchAllByChunks, fetchAllPages } from "~~/server/utils/supabase-pagination"
import { dspLogoKeyForName } from "~~/app/utils/dsp-logos"
import type {
  ArtistAnalyticsCountryRow,
  ArtistAnalyticsEarningsRow,
  ArtistAnalyticsFilterOptions,
  ArtistAnalyticsMetric,
  ArtistAnalyticsOverviewResponse,
  ArtistAnalyticsPlatformRow,
  ArtistAnalyticsPlatformSeries,
  ArtistAnalyticsReleaseRow,
  ArtistAnalyticsTrendPoint,
} from "~~/types/dashboard"

interface OverviewRollupRow {
  row_type: string
  month: string | null
  channel_id: string | null
  territory: string | null
  release_id: string | null
  track_id: string | null
  revenue: string | number | null
  streams: number | string | null
  row_count: number | string | null
  territory_count: number | string | null
}

interface ChannelLookupRow {
  id: string
  raw_name: string
  display_name: string | null
}

interface ReleaseLookupRow {
  id: string
  title: string
  cover_art_url: string | null
  cover_thumb_url: string | null
}

interface TrackLookupRow {
  id: string
  title: string
}

interface AnalyticsFilters {
  periodMonth: string
  channelId: string
  territory: string
  releaseId: string
  trackId: string
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

function analyticsPeriodRangeFromQuery(value: unknown): AnalyticsPeriodRange {
  const requested = Array.isArray(value) ? value[0] : value

  if (
    requested === "last_3_months"
    || requested === "last_6_months"
    || requested === "last_12_months"
    || requested === "ytd"
    || requested === "all_time"
  ) {
    return requested
  }

  return DEFAULT_ANALYTICS_PERIOD_RANGE
}

function filterValueFromQuery(value: unknown) {
  const requested = Array.isArray(value) ? value[0] : value
  const normalized = String(requested ?? "").trim()

  return normalized || ALL_FILTER_VALUE
}

function periodMonthFilterValueFromQuery(value: unknown) {
  const normalized = filterValueFromQuery(value)

  if (normalized === ALL_FILTER_VALUE || normalized === EMPTY_FILTER_VALUE) {
    return normalized
  }

  return analyticsPeriodMonthDateKey(normalized) || ALL_FILTER_VALUE
}

function periodMonthKeyFromQuery(value: unknown) {
  const requested = Array.isArray(value) ? value[0] : value
  return analyticsPeriodMonthKey(requested)
}

function numeric(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function monthDateFromKey(value: string | null | undefined) {
  return value ? `${value}-01` : null
}

function formatMoney(value: Decimal.Value) {
  return `$${new Decimal(value ?? 0).toDecimalPlaces(2).toFixed(2)}`
}

function formatCount(value: number | null | undefined) {
  return compactNumberFormatter.format(Number(value ?? 0))
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

function formatShare(value: number | null | undefined) {
  return `${Number(value ?? 0).toFixed(1)}%`
}

function optionLabel(label: string | null | undefined, fallback: string) {
  return label || fallback
}

function normalizedCountryCode(value: string | null | undefined) {
  const code = String(value ?? "").trim().toUpperCase()

  if (code === "UK") {
    return "GB"
  }

  if (!/^[A-Z]{2}$/.test(code) || ["EU", "WW", "XX", "ZZ"].includes(code)) {
    return null
  }

  return code
}

function countryNameForCode(value: string | null | undefined) {
  const code = normalizedCountryCode(value)

  if (!code) {
    return "Unknown country"
  }

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
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

function emptyResponse(): ArtistAnalyticsOverviewResponse {
  return {
    summary: {
      totalRoyaltyRevenue: "0.00",
      totalPublishingRevenue: "0.00",
      totalStreams: 0,
      royaltyRowCount: 0,
    },
    metrics: [
      { label: "Royalty revenue", value: "$0.00", footnote: "0 plays + impressions after filters", tone: "accent" },
      { label: "Top country", value: "No country", footnote: "No earnings posted yet", tone: "default" },
      { label: "Top platform", value: "No platform", footnote: "No earnings posted yet", tone: "default" },
      { label: "Publishing", value: "$0.00", footnote: "Period-scoped credits", tone: "alt" },
    ],
    monthlyRevenue: [],
    countries: [],
    platformRows: [],
    platformSeries: [],
    releaseRows: [],
    filterOptions: {
      periodMonths: [],
      channels: [],
      territories: [],
      releases: [],
      tracks: [],
    },
    earningsRows: [],
    publishingRows: [],
    audienceSnapshots: [],
  }
}

function buildMetrics(
  totalRoyaltyRevenue: Decimal,
  totalStreams: number,
  totalPublishingRevenue: Decimal,
  countries: ArtistAnalyticsCountryRow[],
  platformRows: ArtistAnalyticsPlatformRow[],
  monthlyRevenue: ArtistAnalyticsTrendPoint[],
): ArtistAnalyticsMetric[] {
  const topCountry = countries[0] ?? null
  const topPlatform = platformRows[0] ?? null
  const bestMonth = monthlyRevenue.reduce<ArtistAnalyticsTrendPoint | null>((best, point) => (
    !best || point.revenue > best.revenue ? point : best
  ), null)

  return [
    {
      label: "Royalty revenue",
      value: formatMoney(totalRoyaltyRevenue),
      footnote: `${formatCount(totalStreams)} plays + impressions after filters`,
      tone: "accent",
    },
    {
      label: "Top country",
      value: topCountry?.countryName || "No country",
      footnote: topCountry ? `${formatShare(topCountry.share)} of visible revenue` : "No earnings posted yet",
      tone: "default",
    },
    {
      label: "Top platform",
      value: topPlatform?.label || "No platform",
      footnote: topPlatform ? `${formatMoney(topPlatform.revenue)} / ${formatShare(topPlatform.share)}` : "No earnings posted yet",
      tone: "default",
      valueLogoKey: topPlatform?.logoKey ?? null,
    },
    {
      label: "Publishing",
      value: formatMoney(totalPublishingRevenue),
      footnote: bestMonth ? `Best month ${bestMonth.label}` : "Period-scoped credits",
      tone: "alt",
    },
  ]
}

function rollupsOf(rows: OverviewRollupRow[], rowType: string) {
  return rows.filter((row) => row.row_type === rowType)
}

function rollupCount(value: string | number | null | undefined) {
  return Number(value ?? 0)
}

function rollupMoney(value: string | number | null | undefined) {
  return new Decimal(value ?? 0)
}

async function loadOverviewRollups(
  supabase: any,
  artistIds: string[],
  overviewPeriodRange: AnalyticsPeriodRange,
  filters: AnalyticsFilters,
  overviewPeriodStartMonth: string | null = null,
  overviewPeriodEndMonth: string | null = null,
) {
  const monthRange = analyticsMonthRangeBounds(overviewPeriodStartMonth, overviewPeriodEndMonth) ?? analyticsMonthRange(overviewPeriodRange)
  const rpcArgs = {
    target_artist_ids: artistIds,
    target_period_start_month: monthDateFromKey(monthRange?.startMonth),
    target_period_end_month: monthDateFromKey(monthRange?.endMonth),
    target_period_month: filters.periodMonth,
    target_channel_id: filters.channelId,
    target_territory: filters.territory,
    target_release_id: filters.releaseId,
    target_track_id: filters.trackId,
  }

  return await fetchAllPages<OverviewRollupRow>(
    "Unable to load analytics overview.",
    (from, to) => supabase
      .rpc("get_artist_analytics_overview_rollups", rpcArgs)
      .range(from, to),
  )
}

async function loadDashboardHomeAnalyticsRollups(
  supabase: any,
  artistIds: string[],
  overviewPeriodRange: AnalyticsPeriodRange,
) {
  const monthRange = analyticsMonthRange(overviewPeriodRange)
  const rpcArgs = {
    target_artist_ids: artistIds,
    target_period_start_month: monthDateFromKey(monthRange?.startMonth),
    target_period_end_month: monthDateFromKey(monthRange?.endMonth),
  }

  return await fetchAllPages<OverviewRollupRow>(
    "Unable to load dashboard analytics summary.",
    (from, to) => supabase
      .rpc("get_artist_dashboard_home_analytics_rollups", rpcArgs)
      .range(from, to),
  )
}

function buildRollupFilterOptions(
  rollupRows: OverviewRollupRow[],
  channelById: Map<string, string>,
  releaseById: Map<string, ReleaseLookupRow>,
  trackById: Map<string, TrackLookupRow>,
): ArtistAnalyticsFilterOptions {
  const periodMonths = new Set<string>()
  const channels = new Map<string, string>()
  const territories = new Map<string, string>()
  const releases = new Map<string, { label: string; imageUrl: string | null }>()
  const tracks = new Map<string, { label: string; imageUrl: string | null }>()

  for (const row of rollupsOf(rollupRows, "filter_period")) {
    if (row.month) {
      periodMonths.add(row.month)
    }
  }

  for (const row of rollupsOf(rollupRows, "filter_channel")) {
    const value = row.channel_id || EMPTY_FILTER_VALUE
    channels.set(value, row.channel_id ? channelById.get(row.channel_id) ?? "Unknown channel" : "Unassigned channel")
  }

  for (const row of rollupsOf(rollupRows, "filter_territory")) {
    const value = row.territory || EMPTY_FILTER_VALUE
    territories.set(value, value === EMPTY_FILTER_VALUE ? "Unknown country" : countryNameForCode(value))
  }

  for (const row of rollupsOf(rollupRows, "filter_release")) {
    const value = row.release_id || EMPTY_FILTER_VALUE
    const release = row.release_id ? releaseById.get(row.release_id) ?? null : null
    releases.set(value, {
      label: row.release_id ? optionLabel(release?.title, "Catalog item unavailable") : "No linked release",
      imageUrl: release?.cover_thumb_url ?? release?.cover_art_url ?? null,
    })
  }

  for (const row of rollupsOf(rollupRows, "filter_track")) {
    const value = row.track_id || EMPTY_FILTER_VALUE
    const release = row.release_id ? releaseById.get(row.release_id) ?? null : null
    tracks.set(value, {
      label: row.track_id ? optionLabel(trackById.get(row.track_id)?.title, "Catalog item unavailable") : "No linked track",
      imageUrl: release?.cover_thumb_url ?? release?.cover_art_url ?? null,
    })
  }

  return {
    periodMonths: [...periodMonths]
      .sort((left, right) => right.localeCompare(left))
      .map((periodMonth) => ({ value: periodMonth, label: formatMonth(periodMonth) })),
    channels: [...channels.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label, logoKey: dspLogoKeyForName(label) })),
    territories: [...territories.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label })),
    releases: [...releases.entries()]
      .sort((left, right) => left[1].label.localeCompare(right[1].label))
      .map(([value, option]) => ({ value, label: option.label, imageUrl: option.imageUrl })),
    tracks: [...tracks.entries()]
      .sort((left, right) => left[1].label.localeCompare(right[1].label))
      .map(([value, option]) => ({ value, label: option.label, imageUrl: option.imageUrl })),
  }
}

function buildRollupMonthlyRevenue(rows: OverviewRollupRow[], visiblePeriodMonths: string[]) {
  const monthlyRows = rollupsOf(rows, "monthly")

  if (!monthlyRows.length) {
    return visiblePeriodMonths.map((periodMonth) => ({
      key: periodMonth,
      periodMonth,
      label: formatShortMonth(periodMonth),
      value: 0,
      revenue: 0,
      streams: 0,
    } satisfies ArtistAnalyticsTrendPoint))
  }

  return monthlyRows
    .filter((row) => row.month)
    .sort((left, right) => String(left.month).localeCompare(String(right.month)))
    .map((row) => {
      const revenue = numeric(row.revenue)

      return {
        key: row.month!,
        periodMonth: row.month!,
        label: formatShortMonth(row.month!),
        value: revenue,
        revenue,
        streams: rollupCount(row.streams),
      } satisfies ArtistAnalyticsTrendPoint
    })
}

function buildRollupCountries(rows: OverviewRollupRow[], totalRoyaltyRevenue: Decimal): ArtistAnalyticsCountryRow[] {
  const total = totalRoyaltyRevenue.isZero() ? new Decimal(1) : totalRoyaltyRevenue

  return rollupsOf(rows, "country")
    .map((row) => {
      const revenue = rollupMoney(row.revenue)
      const countryCode = normalizedCountryCode(row.territory)

      return {
        countryCode,
        countryName: countryNameForCode(countryCode),
        revenue: revenue.toNumber(),
        streams: rollupCount(row.streams),
        share: revenue.div(total).mul(100).toNumber(),
      }
    })
    .sort((left, right) => right.revenue - left.revenue)
}

function buildRollupPlatformRows(
  rows: OverviewRollupRow[],
  totalRoyaltyRevenue: Decimal,
  channelById: Map<string, string>,
  fallbackOptions: ArtistAnalyticsFilterOptions["channels"],
) {
  const platformRows = rollupsOf(rows, "platform")
  const total = totalRoyaltyRevenue.isZero() ? new Decimal(1) : totalRoyaltyRevenue

  if (!platformRows.length) {
    return fallbackOptions.map((option) => ({
      id: option.value,
      label: option.label,
      logoKey: dspLogoKeyForName(option.label),
      revenue: 0,
      streams: 0,
      share: 0,
    } satisfies ArtistAnalyticsPlatformRow))
  }

  return platformRows
    .map((row) => {
      const id = row.channel_id || EMPTY_FILTER_VALUE
      const label = row.channel_id ? channelById.get(row.channel_id) ?? "Unknown channel" : "Unassigned channel"
      const revenue = rollupMoney(row.revenue)

      return {
        id,
        label,
        logoKey: dspLogoKeyForName(label),
        revenue: revenue.toNumber(),
        streams: rollupCount(row.streams),
        share: revenue.div(total).mul(100).toNumber(),
      } satisfies ArtistAnalyticsPlatformRow
    })
    .sort((left, right) => right.revenue - left.revenue)
}

function buildRollupPlatformSeries(
  rows: OverviewRollupRow[],
  channelById: Map<string, string>,
  visiblePeriodMonths: string[],
  fallbackOptions: ArtistAnalyticsFilterOptions["channels"],
) {
  const byPlatform = new Map<string, { label: string; points: Map<string, Decimal>; total: Decimal }>()

  for (const row of rollupsOf(rows, "platform_month")) {
    if (!row.month) {
      continue
    }

    const key = row.channel_id || EMPTY_FILTER_VALUE
    const label = row.channel_id ? channelById.get(row.channel_id) ?? "Unknown channel" : "Unassigned channel"
    const existing = byPlatform.get(key) ?? { label, points: new Map<string, Decimal>(), total: new Decimal(0) }
    const revenue = rollupMoney(row.revenue)

    existing.points.set(row.month, revenue)
    existing.total = existing.total.add(revenue)
    byPlatform.set(key, existing)
  }

  if (!byPlatform.size) {
    return fallbackOptions.map((option) => ({
      key: option.value,
      label: option.label,
      points: visiblePeriodMonths.map((periodMonth) => ({
        key: periodMonth,
        label: formatShortMonth(periodMonth),
        value: 0,
      })),
    } satisfies ArtistAnalyticsPlatformSeries))
  }

  return [...byPlatform.entries()]
    .map(([key, value]) => ({
      key,
      label: value.label,
      total: value.total.toNumber(),
      points: [...value.points.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([periodMonth, revenue]) => ({
          key: periodMonth,
          label: formatShortMonth(periodMonth),
          value: revenue.toNumber(),
        })),
    }))
    .sort((left, right) => right.total - left.total)
    .map(({ total: _total, ...series }) => series)
}

function buildRollupReleaseRows(
  rows: OverviewRollupRow[],
  releaseById: Map<string, ReleaseLookupRow>,
  fallbackOptions: ArtistAnalyticsFilterOptions["releases"],
): ArtistAnalyticsReleaseRow[] {
  const releaseRows = rollupsOf(rows, "release")

  if (!releaseRows.length) {
    return fallbackOptions.map((option) => ({
      id: option.value,
      label: option.label,
      value: 0,
      count: 0,
      meta: "0 countries",
      coverArtUrl: null,
      coverThumbUrl: null,
    }))
  }

  return releaseRows
    .map((row) => {
      const id = row.release_id || EMPTY_FILTER_VALUE
      const release = row.release_id ? releaseById.get(row.release_id) ?? null : null
      const territoryCount = rollupCount(row.territory_count)

      return {
        id,
        label: row.release_id ? optionLabel(release?.title, "Catalog item unavailable") : "No linked release",
        value: numeric(row.revenue),
        count: rollupCount(row.streams),
        meta: `${territoryCount} countr${territoryCount === 1 ? "y" : "ies"}`,
        coverArtUrl: release?.cover_art_url ?? null,
        coverThumbUrl: release?.cover_thumb_url ?? release?.cover_art_url ?? null,
      } satisfies ArtistAnalyticsReleaseRow
    })
    .sort((left, right) => numeric(right.value) - numeric(left.value))
}

function serializeRollupEarningsRows(
  rows: OverviewRollupRow[],
  channelById: Map<string, string>,
  releaseById: Map<string, ReleaseLookupRow>,
): ArtistAnalyticsEarningsRow[] {
  return rollupsOf(rows, "earnings_matrix")
    .filter((row) => row.month)
    .map((row) => ({
      periodMonth: row.month!,
      channelId: row.channel_id,
      channelName: row.channel_id ? channelById.get(row.channel_id) ?? "Unknown channel" : "Unassigned channel",
      territory: null,
      releaseId: row.release_id,
      releaseTitle: row.release_id ? optionLabel(releaseById.get(row.release_id)?.title, "Catalog item unavailable") : "No linked release",
      trackId: null,
      trackTitle: null,
      revenue: toMoneyString(row.revenue ?? 0),
      streams: rollupCount(row.streams),
    }))
}

function emptyFilterOptions(): ArtistAnalyticsFilterOptions {
  return {
    periodMonths: [],
    channels: [],
    territories: [],
    releases: [],
    tracks: [],
  }
}

async function loadDashboardHomeAnalyticsResponse(
  supabase: any,
  artistIds: string[],
  overviewPeriodRange: AnalyticsPeriodRange,
) {
  const rollupRows = await loadDashboardHomeAnalyticsRollups(supabase, artistIds, overviewPeriodRange)
  const channelIds = [...new Set(rollupRows.map((row) => row.channel_id).filter(Boolean) as string[])]
  const releaseIds = [...new Set(rollupRows.map((row) => row.release_id).filter(Boolean) as string[])]

  const [channelLookupRows, releaseLookupRows] = await Promise.all([
    channelIds.length
      ? fetchAllByChunks<ChannelLookupRow, string>(
          channelIds,
          "Unable to load dashboard analytics channel labels.",
          (chunk, from, to) => supabase
            .from("channels")
            .select("id, raw_name, display_name")
            .in("id", chunk)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as ChannelLookupRow[]),
    releaseIds.length
      ? fetchAllByChunks<ReleaseLookupRow, string>(
          releaseIds,
          "Unable to load dashboard analytics release labels.",
          (chunk, from, to) => supabase
            .from("releases")
            .select("id, title, cover_art_url, cover_thumb_url")
            .in("id", chunk)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as ReleaseLookupRow[]),
  ])

  const channelById = new Map(channelLookupRows.map((row) => [row.id, row.display_name || row.raw_name]))
  const releaseById = new Map(releaseLookupRows.map((row) => [row.id, row]))
  const summaryRow = rollupsOf(rollupRows, "summary")[0] ?? null
  const totalRoyaltyRevenue = rollupMoney(summaryRow?.revenue)
  const totalStreams = rollupCount(summaryRow?.streams)
  const royaltyRowCount = rollupCount(summaryRow?.row_count)
  const monthlyRevenue = buildRollupMonthlyRevenue(rollupRows, [])
  const countries = buildRollupCountries(rollupRows, totalRoyaltyRevenue)
  const platformRows = buildRollupPlatformRows(rollupRows, totalRoyaltyRevenue, channelById, [])
  const releaseRows = buildRollupReleaseRows(rollupRows, releaseById, [])
  const totalPublishingRevenue = new Decimal(0)

  return {
    summary: {
      totalRoyaltyRevenue: toMoneyString(totalRoyaltyRevenue),
      totalPublishingRevenue: toMoneyString(totalPublishingRevenue),
      totalStreams,
      royaltyRowCount,
    },
    metrics: buildMetrics(totalRoyaltyRevenue, totalStreams, totalPublishingRevenue, countries, platformRows, monthlyRevenue),
    monthlyRevenue,
    countries,
    platformRows,
    platformSeries: [],
    releaseRows,
    filterOptions: emptyFilterOptions(),
    earningsRows: [],
    publishingRows: [],
    audienceSnapshots: [],
  } satisfies ArtistAnalyticsOverviewResponse
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const overviewPeriodRange = analyticsPeriodRangeFromQuery(query.overviewPeriodRange)
  const overviewPeriodStartMonth = periodMonthKeyFromQuery(query.overviewPeriodStartMonth)
  const overviewPeriodEndMonth = periodMonthKeyFromQuery(query.overviewPeriodEndMonth)
  const useDashboardHomeSurface = filterValueFromQuery(query.surface) === "dashboard_home"
  const filters: AnalyticsFilters = {
    periodMonth: periodMonthFilterValueFromQuery(query.periodMonth),
    channelId: filterValueFromQuery(query.channelId),
    territory: filterValueFromQuery(query.territory),
    releaseId: filterValueFromQuery(query.releaseId),
    trackId: filterValueFromQuery(query.trackId),
  }
  const supabase = serverSupabaseServiceRole(event)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "analytics")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return emptyResponse()
  }

  if (useDashboardHomeSurface) {
    return await loadDashboardHomeAnalyticsResponse(supabase, artistIds, overviewPeriodRange)
  }

  const rollupRows = await loadOverviewRollups(
    supabase,
    artistIds,
    overviewPeriodRange,
    filters,
    overviewPeriodStartMonth,
    overviewPeriodEndMonth,
  )
  const channelIds = [...new Set(rollupRows.map((row) => row.channel_id).filter(Boolean) as string[])]
  const releaseIds = [...new Set(rollupRows.map((row) => row.release_id).filter(Boolean) as string[])]
  const trackIds = [...new Set(rollupRows.map((row) => row.track_id).filter(Boolean) as string[])]

  const [channelLookupRows, releaseLookupRows, trackLookupRows] = await Promise.all([
    channelIds.length
      ? fetchAllByChunks<ChannelLookupRow, string>(
          channelIds,
          "Unable to load analytics channel labels.",
          (chunk, from, to) => supabase
            .from("channels")
            .select("id, raw_name, display_name")
            .in("id", chunk)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as ChannelLookupRow[]),
    releaseIds.length
      ? fetchAllByChunks<ReleaseLookupRow, string>(
          releaseIds,
          "Unable to load analytics release labels.",
          (chunk, from, to) => supabase
            .from("releases")
            .select("id, title, cover_art_url, cover_thumb_url")
            .in("id", chunk)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as ReleaseLookupRow[]),
    trackIds.length
      ? fetchAllByChunks<TrackLookupRow, string>(
          trackIds,
          "Unable to load analytics track labels.",
          (chunk, from, to) => supabase
            .from("tracks")
            .select("id, title")
            .in("id", chunk)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as TrackLookupRow[]),
  ])

  const channelById = new Map(channelLookupRows.map((row) => [row.id, row.display_name || row.raw_name]))
  const releaseById = new Map(releaseLookupRows.map((row) => [row.id, row]))
  const trackById = new Map(trackLookupRows.map((row) => [row.id, row]))
  const filterOptions = buildRollupFilterOptions(rollupRows, channelById, releaseById, trackById)
  const summaryRow = rollupsOf(rollupRows, "summary")[0] ?? null
  const totalRoyaltyRevenue = rollupMoney(summaryRow?.revenue)
  const totalStreams = rollupCount(summaryRow?.streams)
  const royaltyRowCount = rollupCount(summaryRow?.row_count)
  const publishingRows = rollupsOf(rollupRows, "publishing")
  const totalPublishingRevenue = publishingRows.reduce((sum, row) => sum.add(row.revenue ?? 0), new Decimal(0))
  const visiblePeriodMonths = [...new Set(rollupsOf(rollupRows, "filter_earning_period")
    .map((row) => row.month)
    .filter((periodMonth): periodMonth is string => Boolean(periodMonth) && rowMatchesFilter(filters.periodMonth, periodMonth)))]
    .sort((left, right) => left.localeCompare(right))
  const fallbackChannelOptions = filters.territory !== ALL_FILTER_VALUE
    ? filterOptions.channels.filter((option) => filters.channelId === ALL_FILTER_VALUE || option.value === filters.channelId)
    : []
  const fallbackReleaseOptions = filters.territory !== ALL_FILTER_VALUE
    ? filterOptions.releases.filter((option) => filters.releaseId === ALL_FILTER_VALUE || option.value === filters.releaseId)
    : []
  const monthlyRevenue = buildRollupMonthlyRevenue(rollupRows, filters.territory !== ALL_FILTER_VALUE ? visiblePeriodMonths : [])
  const countries = buildRollupCountries(rollupRows, totalRoyaltyRevenue)
  const platformRows = buildRollupPlatformRows(rollupRows, totalRoyaltyRevenue, channelById, fallbackChannelOptions)
  const platformSeries = buildRollupPlatformSeries(rollupRows, channelById, visiblePeriodMonths, fallbackChannelOptions)
  const releaseRows = buildRollupReleaseRows(rollupRows, releaseById, fallbackReleaseOptions)

  return {
    summary: {
      totalRoyaltyRevenue: toMoneyString(totalRoyaltyRevenue),
      totalPublishingRevenue: toMoneyString(totalPublishingRevenue),
      totalStreams,
      royaltyRowCount,
    },
    metrics: buildMetrics(totalRoyaltyRevenue, totalStreams, totalPublishingRevenue, countries, platformRows, monthlyRevenue),
    monthlyRevenue,
    countries,
    platformRows,
    platformSeries,
    releaseRows,
    filterOptions,
    earningsRows: serializeRollupEarningsRows(rollupRows, channelById, releaseById),
    publishingRows: publishingRows.filter((row) => row.month).map((row) => ({
      periodMonth: row.month!,
      amount: toMoneyString(row.revenue ?? 0),
    })),
    audienceSnapshots: [],
  } satisfies ArtistAnalyticsOverviewResponse
})
