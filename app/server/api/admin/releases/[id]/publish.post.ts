import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"

interface ReleasePublishRow {
  id: string
  title: string
  status: string
  cover_art_url: string | null
  release_date: string | null
}

interface TrackPublishRow {
  id: string
  isrc: string
  audio_preview_url: string | null
  status: string
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const releaseId = normalizeRequiredUuid(event.context.params?.id, "Release id")
  const supabase = serverSupabaseServiceRole(event)

  const { data: release, error: releaseError } = await supabase
    .from("releases")
    .select("id, title, status, cover_art_url, release_date")
    .eq("id", releaseId)
    .single()

  if (releaseError || !release) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release does not exist.",
    })
  }

  const releaseRow = release as ReleasePublishRow

  if (releaseRow.status !== "draft") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only scheduled draft releases can be published.",
    })
  }

  if (!releaseRow.cover_art_url || !releaseRow.release_date) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cover art and release date are required before publishing.",
    })
  }

  const { data: submission, error: submissionError } = await supabase
    .from("artist_release_submissions")
    .select("id, status")
    .eq("release_id", releaseId)
    .maybeSingle()

  if (submissionError) {
    throw createError({
      statusCode: 500,
      statusMessage: submissionError.message,
    })
  }

  if (!submission || submission.status !== "approved") {
    throw createError({
      statusCode: 409,
      statusMessage: "A release submission must be approved before publishing.",
    })
  }

  const { data: tracks, error: tracksError } = await supabase
    .from("tracks")
    .select("id, isrc, audio_preview_url, status")
    .eq("release_id", releaseId)
    .neq("status", "deleted")

  if (tracksError) {
    throw createError({
      statusCode: 500,
      statusMessage: tracksError.message,
    })
  }

  const publishableTracks = (tracks ?? []) as TrackPublishRow[]

  if (!publishableTracks.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "At least one track is required before publishing.",
    })
  }

  const incompleteTrack = publishableTracks.find((track) => !track.audio_preview_url || track.isrc.startsWith("PENDING-"))

  if (incompleteTrack) {
    throw createError({
      statusCode: 400,
      statusMessage: "Every track needs a final audio URL and real ISRC before publishing.",
    })
  }

  const { error: releaseUpdateError } = await supabase
    .from("releases")
    .update({ status: "live" })
    .eq("id", releaseId)

  if (releaseUpdateError) {
    throw createError({
      statusCode: 500,
      statusMessage: releaseUpdateError.message,
    })
  }

  const { error: trackUpdateError } = await supabase
    .from("tracks")
    .update({ status: "live" })
    .eq("release_id", releaseId)
    .neq("status", "deleted")

  if (trackUpdateError) {
    throw createError({
      statusCode: 500,
      statusMessage: trackUpdateError.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "release.published", "release", releaseId, {
    submission_id: submission.id,
    track_count: publishableTracks.length,
  })

  await recordReleaseEvent(supabase, {
    releaseId,
    eventType: "release_edited",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      submissionId: submission.id,
      status: "live",
      published: true,
    },
  })

  return {
    ok: true,
    releaseId,
    trackCount: publishableTracks.length,
  }
})
