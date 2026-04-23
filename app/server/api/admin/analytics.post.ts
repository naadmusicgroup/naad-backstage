import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  normalizeEffectivePeriodMonth,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import {
  assertValidAnalyticsMetric,
  normalizeAnalyticsValue,
  statusCodeForAnalyticsError,
} from "~~/server/utils/analytics"
import type { AdminAnalyticsMutationInput, AdminAnalyticsMutationResponse } from "~~/types/admin"

function normalizeOptionalReleaseId(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "none") {
    return null
  }

  return normalizeRequiredUuid(value, "Release id")
}

async function assertReleaseBelongsToArtist(supabase: any, artistId: string, releaseId: string | null) {
  if (!releaseId) {
    return
  }

  const { data, error } = await supabase
    .from("releases")
    .select("id")
    .eq("id", releaseId)
    .eq("artist_id", artistId)
    .neq("status", "deleted")
    .maybeSingle()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!data) {
    throw createError({
      statusCode: 400,
      statusMessage: "The selected release does not belong to this artist.",
    })
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<AdminAnalyticsMutationInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist id")
  const releaseId = normalizeOptionalReleaseId(body.releaseId)
  const periodMonth = normalizeEffectivePeriodMonth(body.periodMonth, "Period month")
  const value = normalizeAnalyticsValue(body.value)
  const { platform, metricType } = assertValidAnalyticsMetric(body.platform, body.metricType)
  const supabase = serverSupabaseServiceRole(event)

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id")
    .eq("id", artistId)
    .eq("is_active", true)
    .maybeSingle()

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistError.message,
    })
  }

  if (!artist) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected artist does not exist.",
    })
  }

  await assertReleaseBelongsToArtist(supabase, artistId, releaseId)

  const { data, error } = await supabase
    .from("analytics_snapshots")
    .insert({
      artist_id: artistId,
      release_id: releaseId,
      platform,
      metric_type: metricType,
      value,
      period_month: periodMonth,
      entered_by: profile.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw createError({
      statusCode: statusCodeForAnalyticsError(error),
      statusMessage: error?.code === "23505"
        ? "An analytics snapshot already exists for this artist, release, metric, and month."
        : error?.message || "Unable to create this analytics snapshot.",
    })
  }

  await logAdminActivity(supabase, profile.id, "analytics.created", "analytics_snapshot", data.id, {
    artist_id: artistId,
    release_id: releaseId,
    platform,
    metric_type: metricType,
    value,
    period_month: periodMonth,
  })

  return {
    entryId: data.id,
  } satisfies AdminAnalyticsMutationResponse
})
