import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { statusCodeForPublishingRpcError } from "~~/server/utils/publishing"
import type { AdminPublishingMutationResponse } from "~~/types/admin"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const entryId = normalizeRequiredUuid(event.context.params?.id, "Publishing entry id")
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("delete_publishing_earning", {
    target_entry_id: entryId,
    actor_admin_id: profile.id,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPublishingRpcError(error),
      statusMessage: error?.message || "Unable to delete this publishing credit.",
    })
  }

  const result = data as AdminPublishingMutationResponse

  await logAdminActivity(supabase, profile.id, "publishing.deleted", "publishing_earning", entryId, {
    ledger_entry_id: result.ledgerEntryId,
  })

  return result
})
