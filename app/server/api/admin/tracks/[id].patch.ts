import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertReleaseExists,
  assertTrackIsrcAvailableForArtist,
  isUniqueViolation,
  mapTrackRecord,
  normalizeIsrc,
  normalizeOptionalHttpUrl,
  normalizeOptionalInteger,
  normalizeOptionalText,
  normalizeRequiredText,
  normalizeRequiredUuid,
  normalizeTrackStatus,
} from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"
import { getTrackArchiveRisk } from "~~/server/utils/catalog-archive-risk"
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
    .select("id, release_id, isrc, status, releases!inner(id, artist_id, status, title)")
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

  let targetRelease = currentRelease

  if (body.releaseId !== undefined) {
    update.release_id = normalizeRequiredUuid(body.releaseId, "Release")
    targetRelease = await assertReleaseExists(supabase, update.release_id as string)
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

  if (body.lyrics !== undefined) {
    update.lyrics = normalizeOptionalText(body.lyrics)
    changedFields.push("lyrics")
  }

  if (body.tiktokPreviewStartSeconds !== undefined) {
    update.tiktok_preview_start_seconds = normalizeOptionalInteger(body.tiktokPreviewStartSeconds, "TikTok preview time")
    changedFields.push("tiktokPreviewStartSeconds")
  }

  if (body.versionLine !== undefined) {
    update.version_line = normalizeOptionalText(body.versionLine)
    changedFields.push("versionLine")
  }

  if (body.containsAiGeneratedElements !== undefined) {
    update.contains_ai_generated_elements = body.containsAiGeneratedElements === true
    changedFields.push("containsAiGeneratedElements")
  }

  if (body.status !== undefined) {
    const status = normalizeTrackStatus(body.status)

    if (status === "deleted" && currentRelease?.status !== "draft") {
      throw createError({
        statusCode: 409,
        statusMessage: "Tracks on non-draft releases cannot be deleted directly. Use the release request or takedown workflow instead.",
      })
    }

    if (status === "deleted") {
      const archiveRisk = await getTrackArchiveRisk(supabase, trackId)

      if (archiveRisk.hasEarnings && body.confirmArchiveWithEarnings !== true) {
        throw createError({
          statusCode: 409,
          statusMessage: `This track has ${archiveRisk.earningsRowCount.toLocaleString()} earnings rows. Review archive impact and confirm before deleting it.`,
        })
      }
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

  if (update.release_id !== undefined || update.isrc !== undefined) {
    const targetArtistId = targetRelease?.artist_id
    const targetIsrc = (update.isrc as string | undefined) ?? existingTrackResult.data.isrc

    if (targetArtistId) {
      await assertTrackIsrcAvailableForArtist(supabase, targetArtistId, targetIsrc, trackId)
    }
  }

  const { data, error } = await supabase
    .from("tracks")
    .update(update)
    .eq("id", trackId)
    .select(
      "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, lyrics, tiktok_preview_start_seconds, version_line, contains_ai_generated_elements, status, created_at, updated_at, releases!inner(artist_id, title)",
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
