import { createError, getQuery } from "h3"
import Decimal from "decimal.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  assertArtistExists,
  assertReleaseExists,
  assertTrackExists,
  normalizeEffectivePeriodMonth,
  normalizeOptionalUuidQueryParam,
  unwrapJoinRow,
} from "~~/server/utils/catalog"
import { toMoneyString } from "~~/server/utils/money"
import type {
  AdminEarningsLedgerFilterOption,
  AdminEarningsLedgerResponse,
  AdminEarningsLedgerRow,
  EarningType,
} from "~~/types/admin"

interface ArtistOptionRow {
  id: string
  name: string
}

interface ReleaseOptionRow {
  id: string
  artist_id: string
  title: string
}

interface TrackOptionRow {
  id: string
  release_id: string
  title: string
  isrc: string | null
}

interface ChannelOptionRow {
  id: string
  raw_name: string
  display_name: string | null
}

interface UploadPeriodOptionRow {
  period_month: string
}

interface UploadIdRow {
  id: string
}

interface TerritoryOptionRow {
  territory: string | null
}

interface EarningsLedgerFilters {
  artistId: string
  releaseId: string
  trackId: string
  channelId: string
  territory: string
  periodMonth: string
  earningType: EarningType | ""
  uploadIds: string[] | null
}

interface EarningRow {
  id: string
  artist_id: string
  release_id: string
  track_id: string
  channel_id: string
  upload_id: string
  sale_date: string
  accounting_date: string
  reporting_date: string | null
  territory: string | null
  units: number | null
  unit_price: string | number | null
  original_currency: string | null
  total_amount: string | number | null
  earning_type: EarningType
  created_at: string
  artists: ArtistOptionRow | ArtistOptionRow[] | null
  releases: Pick<ReleaseOptionRow, "id" | "title"> | Array<Pick<ReleaseOptionRow, "id" | "title">> | null
  tracks: Pick<TrackOptionRow, "id" | "title" | "isrc"> | Array<Pick<TrackOptionRow, "id" | "title" | "isrc">> | null
  channels: ChannelOptionRow | ChannelOptionRow[] | null
  csv_uploads: { id: string; filename: string; period_month: string } | Array<{ id: string; filename: string; period_month: string }> | null
}

interface EarningSummaryRow {
  artist_id: string
  release_id: string
  track_id: string
  channel_id: string
  territory: string | null
  units: number | null
  total_amount: string | number | null
}

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100
const EARNING_TYPES = new Set<EarningType>(["original", "adjustment", "reversal"])

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function normalizePositiveIntegerQueryParam(value: unknown, label: string, defaultValue: number) {
  const normalized = firstQueryValue(value)

  if (normalized === undefined || normalized === null || normalized === "") {
    return defaultValue
  }

  const numeric = Number(String(normalized).trim())

  if (!Number.isInteger(numeric) || numeric < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a positive whole number.`,
    })
  }

  return numeric
}

function normalizeOptionalTextQueryParam(value: unknown) {
  const normalized = String(firstQueryValue(value) ?? "").trim()

  if (!normalized || normalized.toLowerCase() === "all" || normalized.toLowerCase() === "null") {
    return ""
  }

  return normalized
}

function normalizeOptionalPeriodMonthQueryParam(value: unknown) {
  const normalized = normalizeOptionalTextQueryParam(value)

  if (!normalized) {
    return ""
  }

  return normalizeEffectivePeriodMonth(normalized, "Period month")
}

function normalizeOptionalEarningType(value: unknown) {
  const normalized = normalizeOptionalTextQueryParam(value).toLowerCase() as EarningType

  if (!normalized) {
    return ""
  }

  if (!EARNING_TYPES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Earning type must be original, adjustment, or reversal.",
    })
  }

  return normalized
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

function option(value: string, label: string, meta: string | null = null): AdminEarningsLedgerFilterOption {
  return { value, label, meta }
}

function channelLabel(row: Pick<ChannelOptionRow, "raw_name" | "display_name"> | null | undefined) {
  return row?.display_name?.trim() || row?.raw_name?.trim() || "Unknown channel"
}

function formatPeriodLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value))
}

function applyFilters(query: any, filters: EarningsLedgerFilters) {
  let nextQuery = query

  if (filters.artistId) {
    nextQuery = nextQuery.eq("artist_id", filters.artistId)
  }

  if (filters.releaseId) {
    nextQuery = nextQuery.eq("release_id", filters.releaseId)
  }

  if (filters.trackId) {
    nextQuery = nextQuery.eq("track_id", filters.trackId)
  }

  if (filters.channelId) {
    nextQuery = nextQuery.eq("channel_id", filters.channelId)
  }

  if (filters.territory) {
    nextQuery = nextQuery.eq("territory", filters.territory)
  }

  if (filters.earningType) {
    nextQuery = nextQuery.eq("earning_type", filters.earningType)
  }

  if (filters.uploadIds) {
    nextQuery = nextQuery.in("upload_id", filters.uploadIds)
  }

  return nextQuery
}

async function resolveUploadIdsForPeriod(supabase: SupabaseClient<any>, periodMonth: string) {
  if (!periodMonth) {
    return null
  }

  const { data, error } = await supabase
    .from("csv_uploads")
    .select("id")
    .eq("period_month", periodMonth)

  throwIfError(error, "Unable to load upload ids for the selected period.")

  return ((data ?? []) as UploadIdRow[]).map((row) => row.id)
}

async function assertRelatedFiltersExist(supabase: SupabaseClient<any>, filters: EarningsLedgerFilters) {
  if (filters.artistId) {
    await assertArtistExists(supabase, filters.artistId)
  }

  if (filters.releaseId) {
    await assertReleaseExists(supabase, filters.releaseId)
  }

  if (filters.trackId) {
    await assertTrackExists(supabase, filters.trackId)
  }

  if (filters.channelId) {
    const { data, error } = await supabase
      .from("channels")
      .select("id")
      .eq("id", filters.channelId)
      .maybeSingle()

    throwIfError(error, "Unable to validate the selected channel.")

    if (!data) {
      throw createError({
        statusCode: 404,
        statusMessage: "The selected channel does not exist.",
      })
    }
  }
}

async function loadFilterOptions(supabase: SupabaseClient<any>) {
  const [
    artistsResult,
    releasesResult,
    tracksResult,
    channelsResult,
    periodsResult,
    territoriesResult,
  ] = await Promise.all([
    supabase
      .from("artists")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("releases")
      .select("id, artist_id, title")
      .order("title", { ascending: true }),
    supabase
      .from("tracks")
      .select("id, release_id, title, isrc")
      .order("title", { ascending: true }),
    supabase
      .from("channels")
      .select("id, raw_name, display_name")
      .order("display_name", { ascending: true, nullsFirst: false })
      .order("raw_name", { ascending: true }),
    supabase
      .from("csv_uploads")
      .select("period_month")
      .order("period_month", { ascending: false }),
    supabase
      .from("earnings")
      .select("territory")
      .not("territory", "is", null)
      .order("territory", { ascending: true }),
  ])

  throwIfError(artistsResult.error, "Unable to load artist filters.")
  throwIfError(releasesResult.error, "Unable to load release filters.")
  throwIfError(tracksResult.error, "Unable to load track filters.")
  throwIfError(channelsResult.error, "Unable to load channel filters.")
  throwIfError(periodsResult.error, "Unable to load period filters.")
  throwIfError(territoriesResult.error, "Unable to load territory filters.")

  const periods = [...new Set(((periodsResult.data ?? []) as UploadPeriodOptionRow[])
    .map((row) => row.period_month)
    .filter(Boolean))]
  const territories = [...new Set(((territoriesResult.data ?? []) as TerritoryOptionRow[])
    .map((row) => row.territory?.trim())
    .filter(Boolean) as string[])]

  return {
    artists: ((artistsResult.data ?? []) as ArtistOptionRow[]).map((row) => option(row.id, row.name)),
    releases: ((releasesResult.data ?? []) as ReleaseOptionRow[]).map((row) => option(row.id, row.title, row.artist_id)),
    tracks: ((tracksResult.data ?? []) as TrackOptionRow[]).map((row) => option(row.id, row.isrc ? `${row.title} (${row.isrc})` : row.title, row.release_id)),
    channels: ((channelsResult.data ?? []) as ChannelOptionRow[]).map((row) => option(row.id, channelLabel(row))),
    territories: territories.map((territory) => option(territory, territory)),
    periodMonths: periods.map((period) => option(period, formatPeriodLabel(period))),
    earningTypes: [...EARNING_TYPES].map((type) => option(type, type.charAt(0).toUpperCase() + type.slice(1))),
  }
}

async function countRows(supabase: SupabaseClient<any>, filters: EarningsLedgerFilters) {
  if (filters.uploadIds?.length === 0) {
    return 0
  }

  const result = await applyFilters(
    supabase
      .from("earnings")
      .select("id", { count: "exact", head: true }),
    filters,
  )

  throwIfError(result.error, "Unable to count earnings rows.")
  return result.count ?? 0
}

async function loadSummary(supabase: SupabaseClient<any>, filters: EarningsLedgerFilters) {
  if (filters.uploadIds?.length === 0) {
    return {
      rowCount: 0,
      totalRevenue: "0.00000000",
      totalUnits: 0,
      artistCount: 0,
      releaseCount: 0,
      trackCount: 0,
      channelCount: 0,
      territoryCount: 0,
    }
  }

  const result = await applyFilters(
    supabase
      .from("earnings")
      .select("artist_id, release_id, track_id, channel_id, territory, units, total_amount"),
    filters,
  )
    .limit(10000)

  throwIfError(result.error, "Unable to summarize earnings rows.")

  const rows = (result.data ?? []) as EarningSummaryRow[]
  const artists = new Set<string>()
  const releases = new Set<string>()
  const tracks = new Set<string>()
  const channels = new Set<string>()
  const territories = new Set<string>()
  let totalUnits = 0
  let totalRevenue = new Decimal(0)

  for (const row of rows) {
    artists.add(row.artist_id)
    releases.add(row.release_id)
    tracks.add(row.track_id)
    channels.add(row.channel_id)

    if (row.territory?.trim()) {
      territories.add(row.territory.trim())
    }

    totalUnits += row.units ?? 0
    totalRevenue = totalRevenue.add(row.total_amount ?? 0)
  }

  return {
    rowCount: rows.length,
    totalRevenue: toMoneyString(totalRevenue),
    totalUnits,
    artistCount: artists.size,
    releaseCount: releases.size,
    trackCount: tracks.size,
    channelCount: channels.size,
    territoryCount: territories.size,
  }
}

async function loadRows(
  supabase: SupabaseClient<any>,
  filters: EarningsLedgerFilters,
  page: number,
  pageSize: number,
) {
  if (filters.uploadIds?.length === 0) {
    return [] as AdminEarningsLedgerRow[]
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const result = await applyFilters(
    supabase
      .from("earnings")
      .select(
        "id, artist_id, release_id, track_id, channel_id, upload_id, sale_date, accounting_date, reporting_date, territory, units, unit_price, original_currency, total_amount, earning_type, created_at, artists(id, name), releases(id, title), tracks(id, title, isrc), channels(id, raw_name, display_name), csv_uploads(id, filename, period_month)",
      )
      .order("sale_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to),
    filters,
  )

  throwIfError(result.error, "Unable to load earnings rows.")

  return ((result.data ?? []) as EarningRow[]).map((row) => {
    const artist = unwrapJoinRow(row.artists)
    const release = unwrapJoinRow(row.releases)
    const track = unwrapJoinRow(row.tracks)
    const channel = unwrapJoinRow(row.channels)
    const upload = unwrapJoinRow(row.csv_uploads)

    return {
      id: row.id,
      artistId: row.artist_id,
      artistName: artist?.name ?? "Unknown artist",
      releaseId: row.release_id,
      releaseTitle: release?.title ?? "Unknown release",
      trackId: row.track_id,
      trackTitle: track?.title ?? "Unknown track",
      trackIsrc: track?.isrc ?? null,
      channelId: row.channel_id,
      channelName: channelLabel(channel),
      uploadId: row.upload_id,
      uploadFilename: upload?.filename ?? null,
      saleDate: row.sale_date,
      accountingDate: row.accounting_date,
      reportingDate: row.reporting_date,
      periodMonth: upload?.period_month ?? null,
      territory: row.territory,
      units: row.units ?? 0,
      unitPrice: toMoneyString(row.unit_price ?? 0),
      originalCurrency: row.original_currency,
      totalAmount: toMoneyString(row.total_amount ?? 0),
      earningType: row.earning_type,
      createdAt: row.created_at,
    }
  })
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const requestedPage = normalizePositiveIntegerQueryParam(query.page, "Page", 1)
  const requestedPageSize = Math.min(
    normalizePositiveIntegerQueryParam(query.pageSize, "Page size", DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  )
  const supabase = serverSupabaseServiceRole(event)
  const periodMonth = normalizeOptionalPeriodMonthQueryParam(query.periodMonth)
  const uploadIds = await resolveUploadIdsForPeriod(supabase, periodMonth)
  const filters: EarningsLedgerFilters = {
    artistId: normalizeOptionalUuidQueryParam(firstQueryValue(query.artistId), "Artist id"),
    releaseId: normalizeOptionalUuidQueryParam(firstQueryValue(query.releaseId), "Release id"),
    trackId: normalizeOptionalUuidQueryParam(firstQueryValue(query.trackId), "Track id"),
    channelId: normalizeOptionalUuidQueryParam(firstQueryValue(query.channelId), "Channel id"),
    territory: normalizeOptionalTextQueryParam(query.territory),
    periodMonth,
    earningType: normalizeOptionalEarningType(query.earningType),
    uploadIds,
  }

  await assertRelatedFiltersExist(supabase, filters)

  const totalCount = await countRows(supabase, filters)
  const totalPages = Math.max(1, Math.ceil(totalCount / requestedPageSize))
  const page = Math.min(requestedPage, totalPages)
  const [rows, summary, filterOptions] = await Promise.all([
    loadRows(supabase, filters, page, requestedPageSize),
    loadSummary(supabase, filters),
    loadFilterOptions(supabase),
  ])

  return {
    rows,
    summary: {
      ...summary,
      rowCount: totalCount,
    },
    filterOptions,
    pagination: {
      page,
      pageSize: requestedPageSize,
      totalCount,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  } satisfies AdminEarningsLedgerResponse
})
