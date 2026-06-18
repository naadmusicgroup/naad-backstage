import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "company_transaction.deleted")
  const transactionId = normalizeRequiredUuid(event.context.params?.id, "Company transaction id")
  const supabase = serverSupabaseServiceRole(event)

  const { error } = await supabase
    .from("company_transactions")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
      updated_by: profile.id,
    })
    .eq("id", transactionId)
    .is("deleted_at", null)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to delete this company transaction.",
    })
  }

  await logAdminActivity(supabase, profile.id, "company_transaction.deleted", "company_transaction", transactionId)

  return { ok: true }
})
