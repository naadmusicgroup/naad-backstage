import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { AdminAnalyticsMutationResponse } from "~~/types/admin"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const entryId = normalizeRequiredUuid(event.context.params?.id, "Analytics snapshot id")
  const supabase = serverSupabaseServiceRole(event)

  const { data: existing, error: existingError } = await supabase
    .from("analytics_snapshots")
    .select("id")
    .eq("id", entryId)
    .maybeSingle()

  if (existingError) {
    throw createError({
      statusCode: 500,
      statusMessage: existingError.message,
    })
  }

  if (!existing) {
    throw createError({
      statusCode: 404,
      statusMessage: "That analytics snapshot could not be found.",
    })
  }

  const { error } = await supabase
    .from("analytics_snapshots")
    .delete()
    .eq("id", entryId)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "analytics.deleted", "analytics_snapshot", entryId)

  return {
    entryId,
  } satisfies AdminAnalyticsMutationResponse
})
