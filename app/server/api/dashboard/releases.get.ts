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
  currentEffectivePeriodMonth,
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

interface ViewerReleaseSplitEntryRow {
  artist_id: string
  role: string
  split_pct: number | string
  release_split_versions: {
    release_id: string
  } | Array<{
    release_id: string
  }> | null
}

interface ViewerTrackSplitEntryRow {
  artist_id: string
  role: string
  split_pct: number | string
  track_split_versions: {
    track_id: string
    release_id: string
  } | Array<{
    track_id: string
    release_id: string
  }> | null
}

interface ViewerEarningReleaseRow {
  release_id: string | null
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

function normalizeReleaseSearch(value: unknown) {
  return String(firstQueryValue(value) ?? "").trim().replace(/\s+/g, " ").slice(0, 180)
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

function splitPct(value: number) {
  return Math.max(0, value).toFixed(2)
}

function contributorSplitTotal(contributors: Array<{ splitPct: number }>) {
  return contributors.reduce((total, contributor) => total + Number(contributor.splitPct ?? 0), 0)
}

function ownerSplitPctForVersion(version: { contributors: Array<{ splitPct: number }> } | null) {
  return splitPct(100 - contributorSplitTotal(version?.contributors ?? []))
}

function viewerContributorsForVersion(
  version: { effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; role: string; splitPct: number }> } | null,
  viewerArtistIds: string[],
) {
  if (!version) {
    return []
  }

  return version.contributors.filter((contributor) => viewerArtistIds.includes(contributor.artistId))
}

function viewerSplitTotalForVersion(
  version: { effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; splitPct: number }> } | null,
  viewerArtistIds: string[],
) {
  const total = (version?.contributors ?? [])
    .filter((contributor) => viewerArtistIds.includes(contributor.artistId))
    .reduce((sum, contributor) => sum + Number(contributor.splitPct ?? 0), 0)

  return total > 0 ? splitPct(total) : null
}

function applicableVersionHistory<T extends { effectivePeriodMonth: string }>(versions: T[]) {
  const currentMonth = currentEffectivePeriodMonth()
  return versions.filter((version) => version.effectivePeriodMonth <= currentMonth)
}

function latestViewerSplitPct(
  versions: Array<{ effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; splitPct: number }> }>,
  viewerArtistIds: string[],
) {
  for (const version of applicableVersionHistory(versions).sort((left, right) => {
    if (left.effectivePeriodMonth !== right.effectivePeriodMonth) {
      return right.effectivePeriodMonth.localeCompare(left.effectivePeriodMonth)
    }

    return right.createdAt.localeCompare(left.createdAt)
  })) {
    const split = viewerSplitTotalForVersion(version, viewerArtistIds)

    if (split) {
      return split
    }
  }

  return null
}

function latestViewerContributors(
  versions: Array<{ effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; role: string; splitPct: number }> }>,
  viewerArtistIds: string[],
) {
  for (const version of applicableVersionHistory(versions).sort((left, right) => {
    if (left.effectivePeriodMonth !== right.effectivePeriodMonth) {
      return right.effectivePeriodMonth.localeCompare(left.effectivePeriodMonth)
    }

    return right.createdAt.localeCompare(left.createdAt)
  })) {
    const contributors = viewerContributorsForVersion(version, viewerArtistIds)

    if (contributors.length) {
      return contributors
    }
  }

  return []
}

function latestStopMonthAfterViewerSplit(
  versions: Array<{ effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string }> }>,
  viewerArtistIds: string[],
) {
  const ordered = applicableVersionHistory(versions).sort((left, right) => {
    if (left.effectivePeriodMonth !== right.effectivePeriodMonth) {
      return left.effectivePeriodMonth.localeCompare(right.effectivePeriodMonth)
    }

    return left.createdAt.localeCompare(right.createdAt)
  })
  let sawViewer = false
  let stopMonth: string | null = null

  for (const version of ordered) {
    const hasViewer = version.contributors.some((contributor) => viewerArtistIds.includes(contributor.artistId))

    if (hasViewer) {
      sawViewer = true
      stopMonth = null
      continue
    }

    if (sawViewer) {
      stopMonth = version.effectivePeriodMonth
    }
  }

  return stopMonth
}

function buildReleaseCollaborationState(input: {
  isOwner: boolean
  releaseHistory: Array<{ effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; role: string; splitPct: number }> }>
  trackHistories: Array<Array<{ effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; role: string; splitPct: number }> }>>
  viewerArtistIds: string[]
}) {
  const currentReleaseVersion = pickApplicableSplitVersion(input.releaseHistory)
  const currentTrackVersions = input.trackHistories
    .map((history) => pickApplicableSplitVersion(history))
    .filter(Boolean) as Array<{ effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; role: string; splitPct: number }> }>
  const currentReleaseViewerContributors = viewerContributorsForVersion(currentReleaseVersion, input.viewerArtistIds)
  const currentTrackViewerContributors = currentTrackVersions.flatMap((version) => viewerContributorsForVersion(version, input.viewerArtistIds))
  const hasCurrentViewerSplit = currentReleaseViewerContributors.length > 0 || currentTrackViewerContributors.length > 0
  const lastSplit =
    latestViewerSplitPct(input.releaseHistory, input.viewerArtistIds)
    ?? latestViewerSplitPct(input.trackHistories.flat(), input.viewerArtistIds)
  const stopMonth =
    latestStopMonthAfterViewerSplit(input.releaseHistory, input.viewerArtistIds)
    ?? latestStopMonthAfterViewerSplit(input.trackHistories.flat(), input.viewerArtistIds)

  return {
    viewerCollaborationStatus: input.isOwner ? "owner" as const : hasCurrentViewerSplit ? "active" as const : "stopped" as const,
    ownerCurrentSplitPct: ownerSplitPctForVersion(currentReleaseVersion),
    viewerCurrentSplitPct: hasCurrentViewerSplit
      ? splitPct((currentReleaseViewerContributors.length ? currentReleaseViewerContributors : currentTrackViewerContributors)
          .reduce((total, contributor) => total + Number(contributor.splitPct ?? 0), 0))
      : null,
    viewerLastSplitPct: lastSplit,
    viewerCollaborationEndedEffectiveMonth: hasCurrentViewerSplit ? null : stopMonth,
  }
}

function buildTrackCollaborationState(input: {
  trackHistory: Array<{ effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; role: string; splitPct: number }> }>
  releaseCurrentVersion: { effectivePeriodMonth: string; createdAt: string; contributors: Array<{ artistId: string; role: string; splitPct: number }> } | null
  viewerArtistIds: string[]
}) {
  const currentTrackVersion = pickApplicableSplitVersion(input.trackHistory)
  const currentVersion = currentTrackVersion ?? input.releaseCurrentVersion
  const currentViewerContributors = viewerContributorsForVersion(currentVersion, input.viewerArtistIds)
  const lastSplit = latestViewerSplitPct(input.trackHistory, input.viewerArtistIds)

  return {
    viewerCollaborationStatus: currentViewerContributors.length ? "active" as const : lastSplit ? "stopped" as const : "none" as const,
    ownerCurrentSplitPct: ownerSplitPctForVersion(currentVersion),
    viewerCurrentSplitPct: viewerSplitTotalForVersion(currentVersion, input.viewerArtistIds),
    viewerLastSplitPct: lastSplit,
    viewerCollaborationEndedEffectiveMonth: currentViewerContributors.length ? null : latestStopMonthAfterViewerSplit(input.trackHistory, input.viewerArtistIds),
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

function normalizeCreditNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function mainArtistNameForRelease(tracks: ArtistReleaseTrack[], fallbackArtistName: string) {
  const seenNames = new Set<string>()
  const names: string[] = []

  for (const track of tracks) {
    const mainCredits = track.credits
      .filter((credit) => credit.roleCode === "Main Artist" && credit.creditedName.trim())
      .sort((left, right) => left.sortOrder - right.sortOrder || left.creditedName.localeCompare(right.creditedName))

    for (const credit of mainCredits) {
      const creditedName = credit.creditedName.trim().replace(/\s+/g, " ")
      const key = normalizeCreditNameKey(creditedName)

      if (!key || seenNames.has(key)) {
        continue
      }

      seenNames.add(key)
      names.push(creditedName)
    }
  }

  return names.length ? names.join(", ") : fallbackArtistName
}

async function loadMainArtistNamesByReleaseIds(
  supabase: SupabaseClient<any>,
  releaseIds: string[],
) {
  const mainArtistNameByReleaseId = new Map<string, string>()

  if (!releaseIds.length) {
    return mainArtistNameByReleaseId
  }

  const trackRows = (await loadTrackRows(supabase, releaseIds)) as TrackRow[]
  const trackIds = trackRows.map((track) => track.id)
  const creditsByTrackId = await loadTrackCreditsByTrackIds(supabase, trackIds)
  const candidateRowsByReleaseId = new Map<string, Array<{
    creditedName: string
    key: string
    trackOrder: number
    trackCreatedAt: string
    trackId: string
    sortOrder: number
    creditId: string
  }>>()

  for (const track of trackRows) {
    for (const credit of creditsByTrackId.get(track.id) ?? []) {
      if (credit.roleCode !== "Main Artist") {
        continue
      }

      const creditedName = credit.creditedName.trim().replace(/\s+/g, " ")
      const key = normalizeCreditNameKey(creditedName)

      if (!key) {
        continue
      }

      const existing = candidateRowsByReleaseId.get(track.release_id) ?? []
      existing.push({
        creditedName,
        key,
        trackOrder: Number(track.track_number ?? Number.MAX_SAFE_INTEGER),
        trackCreatedAt: track.created_at,
        trackId: track.id,
        sortOrder: credit.sortOrder,
        creditId: credit.id,
      })
      candidateRowsByReleaseId.set(track.release_id, existing)
    }
  }

  for (const [releaseId, candidates] of candidateRowsByReleaseId.entries()) {
    const seenNames = new Set<string>()
    const names: string[] = []

    candidates
      .sort((left, right) =>
        left.trackOrder - right.trackOrder
        || left.trackCreatedAt.localeCompare(right.trackCreatedAt)
        || left.trackId.localeCompare(right.trackId)
        || left.sortOrder - right.sortOrder
        || left.creditId.localeCompare(right.creditId),
      )
      .forEach((candidate) => {
        if (seenNames.has(candidate.key)) {
          return
        }

        seenNames.add(candidate.key)
        names.push(candidate.creditedName)
      })

    if (names.length) {
      mainArtistNameByReleaseId.set(releaseId, names.join(", "))
    }
  }

  return mainArtistNameByReleaseId
}

async function applyCatalogListMainArtistNames(
  supabase: SupabaseClient<any>,
  response: ArtistReleasesResponse,
) {
  const releaseIds = response.releases.map((release) => release.id).filter(Boolean)

  if (!releaseIds.length) {
    return response
  }

  const mainArtistNameByReleaseId = await loadMainArtistNamesByReleaseIds(supabase, releaseIds)

  if (!mainArtistNameByReleaseId.size) {
    return response
  }

  return {
    ...response,
    releases: response.releases.map((release) => ({
      ...release,
      artistName: mainArtistNameByReleaseId.get(release.id) ?? release.artistName,
    })),
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const requestedArtistId = normalizeDashboardArtistQuery(query.artistId)
  const requestedReleaseId = normalizeOptionalUuidQueryParam(query.releaseId, "Release id")
  const surface = releaseSurfaceFromQuery(query.surface)
  const requestedPage = normalizeReleasePage(query.page)
  const requestedPageSize = normalizeReleasePageSize(query.pageSize)
  const releaseSearch = normalizeReleaseSearch(query.search)
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
      target_search: releaseSearch,
    })

    throwSupabaseError(error, "Unable to load releases.")

    const response = (data ?? emptyResponse(requestedPageSize)) as ArtistReleasesResponse

    return await applyCatalogListMainArtistNames(supabase, response)
  }

  const viewerArtistNameById = new Map(viewerArtistRows.map((artist) => [artist.id, artist.name]))
  const ownedReleaseRows = (await loadOwnedReleaseRows(supabase, viewerArtistIds)) as ReleaseRow[]
  const currentSplitAccessMonth = `${currentEffectivePeriodMonth()}-01`

  const [viewerReleaseSplitRows, viewerTrackSplitRows, viewerEarningReleaseRows] = await Promise.all([
    fetchAllPages<ViewerReleaseSplitEntryRow>(
      "Unable to load release split access history.",
      (from, to) => supabase
        .from("release_split_version_entries")
        .select("artist_id, role, split_pct, release_split_versions!inner(release_id)")
        .in("artist_id", viewerArtistIds)
        .lte("release_split_versions.effective_period_month", currentSplitAccessMonth)
        .order("artist_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<ViewerTrackSplitEntryRow>(
      "Unable to load track split access history.",
      (from, to) => supabase
        .from("track_split_version_entries")
        .select("artist_id, role, split_pct, track_split_versions!inner(track_id, release_id)")
        .in("artist_id", viewerArtistIds)
        .lte("track_split_versions.effective_period_month", currentSplitAccessMonth)
        .order("artist_id", { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<ViewerEarningReleaseRow>(
      "Unable to load historical release earnings access.",
      (from, to) => supabase
        .from("earnings")
        .select("release_id")
        .in("artist_id", viewerArtistIds)
        .not("release_id", "is", null)
        .order("release_id", { ascending: true })
        .range(from, to),
    ),
  ])

  const releaseById = new Map<string, ReleaseRow>()

  for (const row of ownedReleaseRows) {
    releaseById.set(row.id, row)
  }

  const collaboratorReleaseIds = [
    ...new Set([
      ...viewerReleaseSplitRows
        .map((row) => unwrapJoinRow(row.release_split_versions)?.release_id ?? "")
        .filter(Boolean),
      ...viewerTrackSplitRows
        .map((row) => unwrapJoinRow(row.track_split_versions)?.release_id ?? "")
        .filter(Boolean),
      ...viewerEarningReleaseRows
        .map((row) => row.release_id ?? "")
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

  for (const [releaseId, versions] of releaseSplitHistory.entries()) {
    const currentViewerContributors = viewerContributorsForVersion(pickApplicableSplitVersion(versions), viewerArtistIds)
    const contributors = currentViewerContributors.length
      ? currentViewerContributors
      : latestViewerContributors(versions, viewerArtistIds)

    for (const contributor of contributors) {
      addUniqueRole(viewerRolesByReleaseId, releaseId, `Release: ${contributor.role}`)
    }
  }

  for (const row of trackRows) {
    const versions = trackSplitHistory.get(row.id) ?? []
    const currentViewerContributors = viewerContributorsForVersion(pickApplicableSplitVersion(versions), viewerArtistIds)
    const contributors = currentViewerContributors.length
      ? currentViewerContributors
      : latestViewerContributors(versions, viewerArtistIds)

    for (const contributor of contributors) {
      addUniqueRole(viewerRolesByReleaseId, row.release_id, `Track: ${row.title} / ${contributor.role}`)
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
    const trackCollaborationState = buildTrackCollaborationState({
      trackHistory,
      releaseCurrentVersion,
      viewerArtistIds,
    })
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
      viewerCollaborationStatus: trackCollaborationState.viewerCollaborationStatus,
      ownerCurrentSplitPct: trackCollaborationState.ownerCurrentSplitPct,
      viewerCurrentSplitPct: trackCollaborationState.viewerCurrentSplitPct,
      viewerLastSplitPct: trackCollaborationState.viewerLastSplitPct,
      viewerCollaborationEndedEffectiveMonth: trackCollaborationState.viewerCollaborationEndedEffectiveMonth,
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
      const releaseTracks = tracksByReleaseId.get(release.id) ?? []
      const ownerArtistName = unwrapJoinRow(row.artists)?.name ?? "Unknown artist"
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
      const collaborationState = buildReleaseCollaborationState({
        isOwner,
        releaseHistory,
        trackHistories: releaseTracks.map((track) => trackSplitHistory.get(track.id) ?? []),
        viewerArtistIds,
      })

      return {
        id: release.id,
        artistId: release.artistId,
        artistName: mainArtistNameForRelease(releaseTracks, ownerArtistName),
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
        viewerCollaborationStatus: collaborationState.viewerCollaborationStatus,
        ownerCurrentSplitPct: collaborationState.ownerCurrentSplitPct,
        viewerCurrentSplitPct: collaborationState.viewerCurrentSplitPct,
        viewerLastSplitPct: collaborationState.viewerLastSplitPct,
        viewerCollaborationEndedEffectiveMonth: collaborationState.viewerCollaborationEndedEffectiveMonth,
        viewerRoles: isOwner
          ? [`Owner / ${viewerArtistNameById.get(release.artistId) ?? "Artist"}`]
          : viewerRolesByReleaseId.get(release.id) ?? ["Collaborator"],
        takedownReason: release.takedownReason,
        takedownProofUrls: release.takedownProofUrls,
        canSubmitDraftEdit: isOwner && release.status === "draft" && !pendingRequest && !submission,
        canDeletePendingReview: isOwner && release.status === "draft" && !pendingRequest && submission?.status === "pending_review",
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
        tracks: releaseTracks,
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

