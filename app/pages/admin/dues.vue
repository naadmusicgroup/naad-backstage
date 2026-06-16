<script setup lang="ts">
import { Ban, Check, Eye, Pencil, Plus } from "lucide-vue-next"
import type { RowAction } from "~/components/RowActions.vue"
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
const editForm = reactive({
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
const savingEdit = ref(false)
const rowBusyId = ref("")

// Dialog state
const createOpen = ref(false)
const editOpen = ref(false)
const detailsOpen = ref(false)
const activeDue = ref<AdminDueRecord | null>(null)

const { confirmAction } = useConfirmAction()

const { data, pending, error, refresh } = useLazyFetch<AdminDuesResponse>("/api/admin/dues")

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

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

const dueLedgerColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "due", label: "Due", accessor: (row: any) => row.title },
  { key: "date", label: "Due date", accessor: (row: any) => row.dueDate },
  { key: "updated", label: "Updated", accessor: (row: any) => row.updatedAt },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0) },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
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

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function setError(caught: any, fallback: string) {
  errorMessage.value = caught?.data?.statusMessage || caught?.message || fallback
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

// ── Row kebab ──
function dueActions(due: AdminDueRecord): RowAction[] {
  const actions: RowAction[] = [{ key: "details", label: "View details", icon: Eye }]

  if (due.status !== "cancelled") {
    actions.push({ key: "edit", label: "Edit", icon: Pencil })
  }
  if (due.status === "unpaid") {
    actions.push({ key: "markPaid", label: "Mark paid", icon: Check, separatorBefore: true })
  }
  if (due.status !== "cancelled") {
    actions.push({ key: "cancel", label: "Cancel due", icon: Ban, variant: "destructive", separatorBefore: due.status !== "unpaid" })
  }

  return actions
}

function onDueAction(key: string, due: AdminDueRecord) {
  if (key === "details") {
    openDetails(due)
  } else if (key === "edit") {
    openEdit(due)
  } else if (key === "markPaid") {
    void markDuePaid(due)
  } else if (key === "cancel") {
    void cancelDue(due)
  }
}

function openDetails(due: AdminDueRecord) {
  activeDue.value = due
  detailsOpen.value = true
}

function openEdit(due: AdminDueRecord) {
  resetMessages()
  activeDue.value = due
  editForm.title = due.title
  editForm.amount = decimalInputValue(due.amount)
  editForm.dueDate = due.dueDate ?? ""
  editOpen.value = true
}

function openCreate() {
  resetMessages()
  createForm.artistId = ""
  createForm.title = ""
  createForm.amount = ""
  createForm.dueDate = ""
  createOpen.value = true
}

// ── Mutations ──
async function submitCreate() {
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
    await $fetch("/api/admin/dues", { method: "POST", body })
    await refresh()
    createOpen.value = false
    setSuccess("Due sent to the artist for acceptance. Wallet balance will not change until they accept.")
  } catch (caught: any) {
    setError(caught, "Unable to create this due.")
  } finally {
    creating.value = false
  }
}

async function submitEdit() {
  const due = activeDue.value
  if (!due) {
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

  savingEdit.value = true
  resetMessages()
  try {
    const body: AdminDueUpdateInput = {
      title: editForm.title,
      amount: editForm.amount,
      dueDate: editForm.dueDate || null,
    }
    await $fetch(`/api/admin/dues/${due.id}`, { method: "PATCH", body })
    await refresh()
    editOpen.value = false
    setSuccess(`Due for ${due.artistName} updated.`)
  } catch (caught: any) {
    setError(caught, "Unable to update this due.")
  } finally {
    savingEdit.value = false
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

  rowBusyId.value = due.id
  resetMessages()
  try {
    await $fetch(`/api/admin/dues/${due.id}/mark-paid`, { method: "POST" })
    await refresh()
    setSuccess(`Due for ${due.artistName} marked as paid.`)
  } catch (caught: any) {
    setError(caught, "Unable to mark this due as paid.")
  } finally {
    rowBusyId.value = ""
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

  rowBusyId.value = due.id
  resetMessages()
  try {
    await $fetch(`/api/admin/dues/${due.id}/cancel`, { method: "POST" })
    await refresh()
    if (detailsOpen.value && activeDue.value?.id === due.id) {
      detailsOpen.value = false
    }
    setSuccess(
      due.status === "pending_acceptance"
        ? `Due for ${due.artistName} cancelled before wallet deduction.`
        : `Due for ${due.artistName} cancelled and reversed in the wallet ledger.`,
    )
  } catch (caught: any) {
    setError(caught, "Unable to cancel this due.")
  } finally {
    rowBusyId.value = ""
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
      title="Due ledger"
      eyebrow="Manage fees"
      description="Pending dues can be edited without touching wallets. After acceptance, amount changes post only the delta."
    >
      <template #actions>
        <Button @click="openCreate">
          <Plus class="size-4" />
          New due
        </Button>
      </template>

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
      >
        <template #cell-artist="{ row: due }">
          <strong>{{ due.artistName }}</strong>
        </template>
        <template #cell-due="{ row: due }">{{ due.title }}</template>
        <template #cell-date="{ row: due }">{{ formatDate(due.dueDate) }}</template>
        <template #cell-updated="{ row: due }">
          <span>{{ formatDateTime(due.updatedAt) }}</span>
        </template>
        <template #cell-status="{ row: due }">
          <StatusBadge :tone="statusTone(due.status)">{{ statusLabel(due.status) }}</StatusBadge>
        </template>
        <template #cell-amount="{ row: due }">
          <strong class="tabular-nums">{{ formatMoney(due.amount) }}</strong>
        </template>
        <template #cell-actions="{ row: due }">
          <RowActions :actions="dueActions(due)" @select="(key) => onDueAction(key, due)" />
        </template>
      </DataTable>
    </DataPanel>

    <!-- Create due -->
    <FormDialog
      v-model:open="createOpen"
      title="New due"
      description="A new due is sent to the artist first. Their wallet is deducted only after they accept it."
      submit-label="Create due"
      :pending="creating"
      :error="createOpen ? errorMessage : ''"
      :submit-disabled="!createForm.artistId || !createForm.title || !createForm.amount"
      @submit="submitCreate"
    >
      <div class="dialog-grid">
        <div class="field-row">
          <label for="due-artist">Artist</label>
          <NativeSelect id="due-artist" v-model="createForm.artistId">
            <option value="" disabled>Select artist</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">
              {{ artist.label }}
            </option>
          </NativeSelect>
        </div>
        <div class="field-row">
          <label for="due-title">Title</label>
          <Input id="due-title" v-model="createForm.title" placeholder="Distribution fee" />
        </div>
        <div class="field-row">
          <label for="due-amount">Amount</label>
          <Input id="due-amount" v-model="createForm.amount" type="number" min="0.00000001" step="0.00000001" placeholder="0.00" />
        </div>
        <div class="field-row">
          <label for="due-date">Due date</label>
          <AppDatePicker id="due-date" v-model="createForm.dueDate" placeholder="No due date" />
        </div>
      </div>
    </FormDialog>

    <!-- Edit due -->
    <FormDialog
      v-model:open="editOpen"
      :title="activeDue ? `Edit due — ${activeDue.artistName}` : 'Edit due'"
      description="Pending dues edit freely. After acceptance, amount changes post only the delta to the wallet."
      submit-label="Save changes"
      :pending="savingEdit"
      :error="editOpen ? errorMessage : ''"
      @submit="submitEdit"
    >
      <div class="dialog-grid">
        <div class="field-row dialog-col-2">
          <label for="edit-title">Title</label>
          <Input id="edit-title" v-model="editForm.title" />
        </div>
        <div class="field-row">
          <label for="edit-amount">Amount</label>
          <Input id="edit-amount" v-model="editForm.amount" type="number" min="0.00000001" step="0.00000001" />
        </div>
        <div class="field-row">
          <label for="edit-date">Due date</label>
          <AppDatePicker id="edit-date" v-model="editForm.dueDate" placeholder="No due date" />
        </div>
      </div>
    </FormDialog>

    <!-- View details -->
    <FormDialog
      v-model:open="detailsOpen"
      :title="activeDue ? activeDue.title : 'Due details'"
      :description="activeDue?.artistName"
      readonly
    >
      <dl v-if="activeDue" class="detail-list">
        <div class="detail-item">
          <dt>Status</dt>
          <dd><StatusBadge :tone="statusTone(activeDue.status)">{{ statusLabel(activeDue.status) }}</StatusBadge></dd>
        </div>
        <div class="detail-item">
          <dt>Amount</dt>
          <dd class="tabular-nums">{{ formatMoney(activeDue.amount) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Due date</dt>
          <dd>{{ formatDate(activeDue.dueDate) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Created</dt>
          <dd>{{ formatDateTime(activeDue.createdAt) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Accepted</dt>
          <dd>{{ formatDateTime(activeDue.acceptedAt) }}{{ activeDue.acceptedByName ? ` · ${activeDue.acceptedByName}` : "" }}</dd>
        </div>
        <div class="detail-item">
          <dt>Paid / cancelled</dt>
          <dd>{{ formatDateTime(activeDue.paidAt) }} / {{ formatDateTime(activeDue.cancelledAt) }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Ledger entry</dt>
          <dd class="mono">{{ activeDue.ledgerEntryId || (activeDue.status === "pending_acceptance" ? "Not posted" : "No amount change") }}</dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="detailsOpen = false">Close</Button>
        <Button v-if="activeDue && activeDue.status !== 'cancelled'" @click="activeDue && openEdit(activeDue)">
          <Pencil class="size-4" />
          Edit
        </Button>
      </template>
    </FormDialog>
  </div>
</template>

<style scoped>
.dues-filter-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
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
