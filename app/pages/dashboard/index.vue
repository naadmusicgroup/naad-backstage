<script setup lang="ts">
import type { ArtistWalletResponse } from "~~/types/dashboard"
import { MIN_PAYOUT_AMOUNT, type ArtistPayoutsResponse, type PayoutRequestStatus } from "~~/types/payouts"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
})

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

const { activeArtistId } = useActiveArtist()
const artistScopeQuery = computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined))
const { data, error, pending, refresh } = useLazyFetch<ArtistWalletResponse>("/api/dashboard/wallet", {
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
    data.value ?? {
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
    }
  )
})
const payoutArtists = computed(() => payoutData.value?.artists ?? [])
const payoutRequests = computed(() => payoutData.value?.requests ?? [])
const minimumPayoutAmount = computed(() => payoutData.value?.minimumAmount ?? MIN_PAYOUT_AMOUNT.toFixed(8))
const requestWindowHours = computed(() => payoutData.value?.requestWindowHours ?? 24)
const maxRequestsPerWindow = computed(() => payoutData.value?.maxRequestsPerWindow ?? 3)
const payoutForm = reactive({
  artistId: "",
  amount: "",
  artistNotes: "",
})
const isSubmittingPayout = ref(false)
const payoutSuccessMessage = ref("")
const payoutErrorMessage = ref("")

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

const selectedPayoutArtist = computed(() => payoutArtists.value.find((artist) => artist.artistId === payoutForm.artistId) ?? null)
const canSubmitPayout = computed(() => {
  if (!selectedPayoutArtist.value) {
    return false
  }

  const amount = Number(payoutForm.amount || 0)
  return (
    amount >= MIN_PAYOUT_AMOUNT
    && !selectedPayoutArtist.value.hasPendingRequest
    && amount <= Number(selectedPayoutArtist.value.visibleBalance)
  )
})

const walletMetrics = computed(() => [
  {
    label: "Total earned",
    value: formatMoney(wallet.value.totalEarned),
    footnote: "Backed by posted earnings and publishing credits.",
    tone: "accent" as const,
  },
  {
    label: "Available balance",
    value: formatMoney(wallet.value.visibleBalance),
    footnote: wallet.value.balanceSettling
      ? "Balance settling is active. Payouts reopen automatically after future earnings recover the balance."
      : "Only the artist-safe withdrawable balance is shown here.",
    tone: "alt" as const,
  },
  {
    label: "Reserved payouts",
    value: formatMoney(wallet.value.reservedPayouts),
    footnote: "Pending and approved requests reduce what is currently withdrawable.",
    tone: "default" as const,
  },
  {
    label: "Recent activity",
    value: `${wallet.value.recentTransactions.length} events`,
    footnote: "Artists only see clean outcome-level transactions, never raw CSV rows.",
    tone: "default" as const,
  },
])

function resetPayoutMessages() {
  payoutSuccessMessage.value = ""
  payoutErrorMessage.value = ""
}

function setPayoutError(error: any, fallback: string) {
  payoutErrorMessage.value = error?.data?.statusMessage || error?.message || fallback
  payoutSuccessMessage.value = ""
}

function setPayoutSuccess(message: string) {
  payoutSuccessMessage.value = message
  payoutErrorMessage.value = ""
}

function formatMoney(value: string) {
  return `$${Number(value).toFixed(2)}`
}

function formatSignedMoney(value: string) {
  const amount = Number(value)
  const prefix = amount > 0 ? "+" : ""
  return `${prefix}$${amount.toFixed(2)}`
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
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

function statusClass(status: PayoutRequestStatus) {
  switch (status) {
    case "pending":
      return "status-processing"
    case "approved":
      return "status-reversed"
    case "rejected":
      return "status-failed"
    case "paid":
      return "status-completed"
  }
}

async function submitPayoutRequest() {
  if (!selectedPayoutArtist.value) {
    payoutErrorMessage.value = "No artist account is available for payout requests."
    return
  }

  isSubmittingPayout.value = true
  resetPayoutMessages()

  try {
    const requestedAmount = payoutForm.amount

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
    await Promise.all([refresh(), refreshPayouts()])
    setPayoutSuccess(`Requested ${formatMoney(requestedAmount)}.`)
  } catch (error: any) {
    setPayoutError(error, "Unable to submit this payout request.")
  } finally {
    isSubmittingPayout.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="metrics">
      <MetricCard
        v-for="metric in walletMetrics"
        :key="metric.label"
        :label="metric.label"
        :value="metric.value"
        :footnote="metric.footnote"
        :tone="metric.tone"
      />
    </div>

    <div v-if="error" class="banner error">
      {{ error.statusMessage || "Unable to load the wallet right now." }}
        <div class="button-row">
          <button class="button button-secondary" @click="() => refresh()">Retry</button>
        </div>
      </div>

    <div v-else-if="pending" class="status-message">Loading wallet...</div>

    <div v-else class="panel-grid">
      <SectionCard
        title="Wallet state"
        eyebrow="Artist home"
        description="This dashboard stays intentionally CSV-free. You only see balances and clean financial activity."
      >
        <div v-if="wallet.balanceSettling" class="banner">
          Balance settling is active. Your payout balance will reopen automatically after future earnings recover the account.
        </div>

        <div class="summary-table">
          <div class="summary-row">
            <span class="detail-copy">Available balance</span>
            <strong>{{ formatMoney(wallet.visibleBalance) }}</strong>
          </div>
          <div class="summary-row">
            <span class="detail-copy">Reserved payouts</span>
            <strong>{{ formatMoney(wallet.reservedPayouts) }}</strong>
          </div>
          <div class="summary-row">
            <span class="detail-copy">Total dues</span>
            <strong>{{ formatMoney(wallet.totalDues) }}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Request payout"
        eyebrow="Artist action"
        description="Payout requests reserve balance immediately. The minimum request is $50.00, and one pending request is allowed at a time for each artist account."
      >
        <div class="form-grid">
          <div v-if="payoutErrorMessage" class="banner error">{{ payoutErrorMessage }}</div>
          <div v-if="payoutSuccessMessage" class="banner">{{ payoutSuccessMessage }}</div>
          <div v-if="payoutError" class="banner error">{{ payoutError.statusMessage || "Unable to load payout options right now." }}</div>

          <div v-else-if="payoutPending" class="status-message">Loading payout options...</div>

          <div v-else-if="!payoutArtists.length" class="muted-copy">
            No artist payout account is available on this login yet.
          </div>

          <template v-else>
            <div class="field-row">
              <label for="payout-artist">Artist</label>
              <select id="payout-artist" v-model="payoutForm.artistId" class="input">
                <option v-for="artist in payoutArtists" :key="artist.artistId" :value="artist.artistId">
                  {{ artist.artistName }}
                </option>
              </select>
            </div>

            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Withdrawable balance</span>
                <strong>{{ formatMoney(selectedPayoutArtist?.visibleBalance || "0") }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Minimum payout</span>
                <strong>{{ formatMoney(minimumPayoutAmount) }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Pending payouts</span>
                <strong>{{ formatMoney(selectedPayoutArtist?.pendingPayouts || "0") }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Approved payouts</span>
                <strong>{{ formatMoney(selectedPayoutArtist?.approvedPayouts || "0") }}</strong>
              </div>
            </div>

            <div v-if="selectedPayoutArtist?.hasPendingRequest" class="banner error">
              A pending payout request already exists for this artist. Wait for admin review before requesting another one.
            </div>

            <div
              v-else-if="Number(selectedPayoutArtist?.visibleBalance || 0) < MIN_PAYOUT_AMOUNT"
              class="banner"
            >
              Payout requests open once your available balance reaches {{ formatMoney(minimumPayoutAmount) }}.
            </div>

            <div class="field-row">
              <label for="payout-amount">Amount</label>
              <input
                id="payout-amount"
                v-model="payoutForm.amount"
                class="input"
                type="number"
                :min="MIN_PAYOUT_AMOUNT"
                step="0.01"
                :max="selectedPayoutArtist?.visibleBalance || undefined"
              />
            </div>

            <div class="field-row">
              <label for="payout-notes">Notes</label>
              <textarea id="payout-notes" v-model="payoutForm.artistNotes" class="input" rows="3" />
            </div>

            <p class="detail-copy">
              Minimum payout: {{ formatMoney(minimumPayoutAmount) }}. Limit: {{ maxRequestsPerWindow }} payout requests in {{ requestWindowHours }} hours per artist account.
            </p>

            <div class="button-row">
              <button class="button" :disabled="isSubmittingPayout || !canSubmitPayout" @click="submitPayoutRequest">
                {{ isSubmittingPayout ? "Requesting..." : "Request payout" }}
              </button>
            </div>
          </template>
        </div>
      </SectionCard>

      <SectionCard
        title="Recent activity"
        eyebrow="Summary view"
        description="These rows come from the transaction ledger, filtered down to artist-safe descriptions."
      >
        <div v-if="wallet.recentTransactions.length" class="summary-table">
          <div v-for="item in wallet.recentTransactions" :key="item.id" class="summary-row">
            <div class="summary-copy">
              <strong>{{ item.label }}</strong>
              <span class="detail-copy">{{ item.description }}</span>
              <span class="detail-copy">{{ formatDateTime(item.createdAt) }}</span>
            </div>
            <strong>{{ formatSignedMoney(item.amount) }}</strong>
          </div>
        </div>

        <p v-else class="muted-copy">
          No wallet activity exists yet. Once admin commits an upload, earnings and clean ledger entries will appear here.
        </p>
      </SectionCard>
    </div>

    <SectionCard
      title="Payout history"
      eyebrow="Request timeline"
      description="This list shows the request lifecycle without exposing admin-only accounting detail."
    >
      <div v-if="payoutPending" class="status-message">Loading payout history...</div>

      <div v-else-if="!payoutRequests.length" class="muted-copy">
        No payout requests exist yet.
      </div>

      <div v-else class="summary-table">
        <div v-for="request in payoutRequests" :key="request.id" class="summary-row">
          <div class="summary-copy">
            <strong>{{ request.artistName }}</strong>
            <span class="detail-copy">{{ formatMoney(request.amount) }} / {{ formatDateTime(request.createdAt) }}</span>
            <span v-if="request.artistNotes" class="detail-copy">{{ request.artistNotes }}</span>
            <span v-if="request.adminNotes" class="detail-copy">Admin note: {{ request.adminNotes }}</span>
          </div>
          <span class="status-pill" :class="statusClass(request.status)">{{ formatStatus(request.status) }}</span>
        </div>
      </div>
    </SectionCard>
  </div>
</template>
