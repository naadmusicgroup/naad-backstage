import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  isUniqueViolation,
  mapReleaseRecord,
  normalizeGenre,
  normalizeOptionalHttpUrl,
  normalizeOptionalIsoDate,
  normalizeOptionalText,
  normalizeReleaseStatus,
  normalizeReleaseType,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import { recordReleaseEvent } from "~~/server/utils/release-lifecycle"
import { prepareReleaseCoverAsset } from "~~/server/utils/release-assets"
import type { UpdateReleaseInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const releaseId = normalizeRequiredUuid(event.context.params?.id, "Release id")
  const body = await readBody<UpdateReleaseInput>(event)
  const update: Record<string, unknown> = {}
  const changedFields: string[] = []

  if (body.artistId !== undefined) {
    update.artist_id = normalizeRequiredUuid(body.artistId, "Artist")
    changedFields.push("artistId")
  }

  if (body.title !== undefined) {
    update.title = normalizeRequiredText(body.title, "Release title")
    changedFields.push("title")
  }

  if (body.type !== undefined) {
    update.type = normalizeReleaseType(body.type)
    changedFields.push("type")
  }

  if (body.genre !== undefined) {
    update.genre = normalizeGenre(body.genre)
    changedFields.push("genre")
  }

  if (body.upc !== undefined) {
    update.upc = normalizeOptionalText(body.upc)
    changedFields.push("upc")
  }

  if (body.streamingLink !== undefined) {
    update.streaming_link = normalizeOptionalHttpUrl(body.streamingLink, "Streaming link")
    changedFields.push("streamingLink")
  }

  if (body.releaseDate !== undefined) {
    update.release_date = normalizeOptionalIsoDate(body.releaseDate, "Release date")
    changedFields.push("releaseDate")
  }

  if (body.status !== undefined) {
    const status = normalizeReleaseStatus(body.status)
    update.status = status
    update.deleted_by = status === "deleted" ? profile.id : null
    changedFields.push("status")
  }

  const supabase = serverSupabaseServiceRole(event)

  if (typeof update.artist_id === "string") {
    await assertArtistExists(supabase, update.artist_id)
  }

  if (body.coverArtUrl !== undefined) {
    const requestedCoverArtUrl = normalizeOptionalHttpUrl(body.coverArtUrl, "Cover art URL")
    const { data: currentRelease, error: currentReleaseError } = await supabase
      .from("releases")
      .select("artist_id, cover_art_url, source_cover_art_url, cover_storage_path, cover_thumb_url, cover_thumb_storage_path")
      .eq("id", releaseId)
      .single()

    if (currentReleaseError || !currentRelease) {
      throw createError({
        statusCode: 404,
        statusMessage: currentReleaseError?.message || "Release not found.",
      })
    }

    const coverAlreadyPrepared = Boolean(
      requestedCoverArtUrl
      && currentRelease.cover_thumb_url
      && (
        requestedCoverArtUrl === currentRelease.cover_art_url
        || requestedCoverArtUrl === currentRelease.source_cover_art_url
      ),
    )

    if (!coverAlreadyPrepared) {
      const coverArtistId = typeof update.artist_id === "string" ? update.artist_id : currentRelease.artist_id
      const coverAsset = await prepareReleaseCoverAsset(supabase, coverArtistId, requestedCoverArtUrl)

      update.cover_art_url = coverAsset.coverArtUrl
      update.source_cover_art_url = coverAsset.sourceCoverArtUrl
      update.cover_storage_path = coverAsset.coverStoragePath
      update.cover_thumb_url = coverAsset.coverThumbUrl
      update.cover_thumb_storage_path = coverAsset.coverThumbStoragePath
    } else {
      update.cover_art_url = currentRelease.cover_art_url
      update.source_cover_art_url = currentRelease.source_cover_art_url
      update.cover_storage_path = currentRelease.cover_storage_path
      update.cover_thumb_url = currentRelease.cover_thumb_url
      update.cover_thumb_storage_path = currentRelease.cover_thumb_storage_path
    }

    changedFields.push("coverArtUrl")
  }

  if (!changedFields.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No release changes were provided.",
    })
  }

  if (update.status === "live") {
    const { data: submission, error: submissionError } = await supabase
      .from("artist_release_submissions")
      .select("id")
      .eq("release_id", releaseId)
      .maybeSingle()

    if (submissionError) {
      throw createError({
        statusCode: 500,
        statusMessage: submissionError.message,
      })
    }

    if (submission) {
      throw createError({
        statusCode: 409,
        statusMessage: "Artist-submitted releases must be approved and published from the submission workflow.",
      })
    }
  }

  const { data, error } = await supabase
    .from("releases")
    .update(update)
    .eq("id", releaseId)
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

  await logAdminActivity(supabase, profile.id, "release.updated", "release", releaseId, {
    fields: changedFields,
    status: update.status ?? null,
  })

  if (changedFields.includes("genre")) {
    await recordReleaseEvent(supabase, {
      releaseId,
      eventType: "genre_changed",
      actorRole: "admin",
      actorProfileId: profile.id,
      payload: {
        genre: update.genre,
      },
    })
  }

  await recordReleaseEvent(supabase, {
    releaseId,
    eventType: update.status === "deleted" ? "release_deleted" : "release_edited",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      fields: changedFields,
      status: update.status ?? null,
    },
  })

  return {
    ok: true,
    release: mapReleaseRecord(data as any),
  }
})
