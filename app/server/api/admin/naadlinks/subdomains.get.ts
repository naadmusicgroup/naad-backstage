import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"

/** All per-artist NaadLink subdomains + their verified state (for the admin UI). */
export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data, error } = await supabase
    .from("naadlink_subdomains")
    .select("artist_id, subdomain, verified, verified_at")

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    subdomains: (data ?? []).map((row) => ({
      artistId: row.artist_id as string,
      subdomain: row.subdomain as string,
      verified: Boolean(row.verified),
      verifiedAt: (row.verified_at as string | null) ?? null,
    })),
  }
})
