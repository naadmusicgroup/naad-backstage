import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { fetchAllPages } from "~~/server/utils/supabase-pagination"
import {
  COMPANY_TRANSACTION_SELECT,
  buildCompanyBreakdownRows,
  buildCompanyMonthlyRows,
  loadCompanyBankDetails,
  mapCompanyTransaction,
  summarizeCompanyTransactions,
} from "~~/server/utils/company-finance"
import type { CompanyAnalyticsResponse, CompanyCurrency } from "~~/types/company"

function emptySummary() {
  return {
    transactionCount: 0,
    incomeTotal: "0.00000000",
    expenseTotal: "0.00000000",
    netCashFlow: "0.00000000",
    availableBalance: "0.00000000",
    missingAttachmentCount: 0,
    unreconciledCount: 0,
    flaggedCount: 0,
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)
  const rows = await fetchAllPages<any>(
    "Unable to load company analytics.",
    (from, to) => supabase
      .from("company_transactions")
      .select(COMPANY_TRANSACTION_SELECT)
      .is("deleted_at", null)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, to),
  )
  const transactions = rows.map((row) => mapCompanyTransaction(row))
  const currencies: CompanyCurrency[] = ["USD", "NPR"]
  const summaryByCurrency = currencies.reduce((summary, currency) => ({
    ...summary,
    [currency]: summarizeCompanyTransactions(transactions.filter((row) => row.currency === currency)),
  }), {} as CompanyAnalyticsResponse["summaryByCurrency"])
  const totalSummary = summarizeCompanyTransactions(transactions)

  return {
    summaryByCurrency: {
      USD: summaryByCurrency.USD ?? emptySummary(),
      NPR: summaryByCurrency.NPR ?? emptySummary(),
    },
    bankDetailsByCurrency: {
      USD: await loadCompanyBankDetails(supabase, "USD", { optional: true }),
      NPR: await loadCompanyBankDetails(supabase, "NPR", { optional: true }),
    },
    monthly: buildCompanyMonthlyRows(transactions),
    categories: buildCompanyBreakdownRows(transactions, (row) => row.category),
    vendors: buildCompanyBreakdownRows(transactions, (row) => row.vendorPayee ?? "Unassigned vendor"),
    largestTransactions: [...transactions]
      .sort((left, right) => Number(right.amount) - Number(left.amount))
      .slice(0, 10),
    reviewTransactions: transactions
      .filter((row) => !row.attachments.length || row.status !== "reconciled")
      .slice(0, 20),
    missingAttachmentCount: totalSummary.missingAttachmentCount,
    unreconciledCount: totalSummary.unreconciledCount,
    flaggedCount: totalSummary.flaggedCount,
  } satisfies CompanyAnalyticsResponse
})
