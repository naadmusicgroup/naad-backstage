import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid, normalizeOptionalText } from "~~/server/utils/catalog"
import {
  normalizeOptionalPayoutNotes,
  normalizeRequiredPaymentMethod,
  statusCodeForPayoutRpcError,
} from "~~/server/utils/payouts"
import type { MarkPayoutPaidInput, PayoutMutationResponse } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Payout request id")
  const body = await readBody<MarkPayoutPaidInput>(event)
  const adminNotes = normalizeOptionalPayoutNotes(body.adminNotes)
  const paymentMethod = normalizeRequiredPaymentMethod(body.paymentMethod)
  const paymentReference = normalizeOptionalText(body.paymentReference)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("mark_payout_request_paid", {
    target_request_id: requestId,
    actor_admin_id: profile.id,
    payout_method: paymentMethod,
    payout_reference: paymentReference,
    review_notes: adminNotes,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPayoutRpcError(error),
      statusMessage: error?.message || "Unable to mark this payout request as paid.",
    })
  }

  await logAdminActivity(supabase, profile.id, "payout.paid", "payout_request", requestId, {
    request_id: requestId,
    admin_notes: adminNotes,
    payment_method: paymentMethod,
    payment_reference: paymentReference,
  })

  return data as PayoutMutationResponse
})
