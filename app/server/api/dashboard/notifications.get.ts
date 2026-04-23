import { createError, getQuery } from "h3"
import { serverSupabaseClient } from "~~/server/utils/supabase"
import {
  normalizeBoolean,
  normalizeOptionalInteger,
} from "~~/server/utils/catalog"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import {
  mapArtistNotificationRecord,
  type NotificationRow,
} from "~~/server/utils/notifications"
import type { ArtistNotificationsResponse } from "~~/types/dashboard"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const limit = Math.min(normalizeOptionalInteger(query.limit, "Limit") ?? 100, 200)
  const unreadOnly = normalizeBoolean(query.unreadOnly, false)
  const supabase = await serverSupabaseClient(event)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "notifications")
  const artistIds = scope.artistIds

  if (!artistIds.length) {
    return {
      notifications: [],
      unreadCount: 0,
    } satisfies ArtistNotificationsResponse
  }

  let notificationQuery = supabase
    .from("notifications")
    .select("id, artist_id, title, message, type, reference_id, is_read, created_at, updated_at, artists(id, name)")
    .in("artist_id", artistIds)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (unreadOnly) {
    notificationQuery = notificationQuery.eq("is_read", false)
  }

  const [notificationsResult, unreadCountResult] = await Promise.all([
    notificationQuery,
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .in("artist_id", artistIds)
      .eq("is_read", false),
  ])

  if (notificationsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: notificationsResult.error.message,
    })
  }

  if (unreadCountResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: unreadCountResult.error.message,
    })
  }

  return {
    notifications: ((notificationsResult.data ?? []) as NotificationRow[]).map(mapArtistNotificationRecord),
    unreadCount: unreadCountResult.count ?? 0,
  } satisfies ArtistNotificationsResponse
})
