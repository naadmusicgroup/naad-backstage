import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { normalizeOptionalPayoutNotes, statusCodeForPayoutRpcError } from "~~/server/utils/payouts"
import type {
  ReverseAdminManualPayoutInput,
  ReverseAdminManualPayoutResponse,
} from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "payout.manual_reversed")
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Payout request id")
  const body = await readBody<ReverseAdminManualPayoutInput>(event)
  const adminNotes = normalizeOptionalPayoutNotes(body?.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("reverse_admin_manual_payout", {
    target_request_id: requestId,
    actor_admin_id: profile.id,
    review_notes: adminNotes,
  })

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForPayoutRpcError(error),
      statusMessage: error?.message || "Unable to reverse this manual payout.",
    })
  }

  const result = data as ReverseAdminManualPayoutResponse

  await logAdminActivity(supabase, profile.id, "payout.manual_reversed", "payout_request", requestId, {
    request_id: requestId,
    artist_id: result.artistId,
    amount: result.amount,
    service_charge: result.serviceCharge,
    admin_notes: adminNotes,
    ledger_entry_id: result.ledgerEntryId,
    resulting_balance: result.resultingBalance,
  })

  return result
})
