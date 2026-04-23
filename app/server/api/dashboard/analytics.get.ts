import { createError, getQuery } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import { toMoneyString } from "~~/server/utils/money"
import type {
  ArtistAnalyticsEarningsRow,
  ArtistAnalyticsPublishingRow,
  ArtistAnalyticsResponse,
  ArtistAnalyticsSnapshotRow,
} from "~~/types/dashboard"

interface AnalyticsSummaryRow {
  artist_id: string
  month: string
  channel_id: string | null
  territory: string | null
  release_id: string | null
  track_id: string | null
  revenue: string | number | null
}

interface PublishingRow {
  artist_id: string
  period_month: string
  amount: string | number | null
}

interface SnapshotRow {
  artist_id: string
  platform: ArtistAnalyticsSnapshotRow["platform"]
  metric_type: ArtistAnalyticsSnapshotRow["metricType"]
  value: number
  period_month: string
}

interface ChannelLookupRow {
  id: string
  raw_name: string
  display_name: string | null
}

interface ReleaseLookupRow {
  id: string
  title: string
}

interface TrackLookupRow {
  id: string
  title: string
}

const SNAPSHOT_LABELS: Record<string, string> = {
  "spotify:monthly_listeners": "Spotify monthly listeners",
  "apple_music:streams": "Apple Music plays",
  "tiktok:video_creations": "TikTok video creations",
  "meta:impressions": "Meta / Instagram impressions",
  "youtube:views": "YouTube views",
}

function snapshotLabel(platform: SnapshotRow["platform"], metricType: SnapshotRow["metric_type"]) {
  return SNAPSHOT_LABELS[`${platform}:${metricType}`] ?? `${platform} ${metricType}`
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const query = getQuery(event)
  const requestedArtistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")
  const supabase = serverSupabaseServiceRole(event)

  const { data: artistRows, error: artistError } = await supabase
    .from("artists")
    .select("id")
    .eq("user_id", profile.id)
    .eq("is_active", true)

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistError.message,
    })
  }

  const ownedArtistIds = (artistRows ?? []).map((artist) => artist.id)

  if (requestedArtistId && !ownedArtistIds.includes(requestedArtistId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only load analytics for artist profiles on your own account.",
    })
  }

  const artistIds = requestedArtistId ? [requestedArtistId] : ownedArtistIds

  if (!artistIds.length) {
    return {
      earningsRows: [] as ArtistAnalyticsEarningsRow[],
      publishingRows: [] as ArtistAnalyticsPublishingRow[],
      audienceSnapshots: [] as ArtistAnalyticsSnapshotRow[],
    } satisfies ArtistAnalyticsResponse
  }

  const [earningsResult, publishingResult, snapshotsResult] = await Promise.all([
    supabase
      .from("monthly_earnings_summary")
      .select("artist_id, month, channel_id, territory, release_id, track_id, revenue")
      .in("artist_id", artistIds),
    supabase
      .from("publishing_earnings")
      .select("artist_id, period_month, amount")
      .in("artist_id", artistIds),
    supabase
      .from("analytics_snapshots")
      .select("artist_id, platform, metric_type, value, period_month")
      .in("artist_id", artistIds),
  ])

  if (earningsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: earningsResult.error.message,
    })
  }

  if (publishingResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: publishingResult.error.message,
    })
  }

  if (snapshotsResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: snapshotsResult.error.message,
    })
  }

  const earningsRows = (earningsResult.data ?? []) as AnalyticsSummaryRow[]
  const publishingRows = (publishingResult.data ?? []) as PublishingRow[]
  const snapshotRows = (snapshotsResult.data ?? []) as SnapshotRow[]

  const channelIds = [...new Set(earningsRows.map((row) => row.channel_id).filter(Boolean) as string[])]
  const releaseIds = [...new Set(earningsRows.map((row) => row.release_id).filter(Boolean) as string[])]
  const trackIds = [...new Set(earningsRows.map((row) => row.track_id).filter(Boolean) as string[])]

  const [channelLookupResult, releaseLookupResult, trackLookupResult] = await Promise.all([
    channelIds.length
      ? supabase.from("channels").select("id, raw_name, display_name").in("id", channelIds)
      : Promise.resolve({ data: [] as ChannelLookupRow[], error: null }),
    releaseIds.length
      ? supabase.from("releases").select("id, title").in("id", releaseIds)
      : Promise.resolve({ data: [] as ReleaseLookupRow[], error: null }),
    trackIds.length
      ? supabase.from("tracks").select("id, title").in("id", trackIds)
      : Promise.resolve({ data: [] as TrackLookupRow[], error: null }),
  ])

  if (channelLookupResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: channelLookupResult.error.message,
    })
  }

  if (releaseLookupResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: releaseLookupResult.error.message,
    })
  }

  if (trackLookupResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: trackLookupResult.error.message,
    })
  }

  const channelById = new Map(
    ((channelLookupResult.data ?? []) as ChannelLookupRow[]).map((row) => [row.id, row.display_name || row.raw_name]),
  )
  const releaseById = new Map(
    ((releaseLookupResult.data ?? []) as ReleaseLookupRow[]).map((row) => [row.id, row]),
  )
  const trackById = new Map(
    ((trackLookupResult.data ?? []) as TrackLookupRow[]).map((row) => [row.id, row]),
  )

  const publishingByMonth = new Map<string, Decimal>()

  for (const row of publishingRows) {
    publishingByMonth.set(
      row.period_month,
      (publishingByMonth.get(row.period_month) ?? new Decimal(0)).add(row.amount ?? 0),
    )
  }

  return {
    earningsRows: earningsRows
      .map((row) => {
        const release = row.release_id ? releaseById.get(row.release_id) : null
        const track = row.track_id ? trackById.get(row.track_id) : null

        return {
          periodMonth: row.month,
          channelId: row.channel_id,
          channelName: row.channel_id ? channelById.get(row.channel_id) ?? "Unknown channel" : "Unassigned channel",
          territory: row.territory,
          releaseId: row.release_id,
          releaseTitle: row.release_id ? (release?.title ?? null) : null,
          trackId: row.track_id,
          trackTitle: row.track_id ? (track?.title ?? null) : null,
          revenue: toMoneyString(new Decimal(row.revenue ?? 0)),
        } satisfies ArtistAnalyticsEarningsRow
      })
      .sort((left, right) => {
        const monthCompare = right.periodMonth.localeCompare(left.periodMonth)

        if (monthCompare !== 0) {
          return monthCompare
        }

        return Number(right.revenue) - Number(left.revenue)
      }),
    publishingRows: [...publishingByMonth.entries()]
      .sort((left, right) => right[0].localeCompare(left[0]))
      .map(([periodMonth, amount]) => ({
        periodMonth,
        amount: toMoneyString(amount),
      })) satisfies ArtistAnalyticsPublishingRow[],
    audienceSnapshots: snapshotRows
      .map((row) => ({
        periodMonth: row.period_month,
        platform: row.platform,
        metricType: row.metric_type,
        label: snapshotLabel(row.platform, row.metric_type),
        value: Number(row.value ?? 0),
      }))
      .sort((left, right) => {
        const monthCompare = right.periodMonth.localeCompare(left.periodMonth)

        if (monthCompare !== 0) {
          return monthCompare
        }

        return left.label.localeCompare(right.label)
      }) satisfies ArtistAnalyticsSnapshotRow[],
  } satisfies ArtistAnalyticsResponse
})

