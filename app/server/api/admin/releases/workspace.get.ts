import { createError, getQuery } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  assertArtistExists,
  mapReleaseRecord,
  mapTrackRecord,
  normalizeOptionalUuidQueryParam,
} from "~~/server/utils/catalog"
import {
  loadReleaseChangeRequestsByReleaseIds,
  loadReleaseEventsByReleaseIds,
  loadReleaseSplitHistory,
  loadTrackCreditsByTrackIds,
  loadTrackSplitHistory,
  pickApplicableSplitVersion,
} from "~~/server/utils/release-lifecycle"
import {
  applySubmissionDisplayState,
  loadReleaseSubmissionsByReleaseIds,
} from "~~/server/utils/release-submissions"
import { fetchAllByChunks, fetchAllPages } from "~~/server/utils/supabase-pagination"
import type {
  AdminReleaseCollaboratorRecord,
  AdminReleaseRecord,
  AdminReleaseWorkspaceResponse,
  AdminTrackCreditRecord,
  AdminTrackCollaboratorRecord,
} from "~~/types/catalog"

interface ReleaseRow {
  id: string
  artist_id: string
  title: string
  type: AdminReleaseRecord["type"]
  genre?: string | null
  upc: string | null
  cover_art_url: string | null
  source_cover_art_url?: string | null
  cover_storage_path?: string | null
  cover_thumb_url?: string | null
  cover_thumb_storage_path?: string | null
  streaming_link: string | null
  release_date: string | null
  status?: AdminReleaseRecord["status"] | null
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

interface PendingRequestReleaseRow {
  release_id: string
}

const DEFAULT_PAGE_SIZE = 8
const MAX_PAGE_SIZE = 24
const RELEASE_STATUS_FILTERS = new Set(["draft", "live", "taken_down", "deleted"])
const RELEASE_TYPE_FILTERS = new Set(["single", "ep", "album"])
const RELEASE_DATE_FILTERS = new Set(["all", "upcoming", "past", "this_year", "last_year", "undated", "custom"])
const RELEASE_COLLABORATION_FILTERS = new Set(["all", "solo", "collaborative", "featured", "splits", "pending_request"])
const RELEASE_TRACK_COUNT_FILTERS = new Set(["all", "empty", "single", "multi", "large"])
const ARTIST_CREDIT_ROLE_SET = new Set(["Main Artist", "Featured Artist", "Remixer"])
const FEATURED_CREDIT_ROLE_SET = new Set(["Featured Artist", "Remixer"])

interface WorkspaceFilters {
  artistId: string
  search: string
  status: string
  type: string
  dateFilter: string
  dateFrom: string
  dateTo: string
  collaboration: string
  trackCount: string
}

function normalizePositiveIntegerQueryParam(value: unknown, label: string, defaultValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue
  }

  const numeric = Number(String(value).trim())

  if (!Number.isInteger(numeric) || numeric < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a positive whole number.`,
    })
  }

  return numeric
}

function normalizeTextQueryParam(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value
  return String(rawValue ?? "").trim()
}

function normalizeEnumQueryParam(value: unknown, allowed: Set<string>, label: string, defaultValue = "") {
  const normalized = normalizeTextQueryParam(value)

  if (!normalized || normalized === "all") {
    return defaultValue
  }

  if (!allowed.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is not supported.`,
    })
  }

  return normalized
}

function normalizeSearchQueryParam(value: unknown) {
  return normalizeTextQueryParam(value).replace(/\s+/g, " ").slice(0, 180)
}

function normalizeIsoDateQueryParam(value: unknown, label: string) {
  const normalized = normalizeTextQueryParam(value)

  if (!normalized) {
    return ""
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must use YYYY-MM-DD.`,
    })
  }

  return normalized
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function currentYearDateRange() {
  const year = new Date().getUTCFullYear()
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }
}

function lastYearDateRange() {
  const year = new Date().getUTCFullYear() - 1
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  }
}

function releaseArtistName(row: ReleaseRow) {
  const artist = Array.isArray(row.artists) ? row.artists[0] : row.artists
  return artist?.name ?? ""
}

function normalizeCreditNameKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function mainArtistNameForReleaseTracks(
  tracks: Array<{ credits: AdminTrackCreditRecord[] }>,
  fallbackArtistName: string | null,
) {
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

function mainArtistNameForTrackRows(
  tracks: TrackRow[],
  trackCredits: Map<string, AdminTrackCreditRecord[]>,
  fallbackArtistName: string,
) {
  const seenNames = new Set<string>()
  const names: string[] = []

  for (const track of tracks) {
    const mainCredits = (trackCredits.get(track.id) ?? [])
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

function normalizeSearchTokens(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function matchesSearchFilter(
  row: ReleaseRow,
  tracks: TrackRow[],
  trackCredits: Map<string, AdminTrackCreditRecord[]>,
  search: string,
) {
  const tokens = normalizeSearchTokens(search)

  if (!tokens.length) {
    return true
  }

  const haystack = [
    row.title,
    releaseArtistName(row),
    mainArtistNameForTrackRows(tracks, trackCredits, releaseArtistName(row)),
    row.genre,
    row.upc,
    row.type,
    row.status,
    row.release_date,
    ...tracks.flatMap((track) => [
      track.title,
      track.isrc,
      track.version_line,
      track.status,
      track.track_number === null ? "" : String(track.track_number),
    ]),
    ...tracks.flatMap((track) => (trackCredits.get(track.id) ?? []).flatMap((credit) => [
      credit.creditedName,
      credit.linkedArtistName,
      credit.roleCode,
      credit.displayCredit,
    ])),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  return tokens.every((token) => haystack.includes(token))
}

function matchesTrackCountFilter(tracks: TrackRow[], trackCount: string) {
  if (trackCount === "empty") {
    return tracks.length === 0
  }

  if (trackCount === "single") {
    return tracks.length === 1
  }

  if (trackCount === "multi") {
    return tracks.length > 1
  }

  if (trackCount === "large") {
    return tracks.length >= 7
  }

  return true
}

function creditArtistKey(row: Pick<AdminTrackCollaboratorRecord, "artistId" | "artistName"> | null) {
  if (!row) {
    return ""
  }

  return row.artistId ? `artist:${row.artistId}` : `name:${row.artistName.trim().toLowerCase()}`
}

function releaseHasFeaturedCredits(
  tracks: TrackRow[],
  trackCredits: Map<string, AdminTrackCreditRecord[]>,
) {
  return tracks.some((track) => (trackCredits.get(track.id) ?? []).some((credit) => FEATURED_CREDIT_ROLE_SET.has(credit.roleCode)))
}

function releaseHasMultiArtistCredits(
  row: ReleaseRow,
  tracks: TrackRow[],
  trackCredits: Map<string, AdminTrackCreditRecord[]>,
) {
  const artists = new Set<string>()
  const mainArtistName = releaseArtistName(row).trim().toLowerCase()

  if (row.artist_id) {
    artists.add(`artist:${row.artist_id}`)
  } else if (mainArtistName) {
    artists.add(`name:${mainArtistName}`)
  }

  for (const track of tracks) {
    for (const credit of trackCredits.get(track.id) ?? []) {
      if (!ARTIST_CREDIT_ROLE_SET.has(credit.roleCode)) {
        continue
      }

      const key = credit.linkedArtistId
        ? `artist:${credit.linkedArtistId}`
        : `name:${String(credit.creditedName ?? "").trim().toLowerCase()}`

      if (key !== "name:") {
        artists.add(key)
      }
    }
  }

  return artists.size > 1
}

function splitVersionHasCollaborators(
  mainArtistId: string,
  version: AdminReleaseRecord["splitHistory"][number] | NonNullable<AdminReleaseRecord["tracks"][number]["splitHistory"]>[number] | null,
) {
  if (!version) {
    return false
  }

  const contributorKeys = new Set(version.contributors.map((contributor) => creditArtistKey({
    artistId: contributor.artistId,
    artistName: contributor.artistName,
  })).filter(Boolean))

  return contributorKeys.size > 1 || [...contributorKeys].some((key) => mainArtistId && key !== `artist:${mainArtistId}`)
}

function releaseHasSplitCollaborators(
  row: ReleaseRow,
  tracks: TrackRow[],
  releaseSplitHistory: Map<string, AdminReleaseRecord["splitHistory"]>,
  trackSplitHistory: Map<string, NonNullable<AdminReleaseRecord["tracks"][number]["splitHistory"]>>,
) {
  if (splitVersionHasCollaborators(row.artist_id, pickApplicableSplitVersion(releaseSplitHistory.get(row.id) ?? []))) {
    return true
  }

  return tracks.some((track) => splitVersionHasCollaborators(row.artist_id, pickApplicableSplitVersion(trackSplitHistory.get(track.id) ?? [])))
}

function matchesCollaborationFilter(input: {
  row: ReleaseRow
  tracks: TrackRow[]
  collaboration: string
  pendingRequestReleaseIds: Set<string>
  trackCredits: Map<string, AdminTrackCreditRecord[]>
  releaseSplitHistory: Map<string, AdminReleaseRecord["splitHistory"]>
  trackSplitHistory: Map<string, NonNullable<AdminReleaseRecord["tracks"][number]["splitHistory"]>>
}) {
  if (input.collaboration === "pending_request") {
    return input.pendingRequestReleaseIds.has(input.row.id)
  }

  const hasFeaturedCredits = releaseHasFeaturedCredits(input.tracks, input.trackCredits)
  const hasMultiArtistCredits = releaseHasMultiArtistCredits(input.row, input.tracks, input.trackCredits)
  const hasSplits = releaseHasSplitCollaborators(
    input.row,
    input.tracks,
    input.releaseSplitHistory,
    input.trackSplitHistory,
  )
  const isCollaborative = hasFeaturedCredits || hasMultiArtistCredits || hasSplits

  if (input.collaboration === "featured") {
    return hasFeaturedCredits
  }

  if (input.collaboration === "splits") {
    return hasSplits
  }

  if (input.collaboration === "solo") {
    return !isCollaborative
  }

  if (input.collaboration === "collaborative") {
    return isCollaborative
  }

  return true
}

function rowsByReleaseId(rows: TrackRow[]) {
  const byReleaseId = new Map<string, TrackRow[]>()

  for (const row of rows) {
    const existing = byReleaseId.get(row.release_id) ?? []
    existing.push(row)
    byReleaseId.set(row.release_id, existing)
  }

  return byReleaseId
}

function releaseRowsQuery(
  supabase: SupabaseClient<any>,
  filters: WorkspaceFilters,
  from: number,
  to: number,
) {
  let query = supabase
    .from("releases")
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, source_cover_art_url, cover_storage_path, cover_thumb_url, cover_thumb_storage_path, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
    )
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })

  if (filters.artistId) {
    query = query.eq("artist_id", filters.artistId)
  }

  if (filters.status) {
    query = query.eq("status", filters.status)
  }

  if (filters.type) {
    query = query.eq("type", filters.type)
  }

  if (filters.dateFilter === "undated") {
    query = query.is("release_date", null)
  } else if (filters.dateFilter === "upcoming") {
    query = query.gte("release_date", todayIsoDate())
  } else if (filters.dateFilter === "past") {
    query = query.lt("release_date", todayIsoDate())
  } else if (filters.dateFilter === "this_year") {
    const range = currentYearDateRange()
    query = query.gte("release_date", range.from).lte("release_date", range.to)
  } else if (filters.dateFilter === "last_year") {
    const range = lastYearDateRange()
    query = query.gte("release_date", range.from).lte("release_date", range.to)
  } else if (filters.dateFilter === "custom") {
    if (filters.dateFrom) {
      query = query.gte("release_date", filters.dateFrom)
    }

    if (filters.dateTo) {
      query = query.lte("release_date", filters.dateTo)
    }
  }

  return query.range(from, to)
}

async function loadReleaseRows(
  supabase: SupabaseClient<any>,
  filters: WorkspaceFilters,
) {
  return await fetchAllPages<ReleaseRow>(
    "Unable to load release rows.",
    (from, to) => releaseRowsQuery(supabase, filters, from, to),
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
      .order("track_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  )
}

async function loadPendingRequestReleaseIds(
  supabase: SupabaseClient<any>,
  artistId: string,
) {
  const rows = await fetchAllPages<PendingRequestReleaseRow>(
    "Unable to load pending release requests.",
    (from, to) => {
      let query = supabase
        .from("release_change_requests")
        .select("release_id, releases!inner(artist_id)")
        .eq("status", "pending")
        .order("id", { ascending: true })

      if (artistId) {
        query = query.eq("releases.artist_id", artistId)
      }

      return query.range(from, to)
    },
  )

  return [...new Set(rows.map((row) => row.release_id))]
}

function mapReleaseCurrentCollaborators(
  releaseId: string,
  history: NonNullable<AdminReleaseRecord["splitHistory"]>,
): AdminReleaseCollaboratorRecord[] {
  const current = pickApplicableSplitVersion(history)

  if (!current) {
    return []
  }

  return current.contributors.map((contributor) => ({
    id: `${releaseId}:${current.id}:${contributor.artistId}:${contributor.role}`,
    releaseId,
    artistId: contributor.artistId,
    artistName: contributor.artistName,
    role: contributor.role,
    splitPct: contributor.splitPct,
    createdAt: current.createdAt,
    updatedAt: current.createdAt,
  }))
}

function mapTrackCurrentCollaborators(
  trackId: string,
  releaseId: string,
  trackTitle: string,
  history: NonNullable<NonNullable<AdminReleaseRecord["tracks"]>[number]["splitHistory"]>,
): AdminTrackCollaboratorRecord[] {
  const current = pickApplicableSplitVersion(history)

  if (!current) {
    return []
  }

  return current.contributors.map((contributor) => ({
    id: `${trackId}:${current.id}:${contributor.artistId}:${contributor.role}`,
    trackId,
    releaseId,
    trackTitle,
    artistId: contributor.artistId,
    artistName: contributor.artistName,
    role: contributor.role,
    splitPct: contributor.splitPct,
    createdAt: current.createdAt,
    updatedAt: current.createdAt,
  }))
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const artistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const filters: WorkspaceFilters = {
    artistId,
    search: normalizeSearchQueryParam(query.search),
    status: normalizeEnumQueryParam(query.status, RELEASE_STATUS_FILTERS, "Release status"),
    type: normalizeEnumQueryParam(query.type, RELEASE_TYPE_FILTERS, "Release type"),
    dateFilter: normalizeEnumQueryParam(query.dateFilter, RELEASE_DATE_FILTERS, "Release date filter", "all") || "all",
    dateFrom: normalizeIsoDateQueryParam(query.dateFrom, "Release date from"),
    dateTo: normalizeIsoDateQueryParam(query.dateTo, "Release date to"),
    collaboration: normalizeEnumQueryParam(
      query.collaboration ?? query.collabMode,
      RELEASE_COLLABORATION_FILTERS,
      "Collaboration filter",
      "all",
    ) || "all",
    trackCount: normalizeEnumQueryParam(query.trackCount, RELEASE_TRACK_COUNT_FILTERS, "Track count filter", "all") || "all",
  }
  const requestedPage = normalizePositiveIntegerQueryParam(query.page, "Page", 1)
  const requestedPageSize = Math.min(
    normalizePositiveIntegerQueryParam(query.pageSize, "Page size", DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  )
  const supabase = serverSupabaseServiceRole(event)

  if (artistId) {
    await assertArtistExists(supabase, artistId)
  }

  const [candidateReleaseRows, pendingRequestReleaseIds] = await Promise.all([
    loadReleaseRows(supabase, filters),
    loadPendingRequestReleaseIds(supabase, artistId),
  ])
  const typedCandidateRows = candidateReleaseRows as ReleaseRow[]
  const pendingRequestReleaseIdSet = new Set(pendingRequestReleaseIds)
  const candidateReleaseIds = typedCandidateRows.map((row) => row.id)
  const candidateTrackRows = candidateReleaseIds.length
    ? (await loadTrackRows(supabase, candidateReleaseIds)) as TrackRow[]
    : []
  const candidateTracksByReleaseId = rowsByReleaseId(candidateTrackRows)
  const needsCollaborationData = filters.collaboration !== "all" && filters.collaboration !== "pending_request"
  const needsTrackCreditData = Boolean(filters.search) || needsCollaborationData
  const candidateTrackIds = candidateTrackRows.map((row) => row.id)
  const [filterReleaseSplitHistory, filterTrackSplitHistory, filterTrackCredits] = needsTrackCreditData
    ? await Promise.all([
        needsCollaborationData
          ? loadReleaseSplitHistory(supabase, candidateReleaseIds)
          : Promise.resolve(new Map<string, AdminReleaseRecord["splitHistory"]>()),
        needsCollaborationData
          ? loadTrackSplitHistory(supabase, candidateTrackIds)
          : Promise.resolve(new Map<string, NonNullable<AdminReleaseRecord["tracks"][number]["splitHistory"]>>()),
        loadTrackCreditsByTrackIds(supabase, candidateTrackIds),
      ])
    : [
        new Map<string, AdminReleaseRecord["splitHistory"]>(),
        new Map<string, NonNullable<AdminReleaseRecord["tracks"][number]["splitHistory"]>>(),
        new Map<string, AdminTrackCreditRecord[]>(),
      ] as const

  const filteredReleaseRows = typedCandidateRows.filter((row) => {
    const tracks = candidateTracksByReleaseId.get(row.id) ?? []

    return matchesSearchFilter(row, tracks, filterTrackCredits, filters.search) &&
      matchesTrackCountFilter(tracks, filters.trackCount) &&
      matchesCollaborationFilter({
        row,
        tracks,
        collaboration: filters.collaboration,
        pendingRequestReleaseIds: pendingRequestReleaseIdSet,
        trackCredits: filterTrackCredits,
        releaseSplitHistory: filterReleaseSplitHistory,
        trackSplitHistory: filterTrackSplitHistory,
      })
  })

  const totalCount = filteredReleaseRows.length
  const totalPages = Math.max(1, Math.ceil(totalCount / requestedPageSize))
  const page = Math.min(requestedPage, totalPages)
  const pageStart = (page - 1) * requestedPageSize
  const pageEnd = pageStart + requestedPageSize
  const pagination = {
    page,
    pageSize: requestedPageSize,
    totalCount,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  }

  const typedReleaseRows = filteredReleaseRows.slice(pageStart, pageEnd)
  const releaseIds = typedReleaseRows.map((row) => row.id)

  const [releaseRequests, pendingRequestMap] = await Promise.all([
    loadReleaseChangeRequestsByReleaseIds(supabase, releaseIds),
    loadReleaseChangeRequestsByReleaseIds(supabase, pendingRequestReleaseIds),
  ])

  const pendingRequests = [...pendingRequestMap.values()]
    .flat()
    .filter((request) => request.status === "pending")
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  if (!releaseIds.length) {
    return {
      releases: [],
      pendingRequests,
      pagination,
    } satisfies AdminReleaseWorkspaceResponse
  }

  const releaseIdSet = new Set(releaseIds)
  const trackRows = candidateTrackRows.filter((row) => releaseIdSet.has(row.release_id))
  const trackIds = trackRows.map((row) => row.id)
  const [releaseSplitHistory, trackSplitHistory, trackCredits, releaseEvents, releaseSubmissions] =
    await Promise.all([
      loadReleaseSplitHistory(supabase, releaseIds),
      loadTrackSplitHistory(supabase, trackIds),
      loadTrackCreditsByTrackIds(supabase, trackIds),
      loadReleaseEventsByReleaseIds(supabase, releaseIds),
      loadReleaseSubmissionsByReleaseIds(supabase, releaseIds),
    ])

  const tracksByReleaseId = new Map<string, AdminReleaseRecord["tracks"]>()

  for (const row of trackRows) {
    const track = mapTrackRecord(row as any)
    track.credits = trackCredits.get(track.id) ?? []
    track.splitHistory = trackSplitHistory.get(track.id) ?? []
    track.collaborators = mapTrackCurrentCollaborators(track.id, track.releaseId, track.title, track.splitHistory)

    const existing = tracksByReleaseId.get(track.releaseId) ?? []
    existing.push(track)
    tracksByReleaseId.set(track.releaseId, existing)
  }

  const releases = typedReleaseRows.map((row) => {
    const release = mapReleaseRecord(row as any)
    const fallbackArtistName = release.artistName ?? (releaseArtistName(row) || null)

    release.tracks = tracksByReleaseId.get(release.id) ?? []
    release.artistName = mainArtistNameForReleaseTracks(release.tracks, fallbackArtistName)
    release.splitHistory = releaseSplitHistory.get(release.id) ?? []
    release.collaborators = mapReleaseCurrentCollaborators(release.id, release.splitHistory)
    release.events = releaseEvents.get(release.id) ?? []
    release.currentRequest =
      (releaseRequests.get(release.id) ?? []).find((request) => request.status === "pending") ??
      (releaseRequests.get(release.id) ?? [])[0] ??
      null
    return applySubmissionDisplayState(release, releaseSubmissions.get(release.id) ?? null)
  })

  return {
    releases,
    pendingRequests,
    pagination,
  } satisfies AdminReleaseWorkspaceResponse
})

