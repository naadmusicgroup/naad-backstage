import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import {
  normalizeOptionalManualPayoutServiceCharge,
  normalizeRequiredManualPayoutAmount,
  statusCodeForPayoutRpcError,
} from "~~/server/utils/payouts"
import type { PayoutMutationResponse, UpdateAdminPayoutFinancialsInput } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "payout.financials_updated")
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Payout request id")
  const body = await readBody<UpdateAdminPayoutFinancialsInput>(event)
  const amount = normalizeRequiredManualPayoutAmount(body.amount, "Payout amount")
  const serviceCharge = normalizeOptionalManualPayoutServiceCharge(body.serviceCharge)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("update_admin_payout_financials", {
    target_request_id: requestId,
    actor_admin_id: profile.id,
    payout_amount: amount,
    payout_service_charge: serviceCharge,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPayoutRpcError(error),
      statusMessage: error?.message || "Unable to update this payout.",
    })
  }

  const result = data as PayoutMutationResponse

  await logAdminActivity(supabase, profile.id, "payout.financials_updated", "payout_request", requestId, {
    request_id: requestId,
    amount,
    service_charge: serviceCharge,
    ledger_entry_id: result.ledgerEntryId,
    service_charge_due_id: result.serviceChargeDueId,
    service_charge_ledger_entry_id: result.serviceChargeLedgerEntryId,
    resulting_balance: result.resultingBalance,
  })

  return result
})
