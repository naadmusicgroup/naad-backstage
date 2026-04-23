<script setup lang="ts">
import type {
  AdminDueMutationInput,
  AdminDueRecord,
  AdminDuesResponse,
  AdminDueStatus,
  AdminDueUpdateInput,
} from "~~/types/admin"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const ALL_FILTER = "all"

interface DueDraft {
  title: string
  amount: string
  dueDate: string
}

const monthDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

const createForm = reactive({
  artistId: "",
  title: "",
  amount: "",
  dueDate: "",
})
const filters = reactive({
  artistId: ALL_FILTER,
  status: ALL_FILTER,
})
const successMessage = ref("")
const errorMessage = ref("")
const creating = ref(false)
const updatingDueId = ref("")
const markingPaidDueId = ref("")
const cancellingDueId = ref("")
const editDrafts = reactive<Record<string, DueDraft>>({})

const { data, pending, error, refresh } = useLazyFetch<AdminDuesResponse>("/api/admin/dues")

const dues = computed(() => data.value?.dues ?? [])
const artistOptions = computed(() => data.value?.artistOptions ?? [])
const summary = computed(() => data.value?.summary ?? {
  dueCount: 0,
  unpaidCount: 0,
  paidCount: 0,
  cancelledCount: 0,
  activeAmount: "0.00000000",
  unpaidAmount: "0.00000000",
  paidAmount: "0.00000000",
  cancelledAmount: "0.00000000",
  artistCount: 0,
})

const filteredDues = computed(() => dues.value.filter((due) => (
  (filters.artistId === ALL_FILTER || due.artistId === filters.artistId)
  && (filters.status === ALL_FILTER || due.status === filters.status)
)))

const summaryMetrics = computed(() => [
  {
    label: "Active dues",
    value: formatMoney(summary.value.activeAmount),
    footnote: `${summary.value.unpaidCount.toLocaleString()} unpaid / ${summary.value.paidCount.toLocaleString()} paid`,
    tone: "accent" as const,
  },
  {
    label: "Unpaid",
    value: formatMoney(summary.value.unpaidAmount),
    footnote: "Still outstanding from artist accounts",
    tone: "alt" as const,
  },
  {
    label: "Cancelled",
    value: formatMoney(summary.value.cancelledAmount),
    footnote: `${summary.value.cancelledCount.toLocaleString()} reversed fee rows`,
    tone: "default" as const,
  },
  {
    label: "Artists charged",
    value: summary.value.artistCount.toLocaleString(),
    footnote: `${summary.value.dueCount.toLocaleString()} total due rows`,
    tone: "default" as const,
  },
])

watch(
  dues,
  (value) => {
    for (const due of value) {
      editDrafts[due.id] = {
        title: due.title,
        amount: decimalInputValue(due.amount),
        dueDate: due.dueDate ?? "",
      }
    }
  },
  { immediate: true },
)

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function setError(error: any, fallback: string) {
  errorMessage.value = error?.data?.statusMessage || error?.message || fallback
  successMessage.value = ""
}

function resetMessages() {
  successMessage.value = ""
  errorMessage.value = ""
}

function formatMoney(value: string | null | undefined) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function formatDate(value: string | null) {
  if (!value) {
    return "No due date"
  }

  return monthDayFormatter.format(new Date(`${value}T00:00:00Z`))
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not set"
  }

  return dateTimeFormatter.format(new Date(value))
}

function decimalInputValue(value: string) {
  return Number(value || 0).toFixed(2)
}

function statusLabel(status: AdminDueStatus) {
  switch (status) {
    case "unpaid":
      return "Unpaid"
    case "paid":
      return "Paid"
    case "cancelled":
      return "Cancelled"
  }
}

function statusClass(status: AdminDueStatus) {
  switch (status) {
    case "unpaid":
      return "status-processing"
    case "paid":
      return "status-completed"
    case "cancelled":
      return "status-reversed"
  }
}

function resetCreateForm() {
  createForm.title = ""
  createForm.amount = ""
  createForm.dueDate = ""
}

async function createDue() {
  creating.value = true
  resetMessages()

  try {
    const body: AdminDueMutationInput = {
      artistId: createForm.artistId,
      title: createForm.title,
      amount: createForm.amount,
      dueDate: createForm.dueDate || null,
    }

    await $fetch("/api/admin/dues", {
      method: "POST",
      body,
    })

    await refresh()
    resetCreateForm()
    setSuccess("Due created and posted to the artist wallet ledger.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to create this due.")
  } finally {
    creating.value = false
  }
}

async function updateDue(due: AdminDueRecord) {
  const draft = editDrafts[due.id]

  if (!draft) {
    return
  }

  updatingDueId.value = due.id
  resetMessages()

  try {
    const body: AdminDueUpdateInput = {
      title: draft.title,
      amount: draft.amount,
      dueDate: draft.dueDate || null,
    }

    await $fetch(`/api/admin/dues/${due.id}`, {
      method: "PATCH",
      body,
    })

    await refresh()
    setSuccess(`Due for ${due.artistName} updated.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to update this due.")
  } finally {
    updatingDueId.value = ""
  }
}

async function markDuePaid(due: AdminDueRecord) {
  markingPaidDueId.value = due.id
  resetMessages()

  try {
    await $fetch(`/api/admin/dues/${due.id}/mark-paid`, {
      method: "POST",
    })

    await refresh()
    setSuccess(`Due for ${due.artistName} marked as paid.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to mark this due as paid.")
  } finally {
    markingPaidDueId.value = ""
  }
}

async function cancelDue(due: AdminDueRecord) {
  if (import.meta.client && !window.confirm(`Cancel ${formatMoney(due.amount)} due "${due.title}" for ${due.artistName}?`)) {
    return
  }

  cancellingDueId.value = due.id
  resetMessages()

  try {
    await $fetch(`/api/admin/dues/${due.id}/cancel`, {
      method: "POST",
    })

    await refresh()
    setSuccess(`Due for ${due.artistName} cancelled and reversed in the wallet ledger.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to cancel this due.")
  } finally {
    cancellingDueId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Dues"
      eyebrow="Fees management"
      description="Create, edit, mark paid, and cancel one-time fees. Active dues reduce artist withdrawable balances; cancelled dues post a reversal."
    >
      <div class="stack">
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

        <div v-if="error" class="banner error">
          {{ error.statusMessage || "Unable to load dues right now." }}
        </div>
        <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="banner">{{ successMessage }}</div>
      </div>
    </SectionCard>

    <SectionCard
      title="Create due"
      eyebrow="New fee"
      description="A new due is immediately posted as a negative wallet ledger entry."
    >
      <form class="dues-form-grid" @submit.prevent="createDue">
        <div class="field-row">
          <label for="due-artist">Artist</label>
          <select id="due-artist" v-model="createForm.artistId" class="input" required>
            <option value="" disabled>Select artist</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">
              {{ artist.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="due-title">Title</label>
          <input id="due-title" v-model="createForm.title" class="input" placeholder="Distribution fee" required>
        </div>

        <div class="field-row">
          <label for="due-amount">Amount</label>
          <input id="due-amount" v-model="createForm.amount" class="input" type="number" min="0.00000001" step="0.00000001" placeholder="0.00" required>
        </div>

        <div class="field-row">
          <label for="due-date">Due date</label>
          <input id="due-date" v-model="createForm.dueDate" class="input" type="date">
        </div>

        <div class="dues-form-actions">
          <button class="button" type="submit" :disabled="creating || !createForm.artistId">
            {{ creating ? "Creating..." : "Create due" }}
          </button>
        </div>
      </form>
    </SectionCard>

    <SectionCard
      title="Due ledger"
      eyebrow="Manage fees"
      description="Changing an amount posts only the delta. Marking paid keeps the balance deduction; cancelling reverses it."
    >
      <div class="dues-filter-grid">
        <div class="field-row">
          <label for="filter-artist">Artist</label>
          <select id="filter-artist" v-model="filters.artistId" class="input">
            <option :value="ALL_FILTER">All artists</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">
              {{ artist.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="filter-status">Status</label>
          <select id="filter-status" v-model="filters.status" class="input">
            <option :value="ALL_FILTER">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div v-if="pending && !data" class="muted-copy">Loading dues...</div>
      <div v-else-if="!filteredDues.length" class="muted-copy">
        No dues match the current filters.
      </div>

      <div v-else class="catalog-list">
        <article v-for="due in filteredDues" :key="due.id" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ due.artistName }}</strong>
              <span class="detail-copy">{{ due.title }} / {{ formatDate(due.dueDate) }}</span>
            </div>
            <div class="table-actions">
              <strong>{{ formatMoney(due.amount) }}</strong>
              <span class="status-pill" :class="statusClass(due.status)">{{ statusLabel(due.status) }}</span>
            </div>
          </div>

          <div class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Ledger entry</span>
              <strong class="mono">{{ due.ledgerEntryId || "No amount change" }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Paid / cancelled</span>
              <strong>{{ formatDateTime(due.paidAt) }} / {{ formatDateTime(due.cancelledAt) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Created / updated</span>
              <strong>{{ formatDateTime(due.createdAt) }} / {{ formatDateTime(due.updatedAt) }}</strong>
            </div>
          </div>

          <div v-if="editDrafts[due.id]" class="dues-edit-grid">
            <div class="field-row">
              <label :for="`due-title-${due.id}`">Title</label>
              <input :id="`due-title-${due.id}`" v-model="editDrafts[due.id].title" class="input" :disabled="due.status === 'cancelled'">
            </div>

            <div class="field-row">
              <label :for="`due-amount-${due.id}`">Amount</label>
              <input :id="`due-amount-${due.id}`" v-model="editDrafts[due.id].amount" class="input" type="number" min="0.00000001" step="0.00000001" :disabled="due.status === 'cancelled'">
            </div>

            <div class="field-row">
              <label :for="`due-date-${due.id}`">Due date</label>
              <input :id="`due-date-${due.id}`" v-model="editDrafts[due.id].dueDate" class="input" type="date" :disabled="due.status === 'cancelled'">
            </div>
          </div>

          <div class="button-row">
            <button class="button" type="button" :disabled="due.status === 'cancelled' || updatingDueId === due.id || markingPaidDueId === due.id || cancellingDueId === due.id" @click="updateDue(due)">
              {{ updatingDueId === due.id ? "Saving..." : "Save changes" }}
            </button>
            <button v-if="due.status === 'unpaid'" class="button button-secondary" type="button" :disabled="markingPaidDueId === due.id || updatingDueId === due.id || cancellingDueId === due.id" @click="markDuePaid(due)">
              {{ markingPaidDueId === due.id ? "Marking..." : "Mark paid" }}
            </button>
            <button v-if="due.status !== 'cancelled'" class="button button-secondary button-danger" type="button" :disabled="cancellingDueId === due.id || updatingDueId === due.id || markingPaidDueId === due.id" @click="cancelDue(due)">
              {{ cancellingDueId === due.id ? "Cancelling..." : "Cancel due" }}
            </button>
          </div>
        </article>
      </div>
    </SectionCard>
  </div>
</template>

<style scoped>
.dues-form-grid,
.dues-filter-grid,
.dues-edit-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.dues-form-actions {
  display: flex;
  align-items: end;
}
</style>
