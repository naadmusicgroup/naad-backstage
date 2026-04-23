import { createError } from "h3"
import type {
  AdminAnalyticsMetricOption,
  AdminAnalyticsMetricType,
  AdminAnalyticsPlatform,
  AdminAnalyticsRecord,
} from "~~/types/admin"

interface AnalyticsArtistJoinRow {
  id: string
  name: string
}

interface AnalyticsReleaseJoinRow {
  id: string
  title: string
}

interface AnalyticsProfileJoinRow {
  id: string
  full_name: string | null
  email: string | null
}

interface AnalyticsUploadJoinRow {
  id: string
  filename: string
}

export interface AnalyticsSnapshotRow {
  id: string
  artist_id: string
  release_id: string | null
  platform: AdminAnalyticsPlatform
  metric_type: AdminAnalyticsMetricType
  value: string | number
  period_month: string
  entered_by: string
  upload_id: string | null
  created_at: string
  updated_at: string
  artists: AnalyticsArtistJoinRow | AnalyticsArtistJoinRow[] | null
  releases: AnalyticsReleaseJoinRow | AnalyticsReleaseJoinRow[] | null
  profiles: AnalyticsProfileJoinRow | AnalyticsProfileJoinRow[] | null
  csv_uploads: AnalyticsUploadJoinRow | AnalyticsUploadJoinRow[] | null
}

export const ANALYTICS_METRIC_OPTIONS: AdminAnalyticsMetricOption[] = [
  { platform: "spotify", metricType: "monthly_listeners", label: "Spotify monthly listeners" },
  { platform: "apple_music", metricType: "streams", label: "Apple Music plays" },
  { platform: "tiktok", metricType: "video_creations", label: "TikTok video creations" },
  { platform: "meta", metricType: "impressions", label: "Meta / Instagram impressions" },
  { platform: "youtube", metricType: "views", label: "YouTube views" },
]

const METRIC_LABELS = new Map(
  ANALYTICS_METRIC_OPTIONS.map((option) => [`${option.platform}:${option.metricType}`, option.label]),
)
const VALID_METRICS = new Set(METRIC_LABELS.keys())
const INTEGER_PATTERN = /^\d+$/

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

export function analyticsMetricLabel(platform: AdminAnalyticsPlatform, metricType: AdminAnalyticsMetricType) {
  return METRIC_LABELS.get(`${platform}:${metricType}`) ?? `${platform} ${metricType}`
}

export function assertValidAnalyticsMetric(platform: unknown, metricType: unknown) {
  const normalizedPlatform = normalizeText(platform) as AdminAnalyticsPlatform
  const normalizedMetricType = normalizeText(metricType) as AdminAnalyticsMetricType

  if (!VALID_METRICS.has(`${normalizedPlatform}:${normalizedMetricType}`)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Analytics metric is invalid for the selected platform.",
    })
  }

  return {
    platform: normalizedPlatform,
    metricType: normalizedMetricType,
  }
}

export function normalizeAnalyticsValue(value: unknown) {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: "Analytics value is required.",
    })
  }

  if (!INTEGER_PATTERN.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Analytics value must be a whole number.",
    })
  }

  return normalized
}

export function statusCodeForAnalyticsError(error: any) {
  const message = String(error?.message ?? "")
  const code = String(error?.code ?? "")

  if (code === "23505" || message.includes("duplicate key")) {
    return 409
  }

  if (
    message.includes("is required")
    || message.includes("must be")
    || message.includes("invalid")
    || message.includes("does not belong")
  ) {
    return 400
  }

  if (message.includes("could not be found") || message.includes("does not exist")) {
    return 404
  }

  return 500
}

export function mapAdminAnalyticsRecord(row: AnalyticsSnapshotRow): AdminAnalyticsRecord {
  const artist = unwrapJoinRow(row.artists)
  const release = unwrapJoinRow(row.releases)
  const profile = unwrapJoinRow(row.profiles)
  const upload = unwrapJoinRow(row.csv_uploads)

  return {
    id: row.id,
    artistId: row.artist_id,
    artistName: artist?.name ?? "Unknown artist",
    releaseId: row.release_id,
    releaseTitle: release?.title ?? null,
    platform: row.platform,
    metricType: row.metric_type,
    label: analyticsMetricLabel(row.platform, row.metric_type),
    value: String(row.value ?? 0),
    periodMonth: row.period_month,
    enteredBy: row.entered_by,
    enteredByName: profile?.full_name?.trim() || profile?.email?.trim() || null,
    uploadId: row.upload_id,
    uploadFilename: upload?.filename ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
