<script setup lang="ts">
import {
  ArrowRight,
  Clock3,
  History,
  ReceiptText,
  WalletCards,
} from "lucide-vue-next"
import { Card } from "@/components/ui/card"
import PremiumPayoutIcon from "~/components/icons/PremiumPayoutIcon.vue"
import PremiumWalletIcon from "~/components/icons/PremiumWalletIcon.vue"
import type { ArtistDueItem, ArtistWalletResponse } from "~~/types/dashboard"
import {
  MIN_PAYOUT_AMOUNT,
  type ArtistPayoutsResponse,
  type PayoutRequestRecord,
  type PayoutRequestStatus,
} from "~~/types/payouts"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

type WalletSection = "overview" | "dues" | "payout" | "history"
type TableAlign = "left" | "center" | "right"

interface WalletTableColumn {
  key: string
  label: string
  align?: TableAlign
  accessor?: (row: any) => unknown
  sortable?: boolean
  searchable?: boolean
}

const walletSectionValues: WalletSection[] = ["overview", "dues", "payout", "history"]
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

const route = useRoute()
const router = useRouter()
const { activeArtistId, activeArtist } = useActiveArtist()
const { viewer } = useViewerContext()
const { confirmAction } = useConfirmAction()
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))
const artistScopeQuery = computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined))

const {
  data: walletData,
  error: walletError,
  pending: walletPending,
  refresh: refreshWallet,
} = useLazyFetch<ArtistWalletResponse>("/api/dashboard/wallet", {
  query: artistScopeQuery,
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
      dues: [],
    }
  )
})
const payoutArtists = computed(() => payoutData.value?.artists ?? [])
const payoutRequests = computed(() => payoutData.value?.requests ?? [])
const minimumPayoutAmount = computed(() => payoutData.value?.minimumAmount ?? MIN_PAYOUT_AMOUNT.toFixed(8))
const requestWindowHours = computed(() => payoutData.value?.requestWindowHours ?? 24)
const maxRequestsPerWindow = computed(() => payoutData.value?.maxRequestsPerWindow ?? 3)
const recentWalletActivity = computed(() => wallet.value.recentTransactions.slice(0, 8))
const pendingAcceptanceDues = computed(() => wallet.value.dues.filter((due) => due.status === "pending_acceptance"))
const dueHistory = computed(() => wallet.value.dues.filter((due) => due.status === "paid" || due.status === "cancelled"))
const payoutForm = reactive({
  artistId: "",
  amount: "",
  artistNotes: "",
})
const isSubmittingPayout = ref(false)
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

const balanceTilt = createCardTiltState({ maxTilt: 6, perspective: 900, scale: 1.012 })
const balanceTiltStyle = balanceTilt.cardStyle
const balanceShineStyle = balanceTilt.shineStyle

const activeWalletSection = computed<WalletSection>({
  get: () => normalizeWalletSection(route.query.section),
  set: (value) => {
    const query = { ...route.query }

    if (value === "overview") {
      delete query.section
    } else {
      query.section = value
    }

    void router.replace({ query })
  },
})
const walletSections = computed(() => [
  {
    label: "Balance",
    value: "overview",
    badge: recentWalletActivity.value.length || "",
  },
  {
    label: "Dues and fees",
    value: "dues",
    badge: pendingAcceptanceDues.value.length || "",
  },
  {
    label: "Request payout",
    value: "payout",
    badge: payoutArtists.value.some((artist) => artist.hasPendingRequest) ? "Pending" : "",
  },
  {
    label: "Payout history",
    value: "history",
    badge: payoutRequests.value.length || "",
  },
])
const walletStats = computed(() => [
  {
    label: "Total balance to date",
    value: wallet.value.totalEarned,
  },
  {
    label: "Dues",
    value: wallet.value.totalDues,
  },
  {
    label: "Pending payouts",
    value: wallet.value.pendingPayouts,
  },
  {
    label: "Withdrawn",
    value: wallet.value.totalWithdrawn,
  },
])
const walletCardholderName = computed(() => (
  activeArtist.value?.name
  || payoutArtists.value[0]?.artistName
  || viewer.value.profile?.fullName
  || "Naad Artist"
))
const selectedPayoutArtist = computed(() => payoutArtists.value.find((artist) => artist.artistId === payoutForm.artistId) ?? null)
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
    && amount <= Number(selectedPayoutArtist.value.visibleBalance)
  )
})

const dueRequestColumns: WalletTableColumn[] = [
  { key: "title", label: "Due", accessor: (row: ArtistDueItem) => row.title },
  { key: "dueDate", label: "Due date", accessor: (row: ArtistDueItem) => row.dueDate ?? "" },
  { key: "amount", label: "Amount", align: "right", accessor: (row: ArtistDueItem) => Number(row.amount) },
  { key: "action", label: "Action", align: "right", sortable: false, searchable: false },
]
const dueHistoryColumns: WalletTableColumn[] = [
  { key: "title", label: "Due", accessor: (row: ArtistDueItem) => row.title },
  { key: "resolvedAt", label: "Paid / cancelled", accessor: (row: ArtistDueItem) => row.paidAt ?? row.cancelledAt ?? row.createdAt },
  { key: "status", label: "Status", accessor: (row: ArtistDueItem) => row.status },
  { key: "amount", label: "Amount", align: "right", accessor: (row: ArtistDueItem) => Number(row.amount) },
]
const payoutColumns: WalletTableColumn[] = [
  { key: "artistName", label: "Artist", accessor: (row: PayoutRequestRecord) => row.artistName },
  { key: "createdAt", label: "Requested", accessor: (row: PayoutRequestRecord) => row.createdAt },
  { key: "status", label: "Status", accessor: (row: PayoutRequestRecord) => row.status },
  { key: "amount", label: "Amount", align: "right", accessor: (row: PayoutRequestRecord) => Number(row.amount) },
]

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

function normalizeWalletSection(value: unknown): WalletSection {
  const raw = Array.isArray(value) ? value[0] : value

  return walletSectionValues.includes(raw as WalletSection) ? raw as WalletSection : "overview"
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

function formatDueHistoryDate(due: ArtistDueItem) {
  return formatDateTime(due.paidAt ?? due.cancelledAt ?? due.createdAt)
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
    description: `Request ${formatMoney(requestedAmount)} from ${selectedPayoutArtist.value.artistName}? This will reserve the amount for admin review.`,
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
      },
    })

    payoutForm.amount = ""
    payoutForm.artistNotes = ""
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
    <section class="wallet-heading">
      <div>
        <p class="eyebrow">Finance</p>
        <h1>Wallet</h1>
        <p>Available balance, payout requests, and clean account movement.</p>
      </div>
      <Button type="button" variant="secondary" @click="activeWalletSection = 'payout'">
        <PremiumPayoutIcon class="size-4" />
        Request payout
      </Button>
    </section>

    <AppAlert v-if="walletError" variant="destructive">
      {{ walletError.statusMessage || "Unable to load wallet data right now." }}
      <template #action>
        <Button variant="secondary" @click="() => refreshWallet()">Retry</Button>
      </template>
    </AppAlert>

    <DashboardSkeleton v-else-if="walletPending && !walletData" layout="wallet" />

    <template v-else>
      <Card class="wallet-balance-card">
        <div class="wallet-balance-layout">
          <div
            class="wallet-credit-card wallet-tilt-card"
            :style="balanceTiltStyle"
            @mousemove="balanceTilt.onMove"
            @mouseleave="balanceTilt.onLeave"
          >
            <div class="wallet-card-shine" :style="balanceShineStyle" />
            <div class="wallet-card-grain" aria-hidden="true" />
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
                  <MoneyValue :value="wallet.visibleBalance" size="xl" />
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
                    <picture>
                      <source srcset="/naadlogo-512.avif" type="image/avif">
                      <source srcset="/naadlogo-512.webp" type="image/webp">
                      <img
                        src="/naadlogo-512.png"
                        class="card-naad-logo"
                        alt="Naad Music Group"
                        width="512"
                        height="270"
                        decoding="async"
                      >
                    </picture>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="balance-stat-grid stagger-enter">
            <div v-for="stat in walletStats" :key="stat.label" class="balance-stat">
              <span>{{ stat.label }}</span>
              <strong>{{ formatMoney(stat.value) }}</strong>
            </div>
          </div>
        </div>
      </Card>

      <WorkspaceFolderGrid
        v-model="activeWalletSection"
        :items="walletSections"
        label="Wallet sections"
      />

      <div v-if="activeWalletSection === 'overview'" class="wallet-section-grid">
        <Card class="wallet-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Financial activity</p>
              <h3>Recent wallet movement</h3>
            </div>
            <ReceiptText class="size-5 text-muted-foreground" />
          </div>

          <div v-if="recentWalletActivity.length" class="activity-list stagger-enter">
            <div v-for="item in recentWalletActivity" :key="item.id" class="activity-row">
              <span :class="Number(item.amount) >= 0 ? 'activity-dot positive' : 'activity-dot negative'" />
              <div class="activity-copy">
                <strong>{{ item.label }}</strong>
                <span>{{ item.description }}</span>
                <span class="activity-time">
                  <Clock3 class="size-3" />
                  {{ formatDateTime(item.createdAt) }}
                </span>
              </div>
              <strong :class="Number(item.amount) >= 0 ? 'amount-positive' : 'amount-negative'">
                {{ formatSignedMoney(item.amount) }}
              </strong>
            </div>
          </div>

          <AppEmptyState
            v-else
            compact
            icon="file"
            title="No wallet activity yet"
            description="Credits, deductions, and payout movement appear here after the first ledger event."
            class="border-0 bg-transparent shadow-none"
          />
        </Card>
      </div>

      <div v-else-if="activeWalletSection === 'dues'" class="dues-section-stack">
        <AppAlert v-if="dueErrorMessage" variant="destructive">{{ dueErrorMessage }}</AppAlert>
        <AppAlert v-if="dueSuccessMessage" variant="success">{{ dueSuccessMessage }}</AppAlert>
        <AppAlert v-if="isViewingAsArtist" variant="warning">
          View-as mode is read-only. Due acceptance is disabled while an admin is inspecting this dashboard.
        </AppAlert>

        <Card class="wallet-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Due requests</p>
              <h3>Awaiting acceptance</h3>
            </div>
            <WalletCards class="size-5 text-muted-foreground" />
          </div>

          <DataTable
            :columns="dueRequestColumns"
            :data="pendingAcceptanceDues"
            empty-title="No due requests"
            empty-description="New dues from admin appear here before they affect your wallet."
            empty-icon="file"
            :enable-pagination="pendingAcceptanceDues.length > 8"
            :page-size="8"
          >
            <template #cell-title="{ row }">
              <div class="table-copy">
                <strong>{{ row.title }}</strong>
                <span>{{ row.artistName }}</span>
              </div>
            </template>
            <template #cell-dueDate="{ row }">
              <div class="table-copy">
                <strong>{{ formatDate(row.dueDate) }}</strong>
                <span>Sent {{ formatDateTime(row.createdAt) }}</span>
              </div>
            </template>
            <template #cell-amount="{ row }">
              <MoneyValue :value="row.amount" size="sm" />
            </template>
            <template #cell-action="{ row }">
              <Button
                type="button"
                size="sm"
                :disabled="isViewingAsArtist || acceptingDueId === row.id"
                @click="acceptDue(row)"
              >
                {{ acceptingDueId === row.id ? "Accepting..." : "Accept" }}
              </Button>
            </template>
          </DataTable>
        </Card>

        <Card class="wallet-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Due history</p>
              <h3>Resolved deductions</h3>
            </div>
            <History class="size-5 text-muted-foreground" />
          </div>

          <DataTable
            :columns="dueHistoryColumns"
            :data="dueHistory"
            empty-title="No due history"
            empty-description="Paid and cancelled dues appear here after they are resolved."
            empty-icon="file"
            :enable-pagination="dueHistory.length > 8"
            :page-size="8"
          >
            <template #cell-title="{ row }">
              <div class="table-copy">
                <strong>{{ row.title }}</strong>
                <span>{{ row.artistName }}</span>
              </div>
            </template>
            <template #cell-resolvedAt="{ row }">
              <div class="table-copy">
                <strong>{{ formatDueHistoryDate(row) }}</strong>
                <span>Created {{ formatDateTime(row.createdAt) }}</span>
              </div>
            </template>
            <template #cell-status="{ row }">
              <StatusBadge :tone="dueStatusTone(row.status)">{{ formatDueStatus(row.status) }}</StatusBadge>
            </template>
            <template #cell-amount="{ row }">
              <MoneyValue :value="row.amount" size="sm" />
            </template>
          </DataTable>
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

        <Card class="wallet-panel payout-panel payout-3d-card">
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

              <DashboardSkeleton v-if="payoutPending && !payoutData" :rows="2" />

              <AppEmptyState
                v-else-if="!payoutArtists.length"
                compact
                icon="file"
                title="No payout account"
                description="No artist payout account is available on this login yet."
                class="border-0 bg-transparent shadow-none"
              />

              <template v-else>
                <AppAlert v-if="selectedPayoutArtist?.hasPendingRequest" variant="warning">
                  A pending payout request already exists for this artist. Wait for admin review before requesting another one.
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
                  <Button type="button" variant="secondary" @click="activeWalletSection = 'history'">
                    View history
                  </Button>
                </div>
              </template>
            </form>
          </div>
        </Card>
      </div>

      <Card v-else class="wallet-panel payout-history-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Payout history</p>
            <h3>Request timeline</h3>
          </div>
          <History class="size-5 text-muted-foreground" />
        </div>

        <AppAlert v-if="payoutError" variant="destructive">
          {{ payoutError.statusMessage || "Unable to load payout history right now." }}
          <template #action>
            <Button variant="secondary" @click="() => refreshPayouts()">Retry</Button>
          </template>
        </AppAlert>

        <DashboardSkeleton v-else-if="payoutPending && !payoutData" :rows="3" />

        <AppEmptyState
          v-else-if="!payoutRequests.length"
          compact
          icon="file"
          title="No payout requests"
          description="Payout requests will appear here after the first request is submitted."
          class="payout-empty-state border-0 shadow-none"
        >
          <Button type="button" variant="secondary" @click="activeWalletSection = 'payout'">
            Request payout
            <ArrowRight class="size-4" />
          </Button>
        </AppEmptyState>

        <DataTable
          v-else
          :columns="payoutColumns"
          :data="payoutRequests"
          search-placeholder="Search payout history"
          :enable-pagination="payoutRequests.length > 8"
          :page-size="8"
        >
          <template #cell-artistName="{ row }">
            <div class="table-copy">
              <strong>{{ row.artistName }}</strong>
              <span v-if="row.artistNotes">{{ row.artistNotes }}</span>
            </div>
          </template>
          <template #cell-createdAt="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
          <template #cell-status="{ row }">
            <StatusBadge :tone="statusTone(row.status)">{{ formatStatus(row.status) }}</StatusBadge>
          </template>
          <template #cell-amount="{ row }">
            <MoneyValue :value="row.amount" size="sm" />
          </template>
        </DataTable>
      </Card>
    </template>
  </div>
</template>

<style scoped>
.wallet-page {
  gap: 26px;
}

.wallet-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.wallet-heading h1 {
  margin: 0;
  color: var(--foreground);
  font-size: clamp(28px, 3vw, 38px);
  font-weight: 680;
  line-height: 1.08;
  letter-spacing: 0;
}

.wallet-heading p:not(.eyebrow) {
  margin: 8px 0 0;
  max-width: 620px;
  color: var(--muted-foreground);
  font-size: 15px;
  line-height: 1.55;
}

.wallet-balance-card,
.wallet-panel {
  border-radius: 16px;
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--shadow-card);
}

:global(.dark .wallet-balance-card) {
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--shadow-card);
}

:global(.dark .wallet-panel) {
  background: var(--card);
  box-shadow: var(--shadow-card);
}

.wallet-balance-card {
  padding: 18px;
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--shadow-card);
}

.wallet-balance-layout {
  display: grid;
  grid-template-columns: minmax(250px, 390px) minmax(260px, 1fr);
  gap: 16px;
  align-items: stretch;
}

.wallet-credit-card {
  position: relative;
  isolation: isolate;
  width: 100%;
  max-width: 390px;
  aspect-ratio: 1.586 / 1;
  overflow: hidden;
  border: 1px solid rgb(245 241 223 / 17%);
  border-radius: 16px;
  background:
    radial-gradient(ellipse at 70% 80%, rgb(255 255 255 / 17%), rgb(255 255 255 / 7%) 18%, transparent 36%),
    radial-gradient(ellipse at 16% 2%, rgb(255 255 255 / 16%), transparent 34%),
    linear-gradient(145deg, #1b1b19 0%, #0b0b0a 52%, #030303 100%);
  box-shadow:
    0 24px 34px -19px rgb(0 0 0 / 68%),
    0 44px 70px -48px rgb(0 0 0 / 58%),
    0 2px 0 rgb(255 255 255 / 12%),
    inset 0 1px 0 rgb(255 255 255 / 12%),
    inset 0 -1px 0 rgb(0 0 0 / 78%);
  color: #f3f0df;
  transform-style: preserve-3d;
  will-change: transform;
}

.wallet-credit-card::before {
  position: absolute;
  inset: 0;
  z-index: 1;
  background:
    radial-gradient(128% 82% at 43% -8%, transparent 47%, rgb(255 255 255 / 22%) 52%, rgb(255 255 255 / 8%) 58%, transparent 67%),
    linear-gradient(150deg, transparent 42%, rgb(255 255 255 / 18%) 55%, rgb(255 255 255 / 6%) 62%, transparent 72%),
    radial-gradient(80% 42% at 68% 83%, rgb(255 255 255 / 18%), rgb(255 255 255 / 7%) 38%, transparent 72%),
    linear-gradient(164deg, rgb(255 255 255 / 8%), transparent 20%, transparent 74%, rgb(0 0 0 / 20%));
  content: "";
  mix-blend-mode: screen;
  opacity: 0.9;
  pointer-events: none;
}

.wallet-credit-card::after {
  position: absolute;
  inset: 0;
  z-index: 2;
  background:
    radial-gradient(118% 70% at 36% 3%, transparent 0 38%, rgb(0 0 0 / 34%) 61%, transparent 82%),
    linear-gradient(180deg, rgb(255 255 255 / 7%), transparent 16%, rgb(0 0 0 / 26%) 100%);
  content: "";
  mix-blend-mode: multiply;
  opacity: 0.72;
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
  opacity: 0.12;
  pointer-events: none;
}

.wallet-card-shine {
  position: absolute;
  inset: 0;
  z-index: 4;
  border-radius: inherit;
  filter: blur(7px);
  mix-blend-mode: screen;
  pointer-events: none;
  transition: opacity 220ms var(--ease-out, ease);
}

.wallet-card-inner {
  z-index: 5 !important;
  padding: clamp(15px, 1.8vw, 18px) !important;
}

.wallet-card-chip-row {
  display: flex;
  align-items: center;
  margin-top: 0;
  transform: translateZ(18px);
}

.wallet-credit-card .emv-chip {
  width: clamp(34px, 3.1vw, 40px) !important;
  height: clamp(25px, 2.35vw, 30px) !important;
  border-radius: 6px !important;
}

.wallet-credit-card .contactless-icon {
  color: rgb(245 241 221 / 78%) !important;
}

.wallet-credit-card .card-naad-logo {
  height: clamp(18px, 2vw, 21px) !important;
  filter: brightness(1.1) contrast(1.05) !important;
}

.wallet-card-balance-block {
  gap: 5px !important;
  margin-top: 0 !important;
  transform: translateZ(20px) !important;
}

.wallet-credit-card .card-balance-label {
  color: rgb(232 192 40 / 86%) !important;
  font-size: clamp(8px, 0.78vw, 10px) !important;
  letter-spacing: 0.1em !important;
  text-transform: uppercase !important;
}

.wallet-card-balance-amount {
  color: #f5f1df !important;
}

.wallet-card-balance-amount :deep([data-money]) {
  color: #f5f1df;
  font-size: clamp(27px, 3.35vw, 40px);
  text-shadow: 0 2px 8px rgb(0 0 0 / 38%);
}

.wallet-card-number-layer {
  position: static !important;
  width: 100% !important;
  color: rgb(245 241 223 / 58%) !important;
  font-size: clamp(11px, 1.38vw, 15px) !important;
  font-weight: 500 !important;
  letter-spacing: 0.18em !important;
  line-height: 1 !important;
  text-align: left !important;
  text-shadow:
    0 1px 0 rgb(255 255 255 / 15%),
    0 2px 3px rgb(0 0 0 / 58%) !important;
  transform: translateZ(12px) !important;
}

.wallet-card-bottom-row {
  gap: 10px !important;
  transform: translateZ(16px) !important;
}

.wallet-credit-card .card-holder-name {
  font-size: clamp(10px, 1vw, 12px) !important;
  max-width: min(168px, 36vw) !important;
}

.wallet-credit-card .card-label {
  color: rgb(232 192 40 / 68%) !important;
  text-transform: uppercase !important;
}

.wallet-credit-card .card-expiry {
  font-size: clamp(9px, 0.9vw, 11px) !important;
}

.wallet-card-network-logo {
  justify-content: flex-end !important;
  min-width: clamp(42px, 5vw, 54px);
  transform: translateZ(16px);
}

.metric-label,
.balance-stat span {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.45;
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
  gap: 10px;
}

.balance-stat {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  gap: 6px;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--muted) 26%, var(--card));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 72%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    0 2px 5px -2px rgb(10 10 10 / 12%),
    0 18px 34px -24px rgb(10 10 10 / 30%),
    0 32px 62px -44px rgb(10 10 10 / 24%);
  padding: 12px;
}

.balance-stat::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--foreground) 4%, transparent), transparent 48%),
    radial-gradient(circle at 16% 0%, color-mix(in srgb, var(--foreground) 5%, transparent), transparent 38%);
  content: "";
  opacity: 0.68;
  pointer-events: none;
}

.balance-stat > * {
  position: relative;
  z-index: 1;
}

:global(.dark .wallet-balance-card .balance-stat) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, rgb(238 242 247 / 10%));
  background:
    radial-gradient(120% 150% at 50% 0%, rgb(232 238 245 / 2.8%), transparent 48%),
    radial-gradient(95% 115% at 12% 0%, rgb(232 238 245 / 2%), transparent 44%),
    linear-gradient(145deg, color-mix(in srgb, var(--card) 88%, var(--foreground) 2%), color-mix(in srgb, var(--background) 48%, var(--card)) 64%, color-mix(in srgb, var(--background) 68%, var(--card)));
  box-shadow:
    inset 0 0 0 1px rgb(232 238 245 / 1.8%),
    inset 0 1px 0 rgb(232 238 245 / 4.2%),
    inset 0 -1px 0 rgb(0 0 0 / 42%),
    0 1px 0 rgb(232 238 245 / 1.8%),
    0 18px 34px -24px rgb(0 0 0 / 82%),
    0 36px 66px -52px rgb(0 0 0 / 86%);
}

:global(.dark .wallet-balance-card .balance-stat::before) {
  background:
    linear-gradient(128deg, transparent 0 40%, rgb(232 238 245 / 3.2%) 48%, transparent 62%),
    linear-gradient(145deg, rgb(232 238 245 / 1.8%), transparent 50%),
    radial-gradient(circle at 18% 0%, rgb(232 238 245 / 2.4%), transparent 38%);
  opacity: 0.46;
}

:global(.dark .wallet-balance-card .balance-stat:nth-child(1)),
:global(.dark .wallet-balance-card .balance-stat:nth-child(4)) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, rgb(232 238 245 / 14%));
  background:
    radial-gradient(110% 150% at 50% 0%, rgb(232 238 245 / 3.2%), transparent 48%),
    radial-gradient(120% 125% at 10% 0%, rgb(232 238 245 / 2.4%), transparent 44%),
    linear-gradient(145deg, color-mix(in srgb, var(--card) 90%, var(--foreground) 2%), color-mix(in srgb, var(--background) 44%, var(--card)) 64%, color-mix(in srgb, var(--background) 66%, var(--card)));
  box-shadow:
    inset 0 0 0 1px rgb(232 238 245 / 2%),
    inset 0 1px 0 rgb(232 238 245 / 4.8%),
    inset 0 -1px 0 rgb(0 0 0 / 42%),
    0 1px 0 rgb(232 238 245 / 2%),
    0 18px 36px -24px rgb(0 0 0 / 84%),
    0 38px 72px -56px rgb(0 0 0 / 88%);
}

.balance-stat strong {
  color: var(--foreground);
  font-size: 17px;
  font-weight: 680;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.wallet-section-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

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
  font-size: 20px;
  font-weight: 650;
  letter-spacing: 0;
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
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--muted) 22%, var(--card));
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

/* ── 3D Scene Container ── */
.payout-3d-scene {
  position: relative;
}

/* ── 3D Card ── */
.payout-3d-card {
  animation: payout-card-enter 600ms var(--ease-out) both;
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

/* ── Hero Icon with Floating Glow ── */
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
  opacity: 0.72;
}

/* ── Sidebar Layout ── */
/* ── Credit Card (3D Wallet) ── */
/* ── Credit Card (3D Wallet Override - forced premium dark theme) ── */
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
  letter-spacing: 0.08em !important;
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
  letter-spacing: 0.08em !important;
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
  letter-spacing: 0.05em !important;
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
  letter-spacing: 0.15em !important;
  color: rgba(242, 243, 234, 0.07) !important;
  pointer-events: none !important;
  font-weight: 600 !important;
  user-select: none !important;
}

/* ── Payout Metrics Container (below card) ── */
/* ── Payout Form ── */
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

/* ── 3D Enhanced Inputs ── */
.wallet-input {
  width: 100%;
  min-height: 46px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--background) 82%, var(--card) 18%);
  color: var(--foreground);
  padding: 10px 12px;
  font: inherit;
  line-height: 1.4;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.payout-3d-input:focus {
  border-color: color-mix(in srgb, var(--priority) 52%, var(--border));
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--priority) 10%, transparent),
    0 4px 12px -4px color-mix(in srgb, var(--priority) 8%, transparent);
  transform: translateY(-1px);
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
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 32%, transparent);
  color: var(--foreground);
  padding: 10px 12px;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.35;
}

.payout-3d-field {
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 3%, transparent),
    0 2px 6px -3px rgba(0, 0, 0, 0.08);
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

/* ── Premium Submit Button ── */
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
  transition: transform 0.15s var(--ease-out), box-shadow 0.15s ease, opacity 0.15s ease;
}

.payout-submit-btn:hover:not(:disabled) {
  transform: translateY(-1px) translateZ(0);
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

/* Sending state — pulsing overlay */
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

/* ── Success Overlay ── */
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

.payout-success-checkmark {
  position: relative;
  z-index: 1;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--priority);
  color: var(--priority-foreground);
  display: grid;
  place-items: center;
  box-shadow:
    0 4px 16px -4px color-mix(in srgb, var(--priority) 40%, transparent),
    0 12px 32px -10px color-mix(in srgb, var(--priority) 24%, transparent);
  animation: payout-check-enter 400ms 150ms var(--ease-out) both;
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
  letter-spacing: -0.01em;
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

/* ── Overlay transition ── */
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

/* ── Reduced Motion ── */
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
    border-radius: 14px;
  }

  .wallet-card-inner {
    padding: 16px !important;
  }

  .wallet-card-bottom-row {
    gap: 10px !important;
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
    font-size: 10px !important;
  }

  .wallet-credit-card .card-holder-name {
    max-width: 116px !important;
    font-size: 10px !important;
  }

  .wallet-card-network-logo {
    min-width: 42px;
  }

  .wallet-credit-card .card-naad-logo {
    height: 15px !important;
  }

  .wallet-card-number-layer {
    position: static !important;
    font-size: 10px !important;
    letter-spacing: 0.14em !important;
  }

  .balance-stat-grid,
  .payout-field-grid {
    grid-template-columns: 1fr;
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
