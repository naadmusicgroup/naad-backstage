import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { throwSupabaseError } from "~~/server/utils/supabase-pagination"
import type { AdminPublishingResponse } from "~~/types/admin"

function emptyResponse(): AdminPublishingResponse {
  return {
    entries: [],
    summary: {
      entryCount: 0,
      totalAmount: "0.00000000",
      artistCount: 0,
      releaseCount: 0,
      periodCount: 0,
    },
    artistOptions: [],
    releaseOptions: [],
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("get_admin_publishing_payload")

  throwSupabaseError(error, "Unable to load publishing entries.")

  return (data ?? emptyResponse()) as AdminPublishingResponse
})
