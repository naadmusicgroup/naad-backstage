import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  assertTrackExists,
  normalizeEffectivePeriodMonth,
  normalizeOptionalText,
  normalizeRequiredSplitPct,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import { createTrackSplitVersion, recordReleaseEvent } from "~~/server/utils/release-lifecycle"

interface SplitVersionBody {
  effectivePeriodMonth: string
  changeReason?: string | null
  contributors: Array<{
    artistId: string
    role: string
    splitPct: number | string
  }>
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const trackId = normalizeRequiredUuid(event.context.params?.id, "Track id")
  const body = await readBody<SplitVersionBody>(event)

  if (!Array.isArray(body.contributors)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Split contributors are required.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)
  const track = await assertTrackExists(supabase, trackId)

  const contributors = []

  for (const contributor of body.contributors) {
    const artistId = normalizeRequiredUuid(contributor.artistId, "Collaborator artist")
    await assertArtistExists(supabase, artistId)
    contributors.push({
      artistId,
      role: normalizeRequiredText(contributor.role, "Collaborator role"),
      splitPct: normalizeRequiredSplitPct(contributor.splitPct, "Split percentage"),
    })
  }

  const version = await createTrackSplitVersion(supabase, {
    trackId,
    releaseId: track.release_id,
    contributors,
    effectivePeriodMonth: normalizeEffectivePeriodMonth(body.effectivePeriodMonth),
    changeReason: normalizeOptionalText(body.changeReason),
    createdBy: profile.id,
    source: "admin",
  })

  await logAdminActivity(supabase, profile.id, "track.split.version.created", "track", trackId, {
    release_id: track.release_id,
    effective_period_month: normalizeEffectivePeriodMonth(body.effectivePeriodMonth),
    contributor_count: contributors.length,
  })

  await recordReleaseEvent(supabase, {
    releaseId: track.release_id,
    eventType: "split_version_created",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      scope: "track",
      trackId,
      effectivePeriodMonth: version?.effectivePeriodMonth ?? body.effectivePeriodMonth,
      contributorCount: contributors.length,
      changeReason: normalizeOptionalText(body.changeReason),
    },
  })

  return {
    ok: true,
    version,
  }
})
