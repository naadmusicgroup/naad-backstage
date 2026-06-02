import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeBoolean,
  normalizeOptionalInteger,
} from "~~/server/utils/catalog"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import type { ArtistNotificationsResponse } from "~~/types/dashboard"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const requestedPage = Math.max(normalizeOptionalInteger(query.page, "Page") ?? 1, 1)
  const requestedPageSize = Math.min(Math.max(normalizeOptionalInteger(query.limit, "Limit") ?? 100, 1), 200)
  const unreadOnly = normalizeBoolean(query.unreadOnly, false)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "notifications")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return {
      notifications: [],
      unreadCount: 0,
      totalCount: 0,
      pagination: {
        page: 1,
        pageSize: requestedPageSize,
        totalCount: 0,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    } satisfies ArtistNotificationsResponse
  }

  const { data, error } = await serverSupabaseServiceRole(event)
    .rpc("get_artist_notifications_payload", {
      target_artist_ids: artistIds,
      target_page: requestedPage,
      target_page_size: requestedPageSize,
      target_unread_only: unreadOnly,
    })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load notifications.",
    })
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load notifications.",
    })
  }

  return data as ArtistNotificationsResponse
})
