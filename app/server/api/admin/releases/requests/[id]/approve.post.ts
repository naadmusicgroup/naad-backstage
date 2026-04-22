import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeOptionalText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import { applyDraftReleaseSnapshot, recordReleaseEvent } from "~~/server/utils/release-lifecycle"
import type { ReviewReleaseChangeRequestInput } from "~~/types/catalog"

interface ReleaseChangeRequestRow {
  id: string
  release_id: string
  requester_artist_id: string
  requested_by: string
  request_type: "draft_edit" | "takedown"
  status: "pending" | "approved" | "rejected" | "applied"
  proposed_release: Record<string, unknown> | null
  proposed_tracks: Record<string, unknown>[] | null
  proposed_credits: Record<string, unknown>[] | null
  proposed_genre: string | null
  takedown_reason: string | null
  proof_urls: string[] | string | null
}

function normalizeProofUrls(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean)
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)).filter(Boolean) : []
    } catch {
      return []
    }
  }

  return [] as string[]
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Request id")
  const body = await readBody<ReviewReleaseChangeRequestInput>(event)
  const adminNotes = normalizeOptionalText(body.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const requestResult = await supabase
    .from("release_change_requests")
    .select(
      "id, release_id, requester_artist_id, requested_by, request_type, status, proposed_release, proposed_tracks, proposed_credits, proposed_genre, takedown_reason, proof_urls",
    )
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
      statusMessage: "Only pending requests can be approved.",
    })
  }

  const approvalTimestamp = new Date().toISOString()

  const { error: approveError } = await supabase
    .from("release_change_requests")
    .update({
      status: "approved",
      admin_notes: adminNotes,
      reviewed_by: profile.id,
      reviewed_at: approvalTimestamp,
    })
    .eq("id", requestId)

  if (approveError) {
    throw createError({
      statusCode: 500,
      statusMessage: approveError.message,
    })
  }

  await recordReleaseEvent(supabase, {
    releaseId: request.release_id,
    eventType: "request_approved",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      requestId,
      requestType: request.request_type,
      adminNotes,
    },
  })

  if (request.request_type === "draft_edit") {
    await applyDraftReleaseSnapshot(supabase, {
      releaseId: request.release_id,
      snapshot: {
        release: request.proposed_release ?? {},
        tracks: request.proposed_tracks ?? [],
        credits: request.proposed_credits ?? [],
        genre: request.proposed_genre,
      },
      adminProfileId: profile.id,
    })
  } else {
    const { error: takedownError } = await supabase
      .from("releases")
      .update({
        status: "taken_down",
        takedown_reason: request.takedown_reason,
        takedown_proof_urls: normalizeProofUrls(request.proof_urls),
        takedown_requested_at: approvalTimestamp,
        takedown_requested_by: request.requested_by,
        takedown_completed_at: approvalTimestamp,
        takedown_completed_by: profile.id,
      })
      .eq("id", request.release_id)

    if (takedownError) {
      throw createError({
        statusCode: 500,
        statusMessage: takedownError.message,
      })
    }

    await recordReleaseEvent(supabase, {
      releaseId: request.release_id,
      eventType: "takedown_completed",
      actorRole: "admin",
      actorProfileId: profile.id,
      payload: {
        requestId,
        reason: request.takedown_reason,
      },
    })
  }

  const { error: appliedError } = await supabase
    .from("release_change_requests")
    .update({
      status: "applied",
      admin_notes: adminNotes,
      reviewed_by: profile.id,
      reviewed_at: approvalTimestamp,
      applied_at: approvalTimestamp,
    })
    .eq("id", requestId)

  if (appliedError) {
    throw createError({
      statusCode: 500,
      statusMessage: appliedError.message,
    })
  }

  await recordReleaseEvent(supabase, {
    releaseId: request.release_id,
    eventType: "request_applied",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      requestId,
      requestType: request.request_type,
    },
  })

  await logAdminActivity(supabase, profile.id, "release.request.approved", "release_change_request", requestId, {
    release_id: request.release_id,
    request_type: request.request_type,
  })

  return {
    ok: true,
  }
})
