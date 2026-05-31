import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import type { AdminReconciliationResponse } from "~~/types/settings"

function emptyResponse(): AdminReconciliationResponse {
  return {
    checkedAt: new Date().toISOString(),
    summary: {
      artistCount: 0,
      passCount: 0,
      warningCount: 0,
      failCount: 0,
      issueCount: 0,
    },
    artists: [],
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("get_admin_reconciliation_payload")

  throwSupabaseError(error, "Unable to run reconciliation.")

  return (data ?? emptyResponse()) as AdminReconciliationResponse
})
