import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { mapNaadLinkRow, NAAD_LINK_COLUMNS } from "~~/server/utils/naadlinks"
import type { NaadLinksListResponse } from "~~/types/naadlinks"

export default defineEventHandler(async (event): Promise<NaadLinksListResponse> => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase
    .from("naad_links")
    .select(NAAD_LINK_COLUMNS)
    .order("created_at", { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { links: (data ?? []).map(mapNaadLinkRow) }
})
