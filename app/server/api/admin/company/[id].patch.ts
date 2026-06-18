import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import {
  buildCompanyAttachmentFolderMarkers,
  buildCompanyAttachmentPath,
  loadCompanyTransactionById,
  normalizeCompanyCurrency,
  normalizeCompanyIsoDate,
  normalizeCompanyMoney,
  normalizeCompanyOptionalText,
  normalizeCompanyPaymentMethod,
  normalizeCompanyRequiredText,
  normalizeCompanyTransactionStatus,
  normalizeCompanyTransactionType,
} from "~~/server/utils/company-finance"
import {
  createMediaFolderMarkers,
  deleteMediaObject,
  downloadMediaBuffer,
  isS3MediaKey,
  uploadMediaBuffer,
} from "~~/server/utils/media-storage"
import type { CompanyTransactionMutationInput, CompanyTransactionMutationResponse } from "~~/types/company"

async function relocateCompanyS3Attachments(
  supabase: any,
  transactionId: string,
  currency: "USD" | "NPR",
  transactionDate: string,
  transactionName: string,
) {
  const { data: attachments, error } = await supabase
    .from("company_transaction_attachments")
    .select("id, filename, content_type, storage_path")
    .eq("transaction_id", transactionId)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load transaction attachments for relocation.",
    })
  }

  let relocatedCount = 0

  for (const attachment of attachments ?? []) {
    if (!isS3MediaKey(attachment.storage_path)) {
      continue
    }

    const nextPath = buildCompanyAttachmentPath({
      transactionId,
      filename: attachment.filename,
      transactionName,
      currency,
      transactionDate,
      uploadedAt: new Date(Date.now() + relocatedCount),
    })
    const downloaded = await downloadMediaBuffer(attachment.storage_path)

    await createMediaFolderMarkers(buildCompanyAttachmentFolderMarkers({
      transactionId,
      currency,
      transactionDate,
      transactionName,
    }))

    await uploadMediaBuffer(nextPath, downloaded.buffer, downloaded.contentType || attachment.content_type || "application/octet-stream")

    const { error: updateAttachmentError } = await supabase
      .from("company_transaction_attachments")
      .update({ storage_path: nextPath })
      .eq("id", attachment.id)

    if (updateAttachmentError) {
      await deleteMediaObject(nextPath).catch(() => undefined)

      throw createError({
        statusCode: 500,
        statusMessage: updateAttachmentError.message || "Unable to update relocated attachment metadata.",
      })
    }

    await deleteMediaObject(attachment.storage_path).catch(() => undefined)
    relocatedCount += 1
  }

  return relocatedCount
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "company_transaction.updated")
  const transactionId = normalizeRequiredUuid(event.context.params?.id, "Company transaction id")
  const body = await readBody<CompanyTransactionMutationInput>(event)
  const currency = normalizeCompanyCurrency(body.currency)
  const transactionType = normalizeCompanyTransactionType(body.transactionType)
  const transactionDate = normalizeCompanyIsoDate(body.transactionDate)
  const name = normalizeCompanyRequiredText(body.name, "Transaction name")
  const amount = normalizeCompanyMoney(body.amount)
  const category = normalizeCompanyRequiredText(body.category, "Category")
  const vendorPayee = normalizeCompanyOptionalText(body.vendorPayee)
  const paymentMethod = normalizeCompanyPaymentMethod(body.paymentMethod)
  const referenceNumber = normalizeCompanyOptionalText(body.referenceNumber)
  const status = normalizeCompanyTransactionStatus(body.status)
  const note = normalizeCompanyOptionalText(body.note)
  const supabase = serverSupabaseServiceRole(event)

  const { data: existingTransaction, error: existingTransactionError } = await supabase
    .from("company_transactions")
    .select("id, currency, transaction_date, name")
    .eq("id", transactionId)
    .is("deleted_at", null)
    .maybeSingle()

  if (existingTransactionError) {
    throw createError({
      statusCode: 500,
      statusMessage: existingTransactionError.message || "Unable to load this company transaction.",
    })
  }

  if (!existingTransaction) {
    throw createError({
      statusCode: 404,
      statusMessage: "That company transaction could not be found.",
    })
  }

  const { error } = await supabase
    .from("company_transactions")
    .update({
      currency,
      transaction_type: transactionType,
      transaction_date: transactionDate,
      name,
      amount,
      category,
      vendor_payee: vendorPayee,
      payment_method: paymentMethod,
      reference_number: referenceNumber,
      status,
      note,
      updated_by: profile.id,
    })
    .eq("id", transactionId)
    .is("deleted_at", null)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to update this company transaction.",
    })
  }

  const shouldRelocateAttachments = existingTransaction.currency !== currency
    || existingTransaction.transaction_date !== transactionDate
    || existingTransaction.name !== name
  const relocatedAttachmentCount = shouldRelocateAttachments
    ? await relocateCompanyS3Attachments(supabase, transactionId, currency, transactionDate, name)
    : 0

  await logAdminActivity(supabase, profile.id, "company_transaction.updated", "company_transaction", transactionId, {
    currency,
    transaction_type: transactionType,
    transaction_date: transactionDate,
    amount,
    category,
    status,
    relocated_attachment_count: relocatedAttachmentCount,
  })

  return {
    transaction: await loadCompanyTransactionById(supabase, transactionId),
  } satisfies CompanyTransactionMutationResponse
})
