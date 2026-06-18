import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  assertTrackIsrcAvailableForArtist,
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

  const artist = await assertArtistExists(supabase, artistId)

  const coverAsset = await prepareReleaseCoverAsset(supabase, artistId, requestedCoverArtUrl, artist.name)
  const normalizedTracks = (body.tracks ?? []).map((trackInput, index) => ({
    title: normalizeRequiredText(trackInput.title, `Track ${index + 1} title`),
    isrc: normalizeIsrc(trackInput.isrc),
    trackNumber: normalizeOptionalInteger(trackInput.trackNumber, `Track ${index + 1} number`),
    audioPreviewUrl: normalizeOptionalHttpUrl(trackInput.audioPreviewUrl, `Track ${index + 1} audio preview URL`),
    lyrics: normalizeOptionalText(trackInput.lyrics),
    tiktokPreviewStartSeconds: normalizeOptionalInteger(trackInput.tiktokPreviewStartSeconds, `Track ${index + 1} TikTok preview time`),
    versionLine: normalizeOptionalText(trackInput.versionLine),
    containsAiGeneratedElements: trackInput.containsAiGeneratedElements === true,
    status: normalizeTrackStatus(trackInput.status, "draft"),
    credits: normalizeTrackCreditsInput(trackInput.credits),
  }))
  const seenIsrcs = new Set<string>()

  for (const track of normalizedTracks) {
    if (seenIsrcs.has(track.isrc)) {
      throw createError({
        statusCode: 409,
        statusMessage: `ISRC ${track.isrc} appears more than once in this release.`,
      })
    }

    seenIsrcs.add(track.isrc)
    await assertTrackIsrcAvailableForArtist(supabase, artistId, track.isrc)
  }

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

  for (const trackInput of normalizedTracks) {
    const { data: track, error: trackError } = await supabase
      .from("tracks")
      .insert({
        release_id: data.id,
        title: trackInput.title,
        isrc: trackInput.isrc,
        track_number: trackInput.trackNumber,
        audio_preview_url: trackInput.audioPreviewUrl,
        lyrics: trackInput.lyrics,
        tiktok_preview_start_seconds: trackInput.tiktokPreviewStartSeconds,
        version_line: trackInput.versionLine,
        contains_ai_generated_elements: trackInput.containsAiGeneratedElements,
        status: trackInput.status,
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
      credits: trackInput.credits,
      profileId: profile.id,
    })
  }

  await logAdminActivity(supabase, profile.id, "release.created", "release", data.id, {
    artist_id: artistId,
    title,
    type,
    genre,
    status,
    track_count: normalizedTracks.length,
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
      trackCount: normalizedTracks.length,
    },
  })

  return {
    ok: true,
    release: mapReleaseRecord(data as any),
  }
})

