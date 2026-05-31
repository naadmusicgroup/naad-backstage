import { getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  assertArtistExists,
  assertReleaseExists,
  mapTrackRecord,
  normalizeOptionalUuidQueryParam,
} from "~~/server/utils/catalog"
import { fetchAllPages } from "~~/server/utils/supabase-pagination"
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

  const rows = await fetchAllPages<any>(
    "Unable to load tracks.",
    (from, to) => {
      let request = supabase
        .from("tracks")
        .select(
          "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, lyrics, tiktok_preview_start_seconds, version_line, contains_ai_generated_elements, status, created_at, updated_at, releases!inner(artist_id, title)",
        )
        .order("track_number", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })

      if (artistId) {
        request = request.eq("releases.artist_id", artistId)
      }

      if (releaseId) {
        request = request.eq("release_id", releaseId)
      }

      return request.range(from, to)
    },
  )

  return {
    tracks: rows.map((row) => mapTrackRecord(row)) as AdminTrackRecord[],
  }
})

