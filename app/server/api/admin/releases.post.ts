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
import type { CreateReleaseInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)

  const body = await readBody<CreateReleaseInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const title = normalizeRequiredText(body.title, "Release title")
  const type = normalizeReleaseType(body.type)
  const upc = normalizeOptionalText(body.upc)
  const coverArtUrl = normalizeOptionalHttpUrl(body.coverArtUrl, "Cover art URL")
  const streamingLink = normalizeOptionalHttpUrl(body.streamingLink, "Streaming link")
  const releaseDate = normalizeOptionalIsoDate(body.releaseDate, "Release date")
  const isActive = normalizeBoolean(body.isActive, true)
  const supabase = serverSupabaseServiceRole(event)

  await assertArtistExists(supabase, artistId)

  const { data, error } = await supabase
    .from("releases")
    .insert({
      artist_id: artistId,
      title,
      type,
      upc,
      cover_art_url: coverArtUrl,
      streaming_link: streamingLink,
      release_date: releaseDate,
      is_active: isActive,
    })
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

  await logAdminActivity(supabase, profile.id, "release.created", "release", data.id, {
    artist_id: artistId,
    title,
    type,
    upc,
  })

  return {
    ok: true,
    release: mapReleaseRecord(data as any),
  }
})
