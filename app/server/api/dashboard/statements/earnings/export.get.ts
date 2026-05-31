import { getQuery, setHeader } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import {
  loadStatementEarningsRows,
  normalizeStatementEarningsFilters,
} from "~~/server/utils/statement-earnings"

function csvCell(value: unknown) {
  const text = String(value ?? "")
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "statement earnings export")
  const filters = normalizeStatementEarningsFilters(query)
  const supabase = serverSupabaseServiceRole(event)
  const artistNameById = new Map(scope.artistRows.map((artist) => [artist.id, artist.name]))
  const rows = await loadStatementEarningsRows(supabase, {
    artistIds: scope.artistIds,
    artistNameById,
    periodMonth: filters.periodMonth,
    periodStartMonth: filters.periodStartMonth,
    periodEndMonth: filters.periodEndMonth,
    releaseId: filters.releaseId,
    channelId: filters.channelId,
    territory: filters.territory,
  })

  const header = [
    "Period",
    "Artist",
    "Release",
    "Track",
    "ISRC",
    "Platform",
    "Country",
    "Units",
    "Earnings",
  ]
  const lines = [
    header,
    ...rows.map((row) => [
      row.periodMonth,
      row.artistName,
      row.releaseTitle ?? "Catalog-level credit",
      row.trackTitle ?? "Track not assigned",
      row.trackIsrc ?? "",
      row.channelName,
      row.territory ?? "Unknown country",
      row.units,
      row.earnings,
    ]),
  ]
  const periodLabel = filters.periodMonth
    ? filters.periodMonth.slice(0, 7)
    : filters.periodStartMonth || filters.periodEndMonth
      ? `${filters.periodStartMonth ? filters.periodStartMonth.slice(0, 7) : "start"}-to-${filters.periodEndMonth ? filters.periodEndMonth.slice(0, 7) : "latest"}`
      : "all-periods"

  setHeader(event, "content-type", "text/csv; charset=utf-8")
  setHeader(event, "content-disposition", `attachment; filename="statement-earnings-${periodLabel}.csv"`)

  return lines.map((line) => line.map(csvCell).join(",")).join("\r\n")
})
