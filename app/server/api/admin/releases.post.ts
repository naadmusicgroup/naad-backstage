import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
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
import type { CreateReleaseInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<CreateReleaseInput>(event)
  const artistId = body.artistId
  const title = normalizeRequiredText(body.title, "Release title")
  const type = normalizeReleaseType(body.type)
  const genre = normalizeGenre(body.genre)
  const upc = normalizeOptionalText(body.upc)
  const coverArtUrl = normalizeOptionalHttpUrl(body.coverArtUrl, "Cover art URL")
  const streamingLink = normalizeOptionalHttpUrl(body.streamingLink, "Streaming link")
  const releaseDate = normalizeOptionalIsoDate(body.releaseDate, "Release date")
  const status = normalizeReleaseStatus(body.status, "draft")
  const supabase = serverSupabaseServiceRole(event)

  await assertArtistExists(supabase, artistId)

  const { data, error } = await supabase
    .from("releases")
    .insert({
      artist_id: artistId,
      title,
      type,
      genre,
      upc,
      cover_art_url: coverArtUrl,
      streaming_link: streamingLink,
      release_date: releaseDate,
      status,
      deleted_by: status === "deleted" ? profile.id : null,
    })
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
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
