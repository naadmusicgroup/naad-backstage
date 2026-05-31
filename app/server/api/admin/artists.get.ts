import { getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { fetchAllPages, throwSupabaseError } from "~~/server/utils/supabase-pagination"
import type { ImportArtistOption } from "~~/types/imports"
import type { AdminArtistsResponse } from "~~/types/settings"

function surfaceFromQuery(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const surface = surfaceFromQuery(query.surface)
  const supabase = serverSupabaseServiceRole(event)

  if (surface === "options") {
    const rows = await fetchAllPages<ImportArtistOption>(
      "Unable to load artist options.",
      (from, to) => supabase
        .from("artists")
        .select("id, name, email")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    )

    return {
      artists: rows,
    }
  }

  const { data, error } = await supabase.rpc("get_admin_artists_payload")

  throwSupabaseError(error, "Unable to load artists.")

  return (data ?? { artists: [] }) as AdminArtistsResponse
})

