import Decimal from "decimal.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createError } from "h3"
import {
  normalizeOptionalText,
  normalizeOptionalUuidQueryParam,
  normalizeRequiredText,
  normalizeRequiredUuid,
  unwrapJoinRow,
} from "~~/server/utils/catalog"
import type {
  AdminPublishingRegistrationResponse,
  ArtistPublishingResponse,
  PublishingCatalogTrackOption,
  PublishingDefaultWriter,
  PublishingRegistrationStatus,
  PublishingRegistrationSummary,
  PublishingRegistrationTrackInput,
  PublishingRegistrationTrackRecord,
  PublishingRegistrationTrackSource,
  PublishingRegistrationWriterInput,
  PublishingRegistrationWriterRecord,
  PublishingRegistrationSource,
  PublishingWriterOption,
  PublishingWriterRecord,
  AdminPublishingWriterRecord,
  AdminPublishingWriterStatusFilter,
  AdminPublishingWriterUpdateInput,
  AdminPublishingWriterMutationResponse,
  AdminPublishingWritersResponse,
} from "~~/types/publishing"

interface WriterJoinRow {
  id: string
  full_name: string
  first_name: string | null
  middle_name: string | null
  last_name: string | null
  ipi_number: string | null
  pro_name: string | null
  is_active?: boolean | null
  archived_at?: string | null
  archived_by?: string | null
  created_at: string
  updated_at: string
}

interface ArtistJoinRow {
  id: string
  name: string
  email?: string | null
}

interface ProfileJoinRow {
  id: string
  full_name: string | null
}

interface ReleaseJoinRow {
  id: string
  title: string
  upc?: string | null
  cover_art_url?: string | null
  cover_thumb_url?: string | null
  artists?: ArtistJoinRow | ArtistJoinRow[] | null
}

interface TrackJoinRow {
  id: string
  title: string
  isrc: string
  releases?: ReleaseJoinRow | ReleaseJoinRow[] | null
}

interface BatchJoinRow {
  id: string
  source: PublishingRegistrationSource
  artist_notes: string | null
  admin_notes: string | null
}

interface RegistrationWriterRow {
  id: string
  writer_id: string
  role: string
  share_pct: string | number
  collect_royalties: boolean
  sort_order: number | null
  publishing_writers: WriterJoinRow | WriterJoinRow[] | null
}

export interface RegistrationTrackRow {
  id: string
  batch_id: string
  artist_id: string
  track_id: string | null
  release_id: string | null
  source: PublishingRegistrationTrackSource
  status: PublishingRegistrationStatus
  song_title: string
  performer_name: string
  spotify_url: string | null
  submitted_by: string
  reviewed_by: string | null
  reviewed_at: string | null
  admin_notes: string | null
  created_at: string
  updated_at: string
  artists: ArtistJoinRow | ArtistJoinRow[] | null
  tracks: TrackJoinRow | TrackJoinRow[] | null
  releases: ReleaseJoinRow | ReleaseJoinRow[] | null
  submitted_profile?: ProfileJoinRow | ProfileJoinRow[] | null
  reviewed_profile?: ProfileJoinRow | ProfileJoinRow[] | null
  publishing_registration_batches: BatchJoinRow | BatchJoinRow[] | null
  publishing_registration_track_writers: RegistrationWriterRow[] | null
}

interface CatalogTrackRow {
  id: string
  title: string
  isrc: string
  status: string
  release_id: string
  releases: {
    id: string
    title: string
    artist_id: string
    artists: ArtistJoinRow | ArtistJoinRow[] | null
  } | Array<{
    id: string
    title: string
    artist_id: string
    artists: ArtistJoinRow | ArtistJoinRow[] | null
  }> | null
}

interface CatalogTrackRegistrationRow {
  track_id: string | null
  status: Exclude<PublishingRegistrationStatus, "rejected">
}

interface ArtistPublishingInfoRow {
  artist_id: string
  legal_name: string | null
  ipi_number: string | null
  pro_name: string | null
}

interface WriterArtistLinkRow {
  writer_id: string
  artists: ArtistJoinRow | ArtistJoinRow[] | null
}

interface AdminWriterArtistLinkRow {
  writer_id: string
  artist_id: string
  artists: ArtistJoinRow | ArtistJoinRow[] | null
}

interface WriterUsageCountRow {
  writer_id: string
  status?: PublishingRegistrationStatus | null
}

interface NormalizedWriterInput {
  writerId: string | null
  fullName: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  ipiNumber: string | null
  proName: string | null
  role: string
  sharePct: string
  collectRoyalties: boolean
}

interface NormalizedWriterIdentityInput {
  fullName: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  ipiNumber: string | null
  proName: string | null
}

export interface NormalizedTrackInput {
  source: PublishingRegistrationTrackSource
  trackId: string | null
  songTitle: string
  performerName: string
  spotifyUrl: string | null
  writers: NormalizedWriterInput[]
}

const MAX_BATCH_TRACKS = 50
const SHARE_PATTERN = /^\d+(\.\d{1,2})?$/
const REGISTRATION_STATUS_SET = new Set<PublishingRegistrationStatus>(["pending_review", "accepted", "rejected"])
const TRACK_SOURCE_SET = new Set<PublishingRegistrationTrackSource>(["catalog", "manual"])
const ADMIN_WRITER_STATUS_SET = new Set<AdminPublishingWriterStatusFilter>(["active", "archived", "all"])
const PUBLISHING_WRITER_SELECT = "id, full_name, first_name, middle_name, last_name, ipi_number, pro_name, is_active, archived_at, archived_by, created_at, updated_at"
type ArtistPublishingWriterSource = "artist_saved" | "artist_submission" | "admin_direct" | "artist_publishing_info"

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function normalizeWriterIdentityValue(value: string | null | undefined) {
  return normalizeText(value).toLowerCase()
}

function writerIdentityMatches(
  row: Pick<WriterJoinRow, "full_name" | "ipi_number" | "pro_name">,
  writer: Pick<NormalizedWriterInput, "fullName" | "ipiNumber" | "proName">,
) {
  const writerIpi = normalizeWriterIdentityValue(writer.ipiNumber)

  if (writerIpi) {
    return normalizeWriterIdentityValue(row.ipi_number) === writerIpi
  }

  return normalizeWriterIdentityValue(row.full_name) === normalizeWriterIdentityValue(writer.fullName)
    && normalizeWriterIdentityValue(row.pro_name) === normalizeWriterIdentityValue(writer.proName)
}

function toMoneyString(value: string | number | null | undefined) {
  return new Decimal(value ?? 0).toFixed(2)
}

export function normalizeRegistrationStatusQuery(value: unknown) {
  const normalized = normalizeText(Array.isArray(value) ? value[0] : value)

  if (!normalized || normalized === "all") {
    return ""
  }

  if (!REGISTRATION_STATUS_SET.has(normalized as PublishingRegistrationStatus)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Publishing registration status is not supported.",
    })
  }

  return normalized as PublishingRegistrationStatus
}

export function normalizeRegistrationSearchQuery(value: unknown) {
  return normalizeText(Array.isArray(value) ? value[0] : value).replace(/\s+/g, " ").slice(0, 180)
}

export function normalizeRegistrationArtistQuery(value: unknown) {
  return normalizeOptionalUuidQueryParam(value, "Artist id")
}

export function normalizeRegistrationWriterQuery(value: unknown) {
  return normalizeOptionalUuidQueryParam(value, "Writer id")
}

export function normalizeAdminPublishingWriterStatusQuery(value: unknown): AdminPublishingWriterStatusFilter {
  const normalized = normalizeText(Array.isArray(value) ? value[0] : value) || "active"

  if (!ADMIN_WRITER_STATUS_SET.has(normalized as AdminPublishingWriterStatusFilter)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Writer status filter is not supported.",
    })
  }

  return normalized as AdminPublishingWriterStatusFilter
}

export function normalizeSpotifyUrl(value: unknown, required: boolean) {
  const normalized = normalizeText(value)

  if (!normalized) {
    if (required) {
      throw createError({
        statusCode: 400,
        statusMessage: "Spotify URL is required.",
      })
    }

    return null
  }

  let parsed: URL

  try {
    parsed = new URL(normalized)
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Spotify URL must be a valid URL.",
    })
  }

  if (parsed.protocol !== "https:") {
    throw createError({
      statusCode: 400,
      statusMessage: "Spotify URL must use https.",
    })
  }

  const host = parsed.hostname.toLowerCase()
  const isSpotifyHost = host === "spotify.link" || host === "spotify.com" || host.endsWith(".spotify.com")

  if (!isSpotifyHost) {
    throw createError({
      statusCode: 400,
      statusMessage: "Manual publishing registration only accepts Spotify links.",
    })
  }

  return parsed.toString()
}

function normalizeWriterShare(value: unknown, label: string) {
  const normalized = normalizeText(value)

  if (!normalized || !SHARE_PATTERN.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} share must be a valid percentage with up to two decimals.`,
    })
  }

  const share = new Decimal(normalized)

  if (share.lt(0) || share.gt(100)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} share must stay between 0 and 100.`,
    })
  }

  return share.toFixed(2)
}

function writerDisplayName(input: PublishingRegistrationWriterInput, index: number) {
  const directName = normalizeOptionalText(input.fullName)

  if (directName) {
    return directName
  }

  const parts = [input.firstName, input.middleName, input.lastName]
    .map((part) => normalizeText(part))
    .filter(Boolean)

  if (parts.length) {
    return parts.join(" ")
  }

  if (input.writerId) {
    return ""
  }

  throw createError({
    statusCode: 400,
    statusMessage: `Writer ${index + 1} name is required.`,
  })
}

export function normalizeRegistrationTrackInputs(value: unknown) {
  if (!Array.isArray(value) || !value.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Add at least one publishing track.",
    })
  }

  if (value.length > MAX_BATCH_TRACKS) {
    throw createError({
      statusCode: 400,
      statusMessage: `A publishing registration can include up to ${MAX_BATCH_TRACKS} tracks.`,
    })
  }

  return value.map((entry, trackIndex) => {
    const row = entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry as PublishingRegistrationTrackInput
      : {} as PublishingRegistrationTrackInput
    const source = normalizeText(row.source) as PublishingRegistrationTrackSource

    if (!TRACK_SOURCE_SET.has(source)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Track ${trackIndex + 1} source must be catalog or manual.`,
      })
    }

    const writers = normalizeRegistrationWriters(row.writers, `Track ${trackIndex + 1}`)

    return {
      source,
      trackId: source === "catalog" ? normalizeRequiredUuid(row.trackId, `Track ${trackIndex + 1}`) : null,
      songTitle: source === "manual" ? normalizeRequiredText(row.songTitle, `Track ${trackIndex + 1} song name`) : "",
      performerName: source === "manual" ? normalizeRequiredText(row.performerName, `Track ${trackIndex + 1} performer name`) : "",
      spotifyUrl: source === "manual" ? normalizeSpotifyUrl(row.spotifyUrl, true) : normalizeSpotifyUrl(row.spotifyUrl, false),
      writers,
    } satisfies NormalizedTrackInput
  })
}

function normalizeRegistrationWriters(value: unknown, trackLabel: string) {
  if (!Array.isArray(value) || !value.length) {
    throw createError({
      statusCode: 400,
      statusMessage: `${trackLabel} needs at least one writer.`,
    })
  }

  const writers = value.map((entry, writerIndex) => {
    const row = entry && typeof entry === "object" && !Array.isArray(entry)
      ? entry as PublishingRegistrationWriterInput
      : {} as PublishingRegistrationWriterInput
    const writerId = row.writerId ? normalizeRequiredUuid(row.writerId, `${trackLabel} writer ${writerIndex + 1}`) : null
    const fullName = writerDisplayName(row, writerIndex)

    return {
      writerId,
      fullName,
      firstName: normalizeOptionalText(row.firstName),
      middleName: normalizeOptionalText(row.middleName),
      lastName: normalizeOptionalText(row.lastName),
      ipiNumber: normalizeOptionalText(row.ipiNumber),
      proName: normalizeOptionalText(row.proName),
      role: normalizeOptionalText(row.role) ?? "Composition",
      sharePct: normalizeWriterShare(row.sharePct, `${trackLabel} writer ${writerIndex + 1}`),
      collectRoyalties: row.collectRoyalties !== false,
    } satisfies NormalizedWriterInput
  })

  const total = writers.reduce((sum, writer) => sum.plus(writer.sharePct), new Decimal(0))

  if (!total.eq(100)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${trackLabel} writer shares must total exactly 100%.`,
    })
  }

  return writers
}

export function mapPublishingWriter(row: WriterJoinRow): PublishingWriterRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    firstName: row.first_name,
    middleName: row.middle_name,
    lastName: row.last_name,
    ipiNumber: row.ipi_number,
    proName: row.pro_name,
    isActive: row.is_active !== false,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapPublishingWriterOption(
  row: WriterJoinRow,
  meta?: string | null,
  linkedArtistNames: string[] = [],
): PublishingWriterOption {
  return {
    value: row.id,
    label: row.full_name,
    ipiNumber: row.ipi_number,
    proName: row.pro_name,
    meta: meta ?? (linkedArtistNames.length ? `Linked: ${linkedArtistNames.join(", ")}` : row.pro_name ?? row.ipi_number ?? null),
    linkedArtistNames,
  }
}

function mapRegistrationWriter(row: RegistrationWriterRow): PublishingRegistrationWriterRecord {
  const writer = unwrapJoinRow(row.publishing_writers)

  return {
    id: row.id,
    writerId: row.writer_id,
    fullName: writer?.full_name ?? "Unknown writer",
    ipiNumber: writer?.ipi_number ?? null,
    proName: writer?.pro_name ?? null,
    role: row.role,
    sharePct: toMoneyString(row.share_pct),
    collectRoyalties: row.collect_royalties,
    sortOrder: Number(row.sort_order ?? 0),
  }
}

export function mapRegistrationTrack(row: RegistrationTrackRow): PublishingRegistrationTrackRecord {
  const artist = unwrapJoinRow(row.artists)
  const track = unwrapJoinRow(row.tracks)
  const release = unwrapJoinRow(row.releases) ?? unwrapJoinRow(track?.releases)
  const submittedProfile = unwrapJoinRow(row.submitted_profile)
  const reviewedProfile = unwrapJoinRow(row.reviewed_profile)
  const batch = unwrapJoinRow(row.publishing_registration_batches)
  const writers = [...(row.publishing_registration_track_writers ?? [])]
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0) || left.id.localeCompare(right.id))
    .map(mapRegistrationWriter)

  return {
    id: row.id,
    batchId: row.batch_id,
    artistId: row.artist_id,
    artistName: artist?.name ?? "Unknown artist",
    batchSource: batch?.source ?? "artist_request",
    trackSource: row.source,
    status: row.status,
    trackId: row.track_id,
    releaseId: row.release_id,
    releaseTitle: release?.title ?? null,
    trackTitle: row.song_title,
    performerName: row.performer_name,
    spotifyUrl: row.spotify_url,
    submittedBy: row.submitted_by,
    submittedByName: submittedProfile?.full_name ?? null,
    reviewedBy: row.reviewed_by,
    reviewedByName: reviewedProfile?.full_name ?? null,
    reviewedAt: row.reviewed_at,
    adminNotes: row.admin_notes ?? batch?.admin_notes ?? null,
    artistNotes: batch?.artist_notes ?? null,
    writers,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function summarizePublishingTracks(tracks: PublishingRegistrationTrackRecord[]): PublishingRegistrationSummary {
  const writerIds = new Set<string>()

  for (const track of tracks) {
    for (const writer of track.writers) {
      writerIds.add(writer.writerId)
    }
  }

  return {
    trackCount: tracks.length,
    pendingCount: tracks.filter((track) => track.status === "pending_review").length,
    acceptedCount: tracks.filter((track) => track.status === "accepted").length,
    rejectedCount: tracks.filter((track) => track.status === "rejected").length,
    artistCount: new Set(tracks.map((track) => track.artistId)).size,
    writerCount: writerIds.size,
  }
}

export async function loadArtistWriterOptions(
  supabase: SupabaseClient<any>,
  artistIds: string[],
) {
  if (!artistIds.length) {
    return []
  }

  const { data, error } = await supabase
    .from("artist_publishing_writers")
    .select(`artist_id, publishing_writers!inner(${PUBLISHING_WRITER_SELECT})`)
    .in("artist_id", artistIds)
    .eq("publishing_writers.is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load publishing writers.",
    })
  }

  const optionsById = new Map<string, PublishingWriterOption>()

  for (const row of (data ?? []) as Array<{ artist_id: string; publishing_writers: WriterJoinRow | WriterJoinRow[] | null }>) {
    const writer = unwrapJoinRow(row.publishing_writers)

    if (writer) {
      optionsById.set(writer.id, mapPublishingWriterOption(writer))
    }
  }

  return [...optionsById.values()].sort((left, right) => left.label.localeCompare(right.label))
}

export async function loadArtistDefaultPublishingWriter(
  supabase: SupabaseClient<any>,
  artistIds: string[],
): Promise<PublishingDefaultWriter | null> {
  if (!artistIds.length) {
    return null
  }

  const { data, error } = await supabase
    .from("artist_publishing_info")
    .select("artist_id, legal_name, ipi_number, pro_name")
    .in("artist_id", artistIds)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load artist publishing information.",
    })
  }

  const rowsByArtistId = new Map(
    ((data ?? []) as ArtistPublishingInfoRow[]).map((row) => [row.artist_id, row]),
  )
  const row = artistIds.map((artistId) => rowsByArtistId.get(artistId)).find(Boolean)

  if (!row) {
    return null
  }

  const fullName = normalizeOptionalText(row.legal_name) ?? ""
  const ipiNumber = normalizeOptionalText(row.ipi_number)
  const proName = normalizeOptionalText(row.pro_name)

  if (!fullName && !ipiNumber && !proName) {
    return null
  }

  return {
    fullName,
    ipiNumber,
    proName,
  }
}

async function loadLinkedArtistNamesByWriterId(
  supabase: SupabaseClient<any>,
  writerIds: string[],
) {
  const namesByWriterId = new Map<string, string[]>()

  if (!writerIds.length) {
    return namesByWriterId
  }

  const { data, error } = await supabase
    .from("artist_publishing_writers")
    .select("writer_id, artists(id, name)")
    .in("writer_id", writerIds)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load linked writer artists.",
    })
  }

  for (const row of (data ?? []) as WriterArtistLinkRow[]) {
    const artist = unwrapJoinRow(row.artists)

    if (!artist?.name) {
      continue
    }

    const names = namesByWriterId.get(row.writer_id) ?? []

    if (!names.includes(artist.name)) {
      names.push(artist.name)
    }

    namesByWriterId.set(row.writer_id, names)
  }

  for (const names of namesByWriterId.values()) {
    names.sort((left, right) => left.localeCompare(right))
  }

  return namesByWriterId
}

export async function loadGlobalWriterOptions(supabase: SupabaseClient<any>) {
  const { data, error } = await supabase
    .from("publishing_writers")
    .select(PUBLISHING_WRITER_SELECT)
    .eq("is_active", true)
    .order("full_name", { ascending: true })
    .limit(1000)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load publishing writers.",
    })
  }

  const writers = (data ?? []) as WriterJoinRow[]
  const linkedNamesByWriterId = await loadLinkedArtistNamesByWriterId(
    supabase,
    writers.map((writer) => writer.id),
  )

  return writers.map((writer) => mapPublishingWriterOption(
    writer,
    null,
    linkedNamesByWriterId.get(writer.id) ?? [],
  ))
}

function mapAdminPublishingWriter(
  row: WriterJoinRow,
  linkedArtists: AdminWriterArtistLinkRow[] = [],
  usageRows: WriterUsageCountRow[] = [],
): AdminPublishingWriterRecord {
  const artists = linkedArtists
    .map((link) => {
      const artist = unwrapJoinRow(link.artists)

      return artist?.id && artist.name
        ? { artistId: artist.id, artistName: artist.name }
        : null
    })
    .filter(Boolean) as AdminPublishingWriterRecord["linkedArtists"]
  const dedupedArtists = [...new Map(artists.map((artist) => [artist.artistId, artist])).values()]
    .sort((left, right) => left.artistName.localeCompare(right.artistName))

  return {
    ...mapPublishingWriter(row),
    linkedArtists: dedupedArtists,
    linkedArtistNames: dedupedArtists.map((artist) => artist.artistName),
    linkedArtistCount: dedupedArtists.length,
    registrationCount: usageRows.length,
    pendingRegistrationCount: usageRows.filter((usage) => usage.status === "pending_review").length,
    acceptedRegistrationCount: usageRows.filter((usage) => usage.status === "accepted").length,
    rejectedRegistrationCount: usageRows.filter((usage) => usage.status === "rejected").length,
  }
}

async function loadAdminWriterRows(
  supabase: SupabaseClient<any>,
  writerIds?: string[],
) {
  let writerQuery = supabase
    .from("publishing_writers")
    .select(PUBLISHING_WRITER_SELECT)
    .order("updated_at", { ascending: false })
    .limit(2500)

  if (writerIds?.length) {
    writerQuery = writerQuery.in("id", writerIds)
  }

  const { data: writerRows, error: writerError } = await writerQuery

  if (writerError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load publishing writers.",
    })
  }

  const writers = (writerRows ?? []) as WriterJoinRow[]
  const ids = writers.map((writer) => writer.id)

  if (!ids.length) {
    return []
  }

  const [linkResult, usageResult] = await Promise.all([
    supabase
      .from("artist_publishing_writers")
      .select("writer_id, artist_id, artists(id, name)")
      .in("writer_id", ids),
    supabase
      .from("publishing_registration_track_writers")
      .select("writer_id, publishing_registration_tracks(status)")
      .in("writer_id", ids),
  ])

  if (linkResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load writer artist links.",
    })
  }

  if (usageResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load writer registration usage.",
    })
  }

  const linksByWriterId = new Map<string, AdminWriterArtistLinkRow[]>()

  for (const link of (linkResult.data ?? []) as AdminWriterArtistLinkRow[]) {
    const links = linksByWriterId.get(link.writer_id) ?? []
    links.push(link)
    linksByWriterId.set(link.writer_id, links)
  }

  const usageByWriterId = new Map<string, WriterUsageCountRow[]>()

  for (const row of (usageResult.data ?? []) as Array<{ writer_id: string; publishing_registration_tracks: { status: PublishingRegistrationStatus } | Array<{ status: PublishingRegistrationStatus }> | null }>) {
    const track = unwrapJoinRow(row.publishing_registration_tracks)
    const usages = usageByWriterId.get(row.writer_id) ?? []
    usages.push({
      writer_id: row.writer_id,
      status: track?.status ?? null,
    })
    usageByWriterId.set(row.writer_id, usages)
  }

  return writers.map((writer) => mapAdminPublishingWriter(
    writer,
    linksByWriterId.get(writer.id) ?? [],
    usageByWriterId.get(writer.id) ?? [],
  ))
}

export async function loadAdminPublishingWriters(
  supabase: SupabaseClient<any>,
  statusFilter: AdminPublishingWriterStatusFilter = "active",
): Promise<AdminPublishingWritersResponse> {
  const writers = await loadAdminWriterRows(supabase)
  const filteredWriters = writers.filter((writer) => {
    if (statusFilter === "active") return writer.isActive
    if (statusFilter === "archived") return !writer.isActive
    return true
  })

  return {
    writers: filteredWriters,
    summary: {
      writerCount: writers.length,
      activeCount: writers.filter((writer) => writer.isActive).length,
      archivedCount: writers.filter((writer) => !writer.isActive).length,
      linkedArtistCount: new Set(writers.flatMap((writer) => writer.linkedArtists.map((artist) => artist.artistId))).size,
      registrationCount: writers.reduce((sum, writer) => sum + writer.registrationCount, 0),
    },
  }
}

async function loadAdminPublishingWriterById(
  supabase: SupabaseClient<any>,
  writerId: string,
) {
  const rows = await loadAdminWriterRows(supabase, [writerId])

  return rows[0] ?? null
}

function normalizeAdminPublishingWriterInput(
  input: AdminPublishingWriterUpdateInput,
  current?: WriterJoinRow,
): NormalizedWriterIdentityInput {
  const firstName = normalizeOptionalText(input.firstName ?? current?.first_name)
  const middleName = normalizeOptionalText(input.middleName ?? current?.middle_name)
  const lastName = normalizeOptionalText(input.lastName ?? current?.last_name)
  const fullName = normalizeOptionalText(input.fullName ?? current?.full_name)
    ?? [firstName, middleName, lastName].filter(Boolean).join(" ")

  if (!fullName) {
    throw createError({
      statusCode: 400,
      statusMessage: "Writer full name is required.",
    })
  }

  return {
    fullName,
    firstName,
    middleName,
    lastName,
    ipiNumber: normalizeOptionalText(input.ipiNumber ?? current?.ipi_number),
    proName: normalizeOptionalText(input.proName ?? current?.pro_name),
  }
}

async function findMatchingPublishingWriterRows(
  supabase: SupabaseClient<any>,
  writer: Pick<NormalizedWriterIdentityInput, "fullName" | "ipiNumber" | "proName">,
  excludeWriterId?: string | null,
) {
  const normalizedIpi = normalizeWriterIdentityValue(writer.ipiNumber)
  let query = supabase
    .from("publishing_writers")
    .select(PUBLISHING_WRITER_SELECT)
    .limit(25)

  if (normalizedIpi) {
    query = query.ilike("ipi_number", writer.ipiNumber ?? "")
  } else {
    query = query
      .is("ipi_number", null)
      .ilike("full_name", writer.fullName)

    query = writer.proName ? query.ilike("pro_name", writer.proName) : query.is("pro_name", null)
  }

  const { data, error } = await query

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to verify existing publishing writer.",
    })
  }

  return ((data ?? []) as WriterJoinRow[])
    .filter((row) => row.id !== excludeWriterId)
    .filter((row) => writerIdentityMatches(row, {
      fullName: writer.fullName,
      ipiNumber: writer.ipiNumber,
      proName: writer.proName,
    }))
    .sort((left, right) => Number(right.is_active !== false) - Number(left.is_active !== false)
      || new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
}

async function getPublishingWriterRow(
  supabase: SupabaseClient<any>,
  writerId: string,
) {
  const { data, error } = await supabase
    .from("publishing_writers")
    .select(PUBLISHING_WRITER_SELECT)
    .eq("id", writerId)
    .maybeSingle<WriterJoinRow>()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load publishing writer.",
    })
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "Publishing writer was not found.",
    })
  }

  return data
}

async function mergePublishingWriters(
  supabase: SupabaseClient<any>,
  sourceWriterId: string,
  targetWriterId: string,
) {
  if (sourceWriterId === targetWriterId) {
    return
  }

  const { data: sourceLinks, error: sourceLinkError } = await supabase
    .from("artist_publishing_writers")
    .select("id, artist_id")
    .eq("writer_id", sourceWriterId)

  if (sourceLinkError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to merge writer artist links.",
    })
  }

  const { data: targetLinks, error: targetLinkError } = await supabase
    .from("artist_publishing_writers")
    .select("artist_id")
    .eq("writer_id", targetWriterId)

  if (targetLinkError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to merge writer artist links.",
    })
  }

  const targetArtistIds = new Set(((targetLinks ?? []) as Array<{ artist_id: string }>).map((link) => link.artist_id))
  const duplicateLinkIds = ((sourceLinks ?? []) as Array<{ id: string; artist_id: string }>)
    .filter((link) => targetArtistIds.has(link.artist_id))
    .map((link) => link.id)

  if (duplicateLinkIds.length) {
    const { error } = await supabase
      .from("artist_publishing_writers")
      .delete()
      .in("id", duplicateLinkIds)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to remove duplicate writer artist links.",
      })
    }
  }

  const { error: linkUpdateError } = await supabase
    .from("artist_publishing_writers")
    .update({ writer_id: targetWriterId })
    .eq("writer_id", sourceWriterId)

  if (linkUpdateError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to merge writer artist links.",
    })
  }

  const { error: registrationUpdateError } = await supabase
    .from("publishing_registration_track_writers")
    .update({ writer_id: targetWriterId })
    .eq("writer_id", sourceWriterId)

  if (registrationUpdateError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to merge writer registration history.",
    })
  }

  const { error: deleteError } = await supabase
    .from("publishing_writers")
    .delete()
    .eq("id", sourceWriterId)

  if (deleteError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to remove merged publishing writer.",
    })
  }
}

async function saveWriterFields(
  supabase: SupabaseClient<any>,
  writerId: string,
  writer: NormalizedWriterIdentityInput,
) {
  const { error } = await supabase
    .from("publishing_writers")
    .update({
      full_name: writer.fullName,
      first_name: writer.firstName,
      middle_name: writer.middleName,
      last_name: writer.lastName,
      ipi_number: writer.ipiNumber,
      pro_name: writer.proName,
      is_active: true,
      archived_at: null,
      archived_by: null,
    })
    .eq("id", writerId)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to update publishing writer.",
    })
  }
}

export async function updateAdminPublishingWriter(
  supabase: SupabaseClient<any>,
  writerId: string,
  input: AdminPublishingWriterUpdateInput,
): Promise<AdminPublishingWriterMutationResponse> {
  const current = await getPublishingWriterRow(supabase, writerId)
  const normalized = normalizeAdminPublishingWriterInput(input, current)
  const duplicate = (await findMatchingPublishingWriterRows(supabase, normalized, writerId))[0] ?? null
  let targetWriterId = writerId
  let mergedIntoWriterId: string | null = null

  if (duplicate) {
    targetWriterId = duplicate.id
    mergedIntoWriterId = duplicate.id
    await saveWriterFields(supabase, targetWriterId, normalized)
    await mergePublishingWriters(supabase, writerId, targetWriterId)
  } else {
    await saveWriterFields(supabase, writerId, normalized)
  }

  const writer = await loadAdminPublishingWriterById(supabase, targetWriterId)

  return {
    writer,
    mergedIntoWriterId,
    deleted: false,
    archived: false,
    restored: false,
  }
}

export async function deleteOrArchiveAdminPublishingWriter(
  supabase: SupabaseClient<any>,
  writerId: string,
  profileId: string,
): Promise<AdminPublishingWriterMutationResponse> {
  const current = await loadAdminPublishingWriterById(supabase, writerId)

  if (!current) {
    throw createError({
      statusCode: 404,
      statusMessage: "Publishing writer was not found.",
    })
  }

  if (current.registrationCount > 0) {
    const { error } = await supabase
      .from("publishing_writers")
      .update({
        is_active: false,
        archived_at: new Date().toISOString(),
        archived_by: profileId,
      })
      .eq("id", writerId)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to archive publishing writer.",
      })
    }

    return {
      writer: await loadAdminPublishingWriterById(supabase, writerId),
      mergedIntoWriterId: null,
      deleted: false,
      archived: true,
      restored: false,
    }
  }

  const { error: linkError } = await supabase
    .from("artist_publishing_writers")
    .delete()
    .eq("writer_id", writerId)

  if (linkError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to remove writer artist links.",
    })
  }

  const { error: writerError } = await supabase
    .from("publishing_writers")
    .delete()
    .eq("id", writerId)

  if (writerError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to delete publishing writer.",
    })
  }

  return {
    writer: null,
    mergedIntoWriterId: null,
    deleted: true,
    archived: false,
    restored: false,
  }
}

export async function restoreAdminPublishingWriter(
  supabase: SupabaseClient<any>,
  writerId: string,
): Promise<AdminPublishingWriterMutationResponse> {
  const current = await getPublishingWriterRow(supabase, writerId)
  const currentIdentity = normalizeAdminPublishingWriterInput({}, current)
  const duplicate = (await findMatchingPublishingWriterRows(supabase, currentIdentity, writerId))[0] ?? null
  let targetWriterId = writerId
  let mergedIntoWriterId: string | null = null

  if (duplicate) {
    targetWriterId = duplicate.id
    mergedIntoWriterId = duplicate.id
    await saveWriterFields(supabase, targetWriterId, currentIdentity)
    await mergePublishingWriters(supabase, writerId, targetWriterId)
  } else {
    const { error } = await supabase
      .from("publishing_writers")
      .update({
        is_active: true,
        archived_at: null,
        archived_by: null,
      })
      .eq("id", writerId)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to restore publishing writer.",
      })
    }
  }

  return {
    writer: await loadAdminPublishingWriterById(supabase, targetWriterId),
    mergedIntoWriterId,
    deleted: false,
    archived: false,
    restored: true,
  }
}

export async function loadCatalogTrackOptions(
  supabase: SupabaseClient<any>,
  artistIds?: string[],
) {
  let releaseIds: string[] | null = null

  if (artistIds?.length) {
    const { data: releaseRows, error: releaseError } = await supabase
      .from("releases")
      .select("id")
      .in("artist_id", artistIds)
      .or("status.is.null,status.neq.deleted")
      .order("release_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1500)

    if (releaseError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to load existing artist releases.",
      })
    }

    releaseIds = ((releaseRows ?? []) as Array<{ id: string }>).map((release) => release.id)

    if (!releaseIds.length) {
      return []
    }
  }

  let query = supabase
    .from("tracks")
    .select("id, title, isrc, status, release_id, releases!inner(id, title, artist_id, artists(id, name))")
    .or("status.is.null,status.neq.deleted")
    .order("title", { ascending: true })
    .limit(1500)

  if (releaseIds?.length) {
    query = query.in("release_id", releaseIds)
  }

  const { data, error } = await query

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load catalog tracks.",
    })
  }

  const trackRows = (data ?? []) as CatalogTrackRow[]
  const trackIds = trackRows.map((track) => track.id)
  const registrationStatusByTrackId = new Map<string, Exclude<PublishingRegistrationStatus, "rejected">>()

  if (trackIds.length) {
    let registrationQuery = supabase
      .from("publishing_registration_tracks")
      .select("track_id, status")
      .in("track_id", trackIds)
      .in("status", ["pending_review", "accepted"])
      .order("created_at", { ascending: false })

    if (artistIds?.length) {
      registrationQuery = registrationQuery.in("artist_id", artistIds)
    }

    const { data: registrationRows, error: registrationError } = await registrationQuery

    if (registrationError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to load registered publishing tracks.",
      })
    }

    for (const row of (registrationRows ?? []) as CatalogTrackRegistrationRow[]) {
      if (!row.track_id) {
        continue
      }

      const currentStatus = registrationStatusByTrackId.get(row.track_id)

      if (currentStatus === "accepted") {
        continue
      }

      registrationStatusByTrackId.set(row.track_id, row.status)
    }
  }

  return trackRows.map((track): PublishingCatalogTrackOption => {
    const release = unwrapJoinRow(track.releases)
    const artist = unwrapJoinRow(release?.artists)

    return {
      value: track.id,
      label: `${track.title} / ${release?.title ?? "Unknown release"}`,
      artistId: release?.artist_id ?? "",
      releaseId: release?.id ?? track.release_id,
      releaseTitle: release?.title ?? "Unknown release",
      trackTitle: track.title,
      isrc: track.isrc,
      performerName: artist?.name ?? "Unknown artist",
      registrationStatus: registrationStatusByTrackId.get(track.id) ?? null,
    }
  })
}

export async function resolveWriterForRegistration(input: {
  supabase: SupabaseClient<any>
  artistId: string
  profileId: string
  writer: NormalizedWriterInput
  scope: "artist" | "admin"
  relationSource: "artist_submission" | "admin_direct"
}) {
  const { supabase, artistId, profileId, writer, scope, relationSource } = input

  if (writer.writerId) {
    if (scope === "artist") {
      const { data, error } = await supabase
        .from("artist_publishing_writers")
        .select("id")
        .eq("artist_id", artistId)
        .eq("writer_id", writer.writerId)
        .maybeSingle()

      if (error) {
        throw createError({
          statusCode: 500,
          statusMessage: "Unable to verify the selected writer.",
        })
      }

      if (!data) {
        throw createError({
          statusCode: 403,
          statusMessage: "That writer is not available in this artist account.",
        })
      }
    }

    const { error: reactivateError } = await supabase
      .from("publishing_writers")
      .update({
        is_active: true,
        archived_at: null,
        archived_by: null,
      })
      .eq("id", writer.writerId)

    if (reactivateError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to restore selected publishing writer.",
      })
    }

    await linkWriterToArtist(supabase, artistId, writer.writerId, relationSource)
    return writer.writerId
  }

  const existingWriterId = await findExistingPublishingWriter(supabase, writer)

  if (existingWriterId) {
    await linkWriterToArtist(supabase, artistId, existingWriterId, relationSource)
    return existingWriterId
  }

  const insertedWriterId = await insertPublishingWriter({
    supabase,
    artistId,
    profileId,
    writer,
  })

  await linkWriterToArtist(supabase, artistId, insertedWriterId, relationSource)
  return insertedWriterId
}

async function insertPublishingWriter(input: {
  supabase: SupabaseClient<any>
  artistId: string
  profileId: string | null
  writer: Pick<NormalizedWriterInput, "fullName" | "firstName" | "middleName" | "lastName" | "ipiNumber" | "proName">
}) {
  const { supabase, artistId, profileId, writer } = input
  const { data, error } = await supabase
    .from("publishing_writers")
    .insert({
      full_name: writer.fullName,
      first_name: writer.firstName,
      middle_name: writer.middleName,
      last_name: writer.lastName,
      ipi_number: writer.ipiNumber,
      pro_name: writer.proName,
      is_active: true,
      archived_at: null,
      archived_by: null,
      created_by_profile_id: profileId,
      created_by_artist_id: artistId,
    })
    .select("id")
    .single()

  if (error || !data) {
    if (error?.code === "23505") {
      const existingWriterId = await findExistingPublishingWriter(supabase, {
        writerId: null,
        fullName: writer.fullName,
        firstName: writer.firstName,
        middleName: writer.middleName,
        lastName: writer.lastName,
        ipiNumber: writer.ipiNumber,
        proName: writer.proName,
        role: "Composition",
        sharePct: "100.00",
        collectRoyalties: true,
      })

      if (existingWriterId) {
        return existingWriterId
      }
    }

    throw createError({
      statusCode: 500,
      statusMessage: "Unable to save publishing writer.",
    })
  }

  return data.id as string
}

async function findExistingPublishingWriter(
  supabase: SupabaseClient<any>,
  writer: NormalizedWriterInput,
) {
  const normalizedIpi = normalizeWriterIdentityValue(writer.ipiNumber)
  let query = supabase
    .from("publishing_writers")
    .select(PUBLISHING_WRITER_SELECT)
    .limit(25)

  if (normalizedIpi) {
    query = query.ilike("ipi_number", writer.ipiNumber ?? "")
  } else {
    query = query
      .is("ipi_number", null)
      .ilike("full_name", writer.fullName)

    query = writer.proName ? query.ilike("pro_name", writer.proName) : query.is("pro_name", null)
  }

  const { data, error } = await query

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to verify existing publishing writer.",
    })
  }

  const existing = ((data ?? []) as WriterJoinRow[]).find((row) => writerIdentityMatches(row, writer))

  if (!existing) {
    return null
  }

  if (existing.is_active === false || existing.archived_at) {
    const { error: reactivateError } = await supabase
      .from("publishing_writers")
      .update({
        is_active: true,
        archived_at: null,
        archived_by: null,
      })
      .eq("id", existing.id)

    if (reactivateError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to restore existing publishing writer.",
      })
    }
  }

  return existing.id
}

export async function syncArtistPublishingInfoWriter(input: {
  supabase: SupabaseClient<any>
  artistId: string
  profileId: string | null
}) {
  const { supabase, artistId, profileId } = input
  const { data, error } = await supabase
    .from("artist_publishing_info")
    .select("artist_id, legal_name, ipi_number, pro_name")
    .eq("artist_id", artistId)
    .maybeSingle<ArtistPublishingInfoRow>()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load artist publishing information.",
    })
  }

  const fullName = normalizeOptionalText(data?.legal_name)

  if (!data || !fullName) {
    return null
  }

  const writer: NormalizedWriterInput = {
    writerId: null,
    fullName,
    firstName: null,
    middleName: null,
    lastName: null,
    ipiNumber: normalizeOptionalText(data.ipi_number),
    proName: normalizeOptionalText(data.pro_name),
    role: "Composition",
    sharePct: "100.00",
    collectRoyalties: true,
  }
  const writerId = await findExistingPublishingWriter(supabase, writer)
    ?? await insertPublishingWriter({
      supabase,
      artistId,
      profileId,
      writer,
    })

  const { error: staleLinkError } = await supabase
    .from("artist_publishing_writers")
    .delete()
    .eq("artist_id", artistId)
    .eq("source", "artist_publishing_info")
    .neq("writer_id", writerId)

  if (staleLinkError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to refresh artist publishing writer link.",
    })
  }

  await linkWriterToArtist(supabase, artistId, writerId, "artist_publishing_info")

  return writerId
}

export async function unlinkArtistPublishingInfoWriter(
  supabase: SupabaseClient<any>,
  artistId: string,
) {
  const { error } = await supabase
    .from("artist_publishing_writers")
    .delete()
    .eq("artist_id", artistId)
    .eq("source", "artist_publishing_info")

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to clear artist publishing writer link.",
    })
  }
}

export async function createPublishingRegistrationBatch(input: {
  supabase: SupabaseClient<any>
  artistId: string
  profileId: string
  batchSource: PublishingRegistrationSource
  writerScope: "artist" | "admin"
  relationSource: "artist_submission" | "admin_direct"
  initialTrackStatus: PublishingRegistrationStatus
  artistNotes: string | null
  adminNotes: string | null
  tracks: NormalizedTrackInput[]
}) {
  const {
    supabase,
    artistId,
    profileId,
    batchSource,
    writerScope,
    relationSource,
    initialTrackStatus,
    artistNotes,
    adminNotes,
    tracks,
  } = input
  const catalogTrackIds = tracks.map((track) => track.trackId).filter(Boolean) as string[]
  const catalogTrackById = new Map<string, CatalogTrackRow>()

  if (catalogTrackIds.length) {
    const duplicateTrackId = catalogTrackIds.find((trackId, index) => catalogTrackIds.indexOf(trackId) !== index)

    if (duplicateTrackId) {
      throw createError({
        statusCode: 400,
        statusMessage: "A catalog track can only be included once in a publishing registration.",
      })
    }

    const { data, error } = await supabase
      .from("tracks")
      .select("id, title, isrc, status, release_id, releases!inner(id, title, artist_id, artists(id, name))")
      .in("id", catalogTrackIds)
      .or("status.is.null,status.neq.deleted")

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to verify catalog tracks.",
      })
    }

    for (const row of (data ?? []) as CatalogTrackRow[]) {
      const release = unwrapJoinRow(row.releases)

      if (release?.artist_id === artistId) {
        catalogTrackById.set(row.id, row)
      }
    }

    const missingTrack = catalogTrackIds.find((trackId) => !catalogTrackById.has(trackId))

    if (missingTrack) {
      throw createError({
        statusCode: 403,
        statusMessage: "One or more catalog tracks are not available for this artist.",
      })
    }

    const { data: existingRegistrationRows, error: existingRegistrationError } = await supabase
      .from("publishing_registration_tracks")
      .select("track_id, status")
      .eq("artist_id", artistId)
      .in("track_id", catalogTrackIds)
      .in("status", ["pending_review", "accepted"])

    if (existingRegistrationError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to verify existing publishing registrations.",
      })
    }

    const existingRegistration = ((existingRegistrationRows ?? []) as CatalogTrackRegistrationRow[])
      .find((row) => row.track_id)

    if (existingRegistration?.track_id) {
      const trackTitle = catalogTrackById.get(existingRegistration.track_id)?.title ?? "This track"

      throw createError({
        statusCode: 409,
        statusMessage: `${trackTitle} is already registered for publishing.`,
      })
    }
  }

  await syncArtistPublishingInfoWriter({
    supabase,
    artistId,
    profileId,
  })

  const reviewedAt = initialTrackStatus === "pending_review" ? null : new Date().toISOString()
  const { data: batch, error: batchError } = await supabase
    .from("publishing_registration_batches")
    .insert({
      artist_id: artistId,
      submitted_by: profileId,
      source: batchSource,
      status: initialTrackStatus === "pending_review" ? "pending_review" : "accepted",
      artist_notes: artistNotes,
      admin_notes: adminNotes,
      reviewed_by: initialTrackStatus === "pending_review" ? null : profileId,
      reviewed_at: reviewedAt,
    })
    .select("id")
    .single()

  if (batchError || !batch) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to create publishing registration batch.",
    })
  }

  const trackIds: string[] = []

  try {
    for (const [trackIndex, track] of tracks.entries()) {
      const catalogTrack = track.trackId ? catalogTrackById.get(track.trackId) ?? null : null
      const release = unwrapJoinRow(catalogTrack?.releases)
      const artist = unwrapJoinRow(release?.artists)
      const songTitle = catalogTrack?.title ?? track.songTitle
      const performerName = artist?.name ?? track.performerName

      const { data: registrationTrack, error: trackError } = await supabase
        .from("publishing_registration_tracks")
        .insert({
          batch_id: batch.id,
          artist_id: artistId,
          track_id: track.trackId,
          release_id: release?.id ?? null,
          source: track.source,
          status: initialTrackStatus,
          song_title: songTitle,
          performer_name: performerName,
          spotify_url: track.spotifyUrl,
          submitted_by: profileId,
          reviewed_by: initialTrackStatus === "pending_review" ? null : profileId,
          reviewed_at: reviewedAt,
          admin_notes: adminNotes,
        })
        .select("id")
        .single()

      if (trackError || !registrationTrack) {
        throw createError({
          statusCode: 500,
          statusMessage: `Unable to save publishing track ${trackIndex + 1}.`,
        })
      }

      trackIds.push(registrationTrack.id)

      const writerRows = []

      for (const [writerIndex, writer] of track.writers.entries()) {
        const writerId = await resolveWriterForRegistration({
          supabase,
          artistId,
          profileId,
          writer,
          scope: writerScope,
          relationSource,
        })

        writerRows.push({
          registration_track_id: registrationTrack.id,
          writer_id: writerId,
          role: writer.role,
          share_pct: writer.sharePct,
          collect_royalties: writer.collectRoyalties,
          sort_order: writerIndex,
        })
      }

      const { error: writerError } = await supabase
        .from("publishing_registration_track_writers")
        .insert(writerRows)

      if (writerError) {
        console.error("Unable to save publishing registration writers", {
          trackIndex,
          registrationTrackId: registrationTrack.id,
          writerError: writerError.message,
          writerDetails: writerError.details,
          writerHint: writerError.hint,
          writerCode: writerError.code,
        })

        throw createError({
          statusCode: 400,
          statusMessage: writerError.message.includes("100 percent")
            ? "Publishing writer shares must total exactly 100% for each track."
            : `Unable to save writers for publishing track ${trackIndex + 1}.`,
        })
      }
    }
  } catch (error) {
    await supabase.from("publishing_registration_batches").delete().eq("id", batch.id)
    throw error
  }

  return {
    batchId: batch.id as string,
    trackIds,
  }
}

async function linkWriterToArtist(
  supabase: SupabaseClient<any>,
  artistId: string,
  writerId: string,
  source: ArtistPublishingWriterSource,
) {
  const { error } = await supabase
    .from("artist_publishing_writers")
    .upsert({
      artist_id: artistId,
      writer_id: writerId,
      source,
    }, {
      onConflict: "artist_id,writer_id",
      ignoreDuplicates: true,
    })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to scope this writer to the artist.",
    })
  }
}

export async function updateBatchReviewStatuses(
  supabase: SupabaseClient<any>,
  batchIds: string[],
  profileId: string,
  adminNotes: string | null,
) {
  for (const batchId of [...new Set(batchIds)]) {
    const { data, error } = await supabase
      .from("publishing_registration_tracks")
      .select("status")
      .eq("batch_id", batchId)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to refresh publishing batch status.",
      })
    }

    const statuses = (data ?? []).map((row: { status: PublishingRegistrationStatus }) => row.status)
    const hasPending = statuses.includes("pending_review")
    const hasAccepted = statuses.includes("accepted")
    const hasRejected = statuses.includes("rejected")
    const status = hasPending
      ? (hasAccepted || hasRejected ? "partially_reviewed" : "pending_review")
      : hasAccepted && !hasRejected
        ? "accepted"
        : hasRejected && !hasAccepted
          ? "rejected"
          : "partially_reviewed"

    const { error: updateError } = await supabase
      .from("publishing_registration_batches")
      .update({
        status,
        reviewed_by: hasPending ? null : profileId,
        reviewed_at: hasPending ? null : new Date().toISOString(),
        admin_notes: adminNotes,
      })
      .eq("id", batchId)

    if (updateError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to update publishing batch status.",
      })
    }
  }
}

export function emptyArtistPublishingResponse(): ArtistPublishingResponse {
  return {
    tracks: [],
    summary: {
      trackCount: 0,
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      artistCount: 0,
      writerCount: 0,
    },
    writerOptions: [],
    catalogTrackOptions: [],
    defaultWriter: null,
  }
}

export function emptyAdminPublishingRegistrationResponse(): AdminPublishingRegistrationResponse {
  return {
    tracks: [],
    summary: {
      trackCount: 0,
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      artistCount: 0,
      writerCount: 0,
    },
    artistOptions: [],
    writerOptions: [],
    catalogTrackOptions: [],
  }
}
