import { createError } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeEffectivePeriodMonth, normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import { toMoneyString } from "~~/server/utils/money"
import { fetchAllByChunks, fetchAllPages, throwSupabaseError } from "~~/server/utils/supabase-pagination"
import { dspLogoKeyForName } from "~~/app/utils/dsp-logos"
import type {
  ArtistStatementEarningsBreakdownRow,
  ArtistStatementEarningsResponse,
  ArtistStatementFilterOption,
} from "~~/types/dashboard"

export const STATEMENT_EARNINGS_PAGE_SIZE_OPTIONS = [10, 50, 100] as const
export const DEFAULT_STATEMENT_EARNINGS_PAGE_SIZE = 10

interface StatementEarningsQueryInput {
  artistIds: string[]
  artistNameById: Map<string, string>
  page: number
  pageSize: number
  periodMonth: string
  periodStartMonth: string
  periodEndMonth: string
  releaseId: string
  channelId: string
  territory: string
}

interface StatementEarningsFilters {
  artistIds: string[]
  periodMonth: string
  periodStartMonth: string
  periodEndMonth: string
  releaseId: string
  channelId: string
  territory: string
}

interface StatementEarningsSummaryRow {
  artist_id: string
  month: string
  channel_id: string | null
  territory: string | null
  release_id: string | null
  track_id: string | null
  revenue: string | number | null
  streams: number | null
  row_count: number | null
}

interface StatementEarningsTotalsRow {
  total_revenue: string | number | null
  total_streams: string | number | null
  processed_row_count: string | number | null
  grouped_row_count: string | number | null
}

interface StatementEarningsFilterValuesRow {
  release_ids: string[] | null
  channel_ids: string[] | null
  territories: string[] | null
}

interface ChannelLookupRow {
  id: string
  raw_name: string
  display_name: string | null
}

interface ReleaseLookupRow {
  id: string
  title: string
}

interface TrackLookupRow {
  id: string
  title: string
  isrc: string | null
}

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

export function normalizeStatementEarningsPage(value: unknown) {
  const normalized = firstQueryValue(value)

  if (normalized === undefined || normalized === null || normalized === "") {
    return 1
  }

  const numeric = Number(String(normalized).trim())

  if (!Number.isInteger(numeric) || numeric < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: "Page must be a positive whole number.",
    })
  }

  return numeric
}

export function normalizeStatementEarningsPageSize(value: unknown) {
  const normalized = firstQueryValue(value)

  if (normalized === undefined || normalized === null || normalized === "") {
    return DEFAULT_STATEMENT_EARNINGS_PAGE_SIZE
  }

  const numeric = Number(String(normalized).trim())

  if (!STATEMENT_EARNINGS_PAGE_SIZE_OPTIONS.includes(numeric as any)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Entries per page must be 10, 50, or 100.",
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

export function normalizeOptionalStatementPeriodMonth(value: unknown) {
  const normalized = normalizeOptionalTextQueryParam(value)
  return normalized ? normalizeEffectivePeriodMonth(normalized, "Statement month") : ""
}

export function normalizeStatementPeriodFilters(query: Record<string, unknown>) {
  const periodMonth = normalizeOptionalStatementPeriodMonth(query.periodMonth)
  const periodStartMonth = periodMonth ? "" : normalizeOptionalStatementPeriodMonth(query.periodStartMonth ?? query.periodFromMonth)
  const periodEndMonth = periodMonth ? "" : normalizeOptionalStatementPeriodMonth(query.periodEndMonth ?? query.periodToMonth)

  if (periodStartMonth && periodEndMonth && periodStartMonth > periodEndMonth) {
    throw createError({
      statusCode: 400,
      statusMessage: "Statement range start must be before range end.",
    })
  }

  return {
    periodMonth,
    periodStartMonth,
    periodEndMonth,
  }
}

export function normalizeStatementEarningsFilters(query: Record<string, unknown>) {
  const { periodMonth, periodStartMonth, periodEndMonth } = normalizeStatementPeriodFilters(query)

  return {
    page: normalizeStatementEarningsPage(query.page),
    pageSize: normalizeStatementEarningsPageSize(query.pageSize),
    periodMonth,
    periodStartMonth,
    periodEndMonth,
    releaseId: normalizeOptionalUuidQueryParam(firstQueryValue(query.releaseId), "Release id"),
    channelId: normalizeOptionalUuidQueryParam(firstQueryValue(query.channelId), "Channel id"),
    territory: normalizeOptionalTextQueryParam(query.territory),
  }
}

function applyFilters(query: any, filters: StatementEarningsFilters) {
  let nextQuery = query.in("artist_id", filters.artistIds)

  if (filters.periodMonth) {
    nextQuery = nextQuery.eq("month", filters.periodMonth)
  } else {
    if (filters.periodStartMonth) {
      nextQuery = nextQuery.gte("month", filters.periodStartMonth)
    }

    if (filters.periodEndMonth) {
      nextQuery = nextQuery.lte("month", filters.periodEndMonth)
    }
  }

  if (filters.releaseId) {
    nextQuery = nextQuery.eq("release_id", filters.releaseId)
  }

  if (filters.channelId) {
    nextQuery = nextQuery.eq("channel_id", filters.channelId)
  }

  if (filters.territory) {
    nextQuery = nextQuery.eq("territory", filters.territory)
  }

  return nextQuery
}

function applyStableOrdering(query: any) {
  return query
    .order("month", { ascending: false })
    .order("revenue", { ascending: false, nullsFirst: false })
    .order("release_id", { ascending: true, nullsFirst: true })
    .order("track_id", { ascending: true, nullsFirst: true })
    .order("channel_id", { ascending: true, nullsFirst: true })
    .order("territory", { ascending: true, nullsFirst: true })
}

function finiteNumber(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function statementEarningsRpcParams(filters: StatementEarningsFilters) {
  return {
    target_artist_ids: filters.artistIds,
    target_period_month: filters.periodMonth || null,
    target_period_start_month: filters.periodStartMonth || null,
    target_period_end_month: filters.periodEndMonth || null,
    target_release_id: filters.releaseId || null,
    target_channel_id: filters.channelId || null,
    target_territory: filters.territory || null,
  }
}

async function loadStatementEarningsTotals(
  supabase: SupabaseClient<any>,
  filters: StatementEarningsFilters,
) {
  const { data, error } = await supabase.rpc(
    "get_statement_earnings_totals",
    statementEarningsRpcParams(filters),
  )

  throwSupabaseError(error, "Unable to summarize statement earnings.")

  return ((Array.isArray(data) ? data[0] : data) ?? {
    total_revenue: 0,
    total_streams: 0,
    processed_row_count: 0,
    grouped_row_count: 0,
  }) as StatementEarningsTotalsRow
}

function channelName(row: ChannelLookupRow | null | undefined) {
  return row?.display_name?.trim() || row?.raw_name?.trim() || "Unassigned channel"
}

function option(value: string, label: string, logoKey: string | null = null): ArtistStatementFilterOption {
  return { value, label, logoKey }
}

function makeRowId(row: StatementEarningsSummaryRow) {
  return [
    "earnings",
    row.month,
    row.artist_id,
    row.release_id ?? "none",
    row.track_id ?? "none",
    row.channel_id ?? "none",
    row.territory ?? "none",
  ].join(":")
}

async function loadLookups(supabase: SupabaseClient<any>, rows: StatementEarningsSummaryRow[]) {
  const channelIds = [...new Set(rows.map((row) => row.channel_id).filter(Boolean) as string[])]
  const releaseIds = [...new Set(rows.map((row) => row.release_id).filter(Boolean) as string[])]
  const trackIds = [...new Set(rows.map((row) => row.track_id).filter(Boolean) as string[])]

  const [channels, releases, tracks] = await Promise.all([
    channelIds.length
      ? fetchAllByChunks<ChannelLookupRow, string>(
          channelIds,
          "Unable to load statement channel labels.",
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
          "Unable to load statement release labels.",
          (chunk, from, to) => supabase
            .from("releases")
            .select("id, title")
            .in("id", chunk)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as ReleaseLookupRow[]),
    trackIds.length
      ? fetchAllByChunks<TrackLookupRow, string>(
          trackIds,
          "Unable to load statement track labels.",
          (chunk, from, to) => supabase
            .from("tracks")
            .select("id, title, isrc")
            .in("id", chunk)
            .order("id", { ascending: true })
            .range(from, to),
        )
      : Promise.resolve([] as TrackLookupRow[]),
  ])

  return {
    channelById: new Map(channels.map((row) => [row.id, row])),
    releaseById: new Map(releases.map((row) => [row.id, row])),
    trackById: new Map(tracks.map((row) => [row.id, row])),
  }
}

async function loadFilterOptions(
  supabase: SupabaseClient<any>,
  filters: Pick<StatementEarningsFilters, "artistIds" | "periodMonth" | "periodStartMonth" | "periodEndMonth">,
) {
  const { data, error } = await supabase.rpc(
    "get_statement_earnings_filter_values",
    {
      target_artist_ids: filters.artistIds,
      target_period_month: filters.periodMonth || null,
      target_period_start_month: filters.periodStartMonth || null,
      target_period_end_month: filters.periodEndMonth || null,
    },
  )
  throwSupabaseError(error, "Unable to load statement earnings filter options.")

  const filterValues = ((Array.isArray(data) ? data[0] : data) ?? {
    release_ids: [],
    channel_ids: [],
    territories: [],
  }) as StatementEarningsFilterValuesRow
  const releaseIds = [...new Set(filterValues.release_ids ?? [])]
  const channelIds = [...new Set(filterValues.channel_ids ?? [])]
  const territories = [...new Set((filterValues.territories ?? []).map((territory) => territory.trim()).filter(Boolean))]
  const { channelById, releaseById } = await loadLookups(
    supabase,
    [
      ...releaseIds.map((releaseId) => ({
        artist_id: "",
        month: "",
        release_id: releaseId,
        channel_id: null,
        territory: null,
        track_id: null,
        revenue: 0,
        streams: 0,
        row_count: 0,
      })),
      ...channelIds.map((channelId) => ({
        artist_id: "",
        month: "",
        release_id: null,
        channel_id: channelId,
        territory: null,
        track_id: null,
        revenue: 0,
        streams: 0,
        row_count: 0,
      })),
    ],
  )

  return {
    releases: releaseIds
      .map((releaseId) => option(releaseId, releaseById.get(releaseId)?.title ?? "Unknown release"))
      .sort((left, right) => left.label.localeCompare(right.label)),
    territories: territories
      .map((territory) => option(territory, territory))
      .sort((left, right) => left.label.localeCompare(right.label)),
    channels: channelIds
      .map((channelId) => {
        const label = channelName(channelById.get(channelId))
        return option(channelId, label, dspLogoKeyForName(label))
      })
      .sort((left, right) => left.label.localeCompare(right.label)),
  }
}

function mapRows(
  rows: StatementEarningsSummaryRow[],
  artistNameById: Map<string, string>,
  channelById: Map<string, ChannelLookupRow>,
  releaseById: Map<string, ReleaseLookupRow>,
  trackById: Map<string, TrackLookupRow>,
) {
  return rows.map((row) => {
    const release = row.release_id ? releaseById.get(row.release_id) : null
    const track = row.track_id ? trackById.get(row.track_id) : null
    const channel = row.channel_id ? channelById.get(row.channel_id) : null

    return {
      id: makeRowId(row),
      periodMonth: row.month,
      artistId: row.artist_id,
      artistName: artistNameById.get(row.artist_id) ?? "Unknown artist",
      releaseId: row.release_id,
      releaseTitle: row.release_id ? release?.title ?? "Unknown release" : null,
      trackId: row.track_id,
      trackTitle: row.track_id ? track?.title ?? "Unknown track" : null,
      trackIsrc: row.track_id ? track?.isrc ?? null : null,
      channelId: row.channel_id,
      channelName: channelName(channel),
      logoKey: dspLogoKeyForName(channelName(channel)),
      territory: row.territory,
      earnings: toMoneyString(row.revenue ?? 0),
      units: Number(row.streams ?? 0),
      rowCount: Number(row.row_count ?? 0),
    } satisfies ArtistStatementEarningsBreakdownRow
  })
}

export async function loadStatementEarningsRows(
  supabase: SupabaseClient<any>,
  input: Omit<StatementEarningsQueryInput, "page" | "pageSize">,
) {
  const filters: StatementEarningsFilters = {
    artistIds: input.artistIds,
    periodMonth: input.periodMonth,
    periodStartMonth: input.periodStartMonth,
    periodEndMonth: input.periodEndMonth,
    releaseId: input.releaseId,
    channelId: input.channelId,
    territory: input.territory,
  }

  const rows = await fetchAllPages<StatementEarningsSummaryRow>(
    "Unable to export statement earnings.",
    (from, to) => applyStableOrdering(
      applyFilters(
        supabase
          .from("monthly_earnings_summary")
          .select("artist_id, month, channel_id, territory, release_id, track_id, revenue, streams, row_count"),
        filters,
      ),
    ).range(from, to),
  )
  const { channelById, releaseById, trackById } = await loadLookups(supabase, rows)

  return mapRows(rows, input.artistNameById, channelById, releaseById, trackById)
}

export async function loadStatementEarningsPage(
  supabase: SupabaseClient<any>,
  input: StatementEarningsQueryInput,
) {
  const filters: StatementEarningsFilters = {
    artistIds: input.artistIds,
    periodMonth: input.periodMonth,
    periodStartMonth: input.periodStartMonth,
    periodEndMonth: input.periodEndMonth,
    releaseId: input.releaseId,
    channelId: input.channelId,
    territory: input.territory,
  }

  if (!input.artistIds.length) {
    return {
      rows: [],
      summary: {
        totalRevenue: "0.00000000",
        totalUnits: 0,
        processedRowCount: 0,
        groupedRowCount: 0,
      },
      filterOptions: {
        releases: [],
        territories: [],
        channels: [],
      },
      pagination: {
        page: 1,
        pageSize: input.pageSize,
        totalCount: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    } satisfies ArtistStatementEarningsResponse
  }

  const [summaryRow, filterOptions] = await Promise.all([
    loadStatementEarningsTotals(supabase, filters),
    loadFilterOptions(supabase, {
      artistIds: input.artistIds,
      periodMonth: input.periodMonth,
      periodStartMonth: input.periodStartMonth,
      periodEndMonth: input.periodEndMonth,
    }),
  ])
  const totalCount = Math.max(0, finiteNumber(summaryRow.grouped_row_count))
  const totalPages = Math.max(1, Math.ceil(totalCount / input.pageSize))
  const page = Math.min(input.page, totalPages)
  const from = (page - 1) * input.pageSize
  const to = from + input.pageSize - 1

  const pageRows = totalCount
    ? await applyStableOrdering(
        applyFilters(
          supabase
            .from("monthly_earnings_summary")
            .select("artist_id, month, channel_id, territory, release_id, track_id, revenue, streams, row_count"),
          filters,
        ),
      ).range(from, to)
    : { data: [] as StatementEarningsSummaryRow[], error: null }

  if (pageRows.error) {
    throw createError({
      statusCode: 500,
      statusMessage: pageRows.error.message || "Unable to load statement earnings entries.",
    })
  }

  const typedPageRows = (pageRows.data ?? []) as StatementEarningsSummaryRow[]
  const { channelById, releaseById, trackById } = await loadLookups(supabase, typedPageRows)

  return {
    rows: mapRows(typedPageRows, input.artistNameById, channelById, releaseById, trackById),
    summary: {
      totalRevenue: toMoneyString(summaryRow.total_revenue),
      totalUnits: finiteNumber(summaryRow.total_streams),
      processedRowCount: finiteNumber(summaryRow.processed_row_count),
      groupedRowCount: totalCount,
    },
    filterOptions,
    pagination: {
      page,
      pageSize: input.pageSize,
      totalCount,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  } satisfies ArtistStatementEarningsResponse
}
