import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { setViewAsArtistCookie } from "~~/server/utils/impersonation"
import { logAdminActivity } from "~~/server/utils/admin-log"
import type { ArtistImpersonationMutationResponse, StartArtistImpersonationInput } from "~~/types/auth"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<StartArtistImpersonationInput>(event)
  const artistId = normalizeRequiredUuid(body?.artistId, "Artist id")
  const supabase = serverSupabaseServiceRole(event)

  const { data: artist, error } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", artistId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!artist) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected artist is not active or does not exist.",
    })
  }

  setViewAsArtistCookie(event, artist.id)

  await logAdminActivity(supabase, profile.id, "artist.view_as.started", "artist", artist.id, {
    artist_name: artist.name,
  })

  return {
    ok: true,
    artistId: artist.id,
    artistName: artist.name,
  } satisfies ArtistImpersonationMutationResponse
})
