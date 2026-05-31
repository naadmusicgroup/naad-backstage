import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { permanentlyDeleteArtistForAdmin } from "~~/server/utils/admin-artist-purge"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { AdminArtistActionResponse } from "~~/types/settings"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const artistId = normalizeRequiredUuid(event.context.params?.id, "Artist id")
  const supabase = serverSupabaseServiceRole(event)
  const result = await permanentlyDeleteArtistForAdmin(supabase, profile.id, artistId, {
    logAction: "artist.permanently_deleted",
  })

  return {
    ok: true,
    action: "permanentDelete",
    artistId,
    affectedUserId: result.affectedUserId,
    removedAuthUserId: result.removedAuthUserId,
    profileDeleted: result.profileDeleted,
    storageCleanup: result.storageCleanup,
  } satisfies AdminArtistActionResponse
})
