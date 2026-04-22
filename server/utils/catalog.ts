import type { SupabaseClient } from "@supabase/supabase-js"
import { createError } from "h3"
import type {
  AdminReleaseCollaboratorRecord,
  AdminReleaseEventRecord,
  AdminReleaseRecord,
  AdminTrackCollaboratorRecord,
  AdminTrackCreditRecord,
  AdminTrackRecord,
  CollaboratorInputValue,
  ReleaseChangeRequestStatus,
  ReleaseChangeRequestType,
  ReleaseEventType,
  ReleaseStatus,
  ReleaseType,
  TrackCreditInput,
  TrackStatus,
} from "~~/types/catalog"

interface ArtistJoinRow {
  id: string
  name: string
}

interface ReleaseJoinRow {
  artist_id: string
  title: string
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
  artists?: ArtistJoinRow | ArtistJoinRow[] | null
}

interface TrackRow {
  id: string
  release_id: string
  title: string
  isrc: string
  track_number: number | null
  duration_seconds: number | null
  audio_preview_url: string | null
  status?: TrackStatus | null
  is_active?: boolean | null
  created_at: string
  updated_at: string
  releases?: ReleaseJoinRow | ReleaseJoinRow[] | null
}

interface ReleaseCollaboratorRow {
  id: string
  release_id: string
  artist_id: string
  role: string
  split_pct: number | string
  created_at: string
  updated_at: string
  artists: ArtistJoinRow | ArtistJoinRow[] | null
}

interface TrackCollaboratorTrackJoinRow {
  id: string
  release_id: string
  title: string
}

interface TrackCollaboratorRow {
  id: string
  track_id: string
  artist_id: string
  role: string
  split_pct: number | string
  created_at: string
  updated_at: string
  artists: ArtistJoinRow | ArtistJoinRow[] | null
  tracks: TrackCollaboratorTrackJoinRow | TrackCollaboratorTrackJoinRow[] | null
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
  artists?: TrackCreditArtistJoinRow | TrackCreditArtistJoinRow[] | null
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
  profiles?: ReleaseEventProfileJoinRow | ReleaseEventProfileJoinRow[] | null
  artists?: ReleaseEventArtistJoinRow | ReleaseEventArtistJoinRow[] | null
}

const RELEASE_TYPES = new Set<ReleaseType>(["single", "ep", "album"])
const RELEASE_STATUSES = new Set<ReleaseStatus>(["draft", "live", "taken_down", "deleted"])
const TRACK_STATUSES = new Set<TrackStatus>(["draft", "live", "deleted"])
const RELEASE_EVENT_TYPES = new Set<ReleaseEventType>([
  "release_created",
  "release_edited",
  "genre_changed",
  "credits_changed",
  "split_version_created",
  "draft_edit_requested",
  "request_approved",
  "request_rejected",
  "request_applied",
  "takedown_requested",
  "takedown_completed",
  "release_deleted",
])
const CHANGE_REQUEST_TYPES = new Set<ReleaseChangeRequestType>(["draft_edit", "takedown"])
const CHANGE_REQUEST_STATUSES = new Set<ReleaseChangeRequestStatus>(["pending", "approved", "rejected", "applied"])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeUuidText(value: unknown) {
  const normalized = normalizeText(value)

  if (!normalized) {
    return ""
  }

  const lowered = normalized.toLowerCase()

  if (lowered === "undefined" || lowered === "null") {
    return ""
  }

  return normalized
}

export function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : (value ?? null)
}

export function normalizeRequiredText(value: unknown, label: string, minimumLength = 2) {
  const normalized = normalizeText(value)

  if (!normalized || normalized.length < minimumLength) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be at least ${minimumLength} characters.`,
    })
  }

  return normalized
}

export function normalizeOptionalText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

export function normalizeRequiredUuid(value: unknown, label: string) {
  const normalized = normalizeUuidText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is required.`,
    })
  }

  if (!UUID_PATTERN.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is invalid.`,
    })
  }

  return normalized
}

export function normalizeOptionalUuidQueryParam(value: unknown, label: string) {
  const normalized = normalizeUuidText(value)

  if (!normalized) {
    return ""
  }

  if (!UUID_PATTERN.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is invalid.`,
    })
  }

  return normalized
}

export function normalizeReleaseType(value: unknown) {
  const normalized = normalizeText(value).toLowerCase() as ReleaseType

  if (!RELEASE_TYPES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Release type must be single, ep, or album.",
    })
  }

  return normalized
}

export function normalizeReleaseStatus(value: unknown, defaultValue: ReleaseStatus = "draft") {
  if (value === undefined || value === null || value === "") {
    return defaultValue
  }

  const normalized = normalizeText(value).toLowerCase() as ReleaseStatus

  if (!RELEASE_STATUSES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Release status must be draft, live, taken_down, or deleted.",
    })
  }

  return normalized
}

export function normalizeTrackStatus(value: unknown, defaultValue: TrackStatus = "draft") {
  if (value === undefined || value === null || value === "") {
    return defaultValue
  }

  const normalized = normalizeText(value).toLowerCase() as TrackStatus

  if (!TRACK_STATUSES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Track status must be draft, live, or deleted.",
    })
  }

  return normalized
}

export function normalizeReleaseEventType(value: unknown) {
  const normalized = normalizeText(value) as ReleaseEventType

  if (!RELEASE_EVENT_TYPES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Release event type is invalid.",
    })
  }

  return normalized
}

export function normalizeReleaseChangeRequestType(value: unknown) {
  const normalized = normalizeText(value) as ReleaseChangeRequestType

  if (!CHANGE_REQUEST_TYPES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Release request type is invalid.",
    })
  }

  return normalized
}

export function normalizeReleaseChangeRequestStatus(value: unknown) {
  const normalized = normalizeText(value) as ReleaseChangeRequestStatus

  if (!CHANGE_REQUEST_STATUSES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Release request status is invalid.",
    })
  }

  return normalized
}

export function normalizeGenre(value: unknown) {
  return normalizeRequiredText(value, "Genre")
}

export function normalizeOptionalIsoDate(value: unknown, label: string) {
  const normalized = normalizeText(value)

  if (!normalized) {
    return null
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must use YYYY-MM-DD format.`,
    })
  }

  return normalized
}

export function normalizeEffectivePeriodMonth(value: unknown, label = "Effective period month") {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is required.`,
    })
  }

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return `${normalized}-01`
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized.slice(0, 7) + "-01"
  }

  throw createError({
    statusCode: 400,
    statusMessage: `${label} must use YYYY-MM format.`,
  })
}

export function normalizeOptionalInteger(value: unknown, label: string) {
  const normalized = normalizeText(value)

  if (!normalized) {
    return null
  }

  if (!/^\d+$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a whole number.`,
    })
  }

  return Number(normalized)
}

export function normalizeBoolean(value: unknown, defaultValue = true) {
  if (value === undefined || value === null || value === "") {
    return defaultValue
  }

  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()

    if (normalized === "true") {
      return true
    }

    if (normalized === "false") {
      return false
    }
  }

  throw createError({
    statusCode: 400,
    statusMessage: "Boolean fields must be true or false.",
  })
}

export function normalizeIsrc(value: unknown) {
  const normalized = normalizeRequiredText(value, "ISRC").toUpperCase()

  if (!/^[A-Z0-9-]+$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "ISRC can contain only letters, numbers, and hyphens.",
    })
  }

  return normalized
}

export function normalizeOptionalHttpUrl(value: unknown, label: string) {
  const normalized = normalizeText(value)

  if (!normalized) {
    return null
  }

  let parsed: URL

  try {
    parsed = new URL(normalized)
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid URL.`,
    })
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must use http or https.`,
    })
  }

  return parsed.toString()
}

export function normalizeRequiredSplitPct(value: CollaboratorInputValue, label: string) {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is required.`,
    })
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid percentage with up to two decimals.`,
    })
  }

  const numeric = Number(normalized)

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must stay between 0 and 100.`,
    })
  }

  return Number(numeric.toFixed(2))
}

export function normalizeStringArray(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return [] as string[]
  }

  if (!Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a list.`,
    })
  }

  return value
    .map((entry) => normalizeText(entry))
    .filter(Boolean)
}

export function normalizeTrackCreditsInput(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return [] as TrackCreditInput[]
  }

  if (!Array.isArray(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Track credits must be a list.",
    })
  }

  return value.map((entry, index) => {
    const credit = entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {}

    return {
      creditedName: normalizeRequiredText(credit.creditedName, `Credit ${index + 1} name`),
      linkedArtistId: credit.linkedArtistId ? normalizeRequiredUuid(credit.linkedArtistId, `Credit ${index + 1} linked artist`) : null,
      roleCode: normalizeRequiredText(credit.roleCode, `Credit ${index + 1} role`),
      instrument: normalizeOptionalText(credit.instrument),
      displayCredit: normalizeOptionalText(credit.displayCredit),
      notes: normalizeOptionalText(credit.notes),
      sortOrder: normalizeOptionalInteger(credit.sortOrder, `Credit ${index + 1} sort order`) ?? index,
    } satisfies TrackCreditInput
  })
}

function coerceReleaseStatus(row: Pick<ReleaseRow, "status" | "is_active">): ReleaseStatus {
  if (row.status && RELEASE_STATUSES.has(row.status)) {
    return row.status
  }

  return row.is_active === false ? "deleted" : "live"
}

function coerceTrackStatus(row: Pick<TrackRow, "status" | "is_active">): TrackStatus {
  if (row.status && TRACK_STATUSES.has(row.status)) {
    return row.status
  }

  return row.is_active === false ? "deleted" : "live"
}

function normalizeJsonStringArray(value: unknown) {
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

export function mapReleaseRecord(row: ReleaseRow): AdminReleaseRecord {
  const artist = unwrapJoinRow(row.artists)

  return {
    id: row.id,
    artistId: row.artist_id,
    artistName: artist?.name ?? null,
    title: row.title,
    type: row.type,
    genre: row.genre?.trim() || "Other",
    upc: row.upc,
    coverArtUrl: row.cover_art_url,
    streamingLink: row.streaming_link,
    releaseDate: row.release_date,
    status: coerceReleaseStatus(row),
    takedownReason: row.takedown_reason ?? null,
    takedownProofUrls: normalizeJsonStringArray(row.takedown_proof_urls),
    takedownRequestedAt: row.takedown_requested_at ?? null,
    takedownCompletedAt: row.takedown_completed_at ?? null,
    tracks: [],
    collaborators: [],
    splitHistory: [],
    events: [],
    currentRequest: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapTrackRecord(row: TrackRow): AdminTrackRecord {
  const release = unwrapJoinRow(row.releases)

  return {
    id: row.id,
    artistId: release?.artist_id ?? "",
    releaseId: row.release_id,
    releaseTitle: release?.title ?? "Unknown release",
    title: row.title,
    isrc: row.isrc,
    trackNumber: row.track_number,
    durationSeconds: row.duration_seconds,
    audioPreviewUrl: row.audio_preview_url,
    status: coerceTrackStatus(row),
    credits: [],
    collaborators: [],
    splitHistory: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapReleaseCollaboratorRecord(row: ReleaseCollaboratorRow): AdminReleaseCollaboratorRecord {
  const artist = unwrapJoinRow(row.artists)

  return {
    id: row.id,
    releaseId: row.release_id,
    artistId: row.artist_id,
    artistName: artist?.name ?? "Unknown artist",
    role: row.role,
    splitPct: Number(row.split_pct ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapTrackCollaboratorRecord(row: TrackCollaboratorRow): AdminTrackCollaboratorRecord {
  const artist = unwrapJoinRow(row.artists)
  const track = unwrapJoinRow(row.tracks)

  return {
    id: row.id,
    trackId: row.track_id,
    releaseId: track?.release_id ?? "",
    trackTitle: track?.title ?? "Unknown track",
    artistId: row.artist_id,
    artistName: artist?.name ?? "Unknown artist",
    role: row.role,
    splitPct: Number(row.split_pct ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapTrackCreditRecord(row: TrackCreditRow): AdminTrackCreditRecord {
  const artist = unwrapJoinRow(row.artists)

  return {
    id: row.id,
    trackId: row.track_id,
    creditedName: row.credited_name,
    linkedArtistId: row.linked_artist_id,
    linkedArtistName: artist?.name ?? null,
    roleCode: row.role_code,
    instrument: row.instrument,
    displayCredit: row.display_credit,
    notes: row.notes,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapReleaseEventRecord(row: ReleaseEventRow): AdminReleaseEventRecord {
  const profile = unwrapJoinRow(row.profiles)
  const artist = unwrapJoinRow(row.artists)

  return {
    id: row.id,
    releaseId: row.release_id,
    eventType: row.event_type,
    actorRole: row.actor_role,
    actorProfileId: row.actor_profile_id,
    actorArtistId: row.actor_artist_id,
    actorName: profile?.full_name ?? artist?.name ?? null,
    payload: row.payload ?? {},
    createdAt: row.created_at,
  }
}

export async function assertArtistExists(supabase: SupabaseClient<any>, artistId: string) {
  const { data, error } = await supabase
    .from("artists")
    .select("id, name, is_active")
    .eq("id", artistId)
    .maybeSingle()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected artist does not exist.",
    })
  }

  return data
}

export async function assertReleaseExists(supabase: SupabaseClient<any>, releaseId: string) {
  const { data, error } = await supabase
    .from("releases")
    .select("id, artist_id, title, status")
    .eq("id", releaseId)
    .maybeSingle()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release does not exist.",
    })
  }

  return data
}

export async function assertTrackExists(supabase: SupabaseClient<any>, trackId: string) {
  const { data, error } = await supabase
    .from("tracks")
    .select("id, release_id, title, status")
    .eq("id", trackId)
    .maybeSingle()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected track does not exist.",
    })
  }

  return data
}

export function isUniqueViolation(error: any) {
  return error?.code === "23505"
}

export function isSplitOverflowViolation(error: any) {
  const message = String(error?.message ?? "")
  return message.includes("splits exceed 100 percent")
}
