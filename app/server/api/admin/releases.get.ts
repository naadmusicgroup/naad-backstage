import { getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { assertArtistExists, mapReleaseRecord, normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import { fetchAllPages } from "~~/server/utils/supabase-pagination"
import type { AdminReleaseRecord } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const artistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const supabase = serverSupabaseServiceRole(event)

  if (artistId) {
    await assertArtistExists(supabase, artistId)
  }

  const rows = await fetchAllPages<any>(
    "Unable to load releases.",
    (from, to) => {
      let request = supabase
        .from("releases")
        .select(
          "id, artist_id, title, type, genre, upc, cover_art_url, source_cover_art_url, cover_storage_path, cover_thumb_url, cover_thumb_storage_path, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at",
        )
        .order("release_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })

      if (artistId) {
        request = request.eq("artist_id", artistId)
      }

      return request.range(from, to)
    },
  )

  return {
    releases: rows.map((row) => mapReleaseRecord(row)) as AdminReleaseRecord[],
  }
})

