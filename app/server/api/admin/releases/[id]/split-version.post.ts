import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  assertArtistExists,
  assertReleaseExists,
  normalizeEffectivePeriodMonth,
  normalizeOptionalText,
  normalizeRequiredSplitPct,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import { createReleaseSplitVersion, recordReleaseEvent } from "~~/server/utils/release-lifecycle"

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
  const releaseId = normalizeRequiredUuid(event.context.params?.id, "Release id")
  const body = await readBody<SplitVersionBody>(event)

  if (!Array.isArray(body.contributors)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Split contributors are required.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)
  await assertReleaseExists(supabase, releaseId)

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

  const version = await createReleaseSplitVersion(supabase, {
    releaseId,
    contributors,
    effectivePeriodMonth: normalizeEffectivePeriodMonth(body.effectivePeriodMonth),
    changeReason: normalizeOptionalText(body.changeReason),
    createdBy: profile.id,
    source: "admin",
  })

  await logAdminActivity(supabase, profile.id, "release.split.version.created", "release", releaseId, {
    effective_period_month: normalizeEffectivePeriodMonth(body.effectivePeriodMonth),
    contributor_count: contributors.length,
  })

  await recordReleaseEvent(supabase, {
    releaseId,
    eventType: "split_version_created",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      scope: "release",
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
