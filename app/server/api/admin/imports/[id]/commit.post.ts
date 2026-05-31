import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { CsvCommitResponse } from "~~/types/imports"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const uploadId = normalizeRequiredUuid(event.context.params?.id, "Upload id")

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase.rpc("commit_csv_upload", {
    target_upload_id: uploadId,
    actor_admin_id: profile.id,
    analytics_payload: {},
  })

  if (error || !data) {
    throw createError({
      statusCode: 409,
      statusMessage: error?.message || "Unable to commit this upload.",
    })
  }

  return data as CsvCommitResponse
})
