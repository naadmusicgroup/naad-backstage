import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { dashboardEmailUrl, sendDashboardEmail } from "~~/server/utils/email"
import {
  assertTrackIsrcAvailableForArtist,
  isUniqueViolation,
  normalizeGenre,
  normalizeIsrc,
  normalizeOptionalHttpUrl,
  normalizeOptionalInteger,
  normalizeOptionalIsoDate,
  normalizeOptionalText,
  normalizeReleaseType,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"
import { prepareReleaseCoverAsset } from "~~/server/utils/release-assets"
import type { ReleaseType } from "~~/types/catalog"

interface ApproveSubmissionTrackInput {
  trackId?: string
  title?: string
  isrc?: string
  trackNumber?: number | string | null
  audioPreviewUrl?: string | null
  lyrics?: string | null
  tiktokPreviewStartSeconds?: number | string | null
  versionLine?: string | null
  containsAiGeneratedElements?: boolean | null
}

interface ApproveSubmissionInput {
  title?: string
  type?: ReleaseType
  genre?: string
  upc?: string | null
  coverArtUrl?: string | null
  streamingLink?: string | null
  releaseDate?: string | null
  adminNotes?: string | null
  tracks?: ApproveSubmissionTrackInput[]
}

function normalizeRequiredHttpsUrl(value: unknown, label: string) {
  const url = normalizeOptionalHttpUrl(value, label)

  if (!url) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is required.`,
    })
  }

  if (!url.startsWith("https://")) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must use https.`,
    })
  }

  return url
}

function normalizeFinalIsrc(value: unknown, label: string) {
  const isrc = normalizeIsrc(value)

  if (isrc.startsWith("PENDING-")) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a real ISRC before approval.`,
    })
  }

  return isrc
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const submissionId = normalizeRequiredUuid(event.context.params?.id, "Submission id")
  const body = await readBody<ApproveSubmissionInput>(event)
  const title = normalizeRequiredText(body.title, "Release title")
  const type = normalizeReleaseType(body.type)
  const genre = normalizeGenre(body.genre)
  const upc = normalizeOptionalText(body.upc)
  const coverArtUrl = normalizeRequiredHttpsUrl(body.coverArtUrl, "Final cover art URL")
  const streamingLink = normalizeOptionalHttpUrl(body.streamingLink, "Streaming link")
  const releaseDate = normalizeOptionalIsoDate(body.releaseDate, "Release date")

  if (!releaseDate) {
    throw createError({
      statusCode: 400,
      statusMessage: "Release date is required.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data: submission, error: submissionError } = await supabase
    .from("artist_release_submissions")
    .select("id, release_id, artist_id, status, artists(name, email), releases(title)")
    .eq("id", submissionId)
    .single()

  if (submissionError || !submission) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release submission does not exist.",
    })
  }

  if (submission.status !== "pending_review") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only pending release submissions can be approved.",
    })
  }

  const submissionArtist = firstRelation((submission as any).artists) as { name?: string | null; email?: string | null } | null
  const submissionRelease = firstRelation((submission as any).releases) as { title?: string | null } | null

  const coverAsset = await prepareReleaseCoverAsset(supabase, submission.artist_id, coverArtUrl, submissionArtist?.name)

  const { data: submissionTracks, error: submissionTracksError } = await supabase
    .from("artist_release_submission_tracks")
    .select("id, track_id")
    .eq("submission_id", submissionId)

  if (submissionTracksError) {
    throw createError({
      statusCode: 500,
      statusMessage: submissionTracksError.message,
    })
  }

  const expectedTrackIds = new Set((submissionTracks ?? []).map((track: { track_id: string }) => track.track_id))
  const trackInputs = Array.isArray(body.tracks) ? body.tracks : []

  if (!expectedTrackIds.size || trackInputs.length !== expectedTrackIds.size) {
    throw createError({
      statusCode: 400,
      statusMessage: "Every submitted track needs final approval details.",
    })
  }

  const normalizedTracks = trackInputs.map((track, index) => {
    const trackId = normalizeRequiredUuid(track.trackId, `Track ${index + 1}`)

    if (!expectedTrackIds.has(trackId)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Track ${index + 1} does not belong to this submission.`,
      })
    }

    return {
      trackId,
      title: normalizeRequiredText(track.title, `Track ${index + 1} title`),
      isrc: normalizeFinalIsrc(track.isrc, `Track ${index + 1} ISRC`),
      trackNumber: normalizeOptionalInteger(track.trackNumber, `Track ${index + 1} number`),
      audioPreviewUrl: normalizeRequiredHttpsUrl(track.audioPreviewUrl, `Track ${index + 1} final audio URL`),
      lyrics: normalizeOptionalText(track.lyrics),
      tiktokPreviewStartSeconds: normalizeOptionalInteger(track.tiktokPreviewStartSeconds, `Track ${index + 1} TikTok preview time`),
      versionLine: normalizeOptionalText(track.versionLine),
      containsAiGeneratedElements: track.containsAiGeneratedElements === true,
    }
  })
  const seenIsrcs = new Map<string, string>()

  for (const track of normalizedTracks) {
    const duplicateTrackId = seenIsrcs.get(track.isrc)

    if (duplicateTrackId && duplicateTrackId !== track.trackId) {
      throw createError({
        statusCode: 409,
        statusMessage: `ISRC ${track.isrc} appears on more than one submitted track.`,
      })
    }

    seenIsrcs.set(track.isrc, track.trackId)
    await assertTrackIsrcAvailableForArtist(supabase, submission.artist_id, track.isrc, track.trackId)
  }

  const { error: releaseError } = await supabase
    .from("releases")
    .update({
      title,
      type,
      genre,
      upc,
      cover_art_url: coverAsset.coverArtUrl,
      source_cover_art_url: coverAsset.sourceCoverArtUrl,
      cover_storage_path: coverAsset.coverStoragePath,
      cover_thumb_url: coverAsset.coverThumbUrl,
      cover_thumb_storage_path: coverAsset.coverThumbStoragePath,
      streaming_link: streamingLink,
      release_date: releaseDate,
      status: "draft",
    })
    .eq("id", submission.release_id)

  if (releaseError) {
    throw createError({
      statusCode: isUniqueViolation(releaseError) ? 409 : 500,
      statusMessage: isUniqueViolation(releaseError)
        ? "That UPC is already assigned to another release."
        : releaseError.message,
    })
  }

  for (const track of normalizedTracks) {
    const { error: trackError } = await supabase
      .from("tracks")
      .update({
        title: track.title,
        isrc: track.isrc,
        track_number: track.trackNumber,
        audio_preview_url: track.audioPreviewUrl,
        lyrics: track.lyrics,
        tiktok_preview_start_seconds: track.tiktokPreviewStartSeconds,
        version_line: track.versionLine,
        contains_ai_generated_elements: track.containsAiGeneratedElements,
        status: "draft",
      })
      .eq("id", track.trackId)
      .eq("release_id", submission.release_id)

    if (trackError) {
      throw createError({
        statusCode: isUniqueViolation(trackError) ? 409 : 500,
        statusMessage: isUniqueViolation(trackError)
          ? "That ISRC is already assigned to another track."
          : trackError.message,
      })
    }

    const { error: submissionTrackError } = await supabase
      .from("artist_release_submission_tracks")
      .update({
        final_audio_url: track.audioPreviewUrl,
      })
      .eq("submission_id", submissionId)
      .eq("track_id", track.trackId)

    if (submissionTrackError) {
      throw createError({
        statusCode: 500,
        statusMessage: submissionTrackError.message,
      })
    }
  }

  const adminNotes = normalizeOptionalText(body.adminNotes)
  const { error: reviewError } = await supabase
    .from("artist_release_submissions")
    .update({
      status: "approved",
      final_cover_art_url: coverAsset.coverArtUrl,
      admin_notes: adminNotes,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId)

  if (reviewError) {
    throw createError({
      statusCode: 500,
      statusMessage: reviewError.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "release.submission.approved", "artist_release_submission", submissionId, {
    release_id: submission.release_id,
    artist_id: submission.artist_id,
    track_count: normalizedTracks.length,
  })

  await recordReleaseEvent(supabase, {
    releaseId: submission.release_id,
    eventType: "release_edited",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      submissionId,
      submissionStatus: "approved",
      displayStatus: "scheduled",
    },
  })

  await sendDashboardEmail(event, {
    to: submissionArtist?.email,
    subject: "Your Naad Backstage release was approved",
    preview: `${title} was approved.`,
    title: "Release approved",
    lines: [
      submissionArtist?.name ? `Hi ${submissionArtist.name},` : "Hi,",
      `"${title || submissionRelease?.title || "Your release"}" was approved in Naad Backstage.`,
      adminNotes ? `Admin note: ${adminNotes}` : "You can view the latest release status from your dashboard.",
    ],
    actionLabel: "View releases",
    actionUrl: dashboardEmailUrl(event, "/dashboard/releases"),
  })

  return {
    ok: true,
    releaseId: submission.release_id,
    submissionId,
  }
})
