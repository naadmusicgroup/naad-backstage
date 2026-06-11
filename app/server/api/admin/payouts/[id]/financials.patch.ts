import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import {
  normalizeOptionalManualPayoutServiceCharge,
  normalizeOptionalPayoutBankChargePct,
  normalizeRequiredManualPayoutAmount,
  requirePayoutDisplayServiceChargeStorage,
  resolvePayoutServiceChargeForRpc,
  statusCodeForPayoutRpcError,
  updatePayoutDisplayServiceCharge,
} from "~~/server/utils/payouts"
import type { PayoutMutationResponse, UpdateAdminPayoutFinancialsInput } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "payout.financials_updated")
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Payout request id")
  const body = await readBody<UpdateAdminPayoutFinancialsInput>(event)
  const amount = normalizeRequiredManualPayoutAmount(body.amount, "Payout amount")
  const serviceCharge = normalizeOptionalManualPayoutServiceCharge(body.serviceCharge)
  const bankChargePct = normalizeOptionalPayoutBankChargePct(body.bankChargePct)
  const supabase = serverSupabaseServiceRole(event)
  const serviceChargeResolution = resolvePayoutServiceChargeForRpc(serviceCharge)

  await requirePayoutDisplayServiceChargeStorage(supabase, serviceCharge)

  const { data, error } = await supabase.rpc("update_admin_payout_financials", {
    target_request_id: requestId,
    actor_admin_id: profile.id,
    payout_amount: amount,
    payout_service_charge: serviceChargeResolution.rpcServiceCharge,
    payout_bank_charge_pct: bankChargePct,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPayoutRpcError(error),
      statusMessage: error?.message || "Unable to update this payout.",
    })
  }

  const result = {
    ...(data as PayoutMutationResponse),
    serviceCharge: await updatePayoutDisplayServiceCharge(supabase, requestId, serviceCharge),
  }

  await logAdminActivity(supabase, profile.id, "payout.financials_updated", "payout_request", requestId, {
    request_id: requestId,
    amount,
    service_charge: serviceCharge,
    bank_charge_pct: bankChargePct,
    service_charge_storage: "payout_requests.service_charge",
    rpc_service_charge: serviceChargeResolution.rpcServiceCharge,
    ledger_entry_id: result.ledgerEntryId,
    resulting_balance: result.resultingBalance,
  })

  return result
})
