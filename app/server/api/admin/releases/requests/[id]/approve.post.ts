import { createError, readBody } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeIsrc, normalizeOptionalInteger, normalizeOptionalText, normalizeRequiredUuid } from "~~/server/utils/catalog"
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function uuidOrNull(value: unknown) {
  const normalized = String(value ?? "").trim()
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null
}

async function applyApprovedTrackMetadata(
  supabase: SupabaseClient<any>,
  releaseId: string,
  proposedTracks: unknown,
) {
  if (!Array.isArray(proposedTracks)) {
    return
  }

  for (const track of proposedTracks) {
    if (
      !isRecord(track) ||
      (!("lyrics" in track) &&
        !("tiktokPreviewStartSeconds" in track) &&
        !("versionLine" in track) &&
        !("containsAiGeneratedElements" in track))
    ) {
      continue
    }

    const update: Record<string, unknown> = {}

    if ("lyrics" in track) {
      update.lyrics = normalizeOptionalText(String(track.lyrics ?? ""))
    }

    if ("tiktokPreviewStartSeconds" in track) {
      update.tiktok_preview_start_seconds = normalizeOptionalInteger(track.tiktokPreviewStartSeconds, "TikTok preview time")
    }

    if ("versionLine" in track) {
      update.version_line = normalizeOptionalText(String(track.versionLine ?? ""))
    }

    if ("containsAiGeneratedElements" in track) {
      update.contains_ai_generated_elements = track.containsAiGeneratedElements === true
    }

    const trackId = uuidOrNull(track.id)

    let request = supabase
      .from("tracks")
      .update(update as any)
      .eq("release_id", releaseId)

    if (trackId) {
      request = request.eq("id", trackId)
    } else if (track.isrc) {
      request = request.eq("isrc", normalizeIsrc(track.isrc))
    } else {
      continue
    }

    const { error } = await request

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const requestId = normalizeRequiredUuid(event.context.params?.id, "Request id")
  const body = await readBody<ReviewReleaseChangeRequestInput>(event)
  const adminNotes = normalizeOptionalText(body.adminNotes)
  const supabase = serverSupabaseServiceRole(event)

  const { data: requestSnapshot, error: requestSnapshotError } = await supabase
    .from("release_change_requests")
    .select("release_id, request_type, proposed_tracks")
    .eq("id", requestId)
    .single()

  if (requestSnapshotError || !requestSnapshot) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release request does not exist.",
    })
  }

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

  if (requestSnapshot.request_type === "draft_edit") {
    await applyApprovedTrackMetadata(
      supabase as SupabaseClient<any>,
      requestSnapshot.release_id,
      requestSnapshot.proposed_tracks,
    )
  }

  return {
    ok: true,
    result: data ?? null,
  }
})
