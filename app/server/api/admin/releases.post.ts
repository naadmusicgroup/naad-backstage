import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  isUniqueViolation,
  mapReleaseRecord,
  normalizeGenre,
  normalizeIsrc,
  normalizeOptionalHttpUrl,
  normalizeOptionalInteger,
  normalizeOptionalIsoDate,
  normalizeOptionalText,
  normalizeReleaseStatus,
  normalizeReleaseType,
  normalizeRequiredText,
  normalizeTrackCreditsInput,
  normalizeTrackStatus,
} from "~~/server/utils/catalog"
import { recordReleaseEvent, replaceTrackCredits } from "~~/server/utils/release-lifecycle"
import { prepareReleaseCoverAsset } from "~~/server/utils/release-assets"
import type { CreateReleaseInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<CreateReleaseInput>(event)
  const artistId = body.artistId
  const title = normalizeRequiredText(body.title, "Release title")
  const type = normalizeReleaseType(body.type)
  const genre = normalizeGenre(body.genre)
  const upc = normalizeOptionalText(body.upc)
  const requestedCoverArtUrl = normalizeOptionalHttpUrl(body.coverArtUrl, "Cover art URL")
  const streamingLink = normalizeOptionalHttpUrl(body.streamingLink, "Streaming link")
  const releaseDate = normalizeOptionalIsoDate(body.releaseDate, "Release date")
  const status = normalizeReleaseStatus(body.status, "draft")
  const supabase = serverSupabaseServiceRole(event)

  await assertArtistExists(supabase, artistId)

  const coverAsset = await prepareReleaseCoverAsset(supabase, artistId, requestedCoverArtUrl)

  const { data, error } = await supabase
    .from("releases")
    .insert({
      artist_id: artistId,
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
      status,
      deleted_by: status === "deleted" ? profile.id : null,
    })
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, source_cover_art_url, cover_storage_path, cover_thumb_url, cover_thumb_storage_path, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
    )
    .single()

  if (error) {
    throw createError({
      statusCode: isUniqueViolation(error) ? 409 : 500,
      statusMessage: isUniqueViolation(error)
        ? "That UPC is already assigned to another release."
        : error.message,
    })
  }

  for (const trackInput of body.tracks ?? []) {
    const { data: track, error: trackError } = await supabase
      .from("tracks")
      .insert({
        release_id: data.id,
        title: normalizeRequiredText(trackInput.title, "Track title"),
        isrc: normalizeIsrc(trackInput.isrc),
        track_number: normalizeOptionalInteger(trackInput.trackNumber, "Track number"),
        audio_preview_url: normalizeOptionalHttpUrl(trackInput.audioPreviewUrl, "Audio preview URL"),
        lyrics: normalizeOptionalText(trackInput.lyrics),
        tiktok_preview_start_seconds: normalizeOptionalInteger(trackInput.tiktokPreviewStartSeconds, "TikTok preview time"),
        version_line: normalizeOptionalText(trackInput.versionLine),
        contains_ai_generated_elements: trackInput.containsAiGeneratedElements === true,
        status: normalizeTrackStatus(trackInput.status, "draft"),
      })
      .select("id")
      .single()

    if (trackError) {
      throw createError({
        statusCode: isUniqueViolation(trackError) ? 409 : 500,
        statusMessage: isUniqueViolation(trackError)
          ? "That ISRC is already assigned to another track."
          : trackError.message,
      })
    }

    await replaceTrackCredits(supabase, {
      trackId: track.id,
      credits: normalizeTrackCreditsInput(trackInput.credits),
      profileId: profile.id,
    })
  }

  await logAdminActivity(supabase, profile.id, "release.created", "release", data.id, {
    artist_id: artistId,
    title,
    type,
    genre,
    status,
    track_count: body.tracks?.length ?? 0,
  })

  await recordReleaseEvent(supabase, {
    releaseId: data.id,
    eventType: "release_created",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      title,
      type,
      genre,
      status,
      trackCount: body.tracks?.length ?? 0,
    },
  })

  return {
    ok: true,
    release: mapReleaseRecord(data as any),
  }
})

