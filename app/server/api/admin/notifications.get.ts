import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeOptionalInteger } from "~~/server/utils/catalog"
import { mapAdminNotificationRecord, type AdminNotificationRow } from "~~/server/utils/admin-notifications"
import type { AdminNotificationsResponse } from "~~/types/dashboard"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const query = getQuery(event)
  const page = Math.max(normalizeOptionalInteger(query.page, "Page") ?? 1, 1)
  const pageSize = Math.min(Math.max(normalizeOptionalInteger(query.limit, "Limit") ?? 20, 1), 100)
  const supabase = serverSupabaseServiceRole(event)

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from("admin_notifications")
    .select(
      "id, type, title, message, artist_id, reference_id, action_path, is_read, created_at, artists(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load notifications.",
    })
  }

  const { count: unreadCount, error: unreadError } = await supabase
    .from("admin_notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false)

  if (unreadError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load notifications.",
    })
  }

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const notifications = ((data ?? []) as AdminNotificationRow[]).map(mapAdminNotificationRecord)

  return {
    notifications,
    unreadCount: unreadCount ?? 0,
    totalCount,
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  } satisfies AdminNotificationsResponse
})
