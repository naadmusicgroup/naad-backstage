import type { SupabaseClient } from "@supabase/supabase-js"
import { createError } from "h3"
import type {
  AdminReleaseChangeRequestRecord,
  AdminReleaseEventRecord,
  AdminReleaseSplitVersionRecord,
  AdminTrackCreditRecord,
  AdminTrackSplitVersionRecord,
  ReleaseChangeRequestSnapshot,
  ReleaseChangeRequestType,
  ReleaseEventType,
  SplitVersionContributorRecord,
  SplitVersionSource,
  TrackCreditInput,
  TrackStatus,
} from "~~/types/catalog"
import {
  mapReleaseEventRecord,
  mapTrackCreditRecord,
  normalizeEffectivePeriodMonth,
  normalizeGenre,
  normalizeIsrc,
  normalizeOptionalHttpUrl,
  normalizeOptionalInteger,
  normalizeOptionalIsoDate,
  normalizeOptionalText,
  normalizeReleaseStatus,
  normalizeReleaseType,
  normalizeRequiredSplitPct,
  normalizeRequiredText,
  normalizeTrackCreditsInput,
  normalizeTrackStatus,
  unwrapJoinRow,
} from "~~/server/utils/catalog"

interface SplitVersionRow {
  id: string
  release_id?: string
  track_id?: string
  effective_period_month: string
  change_reason: string | null
  source: SplitVersionSource
  created_by: string | null
  created_at: string
}

interface SplitVersionEntryArtistJoinRow {
  id: string
  name: string
}

interface SplitVersionEntryRow {
  version_id: string
  artist_id: string
  role: string
  split_pct: number | string
  artists: SplitVersionEntryArtistJoinRow | SplitVersionEntryArtistJoinRow[] | null
}

interface TrackCreditArtistJoinRow {
  id: string
  name: string
}

interface TrackCreditRow {
  id: string
  track_id: string
  credited_name: string
  linked_artist_id: string | null
  role_code: string
  instrument: string | null
  display_credit: string | null
  notes: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
  artists: TrackCreditArtistJoinRow | TrackCreditArtistJoinRow[] | null
}

interface ReleaseEventProfileJoinRow {
  id: string
  full_name: string | null
}

interface ReleaseEventArtistJoinRow {
  id: string
  name: string
}

interface ReleaseEventRow {
  id: string
  release_id: string
  event_type: ReleaseEventType
  actor_role: AdminReleaseEventRecord["actorRole"]
  actor_profile_id: string | null
  actor_artist_id: string | null
  payload: Record<string, unknown> | null
  created_at: string
  profiles: ReleaseEventProfileJoinRow | ReleaseEventProfileJoinRow[] | null
  artists: ReleaseEventArtistJoinRow | ReleaseEventArtistJoinRow[] | null
}

interface ReleaseChangeRequestRow {
  id: string
  release_id: string
  requester_artist_id: string
  requested_by: string
  request_type: ReleaseChangeRequestType
  status: AdminReleaseChangeRequestRecord["status"]
  proposed_release: Record<string, unknown> | null
  proposed_tracks: Record<string, unknown>[] | null
  proposed_credits: Record<string, unknown>[] | null
  proposed_genre: string | null
  takedown_reason: string | null
  proof_urls: string[] | string | null
  admin_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  applied_at: string | null
  created_at: string
  updated_at: string
}

interface ArtistLookupRow {
  id: string
  name: string
}

interface ProfileLookupRow {
  id: string
  full_name: string | null
}

interface ApplyDraftTrackInput {
  id?: string
  title?: unknown
  isrc?: unknown
  trackNumber?: unknown
  audioPreviewUrl?: unknown
  status?: unknown
  credits?: unknown
}

function throwIfError(
  error: { code?: string; message: string; details?: string | null; hint?: string | null } | null,
  fallback: string,
) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }

  return undefined
}

function monthLabel(value: string | null | undefined) {
  return value ? value.slice(0, 7) : ""
}

export function currentEffectivePeriodMonth() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}-01`
}

function compareVersionPriority(left: { effectivePeriodMonth: string; createdAt: string }, right: { effectivePeriodMonth: string; createdAt: string }) {
  if (left.effectivePeriodMonth !== right.effectivePeriodMonth) {
    return right.effectivePeriodMonth.localeCompare(left.effectivePeriodMonth)
  }

  return right.createdAt.localeCompare(left.createdAt)
}

export function pickApplicableSplitVersion<T extends { effectivePeriodMonth: string; createdAt: string }>(
  versions: T[],
  targetMonth = currentEffectivePeriodMonth(),
) {
  const ordered = [...versions].sort(compareVersionPriority)
  return ordered.find((version) => version.effectivePeriodMonth <= targetMonth) ?? ordered[0] ?? null
}

function splitContributorFromRow(row: SplitVersionEntryRow): SplitVersionContributorRecord {
  const artist = unwrapJoinRow(row.artists)

  return {
    artistId: row.artist_id,
    artistName: artist?.name ?? "Unknown artist",
    role: row.role,
    splitPct: Number(row.split_pct ?? 0),
  }
}

function sortContributors(left: SplitVersionContributorRecord, right: SplitVersionContributorRecord) {
  if (left.role !== right.role) {
    return left.role.localeCompare(right.role)
  }

  return left.artistName.localeCompare(right.artistName)
}

function normalizeProofUrls(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean)
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map((entry) => String(entry)).filter(Boolean) : []
    } catch {
      return []
    }
  }

  return [] as string[]
}

async function lookupArtistsAndProfiles(
  supabase: SupabaseClient<any>,
  artistIds: string[],
  profileIds: string[],
) {
  const [artistsResult, profilesResult] = await Promise.all([
    artistIds.length
      ? supabase.from("artists").select("id, name").in("id", artistIds)
      : Promise.resolve({ data: [] as ArtistLookupRow[], error: null }),
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as ProfileLookupRow[], error: null }),
  ])

  throwIfError(artistsResult.error, "Unable to load artist names.")
  throwIfError(profilesResult.error, "Unable to load profile names.")

  return {
    artistById: new Map(((artistsResult.data ?? []) as ArtistLookupRow[]).map((row) => [row.id, row.name])),
    profileById: new Map(((profilesResult.data ?? []) as ProfileLookupRow[]).map((row) => [row.id, row.full_name])),
  }
}

export async function loadReleaseSplitHistory(
  supabase: SupabaseClient<any>,
  releaseIds: string[],
) {
  const empty = new Map<string, AdminReleaseSplitVersionRecord[]>()

  if (!releaseIds.length) {
    return empty
  }

  const versionsResult = await supabase
    .from("release_split_versions")
    .select("id, release_id, effective_period_month, change_reason, source, created_by, created_at")
    .in("release_id", releaseIds)
    .order("effective_period_month", { ascending: false })
    .order("created_at", { ascending: false })

  throwIfError(versionsResult.error, "Unable to load release split history.")

  const versionRows = (versionsResult.data ?? []) as SplitVersionRow[]
  const versionIds = versionRows.map((row) => row.id)

  if (!versionIds.length) {
    return empty
  }

  const entriesResult = await supabase
    .from("release_split_version_entries")
    .select("version_id, artist_id, role, split_pct, artists!inner(id, name)")
    .in("version_id", versionIds)

  throwIfError(entriesResult.error, "Unable to load release split contributors.")

  const contributorsByVersionId = new Map<string, SplitVersionContributorRecord[]>()

  for (const row of (entriesResult.data ?? []) as SplitVersionEntryRow[]) {
    const existing = contributorsByVersionId.get(row.version_id) ?? []
    existing.push(splitContributorFromRow(row))
    contributorsByVersionId.set(row.version_id, existing)
  }

  const historyByReleaseId = new Map<string, AdminReleaseSplitVersionRecord[]>()

  for (const row of versionRows) {
    const version: AdminReleaseSplitVersionRecord = {
      id: row.id,
      releaseId: row.release_id ?? "",
      effectivePeriodMonth: monthLabel(row.effective_period_month),
      changeReason: row.change_reason,
      source: row.source,
      createdByProfileId: row.created_by,
      createdAt: row.created_at,
      contributors: (contributorsByVersionId.get(row.id) ?? []).sort(sortContributors),
    }

    const existing = historyByReleaseId.get(version.releaseId) ?? []
    existing.push(version)
    historyByReleaseId.set(version.releaseId, existing)
  }

  return historyByReleaseId
}

export async function loadTrackSplitHistory(
  supabase: SupabaseClient<any>,
  trackIds: string[],
) {
  const empty = new Map<string, AdminTrackSplitVersionRecord[]>()

  if (!trackIds.length) {
    return empty
  }

  const versionsResult = await supabase
    .from("track_split_versions")
    .select("id, track_id, release_id, effective_period_month, change_reason, source, created_by, created_at")
    .in("track_id", trackIds)
    .order("effective_period_month", { ascending: false })
    .order("created_at", { ascending: false })

  throwIfError(versionsResult.error, "Unable to load track split history.")

  const versionIds = ((versionsResult.data ?? []) as SplitVersionRow[]).map((row) => row.id)

  if (!versionIds.length) {
    return empty
  }

  const entriesResult = versionIds.length
    ? await supabase
        .from("track_split_version_entries")
        .select("version_id, artist_id, role, split_pct, artists!inner(id, name)")
        .in("version_id", versionIds)
    : { data: [] as SplitVersionEntryRow[], error: null }

  throwIfError(entriesResult.error, "Unable to load track split contributors.")

  const contributorsByVersionId = new Map<string, SplitVersionContributorRecord[]>()

  for (const row of (entriesResult.data ?? []) as SplitVersionEntryRow[]) {
    const existing = contributorsByVersionId.get(row.version_id) ?? []
    existing.push(splitContributorFromRow(row))
    contributorsByVersionId.set(row.version_id, existing)
  }

  const historyByTrackId = new Map<string, AdminTrackSplitVersionRecord[]>()

  for (const row of (versionsResult.data ?? []) as SplitVersionRow[]) {
    const version: AdminTrackSplitVersionRecord = {
      id: row.id,
      trackId: row.track_id ?? "",
      releaseId: row.release_id ?? "",
      effectivePeriodMonth: monthLabel(row.effective_period_month),
      changeReason: row.change_reason,
      source: row.source,
      createdByProfileId: row.created_by,
      createdAt: row.created_at,
      contributors: (contributorsByVersionId.get(row.id) ?? []).sort(sortContributors),
    }

    const existing = historyByTrackId.get(version.trackId) ?? []
    existing.push(version)
    historyByTrackId.set(version.trackId, existing)
  }

  return historyByTrackId
}

export async function loadTrackCreditsByTrackIds(
  supabase: SupabaseClient<any>,
  trackIds: string[],
) {
  const creditsByTrackId = new Map<string, AdminTrackCreditRecord[]>()

  if (!trackIds.length) {
    return creditsByTrackId
  }

  const result = await supabase
    .from("track_credits")
    .select("id, track_id, credited_name, linked_artist_id, role_code, instrument, display_credit, notes, sort_order, created_at, updated_at, artists(id, name)")
    .in("track_id", trackIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  throwIfError(result.error, "Unable to load track credits.")

  for (const row of (result.data ?? []) as TrackCreditRow[]) {
    const record = mapTrackCreditRecord(row)
    const existing = creditsByTrackId.get(record.trackId) ?? []
    existing.push(record)
    creditsByTrackId.set(record.trackId, existing)
  }

  return creditsByTrackId
}

export async function loadReleaseEventsByReleaseIds(
  supabase: SupabaseClient<any>,
  releaseIds: string[],
) {
  const eventsByReleaseId = new Map<string, AdminReleaseEventRecord[]>()

  if (!releaseIds.length) {
    return eventsByReleaseId
  }

  const result = await supabase
    .from("release_events")
    .select("id, release_id, event_type, actor_role, actor_profile_id, actor_artist_id, payload, created_at, profiles(id, full_name), artists(id, name)")
    .in("release_id", releaseIds)
    .order("created_at", { ascending: false })

  throwIfError(result.error, "Unable to load release events.")

  for (const row of (result.data ?? []) as ReleaseEventRow[]) {
    const record = mapReleaseEventRecord(row)
    const existing = eventsByReleaseId.get(record.releaseId) ?? []
    existing.push(record)
    eventsByReleaseId.set(record.releaseId, existing)
  }

  return eventsByReleaseId
}

export async function loadReleaseChangeRequestsByReleaseIds(
  supabase: SupabaseClient<any>,
  releaseIds: string[],
) {
  const requestsByReleaseId = new Map<string, AdminReleaseChangeRequestRecord[]>()

  if (!releaseIds.length) {
    return requestsByReleaseId
  }

  const result = await supabase
    .from("release_change_requests")
    .select(
      "id, release_id, requester_artist_id, requested_by, request_type, status, proposed_release, proposed_tracks, proposed_credits, proposed_genre, takedown_reason, proof_urls, admin_notes, reviewed_by, reviewed_at, applied_at, created_at, updated_at",
    )
    .in("release_id", releaseIds)
    .order("created_at", { ascending: false })

  throwIfError(result.error, "Unable to load release change requests.")

  const requestRows = (result.data ?? []) as ReleaseChangeRequestRow[]
  const artistIds = [...new Set(requestRows.map((row) => row.requester_artist_id))]
  const profileIds = [
    ...new Set(
      requestRows.flatMap((row) => [row.requested_by, row.reviewed_by].filter(Boolean) as string[]),
    ),
  ]
  const { artistById, profileById } = await lookupArtistsAndProfiles(supabase, artistIds, profileIds)

  for (const row of requestRows) {
    const record: AdminReleaseChangeRequestRecord = {
      id: row.id,
      releaseId: row.release_id,
      requesterArtistId: row.requester_artist_id,
      requesterArtistName: artistById.get(row.requester_artist_id) ?? "Unknown artist",
      requestedByProfileId: row.requested_by,
      requestedByName: profileById.get(row.requested_by) ?? null,
      requestType: row.request_type,
      status: row.status,
      snapshot: {
        release: row.proposed_release ?? {},
        tracks: row.proposed_tracks ?? [],
        credits: row.proposed_credits ?? [],
        genre: row.proposed_genre,
      },
      takedownReason: row.takedown_reason,
      proofUrls: normalizeProofUrls(row.proof_urls),
      adminNotes: row.admin_notes,
      reviewedByProfileId: row.reviewed_by,
      reviewedByName: row.reviewed_by ? (profileById.get(row.reviewed_by) ?? null) : null,
      reviewedAt: row.reviewed_at,
      appliedAt: row.applied_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }

    const existing = requestsByReleaseId.get(record.releaseId) ?? []
    existing.push(record)
    requestsByReleaseId.set(record.releaseId, existing)
  }

  return requestsByReleaseId
}

export async function recordReleaseEvent(
  supabase: SupabaseClient<any>,
  input: {
    releaseId: string
    eventType: ReleaseEventType
    actorRole: AdminReleaseEventRecord["actorRole"]
    actorProfileId?: string | null
    actorArtistId?: string | null
    payload?: Record<string, unknown>
  },
) {
  const { error } = await supabase.from("release_events").insert({
    release_id: input.releaseId,
    event_type: input.eventType,
    actor_role: input.actorRole,
    actor_profile_id: input.actorProfileId ?? null,
    actor_artist_id: input.actorArtistId ?? null,
    payload: input.payload ?? {},
  })

  throwIfError(error, "Unable to record release event.")
}

export async function replaceTrackCredits(
  supabase: SupabaseClient<any>,
  input: {
    trackId: string
    credits: TrackCreditInput[]
    profileId: string | null
  },
) {
  const { error: deleteError } = await supabase.from("track_credits").delete().eq("track_id", input.trackId)
  throwIfError(deleteError, "Unable to clear track credits.")

  if (!input.credits.length) {
    return [] as AdminTrackCreditRecord[]
  }

  const { data, error } = await supabase
    .from("track_credits")
    .insert(
      input.credits.map((credit, index) => ({
        track_id: input.trackId,
        credited_name: credit.creditedName,
        linked_artist_id: credit.linkedArtistId ?? null,
        role_code: credit.roleCode,
        instrument: credit.instrument ?? null,
        display_credit: credit.displayCredit ?? null,
        notes: credit.notes ?? null,
        sort_order: credit.sortOrder ?? index,
        created_by: input.profileId,
        updated_by: input.profileId,
      })),
    )
    .select("id, track_id, credited_name, linked_artist_id, role_code, instrument, display_credit, notes, sort_order, created_at, updated_at, artists(id, name)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })

  throwIfError(error, "Unable to save track credits.")

  return ((data ?? []) as TrackCreditRow[]).map(mapTrackCreditRecord)
}

async function syncReleaseCollaboratorsToCurrentVersion(
  supabase: SupabaseClient<any>,
  releaseId: string,
  history: AdminReleaseSplitVersionRecord[],
) {
  const current = pickApplicableSplitVersion(history)
  const { error: deleteError } = await supabase.from("release_collaborators").delete().eq("release_id", releaseId)
  throwIfError(deleteError, "Unable to refresh current release collaborators.")

  if (!current?.contributors.length) {
    return
  }

  const { error: insertError } = await supabase.from("release_collaborators").insert(
    current.contributors.map((contributor) => ({
      release_id: releaseId,
      artist_id: contributor.artistId,
      role: contributor.role,
      split_pct: contributor.splitPct,
    })),
  )

  throwIfError(insertError, "Unable to refresh current release collaborators.")
}

async function syncTrackCollaboratorsToCurrentVersion(
  supabase: SupabaseClient<any>,
  trackId: string,
  history: AdminTrackSplitVersionRecord[],
) {
  const current = pickApplicableSplitVersion(history)
  const { error: deleteError } = await supabase.from("track_collaborators").delete().eq("track_id", trackId)
  throwIfError(deleteError, "Unable to refresh current track collaborators.")

  if (!current?.contributors.length) {
    return
  }

  const { error: insertError } = await supabase.from("track_collaborators").insert(
    current.contributors.map((contributor) => ({
      track_id: trackId,
      artist_id: contributor.artistId,
      role: contributor.role,
      split_pct: contributor.splitPct,
    })),
  )

  throwIfError(insertError, "Unable to refresh current track collaborators.")
}

function ensureSplitTotal(contributors: Array<{ splitPct: number }>, label: string) {
  const total = contributors.reduce((sum, contributor) => sum + contributor.splitPct, 0)

  if (total > 100.000001) {
    throw createError({
      statusCode: 409,
      statusMessage: `${label} cannot exceed 100%.`,
    })
  }
}

export async function createReleaseSplitVersion(
  supabase: SupabaseClient<any>,
  input: {
    releaseId: string
    contributors: Array<{ artistId: string; role: string; splitPct: number }>
    effectivePeriodMonth: string
    changeReason?: string | null
    createdBy: string | null
    source: SplitVersionSource
  },
) {
  ensureSplitTotal(input.contributors, "Release collaborator splits")

  const { data: version, error: versionError } = await supabase
    .from("release_split_versions")
    .insert({
      release_id: input.releaseId,
      effective_period_month: normalizeEffectivePeriodMonth(input.effectivePeriodMonth),
      change_reason: normalizeOptionalText(input.changeReason),
      created_by: input.createdBy,
      source: input.source,
    })
    .select("id, release_id, effective_period_month, change_reason, source, created_by, created_at")
    .single()

  throwIfError(versionError, "Unable to create the release split version.")

  if (!version) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to create the release split version.",
    })
  }

  if (input.contributors.length) {
    const { error: entriesError } = await supabase.from("release_split_version_entries").insert(
      input.contributors.map((contributor) => ({
        version_id: version.id,
        artist_id: contributor.artistId,
        role: contributor.role,
        split_pct: contributor.splitPct,
      })),
    )

    throwIfError(entriesError, "Unable to store release split contributors.")
  }

  const history = (await loadReleaseSplitHistory(supabase, [input.releaseId])).get(input.releaseId) ?? []
  await syncReleaseCollaboratorsToCurrentVersion(supabase, input.releaseId, history)

  return history.find((candidate) => candidate.id === version.id) ?? null
}

export async function createTrackSplitVersion(
  supabase: SupabaseClient<any>,
  input: {
    trackId: string
    releaseId: string
    contributors: Array<{ artistId: string; role: string; splitPct: number }>
    effectivePeriodMonth: string
    changeReason?: string | null
    createdBy: string | null
    source: SplitVersionSource
  },
) {
  ensureSplitTotal(input.contributors, "Track collaborator splits")

  const { data: version, error: versionError } = await supabase
    .from("track_split_versions")
    .insert({
      track_id: input.trackId,
      release_id: input.releaseId,
      effective_period_month: normalizeEffectivePeriodMonth(input.effectivePeriodMonth),
      change_reason: normalizeOptionalText(input.changeReason),
      created_by: input.createdBy,
      source: input.source,
    })
    .select("id, track_id, release_id, effective_period_month, change_reason, source, created_by, created_at")
    .single()

  throwIfError(versionError, "Unable to create the track split version.")

  if (!version) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to create the track split version.",
    })
  }

  if (input.contributors.length) {
    const { error: entriesError } = await supabase.from("track_split_version_entries").insert(
      input.contributors.map((contributor) => ({
        version_id: version.id,
        artist_id: contributor.artistId,
        role: contributor.role,
        split_pct: contributor.splitPct,
      })),
    )

    throwIfError(entriesError, "Unable to store track split contributors.")
  }

  const history = (await loadTrackSplitHistory(supabase, [input.trackId])).get(input.trackId) ?? []
  await syncTrackCollaboratorsToCurrentVersion(supabase, input.trackId, history)

  return history.find((candidate) => candidate.id === version.id) ?? null
}

export function summarizeReleaseEvent(record: AdminReleaseEventRecord) {
  const title = typeof record.payload?.title === "string" ? record.payload.title : null
  const reason = typeof record.payload?.reason === "string" ? record.payload.reason : null

  switch (record.eventType) {
    case "release_created":
      return title ? `Created ${title}` : "Release created"
    case "release_edited":
      return "Release details updated"
    case "genre_changed":
      return typeof record.payload?.genre === "string" ? `Genre set to ${record.payload.genre}` : "Genre updated"
    case "credits_changed":
      return "Track credits updated"
    case "split_version_created":
      return typeof record.payload?.scope === "string"
        ? `${String(record.payload.scope).charAt(0).toUpperCase()}${String(record.payload.scope).slice(1)} split version scheduled`
        : "Split version scheduled"
    case "draft_edit_requested":
      return "Draft edit request submitted"
    case "request_approved":
      return "Change request approved"
    case "request_rejected":
      return "Change request rejected"
    case "request_applied":
      return "Change request applied"
    case "takedown_requested":
      return reason ? `Takedown requested: ${reason}` : "Takedown requested"
    case "takedown_completed":
      return "Release marked taken down"
    case "release_deleted":
      return "Release marked deleted"
    default:
      return "Release event recorded"
  }
}

export async function applyDraftReleaseSnapshot(
  supabase: SupabaseClient<any>,
  input: {
    releaseId: string
    snapshot: ReleaseChangeRequestSnapshot
    adminProfileId: string
  },
) {
  const releaseUpdate = input.snapshot.release ?? {}
  const proposedGenre = input.snapshot.genre ?? releaseUpdate.genre

  const { data: release, error: releaseError } = await supabase
    .from("releases")
    .select("id, status")
    .eq("id", input.releaseId)
    .single()

  throwIfError(releaseError, "Unable to load the draft release.")

  if (!release) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release does not exist.",
    })
  }

  if (release.status !== "draft") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only draft releases can accept a draft edit request.",
    })
  }

  const { error: releaseUpdateError } = await supabase
    .from("releases")
    .update({
      title: releaseUpdate.title !== undefined ? normalizeRequiredText(releaseUpdate.title, "Release title") : undefined,
      type: releaseUpdate.type !== undefined ? normalizeReleaseType(releaseUpdate.type) : undefined,
      genre: proposedGenre !== undefined && proposedGenre !== null ? normalizeGenre(proposedGenre) : undefined,
      upc: releaseUpdate.upc !== undefined ? normalizeOptionalText(releaseUpdate.upc) : undefined,
      cover_art_url:
        releaseUpdate.coverArtUrl !== undefined
          ? normalizeOptionalHttpUrl(releaseUpdate.coverArtUrl, "Cover art URL")
          : undefined,
      streaming_link:
        releaseUpdate.streamingLink !== undefined
          ? normalizeOptionalHttpUrl(releaseUpdate.streamingLink, "Streaming link")
          : undefined,
      release_date:
        releaseUpdate.releaseDate !== undefined
          ? normalizeOptionalIsoDate(releaseUpdate.releaseDate, "Release date")
          : undefined,
      status:
        releaseUpdate.status !== undefined
          ? normalizeReleaseStatus(releaseUpdate.status, "draft")
          : undefined,
    })
    .eq("id", input.releaseId)

  throwIfError(releaseUpdateError, "Unable to apply release edits.")

  const trackResult = await supabase
    .from("tracks")
    .select("id")
    .eq("release_id", input.releaseId)

  throwIfError(trackResult.error, "Unable to load current draft tracks.")

  const existingTrackIds = new Set(((trackResult.data ?? []) as Array<{ id: string }>).map((row) => row.id))
  const seenTrackIds = new Set<string>()

  for (const entry of input.snapshot.tracks as ApplyDraftTrackInput[]) {
    const normalizedTrack = {
      title: entry.title !== undefined ? normalizeRequiredText(entry.title, "Track title") : undefined,
      isrc: entry.isrc !== undefined ? normalizeIsrc(entry.isrc) : undefined,
      trackNumber:
        entry.trackNumber !== undefined
          ? normalizeOptionalInteger(entry.trackNumber, "Track number")
          : undefined,
      audioPreviewUrl:
        entry.audioPreviewUrl !== undefined
          ? normalizeOptionalHttpUrl(entry.audioPreviewUrl, "Audio preview URL")
          : undefined,
      status: entry.status !== undefined ? normalizeTrackStatus(entry.status, "draft" as TrackStatus) : "draft",
      credits: normalizeTrackCreditsInput(entry.credits),
    }

    if (entry.id && existingTrackIds.has(entry.id)) {
      seenTrackIds.add(entry.id)

      const { error: updateTrackError } = await supabase
        .from("tracks")
        .update({
          title: normalizedTrack.title,
          isrc: normalizedTrack.isrc,
          track_number: normalizedTrack.trackNumber,
          audio_preview_url: normalizedTrack.audioPreviewUrl,
          status: normalizedTrack.status,
          deleted_by: normalizedTrack.status === "deleted" ? input.adminProfileId : null,
        })
        .eq("id", entry.id)

      throwIfError(updateTrackError, "Unable to update a draft track.")
      await replaceTrackCredits(supabase, {
        trackId: entry.id,
        credits: normalizedTrack.credits,
        profileId: input.adminProfileId,
      })
      continue
    }

    const { data: insertedTrack, error: insertTrackError } = await supabase
      .from("tracks")
      .insert({
        release_id: input.releaseId,
        title: normalizedTrack.title,
        isrc: normalizedTrack.isrc,
        track_number: normalizedTrack.trackNumber,
        audio_preview_url: normalizedTrack.audioPreviewUrl,
        status: normalizedTrack.status,
      })
      .select("id")
      .single()

    throwIfError(insertTrackError, "Unable to add a new draft track.")

    if (!insertedTrack) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to add a new draft track.",
      })
    }
    seenTrackIds.add(insertedTrack.id)

    await replaceTrackCredits(supabase, {
      trackId: insertedTrack.id,
      credits: normalizedTrack.credits,
      profileId: input.adminProfileId,
    })
  }

  const removedTrackIds = [...existingTrackIds].filter((trackId) => !seenTrackIds.has(trackId))

  if (removedTrackIds.length) {
    const { error: deleteTrackError } = await supabase
      .from("tracks")
      .update({
        status: "deleted",
        deleted_by: input.adminProfileId,
      })
      .in("id", removedTrackIds)

    throwIfError(deleteTrackError, "Unable to remove deleted draft tracks.")
  }
}
