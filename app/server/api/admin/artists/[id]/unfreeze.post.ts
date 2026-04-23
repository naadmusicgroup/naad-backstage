import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  countLinkedArtists,
  loadAdminArtistLifecycleTarget,
  setAccountBanState,
} from "~~/server/utils/admin-artist-lifecycle"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { AdminArtistActionResponse } from "~~/types/settings"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const artistId = normalizeRequiredUuid(event.context.params?.id, "Artist id")
  const supabase = serverSupabaseServiceRole(event)
  const artist = await loadAdminArtistLifecycleTarget(supabase, artistId)

  if (!artist.user_id) {
    throw createError({
      statusCode: 409,
      statusMessage: "This artist does not have a live login account to unfreeze.",
    })
  }

  await setAccountBanState(supabase, artist.user_id, false)

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      login_frozen_at: null,
      login_frozen_by: null,
    })
    .eq("id", artist.user_id)

  if (profileError) {
    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "artist.login_unfrozen", "artist", artistId, {
    artist_name: artist.name,
    login_user_id: artist.user_id,
    shared_account_artist_count: await countLinkedArtists(supabase, artist.user_id),
  })

  return {
    ok: true,
    action: "unfreeze",
    artistId,
    affectedUserId: artist.user_id,
    profileDeleted: false,
  } satisfies AdminArtistActionResponse
})
