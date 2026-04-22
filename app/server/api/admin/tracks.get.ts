import { getQuery, createError } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  assertArtistExists,
  assertReleaseExists,
  mapTrackRecord,
  normalizeOptionalUuidQueryParam,
} from "~~/server/utils/catalog"
import type { AdminTrackRecord } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const artistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const releaseId = normalizeOptionalUuidQueryParam(query.releaseId, "Release id")
  const supabase = serverSupabaseServiceRole(event)

  if (artistId) {
    await assertArtistExists(supabase, artistId)
  }

  if (releaseId) {
    await assertReleaseExists(supabase, releaseId)
  }

  let request = supabase
    .from("tracks")
    .select(
      "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, status, created_at, updated_at, releases!inner(artist_id, title)",
    )
    .order("track_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })

  if (artistId) {
    request = request.eq("releases.artist_id", artistId)
  }

  if (releaseId) {
    request = request.eq("release_id", releaseId)
  }

  const { data, error } = await request

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  return {
    tracks: ((data ?? []) as any[]).map((row) => mapTrackRecord(row)) as AdminTrackRecord[],
  }
})
