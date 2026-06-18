import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { COMPANY_ATTACHMENT_BUCKET } from "~~/server/utils/company-finance"
import {
  deleteMediaObject,
  isS3MediaKey,
} from "~~/server/utils/media-storage"

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const attachmentId = normalizeRequiredUuid(event.context.params?.id, "Attachment id")
  const supabase = serverSupabaseServiceRole(event)

  const { data: attachment, error: attachmentError } = await supabase
    .from("company_transaction_attachments")
    .select("id, transaction_id, storage_path")
    .eq("id", attachmentId)
    .maybeSingle()

  if (attachmentError) {
    throw createError({
      statusCode: 500,
      statusMessage: attachmentError.message || "Unable to load this attachment.",
    })
  }

  if (!attachment) {
    throw createError({
      statusCode: 404,
      statusMessage: "That attachment could not be found.",
    })
  }

  if (isS3MediaKey(attachment.storage_path)) {
    await deleteMediaObject(attachment.storage_path)
  } else {
    const { error: storageError } = await supabase
      .storage
      .from(COMPANY_ATTACHMENT_BUCKET)
      .remove([attachment.storage_path])

    if (storageError) {
      throw createError({
        statusCode: 500,
        statusMessage: storageError.message || "Unable to remove this attachment file.",
      })
    }
  }

  const { error: deleteError } = await supabase
    .from("company_transaction_attachments")
    .delete()
    .eq("id", attachmentId)

  if (deleteError) {
    throw createError({
      statusCode: 500,
      statusMessage: deleteError.message || "Unable to delete this attachment.",
    })
  }

  await logAdminActivity(supabase, profile.id, "company_attachment.deleted", "company_transaction", attachment.transaction_id, {
    attachment_id: attachmentId,
  })

  return { ok: true }
})
