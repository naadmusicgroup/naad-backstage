import { getQuery, createError } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { assertArtistExists, mapReleaseRecord, normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import type { AdminReleaseRecord } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const artistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const supabase = serverSupabaseServiceRole(event)

  if (artistId) {
    await assertArtistExists(supabase, artistId)
  }

  let request = supabase
    .from("releases")
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at",
    )
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (artistId) {
    request = request.eq("artist_id", artistId)
  }

  const { data, error } = await request

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  return {
    releases: ((data ?? []) as any[]).map((row) => mapReleaseRecord(row)) as AdminReleaseRecord[],
  }
})
