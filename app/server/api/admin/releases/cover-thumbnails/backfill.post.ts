import { createError, readBody } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import { prepareReleaseCoverAsset } from "~~/server/utils/release-assets"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"

interface BackfillCoverThumbnailsInput {
  limit?: number | string | null
}

interface ReleaseCoverBackfillRow {
  id: string
  artist_id: string
  cover_art_url: string | null
  source_cover_art_url: string | null
}

function normalizeLimit(value: unknown) {
  const limit = Number(value ?? 20)

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw createError({
      statusCode: 400,
      statusMessage: "Limit must be between 1 and 100.",
    })
  }

  return limit
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const body = await readBody<BackfillCoverThumbnailsInput>(event).catch(() => ({} as BackfillCoverThumbnailsInput))
  const limit = normalizeLimit(body.limit)
  const supabase = serverSupabaseServiceRole(event)

  const { data: rows, error } = await supabase
    .from("releases")
    .select("id, artist_id, cover_art_url, source_cover_art_url")
    .not("cover_art_url", "is", null)
    .is("cover_thumb_url", null)
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  const processed: string[] = []
  const failed: Array<{ releaseId: string; message: string }> = []

  for (const row of (rows ?? []) as ReleaseCoverBackfillRow[]) {
    try {
      const coverAsset = await prepareReleaseCoverAsset(supabase, row.artist_id, row.cover_art_url)
      const { error: updateError } = await supabase
        .from("releases")
        .update({
          cover_art_url: coverAsset.coverArtUrl,
          source_cover_art_url: coverAsset.sourceCoverArtUrl ?? row.source_cover_art_url,
          cover_storage_path: coverAsset.coverStoragePath,
          cover_thumb_url: coverAsset.coverThumbUrl,
          cover_thumb_storage_path: coverAsset.coverThumbStoragePath,
        })
        .eq("id", row.id)

      if (updateError) {
        throw updateError
      }

      processed.push(row.id)
    } catch (error: any) {
      failed.push({
        releaseId: row.id,
        message: error?.statusMessage || error?.message || "Unable to backfill cover thumbnail.",
      })
    }
  }

  return {
    ok: true,
    scanned: rows?.length ?? 0,
    processedCount: processed.length,
    failedCount: failed.length,
    processed,
    failed,
  }
})
