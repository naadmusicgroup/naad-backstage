<script setup lang="ts">
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  ReceiptText,
  WalletCards,
} from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import PremiumPayoutIcon from "~/components/icons/PremiumPayoutIcon.vue"
import PremiumStatementRowIcon from "~/components/icons/PremiumStatementRowIcon.vue"
import type { ArtistDueItem, ArtistWalletResponse, ArtistWalletStatementTransaction } from "~~/types/dashboard"
import {
  MIN_PAYOUT_AMOUNT,
  type ArtistPayoutsResponse,
  type PayoutRequestStatus,
} from "~~/types/payouts"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

type WalletSection = "statement" | "payout"
type StatementTab = "all" | "dues" | "payouts"
type StatementDirection = "all" | "credit" | "debit"

interface StatementDisplayRow {
  id: string
  category: "balance" | "dues" | "payouts" | "adjustments"
  title: string
  description: string
  amount: string
  balanceAfter: string | null
  createdAt: string
}

const walletSectionValues: WalletSection[] = ["statement", "payout"]
const statementTabValues: StatementTab[] = ["all", "dues", "payouts"]
const statementDirectionValues: StatementDirection[] = ["all", "credit", "debit"]
const statementDirectionOptions: Array<{ label: string, value: StatementDirection }> = [
  { label: "Credit", value: "credit" },
  { label: "Debit", value: "debit" },
]
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const statementDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
})

const route = useRoute()
const router = useRouter()
const { activeArtistId, activeArtist } = useActiveArtist()
const { viewer } = useViewerContext()
const { confirmAction } = useConfirmAction()
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))
const activeStatementYear = computed<number>({
  get: () => normalizeStatementYear(route.query.year),
  set: (value) => {
    const query = {
      ...route.query,
      section: "statement",
      year: String(value),
    }

    void router.replace({ query })
  },
})
const artistScopeQuery = computed(() => ({
  ...(activeArtistId.value ? { artistId: activeArtistId.value } : {}),
  statementYear: activeStatementYear.value,
}))

const {
  data: walletData,
  error: walletError,
  pending: walletPending,
  refresh: refreshWallet,
} = useLazyFetch<ArtistWalletResponse>("/api/dashboard/wallet", {
  query: artistScopeQuery,
})

useRevealPage({
  ready: computed(() => !walletPending.value || !!walletData.value),
})
const {
  data: payoutData,
  error: payoutError,
  pending: payoutPending,
  refresh: refreshPayouts,
} = useLazyFetch<ArtistPayoutsResponse>("/api/dashboard/payouts", {
  query: artistScopeQuery,
})

const wallet = computed<ArtistWalletResponse>(() => {
  return (
    walletData.value ?? {
      totalEarned: "0.00000000",
      availableBalance: "0.00000000",
      visibleBalance: "0.00000000",
      totalDues: "0.00000000",
      reservedPayouts: "0.00000000",
      pendingPayouts: "0.00000000",
      approvedPayouts: "0.00000000",
      totalWithdrawn: "0.00000000",
      balanceSettling: false,
      recentTransactions: [],
      statementYears: [new Date().getUTCFullYear()],
      statementSummary: {
        year: new Date().getUTCFullYear(),
        openingBalance: "0.00000000",
        closingBalance: "0.00000000",
        from: new Date().toISOString(),
        to: new Date().toISOString(),
        transactionCount: 0,
      },
      statementTransactions: [],
      dues: [],
    }
  )
})
const payoutArtists = computed(() => payoutData.value?.artists ?? [])
const payoutRequests = computed(() => payoutData.value?.requests ?? [])
const minimumPayoutAmount = computed(() => payoutData.value?.minimumAmount ?? MIN_PAYOUT_AMOUNT.toFixed(8))
const requestWindowHours = computed(() => payoutData.value?.requestWindowHours ?? 24)
const maxRequestsPerWindow = computed(() => payoutData.value?.maxRequestsPerWindow ?? 3)
const pendingAcceptanceDues = computed(() => wallet.value.dues.filter((due) => due.status === "pending_acceptance"))
const currentDueItems = computed(() => wallet.value.dues.filter((due) => (
  due.status === "pending_acceptance" || due.status === "unpaid"
)))
const currentDueAmount = computed(() => currentDueItems.value.reduce((total, due) => {
  const amount = Number(due.amount)
  return total + (Number.isFinite(amount) ? amount : 0)
}, 0))
const payoutForm = reactive({
  artistId: "",
  amount: "",
  artistNotes: "",
  acknowledgeTerms: false,
})
const isSubmittingPayout = ref(false)
const isDealVisible = ref(false)
const acceptingDueId = ref("")
const dueSuccessMessage = ref("")
const dueErrorMessage = ref("")
const payoutSuccessMessage = ref("")
const payoutErrorMessage = ref("")

interface CardTiltOptions {
  maxTilt: number
  perspective: number
  scale: number
}

function createCardTiltState(options: CardTiltOptions) {
  const tiltX = ref(0)
  const tiltY = ref(0)
  const shineX = ref(50)
  const shineY = ref(50)
  const isTilting = ref(false)

  const cardStyle = computed(() => ({
    transform: isTilting.value
      ? `perspective(${options.perspective}px) rotateX(${tiltX.value}deg) rotateY(${tiltY.value}deg) scale3d(${options.scale}, ${options.scale}, ${options.scale})`
      : `perspective(${options.perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`,
    transition: isTilting.value ? "transform 0.08s ease-out" : "transform 0.42s var(--ease-out)",
  }))

  const shineStyle = computed(() => {
    const glowX = Math.max(18, Math.min(82, 50 + (shineX.value - 50) * 0.18))
    const glowY = Math.max(14, Math.min(62, 34 + (shineY.value - 50) * 0.14))
    const ambientX = Math.max(16, Math.min(84, 58 + (shineX.value - 50) * 0.1))
    const ambientY = Math.max(18, Math.min(74, 58 + (shineY.value - 50) * 0.08))

    return {
      background: isTilting.value
        ? [
            `radial-gradient(155% 105% at ${glowX}% ${glowY}%, rgba(255,255,255,0.085), rgba(255,255,255,0.045) 26%, rgba(255,255,255,0.018) 48%, transparent 76%)`,
            `radial-gradient(135% 95% at ${ambientX}% ${ambientY}%, rgba(255,255,255,0.052), rgba(255,255,255,0.024) 34%, transparent 78%)`,
          ].join(", ")
        : "none",
      opacity: isTilting.value ? "0.82" : "0",
    }
  })

  function onMove(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height

    tiltX.value = (0.5 - y) * options.maxTilt
    tiltY.value = (x - 0.5) * options.maxTilt
    shineX.value = x * 100
    shineY.value = y * 100
    isTilting.value = true
  }

  function onLeave() {
    tiltX.value = 0
    tiltY.value = 0
    isTilting.value = false
  }

  return {
    cardStyle,
    onLeave,
    onMove,
    shineStyle,
  }
}

const balanceTilt = createCardTiltState({ maxTilt: 2.5, perspective: 900, scale: 1.004 })
const balanceTiltStyle = balanceTilt.cardStyle
const balanceShineStyle = balanceTilt.shineStyle

const activeWalletSection = computed<WalletSection>({
  get: () => normalizeWalletSection(route.query.section),
  set: (value) => {
    const query = { ...route.query }

    query.section = value

    if (value === "payout") {
      delete query.statement
      delete query.direction
    }

    void router.replace({ query })
  },
})
const walletSections = computed(() => [
  {
    label: "Statement",
    value: "statement",
    badge: wallet.value.statementSummary?.transactionCount || "",
  },
  {
    label: "Request payout",
    value: "payout",
    badge: payoutArtists.value.some((artist) => artist.hasPendingRequest) ? "Pending" : "",
  },
])
const activeStatementTab = computed<StatementTab>({
  get: () => normalizeStatementTab(route.query.statement, route.query.section),
  set: (value) => {
    const query = {
      ...route.query,
      section: "statement",
      statement: value,
    }

    void router.replace({ query })
  },
})
const activeStatementDirection = computed<StatementDirection>({
  get: () => normalizeStatementDirection(route.query.direction),
  set: (value) => {
    const query = {
      ...route.query,
      section: "statement",
      direction: value === "all" ? undefined : value,
    }

    void router.replace({ query })
  },
})
const statementSummary = computed(() => (
  wallet.value.statementSummary ?? {
    year: activeStatementYear.value,
    openingBalance: wallet.value.availableBalance,
    closingBalance: wallet.value.availableBalance,
    from: new Date(Date.UTC(activeStatementYear.value, 0, 1, 0, 0, 0, 0)).toISOString(),
    to: new Date(Date.UTC(activeStatementYear.value, 11, 31, 23, 59, 59, 999)).toISOString(),
    transactionCount: 0,
  }
))
const statementYearOptions = computed(() => {
  const currentYear = new Date().getUTCFullYear()
  const years = new Set<number>([
    activeStatementYear.value,
    statementSummary.value.year ?? currentYear,
    ...(wallet.value.statementYears ?? []),
  ])

  return Array.from(years)
    .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100)
    .sort((a, b) => b - a)
})
const statementTransactions = computed(() => wallet.value.statementTransactions ?? [])
const statementRows = computed<StatementDisplayRow[]>(() => statementTransactions.value.map(mapStatementTransaction))
const allStatementRows = computed(() => applyStatementDirection(statementRows.value))
const dueStatementRows = computed(() => applyStatementDirection(statementRows.value.filter((row) => row.category === "dues")))
const payoutStatementRows = computed(() => applyStatementDirection(statementRows.value.filter((row) => row.category === "payouts")))
const visiblePendingAcceptanceDues = computed(() => {
  if (activeStatementDirection.value === "credit") {
    return []
  }

  if (activeStatementTab.value !== "all" && activeStatementTab.value !== "dues") {
    return []
  }

  return pendingAcceptanceDues.value
})
const visibleStatementRows = computed(() => {
  switch (activeStatementTab.value) {
    case "dues":
      return dueStatementRows.value
    case "payouts":
      return payoutStatementRows.value
    case "all":
    default:
      return allStatementRows.value
  }
})
const groupedStatementRows = computed(() => groupStatementRows(visibleStatementRows.value))
const statementTabItems = computed<Array<{ label: string, value: StatementTab, badge: number }>>(() => [
  {
    label: "All",
    value: "all",
    badge: allStatementRows.value.length + (activeStatementDirection.value === "credit" ? 0 : pendingAcceptanceDues.value.length),
  },
  {
    label: "Dues & Fees",
    value: "dues",
    badge: dueStatementRows.value.length + (activeStatementDirection.value === "credit" ? 0 : pendingAcceptanceDues.value.length),
  },
  {
    label: "Payout History",
    value: "payouts",
    badge: payoutStatementRows.value.length,
  },
])
const walletStats = computed(() => {
  const stats: Array<{ label: string, value: string | number }> = [
    {
      label: "Pending payouts",
      value: wallet.value.pendingPayouts,
    },
    {
      label: "Withdrawn",
      value: wallet.value.totalWithdrawn,
    },
  ]

  if (currentDueAmount.value > 0) {
    stats.unshift({
      label: "Dues",
      value: currentDueAmount.value,
    })
  }

  return stats
})
const walletCardholderName = computed(() => (
  activeArtist.value?.name
  || payoutArtists.value[0]?.artistName
  || viewer.value.profile?.fullName
  || "Naad Artist"
))
const selectedPayoutArtist = computed(() => payoutArtists.value.find((artist) => artist.artistId === payoutForm.artistId) ?? null)
const selectedPayoutArtistSharePct = computed(() => selectedPayoutArtist.value?.artistSharePct ?? null)
const hasSelectedPayoutArtistSharePct = computed(() => Boolean(selectedPayoutArtistSharePct.value))
const selectedPayoutArtistShareLabel = computed(() => formatArtistSharePct(selectedPayoutArtistSharePct.value))
const visiblePayoutArtistShareLabel = computed(() => (isDealVisible.value ? selectedPayoutArtistShareLabel.value : "XX%"))
const selectedPayoutArtistVisibleBalanceAmount = computed(() => {
  const balance = Number(selectedPayoutArtist.value?.visibleBalance ?? 0)
  return Number.isFinite(balance) ? Math.max(balance, 0) : 0
})
const selectedPayoutArtistOwedAmount = computed(() => selectedPayoutArtistVisibleBalanceAmount.value * 0.99)
const payoutTermsAcknowledgementLabel = computed(() => (
  hasSelectedPayoutArtistSharePct.value
    ? `I acknowledge my ${visiblePayoutArtistShareLabel.value} artist-share deal with Naad Music Group and the payout transaction fee terms.`
    : "I acknowledge my artist-share deal with Naad Music Group and the payout transaction fee terms."
))
const canSubmitPayout = computed(() => {
  if (!selectedPayoutArtist.value || isViewingAsArtist.value) {
    return false
  }

  const amount = Number(payoutForm.amount || 0)
  const minimumAmount = Number(minimumPayoutAmount.value || MIN_PAYOUT_AMOUNT)

  return (
    Number.isFinite(amount)
    && amount >= minimumAmount
    && !selectedPayoutArtist.value.hasPendingRequest
    && hasSelectedPayoutArtistSharePct.value
    && payoutForm.acknowledgeTerms
    && amount <= Number(selectedPayoutArtist.value.visibleBalance)
  )
})

watch(
  payoutArtists,
  (value) => {
    if (!value.length) {
      payoutForm.artistId = ""
      return
    }

    if (!value.some((artist) => artist.artistId === payoutForm.artistId)) {
      payoutForm.artistId = value[0].artistId
    }
  },
  { immediate: true },
)

watch(
  () => payoutForm.artistId,
  () => {
    payoutForm.acknowledgeTerms = false
    isDealVisible.value = false
  },
)

function queryStringValue(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim()
}

function normalizeWalletSection(value: unknown): WalletSection {
  const raw = queryStringValue(value)

  return walletSectionValues.includes(raw as WalletSection) ? raw as WalletSection : "statement"
}

function normalizeStatementYear(value: unknown) {
  const year = Number(queryStringValue(value))

  if (Number.isInteger(year) && year >= 2000 && year <= 2100) {
    return year
  }

  return new Date().getUTCFullYear()
}

function normalizeStatementTab(statementValue: unknown, sectionValue: unknown): StatementTab {
  const raw = queryStringValue(statementValue)

  if (statementTabValues.includes(raw as StatementTab)) {
    return raw as StatementTab
  }

  const legacySection = queryStringValue(sectionValue)

  if (legacySection === "dues") {
    return "dues"
  }

  if (legacySection === "history") {
    return "payouts"
  }

  return "all"
}

function normalizeStatementDirection(value: unknown): StatementDirection {
  const raw = queryStringValue(value)

  return statementDirectionValues.includes(raw as StatementDirection) ? raw as StatementDirection : "all"
}

function mapStatementTransaction(row: ArtistWalletStatementTransaction): StatementDisplayRow {
  return {
    id: row.id,
    category: row.category,
    title: row.label,
    description: row.description,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    createdAt: row.createdAt,
  }
}

function applyStatementDirection(rows: StatementDisplayRow[]) {
  const direction = activeStatementDirection.value

  if (direction === "credit") {
    return rows.filter((row) => Number(row.amount) > 0)
  }

  if (direction === "debit") {
    return rows.filter((row) => Number(row.amount) < 0)
  }

  return rows
}

function groupStatementRows(rows: StatementDisplayRow[]) {
  const groups = new Map<string, { key: string, label: string, rows: StatementDisplayRow[] }>()

  for (const row of [...rows].sort((a, b) => {
    const timeDelta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return timeDelta || b.id.localeCompare(a.id)
  })) {
    const date = new Date(row.createdAt)
    const key = Number.isNaN(date.getTime()) ? row.createdAt : date.toISOString().slice(0, 10)
    const label = formatStatementDate(row.createdAt)

    if (!groups.has(key)) {
      groups.set(key, { key, label, rows: [] })
    }

    groups.get(key)?.rows.push(row)
  }

  return Array.from(groups.values())
}

function statementIconVariant(row: StatementDisplayRow): "credit" | "due" | "payout" | "adjustment" {
  if (row.category === "dues") {
    return "due"
  }

  if (row.category === "payouts") {
    return "payout"
  }

  if (row.category === "balance") {
    return Number(row.amount) >= 0 ? "credit" : "adjustment"
  }

  return "adjustment"
}

function statementAmountClass(row: StatementDisplayRow) {
  return Number(row.amount) >= 0 ? "amount-positive" : "amount-negative"
}

function formatStatementDate(value: string | null | undefined) {
  if (!value) {
    return "Unknown date"
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return statementDateFormatter.format(parsedDate)
}

function formatStatementYearRange() {
  const fromDate = statementSummary.value.from ? dateFormatter.format(new Date(statementSummary.value.from)) : "-"
  const toDate = statementSummary.value.to ? dateFormatter.format(new Date(statementSummary.value.to)) : "-"

  return `${fromDate} - ${toDate}`
}

function resetPayoutMessages() {
  payoutSuccessMessage.value = ""
  payoutErrorMessage.value = ""
}

function setPayoutError(error: any, fallback: string) {
  payoutErrorMessage.value = error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
  payoutSuccessMessage.value = ""
}

function setPayoutSuccess(message: string) {
  payoutSuccessMessage.value = message
  payoutErrorMessage.value = ""
}

function setDueError(error: any, fallback: string) {
  dueErrorMessage.value = error?.data?.statusMessage || error?.statusMessage || error?.message || fallback
  dueSuccessMessage.value = ""
}

function setDueSuccess(message: string) {
  dueSuccessMessage.value = message
  dueErrorMessage.value = ""
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0)
  return `$${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`
}

function formatArtistSharePct(value: string | number | null | undefined) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "not set"
  }

  const amount = Number(value)
  return Number.isFinite(amount) ? `${amount.toFixed(2)}%` : "not set"
}

function formatFeePercent(value: string | number | null | undefined) {
  const amount = Number(value ?? 1)
  return Number.isFinite(amount) ? `${amount.toFixed(2)}%` : "1.00%"
}

function formatSignedMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0)
  const normalized = Number.isFinite(amount) ? amount : 0
  const prefix = normalized > 0 ? "+" : normalized < 0 ? "-" : ""
  return `${prefix}$${Math.abs(normalized).toFixed(2)}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-"
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return dateTimeFormatter.format(parsedDate)
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "No due date"
  }

  const parsedDate = new Date(`${value}T00:00:00Z`)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return dateFormatter.format(parsedDate)
}

function formatStatus(status: PayoutRequestStatus) {
  switch (status) {
    case "pending":
      return "Pending"
    case "approved":
      return "Approved"
    case "rejected":
      return "Rejected"
    case "paid":
      return "Paid"
  }
}

function statusTone(status: PayoutRequestStatus) {
  switch (status) {
    case "pending":
      return "warning"
    case "approved":
      return "info"
    case "rejected":
      return "danger"
    case "paid":
      return "success"
  }
}

function formatDueStatus(status: ArtistDueItem["status"]) {
  switch (status) {
    case "pending_acceptance":
      return "Awaiting acceptance"
    case "unpaid":
      return "Unpaid"
    case "paid":
      return "Paid"
    case "cancelled":
      return "Cancelled"
  }
}

function dueStatusTone(status: ArtistDueItem["status"]) {
  switch (status) {
    case "pending_acceptance":
      return "warning"
    case "unpaid":
      return "warning"
    case "paid":
      return "success"
    case "cancelled":
      return "muted"
  }
}

async function acceptDue(due: ArtistDueItem) {
  if (isViewingAsArtist.value) {
    dueErrorMessage.value = "View-as mode is read-only. Sign in as the artist to accept dues."
    dueSuccessMessage.value = ""
    return
  }

  const confirmed = await confirmAction({
    title: "Accept due",
    description: `Accept ${formatMoney(due.amount)} due "${due.title}"? This will deduct the amount from your wallet balance.`,
    confirmLabel: "Accept due",
  })

  if (!confirmed) {
    return
  }

  acceptingDueId.value = due.id
  dueSuccessMessage.value = ""
  dueErrorMessage.value = ""

  try {
    await $fetch(`/api/dashboard/dues/${due.id}/accept`, {
      method: "POST",
    })

    await Promise.all([refreshWallet(), refreshPayouts()])
    setDueSuccess(`Accepted ${formatMoney(due.amount)} due "${due.title}".`)
  } catch (error: any) {
    setDueError(error, "Unable to accept this due.")
  } finally {
    acceptingDueId.value = ""
  }
}

async function submitPayoutRequest() {
  if (isViewingAsArtist.value) {
    payoutErrorMessage.value = "View-as mode is read-only. Sign in as the artist to request a payout."
    return
  }

  if (!selectedPayoutArtist.value) {
    payoutErrorMessage.value = "No artist account is available for payout requests."
    return
  }

  const requestedAmount = payoutForm.amount
  const confirmed = await confirmAction({
    title: "Request payout",
    description: `Request ${formatMoney(requestedAmount)} from ${selectedPayoutArtist.value.artistName}? This will reserve the amount for admin review and store your payout terms acknowledgement.`,
    confirmLabel: "Request payout",
  })

  if (!confirmed) {
    return
  }

  isSubmittingPayout.value = true
  resetPayoutMessages()

  try {
    await $fetch("/api/dashboard/payouts", {
      method: "POST",
      body: {
        artistId: payoutForm.artistId,
        amount: payoutForm.amount,
        artistNotes: payoutForm.artistNotes || null,
        acknowledgeTerms: payoutForm.acknowledgeTerms,
      },
    })

    payoutForm.amount = ""
    payoutForm.artistNotes = ""
    payoutForm.acknowledgeTerms = false
    isDealVisible.value = false
    await Promise.all([refreshWallet(), refreshPayouts()])
    setPayoutSuccess(`Requested ${formatMoney(requestedAmount)}.`)
  } catch (error: any) {
    setPayoutError(error, "Unable to submit this payout request.")
  } finally {
    isSubmittingPayout.value = false
  }
}
</script>

<template>
  <div class="page wallet-page">
    <svg class="wallet-card-engrave-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="wallet-card-deboss-fine" x="-24%" y="-36%" width="148%" height="172%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="erode" radius="0.25" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation="0.25" result="softEdge" />
          <feOffset in="softEdge" dx="0.55" dy="0.72" result="shadowMask" />
          <feFlood flood-color="#000000" flood-opacity="0.76" result="shadowColor" />
          <feComposite in="shadowColor" in2="shadowMask" operator="in" result="innerShadow" />
          <feOffset in="softEdge" dx="-0.48" dy="-0.54" result="lightMask" />
          <feFlood flood-color="#ffedb0" flood-opacity="0.2" result="lightColor" />
          <feComposite in="lightColor" in2="lightMask" operator="in" result="innerLight" />
          <feBlend in="SourceGraphic" in2="innerShadow" mode="multiply" result="shaded" />
          <feBlend in="shaded" in2="innerLight" mode="screen" />
        </filter>
        <filter id="wallet-card-deboss-heavy" x="-24%" y="-32%" width="148%" height="164%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="erode" radius="0.45" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation="0.38" result="softEdge" />
          <feOffset in="softEdge" dx="0.85" dy="1.05" result="shadowMask" />
          <feFlood flood-color="#000000" flood-opacity="0.84" result="shadowColor" />
          <feComposite in="shadowColor" in2="shadowMask" operator="in" result="innerShadow" />
          <feOffset in="softEdge" dx="-0.62" dy="-0.72" result="lightMask" />
          <feFlood flood-color="#fff1bf" flood-opacity="0.18" result="lightColor" />
          <feComposite in="lightColor" in2="lightMask" operator="in" result="innerLight" />
          <feBlend in="SourceGraphic" in2="innerShadow" mode="multiply" result="shaded" />
          <feBlend in="shaded" in2="innerLight" mode="screen" />
        </filter>
        <filter id="wallet-card-deboss-logo" x="-18%" y="-28%" width="136%" height="156%" color-interpolation-filters="sRGB">
          <feMorphology in="SourceAlpha" operator="erode" radius="0.35" result="eroded" />
          <feComposite in="SourceAlpha" in2="eroded" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation="0.32" result="softEdge" />
          <feOffset in="softEdge" dx="0.62" dy="0.78" result="shadowMask" />
          <feFlood flood-color="#000000" flood-opacity="0.78" result="shadowColor" />
          <feComposite in="shadowColor" in2="shadowMask" operator="in" result="innerShadow" />
          <feOffset in="softEdge" dx="-0.45" dy="-0.52" result="lightMask" />
          <feFlood flood-color="#efd476" flood-opacity="0.18" result="lightColor" />
          <feComposite in="lightColor" in2="lightMask" operator="in" result="innerLight" />
          <feBlend in="SourceGraphic" in2="innerShadow" mode="multiply" result="shaded" />
          <feBlend in="shaded" in2="innerLight" mode="screen" />
        </filter>
      </defs>
    </svg>

    <PageHeader
      eyebrow="Finance"
      title="Wallet"
      description="Available balance, payout requests, and clean account movement."
    >
      <template #actions>
        <Button type="button" variant="secondary" @click="activeWalletSection = 'payout'">
          <PremiumPayoutIcon class="size-4" />
          Request payout
        </Button>
      </template>
    </PageHeader>

    <AppAlert v-if="walletError" variant="destructive">
      {{ walletError.statusMessage || "Unable to load wallet data right now." }}
      <template #action>
        <Button variant="secondary" @click="() => refreshWallet()">Retry</Button>
      </template>
    </AppAlert>

    <DashboardSkeleton v-else-if="walletPending && !walletData" layout="wallet" />

    <template v-else>
      <Card glint="hero" class="wallet-balance-card">
        <div class="wallet-balance-layout">
          <div
            class="wallet-credit-card wallet-tilt-card"
            :style="balanceTiltStyle"
            @mousemove="balanceTilt.onMove"
            @mouseleave="balanceTilt.onLeave"
          >
            <div class="wallet-card-shine" :style="balanceShineStyle" />
            <div class="wallet-card-grain" aria-hidden="true" />
            <div class="wallet-card-frame" aria-hidden="true" />
            <div class="credit-card-inner wallet-card-inner">
              <div class="wallet-card-chip-row">
                <div class="chip-n-contactless">
                  <div class="emv-chip">
                    <div class="chip-inner-pattern" />
                  </div>
                  <div class="contactless-icon">
                    <svg class="size-5 opacity-85" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
                      <path d="M9 8a6 6 0 0 1 0 8" />
                      <path d="M13 5a11 11 0 0 1 0 14" />
                      <path d="M17 2a16 16 0 0 1 0 20" />
                    </svg>
                  </div>
                </div>
              </div>

              <div class="card-balance-block wallet-card-balance-block">
                <span class="card-balance-label">Available balance</span>
                <div class="card-balance-amount wallet-card-balance-amount">
                  <MoneyValue :value="wallet.visibleBalance" size="xl" animate :animate-delay="200" />
                </div>
              </div>

              <div class="card-number-layer wallet-card-number-layer">
                <span>8002 0260 5221 3387</span>
              </div>

              <div class="card-bottom-row wallet-card-bottom-row">
                <div class="card-holder-info">
                  <span class="card-label">Cardholder</span>
                  <strong class="card-holder-name">{{ walletCardholderName }}</strong>
                </div>
                <div class="card-meta-info">
                  <div class="card-valid-thru">
                    <span class="card-label">Valid thru</span>
                    <strong class="card-expiry">12/30</strong>
                  </div>
                  <div class="card-logo-container wallet-card-network-logo">
                    <img
                      src="/naadlogo.png"
                      class="card-naad-logo"
                      alt="Naad Music Group"
                      width="2118"
                      height="1118"
                      decoding="async"
                    >
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="balance-stat-grid" v-reveal-group="{ trigger: 'mount', stagger: 0.08, y: 18 }">
            <div
              v-for="stat in walletStats"
              :key="stat.label"
              class="balance-stat"
              :class="{ 'balance-stat-uncleared': stat.label === 'Pending payouts' }"
            >
              <span>{{ stat.label }}</span>
              <strong>{{ formatMoney(stat.value) }}</strong>
              <small v-if="stat.label === 'Pending payouts'" class="balance-stat-note">Uncleared funds</small>
            </div>
          </div>
        </div>
      </Card>

      <WorkspaceFolderGrid
        v-model="activeWalletSection"
        :items="walletSections"
        label="Wallet sections"
      />

      <div v-if="activeWalletSection === 'statement'" class="statement-section-stack">
        <AppAlert v-if="dueErrorMessage" variant="destructive">{{ dueErrorMessage }}</AppAlert>
        <AppAlert v-if="dueSuccessMessage" variant="success">{{ dueSuccessMessage }}</AppAlert>
        <AppAlert v-if="isViewingAsArtist" variant="warning">
          View-as mode is read-only. Due acceptance is disabled while an admin is inspecting this dashboard.
        </AppAlert>

        <Card glint="quiet" class="wallet-panel statement-panel">
          <section class="statement-hero">
            <div>
              <p class="eyebrow">Full statement</p>
              <h3>Statement</h3>
              <p>{{ formatStatementYearRange() }}</p>
            </div>
            <ReceiptText class="size-5 text-muted-foreground" />
          </section>

          <div class="statement-control-row">
            <label class="statement-year-picker">
              <span>Statement year</span>
              <NativeSelect
                v-model.number="activeStatementYear"
                size="sm"
                aria-label="Statement year"
                class="statement-year-select"
              >
                <NativeSelectOption v-for="year in statementYearOptions" :key="year" :value="year">
                  {{ year }}
                </NativeSelectOption>
              </NativeSelect>
            </label>

            <div class="statement-direction-actions" aria-label="Statement direction filters">
              <Button
                v-for="option in statementDirectionOptions"
                :key="option.value"
                type="button"
                size="sm"
                :variant="activeStatementDirection === option.value ? 'default' : 'secondary'"
                :aria-pressed="activeStatementDirection === option.value"
                @click="activeStatementDirection = option.value"
              >
                <component :is="option.value === 'credit' ? ArrowDownLeft : ArrowUpRight" class="size-4" />
                {{ option.label }}
              </Button>
              <Button
                v-if="activeStatementDirection !== 'all'"
                type="button"
                size="sm"
                variant="ghost"
                @click="activeStatementDirection = 'all'"
              >
                Clear
              </Button>
            </div>
          </div>

          <div class="statement-subtabs" role="tablist" aria-label="Statement categories">
            <Button
              v-for="item in statementTabItems"
              :key="item.value"
              type="button"
              variant="ghost"
              :class="['statement-subtab', { active: activeStatementTab === item.value }]"
              role="tab"
              :aria-selected="activeStatementTab === item.value"
              @click="activeStatementTab = item.value"
            >
              {{ item.label }}
              <Badge variant="secondary" class="statement-subtab-badge">{{ item.badge }}</Badge>
            </Button>
          </div>

          <section v-if="visiblePendingAcceptanceDues.length" class="statement-pending-dues">
            <div class="statement-inline-header">
              <div>
                <p class="eyebrow">Due requests</p>
                <h4>Awaiting acceptance</h4>
              </div>
              <WalletCards class="size-5 text-muted-foreground" />
            </div>
            <div class="statement-pending-list">
              <article v-for="due in visiblePendingAcceptanceDues" :key="due.id" class="statement-row-card statement-row-pending">
                <div class="statement-row-icon warning">
                  <PremiumStatementRowIcon variant="due" />
                </div>
                <div class="statement-row-copy">
                  <strong>{{ due.title }}</strong>
                  <span>{{ due.artistName }} - Due {{ formatDate(due.dueDate) }}</span>
                </div>
                <div class="statement-row-amount">
                  <strong class="amount-negative">{{ formatSignedMoney(Number(due.amount) * -1) }}</strong>
                  <Button
                    type="button"
                    size="sm"
                    :disabled="isViewingAsArtist || acceptingDueId === due.id"
                    @click="acceptDue(due)"
                  >
                    {{ acceptingDueId === due.id ? "Accepting..." : "Accept" }}
                  </Button>
                </div>
              </article>
            </div>
          </section>

          <AppEmptyState
            v-if="!groupedStatementRows.length && !visiblePendingAcceptanceDues.length"
            compact
            icon="money"
            title="No statement activity"
            description="Wallet movement for this year will appear here."
            class="statement-empty-state border-0 bg-transparent shadow-none"
          />

          <div v-else class="statement-group-list">
            <section v-for="group in groupedStatementRows" :key="group.key" class="statement-day-group">
              <h4 class="statement-date-heading">{{ group.label }}</h4>
              <div class="statement-day-card">
                <article v-for="row in group.rows" :key="row.id" class="statement-row-card">
                  <div :class="['statement-row-icon', row.category, Number(row.amount) >= 0 ? 'positive' : 'negative']">
                    <PremiumStatementRowIcon :variant="statementIconVariant(row)" />
                  </div>
                  <div class="statement-row-copy">
                    <strong>{{ row.title }}</strong>
                    <span>{{ row.description }}</span>
                  </div>
                  <div class="statement-row-amount">
                    <strong :class="statementAmountClass(row)">{{ formatSignedMoney(row.amount) }}</strong>
                    <span v-if="row.balanceAfter">Balance {{ formatMoney(row.balanceAfter) }}</span>
                    <span v-else>{{ formatDateTime(row.createdAt) }}</span>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </Card>
      </div>

      <div v-else-if="activeWalletSection === 'payout'" class="payout-3d-scene" id="payout">
        <!-- Success overlay animation -->
        <Transition name="payout-success-overlay">
          <div v-if="payoutSuccessMessage" class="payout-success-overlay" @click="resetPayoutMessages">
            <div class="payout-success-content">
              <div class="payout-success-icon-wrap">
                <div class="payout-success-ring payout-success-ring-1" />
                <div class="payout-success-ring payout-success-ring-2" />
                <div class="payout-success-ring payout-success-ring-3" />
                <div class="payout-success-checkmark">
                  <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
                    <path class="payout-check-path" d="M11 21l6 6 12-14" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </div>
              </div>
              <p class="payout-success-title">Payout Requested</p>
              <p class="payout-success-detail">{{ payoutSuccessMessage }}</p>
              <span class="payout-success-dismiss">Tap anywhere to continue</span>
            </div>
          </div>
        </Transition>

        <Card glint="quiet" class="wallet-panel payout-panel payout-3d-card">
          <div class="panel-header payout-panel-header">
            <div>
              <p class="eyebrow">Payout request</p>
              <h3>Request payout</h3>
              <p>Send a payout request from your available wallet balance.</p>
            </div>
            <div class="payout-hero-icon">
              <div class="payout-hero-icon-glow" />
              <PremiumPayoutIcon class="payout-hero-icon-svg" />
            </div>
          </div>

          <div class="payout-request-grid">
            <form class="payout-form" @submit.prevent="submitPayoutRequest">
              <AppAlert v-if="payoutErrorMessage" variant="destructive">{{ payoutErrorMessage }}</AppAlert>
              <AppAlert v-if="isViewingAsArtist" variant="warning">
                View-as mode is read-only. Payout requests are disabled while an admin is inspecting this dashboard.
              </AppAlert>
              <AppAlert v-if="payoutError" variant="destructive">
                {{ payoutError.statusMessage || "Unable to load payout options right now." }}
                <template #action>
                  <Button variant="secondary" @click="() => refreshPayouts()">Retry</Button>
                </template>
              </AppAlert>

              <DashboardSkeleton v-if="payoutPending && !payoutData" layout="payout-form" :rows="2" />

              <AppEmptyState
                v-else-if="!payoutArtists.length"
                compact
                icon="money"
                title="No payout account"
                description="No artist payout account is available on this login yet."
                class="border-0 bg-transparent shadow-none"
              />

              <template v-else>
                <AppAlert v-if="selectedPayoutArtist?.hasPendingRequest" variant="warning">
                  A pending payout request already exists for this artist. Wait for admin review before requesting another one.
                </AppAlert>

                <AppAlert v-else-if="!hasSelectedPayoutArtistSharePct" variant="warning">
                  Your Naad Music Group deal percentage is not set yet. Ask an admin to set it before requesting payout.
                </AppAlert>

                <AppAlert
                  v-else-if="Number(selectedPayoutArtist?.visibleBalance || 0) < Number(minimumPayoutAmount)"
                  variant="info"
                >
                  Payout requests open once the available balance reaches {{ formatMoney(minimumPayoutAmount) }}.
                </AppAlert>

                <div class="payout-field-grid">
                  <div class="form-field">
                    <label>Artist</label>
                    <div class="wallet-static-field payout-3d-field">
                      {{ selectedPayoutArtist?.artistName || "Artist profile" }}
                    </div>
                  </div>

                  <div class="form-field">
                    <label for="payout-amount">Amount</label>
                    <input
                      id="payout-amount"
                      v-model="payoutForm.amount"
                      class="wallet-input payout-3d-input"
                      type="number"
                      :min="Number(minimumPayoutAmount)"
                      step="0.01"
                      :max="selectedPayoutArtist?.visibleBalance || undefined"
                      placeholder="0.00"
                    >
                  </div>
                </div>

                <div class="form-field">
                  <label for="payout-notes">Notes <span>optional</span></label>
                  <textarea
                    id="payout-notes"
                    v-model="payoutForm.artistNotes"
                    class="wallet-input payout-3d-input"
                    rows="3"
                    placeholder="Add any payout reference or timing note."
                  />
                </div>

                <section class="payout-fees-section" aria-label="Payout fees and deal terms">
                  <div class="payout-fees-header">
                    <div>
                      <p class="eyebrow">Fees</p>
                      <h4>Payout terms</h4>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      :aria-label="isDealVisible ? 'Hide artist deal percentage' : 'Show artist deal percentage'"
                      @click="isDealVisible = !isDealVisible"
                    >
                      <EyeOff v-if="isDealVisible" class="size-4" />
                      <Eye v-else class="size-4" />
                    </Button>
                  </div>

                  <div class="payout-fee-list">
                    <div class="payout-fee-row payout-fee-row-deal">
                      <span>Artist deal</span>
                      <strong v-if="isDealVisible && hasSelectedPayoutArtistSharePct">
                        You have {{ selectedPayoutArtistShareLabel }} artist-share deal with Naad Music Group.
                      </strong>
                      <strong v-else-if="isDealVisible">Deal percentage not set.</strong>
                      <strong v-else>Hidden</strong>
                    </div>
                    <div class="payout-fee-row">
                      <span>Bank transaction fee</span>
                      <strong>1%, covered by Naad Music Group</strong>
                    </div>
                    <div class="payout-fee-row payout-fee-row-owed">
                      <span>We owe you</span>
                      <strong>
                        {{ formatMoney(selectedPayoutArtistOwedAmount) }}
                        <span class="payout-fee-note">(minus transaction fees)</span>
                      </strong>
                    </div>
                    <div class="payout-fee-row">
                      <span>Tipalti payment provider service fee</span>
                      <strong>$5-$25 per transaction</strong>
                    </div>
                  </div>

                  <label class="payout-terms-ack">
                    <input
                      v-model="payoutForm.acknowledgeTerms"
                      type="checkbox"
                      :disabled="!hasSelectedPayoutArtistSharePct || isViewingAsArtist"
                    >
                    <span>{{ payoutTermsAcknowledgementLabel }}</span>
                  </label>
                </section>

                <p class="form-note">
                  Limit: {{ maxRequestsPerWindow }} payout requests in {{ requestWindowHours }} hours per artist account.
                </p>

                <div class="form-actions">
                  <button
                    type="submit"
                    class="premium-box-button premium-box-button-primary payout-submit-btn"
                    :class="{ 'payout-submit-sending': isSubmittingPayout }"
                    :disabled="isSubmittingPayout || !canSubmitPayout"
                  >
                    <span class="payout-submit-label">
                      {{ isSubmittingPayout ? "Sending..." : "Request payout" }}
                    </span>
                    <span class="payout-submit-icon">
                      <ArrowRight class="size-4" />
                    </span>
                    <span v-if="isSubmittingPayout" class="payout-submit-pulse" />
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    @click="activeWalletSection = 'statement'; activeStatementTab = 'payouts'"
                  >
                    View history
                  </Button>
                </div>
              </template>
            </form>
          </div>
        </Card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wallet-page {
  gap: 26px;
}

.wallet-balance-card,
.wallet-panel {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  border-color: var(--surface-border, var(--border));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 3%), var(--card)),
    var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
}

.wallet-balance-card::before,
.wallet-panel::before {
  position: absolute;
  inset: 0 var(--surface-glint-inset, 22px) auto;
  z-index: 0;
  height: 1px;
  background: var(--surface-glint-line);
  content: "";
  opacity: var(--surface-glint-opacity, 0.62);
  pointer-events: none;
}

:global(.dark .wallet-balance-card) {
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
}

:global(.dark .wallet-panel) {
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
}

.wallet-balance-card {
  padding: 18px;
  border-color: var(--surface-border, var(--border));
}

.wallet-balance-layout {
  display: grid;
  grid-template-columns: minmax(250px, 390px) minmax(260px, 1fr);
  gap: 16px;
  align-items: stretch;
}

.wallet-card-engrave-defs {
  position: absolute;
  overflow: hidden;
  width: 0;
  height: 0;
  pointer-events: none;
}

.wallet-credit-card {
  --wallet-card-radius: 18px;
  position: relative;
  isolation: isolate;
  width: 100%;
  max-width: 390px;
  aspect-ratio: 1.586 / 1;
  overflow: hidden;
  border: 1px solid rgb(244 238 223 / 12%);
  border-radius: var(--wallet-card-radius);
  background:
    linear-gradient(180deg, rgb(255 250 235 / 12%), rgb(255 250 235 / 4%)),
    url("/wallet-card-premium-black-gold.webp") center / cover no-repeat,
    #171511;
  background-blend-mode: screen, normal;
  background-clip: padding-box;
  box-shadow:
    0 18px 30px -22px rgb(0 0 0 / 72%),
    0 34px 56px -48px rgb(0 0 0 / 58%),
    0 2px 0 rgb(255 255 255 / 6%),
    inset 0 1px 0 rgb(255 243 202 / 10%),
    inset 0 -1px 0 rgb(0 0 0 / 82%);
  color: #f3f0df;
  transform-style: preserve-3d;
  will-change: transform;
}

.wallet-credit-card::before {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    radial-gradient(105% 70% at 48% 13%, rgb(255 246 218 / 15%), transparent 54%),
    radial-gradient(70% 42% at 82% 86%, rgb(244 220 156 / 12%), transparent 70%),
    linear-gradient(165deg, rgb(255 255 255 / 8%), transparent 24%, transparent 76%, rgb(0 0 0 / 18%));
  content: "";
  mix-blend-mode: screen;
  opacity: 0.54;
  pointer-events: none;
}

.wallet-credit-card::after {
  position: absolute;
  inset: 0;
  z-index: 2;
  background:
    radial-gradient(118% 78% at 42% 8%, rgb(0 0 0 / 4%) 0 44%, rgb(0 0 0 / 16%) 72%, rgb(0 0 0 / 34%) 100%),
    linear-gradient(180deg, rgb(0 0 0 / 4%), rgb(0 0 0 / 10%) 52%, rgb(0 0 0 / 26%) 100%);
  content: "";
  mix-blend-mode: multiply;
  opacity: 0.56;
  pointer-events: none;
}

.wallet-card-grain {
  position: absolute;
  inset: 0;
  z-index: 3;
  background-image:
    radial-gradient(circle, rgb(255 255 255 / 18%) 0 0.25px, transparent 0.65px),
    radial-gradient(circle, rgb(0 0 0 / 22%) 0 0.35px, transparent 0.8px);
  background-position: 0 0, 2px 3px;
  background-size: 4px 4px, 6px 6px;
  mix-blend-mode: overlay;
  opacity: 0.08;
  pointer-events: none;
}

.wallet-card-frame {
  position: absolute;
  inset: 1px;
  z-index: 4;
  overflow: hidden;
  border: 0;
  border-radius: calc(var(--wallet-card-radius) - 2px);
  box-shadow: none;
  pointer-events: none;
}

.wallet-card-frame::before {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: none;
  content: "";
}

.wallet-card-shine {
  position: absolute;
  inset: 0;
  z-index: 5;
  border-radius: inherit;
  filter: blur(7px);
  mix-blend-mode: screen;
  pointer-events: none;
  transition: opacity 220ms var(--ease-out, ease);
}

.wallet-card-inner {
  display: grid !important;
  grid-template-rows: auto auto auto minmax(20px, 1fr) auto !important;
  align-content: stretch !important;
  align-items: stretch !important;
  justify-content: stretch !important;
  justify-items: stretch !important;
  z-index: 6 !important;
  padding: clamp(16px, 1.9vw, 19px) clamp(19px, 2.25vw, 22px) clamp(16px, 1.95vw, 19px) !important;
}

.wallet-card-chip-row {
  display: flex;
  align-items: center;
  min-height: clamp(27px, 3.05vw, 38px);
  margin-top: 0;
  transform: translateZ(18px);
}

.wallet-credit-card .chip-n-contactless {
  gap: clamp(7px, 1.17vw, 9px) !important;
}

.wallet-credit-card .emv-chip {
  width: clamp(29px, 2.6vw, 34px) !important;
  height: clamp(21px, 2vw, 26px) !important;
  border-radius: 5px !important;
  background:
    linear-gradient(145deg, rgb(246 205 78 / 82%) 0%, rgb(119 79 18 / 86%) 45%, rgb(224 177 56 / 78%) 74%, rgb(55 36 8 / 88%) 100%) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 240 162 / 28%),
    inset 0 -1px 1px rgb(0 0 0 / 72%),
    inset 0 0 0 1px rgb(255 220 112 / 20%),
    0 1px 0 rgb(0 0 0 / 62%) !important;
  filter: saturate(0.82) contrast(0.96) brightness(0.86);
}

.wallet-credit-card .chip-inner-pattern {
  width: clamp(13px, 1.3vw, 17px) !important;
  height: clamp(10px, 0.98vw, 12px) !important;
  border-radius: 2px !important;
  border-color: rgb(0 0 0 / 34%) !important;
  background: rgb(255 232 142 / 10%) !important;
}

.wallet-credit-card .contactless-icon {
  color: rgb(238 230 204 / 82%) !important;
  filter: none;
  mix-blend-mode: screen;
  text-shadow:
    0 1px 0 rgb(0 0 0 / 74%),
    0 -1px 0 rgb(255 244 205 / 10%) !important;
}

.wallet-credit-card .contactless-icon svg {
  width: clamp(17px, 1.61vw, 21px) !important;
  height: clamp(17px, 1.61vw, 21px) !important;
  stroke-width: 2.25px !important;
}

.wallet-credit-card .card-naad-logo {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
  opacity: 0.01;
}

.wallet-card-balance-block {
  align-self: start;
  width: max-content;
  max-width: 72%;
  gap: 4px !important;
  margin-top: clamp(28px, 3.8vw, 36px) !important;
  transform: translateZ(20px) !important;
}

.wallet-credit-card .card-balance-label {
  color: rgb(224 186 72 / 88%) !important;
  filter: none;
  font-size: clamp(8px, 0.74vw, 9px) !important;
  font-weight: 720 !important;
  letter-spacing: 0 !important;
  mix-blend-mode: screen;
  text-shadow:
    0 1px 0 rgb(0 0 0 / 78%),
    0 -1px 0 rgb(255 231 142 / 9%) !important;
  text-transform: uppercase !important;
}

.wallet-card-balance-amount {
  color: rgb(246 240 219 / 96%) !important;
  line-height: 0.95 !important;
  filter: none;
  mix-blend-mode: screen;
}

.wallet-card-balance-amount :deep([data-money]) {
  color: rgb(246 240 219 / 96%) !important;
  font-size: clamp(27px, 3vw, 36px);
  letter-spacing: 0 !important;
  text-shadow:
    0 1px 0 rgb(0 0 0 / 82%),
    0 -1px 0 rgb(255 244 205 / 11%),
    0 0 1px rgb(255 240 196 / 6%) !important;
}

.wallet-card-number-layer {
  position: static !important;
  align-self: start;
  width: max-content !important;
  max-width: 100% !important;
  margin-top: clamp(13px, 2.2vw, 18px);
  margin-bottom: clamp(12px, 1.45vw, 16px);
  color: rgb(224 216 194 / 82%) !important;
  filter: none;
  font-size: clamp(10px, 1.25vw, 14px) !important;
  font-weight: 500 !important;
  letter-spacing: 0 !important;
  line-height: 1 !important;
  mix-blend-mode: screen;
  text-align: left !important;
  text-shadow:
    0 1px 0 rgb(0 0 0 / 78%),
    0 -1px 0 rgb(255 244 205 / 10%) !important;
  transform: translateZ(12px) !important;
}

.wallet-card-bottom-row {
  align-self: end;
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  width: 100% !important;
  gap: clamp(10px, 1.9vw, 15px) !important;
  align-items: end !important;
  transform: translateZ(16px) !important;
}

.wallet-credit-card .card-meta-info {
  display: grid !important;
  grid-template-columns: auto auto !important;
  gap: clamp(9px, 1.55vw, 12px) !important;
  align-items: end !important;
  justify-self: end !important;
}

.wallet-credit-card .card-holder-info {
  display: grid !important;
  gap: 4px !important;
  line-height: 1.05 !important;
  padding-right: clamp(8px, 1.5vw, 12px) !important;
}

.wallet-credit-card .card-valid-thru {
  display: grid !important;
  gap: 4px !important;
  line-height: 1.05 !important;
}

.wallet-credit-card .card-holder-name {
  color: rgb(240 234 214 / 92%) !important;
  filter: none;
  font-size: clamp(9px, 0.92vw, 11px) !important;
  max-width: min(156px, 34vw) !important;
  letter-spacing: 0.015em !important;
  mix-blend-mode: screen;
  text-shadow:
    0 1px 0 rgb(0 0 0 / 78%),
    0 -1px 0 rgb(255 244 205 / 9%) !important;
}

.wallet-credit-card .card-label {
  color: rgb(224 186 72 / 84%) !important;
  filter: none;
  font-size: clamp(7px, 0.68vw, 8px) !important;
  line-height: 1.05 !important;
  mix-blend-mode: screen;
  text-shadow:
    0 1px 0 rgb(0 0 0 / 78%),
    0 -1px 0 rgb(255 231 142 / 9%) !important;
  text-transform: uppercase !important;
}

.wallet-credit-card .card-expiry {
  color: rgb(240 234 214 / 92%) !important;
  filter: none;
  font-size: clamp(8px, 0.82vw, 10px) !important;
  mix-blend-mode: screen;
  text-shadow:
    0 1px 0 rgb(0 0 0 / 78%),
    0 -1px 0 rgb(255 244 205 / 9%) !important;
}

.wallet-card-network-logo {
  position: relative;
  justify-content: flex-end !important;
  width: clamp(23px, 2.42vw, 29px);
  min-width: clamp(23px, 2.42vw, 29px);
  aspect-ratio: 2118 / 1118;
  transform: translateZ(16px);
}

.wallet-card-network-logo::before,
.wallet-card-network-logo::after {
  position: absolute;
  inset: 0;
  display: block;
  content: "";
  mask: url("/naadlogo.png") center / contain no-repeat;
  pointer-events: none;
}

.wallet-card-network-logo::before {
  z-index: 0;
  background: rgb(0 0 0 / 72%);
  filter: blur(0.15px);
  transform: translate(0.65px, 0.8px);
}

.wallet-card-network-logo::after {
  z-index: 1;
  background:
    linear-gradient(145deg, rgb(244 210 112 / 86%), rgb(205 169 84 / 78%));
  filter: none;
  mix-blend-mode: normal;
  opacity: 0.92;
  transform: translate(-0.35px, -0.45px);
}

.metric-label,
.balance-stat span {
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
  font-weight: var(--text-caption-weight);
  letter-spacing: 0;
  line-height: var(--text-caption-line-height);
  text-transform: uppercase;
}

.balance-primary .metric-label {
  white-space: nowrap;
}

.wallet-balance-card :deep([data-money]),
.wallet-panel :deep([data-money]) {
  letter-spacing: 0;
}

.balance-stat-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(78px, auto);
  align-self: center;
  gap: 14px;
}

/* Pending money reads as "uncleared funds" — present but not yet yours */
.balance-stat-uncleared strong {
  color: color-mix(in srgb, var(--foreground) 62%, var(--muted-foreground));
}

.balance-stat-note {
  color: var(--muted-foreground);
  font-size: 10.5px;
  font-style: italic;
  line-height: 1.2;
}

.balance-stat {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  gap: 6px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, var(--foreground) 6%);
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background:
    radial-gradient(120% 120% at 16% 0%, color-mix(in srgb, white 54%, transparent), transparent 44%),
    linear-gradient(145deg, color-mix(in srgb, var(--card) 96%, white 4%), color-mix(in srgb, var(--surface-muted, var(--muted)) 42%, var(--card)));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 74%),
    inset 0 -1px 0 rgb(72 68 61 / 5%),
    14px 18px 30px -18px rgb(72 68 61 / 34%),
    -9px -9px 22px -16px rgb(255 255 255 / 76%);
  padding: 14px;
  translate: 0 -2px;
}

.balance-stat::before {
  position: absolute;
  inset: 0 0 auto;
  z-index: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--foreground) 10%, transparent), transparent);
  content: "";
  pointer-events: none;
}

.balance-stat > * {
  position: relative;
  z-index: 1;
}

:global(.dark .wallet-balance-card .balance-stat) {
  border-color: rgb(244 238 223 / 16%);
  background:
    radial-gradient(120% 120% at 16% 0%, rgb(254 249 231 / 7%), transparent 44%),
    linear-gradient(145deg, rgb(40 37 32 / 92%), rgb(18 17 15 / 94%));
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 12%),
    inset 0 -1px 0 rgb(0 0 0 / 38%),
    16px 20px 34px -18px rgb(0 0 0 / 96%),
    -8px -8px 22px -17px rgb(254 249 231 / 17%);
}

:global(.dark .wallet-balance-card .balance-stat::before) {
  background:
    linear-gradient(128deg, transparent 0 40%, rgb(232 238 245 / 3.2%) 48%, transparent 62%),
    linear-gradient(145deg, rgb(232 238 245 / 1.8%), transparent 50%),
    radial-gradient(circle at 18% 0%, rgb(232 238 245 / 2.4%), transparent 38%);
  opacity: 0.46;
}

.balance-stat strong {
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

:global(.dark .wallet-balance-card .balance-stat span) {
  color: rgb(202 193 176 / 92%);
}

.wallet-section-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.statement-section-stack,
.dues-section-stack {
  display: grid;
  gap: 16px;
}

.wallet-panel {
  display: grid;
  align-content: start;
  align-self: start;
  gap: 20px;
  padding: 24px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.panel-header h3 {
  margin: 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: var(--text-section-title-size);
  font-weight: var(--text-section-title-weight);
  letter-spacing: 0;
}

.statement-panel {
  gap: 18px;
}

.statement-hero,
.statement-control-row,
.statement-inline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.statement-hero {
  align-items: flex-start;
}

.statement-hero h3 {
  margin: 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: var(--text-section-title-size);
  font-weight: var(--text-section-title-weight);
  line-height: var(--text-section-title-line-height);
  letter-spacing: 0;
}

.statement-hero p:not(.eyebrow) {
  margin: 6px 0 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.45;
}

.statement-control-row {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
}

.statement-year-picker {
  display: grid;
  gap: 6px;
  min-width: min(220px, 100%);
}

.statement-year-picker span {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  text-transform: uppercase;
}

.statement-year-select {
  min-width: 180px;
}

.statement-direction-actions,
.statement-subtabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.statement-direction-actions {
  justify-content: flex-end;
  margin-left: auto;
}

.statement-subtabs {
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 84%, var(--muted) 16%);
  padding: 6px;
}

.statement-subtab {
  position: relative;
  min-height: 38px;
  border-radius: var(--surface-radius-compact, 10px);
  color: var(--muted-foreground);
  padding-inline: 10px;
}

.statement-subtab.active {
  background: color-mix(in srgb, var(--priority) 10%, var(--card));
  color: var(--foreground);
}

.statement-subtab::after {
  display: none;
}

.statement-subtab-badge {
  min-width: 22px;
  height: 22px;
  border-radius: 999px;
  font-family: var(--font-app-mono);
  font-variant-numeric: tabular-nums;
}

.statement-pending-dues {
  display: grid;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--status-warning) 7%, var(--card));
  padding: 14px;
}

.statement-inline-header h4 {
  margin: 2px 0 0;
  color: var(--foreground);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
}

.statement-pending-list,
.statement-group-list {
  display: grid;
  gap: 14px;
}

.statement-day-group {
  display: grid;
  gap: 8px;
}

.statement-date-heading {
  margin: 0;
  color: var(--foreground);
  font-size: 18px;
  font-weight: 760;
  letter-spacing: 0;
}

.statement-day-card {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent);
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 94%, var(--muted) 6%);
  box-shadow: var(--surface-card-shadow-current, var(--surface-depth-data, var(--shadow-card)));
}

.statement-row-card {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) minmax(128px, auto);
  gap: 12px;
  align-items: center;
  min-width: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
  background: transparent;
  padding: 14px;
  box-shadow: var(--surface-depth-flat);
}

.statement-day-card .statement-row-card:last-child {
  border-bottom: 0;
}

.statement-row-pending {
  border: 1px solid color-mix(in srgb, var(--status-warning) 24%, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 88%, var(--status-warning) 6%);
  box-shadow: var(--surface-depth-edge, none);
}

.statement-row-icon {
  --statement-icon-color: var(--muted-foreground);
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--statement-icon-color);
  background: none;
  border: 0;
  box-shadow: none;
  overflow: visible;
}

.statement-row-icon :deep(.premium-statement-icon) {
  width: 25px;
  height: 25px;
}

.statement-row-icon.positive {
  --statement-icon-color: #059669;
}

.statement-row-icon.balance.positive {
  --statement-icon-color: #047857;
}

.statement-row-icon.negative,
.statement-row-icon.warning {
  --statement-icon-color: color-mix(in srgb, var(--status-warning) 88%, #5f2e03);
}

.statement-row-icon.dues,
.statement-row-icon.warning {
  --statement-icon-color: color-mix(in srgb, var(--status-warning) 90%, #8a2c0d);
}

.statement-row-icon.payouts {
  --statement-icon-color: #b7791f;
}

.statement-row-icon.adjustments {
  --statement-icon-color: color-mix(in srgb, var(--primary) 82%, var(--foreground));
}

:global(.dark .statement-row-icon) {
  background: none;
  box-shadow: none;
}

:global(.dark .statement-row-icon.positive) {
  --statement-icon-color: #34d399;
}

:global(.dark .statement-row-icon.balance.positive) {
  --statement-icon-color: #34d399;
}

:global(.dark .statement-row-icon.payouts) {
  --statement-icon-color: #f4b740;
}

.statement-row-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.statement-row-copy strong {
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.statement-row-copy span {
  overflow-wrap: anywhere;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.45;
}

.statement-row-amount {
  display: grid;
  gap: 4px;
  justify-items: end;
  min-width: 0;
  text-align: right;
}

.statement-row-amount strong {
  font-size: 16px;
  font-weight: 760;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  white-space: nowrap;
}

.statement-row-amount span {
  color: var(--muted-foreground);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.statement-empty-state {
  min-height: 220px;
}

.activity-list {
  display: grid;
  gap: 10px;
}

.activity-row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  padding: 12px;
  background: color-mix(in srgb, var(--card) 90%, var(--muted) 10%);
}

:global(.dark .activity-row) {
  background: color-mix(in srgb, var(--muted) 18%, var(--card));
}

.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: none;
}

.activity-dot.positive {
  background: var(--status-success);
  box-shadow: none;
}

.activity-dot.negative {
  background: var(--status-warning);
  box-shadow: none;
}

.activity-copy,
.table-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.activity-copy strong,
.table-copy strong {
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 14px;
  font-weight: 650;
}

.activity-copy span,
.table-copy span,
.form-note {
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.45;
}

.activity-time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.amount-positive {
  color: var(--status-success);
}

.amount-negative {
  color: var(--status-warning);
}

.payout-panel {
  gap: 24px;
}

.payout-panel-header {
  align-items: flex-start;
}

.payout-panel-header p:not(.eyebrow) {
  margin: 6px 0 0;
  max-width: 520px;
  color: var(--muted-foreground);
  font-size: 14px;
  line-height: 1.5;
}

.payout-request-grid {
  display: grid;
  grid-template-columns: minmax(0, 760px);
  gap: 18px;
  align-items: start;
}

/* â”€â”€ 3D Scene Container â”€â”€ */
.payout-3d-scene {
  position: relative;
}

/* â”€â”€ 3D Card â”€â”€ */
.payout-3d-card {
  animation: payout-card-enter 220ms var(--ease-out) both;
}

@keyframes payout-card-enter {
  from {
    opacity: 0;
    transform: perspective(800px) rotateX(4deg) translateY(18px);
  }
  to {
    opacity: 1;
    transform: perspective(800px) rotateX(0deg) translateY(0);
  }
}

/* â”€â”€ Hero Icon with Floating Glow â”€â”€ */
.payout-hero-icon {
  position: relative;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
}

.payout-hero-icon-svg {
  position: relative;
  z-index: 1;
  width: 28px;
  height: 28px;
  color: var(--priority);
  filter: none;
}

.payout-hero-icon-glow {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--priority) 16%, transparent) 0%,
    color-mix(in srgb, var(--priority) 6%, transparent) 50%,
    transparent 70%
  );
  opacity: 0.38;
}

/* â”€â”€ Sidebar Layout â”€â”€ */
/* â”€â”€ Credit Card (3D Wallet) â”€â”€ */
/* â”€â”€ Credit Card (3D Wallet Override - forced premium dark theme) â”€â”€ */
/* Specular shine layer */
/* Credit Card Interior Layout */
:global(.credit-card-inner) {
  position: relative !important;
  z-index: 3 !important;
  width: 100% !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: space-between !important;
  padding: 20px !important;
  box-sizing: border-box !important;
}

/* Top Row: EMV Chip + Contactless + Logo */
:global(.card-top-row) {
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
  width: 100% !important;
  height: 36px !important;
}

:global(.chip-n-contactless) {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}

/* Realistic CSS EMV Chip */
:global(.emv-chip) {
  position: relative !important;
  width: 38px !important;
  height: 28px !important;
  background: linear-gradient(135deg, #dfba53 0%, #c49a30 50%, #dfba53 100%) !important;
  border-radius: 5px !important;
  border: 1px solid rgba(0, 0, 0, 0.15) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 1px 2px rgba(0, 0, 0, 0.1) !important;
  overflow: hidden !important;
}

:global(.emv-chip::before) {
  content: '' !important;
  position: absolute !important;
  inset: 0 !important;
  background: repeating-linear-gradient(0deg, transparent, transparent 4px, rgba(0, 0, 0, 0.08) 4px, rgba(0, 0, 0, 0.08) 5px),
              repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(0, 0, 0, 0.08) 5px, rgba(0, 0, 0, 0.08) 6px) !important;
}

:global(.chip-inner-pattern) {
  position: absolute !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  width: 18px !important;
  height: 14px !important;
  border: 1px solid rgba(0, 0, 0, 0.15) !important;
  border-radius: 3px !important;
  background: rgba(255, 255, 255, 0.15) !important;
}

:global(.contactless-icon) {
  color: rgba(255, 255, 255, 0.85) !important;
  display: flex !important;
  align-items: center !important;
}

:global(.card-logo-container) {
  display: flex !important;
  align-items: center !important;
}

:global(.card-naad-logo) {
  height: 32px !important;
  width: auto !important;
  object-fit: contain !important;
  filter: brightness(1.1) contrast(1.05) !important;
}

/* Middle Row: Balance Display */
:global(.card-balance-block) {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  margin-top: 4px !important;
  transform: translateZ(20px) !important;
}

:global(.card-balance-label) {
  font-size: 10px !important;
  font-weight: 650 !important;
  letter-spacing: 0 !important;
  color: rgba(232, 192, 40, 0.8) !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2) !important;
}

:global(.card-balance-amount) {
  display: flex !important;
  align-items: baseline !important;
  color: #f2f3ea !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3) !important;
}

/* Force children of .card-balance-amount to be ivory, ignoring light-mode text-color overrides */
:global(.card-balance-amount),
:global(.card-balance-amount *),
:global(.card-balance-amount .money-value),
:global(.card-balance-amount .money-value *),
:global(.card-balance-amount .money-integer),
:global(.card-balance-amount .money-currency),
:global(.card-balance-amount .money-decimal) {
  color: #f2f3ea !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.4) !important;
}

/* Bottom Row: Cardholder Name + Expiry */
:global(.card-bottom-row) {
  display: flex !important;
  justify-content: space-between !important;
  align-items: flex-end !important;
  width: 100% !important;
  transform: translateZ(15px) !important;
}

:global(.card-holder-info) {
  display: flex !important;
  flex-direction: column !important;
  gap: 3px !important;
  min-width: 0 !important;
  flex: 1 !important;
  padding-right: 12px !important;
}

:global(.card-label) {
  font-size: 8px !important;
  font-weight: 650 !important;
  letter-spacing: 0 !important;
  color: rgba(232, 192, 40, 0.6) !important;
}

:global(.card-holder-name) {
  font-size: 13px !important;
  font-weight: 600 !important;
  letter-spacing: 0.03em !important;
  text-transform: uppercase !important;
  color: #f2f3ea !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
}

:global(.card-meta-info) {
  display: flex !important;
  align-items: flex-end !important;
  gap: 16px !important;
}

:global(.card-valid-thru) {
  display: flex !important;
  flex-direction: column !important;
  gap: 3px !important;
}

:global(.card-expiry) {
  font-size: 12px !important;
  font-weight: 650 !important;
  font-variant-numeric: tabular-nums !important;
  color: #f2f3ea !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
}

:global(.card-network-badge) {
  background: rgba(232, 192, 40, 0.08) !important;
  border: 1px solid rgba(232, 192, 40, 0.2) !important;
  border-radius: 4px !important;
  padding: 3px 6px !important;
  display: flex !important;
  align-items: center !important;
}

:global(.card-elite-text) {
  font-size: 9px !important;
  font-weight: 700 !important;
  letter-spacing: 0 !important;
  color: #e8c028 !important;
  text-transform: uppercase !important;
}

/* Embossed Card Number Background Layer (very subtle luxury feel) */
:global(.card-number-layer) {
  position: absolute !important;
  left: 20px !important;
  bottom: 60px !important;
  font-family: var(--font-mono) !important;
  font-size: 14px !important;
  letter-spacing: 0 !important;
  color: rgba(242, 243, 234, 0.07) !important;
  pointer-events: none !important;
  font-weight: 600 !important;
  user-select: none !important;
}

/* â”€â”€ Payout Metrics Container (below card) â”€â”€ */
/* â”€â”€ Payout Form â”€â”€ */
.wallet-credit-card .emv-chip {
  background:
    linear-gradient(145deg, rgb(255 224 112 / 88%) 0%, rgb(165 122 42 / 82%) 45%, rgb(239 198 85 / 84%) 74%, rgb(91 68 24 / 80%) 100%) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 240 162 / 28%),
    inset 0 -1px 1px rgb(0 0 0 / 72%),
    inset 0 0 0 1px rgb(255 220 112 / 20%),
    0 1px 0 rgb(0 0 0 / 62%) !important;
  filter: saturate(0.95) contrast(1.02) brightness(1.06) !important;
}

.wallet-credit-card .contactless-icon {
  color: rgb(241 233 207 / 86%) !important;
  filter: none !important;
  mix-blend-mode: screen !important;
  text-shadow:
    0 1px 0 rgb(0 0 0 / 70%),
    0 -1px 0 rgb(255 244 205 / 16%) !important;
}

.wallet-credit-card .card-naad-logo {
  filter: none !important;
  opacity: 0.01 !important;
}

.wallet-credit-card .card-balance-label,
.wallet-credit-card .card-label {
  color: rgb(232 194 84 / 92%) !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  text-shadow:
    0 1px 1px rgb(0 0 0 / 52%),
    0 0 8px rgb(255 232 142 / 10%) !important;
}

.wallet-credit-card .card-balance-amount,
.wallet-credit-card .card-balance-amount *,
.wallet-credit-card .card-balance-amount :deep(*) {
  color: rgb(248 242 222 / 98%) !important;
  text-shadow:
    0 1px 2px rgb(0 0 0 / 46%),
    0 0 10px rgb(255 244 205 / 8%) !important;
}

.wallet-credit-card .card-balance-amount {
  filter: none !important;
  mix-blend-mode: normal !important;
}

.wallet-credit-card .wallet-card-number-layer {
  color: rgb(232 224 202 / 88%) !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  text-shadow:
    0 1px 2px rgb(0 0 0 / 48%) !important;
}

.wallet-credit-card .card-holder-name,
.wallet-credit-card .card-expiry {
  color: rgb(244 238 220 / 96%) !important;
  filter: none !important;
  mix-blend-mode: normal !important;
  text-shadow:
    0 1px 2px rgb(0 0 0 / 48%) !important;
}

.payout-form {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.payout-field-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 0.55fr);
  gap: 14px;
}

.form-field {
  display: grid;
  gap: 7px;
}

.form-field label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
}

.form-field label span {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 500;
}

/* â”€â”€ 3D Enhanced Inputs â”€â”€ */
.payout-fees-section {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  gap: 14px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  padding: 16px;
  background: color-mix(in srgb, var(--card) 90%, var(--muted) 10%);
}

.payout-fees-section::before {
  position: absolute;
  inset: 0 24px auto;
  z-index: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--surface-glint-tone, var(--foreground)) 12%, transparent), transparent);
  content: "";
  opacity: 0.54;
  pointer-events: none;
}

.payout-fees-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.payout-fees-header h4 {
  margin: 2px 0 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: var(--text-section-title-size);
  font-weight: var(--text-section-title-weight);
  letter-spacing: 0;
}

.payout-fee-list {
  display: grid;
  gap: 8px;
}

.payout-fee-row {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
  align-items: start;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 62%, transparent);
  font-size: var(--text-body-size);
  padding-bottom: 8px;
}

.payout-fee-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.payout-fee-row span,
.payout-terms-ack span {
  color: var(--muted-foreground);
}

.payout-fee-row strong {
  color: var(--foreground);
  font-weight: 680;
  line-height: 1.35;
}

.payout-fee-row-deal strong {
  color: color-mix(in srgb, var(--priority, var(--primary)) 78%, var(--foreground));
}

.payout-fee-row-owed {
  border-top: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
  padding-top: 10px;
  margin-top: 2px;
}

.payout-fee-row-owed strong {
  color: color-mix(in srgb, #15803d 78%, var(--foreground));
  font-size: 14px;
}

.payout-fee-note {
  color: #dc2626;
}

.bank-charge-rate {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
}

.payout-terms-ack {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  padding-top: 12px;
  font-size: 13px;
  line-height: 1.45;
}

.payout-terms-ack input {
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  accent-color: var(--primary);
}

.wallet-input {
  width: 100%;
  min-height: 46px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: var(--surface-radius-compact, 10px);
  background: color-mix(in srgb, var(--card) 86%, var(--muted) 14%);
  color: var(--foreground);
  padding: 10px 12px;
  font: inherit;
  line-height: 1.4;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.payout-3d-input:focus {
  border-color: color-mix(in srgb, var(--priority) 52%, var(--border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--priority) 10%, transparent),
    var(--surface-control-shadow, none);
}

:global(.dark) .payout-3d-input:focus {
  border-color: color-mix(in srgb, var(--priority) 36%, var(--border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--priority) 8%, transparent),
    0 6px 16px -6px color-mix(in srgb, var(--priority) 12%, transparent);
}

:global(.dark .wallet-input) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent);
  background: color-mix(in srgb, var(--surface-glass, var(--card)) 78%, #0a0a0a 22%);
  box-shadow: none;
}

.wallet-static-field {
  display: flex;
  align-items: center;
  min-height: 46px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: var(--surface-radius-compact, 10px);
  background: color-mix(in srgb, var(--card) 86%, var(--muted) 14%);
  color: var(--foreground);
  padding: 10px 12px;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.35;
}

.payout-3d-field {
  box-shadow: var(--surface-control-shadow, none);
}

:global(.dark .wallet-static-field) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  background: color-mix(in srgb, var(--surface-glass, var(--card)) 74%, #0a0a0a 26%);
  box-shadow: none;
}

:global(.dark) .payout-3d-field {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    0 2px 8px -3px rgba(0, 0, 0, 0.4);
}

.wallet-input:focus {
  border-color: color-mix(in srgb, var(--primary) 72%, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 12%, transparent);
}

textarea.wallet-input {
  min-height: 94px;
  resize: vertical;
}

.form-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* â”€â”€ Premium Submit Button â”€â”€ */
.payout-submit-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 22px;
  border-radius: 12px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 650;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  transition: box-shadow 0.15s ease, opacity 0.15s ease;
}

.payout-submit-btn:hover:not(:disabled) {
  transform: translateZ(0);
}

.payout-submit-btn:active:not(:disabled) {
  transform: translateY(0) translateZ(0);
}

.payout-submit-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.payout-submit-label {
  position: relative;
  z-index: 1;
}

.payout-submit-icon {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  transition: transform 0.2s var(--ease-out);
}

.payout-submit-btn:hover:not(:disabled) .payout-submit-icon {
  transform: translateX(3px);
}

/* Sending state â€” pulsing overlay */
.payout-submit-sending {
  pointer-events: none;
}

.payout-submit-pulse {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--priority) 22%, transparent) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: payout-pulse-sweep 1.2s ease-in-out infinite;
}

@keyframes payout-pulse-sweep {
  0% { background-position: -100% 0; }
  100% { background-position: 200% 0; }
}

/* â”€â”€ Success Overlay â”€â”€ */
.payout-success-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--background) 86%, transparent);
  backdrop-filter: blur(12px) saturate(1.2);
  cursor: pointer;
}

.payout-success-content {
  display: grid;
  gap: 14px;
  justify-items: center;
  text-align: center;
  padding: 40px;
  animation: payout-success-pop 500ms var(--ease-out) both;
}

@keyframes payout-success-pop {
  from {
    opacity: 0;
    transform: scale(0.85) translateY(12px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.payout-success-icon-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  display: grid;
  place-items: center;
}

.payout-success-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--priority);
  opacity: 0;
}

.payout-success-ring-1 {
  animation: payout-ring-expand 700ms 100ms var(--ease-out) forwards;
}

.payout-success-ring-2 {
  animation: payout-ring-expand 700ms 250ms var(--ease-out) forwards;
}

.payout-success-ring-3 {
  animation: payout-ring-expand 700ms 400ms var(--ease-out) forwards;
}

@keyframes payout-ring-expand {
  0% {
    opacity: 0.7;
    transform: scale(0.4);
  }
  100% {
    opacity: 0;
    transform: scale(1.8);
  }
}

/* Gold-record certification stamp: a foil disc with vinyl grooves, pressed
   into place with an impact + glow burst. The check draws on after the press. */
.payout-success-checkmark {
  position: relative;
  z-index: 1;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background:
    repeating-radial-gradient(
      circle at 50% 50%,
      color-mix(in srgb, var(--priority-foreground) 20%, transparent) 0 1px,
      transparent 1px 3px
    ),
    radial-gradient(circle at 38% 32%, color-mix(in srgb, var(--gold-100, #ffe9a3) 80%, var(--priority)) 0%, var(--priority) 46%),
    var(--priority);
  color: var(--priority-foreground);
  display: grid;
  place-items: center;
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--gold-100, #ffe9a3) 50%, transparent),
    0 4px 16px -4px color-mix(in srgb, var(--priority) 40%, transparent),
    0 12px 32px -10px color-mix(in srgb, var(--priority) 24%, transparent);
  animation:
    payout-stamp-press 520ms 120ms var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1)) both,
    payout-stamp-glow 900ms 320ms var(--ease-out) both;
}

@keyframes payout-stamp-press {
  0% { opacity: 0; transform: scale(1.9) rotateZ(-12deg); }
  55% { opacity: 1; transform: scale(0.88) rotateZ(2deg); }
  100% { opacity: 1; transform: scale(1) rotateZ(0deg); }
}

@keyframes payout-stamp-glow {
  0% { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--gold-100, #ffe9a3) 50%, transparent), 0 0 0 0 color-mix(in srgb, var(--priority) 60%, transparent); }
  40% { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--gold-100, #ffe9a3) 70%, transparent), 0 0 36px 10px color-mix(in srgb, var(--priority) 38%, transparent); }
  100% { box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--gold-100, #ffe9a3) 50%, transparent), 0 4px 16px -4px color-mix(in srgb, var(--priority) 40%, transparent), 0 12px 32px -10px color-mix(in srgb, var(--priority) 24%, transparent); }
}

.payout-success-checkmark svg {
  width: 28px;
  height: 28px;
}

.payout-check-path {
  stroke-dasharray: 40;
  stroke-dashoffset: 40;
  animation: payout-draw-check 500ms 350ms var(--ease-out) forwards;
}

@keyframes payout-check-enter {
  from {
    opacity: 0;
    transform: scale(0.5) rotateZ(-8deg);
  }
  to {
    opacity: 1;
    transform: scale(1) rotateZ(0deg);
  }
}

@keyframes payout-draw-check {
  to {
    stroke-dashoffset: 0;
  }
}

.payout-success-title {
  margin: 0;
  color: var(--foreground);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0;
}

.payout-success-detail {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 15px;
  font-weight: 500;
  max-width: 280px;
}

.payout-success-dismiss {
  margin-top: 8px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 500;
  opacity: 0.6;
}

/* â”€â”€ Overlay transition â”€â”€ */
.payout-success-overlay-enter-active {
  transition: opacity 300ms ease;
}

.payout-success-overlay-leave-active {
  transition: opacity 250ms ease;
}

.payout-success-overlay-enter-from,
.payout-success-overlay-leave-to {
  opacity: 0;
}

.payout-empty-state {
  min-height: 260px;
  background: color-mix(in srgb, var(--muted) 28%, transparent);
}

/* â”€â”€ Reduced Motion â”€â”€ */
@media (prefers-reduced-motion: reduce) {
  .payout-3d-card {
    animation: none;
  }

  .payout-hero-icon-svg,
  .payout-hero-icon-glow {
    animation: none;
  }

  .wallet-tilt-card,
  .wallet-credit-card {
    transform: none !important;
    transition: none !important;
  }

  .payout-submit-pulse {
    animation: none;
  }

  .payout-success-content,
  .payout-success-checkmark,
  .payout-check-path,
  .payout-success-ring {
    animation: none;
    opacity: 1;
    transform: none;
    stroke-dashoffset: 0;
  }
}

@media (max-width: 980px) {
  .wallet-balance-card,
  .wallet-balance-layout,
  .wallet-section-grid,
  .payout-request-grid {
    grid-template-columns: 1fr;
  }

  .wallet-credit-card {
    justify-self: center;
  }

  .balance-stat-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .wallet-balance-card,
  .wallet-panel {
    padding: 20px;
  }

  .wallet-balance-layout {
    gap: 14px;
  }

  .wallet-credit-card {
    --wallet-card-radius: 14px;
  }

  .wallet-card-inner {
    padding: 15px 16px !important;
  }

  .wallet-card-bottom-row {
    gap: 8px !important;
  }

  .wallet-credit-card .card-holder-info {
    padding-right: 6px !important;
  }

  .wallet-credit-card .card-meta-info {
    gap: 6px !important;
  }

  .wallet-credit-card .card-label {
    font-size: 7px !important;
  }

  .wallet-credit-card .card-expiry {
    font-size: 9px !important;
  }

  .wallet-credit-card .card-holder-name {
    max-width: 112px !important;
    font-size: 9px !important;
  }

  .wallet-card-network-logo {
    width: 21px;
    min-width: 21px;
  }

  .wallet-credit-card .card-naad-logo {
    height: 100% !important;
  }

  .wallet-card-number-layer {
    position: static !important;
    font-size: 9px !important;
    letter-spacing: 0 !important;
    margin-bottom: 11px !important;
  }

  .balance-stat-grid,
  .payout-field-grid,
  .payout-fee-row {
    grid-template-columns: 1fr;
  }

  .statement-control-row,
  .statement-inline-header {
    align-items: stretch;
    flex-direction: column;
  }

  .statement-hero {
    align-items: flex-start;
  }

  .statement-year-picker,
  .statement-year-select,
  .statement-direction-actions,
  .statement-subtabs {
    width: 100%;
  }

  .statement-direction-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-left: 0;
  }

  .statement-subtabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .statement-direction-actions > *,
  .statement-subtabs > * {
    width: 100%;
  }

  .statement-subtab {
    justify-content: center;
  }

  .statement-row-card {
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: start;
    padding: 12px;
  }

  .statement-row-amount {
    grid-column: 2;
    justify-items: start;
    text-align: left;
  }

  .activity-row {
    grid-template-columns: 10px minmax(0, 1fr);
  }

  .activity-row > strong {
    grid-column: 2;
  }

  .payout-hero-icon {
    display: none;
  }
}
</style>
