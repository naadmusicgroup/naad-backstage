import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import type { ArtistPayoutsResponse } from "~~/types/payouts"

function emptyPayoutsResponse(): ArtistPayoutsResponse {
  return {
    artists: [],
    requests: [],
    minimumAmount: "50.00000000",
    maxRequestsPerWindow: 3,
    requestWindowHours: 24,
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "payout data")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return emptyPayoutsResponse()
  }

  const { data, error } = await serverSupabaseServiceRole(event)
    .rpc("get_artist_payouts_payload", {
      target_artist_ids: artistIds,
    })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load payout data.",
    })
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load payout data.",
    })
  }

  return data as ArtistPayoutsResponse
})
