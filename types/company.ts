export type CompanyCurrency = "USD" | "NPR"
export type CompanyTransactionType = "income" | "expense"
export type CompanyPaymentMethod = "bank_transfer" | "cash" | "card" | "online_wallet" | "cheque" | "other"
export type CompanyTransactionStatus = "recorded" | "pending" | "reconciled" | "flagged"

export interface CompanyBankDetailsRecord {
  id: string
  currency: CompanyCurrency
  bankName: string
  bankAddress: string | null
  routingAba: string | null
  swiftCode: string | null
  accountNumber: string
  accountType: string | null
  accountName: string | null
  beneficiaryName: string | null
  branchName: string | null
  createdAt: string
  updatedAt: string
}

export interface CompanyBankDetailsMutationInput {
  currency: CompanyCurrency
  bankName: string
  bankAddress: string | null
  routingAba: string | null
  swiftCode: string | null
  accountNumber: string
  accountType: string | null
  accountName: string | null
  beneficiaryName: string | null
  branchName: string | null
}

export interface CompanyBankDetailsMutationResponse {
  bankDetails: CompanyBankDetailsRecord
}

export interface CompanyTransactionAttachmentRecord {
  id: string
  transactionId: string
  filename: string
  contentType: string | null
  fileSize: number
  storagePath: string
  createdAt: string
}

export interface CompanyTransactionRecord {
  id: string
  currency: CompanyCurrency
  transactionType: CompanyTransactionType
  transactionDate: string
  year: number
  name: string
  amount: string
  category: string
  vendorPayee: string | null
  paymentMethod: CompanyPaymentMethod
  referenceNumber: string | null
  status: CompanyTransactionStatus
  note: string | null
  attachments: CompanyTransactionAttachmentRecord[]
  createdAt: string
  updatedAt: string
}

export interface CompanyFinanceSummary {
  transactionCount: number
  incomeTotal: string
  expenseTotal: string
  netCashFlow: string
  availableBalance: string
  missingAttachmentCount: number
  unreconciledCount: number
  flaggedCount: number
}

export interface CompanyFinancePagination {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export interface CompanyFinanceResponse {
  currency: CompanyCurrency
  transactions: CompanyTransactionRecord[]
  summary: CompanyFinanceSummary
  pagination: CompanyFinancePagination
  years: number[]
  bankDetails: CompanyBankDetailsRecord | null
}

export interface CompanyTransactionMutationInput {
  currency: CompanyCurrency
  transactionType: CompanyTransactionType
  transactionDate: string
  name: string
  amount: string | number
  category: string
  vendorPayee: string | null
  paymentMethod: CompanyPaymentMethod
  referenceNumber: string | null
  status: CompanyTransactionStatus
  note: string | null
}

export interface CompanyTransactionMutationResponse {
  transaction: CompanyTransactionRecord
}

export interface CompanyAttachmentUploadTargetResponse {
  attachmentId: string
  transactionId: string
  bucket: string
  path: string
  token: string
  signedUrl?: string
  filename: string
  contentType: string
  uploadMethod?: "supabase-signed-url" | "s3-presigned-put"
  headers?: Record<string, string>
}

export interface CompanyAnalyticsMonthlyRow {
  currency: CompanyCurrency
  month: string
  income: string
  expense: string
  net: string
}

export interface CompanyAnalyticsBreakdownRow {
  label: string
  currency: CompanyCurrency
  amount: string
  transactionCount: number
  share: number
}

export interface CompanyAnalyticsResponse {
  summaryByCurrency: Record<CompanyCurrency, CompanyFinanceSummary>
  bankDetailsByCurrency: Record<CompanyCurrency, CompanyBankDetailsRecord | null>
  monthly: CompanyAnalyticsMonthlyRow[]
  categories: CompanyAnalyticsBreakdownRow[]
  vendors: CompanyAnalyticsBreakdownRow[]
  largestTransactions: CompanyTransactionRecord[]
  reviewTransactions: CompanyTransactionRecord[]
  missingAttachmentCount: number
  unreconciledCount: number
  flaggedCount: number
}
