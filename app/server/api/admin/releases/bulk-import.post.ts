import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { importCatalogCsv } from "~~/server/utils/catalog-import"
import { assertArtistExists, normalizeRequiredText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { BulkCatalogImportInput, BulkCatalogImportResponse } from "~~/types/catalog"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)

  const body = await readBody<BulkCatalogImportInput>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const filename = normalizeRequiredText(body.filename, "Filename", 1)
  const csvText = normalizeRequiredText(body.csvText, "Catalog CSV", 1)
  const supabase = serverSupabaseServiceRole(event)

  await assertArtistExists(supabase, artistId)

  const result = await importCatalogCsv(supabase, artistId, filename, csvText)

  await logAdminActivity(supabase, profile.id, "catalog.bulk_imported", "release_catalog", artistId, {
    artist_id: artistId,
    filename,
    parsed_release_count: result.parsedReleaseCount,
    parsed_track_count: result.parsedTrackCount,
    created_release_count: result.createdReleaseCount,
    reused_release_count: result.reusedReleaseCount,
    created_track_count: result.createdTrackCount,
    skipped_track_count: result.skippedTrackCount,
    issue_count: result.issues.length,
  })

  return result satisfies BulkCatalogImportResponse
})

