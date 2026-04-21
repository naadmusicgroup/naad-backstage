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

async function approveRequest(request: PayoutRequestRecord) {
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
    <SectionCard
      title="Payout operations"
      eyebrow="Wallet control"
      description="Pending requests reserve balance immediately. Approval and mark-paid are status transitions, while rejection restores balance through the ledger."
    >
      <div class="form-grid">
        <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="banner">{{ successMessage }}</div>
        <div v-if="error" class="banner error">{{ error.statusMessage || "Unable to load payout requests right now." }}</div>

        <div class="metrics">
          <MetricCard
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
          <select id="payout-status-filter" v-model="statusFilter" class="input">
            <option value="all">All requests</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <div v-if="pending" class="status-message">Loading payout requests...</div>

        <div v-else-if="!filteredRequests.length" class="muted-copy">
          No payout requests match this filter yet.
        </div>

        <div v-else class="catalog-list">
          <article v-for="request in filteredRequests" :key="request.id" class="catalog-item">
            <div class="catalog-header">
              <div class="summary-copy">
                <strong>{{ request.artistName }}</strong>
                <span class="detail-copy">{{ formatMoney(request.amount) }} requested on {{ formatDateTime(request.createdAt) }}</span>
              </div>
              <span class="status-pill" :class="statusClass(request.status)">{{ formatStatus(request.status) }}</span>
            </div>

            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Artist note</span>
                <strong>{{ request.artistNotes || "None" }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Reviewed at</span>
                <strong>{{ formatDateTime(request.reviewedAt) }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Paid at</span>
                <strong>{{ formatDateTime(request.paidAt) }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Payment method</span>
                <strong>{{ request.paymentMethod || "Not set" }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Reference</span>
                <strong>{{ request.paymentReference || "Not set" }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Bank account</span>
                <strong>{{ request.bankDetails?.accountName || "Not set" }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Bank destination</span>
                <strong>
                  {{
                    request.bankDetails
                      ? `${request.bankDetails.bankName} / ${request.bankDetails.accountNumber}`
                      : "Not set"
                  }}
                </strong>
              </div>
            </div>

            <div v-if="request.status === 'pending' || request.status === 'approved'" class="catalog-track-list">
              <div class="field-row">
                <label :for="`admin-note-${request.id}`">Admin note</label>
                <textarea
                  :id="`admin-note-${request.id}`"
                  v-model="adminDrafts[request.id].adminNotes"
                  class="input"
                  rows="3"
                />
              </div>

              <div v-if="request.status === 'approved'" class="catalog-grid">
                <div class="field-row">
                  <label :for="`payment-method-${request.id}`">Payment method</label>
                  <select :id="`payment-method-${request.id}`" v-model="adminDrafts[request.id].paymentMethod" class="input">
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="esewa">eSewa</option>
                    <option value="khalti">Khalti</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div class="field-row">
                  <label :for="`payment-reference-${request.id}`">Payment reference</label>
                  <input
                    :id="`payment-reference-${request.id}`"
                    v-model="adminDrafts[request.id].paymentReference"
                    class="input"
                    type="text"
                  />
                </div>
              </div>

              <div class="button-row">
                <button
                  v-if="request.status === 'pending'"
                  class="button"
                  :disabled="approvingRequestId === request.id"
                  @click="approveRequest(request)"
                >
                  {{ approvingRequestId === request.id ? "Approving..." : "Approve" }}
                </button>
                <button
                  class="button button-secondary button-danger"
                  :disabled="rejectingRequestId === request.id"
                  @click="rejectRequest(request)"
                >
                  {{ rejectingRequestId === request.id ? "Rejecting..." : "Reject" }}
                </button>
                <button
                  v-if="request.status === 'approved'"
                  class="button button-secondary"
                  :disabled="payingRequestId === request.id"
                  @click="markRequestPaid(request)"
                >
                  {{ payingRequestId === request.id ? "Marking..." : "Mark paid" }}
                </button>
              </div>
            </div>

            <div v-else class="muted-copy">
              {{ request.adminNotes || "No admin note saved for this request." }}
            </div>
          </article>
        </div>
      </div>
    </SectionCard>
  </div>
</template>
