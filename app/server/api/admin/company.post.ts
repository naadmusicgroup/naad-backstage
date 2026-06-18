import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
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
import type { CompanyTransactionMutationInput, CompanyTransactionMutationResponse } from "~~/types/company"

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "company_transaction.created")
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

  const { data, error } = await supabase
    .from("company_transactions")
    .insert({
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
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    throw createError({
      statusCode: 500,
      statusMessage: error?.message || "Unable to create this company transaction.",
    })
  }

  await logAdminActivity(supabase, profile.id, "company_transaction.created", "company_transaction", data.id, {
    currency,
    transaction_type: transactionType,
    transaction_date: transactionDate,
    amount,
    category,
    status,
  })

  return {
    transaction: await loadCompanyTransactionById(supabase, data.id),
  } satisfies CompanyTransactionMutationResponse
})
