import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { statusCodeForDuesRpcError } from "~~/server/utils/dues"
import type { AdminDueMutationResponse } from "~~/types/admin"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const dueId = normalizeRequiredUuid(event.context.params?.id, "Due id")
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("mark_due_paid", {
    target_due_id: dueId,
    actor_admin_id: profile.id,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForDuesRpcError(error),
      statusMessage: error?.message || "Unable to mark this due as paid.",
    })
  }

  const result = data as AdminDueMutationResponse

  await logAdminActivity(supabase, profile.id, "due.marked_paid", "due", dueId)

  return result
})
