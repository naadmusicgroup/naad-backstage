import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { sendArtistNotificationEmail } from "~~/server/utils/email"
import { CSV_UPLOAD_BUCKET } from "~~/server/utils/imports"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type { CsvReplacementCommitResponse } from "~~/types/imports"

interface ReplaceBody {
  replacementUploadId?: string
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const oldUploadId = normalizeRequiredUuid(event.context.params?.id, "Upload id")
  const body = await readBody<ReplaceBody>(event)
  const replacementUploadId = normalizeRequiredUuid(body.replacementUploadId, "Replacement upload id")

  const supabase = serverSupabaseServiceRole(event)
  const { data, error } = await supabase.rpc("replace_csv_upload", {
    old_upload_id: oldUploadId,
    new_upload_id: replacementUploadId,
    actor_admin_id: profile.id,
    analytics_payload: {},
  })

  if (error || !data) {
    throw createError({
      statusCode: 409,
      statusMessage: error?.message || "Unable to replace this upload.",
    })
  }

  const result = data as Record<string, any>
  let oldStorageDeleted = true
  let oldStorageWarning: string | null = null
  const oldFileUrl = typeof result.oldFileUrl === "string" ? result.oldFileUrl : ""

  if (oldFileUrl) {
    const { error: storageError } = await supabase
      .storage
      .from(CSV_UPLOAD_BUCKET)
      .remove([oldFileUrl])

    if (storageError) {
      oldStorageDeleted = false
      oldStorageWarning = storageError.message || "The upload data was replaced, but the old storage file cleanup failed."
    }
  }

  const response = {
    uploadId: result.uploadId,
    status: "completed",
    rowsInserted: Number(result.rowsInserted ?? 0),
    totalAmount: String(result.totalAmount ?? "0"),
    ledgerEntryId: String(result.ledgerEntryId ?? ""),
    oldUploadId: result.oldUploadId,
    oldTotalAmount: String(result.oldTotalAmount ?? "0"),
    oldEarningsRowsDeleted: Number(result.oldEarningsRowsDeleted ?? 0),
    oldLedgerRowsDeleted: Number(result.oldLedgerRowsDeleted ?? 0),
    oldNotificationsDeleted: Number(result.oldNotificationsDeleted ?? 0),
    oldStorageDeleted,
    oldStorageWarning,
  } satisfies CsvReplacementCommitResponse

  await sendArtistNotificationEmail(event, supabase, {
    type: "earnings_posted",
    referenceId: response.uploadId,
  })

  return response
})
