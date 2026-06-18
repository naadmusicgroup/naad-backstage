import { createError, getQuery, sendRedirect } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import { COMPANY_ATTACHMENT_BUCKET } from "~~/server/utils/company-finance"
import {
  downloadMediaBuffer,
  isS3MediaKey,
  mediaBufferToArrayBuffer,
} from "~~/server/utils/media-storage"

function contentDisposition(filename: string, disposition: "inline" | "attachment") {
  const safeFilename = filename.replace(/[^\w.\- ()]/g, "_")
  return `${disposition}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const attachmentId = normalizeRequiredUuid(event.context.params?.id, "Attachment id")
  const query = getQuery(event)
  const disposition = query.download === "1" ? "attachment" : "inline"
  const supabase = serverSupabaseServiceRole(event)

  const { data: attachment, error: attachmentError } = await supabase
    .from("company_transaction_attachments")
    .select("id, filename, storage_path, company_transactions!inner(id, deleted_at)")
    .eq("id", attachmentId)
    .is("company_transactions.deleted_at", null)
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
    const download = await downloadMediaBuffer(attachment.storage_path)

    return new Response(mediaBufferToArrayBuffer(download.buffer), {
      headers: {
        "Content-Type": download.contentType || "application/octet-stream",
        "Content-Length": String(download.contentLength),
        "Content-Disposition": contentDisposition(attachment.filename || "attachment", disposition),
        "Cache-Control": "private, max-age=60",
      },
    })
  }

  const { data, error } = await supabase
    .storage
    .from(COMPANY_ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path, 60)

  if (error || !data?.signedUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || "Unable to prepare this attachment download.",
    })
  }

  return sendRedirect(event, data.signedUrl, 302)
})
