import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  ANALYTICS_METRIC_OPTIONS,
  mapAdminAnalyticsRecord,
  type AnalyticsSnapshotRow,
} from "~~/server/utils/analytics"
import type { AdminAnalyticsOption, AdminAnalyticsResponse } from "~~/types/admin"

interface ArtistOptionRow {
  id: string
  name: string
}

interface ReleaseOptionRow {
  id: string
  artist_id: string
  title: string
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

function addIntegerStrings(leftValue: string, rightValue: string) {
  let carry = 0
  let result = ""
  let leftIndex = leftValue.length - 1
  let rightIndex = rightValue.length - 1

  while (leftIndex >= 0 || rightIndex >= 0 || carry) {
    const leftDigit = leftIndex >= 0 ? Number(leftValue[leftIndex]) : 0
    const rightDigit = rightIndex >= 0 ? Number(rightValue[rightIndex]) : 0
    const total = leftDigit + rightDigit + carry
    result = String(total % 10) + result
    carry = Math.floor(total / 10)
    leftIndex -= 1
    rightIndex -= 1
  }

  return result || "0"
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const [entriesResult, artistsResult, releasesResult] = await Promise.all([
    supabase
      .from("analytics_snapshots")
      .select(
        "id, artist_id, release_id, platform, metric_type, value, period_month, entered_by, upload_id, created_at, updated_at, artists(id, name), releases(id, title), profiles(id, full_name, email), csv_uploads(id, filename)",
      )
      .order("period_month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("artists")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("releases")
      .select("id, artist_id, title")
      .neq("status", "deleted")
      .order("title", { ascending: true }),
  ])

  throwIfError(entriesResult.error, "Unable to load analytics snapshots.")
  throwIfError(artistsResult.error, "Unable to load artist options.")
  throwIfError(releasesResult.error, "Unable to load release options.")

  const entries = ((entriesResult.data ?? []) as AnalyticsSnapshotRow[]).map(mapAdminAnalyticsRecord)
  const releaseIds = new Set(entries.map((entry) => entry.releaseId).filter(Boolean) as string[])
  const artistIds = new Set(entries.map((entry) => entry.artistId))
  const periodMonths = new Set(entries.map((entry) => entry.periodMonth))
  const totalValue = entries.reduce((sum, entry) => addIntegerStrings(sum, entry.value), "0")
  const uploadLinkedEntryCount = entries.filter((entry) => entry.uploadId).length

  return {
    entries,
    summary: {
      entryCount: entries.length,
      manualEntryCount: entries.length - uploadLinkedEntryCount,
      uploadLinkedEntryCount,
      totalValue,
      artistCount: artistIds.size,
      releaseCount: releaseIds.size,
      periodCount: periodMonths.size,
    },
    artistOptions: ((artistsResult.data ?? []) as ArtistOptionRow[]).map((row) => ({
      value: row.id,
      label: row.name,
    })) satisfies AdminAnalyticsOption[],
    releaseOptions: ((releasesResult.data ?? []) as ReleaseOptionRow[]).map((row) => ({
      value: row.id,
      label: row.title,
      meta: row.artist_id,
    })) satisfies AdminAnalyticsOption[],
    metricOptions: ANALYTICS_METRIC_OPTIONS,
  } satisfies AdminAnalyticsResponse
})
