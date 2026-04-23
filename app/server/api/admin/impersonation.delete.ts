import { requireAdminProfile } from "~~/server/utils/auth"
import { clearViewAsArtistCookie, getViewAsArtistId } from "~~/server/utils/impersonation"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { logAdminActivity } from "~~/server/utils/admin-log"
import type { ArtistImpersonationMutationResponse } from "~~/types/auth"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const artistId = getViewAsArtistId(event)
  const supabase = serverSupabaseServiceRole(event)

  clearViewAsArtistCookie(event)

  if (artistId) {
    await logAdminActivity(supabase, profile.id, "artist.view_as.ended", "artist", artistId)
  }

  return {
    ok: true,
    artistId: null,
    artistName: null,
  } satisfies ArtistImpersonationMutationResponse
})
