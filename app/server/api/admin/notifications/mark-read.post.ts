import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { consumeRateLimit, requestRateLimitKey } from "~~/server/utils/rate-limit"
import type { AdminNotificationMutationResponse } from "~~/types/dashboard"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  consumeRateLimit({
    key: requestRateLimitKey(event, "admin-notifications-mark-read", profile.id),
    limit: 60,
    windowMs: 60 * 1000,
    message: "Too many notification updates. Try again later.",
  })
  const supabase = serverSupabaseServiceRole(event)

  // Read state is shared: marking unread rows read clears them for every admin.
  const { data, error } = await supabase
    .from("admin_notifications")
    .update({ is_read: true, read_at: new Date().toISOString(), read_by: profile.id })
    .eq("is_read", false)
    .select("id")

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to update notifications.",
    })
  }

  return {
    updatedCount: data?.length ?? 0,
  } satisfies AdminNotificationMutationResponse
})
