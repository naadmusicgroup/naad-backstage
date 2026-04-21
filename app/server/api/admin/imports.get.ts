import { getQuery, createError } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { assertArtistExists, normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import type { CsvUploadHistoryItem } from "~~/types/imports"

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)

  const query = getQuery(event)
  const artistId = normalizeOptionalUuidQueryParam(query.artistId, "Artist id")

  if (!artistId) {
    return {
      uploads: [] as CsvUploadHistoryItem[],
    }
  }

  const supabase = serverSupabaseServiceRole(event)
  await assertArtistExists(supabase, artistId)

  const { data, error } = await supabase
    .from("csv_uploads")
    .select(
      "id, artist_id, filename, status, row_count, matched_count, unmatched_count, total_amount, period_month, error_message, created_at, updated_at",
    )
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  return {
    uploads: ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      artistId: row.artist_id,
      filename: row.filename,
      status: row.status,
      rowCount: row.row_count,
      matchedCount: row.matched_count,
      unmatchedCount: row.unmatched_count,
      totalAmount: row.total_amount,
      periodMonth: row.period_month,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })) as CsvUploadHistoryItem[],
  }
})
