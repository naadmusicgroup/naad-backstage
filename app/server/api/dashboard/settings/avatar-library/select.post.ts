import { createError, readBody } from "h3"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  normalizeArtistAvatarPreset,
  resolveArtistAvatarCustomColors,
} from "~~/server/utils/artist-avatars"
import type { ArtistAvatarPreset, ArtistAvatarUploadResponse } from "~~/types/settings"

interface SelectAvatarBody {
  artistId?: string
  avatarImageId?: string
}

interface ArtistAvatarRow {
  id: string
  avatar_preset: ArtistAvatarPreset | null
  avatar_custom_colors: string[] | null
}

interface ArtistAvatarImageRow {
  id: string
  artist_id: string
  avatar_url: string
  storage_path: string
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const body = await readBody<SelectAvatarBody>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const avatarImageId = normalizeRequiredUuid(body.avatarImageId, "Avatar image")
  const supabase = serverSupabaseServiceRole(event)

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id, avatar_preset, avatar_custom_colors")
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
      statusMessage: "You can only update avatars for artist profiles on your own account.",
    })
  }

  const { data: avatarImage, error: avatarImageError } = await supabase
    .from("artist_avatar_images")
    .select("id, artist_id, avatar_url, storage_path")
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

  const { error: updateError } = await supabase
    .from("artists")
    .update({
      avatar_url: avatarImage.avatar_url,
      avatar_storage_path: avatarImage.storage_path,
      avatar_mode: "uploaded",
      avatar_updated_at: new Date().toISOString(),
    })
    .eq("id", artist.id)
    .eq("user_id", profile.id)
    .eq("is_active", true)

  if (updateError) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError.message,
    })
  }

  return {
    ok: true,
    avatarMode: "uploaded",
    avatarPreset: normalizeArtistAvatarPreset(artist.avatar_preset),
    avatarCustomColors: resolveArtistAvatarCustomColors(artist.avatar_custom_colors),
    avatarUrl: avatarImage.avatar_url,
    avatarImageId: avatarImage.id,
  } satisfies ArtistAvatarUploadResponse
})
