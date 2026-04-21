import { randomUUID } from "node:crypto"
import { serverSupabaseServiceRole } from "#supabase/server"
import { createError, readBody } from "h3"
import { requireAdminProfile } from "~~/server/utils/auth"
import {
  buildUploadStoragePath,
  CSV_UPLOAD_BUCKET,
  ensureCsvUploadBucket,
  markCsvUploadFailed,
  MAX_CSV_UPLOAD_BYTES,
  normalizePeriodMonth,
} from "~~/server/utils/imports"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { CsvUploadTargetResponse } from "~~/types/imports"

interface CreateUploadBody {
  artistId?: string
  filename?: string
  fileSize?: number
  periodMonth?: string
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<CreateUploadBody>(event)
  const artistId = normalizeRequiredUuid(body.artistId, "Artist")
  const filename = (body.filename ?? "").trim()
  const fileSize = Number(body.fileSize ?? 0)
  const periodMonth = normalizePeriodMonth(body.periodMonth ?? "")

  if (!filename || !/\.csv$/i.test(filename)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Upload a .csv file.",
    })
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "File size must be greater than zero.",
    })
  }

  if (fileSize > MAX_CSV_UPLOAD_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: "CSV files must be 5 MB or smaller.",
    })
  }

  if (!periodMonth) {
    throw createError({
      statusCode: 400,
      statusMessage: "Select a valid statement month.",
    })
  }

  const supabase = serverSupabaseServiceRole(event)
  await ensureCsvUploadBucket(supabase)

  const { data: artist, error: artistError } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", artistId)
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
      statusCode: 404,
      statusMessage: "The selected artist does not exist or is inactive.",
    })
  }

  const uploadId = randomUUID()
  const storagePath = buildUploadStoragePath(artistId, uploadId)
  const checksumPlaceholder = `pending:${uploadId}`

  const { error: insertError } = await supabase.from("csv_uploads").insert({
    id: uploadId,
    uploaded_by: profile.id,
    artist_id: artistId,
    filename,
    file_url: storagePath,
    status: "processing",
    period_month: periodMonth,
    checksum: checksumPlaceholder,
  })

  if (insertError) {
    throw createError({
      statusCode: 500,
      statusMessage: insertError.message,
    })
  }

  const { data, error: signedUrlError } = await supabase
    .storage
    .from(CSV_UPLOAD_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signedUrlError || !data?.token || !data.path) {
    await markCsvUploadFailed(
      supabase,
      uploadId,
      signedUrlError?.message || "Unable to create a signed upload target.",
    )

    throw createError({
      statusCode: 500,
      statusMessage: signedUrlError?.message || "Unable to create a signed upload target.",
    })
  }

  return {
    uploadId,
    bucket: CSV_UPLOAD_BUCKET,
    path: data.path,
    token: data.token,
    filename,
    artistId,
    periodMonth,
  } satisfies CsvUploadTargetResponse
})
