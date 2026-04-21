import { createError, readBody } from "h3"
import Decimal from "decimal.js"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import type { CsvReverseResponse } from "~~/types/imports"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { toMoneyString } from "~~/server/utils/money"

interface ReverseBody {
  confirmNegative?: boolean
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const uploadId = normalizeRequiredUuid(event.context.params?.id, "Upload id")

  const body = await readBody<ReverseBody>(event)
  const supabase = serverSupabaseServiceRole(event)
  const { data: upload, error: uploadError } = await supabase
    .from("csv_uploads")
    .select("id, artist_id, filename, status, total_amount")
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

  if (upload.status !== "completed") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only completed uploads can be reversed.",
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

  const currentBalance = new Decimal(walletRow?.available_balance ?? 0)
  const uploadTotal = new Decimal(upload.total_amount ?? 0)
  const resultingBalance = currentBalance.sub(uploadTotal)

  if (resultingBalance.isNegative() && body.confirmNegative !== true) {
    throw createError({
      statusCode: 409,
      statusMessage: `Reversing ${upload.filename} will leave the artist at ${resultingBalance.toFixed(2)}. Confirm the reversal to continue.`,
      data: {
        requiresConfirmation: true,
        currentBalance: toMoneyString(currentBalance),
        resultingBalance: toMoneyString(resultingBalance),
      },
    })
  }

  const { data, error } = await supabase.rpc("reverse_csv_upload", {
    target_upload_id: uploadId,
    actor_admin_id: profile.id,
  })

  if (error || !data) {
    throw createError({
      statusCode: 409,
      statusMessage: error?.message || "Unable to reverse this upload.",
    })
  }

  return data as CsvReverseResponse
})
