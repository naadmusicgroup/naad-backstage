import { createError, getQuery } from "h3"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import type { ArtistAvatarMode } from "~~/types/settings"
import type { ArtistAvatarLibraryResponse } from "~~/types/settings"

interface ArtistAvatarLibraryArtistRow {
  id: string
  avatar_mode: ArtistAvatarMode | null
  avatar_url: string | null
  avatar_storage_path: string | null
}

interface ArtistAvatarImageRow {
  id: string
  avatar_url: string
  storage_path: string
  created_at: string
}

function mapAvatarImage(row: ArtistAvatarImageRow, currentStoragePath: string | null, isUsingUploadedAvatar: boolean) {
  return {
    id: row.id,
    avatarUrl: row.avatar_url,
    storagePath: row.storage_path,
    createdAt: row.created_at,
    isCurrent: Boolean(isUsingUploadedAvatar && currentStoragePath && row.storage_path === currentStoragePath),
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const artistId = normalizeRequiredUuid(getQuery(event).artistId, "Artist")
  const supabase = serverSupabaseServiceRole(event)

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id, avatar_mode, avatar_url, avatar_storage_path")
    .eq("id", artistId)
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .maybeSingle<ArtistAvatarLibraryArtistRow>()

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistError.message,
    })
  }

  if (!artist) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only load avatars for artist profiles on your own account.",
    })
  }

  if (artist.avatar_storage_path && artist.avatar_url) {
    await supabase
      .from("artist_avatar_images")
      .upsert({
        artist_id: artist.id,
        storage_path: artist.avatar_storage_path,
        avatar_url: artist.avatar_url,
      }, {
        onConflict: "storage_path",
        ignoreDuplicates: true,
      })
  }

  const { data: avatars, error: avatarsError } = await supabase
    .from("artist_avatar_images")
    .select("id, avatar_url, storage_path, created_at")
    .eq("artist_id", artist.id)
    .order("created_at", { ascending: false })

  if (avatarsError) {
    throw createError({
      statusCode: 500,
      statusMessage: avatarsError.message,
    })
  }

  return {
    avatars: ((avatars ?? []) as ArtistAvatarImageRow[]).map((row) => (
      mapAvatarImage(row, artist.avatar_storage_path, artist.avatar_mode === "uploaded")
    )),
  } satisfies ArtistAvatarLibraryResponse
})
