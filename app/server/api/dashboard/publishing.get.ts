import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import {
  emptyArtistPublishingResponse,
  loadArtistDefaultPublishingWriter,
  loadArtistWriterOptions,
  loadCatalogTrackOptions,
  mapRegistrationTrack,
  summarizePublishingTracks,
  type RegistrationTrackRow,
} from "~~/server/utils/publishing-registration"
import type { ArtistPublishingResponse } from "~~/types/publishing"

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "publishing")
  const artistIds = scope.artistIds
  const supabase = serverSupabaseServiceRole(event)

  if (!artistIds.length) {
    return emptyArtistPublishingResponse()
  }

  const [trackResult, writerOptions, catalogTrackOptions, defaultWriter] = await Promise.all([
    supabase
      .from("publishing_registration_tracks")
      .select(
        "id, batch_id, artist_id, track_id, release_id, source, status, song_title, performer_name, spotify_url, submitted_by, reviewed_by, reviewed_at, admin_notes, created_at, updated_at, artists(id, name), tracks(id, title, isrc, releases(id, title)), releases(id, title), submitted_profile:profiles!publishing_registration_tracks_submitted_by_fkey(id, full_name), reviewed_profile:profiles!publishing_registration_tracks_reviewed_by_fkey(id, full_name), publishing_registration_batches(id, source, artist_notes, admin_notes), publishing_registration_track_writers(id, writer_id, role, share_pct, collect_royalties, sort_order, publishing_writers(id, full_name, first_name, middle_name, last_name, ipi_number, pro_name, is_active, archived_at, archived_by, created_at, updated_at))",
      )
      .in("artist_id", artistIds)
      .order("created_at", { ascending: false }),
    loadArtistWriterOptions(supabase, artistIds),
    loadCatalogTrackOptions(supabase, artistIds),
    loadArtistDefaultPublishingWriter(supabase, artistIds),
  ])

  if (trackResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load publishing registrations.",
    })
  }

  const tracks = ((trackResult.data ?? []) as unknown as RegistrationTrackRow[]).map(mapRegistrationTrack)

  return {
    tracks,
    summary: summarizePublishingTracks(tracks),
    writerOptions,
    catalogTrackOptions,
    defaultWriter,
  } satisfies ArtistPublishingResponse
})
