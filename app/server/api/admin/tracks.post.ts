import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertReleaseExists,
  isUniqueViolation,
  mapTrackRecord,
  normalizeIsrc,
  normalizeOptionalHttpUrl,
  normalizeOptionalInteger,
  normalizeTrackCreditsInput,
  normalizeTrackStatus,
  normalizeRequiredText,
} from "~~/server/utils/catalog"
import { recordReleaseEvent, replaceTrackCredits } from "~~/server/utils/release-lifecycle"
import type { CreateTrackInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)

  const body = await readBody<CreateTrackInput>(event)
  const releaseId = body.releaseId
  const title = normalizeRequiredText(body.title, "Track title")
  const isrc = normalizeIsrc(body.isrc)
  const trackNumber = normalizeOptionalInteger(body.trackNumber, "Track number")
  const audioPreviewUrl = normalizeOptionalHttpUrl(body.audioPreviewUrl, "Audio preview URL")
  const status = normalizeTrackStatus(body.status, "draft")
  const credits = normalizeTrackCreditsInput(body.credits)
  const supabase = serverSupabaseServiceRole(event)

  const release = await assertReleaseExists(supabase, releaseId)

  const { data, error } = await supabase
    .from("tracks")
    .insert({
      release_id: releaseId,
      title,
      isrc,
      track_number: trackNumber,
      audio_preview_url: audioPreviewUrl,
      status,
      deleted_by: status === "deleted" ? profile.id : null,
    })
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

  await replaceTrackCredits(supabase, {
    trackId: data.id,
    credits,
    profileId: profile.id,
  })

  await logAdminActivity(supabase, profile.id, "track.created", "track", data.id, {
    release_id: releaseId,
    title,
    isrc,
    status,
  })

  await recordReleaseEvent(supabase, {
    releaseId,
    eventType: credits.length ? "credits_changed" : "release_edited",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      trackId: data.id,
      title,
      status,
      creditsChanged: credits.length > 0,
    },
  })

  return {
    ok: true,
    track: mapTrackRecord(data as any),
  }
})

