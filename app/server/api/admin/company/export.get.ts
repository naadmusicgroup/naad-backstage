import { getQuery, setHeader } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { fetchAllPages } from "~~/server/utils/supabase-pagination"
import {
  COMPANY_TRANSACTION_SELECT,
  companyAttachmentCsvLinks,
  csvLine,
  mapCompanyTransaction,
  normalizeCompanyFilters,
  type CompanyTransactionFilters,
} from "~~/server/utils/company-finance"

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

function exportLabel(filters: CompanyTransactionFilters) {
  if (filters.dateFrom || filters.dateTo) {
    return `${filters.dateFrom ?? "start"}-to-${filters.dateTo ?? "latest"}`
  }

  if (filters.year) {
    return String(filters.year)
  }

  return "all-dates"
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const filters = normalizeCompanyFilters(getQuery(event))
  const supabase = serverSupabaseServiceRole(event)
  const rows = await fetchAllPages<any>(
    "Unable to export company transactions.",
    (from, to) => applyCompanyTransactionFilters(
      supabase
        .from("company_transactions")
        .select(COMPANY_TRANSACTION_SELECT),
      filters,
    )
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  )
  const transactions = rows.map((row) => mapCompanyTransaction(row))
  const lines = [
    csvLine([
      "Date",
      "Year",
      "Currency",
      "Type",
      "Name",
      "Amount",
      "Category",
      "Vendor / Payee",
      "Payment method",
      "Reference",
      "Status",
      "Attachment links",
      "Note",
      "Created at",
    ]),
    ...transactions.map((transaction) => csvLine([
      transaction.transactionDate,
      transaction.year,
      transaction.currency,
      transaction.transactionType,
      transaction.name,
      transaction.amount,
      transaction.category,
      transaction.vendorPayee ?? "",
      transaction.paymentMethod,
      transaction.referenceNumber ?? "",
      transaction.status,
      companyAttachmentCsvLinks(transaction.attachments),
      transaction.note ?? "",
      transaction.createdAt,
    ])),
  ]

  const filename = `company-${filters.currency.toLowerCase()}-transactions-${exportLabel(filters)}.csv`

  setHeader(event, "content-type", "text/csv; charset=utf-8")
  setHeader(event, "content-disposition", `attachment; filename="${filename}"`)

  return lines.join("\r\n")
})
