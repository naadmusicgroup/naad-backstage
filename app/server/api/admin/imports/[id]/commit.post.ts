import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { CsvCommitResponse, ManualAnalyticsInput } from "~~/types/imports"

interface CommitBody {
  analytics?: Partial<ManualAnalyticsInput>
}

function normalizeMetric(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return null
  }

  const normalized = String(value).trim()

  if (!/^\d+$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a whole number.`,
    })
  }

  return Number(normalized)
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const uploadId = normalizeRequiredUuid(event.context.params?.id, "Upload id")

  const body = await readBody<CommitBody>(event)
  const analyticsPayload: ManualAnalyticsInput = {
    spotifyMonthlyListeners: normalizeMetric(body.analytics?.spotifyMonthlyListeners, "Spotify monthly listeners"),
    appleMusicPlays: normalizeMetric(body.analytics?.appleMusicPlays, "Apple Music plays"),
    tikTokVideoCreations: normalizeMetric(body.analytics?.tikTokVideoCreations, "TikTok video creations"),
    metaImpressions: normalizeMetric(body.analytics?.metaImpressions, "Meta impressions"),
    youtubeViews: normalizeMetric(body.analytics?.youtubeViews, "YouTube views"),
  }

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase.rpc("commit_csv_upload", {
    target_upload_id: uploadId,
    actor_admin_id: profile.id,
    analytics_payload: analyticsPayload,
  })

  if (error || !data) {
    throw createError({
      statusCode: 409,
      statusMessage: error?.message || "Unable to commit this upload.",
    })
  }

  return data as CsvCommitResponse
})
