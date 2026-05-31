import { createError, readBody } from "h3"
import { requireArtistProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import {
  buildReleaseAssetPath,
  ensureReleaseAssetBucket,
  normalizeReleaseAssetKind,
  RELEASE_ASSET_BUCKET,
  validateReleaseAssetFile,
} from "~~/server/utils/release-assets"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"

interface CreateReleaseAssetUploadBody {
  artistId?: string
  kind?: string
  filename?: string
  fileSize?: number
  contentType?: string
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireArtistProfile(event)
  const body = await readBody<CreateReleaseAssetUploadBody>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const kind = normalizeReleaseAssetKind(body.kind)
  const file = validateReleaseAssetFile({
    kind,
    filename: body.filename,
    fileSize: body.fileSize,
    contentType: body.contentType,
  })
  const supabase = serverSupabaseServiceRole(event)

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id")
    .eq("id", artistId)
    .eq("user_id", profile.id)
    .eq("is_active", true)
    .maybeSingle()

  if (artistError) {
    throw createError({
      statusCode: 500,
      statusMessage: artistError.message,
    })
  }

  if (!artist) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only upload release assets for your linked active artist profiles.",
    })
  }

  await ensureReleaseAssetBucket(supabase)

  const path = buildReleaseAssetPath(artistId, kind, file.extension)
  const { data, error } = await supabase
    .storage
    .from(RELEASE_ASSET_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data?.token || !data.path) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || "Unable to create an upload target.",
    })
  }

  const publicUrl = supabase
    .storage
    .from(RELEASE_ASSET_BUCKET)
    .getPublicUrl(data.path).data.publicUrl

  return {
    bucket: RELEASE_ASSET_BUCKET,
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl,
    kind,
    filename: file.filename,
  }
})
