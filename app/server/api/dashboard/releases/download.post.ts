import { createError, readBody } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { RELEASE_ASSET_BUCKET } from "~~/server/utils/release-assets"
import {
  normalizeDashboardArtistQuery,
  resolveArtistDashboardScope,
} from "~~/server/utils/artist-dashboard"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"

type ReleaseDownloadAssetType = "cover" | "audio"

interface ReleaseDownloadBody {
  releaseId?: string
  trackId?: string
  assetType?: string
  artistId?: string
}

interface ReleaseDownloadRow {
  id: string
  artist_id: string
  title: string
  cover_art_url: string | null
  cover_storage_path?: string | null
  status: string | null
}

interface TrackDownloadRow {
  id: string
  release_id: string
  title: string
  isrc: string | null
  track_number: number | null
  audio_preview_url: string | null
  status: string | null
}

function normalizeAssetType(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (normalized !== "cover" && normalized !== "audio") {
    throw createError({
      statusCode: 400,
      statusMessage: "Download type must be cover or audio.",
    })
  }

  return normalized as ReleaseDownloadAssetType
}

function releaseAssetPathFromPublicUrl(value: string | null | undefined) {
  if (!value) {
    return ""
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    return ""
  }

  const marker = `/storage/v1/object/public/${RELEASE_ASSET_BUCKET}/`
  const markerIndex = url.pathname.indexOf(marker)

  if (markerIndex === -1) {
    return ""
  }

  const encodedPath = url.pathname.slice(markerIndex + marker.length)

  try {
    return decodeURIComponent(encodedPath).replace(/^\/+/, "")
  } catch {
    return encodedPath.replace(/^\/+/, "")
  }
}

function extensionFromPath(path: string) {
  return path.split("?")[0]?.split("#")[0]?.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? ""
}

function extensionForContentType(contentType: string, assetType: ReleaseDownloadAssetType) {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase()

  if (normalized === "image/jpeg" || normalized === "image/jpg") return ".jpg"
  if (normalized === "image/png") return ".png"
  if (normalized === "image/webp") return ".webp"
  if (normalized === "audio/mpeg" || normalized === "audio/mp3") return ".mp3"
  if (normalized === "audio/wav" || normalized === "audio/wave" || normalized === "audio/x-wav") return ".wav"

  return assetType === "cover" ? ".jpg" : ".mp3"
}

function filenameSegment(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s.-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .toLowerCase()

  return normalized || fallback
}

function contentDisposition(filename: string) {
  const asciiFilename = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'")
  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

function normalizeRemoteAssetUrl(value: string | null | undefined, label: string) {
  if (!value) {
    return null
  }

  let url: URL

  try {
    url = new URL(value)
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is not downloadable.`,
    })
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is not downloadable.`,
    })
  }

  return url
}

function sourcePathFromRemoteUrl(url: URL) {
  try {
    return decodeURIComponent(url.pathname)
  } catch {
    return url.pathname
  }
}

function filenameForAsset(input: {
  assetType: ReleaseDownloadAssetType
  release: ReleaseDownloadRow
  track?: TrackDownloadRow | null
  sourcePath: string
  contentType: string
}) {
  const existingExtension = extensionFromPath(input.sourcePath)
  const extension = existingExtension || extensionForContentType(input.contentType, input.assetType)
  const releaseTitle = filenameSegment(input.release.title, "release")

  if (input.assetType === "cover") {
    return `${releaseTitle}-cover-art${extension}`
  }

  const trackNumber = input.track?.track_number ? `${input.track.track_number}-` : ""
  const trackTitle = filenameSegment(input.track?.title, "audio")
  const isrc = filenameSegment(input.track?.isrc, "").toUpperCase()
  const suffix = isrc ? `-${isrc}` : ""

  return `${trackNumber}${trackTitle}${suffix}${extension}`
}

async function downloadRemoteAsset(url: URL) {
  let response: Response

  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(60000),
    })
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: "Unable to download the selected audio file.",
    })
  }

  if (!response.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: "Unable to download the selected audio file.",
    })
  }

  const body = response.body ?? await response.arrayBuffer()

  return {
    body,
    contentLength: response.headers.get("content-length") || "",
    contentType: response.headers.get("content-type") || "application/octet-stream",
  }
}

async function hasReleaseDownloadAccess(input: {
  supabase: SupabaseClient<any>
  viewerArtistIds: string[]
  release: ReleaseDownloadRow
  trackId?: string
}) {
  if (input.viewerArtistIds.includes(input.release.artist_id)) {
    return true
  }

  if (input.release.status !== "live" && input.release.status !== "taken_down") {
    return false
  }

  const { data: releaseCollaborators, error: releaseCollaboratorError } = await input.supabase
    .from("release_collaborators")
    .select("release_id")
    .eq("release_id", input.release.id)
    .in("artist_id", input.viewerArtistIds)
    .limit(1)

  if (releaseCollaboratorError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to verify release download access.",
    })
  }

  if ((releaseCollaborators ?? []).length) {
    return true
  }

  const trackCollaboratorQuery = input.supabase
    .from("track_collaborators")
    .select("track_id, tracks!inner(release_id)")
    .in("artist_id", input.viewerArtistIds)
    .limit(1)

  if (input.trackId) {
    trackCollaboratorQuery.eq("track_id", input.trackId)
  } else {
    trackCollaboratorQuery.eq("tracks.release_id", input.release.id)
  }

  const { data: trackCollaborators, error: trackCollaboratorError } = await trackCollaboratorQuery

  if (trackCollaboratorError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to verify release download access.",
    })
  }

  return (trackCollaborators ?? []).length > 0
}

export default defineEventHandler(async (event) => {
  const requestBody = await readBody<ReleaseDownloadBody>(event)
  const releaseId = normalizeRequiredUuid(requestBody.releaseId, "Release")
  const assetType = normalizeAssetType(requestBody.assetType)
  const requestedArtistId = normalizeDashboardArtistQuery(requestBody.artistId)
  const supabase = serverSupabaseServiceRole(event)
  const scope = await resolveArtistDashboardScope(event, requestedArtistId, "release downloads")

  if (!scope.artistIds.length) {
    throw createError({
      statusCode: 403,
      statusMessage: "Artist dashboard access is required for release downloads.",
    })
  }

  const { data: releaseData, error: releaseError } = await supabase
    .from("releases")
    .select("id, artist_id, title, cover_art_url, cover_storage_path, status")
    .eq("id", releaseId)
    .neq("status", "deleted")
    .maybeSingle()

  if (releaseError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to load the selected release.",
    })
  }

  if (!releaseData) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected release does not exist.",
    })
  }

  const release = releaseData as ReleaseDownloadRow
  let track: TrackDownloadRow | null = null
  let storagePath = release.cover_storage_path || releaseAssetPathFromPublicUrl(release.cover_art_url)
  let remoteAssetUrl: URL | null = null

  if (assetType === "audio") {
    const trackId = normalizeRequiredUuid(requestBody.trackId, "Track")
    const { data: trackData, error: trackError } = await supabase
      .from("tracks")
      .select("id, release_id, title, isrc, track_number, audio_preview_url, status")
      .eq("id", trackId)
      .eq("release_id", releaseId)
      .neq("status", "deleted")
      .maybeSingle()

    if (trackError) {
      throw createError({
        statusCode: 500,
        statusMessage: "Unable to load the selected track.",
      })
    }

    if (!trackData) {
      throw createError({
        statusCode: 404,
        statusMessage: "The selected track does not exist.",
      })
    }

    track = trackData as TrackDownloadRow
    storagePath = releaseAssetPathFromPublicUrl(track.audio_preview_url)

    if (!storagePath) {
      remoteAssetUrl = normalizeRemoteAssetUrl(track.audio_preview_url, "Audio URL")
    }
  }

  const hasAccess = await hasReleaseDownloadAccess({
    supabase,
    viewerArtistIds: scope.artistIds,
    release,
    trackId: track?.id,
  })

  if (!hasAccess) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only download assets for releases visible in your dashboard.",
    })
  }

  if (!storagePath && !remoteAssetUrl) {
    throw createError({
      statusCode: 404,
      statusMessage: assetType === "cover"
        ? "No downloadable cover art is attached to this release."
        : "No downloadable audio file is attached to this track.",
    })
  }

  const downloadedAsset = storagePath
    ? await supabase
        .storage
        .from(RELEASE_ASSET_BUCKET)
        .download(storagePath)
    : null

  if (downloadedAsset?.error || (storagePath && !downloadedAsset?.data)) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to download the selected asset.",
    })
  }

  const remoteDownload = remoteAssetUrl ? await downloadRemoteAsset(remoteAssetUrl) : null
  const fileBlob = downloadedAsset?.data ?? null
  const contentType = fileBlob?.type || remoteDownload?.contentType || "application/octet-stream"
  const contentLength = fileBlob ? String(fileBlob.size) : remoteDownload?.contentLength || ""
  const assetBody = fileBlob ? await fileBlob.arrayBuffer() : remoteDownload?.body
  const sourcePath = storagePath || (remoteAssetUrl ? sourcePathFromRemoteUrl(remoteAssetUrl) : "")

  if (!assetBody) {
    throw createError({
      statusCode: 500,
      statusMessage: "Unable to read the selected asset.",
    })
  }

  const filename = filenameForAsset({
    assetType,
    release,
    track,
    sourcePath,
    contentType,
  })

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Content-Disposition": contentDisposition(filename),
    "Cache-Control": "private, max-age=60",
    "X-Download-Filename": filename,
  }

  if (contentLength) {
    headers["Content-Length"] = contentLength
  }

  return new Response(assetBody, {
    headers: {
      ...headers,
    },
  })
})
