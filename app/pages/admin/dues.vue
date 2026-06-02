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
const { confirmAction } = useConfirmAction()

const { data, pending, error, refresh } = useLazyFetch<AdminDuesResponse>("/api/admin/dues")

const dues = computed(() => data.value?.dues ?? [])
const artistOptions = computed(() => data.value?.artistOptions ?? [])
const summary = computed(() => data.value?.summary ?? {
  dueCount: 0,
  pendingAcceptanceCount: 0,
  unpaidCount: 0,
  paidCount: 0,
  cancelledCount: 0,
  pendingAcceptanceAmount: "0.00000000",
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
const dueTableExpandedRowIds = computed(() => filteredDues.value.map((due) => due.id))

const dueLedgerColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "due", label: "Due", accessor: (row: any) => row.title },
  { key: "date", label: "Due date", accessor: (row: any) => row.dueDate },
  { key: "ledger", label: "Ledger entry", accessor: (row: any) => row.ledgerEntryId || "" },
  { key: "updated", label: "Updated", accessor: (row: any) => row.updatedAt },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0) },
]

const summaryMetrics = computed(() => [
  {
    label: "Awaiting acceptance",
    value: formatMoney(summary.value.pendingAcceptanceAmount),
    footnote: `${summary.value.pendingAcceptanceCount.toLocaleString()} sent to artists`,
    tone: "alt" as const,
  },
  {
    label: "Accepted dues",
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
    footnote: `${summary.value.cancelledCount.toLocaleString()} reversed fees`,
    tone: "default" as const,
  },
  {
    label: "Artists charged",
    value: summary.value.artistCount.toLocaleString(),
    footnote: `${summary.value.dueCount.toLocaleString()} total dues`,
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

function statusTone(status: AdminDueStatus) {
  switch (status) {
    case "pending_acceptance":
      return "warning"
    case "unpaid":
      return "warning"
    case "paid":
      return "success"
    case "cancelled":
      return "info"
  }
}

function resetCreateForm() {
  createForm.title = ""
  createForm.amount = ""
  createForm.dueDate = ""
}

async function createDue() {
  const confirmed = await confirmAction({
    title: "Create due",
    description: `Send ${formatMoney(createForm.amount)} due "${createForm.title}" to the selected artist?`,
    confirmLabel: "Create due",
    variant: "default",
    adminVerification: { action: "due.created" },
  })

  if (!confirmed) {
    return
  }

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
    setSuccess("Due sent to the artist for acceptance. Wallet balance will not change until they accept.")
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

  const confirmed = await confirmAction({
    title: "Update due",
    description: `Update due "${due.title}" for ${due.artistName}?`,
    confirmLabel: "Save due",
    variant: "default",
    adminVerification: { action: "due.updated" },
  })

  if (!confirmed) {
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
  const confirmed = await confirmAction({
    title: "Mark due paid",
    description: `Mark ${formatMoney(due.amount)} due "${due.title}" for ${due.artistName} as paid?`,
    confirmLabel: "Mark paid",
    variant: "default",
    adminVerification: { action: "due.marked_paid" },
  })

  if (!confirmed) {
    return
  }

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
  const confirmed = await confirmAction({
    title: "Cancel due",
    description: `Cancel ${formatMoney(due.amount)} due "${due.title}" for ${due.artistName}?`,
    confirmLabel: "Cancel due",
    variant: "destructive",
    adminVerification: { action: "due.cancelled" },
  })

  if (!confirmed) {
    return
  }

  cancellingDueId.value = due.id
  resetMessages()

  try {
    await $fetch(`/api/admin/dues/${due.id}/cancel`, {
      method: "POST",
    })

    await refresh()
    setSuccess(
      due.status === "pending_acceptance"
        ? `Due for ${due.artistName} cancelled before wallet deduction.`
        : `Due for ${due.artistName} cancelled and reversed in the wallet ledger.`,
    )
  } catch (fetchError: any) {
    setError(fetchError, "Unable to cancel this due.")
  } finally {
    cancellingDueId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <DataPanel
      title="Dues"
      title-level="h1"
      eyebrow="Fees management"
      description="Create due requests, wait for artist acceptance, then manage paid or cancelled wallet-impacting fees."
    >
      <div class="stack">
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

        <AppAlert v-if="error" variant="destructive">
          {{ error.statusMessage || "Unable to load dues right now." }}
        </AppAlert>
        <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
        <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>
      </div>
    </DataPanel>

    <DataPanel
      title="Create due"
      eyebrow="New fee"
      description="A new due is sent to the artist first. Their wallet is deducted only after they accept it."
    >
      <form class="dues-form-grid" @submit.prevent="createDue">
        <div class="field-row">
          <label for="due-artist">Artist</label>
          <NativeSelect id="due-artist" v-model="createForm.artistId" required>
            <option value="" disabled>Select artist</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">
              {{ artist.label }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="due-title">Title</label>
          <Input id="due-title" v-model="createForm.title" placeholder="Distribution fee" required />
        </div>

        <div class="field-row">
          <label for="due-amount">Amount</label>
          <Input id="due-amount" v-model="createForm.amount" type="number" min="0.00000001" step="0.00000001" placeholder="0.00" required />
        </div>

        <div class="field-row">
          <label for="due-date">Due date</label>
          <AppDatePicker id="due-date" v-model="createForm.dueDate" placeholder="No due date" />
        </div>

        <div class="dues-form-actions">
          <Button type="submit" :disabled="creating || !createForm.artistId">
            {{ creating ? "Creating..." : "Create due" }}
          </Button>
        </div>
      </form>
    </DataPanel>

    <DataPanel
      title="Due ledger"
      eyebrow="Manage fees"
      description="Pending dues can be edited without touching wallets. After acceptance, amount changes post only the delta."
    >
      <div class="dues-filter-grid">
        <div class="field-row">
          <label for="filter-artist">Artist</label>
          <NativeSelect id="filter-artist" v-model="filters.artistId">
            <option :value="ALL_FILTER">All artists</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">
              {{ artist.label }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="filter-status">Status</label>
          <NativeSelect id="filter-status" v-model="filters.status">
            <option :value="ALL_FILTER">All statuses</option>
            <option value="pending_acceptance">Awaiting acceptance</option>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
        </div>
      </div>

      <DashboardSkeleton v-if="pending && !data" :rows="5" />

      <DataTable
        v-else
        :columns="dueLedgerColumns"
        :data="filteredDues"
        empty-title="No dues"
        empty-description="No dues match the current filters."
        row-key="id"
        :expanded-row-ids="dueTableExpandedRowIds"
      >
        <template #cell-artist="{ row: due }">
          <strong>{{ due.artistName }}</strong>
        </template>
        <template #cell-due="{ row: due }">{{ due.title }}</template>
        <template #cell-date="{ row: due }">{{ formatDate(due.dueDate) }}</template>
        <template #cell-ledger="{ row: due }">
          <span class="mono">{{ due.ledgerEntryId || (due.status === "pending_acceptance" ? "Not posted" : "No amount change") }}</span>
        </template>
        <template #cell-updated="{ row: due }">
          <span>{{ formatDateTime(due.updatedAt) }}</span>
          <div class="detail-copy">Created {{ formatDateTime(due.createdAt) }}</div>
        </template>
        <template #cell-status="{ row: due }">
          <StatusBadge :tone="statusTone(due.status)">{{ statusLabel(due.status) }}</StatusBadge>
        </template>
        <template #cell-amount="{ row: due }">
          <strong class="tabular-nums">{{ formatMoney(due.amount) }}</strong>
        </template>
        <template #expandedRow="{ row: due }">
          <div v-if="editDrafts[due.id]" class="form-grid">
            <div class="dues-edit-grid">
              <div class="field-row">
                <label :for="`due-title-${due.id}`">Title</label>
                <Input :id="`due-title-${due.id}`" v-model="editDrafts[due.id].title" :disabled="due.status === 'cancelled'" />
              </div>

              <div class="field-row">
                <label :for="`due-amount-${due.id}`">Amount</label>
                <Input :id="`due-amount-${due.id}`" v-model="editDrafts[due.id].amount" type="number" min="0.00000001" step="0.00000001" :disabled="due.status === 'cancelled'" />
              </div>

              <div class="field-row">
                <label :for="`due-date-${due.id}`">Due date</label>
                <AppDatePicker :id="`due-date-${due.id}`" v-model="editDrafts[due.id].dueDate" placeholder="No due date" :disabled="due.status === 'cancelled'" />
              </div>
            </div>

            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Accepted</span>
                <strong>{{ formatDateTime(due.acceptedAt) }}{{ due.acceptedByName ? ` / ${due.acceptedByName}` : "" }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Paid / cancelled</span>
                <strong>{{ formatDateTime(due.paidAt) }} / {{ formatDateTime(due.cancelledAt) }}</strong>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button type="button" :disabled="due.status === 'cancelled' || updatingDueId === due.id || markingPaidDueId === due.id || cancellingDueId === due.id" @click="updateDue(due)">
                {{ updatingDueId === due.id ? "Saving..." : "Save changes" }}
              </Button>
              <Button v-if="due.status === 'unpaid'" variant="secondary" type="button" :disabled="markingPaidDueId === due.id || updatingDueId === due.id || cancellingDueId === due.id" @click="markDuePaid(due)">
                {{ markingPaidDueId === due.id ? "Marking..." : "Mark paid" }}
              </Button>
              <Button v-if="due.status !== 'cancelled'" variant="destructive" type="button" :disabled="cancellingDueId === due.id || updatingDueId === due.id || markingPaidDueId === due.id" @click="cancelDue(due)">
                {{ cancellingDueId === due.id ? "Cancelling..." : "Cancel due" }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </DataPanel>
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
