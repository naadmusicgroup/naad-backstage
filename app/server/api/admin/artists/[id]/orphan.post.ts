import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  countLinkedArtists,
  deleteAuthUserOrFail,
  loadAdminArtistLifecycleTarget,
  setAccountBanState,
  type AdminArtistLifecycleRpcResult,
} from "~~/server/utils/admin-artist-lifecycle"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { AdminArtistActionResponse } from "~~/types/settings"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const artistId = normalizeRequiredUuid(event.context.params?.id, "Artist id")
  const supabase = serverSupabaseServiceRole(event)
  const artist = await loadAdminArtistLifecycleTarget(supabase, artistId)

  if (!artist.is_active) {
    throw createError({
      statusCode: 409,
      statusMessage: "This artist is already orphaned.",
    })
  }

  let preBannedForCleanup = false

  if (artist.user_id && await countLinkedArtists(supabase, artist.user_id) === 1) {
    await setAccountBanState(supabase, artist.user_id, true)
    preBannedForCleanup = true
  }

  const { data, error } = await supabase.rpc("admin_orphan_artist", {
    target_artist_uuid: artistId,
    actor_admin_id: profile.id,
  })

  const rpcResult = Array.isArray(data) ? data[0] : data

  if (error || !rpcResult) {
    if (preBannedForCleanup && artist.user_id) {
      await setAccountBanState(supabase, artist.user_id, false)
    }

    throw createError({
      statusCode: 500,
      statusMessage: error?.message || "Unable to orphan this artist.",
    })
  }

  const lifecycleResult = rpcResult as AdminArtistLifecycleRpcResult

  if (lifecycleResult.profile_became_unused && lifecycleResult.linked_user_id) {
    await deleteAuthUserOrFail(
      supabase,
      lifecycleResult.linked_user_id,
      "The artist was orphaned, but the old login account could not be removed. It remains banned. Retry the cleanup.",
    )
  } else if (preBannedForCleanup && lifecycleResult.linked_user_id) {
    await setAccountBanState(supabase, lifecycleResult.linked_user_id, false)
  }

  await logAdminActivity(supabase, profile.id, "artist.orphaned", "artist", artistId, {
    artist_name: artist.name,
    removed_login_user_id: lifecycleResult.linked_user_id,
    profile_deleted: lifecycleResult.profile_became_unused,
  })

  return {
    ok: true,
    action: "orphan",
    artistId,
    affectedUserId: lifecycleResult.linked_user_id,
    profileDeleted: lifecycleResult.profile_became_unused,
  } satisfies AdminArtistActionResponse
})
