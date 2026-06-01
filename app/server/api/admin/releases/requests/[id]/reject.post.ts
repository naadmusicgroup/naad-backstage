import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { dashboardEmailUrl, sendDashboardEmail } from "~~/server/utils/email"
import { normalizeOptionalText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"
import type { ReviewReleaseChangeRequestInput } from "~~/types/catalog"

interface ReleaseChangeRequestRow {
  id: string
  release_id: string
  request_type: "draft_edit" | "takedown"
  status: "pending" | "approved" | "rejected" | "applied"
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Request id")
  const body = await readBody<ReviewReleaseChangeRequestInput>(event)
  const adminNotes = normalizeOptionalText(body.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const requestResult = await supabase
    .from("release_change_requests")
    .select("id, release_id, request_type, status")
    .eq("id", requestId)
    .single()

  if (requestResult.error || !requestResult.data) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release request does not exist.",
    })
  }

  const request = requestResult.data as ReleaseChangeRequestRow

  if (request.status !== "pending") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only pending requests can be rejected.",
    })
  }

  const reviewedAt = new Date().toISOString()
  const { error } = await supabase
    .from("release_change_requests")
    .update({
      status: "rejected",
      admin_notes: adminNotes,
      reviewed_by: profile.id,
      reviewed_at: reviewedAt,
    })
    .eq("id", requestId)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  await recordReleaseEvent(supabase, {
    releaseId: request.release_id,
    eventType: "request_rejected",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      requestId,
      requestType: request.request_type,
      adminNotes,
    },
  })

  await logAdminActivity(supabase, profile.id, "release.request.rejected", "release_change_request", requestId, {
    release_id: request.release_id,
    request_type: request.request_type,
  })

  const { data: releaseEmailRow } = await supabase
    .from("releases")
    .select("title, artists(name, email)")
    .eq("id", request.release_id)
    .maybeSingle()
  const releaseArtist = firstRelation((releaseEmailRow as any)?.artists) as { name?: string | null; email?: string | null } | null
  const requestLabel = request.request_type === "draft_edit" ? "draft edit" : "takedown"

  await sendDashboardEmail(event, {
    to: releaseArtist?.email,
    subject: "Your Naad Backstage catalog request needs review",
    preview: `Your ${requestLabel} request was rejected.`,
    title: "Catalog request rejected",
    lines: [
      releaseArtist?.name ? `Hi ${releaseArtist.name},` : "Hi,",
      `Your ${requestLabel} request for "${(releaseEmailRow as any)?.title || "your release"}" was rejected.`,
      adminNotes ? `Admin note: ${adminNotes}` : "Open your dashboard to review the request status.",
    ],
    actionLabel: "View releases",
    actionUrl: dashboardEmailUrl(event, "/dashboard/releases"),
  })

  return {
    ok: true,
  }
})
