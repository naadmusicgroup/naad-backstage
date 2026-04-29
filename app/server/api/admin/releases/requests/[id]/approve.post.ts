import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeOptionalText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { ReviewReleaseChangeRequestInput } from "~~/types/catalog"

function statusCodeForApprovalError(message: string) {
  if (message.includes("does not exist")) {
    return 404
  }

  if (
    message.includes("Only pending requests can be approved.") ||
    message.includes("Only draft releases can accept a draft edit request.")
  ) {
    return 409
  }

  if (
    message.includes("is required.") ||
    message.includes("is invalid.") ||
    message.includes("must be") ||
    message.includes("must use") ||
    message.includes("must stay") ||
    message.includes("cannot exceed")
  ) {
    return 400
  }

  return 500
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Request id")
  const body = await readBody<ReviewReleaseChangeRequestInput>(event)
  const adminNotes = normalizeOptionalText(body.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase.rpc("approve_release_change_request", {
    target_request_id: requestId,
    actor_admin_id: profile.id,
    review_notes: adminNotes,
  })

  if (error) {
    throw createError({
      statusCode: statusCodeForApprovalError(error.message),
      statusMessage: error.message,
    })
  }

  return {
    ok: true,
    result: data ?? null,
  }
})
