import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertReleaseExists,
  isUniqueViolation,
  mapTrackRecord,
  normalizeBoolean,
  normalizeIsrc,
  normalizeOptionalHttpUrl,
  normalizeOptionalInteger,
  normalizeRequiredUuid,
  normalizeRequiredText,
} from "~~/server/utils/catalog"
import type { UpdateTrackInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)

  const trackId = normalizeRequiredUuid(event.context.params?.id, "Track id")

  const body = await readBody<UpdateTrackInput>(event)
  const update: Record<string, unknown> = {}

  if (body.releaseId !== undefined) {
    update.release_id = normalizeRequiredUuid(body.releaseId, "Release")
  }

  if (body.title !== undefined) {
    update.title = normalizeRequiredText(body.title, "Track title")
  }

  if (body.isrc !== undefined) {
    update.isrc = normalizeIsrc(body.isrc)
  }

  if (body.trackNumber !== undefined) {
    update.track_number = normalizeOptionalInteger(body.trackNumber, "Track number")
  }

  if (body.audioPreviewUrl !== undefined) {
    update.audio_preview_url = normalizeOptionalHttpUrl(body.audioPreviewUrl, "Audio preview URL")
  }

  if (body.isActive !== undefined) {
    update.is_active = normalizeBoolean(body.isActive)
  }

  if (!Object.keys(update).length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No track changes were provided.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)

  if (typeof update.release_id === "string") {
    await assertReleaseExists(supabase, update.release_id)
  }

  const { data, error } = await supabase
    .from("tracks")
    .update(update)
    .eq("id", trackId)
    .select(
      "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, is_active, created_at, updated_at, releases!inner(artist_id, title)",
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
    fields: Object.keys(update),
  })

  return {
    ok: true,
    track: mapTrackRecord(data as any),
  }
})
