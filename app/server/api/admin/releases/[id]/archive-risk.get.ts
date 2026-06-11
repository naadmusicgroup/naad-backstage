import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { getReleaseArchiveRisk } from "~~/server/utils/catalog-archive-risk"
import type { AdminArchiveRiskResponse } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const releaseId = normalizeRequiredUuid(event.context.params?.id, "Release id")
  const supabase = serverSupabaseServiceRole(event)

  return await getReleaseArchiveRisk(supabase, releaseId) satisfies AdminArchiveRiskResponse
})
