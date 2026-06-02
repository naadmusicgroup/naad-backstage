import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import type { ArtistDashboardHomeResponse } from "~~/types/dashboard"

function emptyResponse(profileFullName = ""): ArtistDashboardHomeResponse {
  return {
    latestRelease: null,
    releaseLookup: [],
    setup: {
      profileFullName,
      artist: null,
    },
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "dashboard home")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return emptyResponse(scope.profile.full_name ?? "")
  }

  const { data, error } = await serverSupabaseServiceRole(event)
    .rpc("get_artist_dashboard_home_payload", {
      target_artist_ids: artistIds,
      target_artist_owner_user_id: scope.artistOwnerUserId,
      target_profile_full_name: scope.profile.full_name ?? "",
      target_is_impersonating: scope.isImpersonating,
    })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load dashboard home.",
    })
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load dashboard home.",
    })
  }

  return data as ArtistDashboardHomeResponse
})
