import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { createError } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  adminArtistSelect,
  mapAdminArtistRows,
  type AdminArtistRow,
} from "~~/server/utils/admin-artists"
import type { AdminArtistsResponse } from "~~/types/settings"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase
    .from("artists")
    .select(adminArtistSelect)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  return {
    artists: await mapAdminArtistRows(supabase, (data ?? []) as AdminArtistRow[]),
  } satisfies AdminArtistsResponse
})

