import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { getTrackArchiveRisk } from "~~/server/utils/catalog-archive-risk"
import type { AdminArchiveRiskResponse } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const trackId = normalizeRequiredUuid(event.context.params?.id, "Track id")
  const supabase = serverSupabaseServiceRole(event)

  return await getTrackArchiveRisk(supabase, trackId) satisfies AdminArchiveRiskResponse
})
