import { createError, getQuery } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  assertArtistExists,
  isMissingSchemaError,
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
  streaming_link: string | null
  release_date: string | null
  status?: AdminReleaseRecord["status"] | null
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

async function loadReleaseRows(
  supabase: SupabaseClient<any>,
  artistId: string,
) {
  let releasesQuery = supabase
    .from("releases")
    .select(
      "id, artist_id, title, type, genre, upc, cover_art_url, streaming_link, release_date, status, takedown_reason, takedown_proof_urls, takedown_requested_at, takedown_completed_at, created_at, updated_at, artists(id, name)",
    )
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (artistId) {
    releasesQuery = releasesQuery.eq("artist_id", artistId)
  }

  const releasesResult = await releasesQuery

  if (!releasesResult.error) {
    return releasesResult.data ?? []
  }

  if (!isMissingSchemaError(releasesResult.error)) {
    throw createError({
      statusCode: 500,
      statusMessage: releasesResult.error.message,
    })
  }

  let legacyQuery = supabase
    .from("releases")
    .select("id, artist_id, title, type, upc, cover_art_url, streaming_link, release_date, is_active, created_at, updated_at, artists(id, name)")
    .order("release_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })

  if (artistId) {
    legacyQuery = legacyQuery.eq("artist_id", artistId)
  }

  const legacyResult = await legacyQuery

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
  const tracksResult = await supabase
    .from("tracks")
    .select(
      "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, status, created_at, updated_at, releases!inner(artist_id, title)",
    )
    .in("release_id", releaseIds)
    .order("track_number", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })

  if (!tracksResult.error) {
    return tracksResult.data ?? []
  }

  if (!isMissingSchemaError(tracksResult.error)) {
    throw createError({
      statusCode: 500,
      statusMessage: tracksResult.error.message,
    })
  }

  const legacyResult = await supabase
    .from("tracks")
    .select(
      "id, release_id, title, isrc, track_number, duration_seconds, audio_preview_url, is_active, created_at, updated_at, releases!inner(artist_id, title)",
    )
    .in("release_id", releaseIds)
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
  const supabase = serverSupabaseServiceRole(event)

  if (artistId) {
    await assertArtistExists(supabase, artistId)
  }

  const releaseRows = (await loadReleaseRows(supabase, artistId)) as ReleaseRow[]
  const releaseIds = releaseRows.map((row) => row.id)

  if (!releaseIds.length) {
    return {
      releases: [],
      pendingRequests: [],
    } satisfies AdminReleaseWorkspaceResponse
  }

  const trackRows = (await loadTrackRows(supabase, releaseIds)) as TrackRow[]
  const trackIds = trackRows.map((row) => row.id)

  const [releaseSplitHistory, trackSplitHistory, trackCredits, releaseEvents, releaseRequests] = await Promise.all([
    loadReleaseSplitHistory(supabase, releaseIds),
    loadTrackSplitHistory(supabase, trackIds),
    loadTrackCreditsByTrackIds(supabase, trackIds),
    loadReleaseEventsByReleaseIds(supabase, releaseIds),
    loadReleaseChangeRequestsByReleaseIds(supabase, releaseIds),
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

  const releases = releaseRows.map((row) => {
    const release = mapReleaseRecord(row as any)
    release.tracks = tracksByReleaseId.get(release.id) ?? []
    release.splitHistory = releaseSplitHistory.get(release.id) ?? []
    release.collaborators = mapReleaseCurrentCollaborators(release.id, release.splitHistory)
    release.events = releaseEvents.get(release.id) ?? []
    release.currentRequest =
      (releaseRequests.get(release.id) ?? []).find((request) => request.status === "pending") ??
      (releaseRequests.get(release.id) ?? [])[0] ??
      null
    return release
  })

  return {
    releases,
    pendingRequests: releases
      .flatMap((release) => (releaseRequests.get(release.id) ?? []).filter((request) => request.status === "pending"))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  } satisfies AdminReleaseWorkspaceResponse
})
