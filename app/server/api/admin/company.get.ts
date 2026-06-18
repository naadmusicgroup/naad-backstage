import { createError, getQuery } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { fetchAllPages } from "~~/server/utils/supabase-pagination"
import {
  COMPANY_TRANSACTION_SELECT,
  buildCompanyPagination,
  loadCompanyBankDetails,
  mapCompanyTransaction,
  normalizeCompanyFilters,
  summarizeCompanyTransactions,
  type CompanyTransactionFilters,
} from "~~/server/utils/company-finance"
import type { CompanyFinanceResponse } from "~~/types/company"

function cleanSearchForOr(value: string) {
  return value.replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim()
}

function applyCompanyTransactionFilters(query: any, filters: CompanyTransactionFilters) {
  let nextQuery = query
    .eq("currency", filters.currency)
    .is("deleted_at", null)

  if (filters.year) {
    nextQuery = nextQuery
      .gte("transaction_date", `${filters.year}-01-01`)
      .lte("transaction_date", `${filters.year}-12-31`)
  }

  if (filters.dateFrom) {
    nextQuery = nextQuery.gte("transaction_date", filters.dateFrom)
  }

  if (filters.dateTo) {
    nextQuery = nextQuery.lte("transaction_date", filters.dateTo)
  }

  if (filters.transactionType) {
    nextQuery = nextQuery.eq("transaction_type", filters.transactionType)
  }

  if (filters.status) {
    nextQuery = nextQuery.eq("status", filters.status)
  }

  const search = cleanSearchForOr(filters.search)

  if (search) {
    const pattern = `%${search}%`
    nextQuery = nextQuery.or([
      `name.ilike.${pattern}`,
      `category.ilike.${pattern}`,
      `vendor_payee.ilike.${pattern}`,
      `reference_number.ilike.${pattern}`,
      `note.ilike.${pattern}`,
    ].join(","))
  }

  return nextQuery
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const filters = normalizeCompanyFilters(getQuery(event))
  const supabase = serverSupabaseServiceRole(event)
  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1

  const pageQuery = applyCompanyTransactionFilters(
    supabase
      .from("company_transactions")
      .select(COMPANY_TRANSACTION_SELECT, { count: "exact" }),
    filters,
  )
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to)

  const { data, error, count } = await pageQuery

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load company transactions.",
    })
  }

  const allFilteredRows = await fetchAllPages<any>(
    "Unable to summarize company transactions.",
    (pageFrom, pageTo) => applyCompanyTransactionFilters(
      supabase
        .from("company_transactions")
        .select(COMPANY_TRANSACTION_SELECT),
      filters,
    )
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(pageFrom, pageTo),
  )
  const transactions = ((data ?? []) as any[]).map((row) => mapCompanyTransaction(row))
  const summarizedTransactions = allFilteredRows.map((row) => mapCompanyTransaction(row))

  const { data: yearRows, error: yearsError } = await supabase
    .from("company_transactions")
    .select("transaction_date")
    .eq("currency", filters.currency)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })

  if (yearsError) {
    throw createError({
      statusCode: 500,
      statusMessage: yearsError.message || "Unable to load company transaction years.",
    })
  }

  const years = [...new Set((yearRows ?? [])
    .map((row: any) => Number(String(row.transaction_date).slice(0, 4)))
    .filter((year: number) => Number.isInteger(year)))]

  return {
    currency: filters.currency,
    transactions,
    summary: summarizeCompanyTransactions(summarizedTransactions),
    pagination: buildCompanyPagination(filters.page, filters.pageSize, count ?? 0),
    years,
    bankDetails: await loadCompanyBankDetails(supabase, filters.currency, { optional: true }),
  } satisfies CompanyFinanceResponse
})
