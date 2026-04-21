import type { SupabaseClient } from "@supabase/supabase-js"
import { createError } from "h3"
import type {
  AdminReleaseCollaboratorRecord,
  AdminReleaseRecord,
  AdminTrackCollaboratorRecord,
  AdminTrackRecord,
  CollaboratorInputValue,
  ReleaseType,
} from "~~/types/catalog"

interface ReleaseRow {
  id: string
  artist_id: string
  title: string
  type: ReleaseType
  upc: string | null
  cover_art_url: string | null
  streaming_link: string | null
  release_date: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface TrackJoinRow {
  artist_id: string
  title: string
}

interface TrackRow {
  id: string
  release_id: string
  title: string
  isrc: string
  track_number: number | null
  duration_seconds: number | null
  audio_preview_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  releases: TrackJoinRow | TrackJoinRow[] | null
}

interface ArtistJoinRow {
  id: string
  name: string
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

const RELEASE_TYPES = new Set<ReleaseType>(["single", "ep", "album"])
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

function unwrapJoinRow<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value
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

export function mapReleaseRecord(row: ReleaseRow): AdminReleaseRecord {
  return {
    id: row.id,
    artistId: row.artist_id,
    title: row.title,
    type: row.type,
    upc: row.upc,
    coverArtUrl: row.cover_art_url,
    streamingLink: row.streaming_link,
    releaseDate: row.release_date,
    isActive: row.is_active,
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
    isActive: row.is_active,
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
    .select("id, artist_id, title")
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
    .select("id, release_id, title")
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
