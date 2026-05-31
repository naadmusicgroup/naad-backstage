import { getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import {
  analyticsMonthRange,
  analyticsPeriodMonthDateKey,
  DEFAULT_ANALYTICS_PERIOD_RANGE,
  type AnalyticsPeriodRange,
} from "~~/app/utils/analytics-periods"
import { dspLogoKeyForName } from "~~/app/utils/dsp-logos"
import { fetchAllByChunks, fetchAllPages } from "~~/server/utils/supabase-pagination"
import type {
  ArtistAnalyticsAudienceCard,
  ArtistAnalyticsAudienceResponse,
} from "~~/types/dashboard"

interface StreamRow {
  month: string
  channel_id: string | null
  territory: string | null
  streams: number | null
}

interface ChannelLookupRow {
  id: string
  raw_name: string
  display_name: string | null
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

function numeric(value: number | null | undefined) {
  return Number(value ?? 0)
}

function monthDateFromKey(value: string | null | undefined) {
  return value ? `${value}-01` : null
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

function channelLabel(row: ChannelLookupRow | null | undefined) {
  return row?.display_name?.trim() || row?.raw_name?.trim() || "Unassigned channel"
}

function channelSeriesKey(channelId: string | null, label: string) {
  const logoKey = dspLogoKeyForName(label)

  return `store:${logoKey || channelId || EMPTY_FILTER_VALUE}:streams`
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

function buildStreamCards(streamRows: StreamRow[], channelById: Map<string, ChannelLookupRow>) {
  const grouped = new Map<string, {
    label: string
    points: Map<string, number>
    countries: Map<string, {
      countryCode: string | null
      countryName: string
      streams: number
    }>
    unknownCountryStreams: number
    total: number
  }>()

  for (const row of streamRows) {
    const channel = row.channel_id ? channelById.get(row.channel_id) : null
    const label = channelLabel(channel)
    const key = channelSeriesKey(row.channel_id, label)
    const existing = grouped.get(key) ?? {
      label: `${label} streams`,
      points: new Map<string, number>(),
      countries: new Map(),
      unknownCountryStreams: 0,
      total: 0,
    }
    const streams = numeric(row.streams)
    const countryCode = normalizedCountryCode(row.territory)

    if (countryCode) {
      const country = existing.countries.get(countryCode) ?? {
        countryCode,
        countryName: countryNameForCode(countryCode),
        streams: 0,
      }

      country.streams += streams
      existing.countries.set(countryCode, country)
    } else {
      existing.unknownCountryStreams += streams
    }

    existing.points.set(row.month, (existing.points.get(row.month) ?? 0) + streams)
    existing.total += streams
    grouped.set(key, existing)
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const points = [...group.points.entries()].sort((left, right) => left[0].localeCompare(right[0]))
      const latest = points.at(-1) ?? null
      const previous = points.at(-2) ?? null
      const topCountry = [...group.countries.values()]
        .sort((left, right) => right.streams - left.streams || left.countryName.localeCompare(right.countryName))[0]
        ?? (group.unknownCountryStreams > 0
          ? {
              countryCode: null,
              countryName: "Unknown country",
              streams: group.unknownCountryStreams,
            }
          : null)

      return {
        key,
        label: group.label,
        value: latest?.[1] ?? null,
        periodLabel: latest ? formatMonth(latest[0]) : null,
        delta: latest && previous ? latest[1] - previous[1] : null,
        topCountry,
        points: points.map(([periodMonth, value]) => ({
          label: formatShortMonth(periodMonth),
          value,
        })),
      } satisfies ArtistAnalyticsAudienceCard
    })
    .sort((left, right) => {
      const valueCompare = numeric(right.value) - numeric(left.value)
      return valueCompare || left.label.localeCompare(right.label)
    })
}

async function loadAudienceStreamRows(
  supabase: any,
  artistIds: string[],
  audiencePeriodRange: AnalyticsPeriodRange,
  filters: AnalyticsFilters,
) {
  const monthRange = analyticsMonthRange(audiencePeriodRange)
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

  return await fetchAllPages<StreamRow>(
    "Unable to load stream analytics.",
    (from, to) => supabase
      .rpc("get_artist_analytics_audience_streams", rpcArgs)
      .range(from, to),
  )
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const audiencePeriodRange = analyticsPeriodRangeFromQuery(query.audiencePeriodRange)
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
    return {
      cards: [],
      audienceSnapshots: [],
    } satisfies ArtistAnalyticsAudienceResponse
  }

  const streamRows = await loadAudienceStreamRows(supabase, artistIds, audiencePeriodRange, filters)
  const channelIds = [...new Set(streamRows.map((row) => row.channel_id).filter(Boolean) as string[])]
  const channelLookupRows = channelIds.length
    ? await fetchAllByChunks<ChannelLookupRow, string>(
        channelIds,
        "Unable to load stream channel labels.",
        (chunk, from, to) => supabase
          .from("channels")
          .select("id, raw_name, display_name")
          .in("id", chunk)
          .order("id", { ascending: true })
          .range(from, to),
      )
    : []
  const channelById = new Map(channelLookupRows.map((row) => [row.id, row]))

  return {
    cards: buildStreamCards(streamRows, channelById),
    audienceSnapshots: [],
  } satisfies ArtistAnalyticsAudienceResponse
})
