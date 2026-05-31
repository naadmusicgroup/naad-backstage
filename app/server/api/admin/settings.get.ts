import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import type { AdminSettingsResponse } from "~~/types/settings"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const { data, error } = await serverSupabaseServiceRole(event)
    .rpc("get_admin_settings_payload")

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load admin settings.",
    })
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load admin settings.",
    })
  }

  return data as AdminSettingsResponse
})
