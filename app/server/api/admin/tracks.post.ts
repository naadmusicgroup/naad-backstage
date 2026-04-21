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
import type { CreateTrackInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)

  const body = await readBody<CreateTrackInput>(event)
  const releaseId = normalizeRequiredUuid(body.releaseId, "Release")
  const title = normalizeRequiredText(body.title, "Track title")
  const isrc = normalizeIsrc(body.isrc)
  const trackNumber = normalizeOptionalInteger(body.trackNumber, "Track number")
  const audioPreviewUrl = normalizeOptionalHttpUrl(body.audioPreviewUrl, "Audio preview URL")
  const isActive = normalizeBoolean(body.isActive, true)
  const supabase = serverSupabaseServiceRole(event)

  await assertReleaseExists(supabase, releaseId)

  const { data, error } = await supabase
    .from("tracks")
    .insert({
      release_id: releaseId,
      title,
      isrc,
      track_number: trackNumber,
      audio_preview_url: audioPreviewUrl,
      is_active: isActive,
    })
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

  await logAdminActivity(supabase, profile.id, "track.created", "track", data.id, {
    release_id: releaseId,
    title,
    isrc,
  })

  return {
    ok: true,
    track: mapTrackRecord(data as any),
  }
})
