import { serverSupabaseServiceRole } from "#supabase/server"
import { createError } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  buildCsvPreview,
  CSV_UPLOAD_BUCKET,
  markCsvUploadFailed,
} from "~~/server/utils/imports"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { CsvPreviewResponse } from "~~/types/imports"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const uploadId = normalizeRequiredUuid(event.context.params?.id, "Upload id")

  const supabase = serverSupabaseServiceRole(event)
  const { data: upload, error: uploadError } = await supabase
    .from("csv_uploads")
    .select("id, artist_id, filename, file_url, status")
    .eq("id", uploadId)
    .maybeSingle()

  if (uploadError) {
    throw createError({
      statusCode: 500,
      statusMessage: uploadError.message,
    })
  }

  if (!upload) {
    throw createError({
      statusCode: 404,
      statusMessage: "That upload could not be found.",
    })
  }

  if (upload.status === "completed" || upload.status === "reversed") {
    throw createError({
      statusCode: 409,
      statusMessage: "This upload has already been finalized and cannot be previewed again.",
    })
  }

  try {
    const { data: fileBlob, error: downloadError } = await supabase
      .storage
      .from(CSV_UPLOAD_BUCKET)
      .download(upload.file_url)

    if (downloadError || !fileBlob) {
      throw createError({
        statusCode: 500,
        statusMessage: downloadError?.message || "Unable to read the uploaded CSV file.",
      })
    }

    const csvText = await fileBlob.text()
    const { checksum, parsedData } = await buildCsvPreview(supabase, csvText)
    const { data: duplicate, error: duplicateError } = await supabase
      .from("csv_uploads")
      .select("id, filename")
      .eq("artist_id", upload.artist_id)
      .eq("checksum", checksum)
      .neq("id", uploadId)
      .maybeSingle()

    if (duplicateError) {
      throw createError({
        statusCode: 500,
        statusMessage: duplicateError.message,
      })
    }

    if (duplicate) {
      const duplicateMessage = `Duplicate CSV detected. Matching upload ${duplicate.filename} already exists for this artist.`
      await markCsvUploadFailed(supabase, uploadId, duplicateMessage)

      throw createError({
        statusCode: 409,
        statusMessage: duplicateMessage,
      })
    }

    const { error: updateError } = await supabase
      .from("csv_uploads")
      .update({
        status: "processing",
        error_message: null,
        checksum,
        row_count: parsedData.summary.rowCount,
        matched_count: parsedData.summary.matchedCount,
        unmatched_count: parsedData.summary.unmatchedCount,
        total_amount: parsedData.summary.totalAmount,
        total_units: parsedData.summary.totalUnits,
        period_start: parsedData.summary.periodStart,
        period_end: parsedData.summary.periodEnd,
        reporting_date: parsedData.summary.reportingDate,
        parsed_data: parsedData,
      })
      .eq("id", uploadId)

    if (updateError) {
      if (updateError.code === "23505") {
        const duplicateMessage = "Duplicate CSV detected for this artist."
        await markCsvUploadFailed(supabase, uploadId, duplicateMessage)

        throw createError({
          statusCode: 409,
          statusMessage: duplicateMessage,
        })
      }

      throw createError({
        statusCode: 500,
        statusMessage: updateError.message,
      })
    }

    await supabase.from("admin_activity_log").insert({
      admin_id: profile.id,
      action: "csv.uploaded",
      entity_type: "csv_upload",
      entity_id: uploadId,
      details: {
        filename: upload.filename,
        artist_id: upload.artist_id,
        row_count: parsedData.summary.rowCount,
        matched_count: parsedData.summary.matchedCount,
        unmatched_count: parsedData.summary.unmatchedCount,
        total_amount: parsedData.summary.totalAmount,
      },
    })

    return {
      uploadId,
      filename: upload.filename,
      checksum,
      summary: parsedData.summary,
      releases: parsedData.releases,
      unmatched: parsedData.unmatched,
      warnings: parsedData.warnings,
    } satisfies CsvPreviewResponse
  } catch (error: any) {
    const message = error?.statusMessage || error?.message || "Unable to parse this CSV upload."
    await markCsvUploadFailed(supabase, uploadId, message)

    throw createError({
      statusCode: error?.statusCode || 500,
      statusMessage: message,
    })
  }
})
