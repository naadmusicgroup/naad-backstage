<script setup lang="ts">
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Copy,
  Download,
  Eye,
  FileText,
  ListFilter,
  Pencil,
  PieChart,
  Plus,
  ReceiptText,
  RotateCcw,
  Trash2,
  WalletCards,
} from "lucide-vue-next"
import type { RowAction } from "~/components/RowActions.vue"
import type {
  CompanyAnalyticsBreakdownRow,
  CompanyAnalyticsResponse,
  CompanyBankDetailsMutationInput,
  CompanyBankDetailsRecord,
  CompanyCurrency,
  CompanyFinanceResponse,
  CompanyPaymentMethod,
  CompanyTransactionAttachmentRecord,
  CompanyTransactionMutationInput,
  CompanyTransactionRecord,
  CompanyTransactionStatus,
  CompanyTransactionType,
} from "~~/types/company"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

type CompanyTab = "usd" | "npr" | "analytics"

interface BankDetailsLine {
  label: string
  value: string
}

interface TransactionFilters {
  search: string
  year: string
  dateFrom: string
  dateTo: string
  transactionType: string
  status: string
  page: number
}

const ALL_FILTER = "all"
const PAGE_SIZE = 20
const today = new Date().toISOString().slice(0, 10)

const route = useRoute()
const router = useRouter()
const { confirmAction } = useConfirmAction()

const activeTab = ref<CompanyTab>(normalizeCompanyTab(route.query.tab))
const filtersOpen = ref(false)
const successMessage = ref("")
const errorMessage = ref("")
const transactionDialogOpen = ref(false)
const transactionDialogMode = ref<"create" | "edit">("create")
const transactionSubmitting = ref(false)
const bankDetailsDialogOpen = ref(false)
const bankDetailsSubmitting = ref(false)
const detailsOpen = ref(false)
const activeTransactionId = ref("")
const selectedAttachmentFiles = ref<File[]>([])
const attachmentInputKey = ref(0)

const filters = reactive<Record<CompanyCurrency, TransactionFilters>>({
  USD: emptyFilters(),
  NPR: emptyFilters(),
})

const transactionForm = reactive({
  currency: "USD" as CompanyCurrency,
  transactionType: "expense" as CompanyTransactionType,
  transactionDate: today,
  name: "",
  amount: "",
  category: "",
  vendorPayee: "",
  paymentMethod: "bank_transfer" as CompanyPaymentMethod,
  referenceNumber: "",
  status: "recorded" as CompanyTransactionStatus,
  note: "",
})

const bankDetailsForm = reactive({
  currency: "USD" as CompanyCurrency,
  bankName: "",
  bankAddress: "",
  routingAba: "",
  swiftCode: "",
  accountNumber: "",
  accountType: "",
  accountName: "",
  beneficiaryName: "",
  branchName: "",
})

const activeCurrency = computed<CompanyCurrency>(() => activeTab.value === "npr" ? "NPR" : "USD")
const activeFilters = computed(() => filters[activeCurrency.value])
const transactionQuery = computed(() => ({
  currency: activeCurrency.value,
  page: activeFilters.value.page,
  pageSize: PAGE_SIZE,
  ...(activeFilters.value.search ? { search: activeFilters.value.search } : {}),
  ...(activeFilters.value.year !== ALL_FILTER ? { year: activeFilters.value.year } : {}),
  ...(activeFilters.value.dateFrom ? { dateFrom: activeFilters.value.dateFrom } : {}),
  ...(activeFilters.value.dateTo ? { dateTo: activeFilters.value.dateTo } : {}),
  ...(activeFilters.value.transactionType !== ALL_FILTER ? { transactionType: activeFilters.value.transactionType } : {}),
  ...(activeFilters.value.status !== ALL_FILTER ? { status: activeFilters.value.status } : {}),
}))

const { data, pending, error, refresh } = useLazyFetch<CompanyFinanceResponse>("/api/admin/company", {
  query: transactionQuery,
})
const {
  data: analyticsData,
  pending: analyticsPending,
  refresh: refreshAnalytics,
} = useLazyFetch<CompanyAnalyticsResponse>("/api/admin/company/analytics")

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

const emptyFinanceResponse = computed<CompanyFinanceResponse>(() => ({
  currency: activeCurrency.value,
  transactions: [],
  summary: emptySummary(),
  pagination: {
    page: activeFilters.value.page,
    pageSize: PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  },
  years: [],
  bankDetails: null,
}))
const response = computed(() => data.value?.currency === activeCurrency.value ? data.value : emptyFinanceResponse.value)
const activeTransaction = computed(() => response.value.transactions.find((row) => row.id === activeTransactionId.value) ?? null)
const activeBankDetails = computed(() => response.value.bankDetails)
const activeBankDetailsRows = computed(() => bankDetailsPreviewRows(activeBankDetails.value))
const bankDetailsSubmitDisabled = computed(() => !bankDetailsForm.bankName.trim() || !bankDetailsForm.accountNumber.trim())

const tabs = computed(() => [
  { label: "USD Transactions", value: "usd", badge: activeTab.value === "usd" ? response.value.pagination.totalCount : undefined },
  { label: "NPR Transactions", value: "npr", badge: activeTab.value === "npr" ? response.value.pagination.totalCount : undefined },
  { label: "Analytics", value: "analytics" },
])

const ledgerTitle = computed(() => activeCurrency.value === "USD" ? "USD company account" : "Nepali company account")

const transactionTableColumns = [
  { key: "date", label: "Date", accessor: (row: CompanyTransactionRecord) => row.transactionDate },
  { key: "name", label: "Transaction", accessor: (row: CompanyTransactionRecord) => row.name },
  { key: "category", label: "Category", accessor: (row: CompanyTransactionRecord) => row.category },
  { key: "vendor", label: "Vendor / Payee", accessor: (row: CompanyTransactionRecord) => row.vendorPayee ?? "" },
  { key: "payment", label: "Payment", accessor: (row: CompanyTransactionRecord) => row.paymentMethod },
  { key: "reference", label: "Reference", accessor: (row: CompanyTransactionRecord) => row.referenceNumber ?? "" },
  { key: "status", label: "Status", accessor: (row: CompanyTransactionRecord) => row.status },
  { key: "files", label: "Files", align: "center" as const, accessor: (row: CompanyTransactionRecord) => row.attachments.length },
  {
    key: "amount",
    label: "Amount",
    align: "right" as const,
    accessor: (row: CompanyTransactionRecord) => row.transactionType === "income" ? Number(row.amount || 0) : -Number(row.amount || 0),
  },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
]

const ledgerMetrics = computed(() => {
  const summary = response.value.summary

  return [
    { label: "Income", value: formatMoney(summary.incomeTotal, activeCurrency.value), detail: "Current view", icon: ArrowUpRight, tone: "positive" },
    { label: "Expenses", value: formatMoney(summary.expenseTotal, activeCurrency.value), detail: `${summary.transactionCount.toLocaleString()} rows`, icon: ArrowDownRight, tone: "expense" },
    { label: "Net cash flow", value: formatMoney(summary.netCashFlow, activeCurrency.value), detail: "Income minus expenses", icon: Activity, tone: Number(summary.netCashFlow) >= 0 ? "positive" : "negative" },
    { label: "Review", value: summary.unreconciledCount.toLocaleString(), detail: `${summary.missingAttachmentCount} missing files / ${summary.flaggedCount} flagged`, icon: AlertTriangle, tone: summary.unreconciledCount || summary.missingAttachmentCount || summary.flaggedCount ? "warning" : "neutral" },
  ]
})

const ledgerHero = computed(() => {
  const summary = response.value.summary
  const balance = Number(summary.availableBalance ?? 0)

  return {
    value: formatMoney(summary.availableBalance, activeCurrency.value),
    detail: `${ledgerTitle.value} / ${summary.transactionCount.toLocaleString()} rows in view`,
    tone: balance >= 0 ? "positive" : "negative",
  }
})

const analyticsBalanceHeroes = computed(() => (["USD", "NPR"] as CompanyCurrency[]).map((currency) => {
  const summary = analyticsData.value?.summaryByCurrency[currency] ?? emptySummary()
  const balance = Number(summary.availableBalance ?? 0)

  return {
    currency,
    balance,
    label: currency === "USD" ? "USD bank ledger" : "Nepali bank ledger",
    value: formatMoney(summary.availableBalance, currency),
    income: formatMoney(summary.incomeTotal, currency),
    expense: formatMoney(summary.expenseTotal, currency),
    net: formatMoney(summary.netCashFlow, currency),
    transactionCount: summary.transactionCount,
    bankDetails: analyticsData.value?.bankDetailsByCurrency?.[currency] ?? null,
    bankDetailsRows: bankDetailsPreviewRows(analyticsData.value?.bankDetailsByCurrency?.[currency] ?? null),
    tone: balance >= 0 ? "positive" : "negative",
  }
}))

const analyticsCashFlowRows = computed(() => analyticsBalanceHeroes.value.map((row) => ({
  ...row,
  incomeValue: numericMoney((analyticsData.value?.summaryByCurrency[row.currency] ?? emptySummary()).incomeTotal),
  expenseValue: numericMoney((analyticsData.value?.summaryByCurrency[row.currency] ?? emptySummary()).expenseTotal),
  balanceValue: numericMoney((analyticsData.value?.summaryByCurrency[row.currency] ?? emptySummary()).availableBalance),
})))

const analyticsCashFlowMax = computed(() => Math.max(1, ...analyticsCashFlowRows.value.flatMap((row) => [
  row.incomeValue,
  row.expenseValue,
  Math.abs(row.balanceValue),
])))

const monthlyChartRows = computed(() => [...(analyticsData.value?.monthly ?? [])]
  .sort((left, right) => `${left.month}-${left.currency}`.localeCompare(`${right.month}-${right.currency}`))
  .slice(-12)
  .map((row) => ({
    ...row,
    incomeValue: numericMoney(row.income),
    expenseValue: numericMoney(row.expense),
    netValue: numericMoney(row.net),
  })))

const monthlyChartMax = computed(() => Math.max(1, ...monthlyChartRows.value.flatMap((row) => [
  row.incomeValue,
  row.expenseValue,
  Math.abs(row.netValue),
])))

const categoryChartRows = computed(() => breakdownChartRows(analyticsData.value?.categories ?? []))
const vendorChartRows = computed(() => breakdownChartRows(analyticsData.value?.vendors ?? []))

const largestTransactionChartRows = computed(() => {
  const rows = (analyticsData.value?.largestTransactions ?? [])
    .slice(0, 8)
    .map((row) => ({
      ...row,
      signedAmount: row.transactionType === "income" ? numericMoney(row.amount) : -numericMoney(row.amount),
      absoluteAmount: Math.abs(numericMoney(row.amount)),
    }))
  const max = Math.max(1, ...rows.map((row) => row.absoluteAmount))

  return rows.map((row) => ({
    ...row,
    width: chartWidth(row.absoluteAmount, max),
  }))
})

const reviewChartRows = computed(() => {
  const analytics = analyticsData.value

  return [
    { label: "Missing files", value: analytics?.missingAttachmentCount ?? 0, tone: "warning" },
    { label: "Unreconciled", value: analytics?.unreconciledCount ?? 0, tone: "neutral" },
    { label: "Flagged", value: analytics?.flaggedCount ?? 0, tone: "danger" },
  ]
})

const reviewChartMax = computed(() => Math.max(1, ...reviewChartRows.value.map((row) => row.value)))

const paginationSummary = computed(() => {
  const pagination = response.value.pagination

  if (!pagination.totalCount) {
    return "No transactions found"
  }

  const from = (pagination.page - 1) * pagination.pageSize + 1
  const to = Math.min(pagination.page * pagination.pageSize, pagination.totalCount)
  return `${from.toLocaleString()}-${to.toLocaleString()} of ${pagination.totalCount.toLocaleString()}`
})

const activeFilterCount = computed(() => {
  const current = activeFilters.value
  return [
    current.year !== ALL_FILTER,
    Boolean(current.dateFrom),
    Boolean(current.dateTo),
    current.transactionType !== ALL_FILTER,
    current.status !== ALL_FILTER,
  ].filter(Boolean).length
})

watch(
  () => route.query.tab,
  (tab) => {
    activeTab.value = normalizeCompanyTab(tab)
  },
)

watch(
  () => [
    activeCurrency.value,
    activeFilters.value.search,
    activeFilters.value.year,
    activeFilters.value.dateFrom,
    activeFilters.value.dateTo,
    activeFilters.value.transactionType,
    activeFilters.value.status,
  ],
  () => {
    activeFilters.value.page = 1
  },
)

watch(
  () => response.value.pagination.page,
  (page) => {
    if (page && page !== activeFilters.value.page) {
      activeFilters.value.page = page
    }
  },
)

function emptyFilters(): TransactionFilters {
  return {
    search: "",
    year: ALL_FILTER,
    dateFrom: "",
    dateTo: "",
    transactionType: ALL_FILTER,
    status: ALL_FILTER,
    page: 1,
  }
}

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

function resetMessages() {
  successMessage.value = ""
  errorMessage.value = ""
}

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function setError(caught: any, fallback: string) {
  errorMessage.value = caught?.data?.statusMessage || caught?.message || fallback
  successMessage.value = ""
}

function setActiveTab(value: string) {
  const nextTab = normalizeCompanyTab(value)
  activeTab.value = nextTab

  const query = { ...route.query }
  if (nextTab === "usd") {
    delete query.tab
  } else {
    query.tab = nextTab
  }

  void router.replace({ path: route.path, query })
}

function normalizeCompanyTab(value: unknown): CompanyTab {
  const tab = Array.isArray(value) ? value[0] : value

  if (tab === "npr" || tab === "analytics") {
    return tab
  }

  return "usd"
}

function companyTabHref(value: string) {
  const tab = normalizeCompanyTab(value)
  return tab === "usd" ? "/admin/company" : `/admin/company?tab=${tab}`
}

function currencySymbol(currency: CompanyCurrency) {
  return currency === "USD" ? "$" : "Rs. "
}

function formatMoney(value: string | number | null | undefined, currency: CompanyCurrency) {
  const amount = Number(value ?? 0)
  const formatted = Number.isFinite(amount) ? Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"
  return `${amount < 0 ? "-" : ""}${currencySymbol(currency)}${formatted}`
}

function numericMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

function chartWidth(value: string | number | null | undefined, max: number) {
  const amount = Math.max(0, Math.abs(numericMoney(value)))
  const safeMax = Math.max(1, Math.abs(max))
  return `${Math.min(100, Math.max(3, (amount / safeMax) * 100))}%`
}

function breakdownChartRows(rows: CompanyAnalyticsBreakdownRow[]) {
  return rows.slice(0, 8).map((row) => ({
    ...row,
    width: `${Math.min(100, Math.max(4, row.share || 0))}%`,
    amountValue: numericMoney(row.amount),
  }))
}

function bankDetailsRows(details: CompanyBankDetailsRecord | null | undefined, currency: CompanyCurrency): BankDetailsLine[] {
  if (!details) {
    return []
  }

  const rows: BankDetailsLine[] = currency === "NPR"
    ? [
      { label: "Bank", value: details.bankName },
      { label: "Account no.", value: details.accountNumber },
      { label: "Account name", value: details.accountName ?? "" },
      { label: "Branch", value: details.branchName ?? "" },
      { label: "SWIFT", value: details.swiftCode ?? "" },
    ]
    : [
      { label: "Bank", value: details.bankName },
      { label: "Address", value: details.bankAddress ?? "" },
      { label: "Routing (ABA)", value: details.routingAba ?? "" },
      { label: "SWIFT", value: details.swiftCode ?? "" },
      { label: "Account no.", value: details.accountNumber },
      { label: "Account type", value: details.accountType ?? "" },
      { label: "Beneficiary", value: details.beneficiaryName ?? "" },
    ]

  return rows.filter((row) => row.value.trim())
}

function bankDetailsPreviewRows(details: CompanyBankDetailsRecord | null | undefined): BankDetailsLine[] {
  if (!details) {
    return []
  }

  return [
    { label: "Bank", value: details.bankName },
    { label: "Account no.", value: details.accountNumber },
  ].filter((row) => row.value.trim())
}

function bankDetailsCopyText(details: CompanyBankDetailsRecord, currency: CompanyCurrency) {
  return [
    `${currency} bank details`,
    ...bankDetailsRows(details, currency).map((row) => `${row.label}: ${row.value}`),
  ].join("\n")
}

function bankDetailsForCurrency(currency: CompanyCurrency) {
  if (activeCurrency.value === currency && response.value.bankDetails) {
    return response.value.bankDetails
  }

  return analyticsData.value?.bankDetailsByCurrency?.[currency] ?? null
}

function resetBankDetailsForm(currency: CompanyCurrency, details: CompanyBankDetailsRecord | null = null) {
  bankDetailsForm.currency = currency
  bankDetailsForm.bankName = details?.bankName ?? ""
  bankDetailsForm.bankAddress = details?.bankAddress ?? ""
  bankDetailsForm.routingAba = details?.routingAba ?? ""
  bankDetailsForm.swiftCode = details?.swiftCode ?? ""
  bankDetailsForm.accountNumber = details?.accountNumber ?? ""
  bankDetailsForm.accountType = details?.accountType ?? ""
  bankDetailsForm.accountName = details?.accountName ?? ""
  bankDetailsForm.beneficiaryName = details?.beneficiaryName ?? ""
  bankDetailsForm.branchName = details?.branchName ?? ""
}

function openBankDetailsDialog(currency: CompanyCurrency = activeCurrency.value) {
  resetMessages()
  resetBankDetailsForm(currency, bankDetailsForCurrency(currency))
  bankDetailsDialogOpen.value = true
}

function optionalBankDetail(value: string) {
  const trimmed = value.trim()
  return trimmed || null
}

async function copyBankDetails(details: CompanyBankDetailsRecord | null | undefined, currency: CompanyCurrency = activeCurrency.value) {
  if (!details) {
    openBankDetailsDialog(currency)
    return
  }

  const text = bankDetailsCopyText(details, currency)

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.setAttribute("readonly", "true")
      textarea.style.position = "fixed"
      textarea.style.left = "-9999px"
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      textarea.remove()
    }

    setSuccess(`Copied ${currency} bank details.`)
  } catch (caught: any) {
    setError(caught, "Unable to copy bank details.")
  }
}

async function submitBankDetails() {
  const confirmed = await confirmAction({
    title: `Save ${bankDetailsForm.currency} bank details`,
    description: `Update the bank details shown on the ${bankDetailsForm.currency} available balance card?`,
    confirmLabel: "Save bank details",
    adminVerification: { action: "company_bank_details.updated" },
  })

  if (!confirmed) {
    return
  }

  bankDetailsSubmitting.value = true
  resetMessages()

  try {
    const body: CompanyBankDetailsMutationInput = {
      currency: bankDetailsForm.currency,
      bankName: bankDetailsForm.bankName,
      bankAddress: optionalBankDetail(bankDetailsForm.bankAddress),
      routingAba: optionalBankDetail(bankDetailsForm.routingAba),
      swiftCode: optionalBankDetail(bankDetailsForm.swiftCode),
      accountNumber: bankDetailsForm.accountNumber,
      accountType: optionalBankDetail(bankDetailsForm.accountType),
      accountName: optionalBankDetail(bankDetailsForm.accountName),
      beneficiaryName: optionalBankDetail(bankDetailsForm.beneficiaryName),
      branchName: optionalBankDetail(bankDetailsForm.branchName),
    }

    await $fetch("/api/admin/company/bank-details", { method: "PUT", body })
    await refreshAllCompanyData()
    bankDetailsDialogOpen.value = false
    setSuccess(`Saved ${bankDetailsForm.currency} bank details.`)
  } catch (caught: any) {
    setError(caught, "Unable to save bank details.")
  } finally {
    bankDetailsSubmitting.value = false
  }
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set"
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
}

function transactionRowYear(row: CompanyTransactionRecord) {
  return row.year
}

function transactionRowGroupLabel(year: string) {
  return `${year} year`
}

function transactionRowClass(row: CompanyTransactionRecord) {
  return `company-table-row is-${row.transactionType}`
}

function formatPaymentMethod(value: CompanyPaymentMethod) {
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ")
}

function formatStatus(value: CompanyTransactionStatus) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function statusTone(value: CompanyTransactionStatus) {
  if (value === "recorded" || value === "reconciled") return "success"
  if (value === "pending") return "purple"
  if (value === "flagged") return "danger"
  return "muted"
}

function transactionTypeTone(value: CompanyTransactionType) {
  return value === "income" ? "success" : "warning"
}

function transactionSignedAmount(row: CompanyTransactionRecord) {
  return `${row.transactionType === "income" ? "+" : "-"}${formatMoney(row.amount, row.currency)}`
}

function transactionMeta(row: CompanyTransactionRecord) {
  return [
    row.category,
    row.referenceNumber ? `Ref ${row.referenceNumber}` : "",
  ].filter(Boolean).join(" / ")
}

function transactionActions(row: CompanyTransactionRecord): RowAction[] {
  return [
    { key: "details", label: "View details", icon: Eye },
    { key: "edit", label: "Edit", icon: Pencil },
    { key: "delete", label: "Delete", icon: Trash2, variant: "destructive", separatorBefore: true },
  ]
}

function onTransactionAction(key: string, row: CompanyTransactionRecord) {
  if (key === "details") {
    openTransactionDetails(row)
  } else if (key === "edit") {
    openEditTransaction(row)
  } else if (key === "delete") {
    void deleteTransaction(row)
  }
}

function openTransactionDetails(row: CompanyTransactionRecord) {
  activeTransactionId.value = row.id
  detailsOpen.value = true
}

function resetTransactionForm(currency = activeCurrency.value, transactionType: CompanyTransactionType = "expense") {
  transactionForm.currency = currency
  transactionForm.transactionType = transactionType
  transactionForm.transactionDate = today
  transactionForm.name = ""
  transactionForm.amount = ""
  transactionForm.category = transactionType === "income" ? "Sales" : "Operations"
  transactionForm.vendorPayee = ""
  transactionForm.paymentMethod = "bank_transfer"
  transactionForm.referenceNumber = ""
  transactionForm.status = "recorded"
  transactionForm.note = ""
  selectedAttachmentFiles.value = []
  attachmentInputKey.value += 1
}

function openCreateTransaction(transactionType: CompanyTransactionType) {
  resetMessages()
  activeTransactionId.value = ""
  transactionDialogMode.value = "create"
  resetTransactionForm(activeCurrency.value, transactionType)
  transactionDialogOpen.value = true
}

function openEditTransaction(row: CompanyTransactionRecord) {
  resetMessages()
  activeTransactionId.value = row.id
  transactionDialogMode.value = "edit"
  transactionForm.currency = row.currency
  transactionForm.transactionType = row.transactionType
  transactionForm.transactionDate = row.transactionDate
  transactionForm.name = row.name
  transactionForm.amount = Number(row.amount).toFixed(2)
  transactionForm.category = row.category
  transactionForm.vendorPayee = row.vendorPayee ?? ""
  transactionForm.paymentMethod = row.paymentMethod
  transactionForm.referenceNumber = row.referenceNumber ?? ""
  transactionForm.status = row.status
  transactionForm.note = row.note ?? ""
  selectedAttachmentFiles.value = []
  attachmentInputKey.value += 1
  transactionDialogOpen.value = true
}

function attachmentInputChanged(event: Event) {
  const input = event.target as HTMLInputElement
  selectedAttachmentFiles.value = Array.from(input.files ?? [])
}

async function submitTransaction() {
  const isCreate = transactionDialogMode.value === "create"
  const action = isCreate ? "company_transaction.created" : "company_transaction.updated"
  const confirmed = await confirmAction({
    title: isCreate ? "Record company transaction" : "Update company transaction",
    description: `${isCreate ? "Record" : "Update"} ${formatMoney(transactionForm.amount || 0, transactionForm.currency)} ${transactionForm.transactionType} for ${transactionForm.name || "this transaction"}?`,
    confirmLabel: isCreate ? "Record transaction" : "Save transaction",
    adminVerification: { action },
  })

  if (!confirmed) {
    return
  }

  transactionSubmitting.value = true
  resetMessages()

  try {
    const body: CompanyTransactionMutationInput = {
      currency: transactionForm.currency,
      transactionType: transactionForm.transactionType,
      transactionDate: transactionForm.transactionDate,
      name: transactionForm.name,
      amount: transactionForm.amount,
      category: transactionForm.category || "Uncategorized",
      vendorPayee: transactionForm.vendorPayee || null,
      paymentMethod: transactionForm.paymentMethod,
      referenceNumber: transactionForm.referenceNumber || null,
      status: transactionForm.status,
      note: transactionForm.note || null,
    }
    const result = await (isCreate
      ? $fetch("/api/admin/company", { method: "POST", body })
      : $fetch(`/api/admin/company/${activeTransactionId.value}`, { method: "PATCH", body })) as { transaction: CompanyTransactionRecord }

    await uploadAttachments(result.transaction.id)
    await refreshAllCompanyData()
    transactionDialogOpen.value = false
    setSuccess(`${isCreate ? "Recorded" : "Updated"} ${result.transaction.name}.`)
  } catch (caught: any) {
    setError(caught, "Unable to save this company transaction.")
  } finally {
    transactionSubmitting.value = false
  }
}

async function uploadAttachments(transactionId: string) {
  for (const file of selectedAttachmentFiles.value) {
    const body = new FormData()
    body.append("file", file)

    await $fetch(`/api/admin/company/${transactionId}/attachments`, {
      method: "POST",
      body,
    })
  }
}

async function deleteTransaction(row: CompanyTransactionRecord) {
  const confirmed = await confirmAction({
    title: "Delete company transaction",
    description: `Delete ${row.name} from the ${row.currency} ledger? The row will be hidden but audit history remains.`,
    confirmLabel: "Delete transaction",
    variant: "destructive",
    adminVerification: { action: "company_transaction.deleted" },
  })

  if (!confirmed) {
    return
  }

  resetMessages()

  try {
    await $fetch(`/api/admin/company/${row.id}`, { method: "DELETE" })
    await refreshAllCompanyData()
    setSuccess(`Deleted ${row.name}.`)
  } catch (caught: any) {
    setError(caught, "Unable to delete this company transaction.")
  }
}

function attachmentHref(attachmentId: string, download = false) {
  return `/api/admin/company/attachments/${attachmentId}${download ? "?download=1" : ""}`
}

function viewAttachment(attachment: CompanyTransactionAttachmentRecord) {
  resetMessages()
  window.open(attachmentHref(attachment.id), "_blank", "noopener,noreferrer")
}

function downloadAttachment(attachment: CompanyTransactionAttachmentRecord) {
  resetMessages()
  const link = document.createElement("a")
  link.href = attachmentHref(attachment.id, true)
  link.download = attachment.filename
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  document.body.appendChild(link)
  link.click()
  link.remove()
}

async function deleteAttachment(attachmentId: string) {
  const confirmed = await confirmAction({
    title: "Delete attachment",
    description: "Remove this attachment from the company transaction?",
    confirmLabel: "Delete attachment",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  resetMessages()

  try {
    await $fetch(`/api/admin/company/attachments/${attachmentId}`, { method: "DELETE" })
    await refreshAllCompanyData()
    setSuccess("Deleted attachment.")
  } catch (caught: any) {
    setError(caught, "Unable to delete this attachment.")
  }
}

async function refreshAllCompanyData() {
  await Promise.all([
    refresh(),
    refreshAnalytics(),
  ])
}

function resetActiveFilters() {
  const currentSearch = activeFilters.value.search
  Object.assign(activeFilters.value, emptyFilters(), { search: currentSearch })
}

function exportTransactions() {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(transactionQuery.value)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value))
    }
  }

  window.open(`/api/admin/company/export?${params.toString()}`, "_blank", "noopener,noreferrer")
}
</script>

<template>
  <div class="page company-page">
    <PageHeader
      title="Company"
      eyebrow="Accounts"
      description="Company-only USD and NPR cash movement, kept separate from artist finance."
    />

    <div class="company-tabs" role="tablist" aria-label="Company finance sections">
      <a
        v-for="tab in tabs"
        :key="tab.value"
        :href="companyTabHref(tab.value)"
        class="company-tab"
        :class="{ active: tab.value === activeTab }"
        role="tab"
        :aria-selected="tab.value === activeTab"
        @click.prevent="setActiveTab(tab.value)"
        @keydown.enter.prevent="setActiveTab(tab.value)"
        @keydown.space.prevent="setActiveTab(tab.value)"
      >
        <span>{{ tab.label }}</span>
        <Badge
          v-if="tab.badge !== undefined"
          variant="secondary"
          class="company-tab-badge"
        >
          {{ tab.badge }}
        </Badge>
      </a>
    </div>

    <AppAlert v-if="error" variant="destructive">{{ error.statusMessage || "Unable to load company transactions." }}</AppAlert>
    <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
    <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>

    <template v-if="activeTab === 'usd' || activeTab === 'npr'">
      <section class="ledger-hero-grid" :aria-label="`${activeCurrency} ledger metrics`">
        <article class="available-balance-hero" :class="`is-${ledgerHero.tone}`">
          <div class="available-hero-primary">
            <div class="available-hero-kicker">
              <span>Available balance</span>
            </div>
            <div class="available-amount-row">
              <strong>{{ ledgerHero.value }}</strong>
              <Badge variant="secondary" class="available-currency-badge">{{ activeCurrency }}</Badge>
            </div>
            <p>{{ ledgerHero.detail }}</p>
          </div>
          <div class="bank-detail-cardlet">
            <div class="bank-detail-heading">
              <span>{{ activeCurrency }} bank details</span>
              <div class="bank-detail-actions">
                <Button variant="ghost" size="icon-sm" :aria-label="`Edit ${activeCurrency} bank details`" :title="`Edit ${activeCurrency} bank details`" @click="openBankDetailsDialog(activeCurrency)">
                  <Pencil class="size-3.5" />
                </Button>
                <Button
                  v-if="activeBankDetails"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="`Copy ${activeCurrency} bank details`"
                  :title="`Copy ${activeCurrency} bank details`"
                  @click="copyBankDetails(activeBankDetails, activeCurrency)"
                >
                  <Copy class="size-3.5" />
                </Button>
              </div>
            </div>
            <div v-if="activeBankDetailsRows.length" class="bank-detail-lines">
              <span v-for="row in activeBankDetailsRows" :key="row.label">
                <b>{{ row.label }}</b> {{ row.value }}
              </span>
            </div>
            <button v-else type="button" class="bank-detail-empty" @click="openBankDetailsDialog(activeCurrency)">
              Add bank details
            </button>
          </div>
        </article>

        <article v-for="metric in ledgerMetrics" :key="metric.label" class="ledger-metric-card" :class="`is-${metric.tone}`">
          <div>
            <component :is="metric.icon" class="size-4" />
            <span>{{ metric.label }}</span>
          </div>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.detail }}</small>
        </article>
      </section>

      <DataPanel
        class="company-transaction-panel"
        title="Transactions"
        :eyebrow="ledgerTitle"
        :description="pending && data ? 'Refreshing rows' : paginationSummary"
      >
        <template #actions>
          <Button variant="secondary" size="sm" @click="exportTransactions">
            <Download class="size-4" />
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" @click="openCreateTransaction('income')">
            <Plus class="size-4" />
            Add income
          </Button>
          <Button size="sm" @click="openCreateTransaction('expense')">
            <Plus class="size-4" />
            Add expense
          </Button>
        </template>

        <div class="company-table-toolbar">
          <Input
            :id="`${activeCurrency.toLowerCase()}-company-search`"
            v-model="activeFilters.search"
            type="search"
            placeholder="Search name, category, vendor, reference"
            aria-label="Search"
          />
          <Button variant="secondary" size="sm" @click="filtersOpen = !filtersOpen">
            <ListFilter class="size-4" />
            Filters
            <Badge v-if="activeFilterCount" variant="secondary" class="company-filter-count">{{ activeFilterCount }}</Badge>
          </Button>
          <Button v-if="activeFilterCount" variant="ghost" size="sm" @click="resetActiveFilters">
            <RotateCcw class="size-4" />
            Reset
          </Button>
        </div>

        <div v-if="filtersOpen" class="company-table-filters">
          <div class="field-row">
            <label :for="`${activeCurrency.toLowerCase()}-company-year`">Year</label>
            <NativeSelect :id="`${activeCurrency.toLowerCase()}-company-year`" v-model="activeFilters.year">
              <option :value="ALL_FILTER">All years</option>
              <option v-for="year in response.years" :key="year" :value="String(year)">{{ year }}</option>
            </NativeSelect>
          </div>
          <div class="field-row">
            <label :for="`${activeCurrency.toLowerCase()}-company-from`">From</label>
            <AppDatePicker :id="`${activeCurrency.toLowerCase()}-company-from`" v-model="activeFilters.dateFrom" placeholder="Start date" />
          </div>
          <div class="field-row">
            <label :for="`${activeCurrency.toLowerCase()}-company-to`">To</label>
            <AppDatePicker :id="`${activeCurrency.toLowerCase()}-company-to`" v-model="activeFilters.dateTo" placeholder="End date" />
          </div>
          <div class="field-row">
            <label :for="`${activeCurrency.toLowerCase()}-company-type`">Type</label>
            <NativeSelect :id="`${activeCurrency.toLowerCase()}-company-type`" v-model="activeFilters.transactionType">
              <option :value="ALL_FILTER">All types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </NativeSelect>
          </div>
          <div class="field-row">
            <label :for="`${activeCurrency.toLowerCase()}-company-status`">Status</label>
            <NativeSelect :id="`${activeCurrency.toLowerCase()}-company-status`" v-model="activeFilters.status">
              <option :value="ALL_FILTER">All statuses</option>
              <option value="recorded">Recorded</option>
              <option value="pending">Pending</option>
              <option value="reconciled">Reconciled</option>
              <option value="flagged">Flagged</option>
            </NativeSelect>
          </div>
        </div>

        <DashboardSkeleton v-if="pending && !data" layout="admin-company-ledger" table :rows="10" />
        <DataTable
          v-else
          :columns="transactionTableColumns"
          :data="response.transactions"
          empty-title="No transactions"
          empty-description="Try a different search or clear the filters."
          empty-icon="search"
          row-key="id"
          :row-class="transactionRowClass"
          :row-group-key="transactionRowYear"
          :row-group-label="transactionRowGroupLabel"
          row-group-class="company-table-year-row"
          wrapper-class="company-transaction-table"
          table-class="min-w-[1180px]"
        >
          <template #cell-date="{ row }">
            <span class="company-cell-mono">{{ formatDate(row.transactionDate) }}</span>
          </template>
          <template #cell-name="{ row }">
            <button type="button" class="company-transaction-name" @click="openTransactionDetails(row)">
              <strong>{{ row.name }}</strong>
              <span>{{ transactionMeta(row) || "No category" }}</span>
            </button>
          </template>
          <template #cell-category="{ row }">
            <span class="company-cell-text">{{ row.category || "-" }}</span>
          </template>
          <template #cell-vendor="{ row }">
            <span class="company-cell-text">{{ row.vendorPayee || "-" }}</span>
          </template>
          <template #cell-payment="{ row }">
            <span class="company-cell-text">{{ formatPaymentMethod(row.paymentMethod) }}</span>
          </template>
          <template #cell-reference="{ row }">
            <span class="company-cell-mono">{{ row.referenceNumber || "-" }}</span>
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="statusTone(row.status)">{{ formatStatus(row.status) }}</StatusBadge>
          </template>
          <template #cell-files="{ row }">
            <button
              v-if="row.attachments.length"
              type="button"
              class="company-file-button"
              @click="openTransactionDetails(row)"
            >
              <FileText class="size-3.5" />
              {{ row.attachments.length }} file{{ row.attachments.length === 1 ? "" : "s" }}
            </button>
            <span v-else class="company-file-muted">
              <FileText class="size-3.5" />
              No file
            </span>
          </template>
          <template #cell-amount="{ row }">
            <strong class="company-amount-value" :class="row.transactionType">{{ transactionSignedAmount(row) }}</strong>
          </template>
          <template #cell-actions="{ row }">
            <RowActions :actions="transactionActions(row)" @select="(key) => onTransactionAction(key, row)" />
          </template>
        </DataTable>

        <footer v-if="response.pagination.totalCount" class="company-table-footer">
          <span>{{ paginationSummary }}</span>
          <AppPagination
            :page="response.pagination.page"
            :page-size="response.pagination.pageSize"
            :total-count="response.pagination.totalCount"
            :total-pages="response.pagination.totalPages"
            :pending="pending"
            aria-label="Company transaction pagination"
            @update:page="activeFilters.page = $event"
          />
        </footer>
      </DataPanel>
    </template>

    <template v-else>
      <section class="analytics-balance-grid" aria-label="Company available balances">
        <article v-for="balance in analyticsBalanceHeroes" :key="balance.currency" class="analytics-balance-hero" :class="`is-${balance.tone}`">
          <div class="available-hero-primary">
            <div class="available-hero-kicker">
              <span>Available balance</span>
            </div>
            <div class="available-amount-row">
              <strong>{{ balance.value }}</strong>
              <Badge variant="secondary" class="available-currency-badge">{{ balance.currency }}</Badge>
            </div>
            <p>{{ balance.label }} / {{ balance.transactionCount.toLocaleString() }} rows</p>
            <div class="analytics-balance-bars" aria-hidden="true">
              <span class="balance-bar income" :style="{ width: chartWidth((analyticsData?.summaryByCurrency[balance.currency] ?? emptySummary()).incomeTotal, analyticsCashFlowMax) }" />
              <span class="balance-bar expense" :style="{ width: chartWidth((analyticsData?.summaryByCurrency[balance.currency] ?? emptySummary()).expenseTotal, analyticsCashFlowMax) }" />
              <span class="balance-bar net" :style="{ width: chartWidth(Math.abs(balance.balance), analyticsCashFlowMax) }" />
            </div>
          </div>
          <div class="bank-detail-cardlet">
            <div class="bank-detail-heading">
              <span>{{ balance.currency }} bank details</span>
              <div class="bank-detail-actions">
                <Button variant="ghost" size="icon-sm" :aria-label="`Edit ${balance.currency} bank details`" :title="`Edit ${balance.currency} bank details`" @click="openBankDetailsDialog(balance.currency)">
                  <Pencil class="size-3.5" />
                </Button>
                <Button
                  v-if="balance.bankDetails"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="`Copy ${balance.currency} bank details`"
                  :title="`Copy ${balance.currency} bank details`"
                  @click="copyBankDetails(balance.bankDetails, balance.currency)"
                >
                  <Copy class="size-3.5" />
                </Button>
              </div>
            </div>
            <div v-if="balance.bankDetailsRows.length" class="bank-detail-lines">
              <span v-for="row in balance.bankDetailsRows" :key="`${balance.currency}-${row.label}`">
                <b>{{ row.label }}</b> {{ row.value }}
              </span>
            </div>
            <button v-else type="button" class="bank-detail-empty" @click="openBankDetailsDialog(balance.currency)">
              Add bank details
            </button>
          </div>
        </article>
      </section>

      <DashboardSkeleton v-if="analyticsPending && !analyticsData" layout="admin-company-analytics" :rows="8" />
      <section v-else class="analytics-chart-grid">
        <article class="analytics-chart-panel wide">
          <header>
            <div>
              <p>Company liquidity</p>
              <h2>Cash flow by currency</h2>
            </div>
            <BarChart3 class="size-5" />
          </header>
          <div class="flow-chart">
            <div v-for="row in analyticsCashFlowRows" :key="row.currency" class="flow-chart-row">
              <div class="flow-chart-label">
                <strong>{{ row.currency }}</strong>
                <span>{{ row.transactionCount.toLocaleString() }} rows</span>
              </div>
              <div class="flow-chart-bars">
                <span class="flow-track">
                  <span class="flow-fill income" :style="{ width: chartWidth(row.incomeValue, analyticsCashFlowMax) }" />
                </span>
                <span class="flow-track">
                  <span class="flow-fill expense" :style="{ width: chartWidth(row.expenseValue, analyticsCashFlowMax) }" />
                </span>
                <span class="flow-track">
                  <span class="flow-fill net" :class="{ negative: row.balanceValue < 0 }" :style="{ width: chartWidth(row.balanceValue, analyticsCashFlowMax) }" />
                </span>
              </div>
              <div class="flow-chart-values">
                <span>{{ row.income }}</span>
                <span>{{ row.expense }}</span>
                <strong>{{ row.value }}</strong>
              </div>
            </div>
          </div>
        </article>

        <article class="analytics-chart-panel wide">
          <header>
            <div>
              <p>Monthly trend</p>
              <h2>Income, expenses, and net cash flow</h2>
            </div>
            <Activity class="size-5" />
          </header>
          <div v-if="monthlyChartRows.length" class="monthly-chart">
            <div v-for="point in monthlyChartRows" :key="`${point.currency}-${point.month}`" class="monthly-chart-row">
              <div class="monthly-chart-label">
                <strong>{{ point.month }}</strong>
                <span>{{ point.currency }}</span>
              </div>
              <div class="monthly-chart-bars">
                <span class="monthly-track">
                  <span class="monthly-fill income" :style="{ width: chartWidth(point.incomeValue, monthlyChartMax) }" />
                </span>
                <span class="monthly-track">
                  <span class="monthly-fill expense" :style="{ width: chartWidth(point.expenseValue, monthlyChartMax) }" />
                </span>
                <span class="monthly-track">
                  <span class="monthly-fill net" :class="{ negative: point.netValue < 0 }" :style="{ width: chartWidth(point.netValue, monthlyChartMax) }" />
                </span>
              </div>
              <strong class="monthly-net">{{ formatMoney(point.net, point.currency) }}</strong>
            </div>
          </div>
          <AppEmptyState v-else compact icon="chart" title="No cash flow chart" description="Monthly finance activity will appear here." />
        </article>

        <article class="analytics-chart-panel">
          <header>
            <div>
              <p>Spend mix</p>
              <h2>Expense categories</h2>
            </div>
            <PieChart class="size-5" />
          </header>
          <div v-if="categoryChartRows.length" class="rank-chart-list">
            <div v-for="row in categoryChartRows" :key="`${row.currency}-${row.label}`" class="rank-chart-row">
              <div class="rank-chart-copy">
                <strong>{{ row.label }}</strong>
                <span>{{ row.currency }} / {{ row.transactionCount }} rows</span>
              </div>
              <div class="rank-chart-track">
                <span class="rank-chart-fill category" :style="{ width: row.width }" />
              </div>
              <span class="rank-chart-value">{{ formatMoney(row.amount, row.currency) }}</span>
            </div>
          </div>
          <AppEmptyState v-else compact icon="chart" title="No category chart" description="Expense categories will appear here." />
        </article>

        <article class="analytics-chart-panel">
          <header>
            <div>
              <p>Counterparties</p>
              <h2>Vendor concentration</h2>
            </div>
            <WalletCards class="size-5" />
          </header>
          <div v-if="vendorChartRows.length" class="rank-chart-list">
            <div v-for="row in vendorChartRows" :key="`${row.currency}-${row.label}`" class="rank-chart-row">
              <div class="rank-chart-copy">
                <strong>{{ row.label }}</strong>
                <span>{{ row.currency }} / {{ row.transactionCount }} rows</span>
              </div>
              <div class="rank-chart-track">
                <span class="rank-chart-fill vendor" :style="{ width: row.width }" />
              </div>
              <span class="rank-chart-value">{{ formatMoney(row.amount, row.currency) }}</span>
            </div>
          </div>
          <AppEmptyState v-else compact icon="chart" title="No vendor chart" description="Vendor concentration will appear here." />
        </article>

        <article class="analytics-chart-panel">
          <header>
            <div>
              <p>Transaction size</p>
              <h2>Largest movements</h2>
            </div>
            <BarChart3 class="size-5" />
          </header>
          <div v-if="largestTransactionChartRows.length" class="rank-chart-list">
            <div v-for="row in largestTransactionChartRows" :key="row.id" class="rank-chart-row">
              <div class="rank-chart-copy">
                <strong>{{ row.name }}</strong>
                <span>{{ formatDate(row.transactionDate) }} / {{ formatStatus(row.status) }}</span>
              </div>
              <div class="rank-chart-track">
                <span class="rank-chart-fill movement" :class="row.transactionType" :style="{ width: row.width }" />
              </div>
              <span class="rank-chart-value">{{ transactionSignedAmount(row) }}</span>
            </div>
          </div>
          <AppEmptyState v-else compact icon="chart" title="No movement chart" description="Largest transactions will appear here." />
        </article>

        <article class="analytics-chart-panel">
          <header>
            <div>
              <p>Controls</p>
              <h2>Review health</h2>
            </div>
            <AlertTriangle class="size-5" />
          </header>
          <div class="review-chart">
            <div v-for="row in reviewChartRows" :key="row.label" class="review-chart-row" :class="`is-${row.tone}`">
              <div class="review-chart-top">
                <strong>{{ row.label }}</strong>
                <span>{{ row.value.toLocaleString() }}</span>
              </div>
              <div class="review-chart-track">
                <span :style="{ width: chartWidth(row.value, reviewChartMax) }" />
              </div>
            </div>
          </div>
        </article>
      </section>
    </template>

    <FormDialog
      v-model:open="transactionDialogOpen"
      :title="transactionDialogMode === 'create' ? `Add ${transactionForm.transactionType}` : 'Edit transaction'"
      :description="`${transactionForm.currency} bank ledger`"
      :submit-label="transactionDialogMode === 'create' ? 'Record transaction' : 'Save transaction'"
      :pending="transactionSubmitting"
      :error="transactionDialogOpen ? errorMessage : ''"
      :submit-disabled="!transactionForm.name || !transactionForm.amount"
      content-class="max-w-2xl"
      @submit="submitTransaction"
    >
      <div class="company-simple-form">
        <section class="company-dialog-summary" :class="`is-${transactionForm.transactionType}`">
          <div>
            <span>{{ transactionForm.currency }} ledger</span>
            <strong>{{ transactionForm.transactionType === "income" ? "Money in" : "Money out" }}</strong>
          </div>
          <StatusBadge :tone="transactionTypeTone(transactionForm.transactionType)">
            {{ transactionForm.transactionType }}
          </StatusBadge>
        </section>

        <div class="company-dialog-grid compact">
          <div class="field-row company-col-2">
            <label for="company-transaction-name">Description</label>
            <Input id="company-transaction-name" v-model="transactionForm.name" placeholder="Bank statement line" />
          </div>
          <div class="field-row">
            <label for="company-transaction-date">Date</label>
            <AppDatePicker id="company-transaction-date" v-model="transactionForm.transactionDate" placeholder="Transaction date" />
          </div>
          <div class="field-row">
            <label for="company-transaction-amount">Amount</label>
            <Input id="company-transaction-amount" v-model="transactionForm.amount" type="number" min="0.00000001" step="0.01" placeholder="0.00" />
          </div>
          <div class="field-row">
            <label for="company-transaction-category">Category</label>
            <Input id="company-transaction-category" v-model="transactionForm.category" placeholder="Uncategorized" />
          </div>
          <div class="field-row">
            <label for="company-transaction-vendor">Vendor / payee</label>
            <Input id="company-transaction-vendor" v-model="transactionForm.vendorPayee" placeholder="Optional" />
          </div>
          <div class="field-row company-col-2">
            <label for="company-transaction-files">Receipt or proof</label>
            <Input
              :key="attachmentInputKey"
              id="company-transaction-files"
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,application/pdf,image/png,image/jpeg,image/webp,text/csv,text/plain"
              @change="attachmentInputChanged"
            />
            <span class="detail-copy">{{ selectedAttachmentFiles.length }} file{{ selectedAttachmentFiles.length === 1 ? "" : "s" }} selected</span>
          </div>
        </div>

        <details class="company-optional-details">
          <summary>
            <ListFilter class="size-4" />
            Optional details
          </summary>
          <div class="company-dialog-grid compact">
            <div class="field-row">
              <label for="company-transaction-type">Type</label>
              <NativeSelect id="company-transaction-type" v-model="transactionForm.transactionType">
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </NativeSelect>
            </div>
            <div class="field-row">
              <label for="company-transaction-status">Status</label>
              <NativeSelect id="company-transaction-status" v-model="transactionForm.status">
                <option value="recorded">Recorded</option>
                <option value="pending">Pending</option>
                <option value="reconciled">Reconciled</option>
                <option value="flagged">Flagged</option>
              </NativeSelect>
            </div>
            <div class="field-row">
              <label for="company-transaction-payment">Payment method</label>
              <NativeSelect id="company-transaction-payment" v-model="transactionForm.paymentMethod">
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="online_wallet">Online wallet</option>
                <option value="cheque">Cheque</option>
                <option value="other">Other</option>
              </NativeSelect>
            </div>
            <div class="field-row">
              <label for="company-transaction-reference">Reference</label>
              <Input id="company-transaction-reference" v-model="transactionForm.referenceNumber" placeholder="Optional bank ref" />
            </div>
            <div class="field-row company-col-2">
              <label for="company-transaction-note">Note</label>
              <Textarea id="company-transaction-note" v-model="transactionForm.note" rows="2" placeholder="Optional internal note" />
            </div>
          </div>
        </details>
      </div>
    </FormDialog>

    <FormDialog
      v-model:open="bankDetailsDialogOpen"
      :title="`${bankDetailsForm.currency} bank details`"
      description="Shown quietly on the available balance card."
      submit-label="Save bank details"
      :pending="bankDetailsSubmitting"
      :error="bankDetailsDialogOpen ? errorMessage : ''"
      :submit-disabled="bankDetailsSubmitDisabled"
      content-class="max-w-xl"
      @submit="submitBankDetails"
    >
      <div class="company-simple-form">
        <section class="company-dialog-summary is-bank">
          <div>
            <span>{{ bankDetailsForm.currency }} bank ledger</span>
            <strong>{{ bankDetailsForm.currency === "USD" ? "USD receiving account" : "Nepali bank account" }}</strong>
          </div>
          <Badge variant="secondary">Private admin detail</Badge>
        </section>

        <div class="company-dialog-grid compact">
          <div class="field-row company-col-2">
            <label for="company-bank-name">Bank name</label>
            <Input id="company-bank-name" v-model="bankDetailsForm.bankName" placeholder="Bank name" />
          </div>

          <template v-if="bankDetailsForm.currency === 'NPR'">
            <div class="field-row">
              <label for="company-npr-account-number">Account number</label>
              <Input id="company-npr-account-number" v-model="bankDetailsForm.accountNumber" placeholder="Account number" />
            </div>
            <div class="field-row">
              <label for="company-npr-account-name">Account name</label>
              <Input id="company-npr-account-name" v-model="bankDetailsForm.accountName" placeholder="Account name" />
            </div>
            <div class="field-row">
              <label for="company-npr-branch">Branch name</label>
              <Input id="company-npr-branch" v-model="bankDetailsForm.branchName" placeholder="Branch name" />
            </div>
            <div class="field-row">
              <label for="company-npr-swift">SWIFT code</label>
              <Input id="company-npr-swift" v-model="bankDetailsForm.swiftCode" placeholder="SWIFT code" />
            </div>
          </template>

          <template v-else>
            <div class="field-row company-col-2">
              <label for="company-usd-bank-address">Bank address</label>
              <Textarea id="company-usd-bank-address" v-model="bankDetailsForm.bankAddress" rows="2" placeholder="Bank address" />
            </div>
            <div class="field-row">
              <label for="company-usd-routing">Routing (ABA)</label>
              <Input id="company-usd-routing" v-model="bankDetailsForm.routingAba" placeholder="Routing number" />
            </div>
            <div class="field-row">
              <label for="company-usd-swift">SWIFT code</label>
              <Input id="company-usd-swift" v-model="bankDetailsForm.swiftCode" placeholder="SWIFT code" />
            </div>
            <div class="field-row">
              <label for="company-usd-account-number">Account number</label>
              <Input id="company-usd-account-number" v-model="bankDetailsForm.accountNumber" placeholder="Account number" />
            </div>
            <div class="field-row">
              <label for="company-usd-account-type">Account type</label>
              <Input id="company-usd-account-type" v-model="bankDetailsForm.accountType" placeholder="Checking, savings, etc." />
            </div>
            <div class="field-row company-col-2">
              <label for="company-usd-beneficiary">Beneficiary name</label>
              <Input id="company-usd-beneficiary" v-model="bankDetailsForm.beneficiaryName" placeholder="Beneficiary name" />
            </div>
          </template>
        </div>
      </div>
    </FormDialog>

    <FormDialog
      v-model:open="detailsOpen"
      :title="activeTransaction ? activeTransaction.name : 'Transaction details'"
      :description="activeTransaction ? `${activeTransaction.currency} ${activeTransaction.transactionType}` : ''"
      readonly
      content-class="max-w-3xl"
    >
      <dl v-if="activeTransaction" class="company-detail-list">
        <div class="detail-item">
          <dt>Type</dt>
          <dd><StatusBadge :tone="transactionTypeTone(activeTransaction.transactionType)">{{ activeTransaction.transactionType }}</StatusBadge></dd>
        </div>
        <div class="detail-item">
          <dt>Amount</dt>
          <dd class="tabular-nums">{{ transactionSignedAmount(activeTransaction) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Date</dt>
          <dd>{{ formatDate(activeTransaction.transactionDate) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Status</dt>
          <dd><StatusBadge :tone="statusTone(activeTransaction.status)">{{ formatStatus(activeTransaction.status) }}</StatusBadge></dd>
        </div>
        <div class="detail-item">
          <dt>Category</dt>
          <dd>{{ activeTransaction.category }}</dd>
        </div>
        <div class="detail-item">
          <dt>Payment</dt>
          <dd>{{ formatPaymentMethod(activeTransaction.paymentMethod) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Reference</dt>
          <dd>{{ activeTransaction.referenceNumber || "Not set" }}</dd>
        </div>
        <div class="detail-item">
          <dt>Vendor / payee</dt>
          <dd>{{ activeTransaction.vendorPayee || "Not set" }}</dd>
        </div>
        <div class="detail-item company-col-2">
          <dt>Note</dt>
          <dd>{{ activeTransaction.note || "None" }}</dd>
        </div>
        <div class="detail-item company-col-2">
          <dt>Attachments</dt>
          <dd>
            <div v-if="activeTransaction.attachments.length" class="company-attachment-list">
              <div v-for="attachment in activeTransaction.attachments" :key="attachment.id" class="company-attachment-row">
                <div class="company-attachment-name">
                  <ReceiptText class="size-4" />
                  <span>{{ attachment.filename }}</span>
                </div>
                <Button variant="secondary" size="sm" @click="viewAttachment(attachment)">
                  <Eye class="size-4" />
                  View
                </Button>
                <Button variant="secondary" size="sm" @click="downloadAttachment(attachment)">
                  <Download class="size-4" />
                  Download
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Delete attachment" @click="deleteAttachment(attachment.id)">
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
            <span v-else>No attachments</span>
          </dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="detailsOpen = false">Close</Button>
        <Button v-if="activeTransaction" @click="detailsOpen = false; openEditTransaction(activeTransaction)">
          <Pencil class="size-4" />
          Edit
        </Button>
      </template>
    </FormDialog>
  </div>
</template>

<style scoped>
.company-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: calc(100vh - 120px);
}

.company-tabs {
  display: inline-flex;
  flex-wrap: wrap;
  align-self: flex-start;
  max-width: 100%;
  gap: 3px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--card) 76%, var(--muted) 24%);
  padding: 4px;
}

.company-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  min-height: 34px;
  padding: 6px 12px;
  transition: background-color 160ms ease-out, color 160ms ease-out, box-shadow 160ms ease-out;
  white-space: nowrap;
}

.company-tab:hover,
.company-tab.active {
  color: var(--primary);
}

.company-tab.active {
  background: color-mix(in srgb, var(--card) 92%, var(--primary) 8%);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--primary) 18%, transparent),
    0 4px 12px color-mix(in srgb, black 5%, transparent);
}

.company-tab:focus-visible {
  outline: 2px solid var(--ring, var(--primary));
  outline-offset: 3px;
}

.company-tab::after {
  display: none;
}

.company-tab-badge {
  min-width: 20px;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  justify-content: center;
  padding-inline: 6px;
}

.ledger-hero-grid,
.analytics-balance-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: minmax(300px, 1.12fr) repeat(4, minmax(132px, 1fr));
}

.analytics-balance-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.available-balance-hero,
.analytics-balance-hero,
.ledger-metric-card,
.analytics-chart-panel {
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 8px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 99%, var(--muted) 1%), color-mix(in srgb, var(--card) 96%, black 4%));
  box-shadow: 0 8px 20px color-mix(in srgb, black 4%, transparent);
}

.available-balance-hero,
.analytics-balance-hero {
  display: grid;
  min-width: 0;
  align-content: space-between;
  gap: 9px;
  min-height: 124px;
  padding: 12px 13px 11px;
  position: relative;
  overflow: hidden;
}

.available-balance-hero::before,
.analytics-balance-hero::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: color-mix(in srgb, var(--status-success) 72%, transparent);
}

.available-balance-hero.is-negative::before,
.analytics-balance-hero.is-negative::before {
  background: color-mix(in srgb, var(--status-danger) 72%, transparent);
}

.available-hero-kicker,
.ledger-metric-card > div,
.analytics-chart-panel header,
.flow-chart-label,
.monthly-chart-label,
.rank-chart-copy,
.review-chart-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.available-hero-kicker span,
.ledger-metric-card span,
.analytics-chart-panel header p,
.flow-chart-label span,
.monthly-chart-label span,
.rank-chart-copy span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.2;
  text-transform: uppercase;
}

.available-hero-primary {
  display: grid;
  align-content: center;
  min-width: 0;
  gap: 5px;
  padding-left: 3px;
}

.available-amount-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.available-amount-row > strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: clamp(28px, 2.45vw, 38px);
  font-weight: 780;
  letter-spacing: 0;
  line-height: 0.95;
}

.available-currency-badge {
  flex: 0 0 auto;
  margin-top: 4px;
}

.available-hero-primary > p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.3;
}

.bank-detail-cardlet {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(128px, auto) minmax(0, 1fr);
  gap: 6px 10px;
  border-top: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  background: transparent;
  min-width: 0;
  padding: 7px 0 0 3px;
}

.bank-detail-heading,
.bank-detail-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bank-detail-heading {
  justify-content: space-between;
  min-width: 0;
  align-self: start;
}

.bank-detail-heading > span {
  color: var(--muted-foreground);
  font-size: 9.5px;
  font-weight: 790;
  letter-spacing: 0;
  line-height: 1.2;
  text-transform: uppercase;
}

.bank-detail-actions {
  flex: 0 0 auto;
}

.bank-detail-lines {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
  min-width: 0;
}

.bank-detail-lines span,
.bank-detail-empty {
  color: color-mix(in srgb, var(--muted-foreground) 92%, var(--foreground) 8%);
  font-size: 10.5px;
  line-height: 1.3;
}

.bank-detail-lines span {
  min-width: 0;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 55%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--muted) 7%, transparent);
  overflow-wrap: anywhere;
  padding: 4px 6px;
}

.bank-detail-lines b {
  color: var(--foreground);
  font-weight: 720;
}

.bank-detail-empty {
  width: max-content;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 9%, transparent);
  cursor: pointer;
  font-weight: 700;
  padding: 5px 8px;
  text-align: left;
}

.bank-detail-empty:hover {
  color: var(--primary);
}

.ledger-metric-card {
  display: grid;
  align-content: space-between;
  min-width: 0;
  min-height: 104px;
  gap: 6px;
  position: relative;
  padding: 11px 12px;
}

.ledger-metric-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: color-mix(in srgb, var(--muted-foreground) 14%, transparent);
}

.ledger-metric-card.is-positive::before {
  background: var(--status-success);
}

.ledger-metric-card.is-expense::before,
.ledger-metric-card.is-warning::before {
  background: var(--status-warning);
}

.ledger-metric-card.is-negative::before {
  background: var(--status-danger);
}

.ledger-metric-card svg,
.analytics-chart-panel header > svg {
  color: var(--muted-foreground);
  flex: 0 0 auto;
}

.ledger-metric-card.is-positive svg {
  color: var(--status-success);
}

.ledger-metric-card.is-expense svg,
.ledger-metric-card.is-warning svg {
  color: var(--status-warning);
}

.ledger-metric-card.is-negative svg {
  color: var(--status-danger);
}

.ledger-metric-card strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: clamp(17px, 1.25vw, 21px);
  font-weight: 760;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-metric-card small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 11.2px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics-chart-panel header h2 {
  margin: 0;
  color: var(--foreground);
  font-size: 19px;
  font-weight: 760;
  line-height: 1.2;
}

.analytics-chart-panel header p {
  margin: 0;
}

.company-table-toolbar {
  display: grid;
  align-items: center;
  gap: 10px;
  grid-template-columns: minmax(260px, 1fr) auto auto;
}

.company-filter-count {
  min-width: 18px;
  justify-content: center;
  border-radius: 999px;
  padding: 0 5px;
  font-size: 11px;
}

.company-table-filters {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 8%, transparent);
  padding: 12px;
}

.company-transaction-table {
  min-width: 0;
}

:deep(.company-table-year-row td) {
  background: color-mix(in srgb, var(--muted) 18%, transparent);
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

:deep(.company-table-row.is-income) {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--status-success) 54%, transparent);
}

:deep(.company-table-row.is-expense) {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--status-warning) 54%, transparent);
}

.company-transaction-name {
  display: grid;
  min-width: 240px;
  max-width: 340px;
  gap: 2px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.company-transaction-name strong,
.company-cell-text {
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 680;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.company-transaction-name span,
.company-file-muted {
  color: color-mix(in srgb, var(--muted-foreground) 86%, transparent);
  font-size: 12px;
  line-height: 1.25;
}

.company-cell-mono,
.company-amount-value {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.company-cell-mono {
  color: var(--muted-foreground);
  font-size: 12px;
}

.company-file-button,
.company-file-muted {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
}

.company-file-button {
  min-width: 52px;
  min-height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--foreground);
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
  padding: 6px 9px;
}

.company-file-button:hover {
  background: color-mix(in srgb, var(--muted) 28%, transparent);
}

.company-amount-value {
  display: inline-flex;
  min-width: 112px;
  justify-content: flex-end;
  font-size: 13px;
  font-weight: 760;
}

.company-amount-value.income {
  color: var(--status-success);
}

.company-amount-value.expense {
  color: var(--foreground);
}

.company-table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  padding-top: 12px;
}

.company-table-footer > span {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.company-simple-form {
  display: grid;
  gap: 14px;
}

.company-simple-form :deep(input),
.company-simple-form :deep(textarea),
.company-simple-form :deep(select),
.company-transaction-panel :deep(input),
.company-transaction-panel :deep(select) {
  transition: border-color 150ms ease-out, box-shadow 150ms ease-out, background-color 150ms ease-out;
}

.company-simple-form :deep(input:focus),
.company-simple-form :deep(textarea:focus),
.company-simple-form :deep(select:focus),
.company-transaction-panel :deep(input:focus),
.company-transaction-panel :deep(select:focus) {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 14%, transparent);
}

.detail-copy {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.3;
}

.company-dialog-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 9%, transparent);
  padding: 11px 12px;
}

.company-dialog-summary.is-bank {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--chart-1) 7%, transparent), transparent 48%),
    color-mix(in srgb, var(--muted) 8%, transparent);
}

.company-dialog-summary div {
  display: grid;
  gap: 2px;
}

.company-dialog-summary span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.2;
  text-transform: uppercase;
}

.company-dialog-summary strong {
  color: var(--foreground);
  font-size: 16px;
  font-weight: 760;
  line-height: 1.2;
}

.company-dialog-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.company-optional-details {
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 66%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 5%, transparent);
}

.company-optional-details summary {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted-foreground);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  list-style: none;
  padding: 10px 11px;
}

.company-optional-details summary::-webkit-details-marker {
  display: none;
}

.company-optional-details[open] summary {
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
}

.company-optional-details .company-dialog-grid {
  padding: 12px;
}

.company-col-2 {
  grid-column: 1 / -1;
}

.analytics-chart-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.analytics-chart-panel {
  overflow: hidden;
}

.analytics-chart-panel.wide {
  grid-column: 1 / -1;
}

.analytics-chart-panel header {
  border-bottom: 1px solid var(--surface-border, var(--border));
  padding: 12px 14px;
}

.analytics-chart-panel header > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.analytics-balance-bars {
  display: grid;
  gap: 5px;
  margin-top: 4px;
}

.balance-bar,
.flow-fill,
.monthly-fill,
.rank-chart-fill,
.review-chart-track span {
  display: block;
  border-radius: 999px;
}

.balance-bar {
  height: 6px;
}

.balance-bar.income,
.flow-fill.income,
.monthly-fill.income {
  background: var(--status-success);
}

.balance-bar.expense,
.flow-fill.expense,
.monthly-fill.expense {
  background: var(--status-warning);
}

.balance-bar.net,
.flow-fill.net,
.monthly-fill.net {
  background: var(--chart-1);
}

.flow-fill.net.negative,
.monthly-fill.net.negative {
  background: var(--status-danger);
}

.flow-chart,
.monthly-chart,
.rank-chart-list,
.review-chart {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.flow-chart-row {
  display: grid;
  align-items: center;
  gap: 12px;
  grid-template-columns: minmax(84px, 0.42fr) minmax(0, 1fr) minmax(130px, 0.5fr);
}

.monthly-chart-row {
  display: grid;
  align-items: center;
  gap: 12px;
  grid-template-columns: minmax(110px, 0.45fr) minmax(0, 1fr) minmax(118px, auto);
}

.flow-chart-label,
.monthly-chart-label,
.rank-chart-copy {
  display: grid;
  justify-content: start;
  gap: 2px;
}

.flow-chart-label strong,
.monthly-chart-label strong,
.rank-chart-copy strong,
.review-chart-top strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 720;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-chart-bars,
.monthly-chart-bars {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.flow-track,
.monthly-track,
.rank-chart-track,
.review-chart-track {
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 34%, transparent);
}

.flow-track,
.monthly-track {
  height: 8px;
}

.flow-fill,
.monthly-fill {
  height: 100%;
}

.flow-chart-values {
  display: grid;
  gap: 3px;
  justify-items: end;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.flow-chart-values strong,
.monthly-net,
.rank-chart-value,
.review-chart-top span {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 760;
  white-space: nowrap;
}

.monthly-net {
  text-align: right;
}

.rank-chart-row {
  display: grid;
  align-items: center;
  gap: 10px;
  grid-template-columns: minmax(132px, 0.8fr) minmax(0, 1fr) minmax(112px, auto);
}

.rank-chart-track {
  height: 10px;
}

.rank-chart-fill {
  height: 100%;
}

.rank-chart-fill.category {
  background: var(--chart-1);
}

.rank-chart-fill.vendor {
  background: var(--chart-2);
}

.rank-chart-fill.movement.income {
  background: var(--status-success);
}

.rank-chart-fill.movement.expense {
  background: var(--status-warning);
}

.rank-chart-value {
  text-align: right;
}

.review-chart {
  gap: 14px;
}

.review-chart-row {
  display: grid;
  gap: 8px;
}

.review-chart-track {
  height: 12px;
}

.review-chart-track span {
  height: 100%;
  background: var(--chart-1);
}

.review-chart-row.is-warning .review-chart-track span {
  background: var(--status-warning);
}

.review-chart-row.is-danger .review-chart-track span {
  background: var(--status-danger);
}

.company-detail-list {
  display: grid;
  gap: 10px;
  grid-template-columns: 1fr 1fr;
}

.detail-item {
  display: grid;
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 58%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 4%, transparent);
  padding: 10px;
}

.detail-item dt {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.detail-item dd {
  margin: 0;
  color: var(--foreground);
  font-size: 14px;
  font-weight: 560;
  overflow-wrap: anywhere;
}

.company-attachment-list {
  display: grid;
  gap: 8px;
}

.company-attachment-row {
  display: grid;
  align-items: center;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 60%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--card) 85%, var(--muted) 15%);
  min-width: 0;
  padding: 8px;
}

.company-attachment-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.company-attachment-name span {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .ledger-hero-grid,
  .analytics-balance-grid,
  .analytics-chart-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .available-balance-hero,
  .analytics-balance-hero,
  .analytics-chart-panel.wide {
    grid-column: 1 / -1;
  }
}

@media (max-width: 860px) {
  .analytics-chart-grid,
  .company-detail-list {
    grid-template-columns: 1fr;
  }

  .analytics-chart-panel.wide {
    grid-column: auto;
  }

  .flow-chart-row,
  .monthly-chart-row,
  .rank-chart-row,
  .company-dialog-grid,
  .company-attachment-row {
    grid-template-columns: 1fr;
  }

  .flow-chart-values {
    justify-items: start;
  }

  .monthly-net,
  .rank-chart-value {
    text-align: left;
  }

  .company-table-toolbar,
  .company-table-footer {
    grid-template-columns: 1fr;
  }

  .company-table-toolbar,
  .company-table-footer {
    align-items: stretch;
  }

  .company-table-footer {
    display: grid;
  }
}

@media (max-width: 640px) {
  .ledger-hero-grid,
  .analytics-balance-grid {
    grid-template-columns: 1fr;
  }

  .available-amount-row > strong {
    font-size: 30px;
  }

  .bank-detail-cardlet {
    grid-template-columns: 1fr;
  }

  .bank-detail-lines {
    grid-template-columns: 1fr;
  }

  .bank-detail-heading {
    align-items: center;
  }

  .company-tabs {
    width: 100%;
  }

  .company-tab {
    flex: 1 1 auto;
    justify-content: center;
  }
}
</style>
