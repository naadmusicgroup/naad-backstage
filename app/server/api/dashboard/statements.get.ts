import { createError, getQuery } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseClient } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import { toMoneyString } from "~~/server/utils/money"
import type {
  ArtistStatementEarningsBreakdownRow,
  ArtistStatementFilterOption,
  ArtistStatementPublishingBreakdownRow,
  ArtistStatementSummary,
  ArtistStatementsResponse,
} from "~~/types/dashboard"

interface StatementAccumulator {
  periodMonth: string
  status: "open" | "closed"
  closedAt: string | null
  earnings: Decimal
  publishing: Decimal
  streams: number
  rowCount: number
  channelIds: Set<string>
  territories: Set<string>
  releaseIds: Set<string>
}

interface StatementPeriodRow {
  artist_id: string
  period_month: string
  status: "open" | "closed"
  closed_at: string | null
}

interface UploadPeriodRow {
  id: string
  artist_id: string
  period_month: string
}

interface EarningsStatementRow {
  artist_id: string
  upload_id: string
  channel_id: string | null
  territory: string | null
  release_id: string | null
  track_id: string | null
  total_amount: string | number | null
  units: number | null
}

interface PublishingStatementRow {
  id: string
  artist_id: string
  release_id: string | null
  period_month: string
  amount: string | number | null
  notes: string | null
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

interface NormalizedEarningsRow extends EarningsStatementRow {
  period_month: string
}

interface EarningsBreakdownAccumulator {
  id: string
  periodMonth: string
  artistId: string
  artistName: string
  releaseId: string | null
  releaseTitle: string | null
  trackId: string | null
  trackTitle: string | null
  trackIsrc: string | null
  channelId: string | null
  channelName: string
  territory: string | null
  earnings: Decimal
  units: number
  rowCount: number
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

function emptyResponse(): ArtistStatementsResponse {
  return {
    statements: [],
    earningsBreakdownRows: [],
    publishingBreakdownRows: [],
    filterOptions: {
      periodMonths: [],
      releases: [],
      territories: [],
      channels: [],
    },
  }
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

function formatMonthLabel(periodMonth: string) {
  return monthFormatter.format(new Date(periodMonth))
}

function channelName(row: ChannelLookupRow | null | undefined) {
  return row?.display_name?.trim() || row?.raw_name?.trim() || "Unassigned channel"
}

function option(value: string, label: string): ArtistStatementFilterOption {
  return { value, label }
}

function statementKey(periodMonth: string) {
  return periodMonth
}

function breakdownKey(row: NormalizedEarningsRow) {
  return [
    row.period_month,
    row.artist_id,
    row.release_id ?? "none",
    row.track_id ?? "none",
    row.channel_id ?? "none",
    row.territory ?? "none",
  ].join(":")
}

function mapStatement(statement: StatementAccumulator): ArtistStatementSummary {
  return {
    periodMonth: statement.periodMonth,
    status: statement.status,
    closedAt: statement.closedAt,
    earnings: toMoneyString(statement.earnings),
    publishing: toMoneyString(statement.publishing),
    streams: statement.streams,
    rowCount: statement.rowCount,
    channelCount: statement.channelIds.size,
    territoryCount: statement.territories.size,
    releaseCount: statement.releaseIds.size,
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const supabase = await serverSupabaseClient(event)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "statements")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return emptyResponse()
  }

  const artistNameById = new Map(scope.artistRows.map((artist) => [artist.id, artist.name]))
  const { data: periodRows, error: periodsError } = await supabase
    .from("statement_periods")
    .select("artist_id, period_month, status, closed_at")
    .in("artist_id", artistIds)
    .order("period_month", { ascending: false })

  throwIfError(periodsError, "Unable to load statement periods.")

  const typedPeriodRows = (periodRows ?? []) as StatementPeriodRow[]
  const periodMonths = [...new Set(typedPeriodRows.map((row) => row.period_month))]

  if (!periodMonths.length) {
    return emptyResponse()
  }

  const statements = new Map<string, StatementAccumulator>()

  for (const row of typedPeriodRows) {
    const key = statementKey(row.period_month)
    const existing = statements.get(key)

    if (existing) {
      if (row.status === "closed") {
        existing.status = "closed"
        existing.closedAt = row.closed_at ?? existing.closedAt
      }
      continue
    }

    statements.set(key, {
      periodMonth: row.period_month,
      status: row.status,
      closedAt: row.closed_at,
      earnings: new Decimal(0),
      publishing: new Decimal(0),
      streams: 0,
      rowCount: 0,
      channelIds: new Set<string>(),
      territories: new Set<string>(),
      releaseIds: new Set<string>(),
    })
  }

  const [publishingResult, uploadResult] = await Promise.all([
    supabase
      .from("publishing_earnings")
      .select("id, artist_id, release_id, period_month, amount, notes")
      .in("artist_id", artistIds)
      .in("period_month", periodMonths),
    supabase
      .from("csv_uploads")
      .select("id, artist_id, period_month")
      .in("artist_id", artistIds)
      .in("period_month", periodMonths),
  ])

  throwIfError(publishingResult.error, "Unable to load publishing statement rows.")
  throwIfError(uploadResult.error, "Unable to load statement upload periods.")

  const publishingRows = (publishingResult.data ?? []) as PublishingStatementRow[]
  const uploadRows = (uploadResult.data ?? []) as UploadPeriodRow[]
  const uploadPeriodMap = new Map(uploadRows.map((row) => [row.id, row]))
  const uploadIds = [...uploadPeriodMap.keys()]
  let earningsRows: EarningsStatementRow[] = []

  if (uploadIds.length) {
    const { data, error } = await supabase
      .from("earnings")
      .select("artist_id, upload_id, channel_id, territory, release_id, track_id, total_amount, units")
      .in("artist_id", artistIds)
      .in("upload_id", uploadIds)
      .neq("earning_type", "reversal")

    throwIfError(error, "Unable to load earnings statement rows.")
    earningsRows = (data ?? []) as EarningsStatementRow[]
  }

  const normalizedEarningsRows: NormalizedEarningsRow[] = []

  for (const row of earningsRows) {
    const periodMonth = uploadPeriodMap.get(row.upload_id)?.period_month

    if (!periodMonth) {
      continue
    }

    const statement = statements.get(statementKey(periodMonth))

    if (!statement) {
      continue
    }

    statement.earnings = statement.earnings.add(row.total_amount ?? 0)
    statement.streams += Number(row.units ?? 0)
    statement.rowCount += 1

    if (row.channel_id) {
      statement.channelIds.add(row.channel_id)
    }

    if (row.territory) {
      statement.territories.add(row.territory)
    }

    if (row.release_id) {
      statement.releaseIds.add(row.release_id)
    }

    normalizedEarningsRows.push({
      ...row,
      period_month: periodMonth,
    })
  }

  for (const row of publishingRows) {
    const statement = statements.get(statementKey(row.period_month))

    if (!statement) {
      continue
    }

    statement.publishing = statement.publishing.add(row.amount ?? 0)

    if (row.release_id) {
      statement.releaseIds.add(row.release_id)
    }
  }

  const channelIds = [...new Set(normalizedEarningsRows.map((row) => row.channel_id).filter(Boolean) as string[])]
  const releaseIds = [
    ...new Set([
      ...normalizedEarningsRows.map((row) => row.release_id).filter(Boolean),
      ...publishingRows.map((row) => row.release_id).filter(Boolean),
    ] as string[]),
  ]
  const trackIds = [...new Set(normalizedEarningsRows.map((row) => row.track_id).filter(Boolean) as string[])]

  const [channelLookupResult, releaseLookupResult, trackLookupResult] = await Promise.all([
    channelIds.length
      ? supabase.from("channels").select("id, raw_name, display_name").in("id", channelIds)
      : Promise.resolve({ data: [] as ChannelLookupRow[], error: null }),
    releaseIds.length
      ? supabase.from("releases").select("id, title").in("id", releaseIds)
      : Promise.resolve({ data: [] as ReleaseLookupRow[], error: null }),
    trackIds.length
      ? supabase.from("tracks").select("id, title, isrc").in("id", trackIds)
      : Promise.resolve({ data: [] as TrackLookupRow[], error: null }),
  ])

  throwIfError(channelLookupResult.error, "Unable to load statement channel labels.")
  throwIfError(releaseLookupResult.error, "Unable to load statement release labels.")
  throwIfError(trackLookupResult.error, "Unable to load statement track labels.")

  const channelById = new Map(((channelLookupResult.data ?? []) as ChannelLookupRow[]).map((row) => [row.id, row]))
  const releaseById = new Map(((releaseLookupResult.data ?? []) as ReleaseLookupRow[]).map((row) => [row.id, row]))
  const trackById = new Map(((trackLookupResult.data ?? []) as TrackLookupRow[]).map((row) => [row.id, row]))
  const earningsBreakdown = new Map<string, EarningsBreakdownAccumulator>()

  for (const row of normalizedEarningsRows) {
    const key = breakdownKey(row)
    const release = row.release_id ? releaseById.get(row.release_id) : null
    const track = row.track_id ? trackById.get(row.track_id) : null
    const channel = row.channel_id ? channelById.get(row.channel_id) : null
    const existing = earningsBreakdown.get(key)

    if (existing) {
      existing.earnings = existing.earnings.add(row.total_amount ?? 0)
      existing.units += Number(row.units ?? 0)
      existing.rowCount += 1
      continue
    }

    earningsBreakdown.set(key, {
      id: `earnings:${key}`,
      periodMonth: row.period_month,
      artistId: row.artist_id,
      artistName: artistNameById.get(row.artist_id) ?? "Unknown artist",
      releaseId: row.release_id,
      releaseTitle: row.release_id ? release?.title ?? "Unknown release" : null,
      trackId: row.track_id,
      trackTitle: row.track_id ? track?.title ?? "Unknown track" : null,
      trackIsrc: row.track_id ? track?.isrc ?? null : null,
      channelId: row.channel_id,
      channelName: channelName(channel),
      territory: row.territory,
      earnings: new Decimal(row.total_amount ?? 0),
      units: Number(row.units ?? 0),
      rowCount: 1,
    })
  }

  const earningsBreakdownRows = [...earningsBreakdown.values()]
    .map((row) => ({
      ...row,
      earnings: toMoneyString(row.earnings),
    }) satisfies ArtistStatementEarningsBreakdownRow)
    .sort((left, right) => {
      const periodCompare = right.periodMonth.localeCompare(left.periodMonth)

      if (periodCompare !== 0) {
        return periodCompare
      }

      return Number(right.earnings) - Number(left.earnings)
    })

  const publishingBreakdownRows = publishingRows
    .map((row) => {
      const release = row.release_id ? releaseById.get(row.release_id) : null

      return {
        id: row.id,
        periodMonth: row.period_month,
        artistId: row.artist_id,
        artistName: artistNameById.get(row.artist_id) ?? "Unknown artist",
        releaseId: row.release_id,
        releaseTitle: row.release_id ? release?.title ?? "Unknown release" : null,
        amount: toMoneyString(row.amount ?? 0),
        notes: row.notes,
      } satisfies ArtistStatementPublishingBreakdownRow
    })
    .sort((left, right) => {
      const periodCompare = right.periodMonth.localeCompare(left.periodMonth)

      if (periodCompare !== 0) {
        return periodCompare
      }

      return Number(right.amount) - Number(left.amount)
    })

  const releaseOptions = [...new Set([
    ...earningsBreakdownRows.map((row) => row.releaseId).filter(Boolean),
    ...publishingBreakdownRows.map((row) => row.releaseId).filter(Boolean),
  ] as string[])]
    .map((releaseId) => option(releaseId, releaseById.get(releaseId)?.title ?? "Unknown release"))
    .sort((left, right) => left.label.localeCompare(right.label))

  return {
    statements: [...statements.values()]
      .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth))
      .map((statement) => mapStatement(statement)),
    earningsBreakdownRows,
    publishingBreakdownRows,
    filterOptions: {
      periodMonths: [...statements.values()]
        .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth))
        .map((statement) => option(statement.periodMonth, formatMonthLabel(statement.periodMonth))),
      releases: releaseOptions,
      territories: [...new Set(earningsBreakdownRows.map((row) => row.territory).filter(Boolean) as string[])]
        .sort((left, right) => left.localeCompare(right))
        .map((territory) => option(territory, territory)),
      channels: [...new Set(earningsBreakdownRows.map((row) => row.channelId).filter(Boolean) as string[])]
        .map((channelId) => option(channelId, channelName(channelById.get(channelId))))
        .sort((left, right) => left.label.localeCompare(right.label)),
    },
  } satisfies ArtistStatementsResponse
})
