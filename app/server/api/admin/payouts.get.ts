import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import { loadAdminPayoutArtistOptions } from "~~/server/utils/admin-payouts"
import type { AdminPayoutArtistOption, AdminPayoutsResponse } from "~~/types/payouts"

function emptyResponse(): AdminPayoutsResponse {
  return {
    requests: [],
    artistOptions: [],
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

function hasUsableArtistOptions(value: unknown): value is AdminPayoutArtistOption[] {
  return Array.isArray(value) && value.length > 0
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("get_admin_payouts_payload", {
    target_limit: 100,
  })

  throwSupabaseError(error, "Unable to load payouts.")

  const payload = {
    ...emptyResponse(),
    ...((data ?? {}) as Partial<AdminPayoutsResponse>),
  }

  if (!hasUsableArtistOptions(payload.artistOptions)) {
    payload.artistOptions = await loadAdminPayoutArtistOptions(supabase)
  }

  return payload as AdminPayoutsResponse
})

