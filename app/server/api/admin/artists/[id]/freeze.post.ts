import { createError } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
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
      statusMessage: "This artist no longer has a live login account to freeze.",
    })
  }

  await setAccountBanState(supabase, artist.user_id, true)

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      login_frozen_at: new Date().toISOString(),
      login_frozen_by: profile.id,
    })
    .eq("id", artist.user_id)

  if (profileError) {
    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  await logAdminActivity(supabase, profile.id, "artist.login_frozen", "artist", artistId, {
    artist_name: artist.name,
    login_user_id: artist.user_id,
    shared_account_artist_count: await countLinkedArtists(supabase, artist.user_id),
  })

  return {
    ok: true,
    action: "freeze",
    artistId,
    affectedUserId: artist.user_id,
    profileDeleted: false,
  } satisfies AdminArtistActionResponse
})
