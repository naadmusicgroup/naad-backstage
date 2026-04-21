import { createError } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { mapPayoutRequestRecord } from "~~/server/utils/payouts"
import { toMoneyString } from "~~/server/utils/money"
import type { AdminPayoutsResponse } from "~~/types/payouts"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase
    .from("payout_requests")
    .select(
      "id, artist_id, requested_by, amount, status, artist_notes, admin_notes, reviewed_by, reviewed_at, paid_at, payment_method, payment_reference, created_at, updated_at, artists!inner(id, name, artist_bank_details(account_name, bank_name, account_number, bank_address, updated_at))",
    )
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  const summary = {
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    paidCount: 0,
    pendingAmount: new Decimal(0),
    approvedAmount: new Decimal(0),
    paidAmount: new Decimal(0),
  }

  for (const row of (data ?? []) as any[]) {
    const amount = new Decimal(row.amount ?? 0)

    switch (row.status) {
      case "pending":
        summary.pendingCount += 1
        summary.pendingAmount = summary.pendingAmount.add(amount)
        break
      case "approved":
        summary.approvedCount += 1
        summary.approvedAmount = summary.approvedAmount.add(amount)
        break
      case "rejected":
        summary.rejectedCount += 1
        break
      case "paid":
        summary.paidCount += 1
        summary.paidAmount = summary.paidAmount.add(amount)
        break
    }
  }

  return {
    requests: ((data ?? []) as any[]).map((row) => mapPayoutRequestRecord(row)),
    summary: {
      pendingCount: summary.pendingCount,
      approvedCount: summary.approvedCount,
      rejectedCount: summary.rejectedCount,
      paidCount: summary.paidCount,
      pendingAmount: toMoneyString(summary.pendingAmount),
      approvedAmount: toMoneyString(summary.approvedAmount),
      paidAmount: toMoneyString(summary.paidAmount),
    },
  } satisfies AdminPayoutsResponse
})
