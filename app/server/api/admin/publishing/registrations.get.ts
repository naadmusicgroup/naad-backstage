import { createError, getQuery } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  normalizeOptionalText,
  unwrapJoinRow,
} from "~~/server/utils/catalog"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  emptyAdminPublishingRegistrationResponse,
  loadCatalogTrackOptions,
  loadGlobalWriterOptions,
  mapRegistrationTrack,
  normalizeRegistrationArtistQuery,
  normalizeRegistrationSearchQuery,
  normalizeRegistrationStatusQuery,
  normalizeRegistrationWriterQuery,
  summarizePublishingTracks,
  type RegistrationTrackRow,
} from "~~/server/utils/publishing-registration"
import type {
  AdminPublishingRegistrationResponse,
  PublishingArtistOption,
  PublishingRegistrationSource,
} from "~~/types/publishing"

const SOURCE_FILTERS = new Set<PublishingRegistrationSource>(["artist_request", "admin_direct"])

interface ArtistOptionRow {
  id: string
  name: string
  email: string | null
  artist_publishing_info: {
    legal_name: string | null
    ipi_number: string | null
    pro_name: string | null
  } | Array<{
    legal_name: string | null
    ipi_number: string | null
    pro_name: string | null
  }> | null
}

function normalizeSourceQuery(value: unknown) {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? "").trim()

  if (!normalized || normalized === "all") {
    return ""
  }

  if (!SOURCE_FILTERS.has(normalized as PublishingRegistrationSource)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Publishing registration source is not supported.",
    })
  }

  return normalized as PublishingRegistrationSource
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const status = normalizeRegistrationStatusQuery(query.status)
  const artistId = normalizeRegistrationArtistQuery(query.artistId)
  const writerId = normalizeRegistrationWriterQuery(query.writerId)
  const source = normalizeSourceQuery(query.source)
  const search = normalizeRegistrationSearchQuery(query.search)
  const supabase = serverSupabaseServiceRole(event)

  let trackQuery = supabase
    .from("publishing_registration_tracks")
    .select(
        "id, batch_id, artist_id, track_id, release_id, source, status, song_title, performer_name, spotify_url, submitted_by, reviewed_by, reviewed_at, admin_notes, created_at, updated_at, artists(id, name), tracks(id, title, isrc, releases(id, title)), releases(id, title), submitted_profile:profiles!publishing_registration_tracks_submitted_by_fkey(id, full_name), reviewed_profile:profiles!publishing_registration_tracks_reviewed_by_fkey(id, full_name), publishing_registration_batches(id, source, artist_notes, admin_notes), publishing_registration_track_writers(id, writer_id, role, share_pct, collect_royalties, sort_order, publishing_writers(id, full_name, first_name, middle_name, last_name, ipi_number, pro_name, is_active, archived_at, archived_by, created_at, updated_at))",
    )
    .order("created_at", { ascending: false })
    .limit(2000)

  if (status) {
    trackQuery = trackQuery.eq("status", status)
  }

  if (artistId) {
    trackQuery = trackQuery.eq("artist_id", artistId)
  }

  const [trackResult, artistResult, writerOptions, catalogTrackOptions] = await Promise.all([
    trackQuery,
    supabase
      .from("artists")
      .select("id, name, email, artist_publishing_info(legal_name, ipi_number, pro_name)")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(1000),
    loadGlobalWriterOptions(supabase),
    loadCatalogTrackOptions(supabase),
  ])

  if (trackResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load publishing registrations.",
    })
  }

  if (artistResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load artist options.",
    })
  }

  let tracks = ((trackResult.data ?? []) as unknown as RegistrationTrackRow[]).map(mapRegistrationTrack)

  if (source) {
    tracks = tracks.filter((track) => track.batchSource === source)
  }

  if (writerId) {
    tracks = tracks.filter((track) => track.writers.some((writer) => writer.writerId === writerId))
  }

  if (search) {
    const queryText = search.toLowerCase()
    tracks = tracks.filter((track) => [
      track.trackTitle,
      track.performerName,
      track.artistName,
      track.releaseTitle,
      track.spotifyUrl,
      track.adminNotes,
      track.artistNotes,
      track.writers.map((writer) => `${writer.fullName} ${writer.ipiNumber ?? ""} ${writer.proName ?? ""}`).join(" "),
    ].filter(Boolean).join(" ").toLowerCase().includes(queryText))
  }

  const artistOptions = ((artistResult.data ?? []) as ArtistOptionRow[]).map((artist): PublishingArtistOption => {
    const publishingInfo = unwrapJoinRow(artist.artist_publishing_info)
    const fullName = normalizeOptionalText(publishingInfo?.legal_name) ?? ""
    const ipiNumber = normalizeOptionalText(publishingInfo?.ipi_number)
    const proName = normalizeOptionalText(publishingInfo?.pro_name)
    const defaultWriter = fullName || ipiNumber || proName
      ? {
          fullName,
          ipiNumber,
          proName,
        }
      : null

    return {
      value: artist.id,
      label: artist.name,
      meta: artist.email,
      defaultWriter,
    }
  })

  if (!tracks.length && !artistOptions.length && !writerOptions.length) {
    return emptyAdminPublishingRegistrationResponse()
  }

  return {
    tracks,
    summary: summarizePublishingTracks(tracks),
    artistOptions,
    writerOptions,
    catalogTrackOptions,
  } satisfies AdminPublishingRegistrationResponse
})
