import { createError } from "h3"
import Decimal from "decimal.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { toMoneyString } from "~~/server/utils/money"
import type {
  AdminActivityLogRecord,
  AdminChannelRegistryRecord,
  AdminSettingsResponse,
  AdminStatementPeriodRecord,
  ArchivedReleaseRecord,
  ArchivedTrackRecord,
  OrphanedArtistRecord,
} from "~~/types/settings"

interface StatementPeriodRow {
  id: string
  artist_id: string
  period_month: string
  status: "open" | "closed"
  closed_at: string | null
  closed_by: string | null
  created_at: string
  updated_at: string
}

interface ActivityLogRow {
  id: string
  admin_id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

interface ArchivedArtistRow {
  id: string
  user_id: string | null
  name: string
  email: string | null
  country: string | null
  bio: string | null
  created_at: string
  deactivated_at: string | null
  profiles: {
    full_name: string | null
  } | Array<{ full_name: string | null }> | null
}

interface ArchivedReleaseRow {
  id: string
  artist_id: string
  title: string
  type: string
  upc: string | null
  release_date: string | null
  updated_at: string
}

interface ArchivedTrackRow {
  id: string
  release_id: string
  title: string
  isrc: string
  track_number: number | null
  updated_at: string
}

interface ArtistLookupRow {
  id: string
  name: string
  is_active: boolean
}

interface ProfileLookupRow {
  id: string
  full_name: string | null
}

interface ReleaseLookupRow {
  id: string
  title: string
  artist_id: string
}

interface StatementSummaryRow {
  artist_id: string
  month: string
  channel_id: string | null
  territory: string | null
  release_id: string | null
  revenue: string | number | null
}

interface PublishingSummaryRow {
  artist_id: string
  period_month: string
  amount: string | number | null
}

interface UploadSummaryRow {
  id: string
  artist_id: string
  period_month: string
}

interface ChannelRow {
  id: string
  raw_name: string
  display_name: string | null
  icon_url: string | null
  color: string | null
  created_at: string
  updated_at: string
}

interface StatementPeriodAccumulator {
  earnings: Decimal
  publishing: Decimal
  uploadCount: number
  channelIds: Set<string>
  territories: Set<string>
  releaseIds: Set<string>
}

function makePeriodKey(artistId: string, periodMonth: string) {
  return `${artistId}:${periodMonth}`
}

function detailsRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

async function loadDeletedReleases(supabase: SupabaseClient<any>) {
  const result = await supabase
    .from("releases")
    .select("id, artist_id, title, type, upc, release_date, updated_at")
    .eq("status", "deleted")
    .order("updated_at", { ascending: false })

  throwIfError(result.error, "Unable to load deleted releases.")
  return (result.data ?? []) as ArchivedReleaseRow[]
}

async function loadDeletedTracks(supabase: SupabaseClient<any>) {
  const result = await supabase
    .from("tracks")
    .select("id, release_id, title, isrc, track_number, updated_at")
    .eq("status", "deleted")
    .order("updated_at", { ascending: false })

  throwIfError(result.error, "Unable to load deleted tracks.")
  return (result.data ?? []) as ArchivedTrackRow[]
}

async function countDeletedReleases(supabase: SupabaseClient<any>) {
  const result = await supabase
    .from("releases")
    .select("id", { count: "exact", head: true })
    .eq("status", "deleted")

  throwIfError(result.error, "Unable to count deleted releases.")
  return result.count ?? 0
}

async function countDeletedTracks(supabase: SupabaseClient<any>) {
  const result = await supabase
    .from("tracks")
    .select("id", { count: "exact", head: true })
    .eq("status", "deleted")

  throwIfError(result.error, "Unable to count deleted tracks.")
  return result.count ?? 0
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const [
    statementPeriodsResult,
    activityLogResult,
    archivedArtistsResult,
    archivedReleaseRows,
    archivedTrackRows,
    channelsResult,
    openCountResult,
    closedCountResult,
    archivedArtistCountResult,
    archivedReleaseCount,
    archivedTrackCount,
    activityCountResult,
    channelCountResult,
  ] = await Promise.all([
    supabase
      .from("statement_periods")
      .select("id, artist_id, period_month, status, closed_at, closed_by, created_at, updated_at")
      .order("period_month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("admin_activity_log")
      .select("id, admin_id, action, entity_type, entity_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("artists")
      .select("id, user_id, name, email, country, bio, created_at, deactivated_at, profiles!artists_user_id_fkey(full_name)")
      .eq("is_active", false)
      .order("deactivated_at", { ascending: false, nullsFirst: false }),
    loadDeletedReleases(supabase),
    loadDeletedTracks(supabase),
    supabase
      .from("channels")
      .select("id, raw_name, display_name, icon_url, color, created_at, updated_at")
      .order("display_name", { ascending: true })
      .order("raw_name", { ascending: true }),
    supabase.from("statement_periods").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("statement_periods").select("id", { count: "exact", head: true }).eq("status", "closed"),
    supabase.from("artists").select("id", { count: "exact", head: true }).eq("is_active", false),
    countDeletedReleases(supabase),
    countDeletedTracks(supabase),
    supabase.from("admin_activity_log").select("id", { count: "exact", head: true }),
    supabase.from("channels").select("id", { count: "exact", head: true }),
  ])

  throwIfError(statementPeriodsResult.error, "Unable to load statement periods.")
  throwIfError(activityLogResult.error, "Unable to load admin activity.")
  throwIfError(archivedArtistsResult.error, "Unable to load orphaned artists.")
  throwIfError(channelsResult.error, "Unable to load channels.")
  throwIfError(openCountResult.error, "Unable to count open statement periods.")
  throwIfError(closedCountResult.error, "Unable to count closed statement periods.")
  throwIfError(archivedArtistCountResult.error, "Unable to count orphaned artists.")
  throwIfError(activityCountResult.error, "Unable to count admin activity log rows.")
  throwIfError(channelCountResult.error, "Unable to count channels.")

  const statementPeriodRows = (statementPeriodsResult.data ?? []) as StatementPeriodRow[]
  const activityLogRows = (activityLogResult.data ?? []) as ActivityLogRow[]
  const archivedArtistRows = (archivedArtistsResult.data ?? []) as ArchivedArtistRow[]
  const channelRows = (channelsResult.data ?? []) as ChannelRow[]

  const artistIds = new Set<string>()
  const releaseIds = new Set<string>()
  const profileIds = new Set<string>()

  for (const row of statementPeriodRows) {
    artistIds.add(row.artist_id)
    if (row.closed_by) {
      profileIds.add(row.closed_by)
    }
  }

  for (const row of archivedReleaseRows) {
    artistIds.add(row.artist_id)
  }

  for (const row of archivedTrackRows) {
    releaseIds.add(row.release_id)
  }

  for (const row of activityLogRows) {
    profileIds.add(row.admin_id)
  }

  let releaseLookupRows: ReleaseLookupRow[] = []

  if (releaseIds.size) {
    const result = await supabase
      .from("releases")
      .select("id, title, artist_id")
      .in("id", [...releaseIds])

    throwIfError(result.error, "Unable to load release archive context.")
    releaseLookupRows = (result.data ?? []) as ReleaseLookupRow[]

    for (const row of releaseLookupRows) {
      artistIds.add(row.artist_id)
    }
  }

  let artistLookupRows: ArtistLookupRow[] = []

  if (artistIds.size) {
    const result = await supabase
      .from("artists")
      .select("id, name, is_active")
      .in("id", [...artistIds])

    throwIfError(result.error, "Unable to load artist settings context.")
    artistLookupRows = (result.data ?? []) as ArtistLookupRow[]
  }

  let profileLookupRows: ProfileLookupRow[] = []

  if (profileIds.size) {
    const result = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...profileIds])

    throwIfError(result.error, "Unable to load admin profile context.")
    profileLookupRows = (result.data ?? []) as ProfileLookupRow[]
  }

  const artistById = new Map<string, ArtistLookupRow>(artistLookupRows.map((row) => [row.id, row]))
  const profileById = new Map<string, ProfileLookupRow>(profileLookupRows.map((row) => [row.id, row]))
  const releaseById = new Map<string, ReleaseLookupRow>(releaseLookupRows.map((row) => [row.id, row]))

  const statementPeriodArtistIds = [...new Set(statementPeriodRows.map((row) => row.artist_id))]
  const periodMonths = [...new Set(statementPeriodRows.map((row) => row.period_month))]
  const statementMetrics = new Map<string, StatementPeriodAccumulator>()

  if (statementPeriodArtistIds.length && periodMonths.length) {
    const [summaryResult, publishingResult, uploadResult] = await Promise.all([
      supabase
        .from("monthly_earnings_summary")
        .select("artist_id, month, channel_id, territory, release_id, revenue")
        .in("artist_id", statementPeriodArtistIds)
        .in("month", periodMonths),
      supabase
        .from("publishing_earnings")
        .select("artist_id, period_month, amount")
        .in("artist_id", statementPeriodArtistIds)
        .in("period_month", periodMonths),
      supabase
        .from("csv_uploads")
        .select("id, artist_id, period_month")
        .in("artist_id", statementPeriodArtistIds)
        .in("period_month", periodMonths)
        .in("status", ["completed", "reversed"]),
    ])

    throwIfError(summaryResult.error, "Unable to load statement summary totals.")
    throwIfError(publishingResult.error, "Unable to load publishing statement totals.")
    throwIfError(uploadResult.error, "Unable to load upload counts.")

    const getAccumulator = (artistId: string, periodMonth: string) => {
      const key = makePeriodKey(artistId, periodMonth)
      const existing = statementMetrics.get(key)

      if (existing) {
        return existing
      }

      const next: StatementPeriodAccumulator = {
        earnings: new Decimal(0),
        publishing: new Decimal(0),
        uploadCount: 0,
        channelIds: new Set<string>(),
        territories: new Set<string>(),
        releaseIds: new Set<string>(),
      }

      statementMetrics.set(key, next)
      return next
    }

    for (const row of (summaryResult.data ?? []) as StatementSummaryRow[]) {
      const accumulator = getAccumulator(row.artist_id, row.month)
      accumulator.earnings = accumulator.earnings.add(row.revenue ?? 0)

      if (row.channel_id) {
        accumulator.channelIds.add(row.channel_id)
      }

      if (row.territory) {
        accumulator.territories.add(row.territory)
      }

      if (row.release_id) {
        accumulator.releaseIds.add(row.release_id)
      }
    }

    for (const row of (publishingResult.data ?? []) as PublishingSummaryRow[]) {
      const accumulator = getAccumulator(row.artist_id, row.period_month)
      accumulator.publishing = accumulator.publishing.add(row.amount ?? 0)
    }

    for (const row of (uploadResult.data ?? []) as UploadSummaryRow[]) {
      const accumulator = getAccumulator(row.artist_id, row.period_month)
      accumulator.uploadCount += 1
    }
  }

  const statementPeriods = statementPeriodRows.map((row) => {
    const artist = artistById.get(row.artist_id)
    const closedBy = row.closed_by ? profileById.get(row.closed_by) : null
    const metrics = statementMetrics.get(makePeriodKey(row.artist_id, row.period_month))

    return {
      id: row.id,
      artistId: row.artist_id,
      artistName: artist?.name ?? "Unknown artist",
      artistIsActive: artist?.is_active ?? false,
      periodMonth: row.period_month,
      status: row.status,
      closedAt: row.closed_at,
      closedByAdminId: row.closed_by,
      closedByAdminName: closedBy?.full_name ?? null,
      earnings: toMoneyString(metrics?.earnings ?? new Decimal(0)),
      publishing: toMoneyString(metrics?.publishing ?? new Decimal(0)),
      uploadCount: metrics?.uploadCount ?? 0,
      channelCount: metrics?.channelIds.size ?? 0,
      territoryCount: metrics?.territories.size ?? 0,
      releaseCount: metrics?.releaseIds.size ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies AdminStatementPeriodRecord
  })

  const activityLog = activityLogRows.map((row) => ({
    id: row.id,
    adminId: row.admin_id,
    adminName: profileById.get(row.admin_id)?.full_name ?? null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    details: detailsRecord(row.details),
    createdAt: row.created_at,
  })) satisfies AdminActivityLogRecord[]

  const orphanedArtists = archivedArtistRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    fullName: Array.isArray(row.profiles) ? (row.profiles[0]?.full_name ?? null) : (row.profiles?.full_name ?? null),
    country: row.country,
    bio: row.bio,
    createdAt: row.created_at,
    deactivatedAt: row.deactivated_at,
  })) satisfies OrphanedArtistRecord[]

  const archivedReleases = archivedReleaseRows.map((row) => ({
    id: row.id,
    artistId: row.artist_id,
    artistName: artistById.get(row.artist_id)?.name ?? "Unknown artist",
    title: row.title,
    type: row.type,
    upc: row.upc,
    releaseDate: row.release_date,
    updatedAt: row.updated_at,
  })) satisfies ArchivedReleaseRecord[]

  const archivedTracks = archivedTrackRows.map((row) => {
    const release = releaseById.get(row.release_id)
    const artist = release ? artistById.get(release.artist_id) : null

    return {
      id: row.id,
      artistId: release?.artist_id ?? "",
      artistName: artist?.name ?? "Unknown artist",
      releaseId: row.release_id,
      releaseTitle: release?.title ?? "Unknown release",
      title: row.title,
      isrc: row.isrc,
      trackNumber: row.track_number,
      updatedAt: row.updated_at,
    } satisfies ArchivedTrackRecord
  })

  const channels = channelRows.map((row) => ({
    id: row.id,
    rawName: row.raw_name,
    displayName: row.display_name,
    iconUrl: row.icon_url,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) satisfies AdminChannelRegistryRecord[]

  return {
    summary: {
      openStatementCount: openCountResult.count ?? 0,
      closedStatementCount: closedCountResult.count ?? 0,
      orphanedArtistCount: archivedArtistCountResult.count ?? 0,
      archivedReleaseCount,
      archivedTrackCount,
      activityLogCount: activityCountResult.count ?? 0,
      channelCount: channelCountResult.count ?? 0,
    },
    statementPeriods,
    activityLog,
    orphanedArtists,
    archived: {
      releases: archivedReleases,
      tracks: archivedTracks,
    },
    channels,
  } satisfies AdminSettingsResponse
})

