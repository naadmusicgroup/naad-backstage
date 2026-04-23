import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { normalizeOptionalPayoutNotes, statusCodeForPayoutRpcError } from "~~/server/utils/payouts"
import type { RejectPayoutRequestInput, PayoutMutationResponse } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Payout request id")
  const body = await readBody<RejectPayoutRequestInput>(event)
  const adminNotes = normalizeOptionalPayoutNotes(body.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("reject_payout_request", {
    target_request_id: requestId,
    actor_admin_id: profile.id,
    review_notes: adminNotes,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPayoutRpcError(error),
      statusMessage: error?.message || "Unable to reject this payout request.",
    })
  }

  await logAdminActivity(supabase, profile.id, "payout.rejected", "payout_request", requestId, {
    request_id: requestId,
    admin_notes: adminNotes,
    ledger_entry_id: (data as PayoutMutationResponse).ledgerEntryId,
  })

  return data as PayoutMutationResponse
})
