import { createError, getRequestHeader, readBody, readMultipartFormData } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import {
  COMPANY_ATTACHMENT_BUCKET,
  buildCompanyAttachmentFolderMarkers,
  buildCompanyAttachmentPath,
  buildCompanyAttachmentUploadResponse,
  ensureCompanyAttachmentBucket,
  validateCompanyAttachmentFile,
} from "~~/server/utils/company-finance"
import {
  createMediaFolderMarkers,
  createMediaUploadUrl,
  isS3MediaStorageEnabled,
  mediaBucketName,
  uploadMediaBuffer,
} from "~~/server/utils/media-storage"

interface CreateCompanyAttachmentBody {
  filename?: unknown
  fileSize?: unknown
  contentType?: unknown
}

function multipartAttachmentFile(formData: Awaited<ReturnType<typeof readMultipartFormData>>) {
  const filePart = formData?.find((part) => part.name === "file" && part.filename)

  if (!filePart?.data || !filePart.filename) {
    throw createError({
      statusCode: 400,
      statusMessage: "Choose an attachment to upload.",
    })
  }

  const buffer = Buffer.from(filePart.data)

  return {
    buffer,
    filename: filePart.filename,
    fileSize: buffer.byteLength,
    contentType: filePart.type || "application/octet-stream",
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const transactionId = normalizeRequiredUuid(event.context.params?.id, "Company transaction id")
  const isMultipartUpload = /multipart\/form-data/i.test(getRequestHeader(event, "content-type") ?? "")
  const multipartFile = isMultipartUpload
    ? multipartAttachmentFile(await readMultipartFormData(event))
    : null
  const file = validateCompanyAttachmentFile(multipartFile ?? await readBody<CreateCompanyAttachmentBody>(event))
  const supabase = serverSupabaseServiceRole(event)

  const { data: transaction, error: transactionError } = await supabase
    .from("company_transactions")
    .select("id, currency, transaction_date, name")
    .eq("id", transactionId)
    .is("deleted_at", null)
    .maybeSingle()

  if (transactionError) {
    throw createError({
      statusCode: 500,
      statusMessage: transactionError.message || "Unable to verify this company transaction.",
    })
  }

  if (!transaction) {
    throw createError({
      statusCode: 404,
      statusMessage: "That company transaction could not be found.",
    })
  }

  const storagePath = buildCompanyAttachmentPath({
    transactionId,
    filename: file.filename,
    transactionName: transaction.name,
    currency: isS3MediaStorageEnabled() ? transaction.currency : null,
    transactionDate: isS3MediaStorageEnabled() ? transaction.transaction_date : null,
    uploadedAt: new Date(),
  })
  const { data: attachment, error: insertError } = await supabase
    .from("company_transaction_attachments")
    .insert({
      transaction_id: transactionId,
      uploaded_by: profile.id,
      filename: file.filename,
      content_type: file.contentType,
      file_size: file.fileSize,
      storage_path: storagePath,
    })
    .select("id")
    .single()

  if (insertError || !attachment) {
    throw createError({
      statusCode: 500,
      statusMessage: insertError?.message || "Unable to save attachment metadata.",
    })
  }

  try {
    const s3Enabled = isS3MediaStorageEnabled()

    if (s3Enabled) {
      await createMediaFolderMarkers(buildCompanyAttachmentFolderMarkers({
        transactionId,
        currency: transaction.currency,
        transactionDate: transaction.transaction_date,
        transactionName: transaction.name,
      }))
    }

    await logAdminActivity(supabase, profile.id, "company_attachment.created", "company_transaction", transactionId, {
      attachment_id: attachment.id,
      filename: file.filename,
      file_size: file.fileSize,
      storage_path: storagePath,
    })

    if (multipartFile) {
      if (s3Enabled) {
        await uploadMediaBuffer(storagePath, multipartFile.buffer, file.contentType)
      } else {
        await ensureCompanyAttachmentBucket(supabase)

        const { error: uploadError } = await supabase
          .storage
          .from(COMPANY_ATTACHMENT_BUCKET)
          .upload(storagePath, multipartFile.buffer, {
            contentType: file.contentType,
            upsert: false,
          })

        if (uploadError) {
          throw createError({
            statusCode: 500,
            statusMessage: uploadError.message || "Unable to save this attachment.",
          })
        }
      }

      return {
        ok: true,
        attachmentId: attachment.id,
        transactionId,
        filename: file.filename,
        contentType: file.contentType,
        path: storagePath,
      }
    }

    if (!s3Enabled) {
      await ensureCompanyAttachmentBucket(supabase)

      const { data: signedUpload, error: signedUploadError } = await supabase
        .storage
        .from(COMPANY_ATTACHMENT_BUCKET)
        .createSignedUploadUrl(storagePath)

      if (signedUploadError || !signedUpload?.token || !signedUpload.path) {
        throw createError({
          statusCode: 500,
          statusMessage: signedUploadError?.message || "Unable to prepare this attachment upload.",
        })
      }

      return buildCompanyAttachmentUploadResponse({
        attachmentId: attachment.id,
        transactionId,
        bucket: COMPANY_ATTACHMENT_BUCKET,
        path: signedUpload.path,
        token: signedUpload.token,
        signedUrl: signedUpload.signedUrl,
        filename: file.filename,
        contentType: file.contentType,
        uploadMethod: "supabase-signed-url",
      })
    }

    const signedUrl = await createMediaUploadUrl(storagePath, file.contentType)

    return buildCompanyAttachmentUploadResponse({
      attachmentId: attachment.id,
      transactionId,
      bucket: mediaBucketName(),
      path: storagePath,
      token: "",
      signedUrl,
      filename: file.filename,
      contentType: file.contentType,
      uploadMethod: "s3-presigned-put",
      headers: {
        "Content-Type": file.contentType,
      },
    })
  } catch (caught) {
    await supabase.from("company_transaction_attachments").delete().eq("id", attachment.id)
    throw caught
  }
})
