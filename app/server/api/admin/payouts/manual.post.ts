import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { sendArtistNotificationEmail } from "~~/server/utils/email"
import { normalizeOptionalText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import {
  normalizeOptionalManualPayoutServiceCharge,
  normalizeOptionalPayoutNotes,
  normalizeRequiredManualPayoutAmount,
  normalizeRequiredPaymentMethod,
  normalizeRequiredPayoutPaidAt,
  requirePayoutDisplayServiceChargeStorage,
  resolvePayoutServiceChargeForRpc,
  statusCodeForPayoutRpcError,
  updatePayoutDisplayServiceCharge,
} from "~~/server/utils/payouts"
import type { CreateAdminManualPayoutInput, PayoutMutationResponse } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "payout.manual_paid")
  const body = await readBody<CreateAdminManualPayoutInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist id")
  const amount = normalizeRequiredManualPayoutAmount(body.amount)
  const serviceCharge = normalizeOptionalManualPayoutServiceCharge(body.serviceCharge)
  const paidAt = normalizeRequiredPayoutPaidAt(body.paidAt)
  const adminNotes = normalizeOptionalPayoutNotes(body.adminNotes)
  const paymentMethod = normalizeRequiredPaymentMethod(body.paymentMethod)
  const paymentReference = normalizeOptionalText(body.paymentReference)
  const supabase = serverSupabaseServiceRole(event)
  const serviceChargeResolution = resolvePayoutServiceChargeForRpc(serviceCharge)

  await requirePayoutDisplayServiceChargeStorage(supabase, serviceCharge)

  const { data, error } = await supabase.rpc("create_admin_manual_payout", {
    target_artist_id: artistId,
    actor_admin_id: profile.id,
    payout_amount: amount,
    payout_paid_at: paidAt,
    payout_method: paymentMethod,
    payout_reference: paymentReference,
    review_notes: adminNotes,
    payout_service_charge: serviceChargeResolution.rpcServiceCharge,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPayoutRpcError(error),
      statusMessage: error?.message || "Unable to record this payout history entry.",
    })
  }

  const result = {
    ...(data as PayoutMutationResponse),
  }
  result.serviceCharge = await updatePayoutDisplayServiceCharge(supabase, result.requestId, serviceCharge)

  await logAdminActivity(supabase, profile.id, "payout.manual_paid", "payout_request", result.requestId, {
    artist_id: artistId,
    amount,
    service_charge: serviceCharge,
    service_charge_storage: "payout_requests.service_charge",
    rpc_service_charge: serviceChargeResolution.rpcServiceCharge,
    paid_at: paidAt,
    admin_notes: adminNotes,
    payment_method: paymentMethod,
    payment_reference: paymentReference,
    ledger_entry_id: result.ledgerEntryId,
  })

  await sendArtistNotificationEmail(event, supabase, {
    type: "payout_paid",
    referenceId: result.requestId,
  })

  return result
})
