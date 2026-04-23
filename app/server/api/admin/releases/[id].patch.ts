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

  if (body.coverArtUrl !== undefined) {
    update.cover_art_url = normalizeOptionalHttpUrl(body.coverArtUrl, "Cover art URL")
    changedFields.push("coverArtUrl")
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

  if (!changedFields.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "No release changes were provided.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)

  if (typeof update.artist_id === "string") {
    await assertArtistExists(supabase, update.artist_id)
  }

  const { data, error } = await supabase
    .from("releases")
    .update(update)
    .eq("id", releaseId)
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
