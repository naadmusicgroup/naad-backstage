import { extname } from "node:path"
import { createError } from "h3"
import Decimal from "decimal.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { toMoneyString } from "~~/server/utils/money"
import {
  isS3MediaKey,
  publicMediaUrlForKey,
  readableStorageSegment,
} from "~~/server/utils/media-storage"
import type {
  CompanyAnalyticsBreakdownRow,
  CompanyAnalyticsMonthlyRow,
  CompanyAttachmentUploadTargetResponse,
  CompanyBankDetailsMutationInput,
  CompanyBankDetailsRecord,
  CompanyCurrency,
  CompanyFinancePagination,
  CompanyFinanceSummary,
  CompanyPaymentMethod,
  CompanyTransactionAttachmentRecord,
  CompanyTransactionRecord,
  CompanyTransactionStatus,
  CompanyTransactionType,
} from "~~/types/company"

interface CompanyTransactionAttachmentRow {
  id: string
  transaction_id: string
  filename: string
  content_type: string | null
  file_size: number | string
  storage_path: string
  created_at: string
}

interface CompanyTransactionRow {
  id: string
  currency: CompanyCurrency
  transaction_type: CompanyTransactionType
  transaction_date: string
  name: string
  amount: string | number
  category: string
  vendor_payee: string | null
  payment_method: CompanyPaymentMethod
  reference_number: string | null
  status: CompanyTransactionStatus
  note: string | null
  created_at: string
  updated_at: string
  company_transaction_attachments?: CompanyTransactionAttachmentRow[] | null
}

interface CompanyBankDetailsRow {
  id: string
  currency: CompanyCurrency
  bank_name: string
  bank_address: string | null
  routing_aba: string | null
  swift_code: string | null
  account_number: string
  account_type: string | null
  account_name: string | null
  beneficiary_name: string | null
  branch_name: string | null
  created_at: string
  updated_at: string
}

export interface CompanyTransactionFilters {
  currency: CompanyCurrency
  page: number
  pageSize: number
  search: string
  year: number | null
  dateFrom: string | null
  dateTo: string | null
  transactionType: CompanyTransactionType | null
  status: CompanyTransactionStatus | null
}

export const COMPANY_ATTACHMENT_BUCKET = "company-finance-attachments"
export const COMPANY_ATTACHMENT_S3_ROOT = "Transactions-doc"
export const MAX_COMPANY_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const COMPANY_TRANSACTION_SELECT = `
  id,
  currency,
  transaction_type,
  transaction_date,
  name,
  amount,
  category,
  vendor_payee,
  payment_method,
  reference_number,
  status,
  note,
  created_at,
  updated_at,
  company_transaction_attachments(id, transaction_id, filename, content_type, file_size, storage_path, created_at)
`
export const COMPANY_BANK_DETAILS_SELECT = `
  id,
  currency,
  bank_name,
  bank_address,
  routing_aba,
  swift_code,
  account_number,
  account_type,
  account_name,
  beneficiary_name,
  branch_name,
  created_at,
  updated_at
`

const CURRENCIES = new Set<CompanyCurrency>(["USD", "NPR"])
const TRANSACTION_TYPES = new Set<CompanyTransactionType>(["income", "expense"])
const PAYMENT_METHODS = new Set<CompanyPaymentMethod>(["bank_transfer", "cash", "card", "online_wallet", "cheque", "other"])
const TRANSACTION_STATUSES = new Set<CompanyTransactionStatus>(["recorded", "pending", "reconciled", "flagged"])
const MONEY_PATTERN = /^\d+(\.\d{1,8})?$/
const MONTH_FOLDERS = [
  "01-January",
  "02-February",
  "03-March",
  "04-April",
  "05-May",
  "06-June",
  "07-July",
  "08-August",
  "09-September",
  "10-October",
  "11-November",
  "12-December",
] as const

function normalizeText(value: unknown) {
  return String(value ?? "").trim()
}

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function csvCell(value: unknown) {
  let text = String(value ?? "")
  // Neutralize spreadsheet formula injection: a cell beginning with one of these
  // characters can be interpreted as a formula by Excel/Sheets. Prefix with a
  // single quote so it is rendered as literal text instead.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function csvLine(values: unknown[]) {
  return values.map(csvCell).join(",")
}

export function normalizeCompanyCurrency(value: unknown, label = "Currency") {
  const normalized = normalizeText(value).toUpperCase() as CompanyCurrency

  if (!CURRENCIES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be USD or NPR.`,
    })
  }

  return normalized
}

export function normalizeCompanyTransactionType(value: unknown) {
  const normalized = normalizeText(value).toLowerCase() as CompanyTransactionType

  if (!TRANSACTION_TYPES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Transaction type must be income or expense.",
    })
  }

  return normalized
}

export function normalizeCompanyPaymentMethod(value: unknown) {
  const normalized = normalizeText(value || "bank_transfer").toLowerCase() as CompanyPaymentMethod

  if (!PAYMENT_METHODS.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Payment method is invalid.",
    })
  }

  return normalized
}

export function normalizeCompanyTransactionStatus(value: unknown, defaultValue: CompanyTransactionStatus = "recorded") {
  const normalized = normalizeText(value || defaultValue).toLowerCase() as CompanyTransactionStatus

  if (!TRANSACTION_STATUSES.has(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Transaction status is invalid.",
    })
  }

  return normalized
}

export function normalizeCompanyMoney(value: unknown, label = "Amount") {
  const normalized = normalizeText(value)

  if (!normalized) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is required.`,
    })
  }

  if (!MONEY_PATTERN.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid money amount with up to 8 decimals.`,
    })
  }

  const amount = new Decimal(normalized)

  if (amount.lte(0)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be greater than zero.`,
    })
  }

  return amount.toFixed(8)
}

export function normalizeCompanyRequiredText(value: unknown, label: string, minimumLength = 2) {
  const normalized = normalizeText(value)

  if (!normalized || normalized.length < minimumLength) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be at least ${minimumLength} characters.`,
    })
  }

  return normalized
}

export function normalizeCompanyOptionalText(value: unknown) {
  const normalized = normalizeText(value)
  return normalized || null
}

export function normalizeCompanyBankDetailsInput(input: CompanyBankDetailsMutationInput) {
  const currency = normalizeCompanyCurrency(input.currency)

  return {
    currency,
    bank_name: normalizeCompanyRequiredText(input.bankName, "Bank name").slice(0, 160),
    bank_address: normalizeCompanyOptionalText(input.bankAddress)?.slice(0, 260) ?? null,
    routing_aba: normalizeCompanyOptionalText(input.routingAba)?.slice(0, 80) ?? null,
    swift_code: normalizeCompanyOptionalText(input.swiftCode)?.slice(0, 80) ?? null,
    account_number: normalizeCompanyRequiredText(input.accountNumber, "Account number", 1).slice(0, 120),
    account_type: normalizeCompanyOptionalText(input.accountType)?.slice(0, 80) ?? null,
    account_name: normalizeCompanyOptionalText(input.accountName)?.slice(0, 160) ?? null,
    beneficiary_name: normalizeCompanyOptionalText(input.beneficiaryName)?.slice(0, 160) ?? null,
    branch_name: normalizeCompanyOptionalText(input.branchName)?.slice(0, 160) ?? null,
  }
}

export function normalizeCompanyIsoDate(value: unknown, label = "Transaction date") {
  const normalized = normalizeText(value)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must use YYYY-MM-DD format.`,
    })
  }

  const date = parseDate(normalized)

  if (!date || date.getUTCFullYear() < 1900 || date.getUTCFullYear() > 2100) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} is outside the supported date range.`,
    })
  }

  return normalized
}

export function normalizeCompanyOptionalIsoDate(value: unknown, label: string) {
  const normalized = normalizeText(firstQueryValue(value))

  if (!normalized) {
    return null
  }

  return normalizeCompanyIsoDate(normalized, label)
}

export function normalizeCompanyPositiveInteger(value: unknown, label: string, defaultValue: number, maxValue = 100) {
  const normalized = normalizeText(firstQueryValue(value))

  if (!normalized) {
    return defaultValue
  }

  const numeric = Number(normalized)

  if (!Number.isInteger(numeric) || numeric < 1) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a positive whole number.`,
    })
  }

  return Math.min(numeric, maxValue)
}

export function normalizeCompanyYear(value: unknown) {
  const normalized = normalizeText(firstQueryValue(value))

  if (!normalized || normalized.toLowerCase() === "all") {
    return null
  }

  const year = Number(normalized)

  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    throw createError({
      statusCode: 400,
      statusMessage: "Year must be a valid four-digit year.",
    })
  }

  return year
}

export function normalizeCompanyFilters(query: Record<string, unknown>): CompanyTransactionFilters {
  return {
    currency: normalizeCompanyCurrency(firstQueryValue(query.currency) || "USD"),
    page: normalizeCompanyPositiveInteger(query.page, "Page", 1, 100000),
    pageSize: normalizeCompanyPositiveInteger(query.pageSize, "Page size", 20, 100),
    search: normalizeText(firstQueryValue(query.search)).slice(0, 120),
    year: normalizeCompanyYear(query.year),
    dateFrom: normalizeCompanyOptionalIsoDate(query.dateFrom, "Start date"),
    dateTo: normalizeCompanyOptionalIsoDate(query.dateTo, "End date"),
    transactionType: normalizeOptionalTransactionType(query.transactionType),
    status: normalizeOptionalTransactionStatus(query.status),
  }
}

export function normalizeOptionalTransactionType(value: unknown) {
  const normalized = normalizeText(firstQueryValue(value)).toLowerCase()

  if (!normalized || normalized === "all") {
    return null
  }

  return normalizeCompanyTransactionType(normalized)
}

export function normalizeOptionalTransactionStatus(value: unknown) {
  const normalized = normalizeText(firstQueryValue(value)).toLowerCase()

  if (!normalized || normalized === "all") {
    return null
  }

  return normalizeCompanyTransactionStatus(normalized)
}

export function mapCompanyAttachment(row: CompanyTransactionAttachmentRow): CompanyTransactionAttachmentRecord {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    filename: row.filename,
    contentType: row.content_type,
    fileSize: Number(row.file_size ?? 0),
    storagePath: row.storage_path,
    createdAt: row.created_at,
  }
}

export function mapCompanyTransaction(row: CompanyTransactionRow): CompanyTransactionRecord {
  return {
    id: row.id,
    currency: row.currency,
    transactionType: row.transaction_type,
    transactionDate: row.transaction_date,
    year: Number(String(row.transaction_date).slice(0, 4)),
    name: row.name,
    amount: toMoneyString(row.amount),
    category: row.category,
    vendorPayee: row.vendor_payee,
    paymentMethod: row.payment_method,
    referenceNumber: row.reference_number,
    status: row.status,
    note: row.note,
    attachments: (row.company_transaction_attachments ?? []).map((attachment) => mapCompanyAttachment(attachment)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function companyAttachmentLink(attachment: CompanyTransactionAttachmentRecord) {
  return isS3MediaKey(attachment.storagePath)
    ? publicMediaUrlForKey(attachment.storagePath)
    : ""
}

export function companyAttachmentCsvLinks(attachments: CompanyTransactionAttachmentRecord[]) {
  return attachments
    .map((attachment) => companyAttachmentLink(attachment))
    .filter(Boolean)
    .join("; ")
}

export function mapCompanyBankDetails(row: CompanyBankDetailsRow): CompanyBankDetailsRecord {
  return {
    id: row.id,
    currency: row.currency,
    bankName: row.bank_name,
    bankAddress: row.bank_address,
    routingAba: row.routing_aba,
    swiftCode: row.swift_code,
    accountNumber: row.account_number,
    accountType: row.account_type,
    accountName: row.account_name,
    beneficiaryName: row.beneficiary_name,
    branchName: row.branch_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildCompanyPagination(page: number, pageSize: number, totalCount: number): CompanyFinancePagination {
  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)))
  const safePage = Math.min(Math.max(1, page), totalPages)

  return {
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
    hasPreviousPage: safePage > 1,
    hasNextPage: safePage < totalPages,
  }
}

export function summarizeCompanyTransactions(rows: Array<Pick<CompanyTransactionRecord, "transactionType" | "amount" | "status" | "attachments">>): CompanyFinanceSummary {
  const summary = rows.reduce((accumulator, row) => {
    const amount = new Decimal(row.amount || 0)

    if (row.transactionType === "income") {
      accumulator.incomeTotal = accumulator.incomeTotal.add(amount)
    } else {
      accumulator.expenseTotal = accumulator.expenseTotal.add(amount)
    }

    if (!row.attachments.length) {
      accumulator.missingAttachmentCount += 1
    }

    if (row.status !== "reconciled") {
      accumulator.unreconciledCount += 1
    }

    if (row.status === "flagged") {
      accumulator.flaggedCount += 1
    }

    return accumulator
  }, {
    incomeTotal: new Decimal(0),
    expenseTotal: new Decimal(0),
    missingAttachmentCount: 0,
    unreconciledCount: 0,
    flaggedCount: 0,
  })
  const netCashFlow = summary.incomeTotal.sub(summary.expenseTotal)

  return {
    transactionCount: rows.length,
    incomeTotal: toMoneyString(summary.incomeTotal),
    expenseTotal: toMoneyString(summary.expenseTotal),
    netCashFlow: toMoneyString(netCashFlow),
    availableBalance: toMoneyString(netCashFlow),
    missingAttachmentCount: summary.missingAttachmentCount,
    unreconciledCount: summary.unreconciledCount,
    flaggedCount: summary.flaggedCount,
  }
}

export async function loadCompanyTransactionById(supabase: SupabaseClient<any>, transactionId: string) {
  const { data, error } = await supabase
    .from("company_transactions")
    .select(COMPANY_TRANSACTION_SELECT)
    .eq("id", transactionId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load the company transaction.",
    })
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "That company transaction could not be found.",
    })
  }

  return mapCompanyTransaction(data as CompanyTransactionRow)
}

export function isMissingCompanyBankDetailsTable(error: { code?: string | null, message?: string | null } | null) {
  return error?.code === "42P01"
    || error?.code === "PGRST205"
    || (
      /company_bank_details/i.test(error?.message ?? "")
      && /schema cache|does not exist|not found/i.test(error?.message ?? "")
    )
}

export async function loadCompanyBankDetails(
  supabase: SupabaseClient<any>,
  currency: CompanyCurrency,
  options: { optional?: boolean } = {},
) {
  const { data, error } = await supabase
    .from("company_bank_details")
    .select(COMPANY_BANK_DETAILS_SELECT)
    .eq("currency", currency)
    .maybeSingle()

  if (error) {
    if (options.optional && isMissingCompanyBankDetailsTable(error)) {
      return null
    }

    throw createError({
      statusCode: 500,
      statusMessage: error.message || "Unable to load company bank details.",
    })
  }

  return data ? mapCompanyBankDetails(data as CompanyBankDetailsRow) : null
}

export async function ensureCompanyAttachmentBucket(supabase: SupabaseClient<any>) {
  const { data, error } = await supabase.storage.getBucket(COMPANY_ATTACHMENT_BUCKET)

  if (data && !error) {
    return
  }

  const isMissingBucket = /not found/i.test(error?.message ?? "")

  if (!isMissingBucket && error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  const { error: createBucketError } = await supabase.storage.createBucket(COMPANY_ATTACHMENT_BUCKET, {
    public: false,
    fileSizeLimit: MAX_COMPANY_ATTACHMENT_BYTES,
    allowedMimeTypes: [
      "application/pdf",
      "application/octet-stream",
      "image/jpeg",
      "image/png",
      "image/webp",
      "text/csv",
      "text/plain",
      "application/vnd.ms-excel",
    ],
  })

  if (createBucketError && !/already exists/i.test(createBucketError.message)) {
    throw createError({
      statusCode: 500,
      statusMessage: createBucketError.message,
    })
  }
}

export function validateCompanyAttachmentFile(input: {
  filename?: unknown
  fileSize?: unknown
  contentType?: unknown
}) {
  const filename = normalizeCompanyRequiredText(input.filename, "Attachment filename", 1).slice(0, 180)
  const fileSize = Number(input.fileSize ?? 0)
  const contentType = normalizeText(input.contentType) || "application/octet-stream"

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Attachment file size must be greater than zero.",
    })
  }

  if (fileSize > MAX_COMPANY_ATTACHMENT_BYTES) {
    throw createError({
      statusCode: 400,
      statusMessage: "Company finance attachments must be 10 MB or smaller.",
    })
  }

  return { filename, fileSize, contentType }
}

function companyAttachmentExtension(filename: string) {
  return extname(filename).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 12) || ".bin"
}

function companyAttachmentTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace("T", "-")
    .replace("Z", "")
    .replace(/:/g, "")
    .replace(".", "-")
}

function companyAttachmentFolder(transactionDate: string, transactionName?: string | null) {
  const safeTransaction = readableStorageSegment(transactionName, "transaction")
    .replace(/\.+$/g, "")
    .slice(0, 96)

  return `${transactionDate.slice(0, 10)}-${safeTransaction || "transaction"}`
}

function companyAttachmentFilename(input: {
  filename: string
  transactionId: string
  transactionName?: string | null
  uploadedAt?: Date
}) {
  const safeTransaction = readableStorageSegment(input.transactionName, "transaction")
    .replace(/\.+$/g, "")
    .slice(0, 80)
  const safeTransactionId = readableStorageSegment(input.transactionId, "transaction-id")
    .replace(/\.+$/g, "")
    .slice(0, 64)
  const safePrefix = [
    safeTransaction || "transaction",
    safeTransactionId || "transaction-id",
    "receipt",
  ].join("-")

  return `${safePrefix}-${companyAttachmentTimestamp(input.uploadedAt)}${companyAttachmentExtension(input.filename)}`
}

function companyAttachmentDateFolders(transactionDate: string) {
  const date = parseDate(transactionDate)

  if (!date) {
    throw createError({
      statusCode: 400,
      statusMessage: "Transaction date is required before adding attachments.",
    })
  }

  const year = String(date.getUTCFullYear())
  const month = MONTH_FOLDERS[date.getUTCMonth()] ?? "01-January"

  return { year, month }
}

export function buildCompanyAttachmentPath(input: {
  transactionId: string
  filename: string
  transactionName?: string | null
  currency?: CompanyCurrency | null
  transactionDate?: string | null
  uploadedAt?: Date
}) {
  if (input.currency && input.transactionDate) {
    const { year, month } = companyAttachmentDateFolders(input.transactionDate)
    const transactionFolder = companyAttachmentFolder(input.transactionDate, input.transactionName)

    return [
      COMPANY_ATTACHMENT_S3_ROOT,
      input.currency,
      year,
      month,
      transactionFolder,
      companyAttachmentFilename({
        filename: input.filename,
        transactionId: input.transactionId,
        transactionName: input.transactionName,
        uploadedAt: input.uploadedAt,
      }),
    ].join("/")
  }

  const fallbackFolder = input.transactionDate
    ? companyAttachmentFolder(input.transactionDate, input.transactionName)
    : readableStorageSegment(input.transactionName, "transaction").replace(/\.+$/g, "").slice(0, 96) || "transaction"

  return `company/${fallbackFolder}/${companyAttachmentTimestamp(input.uploadedAt)}-${readableStorageSegment(input.filename, "attachment") || `attachment${companyAttachmentExtension(input.filename)}`}`
}

export function buildCompanyAttachmentFolderMarkers(input: {
  transactionId: string
  currency: CompanyCurrency
  transactionDate: string
  transactionName?: string | null
}) {
  const { year, month } = companyAttachmentDateFolders(input.transactionDate)
  const currencyFolder = `${COMPANY_ATTACHMENT_S3_ROOT}/${input.currency}`
  const yearFolder = `${currencyFolder}/${year}`
  const monthFolder = `${yearFolder}/${month}`
  const transactionFolder = `${monthFolder}/${companyAttachmentFolder(input.transactionDate, input.transactionName)}`

  return [
    `${COMPANY_ATTACHMENT_S3_ROOT}/`,
    currencyFolder,
    yearFolder,
    monthFolder,
    transactionFolder,
  ]
}

export function buildCompanyAttachmentUploadResponse(input: {
  attachmentId: string
  transactionId: string
  bucket?: string
  path: string
  token: string
  filename: string
  contentType: string
  signedUrl?: string
  uploadMethod?: "supabase-signed-url" | "s3-presigned-put"
  headers?: Record<string, string>
}): CompanyAttachmentUploadTargetResponse {
  return {
    attachmentId: input.attachmentId,
    transactionId: input.transactionId,
    bucket: input.bucket ?? COMPANY_ATTACHMENT_BUCKET,
    path: input.path,
    token: input.token,
    signedUrl: input.signedUrl,
    filename: input.filename,
    contentType: input.contentType,
    uploadMethod: input.uploadMethod,
    headers: input.headers,
  }
}

export function buildCompanyMonthlyRows(rows: CompanyTransactionRecord[]): CompanyAnalyticsMonthlyRow[] {
  const groups = new Map<string, { currency: CompanyCurrency; month: string; income: Decimal; expense: Decimal }>()

  for (const row of rows) {
    const month = row.transactionDate.slice(0, 7)
    const key = `${row.currency}:${month}`
    const group = groups.get(key) ?? { currency: row.currency, month, income: new Decimal(0), expense: new Decimal(0) }
    const amount = new Decimal(row.amount)

    if (row.transactionType === "income") {
      group.income = group.income.add(amount)
    } else {
      group.expense = group.expense.add(amount)
    }

    groups.set(key, group)
  }

  return [...groups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([, group]) => ({
      currency: group.currency,
      month: group.month,
      income: toMoneyString(group.income),
      expense: toMoneyString(group.expense),
      net: toMoneyString(group.income.sub(group.expense)),
    }))
}

export function buildCompanyBreakdownRows(
  rows: CompanyTransactionRecord[],
  keyFor: (row: CompanyTransactionRecord) => string,
): CompanyAnalyticsBreakdownRow[] {
  const groups = new Map<string, { currency: CompanyCurrency; amount: Decimal; transactionCount: number }>()

  for (const row of rows.filter((entry) => entry.transactionType === "expense")) {
    const label = keyFor(row) || "Uncategorized"
    const key = `${row.currency}:${label}`
    const group = groups.get(key) ?? { currency: row.currency, amount: new Decimal(0), transactionCount: 0 }

    group.amount = group.amount.add(row.amount)
    group.transactionCount += 1
    groups.set(key, group)
  }

  const totalsByCurrency = new Map<CompanyCurrency, Decimal>()

  for (const group of groups.values()) {
    totalsByCurrency.set(group.currency, (totalsByCurrency.get(group.currency) ?? new Decimal(0)).add(group.amount))
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const label = key.split(":").slice(1).join(":")
      const total = totalsByCurrency.get(group.currency) ?? new Decimal(1)

      return {
        label,
        currency: group.currency,
        amount: toMoneyString(group.amount),
        transactionCount: group.transactionCount,
        share: total.isZero() ? 0 : group.amount.div(total).mul(100).toNumber(),
      }
    })
    .sort((left, right) => Number(right.amount) - Number(left.amount))
}
