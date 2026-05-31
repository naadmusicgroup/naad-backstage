import { getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import type { ArtistStatementsResponse } from "~~/types/dashboard"

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
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return emptyResponse()
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase.rpc("get_artist_statements_payload", {
    target_artist_ids: artistIds,
  })

  throwSupabaseError(error, "Unable to load statements.")

  return (data ?? emptyResponse()) as ArtistStatementsResponse
})
