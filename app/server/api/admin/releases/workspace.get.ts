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

async function countReleaseRows(
  supabase: SupabaseClient<any>,
  artistId: string,
) {
  let query = supabase.from("releases").select("id", { count: "exact", head: true })

  if (artistId) {
    query = query.eq("artist_id", artistId)
  }

  const result = await query

  if (result.error) {
    throw createError({
      statusCode: 500,
      statusMessage: result.error.message,
    })
  }

  return result.count ?? 0
}

async function loadReleaseRows(
  supabase: SupabaseClient<any>,
  artistId: string,
  page: number,
  pageSize: number,
) {
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from("releases")
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, source_cover_art_url, cover_storage_path, cover_thumb_url, cover_thumb_storage_path, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
    )
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })

  if (artistId) {
    query = query.eq("artist_id", artistId)
  }

  const result = await query.range(from, to)

  if (result.error) {
    throw createError({
      statusCode: 500,
      statusMessage: result.error.message,
    })
  }

  return result.data ?? []
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
  const requestedPage = normalizePositiveIntegerQueryParam(query.page, "Page", 1)
  const requestedPageSize = Math.min(
    normalizePositiveIntegerQueryParam(query.pageSize, "Page size", DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  )
  const supabase = serverSupabaseServiceRole(event)

  if (artistId) {
    await assertArtistExists(supabase, artistId)
  }

  const totalCount = await countReleaseRows(supabase, artistId)
  const totalPages = Math.max(1, Math.ceil(totalCount / requestedPageSize))
  const page = Math.min(requestedPage, totalPages)
  const pagination = {
    page,
    pageSize: requestedPageSize,
    totalCount,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  }

  const [releaseRows, pendingRequestReleaseIds] = await Promise.all([
    loadReleaseRows(supabase, artistId, page, requestedPageSize),
    loadPendingRequestReleaseIds(supabase, artistId),
  ])

  const typedReleaseRows = releaseRows as ReleaseRow[]
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

  const trackRows = (await loadTrackRows(supabase, releaseIds)) as TrackRow[]
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
    release.tracks = tracksByReleaseId.get(release.id) ?? []
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

