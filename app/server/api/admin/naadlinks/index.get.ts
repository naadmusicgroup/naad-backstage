import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { mapNaadLinkRow } from "~~/server/utils/naadlinks"
import type { NaadLinksListResponse } from "~~/types/naadlinks"

export default defineEventHandler(async (event): Promise<NaadLinksListResponse> => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase
    .from("naad_links")
    .select("id, slug, artist_id, release_id, track_id, title, artist_name, payload, status, created_at, updated_at")
    .order("created_at", { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { links: (data ?? []).map(mapNaadLinkRow) }
})
