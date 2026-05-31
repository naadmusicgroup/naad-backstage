import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import type { AdminDuesResponse } from "~~/types/admin"

function emptyResponse(): AdminDuesResponse {
  return {
    dues: [],
    summary: {
      dueCount: 0,
      pendingAcceptanceCount: 0,
      unpaidCount: 0,
      paidCount: 0,
      cancelledCount: 0,
      pendingAcceptanceAmount: "0.00000000",
      activeAmount: "0.00000000",
      unpaidAmount: "0.00000000",
      paidAmount: "0.00000000",
      cancelledAmount: "0.00000000",
      artistCount: 0,
    },
    artistOptions: [],
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("get_admin_dues_payload")

  throwSupabaseError(error, "Unable to load dues.")

  return (data ?? emptyResponse()) as AdminDuesResponse
})
