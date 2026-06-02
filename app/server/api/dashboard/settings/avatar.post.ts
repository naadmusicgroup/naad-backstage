import { createError, readMultipartFormData } from "h3"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import {
  buildArtistAvatarStoragePath,
  createArtistAvatarThumbnail,
  deleteArtistAvatar,
  ensureArtistAvatarBucket,
  normalizeArtistAvatarPreset,
  resolveArtistAvatarCustomColors,
  publicArtistAvatarUrlForPath,
  uploadArtistAvatar,
  validateArtistAvatarFile,
  validateArtistAvatarImage,
} from "~~/server/utils/artist-avatars"
import type { ArtistAvatarPreset, ArtistAvatarUploadResponse } from "~~/types/settings"

interface ArtistAvatarRow {
  id: string
  avatar_preset: ArtistAvatarPreset | null
  avatar_custom_colors: string[] | null
  avatar_url: string | null
  avatar_storage_path: string | null
}

function multipartText(value: unknown) {
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "")
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const formData = await readMultipartFormData(event)

  if (!formData?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Avatar upload data is missing.",
    })
  }

  const artistIdPart = formData.find((part) => part.name === "artistId")
  const filePart = formData.find((part) => part.name === "file" && part.filename)
  const artistId = normalizeRequiredUuid(multipartText(artistIdPart?.data), "Artist")

  if (!filePart?.data || !filePart.filename) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose an avatar image to upload.",
    })
  }

  const buffer = Buffer.from(filePart.data)
  const file = validateArtistAvatarFile({
    filename: filePart.filename,
    fileSize: buffer.byteLength,
    contentType: filePart.type,
  })
  const supabase = serverSupabaseServiceRole(event)

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id, avatar_preset, avatar_custom_colors, avatar_url, avatar_storage_path")
    .eq("id", artistId)
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .maybeSingle<ArtistAvatarRow>()

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load artist avatar settings.",
    })
  }

  if (!artist) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only update avatars for artist profiles on your own account.",
    })
  }

  await ensureArtistAvatarBucket(supabase)
  await validateArtistAvatarImage(buffer, file.contentType)

  const thumbnail = await createArtistAvatarThumbnail(buffer)
  const storagePath = buildArtistAvatarStoragePath(artistId)
  await uploadArtistAvatar(supabase, storagePath, thumbnail)

  const avatarUrl = publicArtistAvatarUrlForPath(supabase, storagePath)
  const { data: avatarImage, error: avatarImageError } = await supabase
    .from("artist_avatar_images")
    .insert({
      artist_id: artistId,
      storage_path: storagePath,
      avatar_url: avatarUrl,
    })
    .select("id")
    .single<{ id: string }>()

  if (avatarImageError) {
    await deleteArtistAvatar(supabase, storagePath)
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to save this avatar image.",
    })
  }

  const { error: updateError } = await supabase
    .from("artists")
    .update({
      avatar_url: avatarUrl,
      avatar_storage_path: storagePath,
      avatar_mode: "uploaded",
      avatar_updated_at: new Date().toISOString(),
    })
    .eq("id", artistId)
    .eq("user_id", profile.id)
    .eq("is_active", true)

  if (updateError) {
    await deleteArtistAvatar(supabase, storagePath)
    await supabase.from("artist_avatar_images").delete().eq("id", avatarImage.id)
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to update this avatar.",
    })
  }

  return {
    ok: true,
    avatarMode: "uploaded",
    avatarPreset: normalizeArtistAvatarPreset(artist.avatar_preset),
    avatarCustomColors: resolveArtistAvatarCustomColors(artist.avatar_custom_colors),
    avatarUrl,
    avatarImageId: avatarImage.id,
  } satisfies ArtistAvatarUploadResponse
})
