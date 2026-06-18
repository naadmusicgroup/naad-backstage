import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireFreshAdminVerification } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  isMissingCompanyBankDetailsTable,
  loadCompanyBankDetails,
  normalizeCompanyBankDetailsInput,
} from "~~/server/utils/company-finance"
import type { CompanyBankDetailsMutationInput, CompanyBankDetailsMutationResponse } from "~~/types/company"

function companyBankDetailsMigrationError() {
  return createError({
    statusCode: 503,
    statusMessage: "Company bank details are not set up yet. Run the Supabase migration supabase/migrations/20260617214500_company_bank_details.sql, then retry.",
  })
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireFreshAdminVerification(event, "company_bank_details.updated")
  const body = (await readBody<CompanyBankDetailsMutationInput>(event)) ?? ({} as CompanyBankDetailsMutationInput)
  const input = normalizeCompanyBankDetailsInput(body)
  const supabase = serverSupabaseServiceRole(event)
  let existing

  try {
    existing = await loadCompanyBankDetails(supabase, input.currency)
  } catch (caught: any) {
    if (isMissingCompanyBankDetailsTable(caught) || isMissingCompanyBankDetailsTable(caught?.cause)) {
      throw companyBankDetailsMigrationError()
    }

    throw caught
  }
  const mutation = existing
    ? supabase
      .from("company_bank_details")
      .update({
        ...input,
        updated_by: profile.id,
      })
      .eq("id", existing.id)
      .select("id")
      .single()
    : supabase
      .from("company_bank_details")
      .insert({
        ...input,
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("id")
      .single()

  const { data, error } = await mutation

  if (error || !data) {
    if (isMissingCompanyBankDetailsTable(error)) {
      throw companyBankDetailsMigrationError()
    }

    throw createError({
      statusCode: 500,
      statusMessage: error?.message || "Unable to save company bank details.",
    })
  }

  await logAdminActivity(supabase, profile.id, "company_bank_details.updated", "company_bank_details", data.id, {
    currency: input.currency,
    bank_name: input.bank_name,
  })

  const bankDetails = await loadCompanyBankDetails(supabase, input.currency)

  if (!bankDetails) {
    throw createError({
      statusCode: 500,
      statusMessage: "Company bank details were saved but could not be reloaded.",
    })
  }

  return {
    bankDetails,
  } satisfies CompanyBankDetailsMutationResponse
})
