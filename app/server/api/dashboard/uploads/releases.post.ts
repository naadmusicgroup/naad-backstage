import { randomUUID } from "node:crypto"
import { createError, readBody } from "h3"
import { requireArtistProfile } from "~~/server/utils/auth"
import {
  isUniqueViolation,
  mapReleaseRecord,
  normalizeGenre,
  normalizeIsrc,
  normalizeOptionalHttpUrl,
  normalizeOptionalInteger,
  normalizeOptionalIsoDate,
  normalizeOptionalText,
  normalizeReleaseType,
  normalizeRequiredText,
  normalizeRequiredUuid,
  normalizeTrackCreditsInput,
} from "~~/server/utils/catalog"
import { recordReleaseEvent, replaceTrackCredits } from "~~/server/utils/release-lifecycle"
import { prepareReleaseCoverAsset } from "~~/server/utils/release-assets"
import { sendAdminDashboardAlertEmail } from "~~/server/utils/email"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { RELEASE_STORE_OPTIONS, TRACK_WRITER_CREDIT_ROLE_GROUPS, type TrackCreditInput } from "~~/types/catalog"

interface ArtistUploadTrackInput {
  title?: string
  isrc?: string | null
  audioUrl?: string | null
  filename?: string | null
  lyrics?: string | null
  tiktokPreviewStartSeconds?: number | string | null
  versionLine?: string | null
  containsAiGeneratedElements?: boolean | null
  credits?: TrackCreditInput[]
}

interface ArtistUploadReleaseInput {
  artistId?: string
  title?: string
  type?: string
  genre?: string
  releaseDate?: string
  coverArtUrl?: string | null
  stores?: string[]
  notes?: string | null
  tracks?: ArtistUploadTrackInput[]
}

const STORE_OPTION_SET = new Set<string>(RELEASE_STORE_OPTIONS)
const WRITER_ROLE_SET = new Set<string>(TRACK_WRITER_CREDIT_ROLE_GROUPS.flatMap((group) => [...group.roles]))

function normalizeStores(value: unknown) {
  if (!Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Select at least one store.",
    })
  }

  const stores = [...new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))]
    .filter((store) => STORE_OPTION_SET.has(store))

  if (!stores.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Select at least one store.",
    })
  }

  return stores
}

function provisionalIsrc() {
  return `PENDING-${randomUUID()}`
}

function normalizeTrackIsrc(value: unknown) {
  const normalized = String(value ?? "").trim()
  return normalized ? normalizeIsrc(normalized) : provisionalIsrc()
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
      statusMessage: `${label} must use a secure link.`,
    })
  }

  return url
}

function normalizeTiktokPreviewStartSeconds(value: unknown, label: string) {
  const seconds = normalizeOptionalInteger(value, label)

  if (seconds === null) {
    return null
  }

  if (seconds < 0 || seconds > 3599) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be between 0 and 3599 seconds.`,
    })
  }

  return seconds
}

function assertTrackHasWriterName(credits: TrackCreditInput[], trackNumber: number) {
  const hasWriter = credits.some((credit) => WRITER_ROLE_SET.has(credit.roleCode) && String(credit.creditedName ?? "").trim())

  if (!hasWriter) {
    throw createError({
      statusCode: 400,
      statusMessage: `Track ${trackNumber} needs at least one writer name.`,
    })
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const body = await readBody<ArtistUploadReleaseInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const title = normalizeRequiredText(body.title, "Release title")
  const type = normalizeReleaseType(body.type)
  const genre = normalizeGenre(body.genre)
  const releaseDate = normalizeOptionalIsoDate(body.releaseDate, "Release date")
  const requestedCoverArtUrl = normalizeOptionalHttpUrl(body.coverArtUrl, "Cover art")
  const stores = normalizeStores(body.stores)
  const notes = normalizeOptionalText(body.notes)
  const tracks = Array.isArray(body.tracks) ? body.tracks : []
  const supabase = serverSupabaseServiceRole(event)

  if (!releaseDate) {
    throw createError({
      statusCode: 400,
      statusMessage: "Release date is required.",
    })
  }

  if (!requestedCoverArtUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cover art is required.",
    })
  }

  if (!tracks.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Upload at least one audio track.",
    })
  }

  if (tracks.length > 50) {
    throw createError({
      statusCode: 400,
      statusMessage: "A release can include up to 50 uploaded tracks.",
    })
  }

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", artistId)
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .maybeSingle()

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to verify artist release access.",
    })
  }

  if (!artist) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only submit releases for your linked active artist profiles.",
    })
  }

  const coverAsset = await prepareReleaseCoverAsset(supabase, artistId, requestedCoverArtUrl)

  const normalizedTracks = tracks.map((track, index) => {
    const trackTitle = normalizeRequiredText(track.title, `Track ${index + 1} title`)
    const audioPreviewUrl = normalizeRequiredHttpsUrl(track.audioUrl, `Track ${index + 1} audio link`)

    const credits = normalizeTrackCreditsInput(track.credits)

    assertTrackHasWriterName(credits, index + 1)

    return {
      title: trackTitle,
      isrc: normalizeTrackIsrc(track.isrc),
      trackNumber: index + 1,
      audioPreviewUrl,
      filename: normalizeOptionalText(track.filename),
      lyrics: normalizeOptionalText(track.lyrics),
      tiktokPreviewStartSeconds: normalizeTiktokPreviewStartSeconds(track.tiktokPreviewStartSeconds, `Track ${index + 1} TikTok preview time`),
      versionLine: normalizeOptionalText(track.versionLine),
      containsAiGeneratedElements: track.containsAiGeneratedElements === true,
      credits,
    }
  })

  const { data: release, error: releaseError } = await supabase
    .from("releases")
    .insert({
      artist_id: artistId,
      title,
      type,
      genre,
      upc: null,
      cover_art_url: coverAsset.coverArtUrl,
      source_cover_art_url: coverAsset.sourceCoverArtUrl,
      cover_storage_path: coverAsset.coverStoragePath,
      cover_thumb_url: coverAsset.coverThumbUrl,
      cover_thumb_storage_path: coverAsset.coverThumbStoragePath,
      streaming_link: null,
      release_date: releaseDate,
      status: "draft",
    })
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, source_cover_art_url, cover_storage_path, cover_thumb_url, cover_thumb_storage_path, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
    )
    .single()

  if (releaseError || !release) {
    throw createError({
      statusCode: isUniqueViolation(releaseError) ? 409 : 500,
      statusMessage: isUniqueViolation(releaseError)
        ? "That release identifier is already assigned to another release."
        : "Unable to create this release.",
    })
  }

  try {
    const insertedSubmissionTracks: Array<{
      trackId: string
      sourceAudioUrl: string
      sourceFilename: string | null
    }> = []

    for (const track of normalizedTracks) {
      const { data: insertedTrack, error: trackError } = await supabase
        .from("tracks")
        .insert({
          release_id: release.id,
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
        .select("id")
        .single()

      if (trackError || !insertedTrack) {
        throw createError({
          statusCode: isUniqueViolation(trackError) ? 409 : 500,
          statusMessage: isUniqueViolation(trackError)
            ? `Track ${track.trackNumber} has an ISRC that already exists.`
            : `Unable to create track ${track.trackNumber}.`,
        })
      }

      const submittedCredits = track.credits.length
        ? track.credits
        : [
          {
            creditedName: artist.name,
            linkedArtistId: artistId,
            roleCode: "Main Artist",
            sortOrder: 0,
          },
        ]

      await replaceTrackCredits(supabase, {
        trackId: insertedTrack.id,
        credits: submittedCredits,
        profileId: profile.id,
      })

      insertedSubmissionTracks.push({
        trackId: insertedTrack.id,
        sourceAudioUrl: track.audioPreviewUrl,
        sourceFilename: track.filename,
      })
    }

    const { data: submission, error: submissionError } = await supabase
      .from("artist_release_submissions")
      .insert({
        release_id: release.id,
        artist_id: artistId,
        submitted_by: profile.id,
        status: "pending_review",
        source_cover_art_url: coverAsset.sourceCoverArtUrl ?? coverAsset.coverArtUrl ?? requestedCoverArtUrl,
        final_cover_art_url: null,
        target_stores: stores,
        artist_notes: notes,
      })
      .select("id")
      .single()

    if (submissionError || !submission) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to create the release review submission.",
      })
    }

    const { error: submissionTrackError } = await supabase
      .from("artist_release_submission_tracks")
      .insert(insertedSubmissionTracks.map((track) => ({
        submission_id: submission.id,
        track_id: track.trackId,
        source_audio_url: track.sourceAudioUrl,
        final_audio_url: null,
        source_filename: track.sourceFilename,
      })))

    if (submissionTrackError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to create the release review tracks.",
      })
    }

    await recordReleaseEvent(supabase, {
      releaseId: release.id,
      eventType: "release_created",
      actorRole: "artist",
      actorProfileId: profile.id,
      actorArtistId: artistId,
      payload: {
        title,
        type,
        genre,
        status: "pending_review",
        submissionId: submission.id,
        targetStores: stores,
        trackCount: normalizedTracks.length,
        uploadedFilenames: normalizedTracks.map((track) => track.filename).filter(Boolean),
        notes,
      },
    })
  } catch (error) {
    await supabase.from("tracks").delete().eq("release_id", release.id)
    await supabase.from("releases").delete().eq("id", release.id)
    throw error
  }

  await sendAdminDashboardAlertEmail(event, {
    subject: "New release submission in Naad Backstage",
    title: "New release submitted",
    lines: [
      `${artist.name} submitted "${title}" for review.`,
      `${normalizedTracks.length} track(s), ${stores.length} target store(s), release date ${releaseDate}.`,
      notes ? `Artist note: ${notes}` : "Review the submission from the admin releases workspace.",
    ],
    actionPath: "/admin/releases",
    actionLabel: "Review release",
  })

  return {
    ok: true,
    release: mapReleaseRecord(release as any),
    trackCount: normalizedTracks.length,
    storeCount: stores.length,
  }
})
