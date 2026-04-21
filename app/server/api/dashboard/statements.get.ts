import { createError, getQuery } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseClient } from "#supabase/server"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import { toMoneyString } from "~~/server/utils/money"
import type { ArtistStatementSummary } from "~~/types/dashboard"

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
  total_amount: string | number | null
  units: number | null
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const query = getQuery(event)
  const requestedArtistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const supabase = await serverSupabaseClient(event)
  const { data: artistRows, error: artistError } = await supabase
    .from("artists")
    .select("id")
    .eq("user_id", profile.id)
    .eq("is_active", true)

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistError.message,
    })
  }

  const ownedArtistIds = (artistRows ?? []).map((artist) => artist.id)

  if (requestedArtistId && !ownedArtistIds.includes(requestedArtistId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only load statements for artist profiles on your own account.",
    })
  }

  const artistIds = requestedArtistId ? [requestedArtistId] : ownedArtistIds

  if (!artistIds.length) {
    return {
      statements: [] as ArtistStatementSummary[],
    }
  }

  const { data: periodRows, error: periodsError } = await supabase
    .from("statement_periods")
    .select("artist_id, period_month, status, closed_at")
    .in("artist_id", artistIds)
    .order("period_month", { ascending: false })

  if (periodsError) {
    throw createError({
      statusCode: 500,
      statusMessage: periodsError.message,
    })
  }

  const periodMonths = [...new Set((periodRows ?? []).map((row) => row.period_month))]

  if (!periodMonths.length) {
    return {
      statements: [] as ArtistStatementSummary[],
    }
  }

  const { data: publishingRows, error: publishingError } = await supabase
    .from("publishing_earnings")
    .select("artist_id, period_month, amount")
    .in("artist_id", artistIds)
    .in("period_month", periodMonths)

  if (publishingError) {
    throw createError({
      statusCode: 500,
      statusMessage: publishingError.message,
    })
  }

  const statements = new Map<string, StatementAccumulator>()

  for (const row of periodRows ?? []) {
    const key = row.period_month
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

  const { data: uploadRows, error: uploadsError } = await supabase
    .from("csv_uploads")
    .select("id, artist_id, period_month")
    .in("artist_id", artistIds)
    .in("period_month", periodMonths)

  if (uploadsError) {
    throw createError({
      statusCode: 500,
      statusMessage: uploadsError.message,
    })
  }

  const uploadPeriodMap = new Map<string, UploadPeriodRow>(
    (uploadRows ?? []).map((row) => [row.id, row as UploadPeriodRow]),
  )
  const uploadIds = [...uploadPeriodMap.keys()]

  if (uploadIds.length) {
    const { data: earningsRows, error: earningsError } = await supabase
      .from("earnings")
      .select("artist_id, upload_id, channel_id, territory, release_id, total_amount, units")
      .in("artist_id", artistIds)
      .in("upload_id", uploadIds)

    if (earningsError) {
      throw createError({
        statusCode: 500,
        statusMessage: earningsError.message,
      })
    }

    for (const row of (earningsRows ?? []) as EarningsStatementRow[]) {
      const periodMonth = uploadPeriodMap.get(row.upload_id)?.period_month

      if (!periodMonth) {
        continue
      }

      const statement = statements.get(periodMonth)

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
    }
  }

  for (const row of publishingRows ?? []) {
    const statement = statements.get(row.period_month)

    if (!statement) {
      continue
    }

    statement.publishing = statement.publishing.add(row.amount ?? 0)
  }

  return {
    statements: [...statements.values()]
      .sort((left, right) => right.periodMonth.localeCompare(left.periodMonth))
      .map((statement) => ({
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
      })) as ArtistStatementSummary[],
  }
})
