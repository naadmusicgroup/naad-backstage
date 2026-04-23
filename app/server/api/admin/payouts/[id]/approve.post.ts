import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { normalizeOptionalPayoutNotes, statusCodeForPayoutRpcError } from "~~/server/utils/payouts"
import type { ApprovePayoutRequestInput, PayoutMutationResponse } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Payout request id")
  const body = await readBody<ApprovePayoutRequestInput>(event)
  const adminNotes = normalizeOptionalPayoutNotes(body.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("approve_payout_request", {
    target_request_id: requestId,
    actor_admin_id: profile.id,
    review_notes: adminNotes,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPayoutRpcError(error),
      statusMessage: error?.message || "Unable to approve this payout request.",
    })
  }

  await logAdminActivity(supabase, profile.id, "payout.approved", "payout_request", requestId, {
    request_id: requestId,
    admin_notes: adminNotes,
  })

  return data as PayoutMutationResponse
})
