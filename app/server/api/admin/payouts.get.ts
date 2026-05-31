import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import type { AdminPayoutsResponse } from "~~/types/payouts"

function emptyResponse(): AdminPayoutsResponse {
  return {
    requests: [],
    summary: {
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      paidCount: 0,
      pendingAmount: "0.00000000",
      approvedAmount: "0.00000000",
      paidAmount: "0.00000000",
    },
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("get_admin_payouts_payload", {
    target_limit: 100,
  })

  throwSupabaseError(error, "Unable to load payouts.")

  return (data ?? emptyResponse()) as AdminPayoutsResponse
})

