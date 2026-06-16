<script setup lang="ts">
import { Eye, Pencil, Plus } from "lucide-vue-next"
import type { RowAction } from "~/components/RowActions.vue"
import type {
  AdminPayoutsResponse,
  CreateAdminManualPayoutInput,
  PayoutPaymentMethod,
  PayoutRequestRecord,
  PayoutRequestStatus,
  UpdateAdminPayoutFinancialsInput,
} from "~~/types/payouts"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

type StatusFilter = "all" | PayoutRequestStatus

interface AdminDraft {
  adminNotes: string
  amount: string
  serviceCharge: string
  bankChargePct: string
  paymentMethod: PayoutPaymentMethod
  paymentReference: string
}

interface ManualPayoutForm {
  artistId: string
  amount: string
  serviceCharge: string
  paidAt: string
  paymentMethod: PayoutPaymentMethod
  paymentReference: string
  adminNotes: string
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

const statusFilter = ref<StatusFilter>("all")
const successMessage = ref("")
const errorMessage = ref("")
const creatingManualPayout = ref(false)
const approvingRequestId = ref("")
const rejectingRequestId = ref("")
const payingRequestId = ref("")
const reversingManualPayoutId = ref("")
const savingPayoutFinancialsId = ref("")
const adminDrafts = reactive<Record<string, AdminDraft>>({})

// Dialog state
const createOpen = ref(false)
const detailsOpen = ref(false)
const manageOpen = ref(false)
const activeRequestId = ref("")

const manualPayoutForm = reactive<ManualPayoutForm>({
  artistId: "",
  amount: "",
  serviceCharge: "",
  paidAt: formatDateTimeLocalInput(),
  paymentMethod: "bank_transfer",
  paymentReference: "",
  adminNotes: "",
})
const { confirmAction } = useConfirmAction()

const { data, error, pending, refresh } = useLazyFetch<AdminPayoutsResponse>("/api/admin/payouts")

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

const summary = computed(() => data.value?.summary ?? {
  pendingCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
  paidCount: 0,
  pendingAmount: "0.00000000",
  approvedAmount: "0.00000000",
  paidAmount: "0.00000000",
})
const requests = computed(() => data.value?.requests ?? [])
const artistOptions = computed(() => data.value?.artistOptions ?? [])
const activeRequest = computed(() => requests.value.find((request) => request.id === activeRequestId.value) ?? null)
const selectedManualPayoutArtist = computed(() => (
  artistOptions.value.find((artist) => artist.value === manualPayoutForm.artistId) ?? null
))
const manualPayoutAmountValue = computed(() => Number(manualPayoutForm.amount || 0))
const manualPayoutServiceChargeValue = computed(() => Number(manualPayoutForm.serviceCharge || 0))
const manualPayoutBalancePreview = computed(() => {
  const artist = selectedManualPayoutArtist.value
  const amount = manualPayoutAmountValue.value

  if (!artist || !Number.isFinite(amount) || amount <= 0) {
    return null
  }

  return Number(artist.availableBalance || 0) - amount
})
const filteredRequests = computed(() => {
  if (statusFilter.value === "all") {
    return requests.value
  }

  return requests.value.filter((request) => request.status === statusFilter.value)
})
const maxManualPayoutDateTime = computed(() => formatDateTimeLocalInput())

const payoutRequestColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0) },
  { key: "requested", label: "Requested", accessor: (row: any) => row.createdAt },
  { key: "bank", label: "Bank destination", accessor: (row: any) => row.bankDetails?.bankName || "" },
  { key: "payment", label: "Payment", accessor: (row: any) => row.paymentMethod || "" },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
]

watch(
  requests,
  (value) => {
    for (const request of value) {
      adminDrafts[request.id] = {
        adminNotes: request.adminNotes ?? adminDrafts[request.id]?.adminNotes ?? "",
        amount: request.amount,
        serviceCharge: request.serviceCharge ?? "0.00000000",
        bankChargePct: request.bankChargePct ?? "1.00",
        paymentMethod: request.paymentMethod ?? adminDrafts[request.id]?.paymentMethod ?? "bank_transfer",
        paymentReference: request.paymentReference ?? adminDrafts[request.id]?.paymentReference ?? "",
      }
    }
  },
  { immediate: true },
)

const summaryMetrics = computed(() => [
  {
    label: "Pending requests",
    value: String(summary.value.pendingCount),
    footnote: formatMoney(summary.value.pendingAmount),
    tone: "accent" as const,
  },
  {
    label: "Approved requests",
    value: String(summary.value.approvedCount),
    footnote: formatMoney(summary.value.approvedAmount),
    tone: "default" as const,
  },
  {
    label: "Rejected requests",
    value: String(summary.value.rejectedCount),
    footnote: "Restored through the ledger",
    tone: "default" as const,
  },
  {
    label: "Paid requests",
    value: String(summary.value.paidCount),
    footnote: formatMoney(summary.value.paidAmount),
    tone: "alt" as const,
  },
])

function resetMessages() {
  successMessage.value = ""
  errorMessage.value = ""
}

function setError(caught: any, fallback: string) {
  errorMessage.value = caught?.data?.statusMessage || caught?.message || fallback
  successMessage.value = ""
}

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value ?? 0)

  return `$${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`
}

function formatPercent(value: string | number | null | undefined) {
  const amount = Number(value ?? 0)

  return `${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}%`
}

function calculateNetAfterBankCharge(amountValue: string | number | null | undefined, pctValue: string | number | null | undefined) {
  const amount = Number(amountValue ?? 0)
  const bankPct = Number(pctValue ?? 0)

  if (!Number.isFinite(amount) || !Number.isFinite(bankPct)) {
    return 0
  }

  return Math.max(amount - ((amount * bankPct) / 100), 0)
}

function payoutNetAfterBankCharge(request: PayoutRequestRecord) {
  return calculateNetAfterBankCharge(request.amount, request.bankChargePct ?? "1.00")
}

function draftNetAfterBankCharge(request: PayoutRequestRecord) {
  const draft = adminDrafts[request.id]

  return calculateNetAfterBankCharge(
    draft?.amount ?? request.amount,
    draft?.bankChargePct ?? request.bankChargePct ?? "1.00",
  )
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available"
  }

  return dateTimeFormatter.format(new Date(value))
}

function formatDateTimeLocalInput(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)

  return localDate.toISOString().slice(0, 16)
}

function dateTimeLocalToIso(value: string) {
  return new Date(value).toISOString()
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

function hasServiceCharge(request: PayoutRequestRecord) {
  const amount = Number(request.serviceCharge || 0)

  return Number.isFinite(amount) && amount > 0
}

function canEditServiceCharge(request: PayoutRequestRecord) {
  return request.status !== "rejected"
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

function canReverseManualPayout(request: PayoutRequestRecord) {
  return request.status === "paid" && request.canReverse === true
}

function canManage(request: PayoutRequestRecord) {
  return request.status === "pending" || request.status === "approved" || canReverseManualPayout(request)
}

// ── Row kebab ──
function requestActions(request: PayoutRequestRecord): RowAction[] {
  const actions: RowAction[] = [{ key: "details", label: "View details", icon: Eye }]

  if (canManage(request)) {
    actions.push({
      key: "manage",
      label: request.status === "paid" ? "Manage payout" : "Review & process",
      icon: Pencil,
    })
  }

  return actions
}

function onRequestAction(key: string, request: PayoutRequestRecord) {
  activeRequestId.value = request.id
  resetMessages()

  if (key === "details") {
    detailsOpen.value = true
  } else if (key === "manage") {
    manageOpen.value = true
  }
}

function openCreate() {
  resetMessages()
  resetManualPayoutForm()
  createOpen.value = true
}

function resetManualPayoutForm() {
  manualPayoutForm.artistId = ""
  manualPayoutForm.amount = ""
  manualPayoutForm.serviceCharge = ""
  manualPayoutForm.paidAt = formatDateTimeLocalInput()
  manualPayoutForm.paymentMethod = "bank_transfer"
  manualPayoutForm.paymentReference = ""
  manualPayoutForm.adminNotes = ""
}

// ── Mutations ──
async function createManualPayout() {
  const artist = selectedManualPayoutArtist.value
  let paidAtIso = ""
  const serviceCharge = Number.isFinite(manualPayoutServiceChargeValue.value) ? manualPayoutServiceChargeValue.value : 0
  const serviceChargeCopy = serviceCharge > 0 ? ` with ${formatMoney(serviceCharge)} Tipalti service fee saved for display only` : ""

  try {
    paidAtIso = dateTimeLocalToIso(manualPayoutForm.paidAt)
  } catch {
    setError(null, "Payout date and time is invalid.")
    return
  }

  const confirmed = await confirmAction({
    title: "Record payout history",
    description: `Record ${formatMoney(manualPayoutForm.amount)} paid payout${serviceChargeCopy} for ${artist?.label ?? "this artist"} at ${formatDateTime(paidAtIso)}? Only the payout amount affects the wallet.`,
    confirmLabel: "Record payout",
    variant: "default",
    adminVerification: { action: "payout.manual_paid" },
  })

  if (!confirmed) {
    return
  }

  creatingManualPayout.value = true
  resetMessages()

  try {
    const body: CreateAdminManualPayoutInput = {
      artistId: manualPayoutForm.artistId,
      amount: manualPayoutForm.amount,
      serviceCharge: manualPayoutForm.serviceCharge || null,
      paidAt: paidAtIso,
      paymentMethod: manualPayoutForm.paymentMethod,
      paymentReference: manualPayoutForm.paymentReference || null,
      adminNotes: manualPayoutForm.adminNotes || null,
    }

    await $fetch("/api/admin/payouts/manual", { method: "POST", body })

    await refresh()
    createOpen.value = false
    setSuccess(`Recorded payout history for ${artist?.label ?? "artist"}.`)
    resetManualPayoutForm()
  } catch (caught: any) {
    setError(caught, "Unable to record this payout history entry.")
  } finally {
    creatingManualPayout.value = false
  }
}

async function approveRequest(request: PayoutRequestRecord) {
  const confirmed = await confirmAction({
    title: "Approve payout request",
    description: `Approve ${formatMoney(request.amount)} payout request for ${request.artistName}?`,
    confirmLabel: "Approve payout",
    variant: "default",
    adminVerification: { action: "payout.approved" },
  })

  if (!confirmed) {
    return
  }

  approvingRequestId.value = request.id
  resetMessages()

  try {
    await $fetch(`/api/admin/payouts/${request.id}/approve`, {
      method: "POST",
      body: { adminNotes: adminDrafts[request.id]?.adminNotes || null },
    })

    await refresh()
    manageOpen.value = false
    setSuccess(`Approved payout request for ${request.artistName}.`)
  } catch (caught: any) {
    setError(caught, "Unable to approve this payout request.")
  } finally {
    approvingRequestId.value = ""
  }
}

async function rejectRequest(request: PayoutRequestRecord) {
  const confirmed = await confirmAction({
    title: "Reject payout request",
    description: `Reject ${formatMoney(request.amount)} payout request for ${request.artistName}? The reserved balance will be restored through the ledger.`,
    confirmLabel: "Reject payout",
    variant: "destructive",
    adminVerification: { action: "payout.rejected" },
  })

  if (!confirmed) {
    return
  }

  rejectingRequestId.value = request.id
  resetMessages()

  try {
    await $fetch(`/api/admin/payouts/${request.id}/reject`, {
      method: "POST",
      body: { adminNotes: adminDrafts[request.id]?.adminNotes || null },
    })

    await refresh()
    manageOpen.value = false
    setSuccess(`Rejected payout request for ${request.artistName}.`)
  } catch (caught: any) {
    setError(caught, "Unable to reject this payout request.")
  } finally {
    rejectingRequestId.value = ""
  }
}

async function markRequestPaid(request: PayoutRequestRecord) {
  const confirmed = await confirmAction({
    title: "Mark payout paid",
    description: `Mark ${formatMoney(request.amount)} payout for ${request.artistName} as paid?`,
    confirmLabel: "Mark paid",
    variant: "default",
    adminVerification: { action: "payout.paid" },
  })

  if (!confirmed) {
    return
  }

  payingRequestId.value = request.id
  resetMessages()

  try {
    await $fetch(`/api/admin/payouts/${request.id}/mark-paid`, {
      method: "POST",
      body: {
        adminNotes: adminDrafts[request.id]?.adminNotes || null,
        paymentMethod: adminDrafts[request.id]?.paymentMethod,
        paymentReference: adminDrafts[request.id]?.paymentReference || null,
      },
    })

    await refresh()
    manageOpen.value = false
    setSuccess(`Marked payout request for ${request.artistName} as paid.`)
  } catch (caught: any) {
    setError(caught, "Unable to mark this payout request as paid.")
  } finally {
    payingRequestId.value = ""
  }
}

async function savePayoutFinancials(request: PayoutRequestRecord) {
  const draft = adminDrafts[request.id]
  const serviceCharge = canEditServiceCharge(request) ? draft?.serviceCharge || "0" : "0"
  const bankChargePct = draft?.bankChargePct || "1.00"
  const serviceChargeCopy = Number(serviceCharge || 0) > 0
    ? `, ${formatMoney(serviceCharge)} Tipalti service fee`
    : ""
  const confirmed = await confirmAction({
    title: "Update payout financials",
    description: `Update ${request.artistName}'s payout amount to ${formatMoney(draft?.amount)} with ${formatPercent(bankChargePct)} bank charges${serviceChargeCopy}? Fees are saved for payout display only; only the payout amount changes ledger accounting.`,
    confirmLabel: "Save changes",
    variant: "default",
    adminVerification: { action: "payout.financials_updated" },
  })

  if (!confirmed) {
    return
  }

  savingPayoutFinancialsId.value = request.id
  resetMessages()

  try {
    const body: UpdateAdminPayoutFinancialsInput = {
      amount: draft?.amount || request.amount,
      serviceCharge,
      bankChargePct,
    }

    await $fetch(`/api/admin/payouts/${request.id}/financials`, { method: "PATCH", body })

    await refresh()
    setSuccess(`Updated payout financials for ${request.artistName}.`)
  } catch (caught: any) {
    setError(caught, "Unable to update this payout.")
  } finally {
    savingPayoutFinancialsId.value = ""
  }
}

async function reverseManualPayout(request: PayoutRequestRecord) {
  const serviceChargeCopy = hasServiceCharge(request)
    ? ` with ${formatMoney(request.serviceCharge)} displayed Tipalti fee`
    : ""
  const confirmed = await confirmAction({
    title: "Reverse manual payout",
    description: `Reverse ${formatMoney(request.amount)} manual payout${serviceChargeCopy} for ${request.artistName}? This removes the admin-recorded payout history entry and restores the artist wallet balance.`,
    confirmLabel: "Reverse payout",
    variant: "destructive",
    adminVerification: { action: "payout.manual_reversed" },
  })

  if (!confirmed) {
    return
  }

  reversingManualPayoutId.value = request.id
  resetMessages()

  try {
    await $fetch(`/api/admin/payouts/${request.id}/reverse-manual`, {
      method: "POST",
      body: { adminNotes: "Manual payout reversed from admin payouts." },
    })

    await refresh()
    manageOpen.value = false
    setSuccess(`Reversed manual payout for ${request.artistName}.`)
  } catch (caught: any) {
    setError(caught, "Unable to reverse this manual payout.")
  } finally {
    reversingManualPayoutId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <DataPanel
      title="Payout operations"
      title-level="h1"
      eyebrow="Wallet control"
      description="Pending requests reserve balance immediately. Approval and mark-paid are status transitions, while rejection restores balance through the ledger."
    >
      <div class="stack">
        <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
        <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>
        <AppAlert v-if="error" variant="destructive">{{ error.statusMessage || "Unable to load payout requests right now." }}</AppAlert>

        <div class="metrics">
          <StatCard
            v-for="metric in summaryMetrics"
            :key="metric.label"
            surface="slab"
            :label="metric.label"
            :value="metric.value"
            :footnote="metric.footnote"
            :tone="metric.tone"
          />
        </div>
      </div>
    </DataPanel>

    <DataPanel
      title="Payout requests"
      eyebrow="Cash movement"
      description="Review pending requests, process approvals and payments, or record a manual payout."
    >
      <template #actions>
        <Button @click="openCreate">
          <Plus class="size-4" />
          Record payout
        </Button>
      </template>

      <div class="payout-filter">
        <div class="field-row">
          <label for="payout-status-filter">Filter</label>
          <NativeSelect id="payout-status-filter" v-model="statusFilter">
            <option value="all">All requests</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="paid">Paid</option>
          </NativeSelect>
        </div>
      </div>

      <DashboardSkeleton v-if="pending && !data" :rows="5" />

      <DataTable
        v-else
        :columns="payoutRequestColumns"
        :data="filteredRequests"
        empty-title="No payout requests"
        empty-description="No payout requests match this filter yet."
        row-key="id"
      >
        <template #cell-artist="{ row: request }">
          <strong>{{ request.artistName }}</strong>
        </template>
        <template #cell-amount="{ row: request }">
          <strong class="tabular-nums">{{ formatMoney(request.amount) }}</strong>
        </template>
        <template #cell-requested="{ row: request }">{{ formatDateTime(request.createdAt) }}</template>
        <template #cell-bank="{ row: request }">
          <span>{{ request.bankDetails?.bankName || "Not set" }}</span>
        </template>
        <template #cell-payment="{ row: request }">
          <span>{{ request.paymentMethod || "Not set" }}</span>
        </template>
        <template #cell-status="{ row: request }">
          <StatusBadge :tone="statusTone(request.status)">{{ formatStatus(request.status) }}</StatusBadge>
        </template>
        <template #cell-actions="{ row: request }">
          <RowActions :actions="requestActions(request)" @select="(key) => onRequestAction(key, request)" />
        </template>
      </DataTable>
    </DataPanel>

    <!-- Record manual payout -->
    <FormDialog
      v-model:open="createOpen"
      title="Record paid payout"
      description="Logs an admin-recorded payout. Only the payout amount affects the artist wallet; fees are display-only."
      submit-label="Record payout"
      :pending="creatingManualPayout"
      :error="createOpen ? errorMessage : ''"
      :submit-disabled="!manualPayoutForm.artistId || !manualPayoutForm.amount"
      content-class="max-w-2xl"
      @submit="createManualPayout"
    >
      <div class="dialog-grid">
        <div class="field-row dialog-col-2">
          <label for="manual-payout-artist">Artist</label>
          <NativeSelect id="manual-payout-artist" v-model="manualPayoutForm.artistId">
            <option value="" disabled>Select artist</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">
              {{ artist.label }} · available {{ formatMoney(artist.availableBalance) }}
            </option>
          </NativeSelect>
        </div>
        <div class="field-row">
          <label for="manual-payout-amount">Amount</label>
          <Input id="manual-payout-amount" v-model="manualPayoutForm.amount" type="number" min="0.00000001" step="0.00000001" placeholder="0.00" />
          <div v-if="manualPayoutBalancePreview !== null" class="detail-copy">
            Available after payout: {{ formatMoney(manualPayoutBalancePreview) }}
          </div>
        </div>
        <div class="field-row">
          <label for="manual-payout-service-charge">Tipalti service fee</label>
          <Input id="manual-payout-service-charge" v-model="manualPayoutForm.serviceCharge" type="number" min="0" step="0.00000001" placeholder="0.00" />
          <div class="detail-copy">Display only — does not change the wallet.</div>
        </div>
        <div class="field-row">
          <label for="manual-payout-paid-at">Paid date and time</label>
          <Input id="manual-payout-paid-at" v-model="manualPayoutForm.paidAt" type="datetime-local" :max="maxManualPayoutDateTime" />
        </div>
        <div class="field-row">
          <label for="manual-payout-method">Payment method</label>
          <NativeSelect id="manual-payout-method" v-model="manualPayoutForm.paymentMethod">
            <option value="bank_transfer">Bank transfer</option>
            <option value="esewa">eSewa</option>
            <option value="khalti">Khalti</option>
            <option value="other">Other</option>
          </NativeSelect>
        </div>
        <div class="field-row dialog-col-2">
          <label for="manual-payout-reference">Payment reference</label>
          <Input id="manual-payout-reference" v-model="manualPayoutForm.paymentReference" type="text" placeholder="Bank ref, receipt, or note" />
        </div>
        <div class="field-row dialog-col-2">
          <label for="manual-payout-admin-notes">Admin note</label>
          <Textarea id="manual-payout-admin-notes" v-model="manualPayoutForm.adminNotes" rows="3" placeholder="Why this history entry is being recorded" />
        </div>
      </div>
    </FormDialog>

    <!-- View details -->
    <FormDialog
      v-model:open="detailsOpen"
      :title="activeRequest ? `Payout — ${activeRequest.artistName}` : 'Payout details'"
      readonly
      content-class="max-w-2xl"
    >
      <dl v-if="activeRequest" class="detail-list">
        <div class="detail-item">
          <dt>Status</dt>
          <dd><StatusBadge :tone="statusTone(activeRequest.status)">{{ formatStatus(activeRequest.status) }}</StatusBadge></dd>
        </div>
        <div class="detail-item">
          <dt>Amount</dt>
          <dd class="tabular-nums">{{ formatMoney(activeRequest.amount) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Bank charges</dt>
          <dd>{{ formatPercent(activeRequest.bankChargePct ?? "1.00") }}</dd>
        </div>
        <div class="detail-item">
          <dt>Net after bank charges</dt>
          <dd class="tabular-nums">{{ formatMoney(payoutNetAfterBankCharge(activeRequest)) }}</dd>
        </div>
        <div v-if="hasServiceCharge(activeRequest)" class="detail-item">
          <dt>Tipalti service fee</dt>
          <dd class="tabular-nums">{{ formatMoney(activeRequest.serviceCharge) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Requested</dt>
          <dd>{{ formatDateTime(activeRequest.createdAt) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Reviewed / paid</dt>
          <dd>{{ formatDateTime(activeRequest.reviewedAt) }} / {{ formatDateTime(activeRequest.paidAt) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Payment</dt>
          <dd>{{ activeRequest.paymentMethod || "Not set" }} · {{ activeRequest.paymentReference || "no reference" }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Bank destination</dt>
          <dd>
            {{ activeRequest.bankDetails
              ? `${activeRequest.bankDetails.accountName} · ${activeRequest.bankDetails.bankName} · ${activeRequest.bankDetails.accountNumber}`
              : "Not set" }}
          </dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Artist note</dt>
          <dd>{{ activeRequest.artistNotes || "None" }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Admin note</dt>
          <dd>{{ activeRequest.adminNotes || "None" }}</dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="detailsOpen = false">Close</Button>
        <Button v-if="activeRequest && canManage(activeRequest)" @click="detailsOpen = false; manageOpen = true">
          <Pencil class="size-4" />
          {{ activeRequest && activeRequest.status === "paid" ? "Manage" : "Review & process" }}
        </Button>
      </template>
    </FormDialog>

    <!-- Manage / process -->
    <FormDialog
      v-model:open="manageOpen"
      :title="activeRequest ? `Process payout — ${activeRequest.artistName}` : 'Process payout'"
      :error="manageOpen ? errorMessage : ''"
      content-class="max-w-2xl"
    >
      <template v-if="activeRequest && adminDrafts[activeRequest.id]">
        <div class="dialog-section">
          <p class="dialog-section-title">Financials</p>
          <div class="dialog-grid">
            <div class="field-row">
              <label :for="`payout-amount-${activeRequest.id}`">Payout amount</label>
              <Input :id="`payout-amount-${activeRequest.id}`" v-model="adminDrafts[activeRequest.id].amount" type="number" min="0.00000001" step="0.00000001" :disabled="activeRequest.status === 'rejected'" />
            </div>
            <div class="field-row">
              <label :for="`payout-bank-charge-${activeRequest.id}`">Bank charges %</label>
              <Input :id="`payout-bank-charge-${activeRequest.id}`" v-model="adminDrafts[activeRequest.id].bankChargePct" type="number" min="0" max="100" step="0.01" :disabled="activeRequest.status === 'rejected'" />
              <div class="detail-copy">Net after bank charges: {{ formatMoney(draftNetAfterBankCharge(activeRequest)) }}</div>
            </div>
            <div class="field-row">
              <label :for="`payout-service-charge-${activeRequest.id}`">Tipalti service fee</label>
              <Input :id="`payout-service-charge-${activeRequest.id}`" v-model="adminDrafts[activeRequest.id].serviceCharge" type="number" min="0" step="0.00000001" :disabled="!canEditServiceCharge(activeRequest)" />
              <div class="detail-copy">Display only — does not change the wallet.</div>
            </div>
            <div v-if="activeRequest.status !== 'rejected' && activeRequest.status !== 'paid'" class="field-row dialog-align-end">
              <Button variant="secondary" type="button" :disabled="savingPayoutFinancialsId === activeRequest.id" @click="savePayoutFinancials(activeRequest)">
                {{ savingPayoutFinancialsId === activeRequest.id ? "Saving…" : "Save financials" }}
              </Button>
            </div>
          </div>
        </div>

        <div v-if="activeRequest.status === 'pending' || activeRequest.status === 'approved'" class="dialog-section">
          <p class="dialog-section-title">Processing</p>
          <div class="dialog-grid">
            <div class="field-row dialog-col-2">
              <label :for="`admin-note-${activeRequest.id}`">Admin note</label>
              <Textarea :id="`admin-note-${activeRequest.id}`" v-model="adminDrafts[activeRequest.id].adminNotes" rows="3" />
            </div>
            <template v-if="activeRequest.status === 'approved'">
              <div class="field-row">
                <label :for="`payment-method-${activeRequest.id}`">Payment method</label>
                <NativeSelect :id="`payment-method-${activeRequest.id}`" v-model="adminDrafts[activeRequest.id].paymentMethod">
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="esewa">eSewa</option>
                  <option value="khalti">Khalti</option>
                  <option value="other">Other</option>
                </NativeSelect>
              </div>
              <div class="field-row">
                <label :for="`payment-reference-${activeRequest.id}`">Payment reference</label>
                <Input :id="`payment-reference-${activeRequest.id}`" v-model="adminDrafts[activeRequest.id].paymentReference" type="text" />
              </div>
            </template>
          </div>
        </div>

        <p v-if="activeRequest.status === 'paid'" class="field-note">
          Reversing removes this admin-recorded payout history entry and restores the artist wallet balance. Display-only fees are not reversed through the ledger.
        </p>
      </template>

      <template #footer>
        <Button variant="ghost" type="button" @click="manageOpen = false">Close</Button>
        <template v-if="activeRequest">
          <Button v-if="activeRequest.status === 'pending' || activeRequest.status === 'approved'" variant="destructive" type="button" :disabled="rejectingRequestId === activeRequest.id" @click="rejectRequest(activeRequest)">
            {{ rejectingRequestId === activeRequest.id ? "Rejecting…" : "Reject" }}
          </Button>
          <Button v-if="activeRequest.status === 'pending'" type="button" :disabled="approvingRequestId === activeRequest.id" @click="approveRequest(activeRequest)">
            {{ approvingRequestId === activeRequest.id ? "Approving…" : "Approve" }}
          </Button>
          <Button v-if="activeRequest.status === 'approved'" type="button" :disabled="payingRequestId === activeRequest.id" @click="markRequestPaid(activeRequest)">
            {{ payingRequestId === activeRequest.id ? "Marking…" : "Mark paid" }}
          </Button>
          <Button v-if="canReverseManualPayout(activeRequest)" variant="destructive" type="button" :disabled="reversingManualPayoutId === activeRequest.id" @click="reverseManualPayout(activeRequest)">
            {{ reversingManualPayoutId === activeRequest.id ? "Reversing…" : "Reverse manual payout" }}
          </Button>
        </template>
      </template>
    </FormDialog>
  </div>
</template>

<style scoped>
.payout-filter {
  max-width: 280px;
  margin-bottom: 16px;
}

.dialog-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr 1fr;
}

.dialog-col-2 {
  grid-column: 1 / -1;
}

.dialog-align-end {
  align-self: end;
}

.dialog-section + .dialog-section {
  margin-top: 18px;
}

.dialog-section-title {
  margin: 0 0 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.detail-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.detail-item {
  display: grid;
  gap: 3px;
}

.detail-col-2 {
  grid-column: 1 / -1;
}

.detail-item dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.detail-item dd {
  margin: 0;
  font-size: 14px;
  font-weight: 560;
}

@media (max-width: 560px) {
  .dialog-grid,
  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
