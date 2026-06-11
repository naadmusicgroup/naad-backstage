import { getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import { normalizeStatementPeriodFilters } from "~~/server/utils/statement-earnings"
import type { ArtistStatementsResponse } from "~~/types/dashboard"

function statementMonthInRange(periodMonth: string, periodMonthFilter: string, periodStartMonth: string, periodEndMonth: string) {
  if (periodMonthFilter) {
    return periodMonth === periodMonthFilter
  }

  if (periodStartMonth && periodMonth < periodStartMonth) {
    return false
  }

  if (periodEndMonth && periodMonth > periodEndMonth) {
    return false
  }

  return true
}

function filterStatementResponse(response: ArtistStatementsResponse, filters: ReturnType<typeof normalizeStatementPeriodFilters>) {
  const statements = response.statements.filter((statement) => (
    statementMonthInRange(statement.periodMonth, filters.periodMonth, filters.periodStartMonth, filters.periodEndMonth)
  ))
  const publishingBreakdownRows = response.publishingBreakdownRows.filter((row) => (
    statementMonthInRange(row.periodMonth, filters.periodMonth, filters.periodStartMonth, filters.periodEndMonth)
  ))
  const periodMonths = response.filterOptions.periodMonths.filter((option) => (
    statementMonthInRange(option.value, filters.periodMonth, filters.periodStartMonth, filters.periodEndMonth)
  ))
  const releaseIds = new Set(publishingBreakdownRows.map((row) => row.releaseId).filter(Boolean) as string[])

  return {
    ...response,
    defaultPeriodMonth: statements[0]?.periodMonth ?? periodMonths[0]?.value ?? null,
    statements,
    publishingBreakdownRows,
    filterOptions: {
      ...response.filterOptions,
      periodMonths,
      releases: releaseIds.size
        ? response.filterOptions.releases.filter((option) => releaseIds.has(option.value))
        : response.filterOptions.releases,
    },
  } satisfies ArtistStatementsResponse
}

function emptyResponse(): ArtistStatementsResponse {
  return {
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
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "statements")
  const filters = normalizeStatementPeriodFilters(query)
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return emptyResponse()
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase.rpc("get_artist_statements_payload", {
    target_artist_ids: artistIds,
  })

  throwSupabaseError(error, "Unable to load statements.")

  const payload = (data ?? emptyResponse()) as ArtistStatementsResponse
  return filterStatementResponse(payload, filters)
})
