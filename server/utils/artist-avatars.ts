import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Metadata } from "sharp"
import { createError } from "h3"
import {
  ARTIST_AVATAR_MODES,
  ARTIST_AVATAR_PRESETS,
  DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS,
  type ArtistAvatarMode,
  type ArtistAvatarPreset,
} from "~~/types/settings"

export const ARTIST_AVATAR_BUCKET = "artist-avatars"
export const MAX_ARTIST_AVATAR_BYTES = 5 * 1024 * 1024

const ARTIST_AVATAR_THUMBNAIL_SIZE = 192
const ARTIST_AVATAR_THUMBNAIL_QUALITY = 76
const ARTIST_AVATAR_THUMBNAIL_EFFORT = 5
const DEFAULT_ARTIST_AVATAR_PRESET: ArtistAvatarPreset = "aurora"
const DEFAULT_ARTIST_AVATAR_MODE: ArtistAvatarMode = "mesh"
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

const ARTIST_AVATAR_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

const ARTIST_AVATAR_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"])

const ARTIST_AVATAR_BUCKET_OPTIONS = {
  public: true,
  allowedMimeTypes: [...ARTIST_AVATAR_MIME_TYPES],
  fileSizeLimit: "5MB",
}

export function normalizeArtistAvatarMode(value: unknown): ArtistAvatarMode {
  const normalized = String(value ?? "").trim().toLowerCase()

  return (ARTIST_AVATAR_MODES as readonly string[]).includes(normalized)
    ? normalized as ArtistAvatarMode
    : DEFAULT_ARTIST_AVATAR_MODE
}

export function normalizeArtistAvatarPreset(value: unknown): ArtistAvatarPreset {
  const normalized = String(value ?? "").trim().toLowerCase()

  return (ARTIST_AVATAR_PRESETS as readonly string[]).includes(normalized)
    ? normalized as ArtistAvatarPreset
    : DEFAULT_ARTIST_AVATAR_PRESET
}

export function normalizeArtistAvatarCustomColors(value: unknown): string[] | null {
  if (value === null || typeof value === "undefined") {
    return null
  }

  if (!Array.isArray(value) || value.length !== DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "Custom avatar colors must include five colors.",
    })
  }

  return value.map((color) => {
    const normalized = String(color ?? "").trim().toLowerCase()

    if (!HEX_COLOR_PATTERN.test(normalized)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Custom avatar colors must be valid hex colors.",
      })
    }

    return normalized
  })
}

export function resolveArtistAvatarCustomColors(value: unknown): string[] | null {
  if (value === null || typeof value === "undefined") {
    return null
  }

  try {
    return normalizeArtistAvatarCustomColors(value)
  } catch {
    return [...DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS]
  }
}

function extensionForFilename(filename: string) {
  const match = filename.trim().toLowerCase().match(/\.[a-z0-9]+$/)
  return match?.[0] ?? ""
}

function normalizeImageContentType(value: string | null | undefined) {
  return String(value ?? "").split(";")[0]?.trim().toLowerCase() || ""
}

export function validateArtistAvatarFile(input: {
  filename?: unknown
  fileSize?: unknown
  contentType?: unknown
}) {
  const filename = String(input.filename ?? "").trim()
  const fileSize = Number(input.fileSize ?? 0)
  const contentType = normalizeImageContentType(String(input.contentType ?? ""))
  const extension = extensionForFilename(filename)

  if (!filename) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose an avatar image to upload.",
    })
  }

  if (!ARTIST_AVATAR_EXTENSIONS.has(extension)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Avatar image must be JPG, PNG, or WEBP.",
    })
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Avatar image is empty.",
    })
  }

  if (fileSize > MAX_ARTIST_AVATAR_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: "Avatar image must be 5 MB or smaller.",
    })
  }

  if (contentType && !ARTIST_AVATAR_MIME_TYPES.has(contentType)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Avatar image must be JPG, PNG, or WEBP.",
    })
  }

  return {
    filename,
    fileSize,
    contentType,
    extension,
  }
}

export function buildArtistAvatarStoragePath(artistId: string) {
  return `${artistId}/avatar/${randomUUID()}.webp`
}

export function publicArtistAvatarUrlForPath(supabase: SupabaseClient<any>, path: string) {
  return supabase.storage.from(ARTIST_AVATAR_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function validateArtistAvatarImage(buffer: Buffer, fallbackContentType = "") {
  const { default: sharp } = await import("sharp")
  let metadata: Metadata

  try {
    metadata = await sharp(buffer, { failOn: "error" }).metadata()
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Avatar image must be a valid JPG, PNG, or WEBP image.",
    })
  }

  const format = String(metadata.format ?? "").toLowerCase()
  const detectedContentType = format === "jpeg" ? "image/jpeg" : `image/${format}`
  const contentType = ARTIST_AVATAR_MIME_TYPES.has(detectedContentType)
    ? detectedContentType
    : normalizeImageContentType(fallbackContentType)

  if (!ARTIST_AVATAR_MIME_TYPES.has(contentType)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Avatar image must be JPG, PNG, or WEBP.",
    })
  }

  return {
    contentType,
  }
}

export async function createArtistAvatarThumbnail(buffer: Buffer) {
  const { default: sharp } = await import("sharp")

  return await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize(ARTIST_AVATAR_THUMBNAIL_SIZE, ARTIST_AVATAR_THUMBNAIL_SIZE, {
      fit: "cover",
      position: "center",
    })
    .webp({
      quality: ARTIST_AVATAR_THUMBNAIL_QUALITY,
      effort: ARTIST_AVATAR_THUMBNAIL_EFFORT,
    })
    .toBuffer()
}

export async function uploadArtistAvatar(
  supabase: SupabaseClient<any>,
  path: string,
  buffer: Buffer,
) {
  const { error } = await supabase.storage.from(ARTIST_AVATAR_BUCKET).upload(path, buffer, {
    contentType: "image/webp",
    upsert: false,
  })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }
}

export async function deleteArtistAvatar(supabase: SupabaseClient<any>, path: string | null | undefined) {
  if (!path) {
    return
  }

  const { error } = await supabase.storage.from(ARTIST_AVATAR_BUCKET).remove([path])

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }
}

export async function ensureArtistAvatarBucket(supabase: SupabaseClient<any>) {
  const { data, error } = await supabase.storage.getBucket(ARTIST_AVATAR_BUCKET)

  if (data && !error) {
    const { error: updateBucketError } = await supabase.storage.updateBucket(
      ARTIST_AVATAR_BUCKET,
      ARTIST_AVATAR_BUCKET_OPTIONS,
    )

    if (updateBucketError) {
      throw createError({
        statusCode: 500,
        statusMessage: updateBucketError.message,
      })
    }

    return
  }

  const isMissingBucket = /not found/i.test(error?.message ?? "")

  if (!isMissingBucket && error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  const { error: createBucketError } = await supabase.storage.createBucket(
    ARTIST_AVATAR_BUCKET,
    ARTIST_AVATAR_BUCKET_OPTIONS,
  )

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    throw createError({
      statusCode: 500,
      statusMessage: createBucketError.message,
    })
  }
}
