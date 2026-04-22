import { createError, getQuery } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireArtistProfile } from "~~/server/utils/auth"
import {
  isMissingSchemaError,
  mapReleaseRecord,
  mapTrackRecord,
  normalizeOptionalUuidQueryParam,
  unwrapJoinRow,
} from "~~/server/utils/catalog"
import {
  loadReleaseChangeRequestsByReleaseIds,
  loadReleaseEventsByReleaseIds,
  loadReleaseSplitHistory,
  loadTrackCreditsByTrackIds,
  loadTrackSplitHistory,
  pickApplicableSplitVersion,
  summarizeReleaseEvent,
} from "~~/server/utils/release-lifecycle"
import type {
  ArtistReleaseContributor,
  ArtistReleaseItem,
  ArtistReleaseTrack,
  ArtistReleasesResponse,
  ArtistVisibleSplitHistoryItem,
} from "~~/types/dashboard"
import type { AdminReleaseRecord, ReleaseStatus, ReleaseType } from "~~/types/catalog"

interface ArtistRow {
  id: string
  name: string
}

interface ReleaseRow {
  id: string
  artist_id: string
  title: string
  type: ReleaseType
  genre?: string | null
  upc: string | null
  cover_art_url: string | null
  streaming_link: string | null
  release_date: string | null
  status?: ReleaseStatus | null
  is_active?: boolean | null
  takedown_reason?: string | null
  takedown_proof_urls?: string[] | string | null
  takedown_requested_at?: string | null
  takedown_completed_at?: string | null
  created_at: string
  updated_at: string
  artists: { id: string; name: string } | Array<{ id: string; name: string }> | null
}

interface TrackRow {
  id: string
  release_id: string
  title: string
  isrc: string
  track_number: number | null
  duration_seconds: number | null
  audio_preview_url: string | null
  status?: "draft" | "live" | "deleted" | null
  is_active?: boolean | null
  created_at: string
  updated_at: string
  releases: { artist_id: string; title: string } | Array<{ artist_id: string; title: string }> | null
}

interface ReleaseCollaboratorRow {
  release_id: string
  artist_id: string
  role: string
}

interface TrackCollaboratorTrackJoinRow {
  release_id: string
  title: string
}

interface ViewerTrackCollaboratorRow {
  track_id: string
  artist_id: string
  role: string
  tracks: TrackCollaboratorTrackJoinRow | TrackCollaboratorTrackJoinRow[] | null
}

async function loadOwnedReleaseRows(
  supabase: SupabaseClient<any>,
  viewerArtistIds: string[],
) {
  const result = await supabase
    .from("releases")
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
    )
    .in("artist_id", viewerArtistIds)
    .neq("status", "deleted")
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (!result.error) {
    return result.data ?? []
  }

  if (!isMissingSchemaError(result.error)) {
    throw createError({
      statusCode: 500,
      statusMessage: result.error.message,
    })
  }

  const legacyResult = await supabase
    .from("releases")
    .select("id, artist_id, title, type, upc, cover_art_url, streaming_link, release_date, is_active, created_at, updated_at, artists(id, name)")
    .in("artist_id", viewerArtistIds)
    .eq("is_active", true)
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (legacyResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: legacyResult.error.message,
    })
  }

  return legacyResult.data ?? []
}

async function loadCollaboratorReleaseRows(
  supabase: SupabaseClient<any>,
  collaboratorReleaseIds: string[],
) {
  const result = await supabase
    .from("releases")
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
    )
    .in("id", collaboratorReleaseIds)
    .in("status", ["live", "taken_down"])
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (!result.error) {
    return result.data ?? []
  }

  if (!isMissingSchemaError(result.error)) {
    throw createError({
      statusCode: 500,
      statusMessage: result.error.message,
    })
  }

  const legacyResult = await supabase
    .from("releases")
    .select("id, artist_id, title, type, upc, cover_art_url, streaming_link, release_date, is_active, created_at, updated_at, artists(id, name)")
    .in("id", collaboratorReleaseIds)
    .eq("is_active", true)
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (legacyResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: legacyResult.error.message,
    })
  }

  return legacyResult.data ?? []
}

async function loadTrackRows(
  supabase: SupabaseClient<any>,
  releaseIds: string[],
) {
  const result = await supabase
    .from("tracks")
    .select(
      "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, status, created_at, updated_at, releases!inner(artist_id, title)",
    )
    .in("release_id", releaseIds)
    .neq("status", "deleted")
    .order("track_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })

  if (!result.error) {
    return result.data ?? []
  }

  if (!isMissingSchemaError(result.error)) {
    throw createError({
      statusCode: 500,
      statusMessage: result.error.message,
    })
  }

  const legacyResult = await supabase
    .from("tracks")
    .select(
      "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, is_active, created_at, updated_at, releases!inner(artist_id, title)",
    )
    .in("release_id", releaseIds)
    .eq("is_active", true)
    .order("track_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })

  if (legacyResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: legacyResult.error.message,
    })
  }

  return legacyResult.data ?? []
}

function addUniqueRole(target: Map<string, string[]>, releaseId: string, role: string) {
  const existing = target.get(releaseId) ?? []

  if (!existing.includes(role)) {
    existing.push(role)
    target.set(releaseId, existing)
  }
}

function toVisibleContributor(
  row: { artistId: string; artistName: string; role: string; splitPct: number },
  viewerArtistIds: string[],
): ArtistReleaseContributor {
  return {
    artistId: row.artistId,
    name: row.artistName,
    role: row.role,
    visibleSplitPct: viewerArtistIds.includes(row.artistId) ? row.splitPct.toFixed(2) : null,
  }
}

function buildViewerSplitHistory(
  versions: Array<{
    effectivePeriodMonth: string
    createdAt: string
    changeReason: string | null
    contributors: Array<{ artistId: string; role: string; splitPct: number }>
  }>,
  viewerArtistIds: string[],
  scope: "release" | "track",
) {
  const history: ArtistVisibleSplitHistoryItem[] = []

  for (const version of versions) {
    for (const contributor of version.contributors) {
      if (!viewerArtistIds.includes(contributor.artistId)) {
        continue
      }

      history.push({
        scope,
        role: contributor.role,
        splitPct: contributor.splitPct.toFixed(2),
        effectivePeriodMonth: version.effectivePeriodMonth,
        changedAt: version.createdAt,
        changeReason: version.changeReason,
      })
    }
  }

  return history.sort((left, right) => {
    if (left.effectivePeriodMonth !== right.effectivePeriodMonth) {
      return right.effectivePeriodMonth.localeCompare(left.effectivePeriodMonth)
    }

    return right.changedAt.localeCompare(left.changedAt)
  })
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const query = getQuery(event)
  const requestedArtistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const supabase = serverSupabaseServiceRole(event)

  const viewerArtistsResult = await supabase
    .from("artists")
    .select("id, name")
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (viewerArtistsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: viewerArtistsResult.error.message,
    })
  }

  const ownedViewerArtistRows = (viewerArtistsResult.data ?? []) as ArtistRow[]
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

  const ownedReleaseRows = (await loadOwnedReleaseRows(supabase, viewerArtistIds)) as ReleaseRow[]

  const viewerReleaseCollaboratorsResult = await supabase
    .from("release_collaborators")
    .select("release_id, artist_id, role")
    .in("artist_id", viewerArtistIds)

  const viewerTrackCollaboratorsResult = await supabase
    .from("track_collaborators")
    .select("track_id, artist_id, role, tracks!inner(release_id, title)")
    .in("artist_id", viewerArtistIds)

  if (viewerReleaseCollaboratorsResult.error || viewerTrackCollaboratorsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage:
        viewerReleaseCollaboratorsResult.error?.message ??
        viewerTrackCollaboratorsResult.error?.message ??
        "Unable to load collaborator access.",
    })
  }

  const releaseById = new Map<string, ReleaseRow>()

  for (const row of ownedReleaseRows) {
    releaseById.set(row.id, row)
  }

  const viewerReleaseCollaboratorRows = (viewerReleaseCollaboratorsResult.data ?? []) as ReleaseCollaboratorRow[]
  const viewerTrackCollaboratorRows = (viewerTrackCollaboratorsResult.data ?? []) as ViewerTrackCollaboratorRow[]
  const collaboratorReleaseIds = [
    ...new Set([
      ...viewerReleaseCollaboratorRows.map((row) => row.release_id),
      ...viewerTrackCollaboratorRows
        .map((row) => unwrapJoinRow(row.tracks)?.release_id ?? "")
        .filter(Boolean),
    ]),
  ].filter((releaseId) => !releaseById.has(releaseId))

  if (collaboratorReleaseIds.length) {
    for (const row of (await loadCollaboratorReleaseRows(supabase, collaboratorReleaseIds)) as ReleaseRow[]) {
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

  const trackRows = (await loadTrackRows(supabase, releaseIds)) as TrackRow[]
  const trackIds = trackRows.map((track) => track.id)
  const lifecycleSchemaAvailable =
    [...releaseById.values()].some((row) => row.status !== undefined) || trackRows.some((row) => row.status !== undefined)

  const [releaseSplitHistory, trackSplitHistory, trackCredits, releaseEvents, releaseRequests] =
    lifecycleSchemaAvailable
      ? await Promise.all([
          loadReleaseSplitHistory(supabase, releaseIds),
          loadTrackSplitHistory(supabase, trackIds),
          loadTrackCreditsByTrackIds(supabase, trackIds),
          loadReleaseEventsByReleaseIds(supabase, releaseIds),
          loadReleaseChangeRequestsByReleaseIds(supabase, releaseIds),
        ])
      : [
          new Map<string, any[]>(),
          new Map<string, any[]>(),
          new Map<string, any[]>(),
          new Map<string, any[]>(),
          new Map<string, any[]>(),
        ]

  const viewerRolesByReleaseId = new Map<string, string[]>()

  for (const row of viewerReleaseCollaboratorRows) {
    addUniqueRole(viewerRolesByReleaseId, row.release_id, `Release: ${row.role}`)
  }

  for (const row of viewerTrackCollaboratorRows) {
    const track = unwrapJoinRow(row.tracks)

    if (track?.release_id) {
      addUniqueRole(viewerRolesByReleaseId, track.release_id, `Track: ${track.title} / ${row.role}`)
    }
  }

  const releaseCurrentContributorsById = new Map<
    string,
    NonNullable<AdminReleaseRecord["splitHistory"]>[number] | null
  >()

  for (const [releaseId, versions] of releaseSplitHistory.entries()) {
    releaseCurrentContributorsById.set(releaseId, pickApplicableSplitVersion(versions))
  }

  const tracksByReleaseId = new Map<string, ArtistReleaseTrack[]>()

  for (const row of trackRows) {
    const track = mapTrackRecord(row as any)
    const trackHistory = trackSplitHistory.get(track.id) ?? []
    const trackCurrentVersion = pickApplicableSplitVersion(trackHistory)
    const releaseCurrentVersion = releaseCurrentContributorsById.get(track.releaseId) ?? null
    const collaborationSource =
      trackCurrentVersion?.contributors.length
        ? "track"
        : releaseCurrentVersion?.contributors.length
          ? "release"
          : "none"

    const sourceContributors =
      collaborationSource === "track"
        ? trackCurrentVersion?.contributors ?? []
        : releaseCurrentVersion?.contributors ?? []

    const item: ArtistReleaseTrack = {
      id: track.id,
      title: track.title,
      isrc: track.isrc,
      trackNumber: track.trackNumber,
      durationSeconds: track.durationSeconds,
      audioPreviewUrl: track.audioPreviewUrl,
      status: track.status,
      collaborationSource,
      collaborators: sourceContributors.map((contributor: { artistId: string; artistName: string; role: string; splitPct: number }) =>
        toVisibleContributor(contributor, viewerArtistIds),
      ),
      viewerSplitHistory: buildViewerSplitHistory(trackHistory, viewerArtistIds, "track"),
      credits: (trackCredits.get(track.id) ?? []).map((credit) => ({
        creditedName: credit.creditedName,
        linkedArtistName: credit.linkedArtistName,
        roleCode: credit.roleCode,
        instrument: credit.instrument,
        displayCredit: credit.displayCredit,
        notes: credit.notes,
        sortOrder: credit.sortOrder,
      })),
    }

    const existing = tracksByReleaseId.get(track.releaseId) ?? []
    existing.push(item)
    tracksByReleaseId.set(track.releaseId, existing)
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
    .map((row) => {
      const release = mapReleaseRecord(row as any)
      const releaseHistory = releaseSplitHistory.get(release.id) ?? []
      const isOwner = viewerArtistIds.includes(release.artistId)
      const requestHistory = releaseRequests.get(release.id) ?? []
      const pendingRequest = isOwner
        ? requestHistory.find((request) => request.status === "pending") ?? requestHistory[0] ?? null
        : null
      const currentReleaseVersion = pickApplicableSplitVersion(releaseHistory)
      const releaseCollaborators = (currentReleaseVersion?.contributors ?? []).map(
        (contributor: { artistId: string; artistName: string; role: string; splitPct: number }) =>
          toVisibleContributor(contributor, viewerArtistIds),
      )

      return {
        id: release.id,
        artistId: release.artistId,
        artistName: unwrapJoinRow(row.artists)?.name ?? "Unknown artist",
        title: release.title,
        type: release.type,
        status: release.status,
        genre: release.genre,
        upc: release.upc,
        coverArtUrl: release.coverArtUrl,
        streamingLink: release.streamingLink,
        releaseDate: release.releaseDate,
        viewerRelation: isOwner ? "owner" : "collaborator",
        viewerRoles: isOwner
          ? [`Owner / ${viewerArtistNameById.get(release.artistId) ?? "Artist"}`]
          : viewerRolesByReleaseId.get(release.id) ?? ["Collaborator"],
        takedownReason: release.takedownReason,
        takedownProofUrls: release.takedownProofUrls,
        canSubmitDraftEdit: isOwner && release.status === "draft" && !pendingRequest,
        pendingRequest: pendingRequest
          ? {
              id: pendingRequest.id,
              requestType: pendingRequest.requestType,
              status: pendingRequest.status,
              takedownReason: pendingRequest.takedownReason,
              proofUrls: pendingRequest.proofUrls,
              adminNotes: pendingRequest.adminNotes,
              createdAt: pendingRequest.createdAt,
              reviewedAt: pendingRequest.reviewedAt,
            }
          : null,
        releaseCollaborators,
        viewerSplitHistory: buildViewerSplitHistory(releaseHistory, viewerArtistIds, "release"),
        events: (releaseEvents.get(release.id) ?? []).map((record) => ({
          id: record.id,
          eventType: record.eventType,
          actorRole: record.actorRole,
          actorName: record.actorName,
          createdAt: record.createdAt,
          summary: summarizeReleaseEvent(record),
        })),
        tracks: tracksByReleaseId.get(release.id) ?? [],
      } satisfies ArtistReleaseItem
    })

  return {
    releaseCount: releases.length,
    trackCount: releases.reduce((total, release) => total + release.tracks.length, 0),
    ownerReleaseCount: releases.filter((release) => release.viewerRelation === "owner").length,
    collaboratorReleaseCount: releases.filter((release) => release.viewerRelation === "collaborator").length,
    releases,
  } satisfies ArtistReleasesResponse
})
