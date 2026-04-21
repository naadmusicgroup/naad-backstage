import { createError, getQuery } from "h3"
import { serverSupabaseClient } from "#supabase/server"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import type { ReleaseType } from "~~/types/catalog"
import type {
  ArtistReleaseContributor,
  ArtistReleaseItem,
  ArtistReleaseTrack,
  ArtistReleasesResponse,
} from "~~/types/dashboard"

interface ArtistRow {
  id: string
  name: string
}

interface ReleaseRow {
  id: string
  artist_id: string
  title: string
  type: ReleaseType
  upc: string | null
  cover_art_url: string | null
  streaming_link: string | null
  release_date: string | null
  created_at: string
}

interface TrackRow {
  id: string
  release_id: string
  title: string
  isrc: string
  track_number: number | null
  duration_seconds: number | null
  audio_preview_url: string | null
}

interface ReleaseCollaboratorRow {
  release_id: string
  artist_id: string
  role: string
  split_pct: number | string
}

interface TrackCollaboratorRow {
  track_id: string
  artist_id: string
  role: string
  split_pct: number | string
}

interface TrackJoinRow {
  release_id: string
  title: string
}

interface ViewerTrackCollaboratorRow {
  track_id: string
  artist_id: string
  role: string
  tracks: TrackJoinRow | TrackJoinRow[] | null
}

function unwrapJoinRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value
}

function addUniqueRole(target: Map<string, string[]>, releaseId: string, role: string) {
  const existing = target.get(releaseId) ?? []

  if (!existing.includes(role)) {
    existing.push(role)
    target.set(releaseId, existing)
  }
}

function toVisibleContributor(
  row: { artist_id: string; role: string; split_pct: number | string },
  artistNameById: Map<string, string>,
  viewerArtistIds: string[],
): ArtistReleaseContributor {
  return {
    artistId: row.artist_id,
    name: artistNameById.get(row.artist_id) ?? "Unknown artist",
    role: row.role,
    visibleSplitPct: viewerArtistIds.includes(row.artist_id) ? Number(row.split_pct ?? 0).toFixed(2) : null,
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const query = getQuery(event)
  const requestedArtistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const supabase = await serverSupabaseClient(event)

  const { data: viewerArtists, error: viewerArtistsError } = await supabase
    .from("artists")
    .select("id, name")
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (viewerArtistsError) {
    throw createError({
      statusCode: 500,
      statusMessage: viewerArtistsError.message,
    })
  }

  const ownedViewerArtistRows = (viewerArtists ?? []) as ArtistRow[]
  const ownedViewerArtistIds = ownedViewerArtistRows.map((artist) => artist.id)

  if (requestedArtistId && !ownedViewerArtistIds.includes(requestedArtistId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only load releases for artist profiles on your own account.",
    })
  }

  const viewerArtistRows = requestedArtistId
    ? ownedViewerArtistRows.filter((artist) => artist.id === requestedArtistId)
    : ownedViewerArtistRows
  const viewerArtistIds = viewerArtistRows.map((artist) => artist.id)

  if (!viewerArtistIds.length) {
    return {
      releaseCount: 0,
      trackCount: 0,
      ownerReleaseCount: 0,
      collaboratorReleaseCount: 0,
      releases: [],
    } satisfies ArtistReleasesResponse
  }

  const viewerArtistNameById = new Map(viewerArtistRows.map((artist) => [artist.id, artist.name]))

  const { data: ownedReleaseRows, error: ownedReleasesError } = await supabase
    .from("releases")
    .select("id, artist_id, title, type, upc, cover_art_url, streaming_link, release_date, created_at")
    .in("artist_id", viewerArtistIds)
    .eq("is_active", true)
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (ownedReleasesError) {
    throw createError({
      statusCode: 500,
      statusMessage: ownedReleasesError.message,
    })
  }

  const { data: viewerReleaseCollaboratorRows, error: viewerReleaseCollaboratorError } = await supabase
    .from("release_collaborators")
    .select("release_id, artist_id, role, split_pct")
    .in("artist_id", viewerArtistIds)

  if (viewerReleaseCollaboratorError) {
    throw createError({
      statusCode: 500,
      statusMessage: viewerReleaseCollaboratorError.message,
    })
  }

  const { data: viewerTrackCollaboratorRowsRaw, error: viewerTrackCollaboratorError } = await supabase
    .from("track_collaborators")
    .select("track_id, artist_id, role, tracks!inner(release_id, title)")
    .in("artist_id", viewerArtistIds)

  if (viewerTrackCollaboratorError) {
    throw createError({
      statusCode: 500,
      statusMessage: viewerTrackCollaboratorError.message,
    })
  }

  const releaseById = new Map<string, ReleaseRow>()

  for (const row of (ownedReleaseRows ?? []) as ReleaseRow[]) {
    releaseById.set(row.id, row)
  }

  const viewerReleaseCollaboratorRowsTyped = (viewerReleaseCollaboratorRows ?? []) as ReleaseCollaboratorRow[]
  const viewerTrackCollaboratorRows = (viewerTrackCollaboratorRowsRaw ?? []) as ViewerTrackCollaboratorRow[]
  const collaboratorReleaseIds = viewerReleaseCollaboratorRowsTyped.map((row) => row.release_id)
  const trackCollaboratorReleaseIds = viewerTrackCollaboratorRows
    .map((row) => unwrapJoinRow(row.tracks)?.release_id ?? "")
    .filter(Boolean)
  const missingCollaboratorReleaseIds = [...new Set([...collaboratorReleaseIds, ...trackCollaboratorReleaseIds])]
    .filter((releaseId) => !releaseById.has(releaseId))

  if (missingCollaboratorReleaseIds.length) {
    const { data: collaboratorReleaseRows, error: collaboratorReleasesError } = await supabase
      .from("releases")
      .select("id, artist_id, title, type, upc, cover_art_url, streaming_link, release_date, created_at")
      .in("id", missingCollaboratorReleaseIds)
      .eq("is_active", true)
      .order("release_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (collaboratorReleasesError) {
      throw createError({
        statusCode: 500,
        statusMessage: collaboratorReleasesError.message,
      })
    }

    for (const row of (collaboratorReleaseRows ?? []) as ReleaseRow[]) {
      releaseById.set(row.id, row)
    }
  }

  const releaseIds = [...releaseById.keys()]

  if (!releaseIds.length) {
    return {
      releaseCount: 0,
      trackCount: 0,
      ownerReleaseCount: 0,
      collaboratorReleaseCount: 0,
      releases: [],
    } satisfies ArtistReleasesResponse
  }

  const { data: trackRowsRaw, error: tracksError } = await supabase
    .from("tracks")
    .select("id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url")
    .in("release_id", releaseIds)
    .eq("is_active", true)
    .order("track_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })

  if (tracksError) {
    throw createError({
      statusCode: 500,
      statusMessage: tracksError.message,
    })
  }

  const trackRows = (trackRowsRaw ?? []) as TrackRow[]
  const trackIds = trackRows.map((track) => track.id)

  const { data: releaseCollaboratorRowsRaw, error: releaseCollaboratorsError } = await supabase
    .from("release_collaborators")
    .select("release_id, artist_id, role, split_pct")
    .in("release_id", releaseIds)

  if (releaseCollaboratorsError) {
    throw createError({
      statusCode: 500,
      statusMessage: releaseCollaboratorsError.message,
    })
  }

  let trackCollaboratorRows: TrackCollaboratorRow[] = []

  if (trackIds.length) {
    const { data: trackCollaboratorRowsRaw, error: trackCollaboratorsError } = await supabase
      .from("track_collaborators")
      .select("track_id, artist_id, role, split_pct")
      .in("track_id", trackIds)

    if (trackCollaboratorsError) {
      throw createError({
        statusCode: 500,
        statusMessage: trackCollaboratorsError.message,
      })
    }

    trackCollaboratorRows = (trackCollaboratorRowsRaw ?? []) as TrackCollaboratorRow[]
  }

  const releaseCollaboratorRows = (releaseCollaboratorRowsRaw ?? []) as ReleaseCollaboratorRow[]
  const relatedArtistIds = [
    ...new Set([
      ...releaseIds.map((releaseId) => releaseById.get(releaseId)?.artist_id).filter(Boolean),
      ...releaseCollaboratorRows.map((row) => row.artist_id),
      ...trackCollaboratorRows.map((row) => row.artist_id),
    ]),
  ] as string[]

  const { data: relatedArtists, error: relatedArtistsError } = await supabase
    .from("artists")
    .select("id, name")
    .in("id", relatedArtistIds)

  if (relatedArtistsError) {
    throw createError({
      statusCode: 500,
      statusMessage: relatedArtistsError.message,
    })
  }

  const artistNameById = new Map<string, string>()

  for (const artist of (relatedArtists ?? []) as ArtistRow[]) {
    artistNameById.set(artist.id, artist.name)
  }

  for (const [artistId, artistName] of viewerArtistNameById.entries()) {
    artistNameById.set(artistId, artistName)
  }

  const releaseCollaboratorsByReleaseId = new Map<string, ReleaseCollaboratorRow[]>()

  for (const row of releaseCollaboratorRows) {
    const existing = releaseCollaboratorsByReleaseId.get(row.release_id) ?? []
    existing.push(row)
    releaseCollaboratorsByReleaseId.set(row.release_id, existing)
  }

  const trackCollaboratorsByTrackId = new Map<string, TrackCollaboratorRow[]>()

  for (const row of trackCollaboratorRows) {
    const existing = trackCollaboratorsByTrackId.get(row.track_id) ?? []
    existing.push(row)
    trackCollaboratorsByTrackId.set(row.track_id, existing)
  }

  const tracksByReleaseId = new Map<string, ArtistReleaseTrack[]>()

  for (const row of trackRows) {
    const trackSpecificCollaborators = trackCollaboratorsByTrackId.get(row.id) ?? []
    const releaseFallbackCollaborators = releaseCollaboratorsByReleaseId.get(row.release_id) ?? []
    const collaboratorSource =
      trackSpecificCollaborators.length > 0
        ? "track"
        : releaseFallbackCollaborators.length > 0
          ? "release"
          : "none"

    const sourceRows = collaboratorSource === "track" ? trackSpecificCollaborators : releaseFallbackCollaborators

    const track: ArtistReleaseTrack = {
      id: row.id,
      title: row.title,
      isrc: row.isrc,
      trackNumber: row.track_number,
      durationSeconds: row.duration_seconds,
      audioPreviewUrl: row.audio_preview_url,
      collaborationSource: collaboratorSource,
      collaborators: sourceRows.map((sourceRow) => toVisibleContributor(sourceRow, artistNameById, viewerArtistIds)),
    }

    const existing = tracksByReleaseId.get(row.release_id) ?? []
    existing.push(track)
    tracksByReleaseId.set(row.release_id, existing)
  }

  const viewerRolesByReleaseId = new Map<string, string[]>()

  for (const row of viewerReleaseCollaboratorRowsTyped) {
    addUniqueRole(viewerRolesByReleaseId, row.release_id, `Release: ${row.role}`)
  }

  for (const row of viewerTrackCollaboratorRows) {
    const track = unwrapJoinRow(row.tracks)

    if (track?.release_id) {
      addUniqueRole(viewerRolesByReleaseId, track.release_id, `Track: ${track.title} / ${row.role}`)
    }
  }

  const releases: ArtistReleaseItem[] = [...releaseById.values()]
    .sort((left, right) => {
      const leftDate = left.release_date ?? ""
      const rightDate = right.release_date ?? ""

      if (leftDate !== rightDate) {
        return rightDate.localeCompare(leftDate)
      }

      return right.created_at.localeCompare(left.created_at)
    })
    .map((release) => {
      const isOwner = viewerArtistIds.includes(release.artist_id)

      return {
        id: release.id,
        artistId: release.artist_id,
        artistName: artistNameById.get(release.artist_id) ?? "Unknown artist",
        title: release.title,
        type: release.type,
        upc: release.upc,
        coverArtUrl: release.cover_art_url,
        streamingLink: release.streaming_link,
        releaseDate: release.release_date,
        viewerRelation: isOwner ? "owner" : "collaborator",
        viewerRoles: isOwner
          ? [`Owner / ${viewerArtistNameById.get(release.artist_id) ?? "Artist"}`]
          : viewerRolesByReleaseId.get(release.id) ?? ["Collaborator"],
        releaseCollaborators: (releaseCollaboratorsByReleaseId.get(release.id) ?? []).map((row) =>
          toVisibleContributor(row, artistNameById, viewerArtistIds),
        ),
        tracks: tracksByReleaseId.get(release.id) ?? [],
      }
    })

  return {
    releaseCount: releases.length,
    trackCount: releases.reduce((total, release) => total + release.tracks.length, 0),
    ownerReleaseCount: releases.filter((release) => release.viewerRelation === "owner").length,
    collaboratorReleaseCount: releases.filter((release) => release.viewerRelation === "collaborator").length,
    releases,
  } satisfies ArtistReleasesResponse
})
