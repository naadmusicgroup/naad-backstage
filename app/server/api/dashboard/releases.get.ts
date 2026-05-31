import { getQuery } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  mapReleaseRecord,
  mapTrackRecord,
  normalizeOptionalUuidQueryParam,
  unwrapJoinRow,
} from "~~/server/utils/catalog"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import {
  loadReleaseChangeRequestsByReleaseIds,
  loadReleaseEventsByReleaseIds,
  loadReleaseSplitHistory,
  loadTrackCreditsByTrackIds,
  loadTrackSplitHistory,
  pickApplicableSplitVersion,
  summarizeReleaseEvent,
} from "~~/server/utils/release-lifecycle"
import {
  loadReleaseSubmissionsByReleaseIds,
  releaseDisplayStatus,
} from "~~/server/utils/release-submissions"
import { fetchAllByChunks, fetchAllPages, throwSupabaseError } from "~~/server/utils/supabase-pagination"
import type {
  ArtistReleaseContributor,
  ArtistReleaseItem,
  ArtistReleaseTrack,
  ArtistReleasesResponse,
  ArtistVisibleSplitHistoryItem,
} from "~~/types/dashboard"
import type { AdminReleaseRecord, ReleaseStatus, ReleaseType } from "~~/types/catalog"

interface ReleaseRow {
  id: string
  artist_id: string
  title: string
  type: ReleaseType
  genre?: string | null
  upc: string | null
  cover_art_url: string | null
  source_cover_art_url?: string | null
  cover_storage_path?: string | null
  cover_thumb_url?: string | null
  cover_thumb_storage_path?: string | null
  streaming_link: string | null
  release_date: string | null
  status?: ReleaseStatus | null
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
  lyrics: string | null
  tiktok_preview_start_seconds: number | null
  version_line: string | null
  contains_ai_generated_elements: boolean | null
  status?: "draft" | "live" | "deleted" | null
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

const RELEASES_LIST_PAGE_SIZE = 8

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function releaseSurfaceFromQuery(value: unknown) {
  return String(firstQueryValue(value) ?? "").trim() === "catalog_list" ? "catalog_list" : "full"
}

function normalizeReleasePage(value: unknown) {
  const normalized = firstQueryValue(value)

  if (normalized === undefined || normalized === null || normalized === "") {
    return 1
  }

  const numeric = Number(String(normalized).trim())
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 1
}

function normalizeReleasePageSize(value: unknown) {
  const normalized = firstQueryValue(value)

  if (normalized === undefined || normalized === null || normalized === "") {
    return RELEASES_LIST_PAGE_SIZE
  }

  const numeric = Number(String(normalized).trim())
  return Number.isInteger(numeric) && numeric > 0 ? Math.min(numeric, 48) : RELEASES_LIST_PAGE_SIZE
}

function emptyResponse(pageSize = RELEASES_LIST_PAGE_SIZE): ArtistReleasesResponse {
  return {
    releaseCount: 0,
    trackCount: 0,
    ownerReleaseCount: 0,
    collaboratorReleaseCount: 0,
    releases: [],
    pagination: {
      page: 1,
      pageSize,
      totalCount: 0,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  }
}

async function loadOwnedReleaseRows(
  supabase: SupabaseClient<any>,
  viewerArtistIds: string[],
) {
  return await fetchAllPages<ReleaseRow>(
    "Unable to load owned releases.",
    (from, to) => supabase
      .from("releases")
      .select(
        "id, artist_id, title, type, genre, upc, cover_art_url, source_cover_art_url, cover_storage_path, cover_thumb_url, cover_thumb_storage_path, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
      )
      .in("artist_id", viewerArtistIds)
      .neq("status", "deleted")
      .order("release_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  )
}

async function loadCollaboratorReleaseRows(
  supabase: SupabaseClient<any>,
  collaboratorReleaseIds: string[],
) {
  return await fetchAllByChunks<ReleaseRow, string>(
    collaboratorReleaseIds,
    "Unable to load collaborator releases.",
    (chunk, from, to) => supabase
      .from("releases")
      .select(
        "id, artist_id, title, type, genre, upc, cover_art_url, source_cover_art_url, cover_storage_path, cover_thumb_url, cover_thumb_storage_path, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
      )
      .in("id", chunk)
      .in("status", ["live", "taken_down"])
      .order("release_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
  )
}

async function loadTrackRows(
  supabase: SupabaseClient<any>,
  releaseIds: string[],
) {
  return await fetchAllByChunks<TrackRow, string>(
    releaseIds,
    "Unable to load release tracks.",
    (chunk, from, to) => supabase
      .from("tracks")
      .select(
        "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, lyrics, tiktok_preview_start_seconds, version_line, contains_ai_generated_elements, status, created_at, updated_at, releases!inner(artist_id, title)",
      )
      .in("release_id", chunk)
      .neq("status", "deleted")
      .order("track_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  )
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
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const requestedReleaseId = normalizeOptionalUuidQueryParam(query.releaseId, "Release id")
  const surface = releaseSurfaceFromQuery(query.surface)
  const requestedPage = normalizeReleasePage(query.page)
  const requestedPageSize = normalizeReleasePageSize(query.pageSize)
  const supabase = serverSupabaseServiceRole(event)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "releases")

  const viewerArtistRows = scope.artistRows
  const viewerArtistIds = scope.artistIds

  if (!viewerArtistIds.length) {
    return emptyResponse(requestedPageSize)
  }

  if (surface === "catalog_list") {
    const { data, error } = await supabase.rpc("get_artist_releases_list_payload", {
      target_artist_ids: viewerArtistIds,
      target_page: requestedPage,
      target_page_size: requestedPageSize,
    })

    throwSupabaseError(error, "Unable to load releases.")

    return (data ?? emptyResponse(requestedPageSize)) as ArtistReleasesResponse
  }

  const viewerArtistNameById = new Map(viewerArtistRows.map((artist) => [artist.id, artist.name]))
  const ownedReleaseRows = (await loadOwnedReleaseRows(supabase, viewerArtistIds)) as ReleaseRow[]

  const [viewerReleaseCollaboratorRows, viewerTrackCollaboratorRows] = await Promise.all([
    fetchAllPages<ReleaseCollaboratorRow>(
      "Unable to load release collaborator access.",
      (from, to) => supabase
        .from("release_collaborators")
        .select("release_id, artist_id, role")
        .in("artist_id", viewerArtistIds)
        .order("release_id", { ascending: true })
        .order("artist_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<ViewerTrackCollaboratorRow>(
      "Unable to load track collaborator access.",
      (from, to) => supabase
        .from("track_collaborators")
        .select("track_id, artist_id, role, tracks!inner(release_id, title)")
        .in("artist_id", viewerArtistIds)
        .order("track_id", { ascending: true })
        .order("artist_id", { ascending: true })
        .range(from, to),
    ),
  ])

  const releaseById = new Map<string, ReleaseRow>()

  for (const row of ownedReleaseRows) {
    releaseById.set(row.id, row)
  }

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
    return emptyResponse(requestedPageSize)
  }

  if (requestedReleaseId) {
    if (!releaseById.has(requestedReleaseId)) {
      return emptyResponse(requestedPageSize)
    }

    for (const releaseId of releaseIds) {
      if (releaseId !== requestedReleaseId) {
        releaseById.delete(releaseId)
      }
    }
  }

  const visibleReleaseIds = [...releaseById.keys()]
  const trackRows = (await loadTrackRows(supabase, visibleReleaseIds)) as TrackRow[]
  const trackIds = trackRows.map((track) => track.id)
  const [releaseSplitHistory, trackSplitHistory, trackCredits, releaseEvents, releaseRequests, releaseSubmissions] =
    await Promise.all([
      loadReleaseSplitHistory(supabase, visibleReleaseIds),
      loadTrackSplitHistory(supabase, trackIds),
      loadTrackCreditsByTrackIds(supabase, trackIds),
      loadReleaseEventsByReleaseIds(supabase, visibleReleaseIds),
      loadReleaseChangeRequestsByReleaseIds(supabase, visibleReleaseIds),
      loadReleaseSubmissionsByReleaseIds(supabase, visibleReleaseIds),
    ])

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
    const submissionTrack = releaseSubmissions.get(track.releaseId)?.tracks.find((item) => item.trackId === track.id)

    const item: ArtistReleaseTrack = {
      id: track.id,
      title: track.title,
      isrc: track.isrc,
      trackNumber: track.trackNumber,
      durationSeconds: track.durationSeconds,
      audioPreviewUrl: track.audioPreviewUrl,
      lyrics: track.lyrics,
      tiktokPreviewStartSeconds: track.tiktokPreviewStartSeconds,
      versionLine: track.versionLine,
      containsAiGeneratedElements: track.containsAiGeneratedElements,
      sourceAudioUrl: submissionTrack?.sourceAudioUrl ?? null,
      finalAudioUrl: submissionTrack?.finalAudioUrl ?? null,
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
      const submission = releaseSubmissions.get(release.id) ?? null
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
        coverThumbUrl: release.coverThumbUrl,
        streamingLink: release.streamingLink,
        releaseDate: release.releaseDate,
        displayStatus: releaseDisplayStatus(release.status, submission),
        submissionStatus: submission?.status ?? null,
        submissionAdminNotes: submission?.adminNotes ?? null,
        viewerRelation: isOwner ? "owner" : "collaborator",
        viewerRoles: isOwner
          ? [`Owner / ${viewerArtistNameById.get(release.artistId) ?? "Artist"}`]
          : viewerRolesByReleaseId.get(release.id) ?? ["Collaborator"],
        takedownReason: release.takedownReason,
        takedownProofUrls: release.takedownProofUrls,
        canSubmitDraftEdit: isOwner && release.status === "draft" && !pendingRequest && !submission,
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

