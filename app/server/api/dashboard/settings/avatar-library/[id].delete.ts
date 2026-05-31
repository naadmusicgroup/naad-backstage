import { createError, getRouterParam, readBody } from "h3"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { deleteArtistAvatar } from "~~/server/utils/artist-avatars"

interface DeleteAvatarBody {
  artistId?: string
}

interface ArtistAvatarRow {
  id: string
  avatar_storage_path: string | null
}

interface ArtistAvatarImageRow {
  id: string
  artist_id: string
  storage_path: string
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const avatarImageId = normalizeRequiredUuid(getRouterParam(event, "id"), "Avatar image")
  const body = await readBody<DeleteAvatarBody>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const supabase = serverSupabaseServiceRole(event)

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id, avatar_storage_path")
    .eq("id", artistId)
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .maybeSingle<ArtistAvatarRow>()

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistError.message,
    })
  }

  if (!artist) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only delete avatars for artist profiles on your own account.",
    })
  }

  const { data: avatarImage, error: avatarImageError } = await supabase
    .from("artist_avatar_images")
    .select("id, artist_id, storage_path")
    .eq("id", avatarImageId)
    .eq("artist_id", artistId)
    .maybeSingle<ArtistAvatarImageRow>()

  if (avatarImageError) {
    throw createError({
      statusCode: 500,
      statusMessage: avatarImageError.message,
    })
  }

  if (!avatarImage) {
    throw createError({
      statusCode: 404,
      statusMessage: "That saved avatar picture is no longer available.",
    })
  }

  if (artist.avatar_storage_path === avatarImage.storage_path) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose a different avatar before deleting the current picture.",
    })
  }

  const { error: deleteRowError } = await supabase
    .from("artist_avatar_images")
    .delete()
    .eq("id", avatarImage.id)
    .eq("artist_id", artistId)

  if (deleteRowError) {
    throw createError({
      statusCode: 500,
      statusMessage: deleteRowError.message,
    })
  }

  await deleteArtistAvatar(supabase, avatarImage.storage_path)

  return {
    ok: true,
  }
})
