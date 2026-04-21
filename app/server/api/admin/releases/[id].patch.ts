import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  isUniqueViolation,
  mapReleaseRecord,
  normalizeBoolean,
  normalizeOptionalHttpUrl,
  normalizeOptionalIsoDate,
  normalizeOptionalText,
  normalizeRequiredUuid,
  normalizeReleaseType,
  normalizeRequiredText,
} from "~~/server/utils/catalog"
import type { UpdateReleaseInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)

  const releaseId = normalizeRequiredUuid(event.context.params?.id, "Release id")

  const body = await readBody<UpdateReleaseInput>(event)
  const update: Record<string, unknown> = {}

  if (body.artistId !== undefined) {
    update.artist_id = normalizeRequiredUuid(body.artistId, "Artist")
  }

  if (body.title !== undefined) {
    update.title = normalizeRequiredText(body.title, "Release title")
  }

  if (body.type !== undefined) {
    update.type = normalizeReleaseType(body.type)
  }

  if (body.upc !== undefined) {
    update.upc = normalizeOptionalText(body.upc)
  }

  if (body.coverArtUrl !== undefined) {
    update.cover_art_url = normalizeOptionalHttpUrl(body.coverArtUrl, "Cover art URL")
  }

  if (body.streamingLink !== undefined) {
    update.streaming_link = normalizeOptionalHttpUrl(body.streamingLink, "Streaming link")
  }

  if (body.releaseDate !== undefined) {
    update.release_date = normalizeOptionalIsoDate(body.releaseDate, "Release date")
  }

  if (body.isActive !== undefined) {
    update.is_active = normalizeBoolean(body.isActive)
  }

  if (!Object.keys(update).length) {
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
    .select("id, artist_id, title, type, upc, cover_art_url, streaming_link, release_date, is_active, created_at, updated_at")
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
    fields: Object.keys(update),
  })

  return {
    ok: true,
    release: mapReleaseRecord(data as any),
  }
})
