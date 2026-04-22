import { createError, readBody } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { CSV_UPLOAD_BUCKET } from "~~/server/utils/imports"
import type { CsvDeleteResponse } from "~~/types/imports"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { toMoneyString } from "~~/server/utils/money"

interface DeleteBody {
  confirmNegative?: boolean
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const uploadId = normalizeRequiredUuid(event.context.params?.id, "Upload id")

  const body = await readBody<DeleteBody>(event)
  const supabase = serverSupabaseServiceRole(event)
  const { data: upload, error: uploadError } = await supabase
    .from("csv_uploads")
    .select("id, artist_id, filename, status, file_url")
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

  const { data: walletRow, error: walletError } = await supabase
    .from("artist_wallet")
    .select("available_balance")
    .eq("artist_id", upload.artist_id)
    .maybeSingle()

  if (walletError) {
    throw createError({
      statusCode: 500,
      statusMessage: walletError.message,
    })
  }

  const { data: earningsRows, error: earningsError } = await supabase
    .from("earnings")
    .select("total_amount")
    .eq("upload_id", upload.id)

  if (earningsError) {
    throw createError({
      statusCode: 500,
      statusMessage: earningsError.message,
    })
  }

  const currentBalance = new Decimal(walletRow?.available_balance ?? 0)
  const uploadTotal = (earningsRows ?? []).reduce(
    (sum, row) => sum.add(row.total_amount ?? 0),
    new Decimal(0),
  )
  const resultingBalance = currentBalance.sub(uploadTotal)

  if (resultingBalance.isNegative() && body.confirmNegative !== true) {
    throw createError({
      statusCode: 409,
      statusMessage: `Deleting ${upload.filename} will leave the artist at ${resultingBalance.toFixed(2)}. Confirm permanent deletion to continue.`,
      data: {
        requiresConfirmation: true,
        currentBalance: toMoneyString(currentBalance),
        resultingBalance: toMoneyString(resultingBalance),
      },
    })
  }

  const { data, error } = await supabase.rpc("delete_csv_upload", {
    target_upload_id: uploadId,
    actor_admin_id: profile.id,
  })

  if (error || !data) {
    throw createError({
      statusCode: 409,
      statusMessage: error?.message || "Unable to delete this upload.",
    })
  }

  let storageDeleted = true
  let storageWarning: string | null = null

  if (upload.file_url) {
    const { error: storageError } = await supabase
      .storage
      .from(CSV_UPLOAD_BUCKET)
      .remove([upload.file_url])

    if (storageError) {
      storageDeleted = false
      storageWarning = storageError.message || "The upload data was deleted, but the storage file cleanup failed."
    }
  }

  return {
    ...(data as Omit<CsvDeleteResponse, "storageDeleted" | "storageWarning">),
    storageDeleted,
    storageWarning,
  } satisfies CsvDeleteResponse
})
