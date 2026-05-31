<script setup lang="ts">
import type {
  AdminPayoutsResponse,
  PayoutPaymentMethod,
  PayoutRequestRecord,
  PayoutRequestStatus,
} from "~~/types/payouts"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

type StatusFilter = "all" | PayoutRequestStatus

interface AdminDraft {
  adminNotes: string
  paymentMethod: PayoutPaymentMethod
  paymentReference: string
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
const approvingRequestId = ref("")
const rejectingRequestId = ref("")
const payingRequestId = ref("")
const adminDrafts = reactive<Record<string, AdminDraft>>({})
const { confirmAction } = useConfirmAction()

const { data, error, pending, refresh } = useLazyFetch<AdminPayoutsResponse>("/api/admin/payouts")

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
const filteredRequests = computed(() => {
  if (statusFilter.value === "all") {
    return requests.value
  }

  return requests.value.filter((request) => request.status === statusFilter.value)
})
const payoutTableExpandedRowIds = computed(() => filteredRequests.value.map((request) => request.id))

const payoutRequestColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0) },
  { key: "requested", label: "Requested", accessor: (row: any) => row.createdAt },
  { key: "bank", label: "Bank destination", accessor: (row: any) => row.bankDetails?.bankName || "" },
  { key: "payment", label: "Payment", accessor: (row: any) => row.paymentMethod || "" },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
]

watch(
  requests,
  (value) => {
    for (const request of value) {
      adminDrafts[request.id] = {
        adminNotes: request.adminNotes ?? adminDrafts[request.id]?.adminNotes ?? "",
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

function setError(error: any, fallback: string) {
  errorMessage.value = error?.data?.statusMessage || error?.message || fallback
  successMessage.value = ""
}

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function formatMoney(value: string) {
  return `$${Number(value).toFixed(2)}`
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available"
  }

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

async function approveRequest(request: PayoutRequestRecord) {
  const confirmed = await confirmAction({
    title: "Approve payout request",
    description: `Approve ${formatMoney(request.amount)} payout request for ${request.artistName}?`,
    confirmLabel: "Approve payout",
    variant: "default",
  })

  if (!confirmed) {
    return
  }

  approvingRequestId.value = request.id
  resetMessages()

  try {
    await $fetch(`/api/admin/payouts/${request.id}/approve`, {
      method: "POST",
      body: {
        adminNotes: adminDrafts[request.id]?.adminNotes || null,
      },
    })

    await refresh()
    setSuccess(`Approved payout request for ${request.artistName}.`)
  } catch (error: any) {
    setError(error, "Unable to approve this payout request.")
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
  })

  if (!confirmed) {
    return
  }

  rejectingRequestId.value = request.id
  resetMessages()

  try {
    await $fetch(`/api/admin/payouts/${request.id}/reject`, {
      method: "POST",
      body: {
        adminNotes: adminDrafts[request.id]?.adminNotes || null,
      },
    })

    await refresh()
    setSuccess(`Rejected payout request for ${request.artistName}.`)
  } catch (error: any) {
    setError(error, "Unable to reject this payout request.")
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
    setSuccess(`Marked payout request for ${request.artistName} as paid.`)
  } catch (error: any) {
    setError(error, "Unable to mark this payout request as paid.")
  } finally {
    payingRequestId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <DataPanel
      title="Payout operations"
      eyebrow="Wallet control"
      description="Pending requests reserve balance immediately. Approval and mark-paid are status transitions, while rejection restores balance through the ledger."
    >
      <div class="form-grid">
        <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
        <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>
        <AppAlert v-if="error" variant="destructive">{{ error.statusMessage || "Unable to load payout requests right now." }}</AppAlert>

        <div class="metrics">
          <StatCard
            v-for="metric in summaryMetrics"
            :key="metric.label"
            :label="metric.label"
            :value="metric.value"
            :footnote="metric.footnote"
            :tone="metric.tone"
          />
        </div>

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

        <DashboardSkeleton v-if="pending" :rows="5" />

        <DataTable
          v-else
          :columns="payoutRequestColumns"
          :data="filteredRequests"
          empty-title="No payout requests"
          empty-description="No payout requests match this filter yet."
          row-key="id"
          :expanded-row-ids="payoutTableExpandedRowIds"
        >
          <template #cell-artist="{ row: request }">
            <strong>{{ request.artistName }}</strong>
            <div class="detail-copy">{{ request.artistNotes || "No artist note" }}</div>
          </template>
          <template #cell-amount="{ row: request }">
            <strong class="tabular-nums">{{ formatMoney(request.amount) }}</strong>
          </template>
          <template #cell-requested="{ row: request }">{{ formatDateTime(request.createdAt) }}</template>
          <template #cell-bank="{ row: request }">
            <span>{{ request.bankDetails?.accountName || "Not set" }}</span>
            <div class="detail-copy">
              {{
                request.bankDetails
                  ? `${request.bankDetails.bankName} / ${request.bankDetails.accountNumber}`
                  : "Not set"
              }}
            </div>
          </template>
          <template #cell-payment="{ row: request }">
            <span>{{ request.paymentMethod || "Not set" }}</span>
            <div class="detail-copy">{{ request.paymentReference || "No reference" }}</div>
          </template>
          <template #cell-status="{ row: request }">
            <StatusBadge :tone="statusTone(request.status)">{{ formatStatus(request.status) }}</StatusBadge>
          </template>
          <template #expandedRow="{ row: request }">
            <div class="form-grid">
              <div class="summary-table">
                <div class="summary-row">
                  <span class="detail-copy">Reviewed / paid</span>
                  <strong>{{ formatDateTime(request.reviewedAt) }} / {{ formatDateTime(request.paidAt) }}</strong>
                </div>
              </div>

              <div v-if="request.status === 'pending' || request.status === 'approved'" class="catalog-track-list">
                <div class="field-row">
                  <label :for="`admin-note-${request.id}`">Admin note</label>
                  <Textarea
                    :id="`admin-note-${request.id}`"
                    v-model="adminDrafts[request.id].adminNotes"
                    rows="3"
                  />
                </div>

                <div v-if="request.status === 'approved'" class="catalog-grid">
                  <div class="field-row">
                    <label :for="`payment-method-${request.id}`">Payment method</label>
                    <NativeSelect :id="`payment-method-${request.id}`" v-model="adminDrafts[request.id].paymentMethod">
                      <option value="bank_transfer">Bank transfer</option>
                      <option value="esewa">eSewa</option>
                      <option value="khalti">Khalti</option>
                      <option value="other">Other</option>
                    </NativeSelect>
                  </div>

                  <div class="field-row">
                    <label :for="`payment-reference-${request.id}`">Payment reference</label>
                    <Input
                      :id="`payment-reference-${request.id}`"
                      v-model="adminDrafts[request.id].paymentReference"
                      type="text"
                    />
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <Button
                    v-if="request.status === 'pending'"
                    :disabled="approvingRequestId === request.id"
                    @click="approveRequest(request)"
                  >
                    {{ approvingRequestId === request.id ? "Approving..." : "Approve" }}
                  </Button>
                  <Button
                    variant="destructive"
                    :disabled="rejectingRequestId === request.id"
                    @click="rejectRequest(request)"
                  >
                    {{ rejectingRequestId === request.id ? "Rejecting..." : "Reject" }}
                  </Button>
                  <Button
                    v-if="request.status === 'approved'"
                    variant="secondary"
                    :disabled="payingRequestId === request.id"
                    @click="markRequestPaid(request)"
                  >
                    {{ payingRequestId === request.id ? "Marking..." : "Mark paid" }}
                  </Button>
                </div>
              </div>

              <div v-else class="muted-copy">
                {{ request.adminNotes || "No admin note saved for this request." }}
              </div>
            </div>
          </template>
        </DataTable>
      </div>
    </DataPanel>
  </div>
</template>
