import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Metadata } from "sharp"
import { createError } from "h3"

export const RELEASE_ASSET_BUCKET = "release-assets"
export const MAX_COVER_ART_BYTES = 36 * 1024 * 1024
const COVER_THUMBNAIL_SIZE = 192
const COVER_THUMBNAIL_QUALITY = 72

export type ReleaseAssetKind = "cover" | "audio"

interface PreparedReleaseCoverAsset {
  coverArtUrl: string | null
  sourceCoverArtUrl: string | null
  coverStoragePath: string | null
  coverThumbUrl: string | null
  coverThumbStoragePath: string | null
}

const COVER_ART_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
])

const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/vnd.wave",
])

const COVER_ART_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"])
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav"])
const COVER_ART_MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
}

const RELEASE_ASSET_BUCKET_OPTIONS = {
  public: true,
  allowedMimeTypes: [...COVER_ART_MIME_TYPES, ...AUDIO_MIME_TYPES],
}

export function normalizeReleaseAssetKind(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (normalized !== "cover" && normalized !== "audio") {
    throw createError({
      statusCode: 400,
      statusMessage: "Asset kind must be cover or audio.",
    })
  }

  return normalized as ReleaseAssetKind
}

function extensionForFilename(filename: string) {
  const match = filename.trim().toLowerCase().match(/\.[a-z0-9]+$/)
  return match?.[0] ?? ""
}

function normalizeFilename(filename: unknown) {
  const normalized = String(filename ?? "").trim()

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: "Filename is required.",
    })
  }

  return normalized
}

function normalizeFileSize(value: unknown) {
  const size = Number(value ?? 0)

  if (!Number.isFinite(size) || size <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "File size must be greater than zero.",
    })
  }

  return size
}

function normalizeContentType(value: unknown) {
  return String(value ?? "").trim().toLowerCase()
}

export function validateReleaseAssetFile(input: {
  kind: ReleaseAssetKind
  filename: unknown
  fileSize: unknown
  contentType?: unknown
}) {
  const filename = normalizeFilename(input.filename)
  const fileSize = normalizeFileSize(input.fileSize)
  const contentType = normalizeContentType(input.contentType)
  const extension = extensionForFilename(filename)

  if (input.kind === "cover") {
    if (!COVER_ART_EXTENSIONS.has(extension)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Cover art must be JPG, PNG, or WEBP.",
      })
    }

    if (contentType && !COVER_ART_MIME_TYPES.has(contentType)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Cover art must be JPG, PNG, or WEBP.",
      })
    }

    if (fileSize > MAX_COVER_ART_BYTES) {
      throw createError({
        statusCode: 400,
        statusMessage: "Cover art must be 36 MB or smaller.",
      })
    }
  } else {
    if (!AUDIO_EXTENSIONS.has(extension)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Audio files must be WAV or MP3.",
      })
    }

    if (contentType && !AUDIO_MIME_TYPES.has(contentType)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Audio files must be WAV or MP3.",
      })
    }
  }

  return {
    filename,
    fileSize,
    contentType,
    extension,
  }
}

export function buildReleaseAssetPath(artistId: string, kind: ReleaseAssetKind, extension: string) {
  return `${artistId}/${kind}/${randomUUID()}${extension}`
}

function buildReleaseCoverStoragePath(artistId: string, segment: "cover" | "cover-thumb", extension: string) {
  return `${artistId}/${segment}/${randomUUID()}${extension}`
}

function normalizeImageContentType(value: string | null | undefined) {
  return String(value ?? "").split(";")[0]?.trim().toLowerCase() || ""
}

function coverExtensionForContentType(contentType: string) {
  return COVER_ART_MIME_TO_EXTENSION[contentType] ?? ".jpg"
}

function publicUrlForPath(supabase: SupabaseClient<any>, path: string) {
  return supabase.storage.from(RELEASE_ASSET_BUCKET).getPublicUrl(path).data.publicUrl
}

function releaseAssetPathFromPublicUrl(value: string) {
  try {
    const url = new URL(value)
    const marker = `/storage/v1/object/public/${RELEASE_ASSET_BUCKET}/`
    const markerIndex = url.pathname.indexOf(marker)

    if (markerIndex < 0) {
      return null
    }

    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
  } catch {
    return null
  }
}

async function blobToBuffer(blob: Blob) {
  return Buffer.from(await blob.arrayBuffer())
}

async function downloadReleaseCoverFromStorage(supabase: SupabaseClient<any>, path: string) {
  const { data, error } = await supabase.storage.from(RELEASE_ASSET_BUCKET).download(path)

  if (error || !data) {
    throw createError({
      statusCode: 400,
      statusMessage: error?.message || "Unable to read the uploaded cover art.",
    })
  }

  return await blobToBuffer(data)
}

async function downloadReleaseCoverFromUrl(url: string) {
  let response: Response

  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Unable to download cover art from that URL.",
    })
  }

  if (!response.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: `Cover art URL returned HTTP ${response.status}.`,
    })
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0)

  if (contentLength > MAX_COVER_ART_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cover art must be 36 MB or smaller.",
    })
  }

  const buffer = Buffer.from(await response.arrayBuffer())

  if (buffer.byteLength > MAX_COVER_ART_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cover art must be 36 MB or smaller.",
    })
  }

  return {
    buffer,
    contentType: normalizeImageContentType(response.headers.get("content-type")),
  }
}

async function validateCoverImage(buffer: Buffer, fallbackContentType = "") {
  const { default: sharp } = await import("sharp")
  let metadata: Metadata

  try {
    metadata = await sharp(buffer, { failOn: "error" }).metadata()
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Cover art must be a valid JPG, PNG, or WEBP image.",
    })
  }

  const format = String(metadata.format ?? "").toLowerCase()
  const detectedContentType = format === "jpeg" ? "image/jpeg" : `image/${format}`
  const contentType = COVER_ART_MIME_TYPES.has(detectedContentType) ? detectedContentType : fallbackContentType

  if (!COVER_ART_MIME_TYPES.has(contentType)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Cover art must be JPG, PNG, or WEBP.",
    })
  }

  return {
    contentType,
    extension: coverExtensionForContentType(contentType),
  }
}

async function uploadReleaseAsset(
  supabase: SupabaseClient<any>,
  path: string,
  buffer: Buffer,
  contentType: string,
) {
  const { error } = await supabase.storage.from(RELEASE_ASSET_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }
}

async function createCoverThumbnail(buffer: Buffer) {
  const { default: sharp } = await import("sharp")

  return await sharp(buffer, { failOn: "error" })
    .rotate()
    .resize(COVER_THUMBNAIL_SIZE, COVER_THUMBNAIL_SIZE, {
      fit: "cover",
      position: "center",
    })
    .webp({ quality: COVER_THUMBNAIL_QUALITY })
    .toBuffer()
}

export async function prepareReleaseCoverAsset(
  supabase: SupabaseClient<any>,
  artistId: string,
  coverArtUrl: string | null,
): Promise<PreparedReleaseCoverAsset> {
  if (!coverArtUrl) {
    return {
      coverArtUrl: null,
      sourceCoverArtUrl: null,
      coverStoragePath: null,
      coverThumbUrl: null,
      coverThumbStoragePath: null,
    }
  }

  await ensureReleaseAssetBucket(supabase)

  const existingStoragePath = releaseAssetPathFromPublicUrl(coverArtUrl)
  const sourceCoverArtUrl = existingStoragePath ? null : coverArtUrl
  const downloaded = existingStoragePath
    ? {
        buffer: await downloadReleaseCoverFromStorage(supabase, existingStoragePath),
        contentType: "",
      }
    : await downloadReleaseCoverFromUrl(coverArtUrl)
  const original = await validateCoverImage(downloaded.buffer, downloaded.contentType)
  const coverStoragePath = existingStoragePath || buildReleaseCoverStoragePath(artistId, "cover", original.extension)

  if (!existingStoragePath) {
    await uploadReleaseAsset(supabase, coverStoragePath, downloaded.buffer, original.contentType)
  }

  const thumbnailBuffer = await createCoverThumbnail(downloaded.buffer)
  const coverThumbStoragePath = buildReleaseCoverStoragePath(artistId, "cover-thumb", ".webp")

  await uploadReleaseAsset(supabase, coverThumbStoragePath, thumbnailBuffer, "image/webp")

  return {
    coverArtUrl: publicUrlForPath(supabase, coverStoragePath),
    sourceCoverArtUrl,
    coverStoragePath,
    coverThumbUrl: publicUrlForPath(supabase, coverThumbStoragePath),
    coverThumbStoragePath,
  }
}

export async function ensureReleaseAssetBucket(supabase: SupabaseClient<any>) {
  const { data, error } = await supabase.storage.getBucket(RELEASE_ASSET_BUCKET)

  if (data && !error) {
    const { error: updateBucketError } = await supabase.storage.updateBucket(
      RELEASE_ASSET_BUCKET,
      RELEASE_ASSET_BUCKET_OPTIONS,
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
    RELEASE_ASSET_BUCKET,
    RELEASE_ASSET_BUCKET_OPTIONS,
  )

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    throw createError({
      statusCode: 500,
      statusMessage: createBucketError.message,
    })
  }
}
