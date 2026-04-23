import { readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { assertTrackExists, normalizeRequiredUuid, normalizeTrackCreditsInput } from "~~/server/utils/catalog"
import { recordReleaseEvent, replaceTrackCredits } from "~~/server/utils/release-lifecycle"
import type { ReplaceTrackCreditsInput } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const trackId = normalizeRequiredUuid(event.context.params?.id, "Track id")
  const body = await readBody<ReplaceTrackCreditsInput>(event)
  const credits = normalizeTrackCreditsInput(body.credits)
  const supabase = serverSupabaseServiceRole(event)

  const track = await assertTrackExists(supabase, trackId)

  const savedCredits = await replaceTrackCredits(supabase, {
    trackId,
    credits,
    profileId: profile.id,
  })

  await logAdminActivity(supabase, profile.id, "track.credits.updated", "track", trackId, {
    release_id: track.release_id,
    credit_count: credits.length,
  })

  await recordReleaseEvent(supabase, {
    releaseId: track.release_id,
    eventType: "credits_changed",
    actorRole: "admin",
    actorProfileId: profile.id,
    payload: {
      trackId,
      creditCount: credits.length,
    },
  })

  return {
    ok: true,
    credits: savedCredits,
  }
})
