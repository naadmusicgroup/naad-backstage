<script setup lang="ts">
import type {
  AdminPublishingMutationInput,
  AdminPublishingRecord,
  AdminPublishingResponse,
  AdminPublishingUpdateInput,
} from "~~/types/admin"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const NO_RELEASE = "none"

interface PublishingDraft {
  releaseId: string
  amount: string
  periodMonth: string
  notes: string
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const createForm = reactive({
  artistId: "",
  releaseId: NO_RELEASE,
  amount: "",
  periodMonth: new Date().toISOString().slice(0, 7),
  notes: "",
})
const successMessage = ref("")
const errorMessage = ref("")
const creating = ref(false)
const updatingEntryId = ref("")
const deletingEntryId = ref("")
const editDrafts = reactive<Record<string, PublishingDraft>>({})
const { confirmAction } = useConfirmAction()

const { data, pending, error, refresh } = useLazyFetch<AdminPublishingResponse>("/api/admin/publishing")

const entries = computed(() => data.value?.entries ?? [])
const artistOptions = computed(() => data.value?.artistOptions ?? [])
const releaseOptions = computed(() => data.value?.releaseOptions ?? [])
const publishingTableExpandedRowIds = computed(() => entries.value.map((entry) => entry.id))
const summary = computed(() => data.value?.summary ?? {
  entryCount: 0,
  totalAmount: "0.00000000",
  artistCount: 0,
  releaseCount: 0,
  periodCount: 0,
})

const createReleaseOptions = computed(() => {
  if (!createForm.artistId) {
    return []
  }

  return releaseOptions.value.filter((option) => option.meta === createForm.artistId)
})

const publishingEntryColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "release", label: "Release", accessor: (row: any) => row.releaseTitle || "Catalog-level credit" },
  { key: "period", label: "Period", accessor: (row: any) => row.periodMonth },
  { key: "entered", label: "Entered by", accessor: (row: any) => row.enteredByName || "Unknown admin" },
  { key: "ledger", label: "Ledger entry", accessor: (row: any) => row.ledgerEntryId || "" },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0) },
]

const summaryMetrics = computed(() => [
  {
    label: "Publishing total",
    value: formatMoney(summary.value.totalAmount),
    footnote: `${summary.value.entryCount.toLocaleString()} manual credits`,
    tone: "accent" as const,
  },
  {
    label: "Artists credited",
    value: summary.value.artistCount.toLocaleString(),
    footnote: "Across visible publishing entries",
    tone: "default" as const,
  },
  {
    label: "Linked releases",
    value: summary.value.releaseCount.toLocaleString(),
    footnote: "Catalog-level credits can stay unlinked",
    tone: "default" as const,
  },
  {
    label: "Periods",
    value: summary.value.periodCount.toLocaleString(),
    footnote: "Open statement months touched",
    tone: "alt" as const,
  },
])

watch(
  entries,
  (value) => {
    for (const entry of value) {
      editDrafts[entry.id] = {
        releaseId: entry.releaseId ?? NO_RELEASE,
        amount: decimalInputValue(entry.amount),
        periodMonth: inputMonthValue(entry.periodMonth),
        notes: entry.notes ?? "",
      }
    }
  },
  { immediate: true },
)

watch(
  () => createForm.artistId,
  () => {
    if (createForm.releaseId !== NO_RELEASE && !createReleaseOptions.value.some((option) => option.value === createForm.releaseId)) {
      createForm.releaseId = NO_RELEASE
    }
  },
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

function formatMoney(value: string) {
  return `$${Number(value || 0).toFixed(2)}`
}

function formatMonth(value: string) {
  return monthFormatter.format(new Date(value))
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

function inputMonthValue(value: string) {
  return value.slice(0, 7)
}

function decimalInputValue(value: string) {
  return Number(value || 0).toFixed(2)
}

function releaseOptionsForEntry(entry: AdminPublishingRecord) {
  return releaseOptions.value.filter((option) => option.meta === entry.artistId)
}

function releaseIdForApi(value: string) {
  return value === NO_RELEASE ? null : value
}

function periodMonthForApi(value: string) {
  return value.length === 7 ? `${value}-01` : value
}

function resetCreateForm() {
  createForm.releaseId = NO_RELEASE
  createForm.amount = ""
  createForm.notes = ""
}

async function createPublishingCredit() {
  creating.value = true
  resetMessages()

  try {
    const body: AdminPublishingMutationInput = {
      artistId: createForm.artistId,
      releaseId: releaseIdForApi(createForm.releaseId),
      amount: createForm.amount,
      periodMonth: periodMonthForApi(createForm.periodMonth),
      notes: createForm.notes || null,
    }

    await $fetch("/api/admin/publishing", {
      method: "POST",
      body,
    })

    await refresh()
    resetCreateForm()
    setSuccess("Publishing credit created and posted to the wallet ledger.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to create this publishing credit.")
  } finally {
    creating.value = false
  }
}

async function updatePublishingCredit(entry: AdminPublishingRecord) {
  const draft = editDrafts[entry.id]

  if (!draft) {
    return
  }

  updatingEntryId.value = entry.id
  resetMessages()

  try {
    const body: AdminPublishingUpdateInput = {
      releaseId: releaseIdForApi(draft.releaseId),
      amount: draft.amount,
      periodMonth: periodMonthForApi(draft.periodMonth),
      notes: draft.notes || null,
    }

    await $fetch(`/api/admin/publishing/${entry.id}`, {
      method: "PATCH",
      body,
    })

    await refresh()
    setSuccess(`Publishing credit for ${entry.artistName} updated.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to update this publishing credit.")
  } finally {
    updatingEntryId.value = ""
  }
}

async function deletePublishingCredit(entry: AdminPublishingRecord) {
  const confirmed = await confirmAction({
    title: "Delete publishing credit",
    description: `Delete this ${formatMoney(entry.amount)} publishing credit for ${entry.artistName}?`,
    confirmLabel: "Delete credit",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  deletingEntryId.value = entry.id
  resetMessages()

  try {
    await $fetch(`/api/admin/publishing/${entry.id}`, {
      method: "DELETE",
    })

    await refresh()
    setSuccess(`Publishing credit for ${entry.artistName} deleted and reversed in the wallet ledger.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to delete this publishing credit.")
  } finally {
    deletingEntryId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <DataPanel
      title="Publishing"
      eyebrow="Manual revenue"
      description="Create, edit, and remove publishing credits. Each amount is reflected in artist statements and posted to the wallet ledger."
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
          {{ error.statusMessage || "Unable to load publishing entries right now." }}
        </AppAlert>
        <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
        <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>
      </div>
    </DataPanel>

    <DataPanel
      title="Create credit"
      eyebrow="New entry"
      description="Publishing entries are month-based. Closed statement months cannot be changed."
    >
      <form class="publishing-form-grid" @submit.prevent="createPublishingCredit">
        <div class="field-row">
          <label for="publishing-artist">Artist</label>
          <NativeSelect id="publishing-artist" v-model="createForm.artistId" required>
            <option value="" disabled>Select artist</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">
              {{ artist.label }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="publishing-release">Release</label>
          <NativeSelect id="publishing-release" v-model="createForm.releaseId" :disabled="!createForm.artistId">
            <option :value="NO_RELEASE">Catalog-level credit</option>
            <option v-for="release in createReleaseOptions" :key="release.value" :value="release.value">
              {{ release.label }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="publishing-amount">Amount</label>
          <Input id="publishing-amount" v-model="createForm.amount" type="number" min="0.00000001" step="0.00000001" placeholder="0.00" required />
        </div>

        <div class="field-row">
          <label for="publishing-period">Period month</label>
          <AppMonthPicker id="publishing-period" v-model="createForm.periodMonth" required />
        </div>

        <div class="field-row publishing-notes-field">
          <label for="publishing-notes">Notes</label>
          <Textarea id="publishing-notes" v-model="createForm.notes" class="publishing-textarea" placeholder="Optional admin note" />
        </div>

        <div class="publishing-form-actions">
          <Button type="submit" :disabled="creating || !createForm.artistId">
            {{ creating ? "Creating..." : "Create publishing credit" }}
          </Button>
        </div>
      </form>
    </DataPanel>

    <DataPanel
      title="Publishing entries"
      eyebrow="Ledger-backed"
      description="Editing an amount posts only the delta to the wallet ledger. Deleting posts a negative publishing adjustment."
    >
      <DashboardSkeleton v-if="pending && !data" :rows="5" />

      <DataTable
        v-else
        :columns="publishingEntryColumns"
        :data="entries"
        empty-title="No publishing credits"
        empty-description="No publishing credits have been entered yet."
        row-key="id"
        :expanded-row-ids="publishingTableExpandedRowIds"
      >
        <template #cell-artist="{ row: entry }">
          <strong>{{ entry.artistName }}</strong>
          <div v-if="entry.notes" class="detail-copy">{{ entry.notes }}</div>
        </template>
        <template #cell-release="{ row: entry }">{{ entry.releaseTitle || "Catalog-level credit" }}</template>
        <template #cell-period="{ row: entry }">{{ formatMonth(entry.periodMonth) }}</template>
        <template #cell-entered="{ row: entry }">{{ entry.enteredByName || "Unknown admin" }}</template>
        <template #cell-ledger="{ row: entry }">
          <span class="mono">{{ entry.ledgerEntryId || "No amount change" }}</span>
        </template>
        <template #cell-amount="{ row: entry }">
          <strong class="tabular-nums">{{ formatMoney(entry.amount) }}</strong>
        </template>
        <template #expandedRow="{ row: entry }">
          <div class="form-grid">
            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Created / updated</span>
                <strong>{{ formatDate(entry.createdAt) }} / {{ formatDate(entry.updatedAt) }}</strong>
              </div>
            </div>

            <div v-if="editDrafts[entry.id]" class="publishing-edit-grid">
              <div class="field-row">
                <label :for="`publishing-release-${entry.id}`">Release</label>
                <NativeSelect :id="`publishing-release-${entry.id}`" v-model="editDrafts[entry.id].releaseId">
                  <option :value="NO_RELEASE">Catalog-level credit</option>
                  <option v-for="release in releaseOptionsForEntry(entry)" :key="release.value" :value="release.value">
                    {{ release.label }}
                  </option>
                </NativeSelect>
              </div>

              <div class="field-row">
                <label :for="`publishing-amount-${entry.id}`">Amount</label>
                <Input :id="`publishing-amount-${entry.id}`" v-model="editDrafts[entry.id].amount" type="number" min="0.00000001" step="0.00000001" />
              </div>

              <div class="field-row">
                <label :for="`publishing-period-${entry.id}`">Period month</label>
                <AppMonthPicker :id="`publishing-period-${entry.id}`" v-model="editDrafts[entry.id].periodMonth" required />
              </div>

              <div class="field-row publishing-notes-field">
                <label :for="`publishing-notes-${entry.id}`">Notes</label>
                <Textarea :id="`publishing-notes-${entry.id}`" v-model="editDrafts[entry.id].notes" class="publishing-textarea" />
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button type="button" :disabled="updatingEntryId === entry.id || deletingEntryId === entry.id" @click="updatePublishingCredit(entry)">
                {{ updatingEntryId === entry.id ? "Saving..." : "Save changes" }}
              </Button>
              <Button variant="destructive" type="button" :disabled="deletingEntryId === entry.id || updatingEntryId === entry.id" @click="deletePublishingCredit(entry)">
                {{ deletingEntryId === entry.id ? "Deleting..." : "Delete credit" }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </DataPanel>
  </div>
</template>

<style scoped>
.publishing-form-grid,
.publishing-edit-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.publishing-notes-field {
  grid-column: 1 / -1;
}

.publishing-textarea {
  min-height: 96px;
  resize: vertical;
}

.publishing-form-actions {
  display: flex;
  align-items: end;
}
</style>
