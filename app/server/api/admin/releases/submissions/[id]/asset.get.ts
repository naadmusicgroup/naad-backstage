import { createError, getQuery } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { RELEASE_ASSET_BUCKET } from "~~/server/utils/release-assets"
import {
  downloadMediaBuffer,
  isS3MediaKey,
  mediaBufferToArrayBuffer,
  mediaStorageKeyFromPublicUrl,
} from "~~/server/utils/media-storage"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"

type SubmissionAssetKind = "cover" | "audio"

function normalizeAssetKind(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (normalized !== "cover" && normalized !== "audio") {
    throw createError({
      statusCode: 400,
      statusMessage: "Asset kind must be cover or audio.",
    })
  }

  return normalized as SubmissionAssetKind
}

function releaseAssetPathFromUrl(value: string) {
  const mediaStorageKey = mediaStorageKeyFromPublicUrl(value)

  if (mediaStorageKey) {
    return mediaStorageKey
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    return ""
  }

  const storageMarker = `/storage/v1/object/public/${RELEASE_ASSET_BUCKET}/`
  const markerIndex = url.pathname.indexOf(storageMarker)

  if (markerIndex === -1) {
    return ""
  }

  const encodedPath = url.pathname.slice(markerIndex + storageMarker.length)

  try {
    return decodeURIComponent(encodedPath).replace(/^\/+/, "")
  } catch {
    return encodedPath.replace(/^\/+/, "")
  }
}

function filenameFromPath(path: string, fallback: string) {
  const candidate = path.split("/").filter(Boolean).at(-1) || fallback
  return candidate.replace(/[\\/:*?"<>|\r\n]+/g, "_").trim() || fallback
}

function contentDisposition(filename: string) {
  const asciiFilename = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const submissionId = normalizeRequiredUuid(event.context.params?.id, "Submission id")
  const query = getQuery(event)
  const kind = normalizeAssetKind(query.kind)
  const supabase = serverSupabaseServiceRole(event)

  const { data: submission, error: submissionError } = await supabase
    .from("artist_release_submissions")
    .select("id, source_cover_art_url")
    .eq("id", submissionId)
    .maybeSingle()

  if (submissionError) {
    throw createError({
      statusCode: 500,
      statusMessage: submissionError.message,
    })
  }

  if (!submission) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release submission does not exist.",
    })
  }

  let assetUrl = submission.source_cover_art_url as string
  let filenameFallback = `submission-${submissionId}-cover`

  if (kind === "audio") {
    const trackId = normalizeRequiredUuid(query.trackId, "Track id")
    const { data: submissionTrack, error: submissionTrackError } = await supabase
      .from("artist_release_submission_tracks")
      .select("source_audio_url, source_filename")
      .eq("submission_id", submissionId)
      .eq("track_id", trackId)
      .maybeSingle()

    if (submissionTrackError) {
      throw createError({
        statusCode: 500,
        statusMessage: submissionTrackError.message,
      })
    }

    if (!submissionTrack) {
      throw createError({
        statusCode: 404,
        statusMessage: "The selected submitted audio file does not exist.",
      })
    }

    assetUrl = submissionTrack.source_audio_url as string
    filenameFallback = (submissionTrack.source_filename as string | null) || `submission-${submissionId}-audio`
  }

  const storagePath = releaseAssetPathFromUrl(assetUrl)

  if (!storagePath) {
    throw createError({
      statusCode: 400,
      statusMessage: "Only managed release asset uploads can be downloaded from this endpoint.",
    })
  }

  const s3Download = isS3MediaKey(storagePath) ? await downloadMediaBuffer(storagePath) : null
  const supabaseDownload = s3Download
    ? null
    : await supabase
        .storage
        .from(RELEASE_ASSET_BUCKET)
        .download(storagePath)
  const fileBlob = supabaseDownload?.data ?? null
  const downloadError = supabaseDownload?.error ?? null

  if (!s3Download && (downloadError || !fileBlob)) {
    throw createError({
      statusCode: 500,
      statusMessage: downloadError?.message || "Unable to download the submitted asset.",
    })
  }

  const filename = filenameFromPath(storagePath, filenameFallback)
  const responseBody = s3Download
    ? mediaBufferToArrayBuffer(s3Download.buffer)
    : await fileBlob!.arrayBuffer()

  return new Response(responseBody, {
    headers: {
      "Content-Type": s3Download?.contentType || fileBlob?.type || "application/octet-stream",
      "Content-Length": String(s3Download?.contentLength ?? fileBlob?.size ?? 0),
      "Content-Disposition": contentDisposition(filename),
      "Cache-Control": "private, max-age=60",
    },
  })
})
