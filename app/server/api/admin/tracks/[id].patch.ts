import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertReleaseExists,
  isUniqueViolation,
  mapTrackRecord,
  normalizeIsrc,
  normalizeOptionalHttpUrl,
  normalizeOptionalInteger,
  normalizeRequiredText,
  normalizeRequiredUuid,
  normalizeTrackStatus,
} from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"
import type { UpdateTrackInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const trackId = normalizeRequiredUuid(event.context.params?.id, "Track id")
  const body = await readBody<UpdateTrackInput>(event)
  const update: Record<string, unknown> = {}
  const changedFields: string[] = []
  const supabase = serverSupabaseServiceRole(event)

  const existingTrackResult = await supabase
    .from("tracks")
    .select("id, release_id, status, releases!inner(id, status, title)")
    .eq("id", trackId)
    .single()

  if (existingTrackResult.error || !existingTrackResult.data) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected track does not exist.",
    })
  }

  const currentRelease = Array.isArray(existingTrackResult.data.releases)
    ? existingTrackResult.data.releases[0]
    : existingTrackResult.data.releases

  if (body.releaseId !== undefined) {
    update.release_id = normalizeRequiredUuid(body.releaseId, "Release")
    await assertReleaseExists(supabase, update.release_id as string)
    changedFields.push("releaseId")
  }

  if (body.title !== undefined) {
    update.title = normalizeRequiredText(body.title, "Track title")
    changedFields.push("title")
  }

  if (body.isrc !== undefined) {
    update.isrc = normalizeIsrc(body.isrc)
    changedFields.push("isrc")
  }

  if (body.trackNumber !== undefined) {
    update.track_number = normalizeOptionalInteger(body.trackNumber, "Track number")
    changedFields.push("trackNumber")
  }

  if (body.audioPreviewUrl !== undefined) {
    update.audio_preview_url = normalizeOptionalHttpUrl(body.audioPreviewUrl, "Audio preview URL")
    changedFields.push("audioPreviewUrl")
  }

  if (body.status !== undefined) {
    const status = normalizeTrackStatus(body.status)

    if (status === "deleted" && currentRelease?.status !== "draft") {
      throw createError({
        statusCode: 409,
        statusMessage: "Tracks on non-draft releases cannot be deleted directly. Use the release request or takedown workflow instead.",
      })
    }

    update.status = status
    update.deleted_by = status === "deleted" ? profile.id : null
    changedFields.push("status")
  }

  if (!changedFields.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No track changes were provided.",
    })
  }

  const { data, error } = await supabase
    .from("tracks")
    .update(update)
    .eq("id", trackId)
    .select(
      "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, status, created_at, updated_at, releases!inner(artist_id, title)",
    )
    .single()

  if (error) {
    throw createError({
      statusCode: isUniqueViolation(error) ? 409 : 500,
      statusMessage: isUniqueViolation(error)
        ? "That ISRC is already assigned to another track."
        : error.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "track.updated", "track", trackId, {
    fields: changedFields,
    release_id: data.release_id,
  })

  await recordReleaseEvent(supabase, {
    releaseId: data.release_id,
    eventType: "release_edited",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      trackId,
      fields: changedFields,
      status: update.status ?? null,
    },
  })

  return {
    ok: true,
    track: mapTrackRecord(data as any),
  }
})
