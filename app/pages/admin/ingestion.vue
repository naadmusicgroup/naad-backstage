<script setup lang="ts">
import { MoreHorizontal } from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type {
  CsvCommitResponse,
  CsvDeleteResponse,
  CsvPreviewResponse,
  CsvPreviewWarning,
  CsvReplacementCommitResponse,
  CsvUploadHistoryItem,
  CsvUploadTargetResponse,
  ImportArtistOption,
} from "~~/types/imports"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

interface UploadHistoryResponse {
  uploads: CsvUploadHistoryItem[]
}

interface UploadActionState {
  uploadId: string
  filename: string
  periodMonth: string
  requiresNegativeConfirmation: boolean
  currentBalance: string | null
  resultingBalance: string | null
}

interface ReplacementContext {
  oldUploadId: string
  oldFilename: string
  periodMonth: string
}

const supabase = useSupabaseClient()
const numberFormatter = new Intl.NumberFormat("en-US")
const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
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
const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`

const form = reactive({
  artistId: "",
  periodMonth: currentMonth,
})

const selectedFile = ref<File | null>(null)
const fileInputKey = ref(0)
const isUploading = ref(false)
const isCommitting = ref(false)
const committingUploadId = ref("")
const deletingUploadId = ref("")
const successMessage = ref("")
const errorMessage = ref("")
const preview = ref<CsvPreviewResponse | null>(null)
const uploadAction = ref<UploadActionState | null>(null)
const uploadActionAdminPassword = ref("")
const uploadActionRequiredText = ref("")
const uploadActionVerificationError = ref("")
const replacementContext = ref<ReplacementContext | null>(null)
const { confirmAction } = useConfirmAction()

const uploadHistoryColumns = [
  { key: "file", label: "File", accessor: (row: any) => row.filename },
  { key: "period", label: "Period", accessor: (row: any) => row.periodMonth },
  { key: "entries", label: "Entries", align: "right" as const, accessor: (row: any) => row.rowCount },
  { key: "matched", label: "Matched", align: "right" as const, accessor: (row: any) => row.matchedCount },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.totalAmount || 0) },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "actions", label: "Actions", align: "right" as const, sortable: false },
]

const { data: artistResponse, pending: artistPending, error: artistLoadError } = useLazyFetch<{
  artists: ImportArtistOption[]
}>("/api/admin/artists", {
  query: {
    surface: "options",
  },
})

const artists = computed(() => artistResponse.value?.artists ?? [])
const uploadsDescription = computed(() =>
  form.artistId ? `Upload history for ${selectedArtistName.value}.` : "Select an artist to load history.",
)
const uploadActionDialogDescription = computed(() => {
  if (!uploadAction.value) {
    return ""
  }

  const baseDescription = "This removes the CSV upload row, stored file, linked earnings, ledger impact, and notification."

  if (!uploadAction.value.requiresNegativeConfirmation) {
    return baseDescription
  }

  return `${baseDescription} This will move the artist from ${uploadAction.value.currentBalance} to ${uploadAction.value.resultingBalance}.`
})
const selectedArtistName = computed(
  () => artists.value.find((artist) => artist.id === form.artistId)?.name ?? "selected artist",
)
const selectedFileLabel = computed(() => {
  if (!selectedFile.value) {
    return "No CSV selected yet."
  }

  return `${selectedFile.value.name} / ${numberFormatter.format(Math.max(1, Math.round(selectedFile.value.size / 1024)))} KB`
})

const canCommitPreview = computed(() => {
  return Boolean(preview.value && preview.value.summary.matchedCount > 0 && preview.value.summary.unmatchedCount === 0)
})
const previewWarnings = computed(() => preview.value?.warnings ?? [])

watch(
  artists,
  (value) => {
    if (!form.artistId && value.length) {
      form.artistId = value[0].id
    }
  },
  {
    immediate: true,
  },
)

watch(
  () => form.artistId,
  () => {
    preview.value = null
    uploadAction.value = null
    replacementContext.value = null
    successMessage.value = ""
    errorMessage.value = ""
  },
)

const { data: uploadHistoryResponse, pending: uploadHistoryPending, error: uploadHistoryError, refresh: refreshUploadHistory } =
  useLazyFetch<UploadHistoryResponse>("/api/admin/imports", {
    query: computed(() => (form.artistId ? { artistId: form.artistId } : {})),
    immediate: false,
    watch: false,
  })

const uploadHistory = computed(() => uploadHistoryResponse.value?.uploads ?? [])

const isInitialLoading = computed(() => {
  return artistPending.value || (uploadHistoryPending.value && !uploadHistoryResponse.value)
})

watch(
  () => form.artistId,
  (value) => {
    if (value) {
      void refreshUploadHistory()
    }
  },
  { immediate: true },
)

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

function formatMoney(value: string | null) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function formatCount(value: number | null) {
  return numberFormatter.format(value ?? 0)
}

function formatIsoDate(value: string | null) {
  if (!value) {
    return "Not available"
  }

  return compactDateFormatter.format(new Date(`${value}T00:00:00Z`))
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

function formatPeriodMonth(value: string) {
  return monthFormatter.format(new Date(`${value}-01T00:00:00Z`))
}

function formatStatus(status: CsvUploadHistoryItem["status"]) {
  switch (status) {
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
    case "reversed":
      return "Reversed"
    case "abandoned":
      return "Abandoned"
    default:
      return "Processing"
  }
}

function warningLabel(severity: CsvPreviewWarning["severity"]) {
  return severity === "warning" ? "Review" : "Info"
}

function warningTone(severity: CsvPreviewWarning["severity"]) {
  return severity === "warning" ? "danger" : "warning"
}

function statusTone(status: CsvUploadHistoryItem["status"]) {
  switch (status) {
    case "completed":
      return "success"
    case "failed":
      return "danger"
    case "reversed":
      return "info"
    case "abandoned":
      return "danger"
    default:
      return "warning"
  }
}

function cancelReplacement() {
  replacementContext.value = null
}

function resetUploadForm() {
  preview.value = null
  selectedFile.value = null
  fileInputKey.value += 1
  uploadAction.value = null
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  preview.value = null
  resetMessages()
}

function periodMonthInputValue(value: string) {
  return value.slice(0, 7)
}

function actionPrimaryLabel(state: UploadActionState | null) {
  if (!state) {
    return "Confirm"
  }

  if (state.requiresNegativeConfirmation) {
    return "Delete anyway"
  }

  return "Delete permanently"
}

function beginUploadAction(upload: CsvUploadHistoryItem) {
  resetMessages()
  uploadActionAdminPassword.value = ""
  uploadActionRequiredText.value = ""
  uploadActionVerificationError.value = ""
  uploadAction.value = {
    uploadId: upload.id,
    filename: upload.filename,
    periodMonth: upload.periodMonth,
    requiresNegativeConfirmation: false,
    currentBalance: null,
    resultingBalance: null,
  }
}

function beginReplacement(upload: CsvUploadHistoryItem) {
  resetMessages()
  preview.value = null
  selectedFile.value = null
  fileInputKey.value += 1
  uploadAction.value = null
  form.periodMonth = periodMonthInputValue(upload.periodMonth)
  replacementContext.value = {
    oldUploadId: upload.id,
    oldFilename: upload.filename,
    periodMonth: upload.periodMonth,
  }
}

function cancelUploadAction() {
  uploadAction.value = null
  uploadActionAdminPassword.value = ""
  uploadActionRequiredText.value = ""
  uploadActionVerificationError.value = ""
}

async function uploadAndPreview() {
  if (!selectedFile.value) {
    errorMessage.value = "Choose a CSV file before uploading."
    return
  }

  if (!form.artistId) {
    errorMessage.value = "Select an artist before uploading."
    return
  }

  isUploading.value = true
  resetMessages()
  preview.value = null

  try {
    const target = (await $fetch("/api/admin/imports/create-upload", {
      method: "POST",
      body: {
        artistId: form.artistId,
        filename: selectedFile.value.name,
        fileSize: selectedFile.value.size,
        periodMonth: form.periodMonth,
      },
    })) as CsvUploadTargetResponse

    const { error: uploadError } = await supabase.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, selectedFile.value, {
        contentType: selectedFile.value.type || "text/csv",
      })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    preview.value = (await $fetch(`/api/admin/imports/${target.uploadId}/preview`, {
      method: "POST",
    })) as CsvPreviewResponse

    await refreshUploadHistory()
    setSuccess(
      replacementContext.value
        ? `Replacement preview ready for ${selectedFile.value.name} on ${selectedArtistName.value}.`
        : `Preview ready for ${selectedFile.value.name} on ${selectedArtistName.value}.`,
    )
  } catch (error: any) {
    setError(error, "Unable to preview this CSV.")
    await refreshUploadHistory()
  } finally {
    isUploading.value = false
  }
}

async function commitPreview() {
  if (!preview.value) {
    errorMessage.value = "Upload and preview a CSV before committing."
    return
  }

  if (!canCommitPreview.value) {
    errorMessage.value = "Only fully matched previews can be committed."
    return
  }

  const confirmed = await confirmAction({
    title: replacementContext.value ? "Commit CSV replacement" : "Commit CSV upload",
    description: replacementContext.value
      ? `Replace ${replacementContext.value.oldFilename} with ${selectedFile.value?.name || "this CSV"} for ${selectedArtistName.value}?`
      : `Commit ${selectedFile.value?.name || "this CSV"} for ${selectedArtistName.value} and write the matched earnings, ledger, and CSV-derived analytics?`,
    confirmLabel: replacementContext.value ? "Commit replacement" : "Commit upload",
    variant: "default",
    adminVerification: { action: replacementContext.value ? "csv_upload.replaced" : "csv_upload.committed" },
  })

  if (!confirmed) {
    return
  }

  isCommitting.value = true
  resetMessages()

  try {
    if (replacementContext.value) {
      const result = (await $fetch(
        `/api/admin/imports/${replacementContext.value.oldUploadId}/replace`,
        {
          method: "POST",
          body: {
            replacementUploadId: preview.value.uploadId,
          },
        },
      )) as CsvReplacementCommitResponse
      const storageNote = result.oldStorageDeleted
        ? ""
        : ` Old storage cleanup warning: ${result.oldStorageWarning || "unknown storage error"}.`

      setSuccess(
        `Replaced ${replacementContext.value.oldFilename} with ${formatCount(result.rowsInserted)} entries and ${formatMoney(result.totalAmount)} for ${selectedArtistName.value}.${storageNote}`,
      )
      replacementContext.value = null
      resetUploadForm()
      await refreshUploadHistory()
      return
    }

    const result = (await $fetch(`/api/admin/imports/${preview.value.uploadId}/commit`, {
      method: "POST",
    })) as CsvCommitResponse

    setSuccess(
      `Committed ${formatCount(result.rowsInserted)} entries and ${formatMoney(result.totalAmount)} for ${selectedArtistName.value}.`,
    )
    replacementContext.value = null
    resetUploadForm()
    await refreshUploadHistory()
  } catch (error: any) {
    setError(error, "Unable to commit this upload.")
  } finally {
    isCommitting.value = false
  }
}

function hasCompletedUploadForSamePeriod(upload: CsvUploadHistoryItem) {
  return uploadHistory.value.some((historyUpload) => (
    historyUpload.id !== upload.id
    && historyUpload.status === "completed"
    && historyUpload.periodMonth === upload.periodMonth
  ))
}

function commitBlocker(upload: CsvUploadHistoryItem) {
  if (upload.status !== "processing") {
    return "Only processing uploads can be committed from history."
  }

  if ((upload.matchedCount ?? 0) <= 0) {
    return "This upload has no matched rows yet. Re-run preview or upload the CSV again before committing."
  }

  if ((upload.unmatchedCount ?? 0) > 0) {
    return "This upload still has unmatched ISRC rows. Fix the catalog matches before committing."
  }

  return ""
}

async function commitHistoryUpload(upload: CsvUploadHistoryItem) {
  const blocker = commitBlocker(upload)

  if (blocker) {
    setError(null, blocker)
    return
  }

  const periodLabel = formatPeriodMonth(periodMonthInputValue(upload.periodMonth))
  const replacementWarning = hasCompletedUploadForSamePeriod(upload)
    ? ` A completed CSV already exists for ${periodLabel}. This commits as an additional CSV, not a replacement. Use Replace on the completed CSV if you meant to swap it.`
    : ""

  const confirmed = await confirmAction({
    title: "Commit CSV upload",
    description: `Commit ${upload.filename} for ${selectedArtistName.value} and write the matched earnings, ledger, notifications, and CSV-derived analytics?${replacementWarning}`,
    confirmLabel: "Commit upload",
    variant: "default",
    adminVerification: { action: "csv_upload.committed" },
  })

  if (!confirmed) {
    return
  }

  committingUploadId.value = upload.id
  resetMessages()

  try {
    const result = (await $fetch(`/api/admin/imports/${upload.id}/commit`, {
      method: "POST",
    })) as CsvCommitResponse

    if (preview.value?.uploadId === upload.id) {
      resetUploadForm()
    }

    setSuccess(
      `Committed ${formatCount(result.rowsInserted)} entries and ${formatMoney(result.totalAmount)} for ${selectedArtistName.value}.`,
    )
    await refreshUploadHistory()
  } catch (error: any) {
    setError(error, "Unable to commit this upload.")
  } finally {
    committingUploadId.value = ""
  }
}

async function confirmSelectedUploadAction() {
  const action = uploadAction.value

  if (!action) {
    return
  }

  deletingUploadId.value = action.uploadId
  uploadActionVerificationError.value = ""
  resetMessages()

  try {
    if (uploadActionRequiredText.value.trim() !== "DELETE") {
      uploadActionVerificationError.value = "Type DELETE to continue."
      return
    }

    if (!uploadActionAdminPassword.value) {
      uploadActionVerificationError.value = "Enter your admin password to continue."
      return
    }

    await $fetch("/api/admin/security/verify", {
      method: "POST",
      body: {
        action: "csv_upload.deleted",
        password: uploadActionAdminPassword.value,
      },
    })

    const result = (await $fetch(`/api/admin/imports/${action.uploadId}/delete`, {
      method: "POST",
      body: {
        confirmNegative: action.requiresNegativeConfirmation,
      },
    })) as CsvDeleteResponse
    const storageNote = result.storageDeleted
      ? ""
      : ` Storage cleanup warning: ${result.storageWarning || "unknown storage error"}.`

    if (preview.value?.uploadId === action.uploadId) {
      preview.value = null
      selectedFile.value = null
      fileInputKey.value += 1
    }

    if (replacementContext.value?.oldUploadId === action.uploadId) {
      replacementContext.value = null
    }

    setSuccess(
      result.storageDeleted
        ? `Deleted ${action.filename} permanently.`
        : `Deleted ${action.filename} from app data, but storage cleanup still needs attention: ${result.storageWarning || "unknown storage error"}`,
    )

    uploadAction.value = null
    uploadActionAdminPassword.value = ""
    uploadActionRequiredText.value = ""
    await refreshUploadHistory()
  } catch (error: any) {
    if (error?.data?.statusCode === 401 || error?.statusCode === 401) {
      uploadActionVerificationError.value = error?.data?.statusMessage || "Admin password verification failed."
      return
    }

    if (error?.data?.requiresConfirmation && uploadAction.value?.uploadId === action.uploadId) {
      uploadAction.value = {
        ...uploadAction.value,
        requiresNegativeConfirmation: true,
        currentBalance: error.data.currentBalance,
        resultingBalance: error.data.resultingBalance,
      }
      return
    }

    setError(error, "Unable to delete this upload.")
  } finally {
    deletingUploadId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <DashboardSkeleton v-if="isInitialLoading" layout="ingestion" />

    <template v-else>
      <div class="panel-grid">
        <DataPanel
          title="CSV intake"
          title-level="h1"
          eyebrow="Live contract"
          :description="`Ingest for ${formatPeriodMonth(form.periodMonth)}`"
        >
          <div class="form-grid">
            <AppAlert v-if="artistLoadError" variant="destructive">
              {{ artistLoadError.statusMessage || "Unable to load artists right now." }}
            </AppAlert>

            <AppAlert v-else-if="!artistPending && !artists.length" variant="destructive">
              No active artists exist yet. Create one in <NuxtLink to="/admin/artists">Artist management</NuxtLink>.
            </AppAlert>

            <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
            <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>
            <AppAlert v-if="replacementContext" variant="info">
            Replacing {{ replacementContext.oldFilename }} for
            {{ formatPeriodMonth(periodMonthInputValue(replacementContext.periodMonth)) }}.
            The existing CSV stays active until the replacement commit succeeds.

            <template #action>
              <Button variant="secondary" @click="cancelReplacement">
                No, stop replacing
              </Button>
            </template>
          </AppAlert>

          <div class="field-row">
            <label for="ingestion-artist">Artist</label>
            <NativeSelect id="ingestion-artist" v-model="form.artistId" :disabled="Boolean(replacementContext)">
              <option disabled value="">Select artist</option>
              <option v-for="artist in artists" :key="artist.id" :value="artist.id">
                {{ artist.name }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="ingestion-month">Statement month</label>
            <AppMonthPicker id="ingestion-month" v-model="form.periodMonth" required :disabled="Boolean(replacementContext)" />
          </div>

          <div class="field-row">
            <label for="ingestion-file">CSV file</label>
            <Input
              :key="fileInputKey"
              id="ingestion-file"

              type="file"
              accept=".csv,text/csv"
              @change="onFileSelected"
            />
            <p class="field-note">Maximum 5 MB. The browser uploads directly to Supabase Storage.</p>
          </div>

          <Badge variant="muted">{{ selectedFileLabel }}</Badge>

          <div class="flex flex-wrap gap-2">
            <Button :disabled="isUploading || !artists.length" @click="uploadAndPreview">
              {{ isUploading ? "Uploading and parsing..." : "Upload & preview" }}
            </Button>
          </div>
        </div>
      </DataPanel>
    </div>

    <template v-if="preview">
      <DataPanel
        title="Preview summary"
        eyebrow="Parsed once"
        description="This is stored on csv_uploads.parsed_data so commit does not need to re-parse the file."
      >
        <div class="metrics">
          <StatCard label="Entries" :value="formatCount(preview.summary.rowCount)" tone="accent" />
          <StatCard label="Matched" :value="formatCount(preview.summary.matchedCount)" />
          <StatCard label="Unmatched" :value="formatCount(preview.summary.unmatchedCount)" />
          <StatCard label="Revenue" :value="formatMoney(preview.summary.totalAmount)" tone="alt" />
          <StatCard label="Units" :value="formatCount(preview.summary.totalUnits)" />
          <StatCard label="Channels" :value="formatCount(preview.summary.channelCount)" />
          <StatCard label="Countries" :value="formatCount(preview.summary.countryCount)" />
          <StatCard label="Reporting date" :value="formatIsoDate(preview.summary.reportingDate)" />
        </div>
      </DataPanel>

      <DataPanel
        v-if="previewWarnings.length"
        title="Preview warnings"
        eyebrow="Non-blocking checks"
        description="These issues will not stop revenue from committing, but they do reduce reporting quality for the affected entries."
      >
        <div class="summary-table">
          <div v-for="warning in previewWarnings" :key="warning.code" class="summary-row">
            <div class="summary-copy">
              <strong>{{ warning.message }}</strong>
              <span class="detail-copy">
                {{ formatCount(warning.rowCount) }} affected entries / {{ formatMoney(warning.totalAmount) }}
              </span>
            </div>
            <StatusBadge :tone="warningTone(warning.severity)">
              {{ warningLabel(warning.severity) }}
            </StatusBadge>
          </div>
        </div>
      </DataPanel>

      <div class="panel-grid">
        <DataPanel
          title="Matched releases"
          eyebrow="By release"
          description="Top matched releases from the preview payload. This is the financial shape before commit."
        >
          <div v-if="preview.releases.length" class="summary-table">
            <div v-for="release in preview.releases" :key="release.releaseId" class="summary-row">
              <div class="summary-copy">
                <strong>{{ release.releaseTitle }}</strong>
                <span class="detail-copy">
                  {{ formatCount(release.rowCount) }} entries / {{ formatCount(release.totalUnits) }} units
                </span>
              </div>
              <strong>{{ formatMoney(release.totalAmount) }}</strong>
            </div>
          </div>

          <AppEmptyState
            v-else
            compact
            icon="search"
            title="No known tracks matched"
            :description="`No known tracks matched yet for ${selectedArtistName}. Add catalog tracks first or review unmatched ISRCs below.`"
            class="border-0 bg-transparent shadow-none"
          />
        </DataPanel>

        <DataPanel
          title="Unmatched ISRCs"
          eyebrow="Exceptions"
          description="Unknown ISRC entries stay out of financial truth until the catalog exists or the upload is corrected."
        >
          <div v-if="preview.unmatched.length" class="summary-table">
            <div
              v-for="item in preview.unmatched"
              :key="`${item.isrc}-${item.trackTitle}`"
              class="summary-row"
            >
              <div class="summary-copy">
                <strong class="mono">{{ item.isrc }}</strong>
                <span>{{ item.trackTitle }}</span>
                <span class="detail-copy">
                  {{ item.releaseTitle || "Unknown release" }} / {{ formatCount(item.occurrences) }} entries /
                  {{ item.sampleChannels.join(", ") }}
                </span>
              </div>
              <strong>{{ formatMoney(item.totalAmount) }}</strong>
            </div>
          </div>

          <p v-else class="muted-copy">
            Every entry matched a known track. This preview can move straight into earnings and the ledger.
          </p>
        </DataPanel>
      </div>

      <div class="panel-grid">
        <DataPanel
          title="Commit gate"
          eyebrow="Transactional write"
          description="Commit is blocked until the preview is fully matched and the statement month is still open."
        >
          <div class="form-grid">
            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Selected statement month</span>
                <strong>{{ formatPeriodMonth(form.periodMonth) }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Accounting period start</span>
                <strong>{{ formatIsoDate(preview.summary.periodStart) }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Sale period end</span>
                <strong>{{ formatIsoDate(preview.summary.periodEnd) }}</strong>
              </div>
            </div>

            <AppAlert v-if="!canCommitPreview" variant="destructive">
              Commit is blocked because this preview still has unmatched entries or no matched data.
            </AppAlert>

            <div class="flex flex-wrap gap-2">
              <Button :disabled="isCommitting || !canCommitPreview" @click="commitPreview">
                {{ isCommitting ? "Committing..." : "Commit upload" }}
              </Button>
            </div>
          </div>
        </DataPanel>
      </div>
    </template>

    <DataPanel
      title="Upload history"
      eyebrow="Per artist"
      :description="uploadsDescription"
    >
      <AppAlert v-if="uploadHistoryError" variant="destructive">
        {{ uploadHistoryError.statusMessage || "Unable to load upload history." }}
      </AppAlert>

      <DashboardSkeleton v-else-if="uploadHistoryPending" layout="generic" :table="true" :rows="4" />

      <DataTable
        v-else
        :columns="uploadHistoryColumns"
        :data="uploadHistory"
        empty-title="No CSV uploads"
        empty-description="No CSV uploads exist for this artist yet."
        row-key="id"
      >
        <template #cell-file="{ row: upload }">
          <strong>{{ upload.filename }}</strong>
          <div v-if="upload.errorMessage" class="ingestion-table-note">{{ upload.errorMessage }}</div>
        </template>
        <template #cell-period="{ row: upload }">
          {{ formatPeriodMonth(periodMonthInputValue(upload.periodMonth)) }}
          <div class="ingestion-table-note">{{ formatDateTime(upload.createdAt) }}</div>
        </template>
        <template #cell-entries="{ row: upload }">
          <span class="tabular-nums">{{ formatCount(upload.rowCount) }}</span>
        </template>
        <template #cell-matched="{ row: upload }">
          <span class="tabular-nums">{{ formatCount(upload.matchedCount) }}</span>
        </template>
        <template #cell-amount="{ row: upload }">
          <MoneyValue :value="upload.totalAmount" size="sm" />
        </template>
        <template #cell-status="{ row: upload }">
          <StatusBadge :tone="statusTone(upload.status)">
            {{ formatStatus(upload.status) }}
          </StatusBadge>
        </template>
        <template #cell-actions="{ row: upload }">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon" :disabled="Boolean(deletingUploadId || committingUploadId)" aria-label="Upload actions">
                <MoreHorizontal class="size-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-40">
              <DropdownMenuItem v-if="upload.status === 'processing'" @select.prevent="commitHistoryUpload(upload)">
                {{ committingUploadId === upload.id ? "Committing..." : "Commit" }}
              </DropdownMenuItem>
              <DropdownMenuItem v-if="upload.status === 'completed'" @select.prevent="beginReplacement(upload)">
                Replace
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" @select.prevent="beginUploadAction(upload)">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </template>
      </DataTable>
    </DataPanel>

    <ConfirmActionDialog
      :open="Boolean(uploadAction)"
      :title="uploadAction ? `Delete ${uploadAction.filename} permanently?` : 'Delete CSV upload?'"
      :description="uploadActionDialogDescription"
      :confirm-label="actionPrimaryLabel(uploadAction)"
      cancel-label="No, keep this CSV"
      variant="destructive"
      :pending="Boolean(deletingUploadId)"
      required-text="DELETE"
      :required-text-value="uploadActionRequiredText"
      :admin-verification="{ action: 'csv_upload.deleted' }"
      :admin-verification-password="uploadActionAdminPassword"
      :validation-error="uploadActionVerificationError"
      @update:open="(value) => { if (!value) cancelUploadAction() }"
      @update:required-text-value="(value) => { uploadActionRequiredText = value; uploadActionVerificationError = '' }"
      @update:admin-verification-password="(value) => { uploadActionAdminPassword = value; uploadActionVerificationError = '' }"
      @confirm="confirmSelectedUploadAction"
      @cancel="cancelUploadAction"
    />
    </template>
  </div>
</template>

<style scoped>
.ingestion-table-note {
  margin-top: 3px;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.5;
}

.ingestion-table-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.ingestion-mobile-row {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-bottom: 1px solid var(--border);
}

.ingestion-mobile-row:last-child {
  border-bottom: 0;
}
</style>
