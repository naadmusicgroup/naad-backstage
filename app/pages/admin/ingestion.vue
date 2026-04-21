<script setup lang="ts">
import type {
  CsvCommitResponse,
  CsvPreviewResponse,
  CsvReverseResponse,
  CsvUploadHistoryItem,
  CsvUploadTargetResponse,
  ImportArtistOption,
  ManualAnalyticsInput,
} from "~~/types/imports"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
})

interface UploadHistoryResponse {
  uploads: CsvUploadHistoryItem[]
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

const analytics = reactive<Record<keyof ManualAnalyticsInput, string | number | null>>({
  spotifyMonthlyListeners: "",
  appleMusicPlays: "",
  tikTokVideoCreations: "",
  metaImpressions: "",
  youtubeViews: "",
})

const selectedFile = ref<File | null>(null)
const fileInputKey = ref(0)
const isUploading = ref(false)
const isCommitting = ref(false)
const reversingUploadId = ref("")
const successMessage = ref("")
const errorMessage = ref("")
const preview = ref<CsvPreviewResponse | null>(null)

const steps = [
  "Select the artist and statement month before you touch the file.",
  "Upload directly to Supabase Storage so the app server never proxies raw CSV bytes.",
  "Parse once from storage, save review data on csv_uploads.parsed_data, and inspect unmatched ISRCs.",
  "Commit matched rows and manual analytics in one action after the preview is clean.",
]

const manualMetrics = [
  { key: "spotifyMonthlyListeners", label: "Spotify monthly listeners" },
  { key: "appleMusicPlays", label: "Apple Music plays" },
  { key: "tikTokVideoCreations", label: "TikTok video creations" },
  { key: "metaImpressions", label: "Meta / Instagram impressions" },
  { key: "youtubeViews", label: "YouTube views" },
] as const

const { data: artistResponse, pending: artistPending, error: artistLoadError } = await useFetch<{
  artists: ImportArtistOption[]
}>("/api/admin/artists")

const artists = computed(() => artistResponse.value?.artists ?? [])
const uploadsDescription = computed(() =>
  form.artistId ? `Upload history for ${selectedArtistName.value}.` : "Select an artist to load history.",
)
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
    successMessage.value = ""
    errorMessage.value = ""
  },
)

const { data: uploadHistoryResponse, pending: uploadHistoryPending, error: uploadHistoryError, refresh: refreshUploadHistory } =
  await useFetch<UploadHistoryResponse>("/api/admin/imports", {
    query: computed(() => (form.artistId ? { artistId: form.artistId } : {})),
  })

const uploadHistory = computed(() => uploadHistoryResponse.value?.uploads ?? [])

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

function statusClass(status: CsvUploadHistoryItem["status"]) {
  switch (status) {
    case "completed":
      return "status-completed"
    case "failed":
      return "status-failed"
    case "reversed":
      return "status-reversed"
    case "abandoned":
      return "status-abandoned"
    default:
      return "status-processing"
  }
}

function normalizeOptionalMetric(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = String(value).trim()
  return normalized ? Number(normalized) : null
}

function normalizeAnalyticsPayload(): ManualAnalyticsInput {
  const normalized = {} as ManualAnalyticsInput

  for (const field of manualMetrics) {
    normalized[field.key] = normalizeOptionalMetric(analytics[field.key])
  }

  return normalized
}

function resetUploadForm() {
  preview.value = null
  selectedFile.value = null
  fileInputKey.value += 1

  for (const field of manualMetrics) {
    analytics[field.key] = ""
  }
}

function onFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  selectedFile.value = input.files?.[0] ?? null
  preview.value = null
  resetMessages()
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
    const target = await $fetch<CsvUploadTargetResponse>("/api/admin/imports/create-upload", {
      method: "POST",
      body: {
        artistId: form.artistId,
        filename: selectedFile.value.name,
        fileSize: selectedFile.value.size,
        periodMonth: form.periodMonth,
      },
    })

    const { error: uploadError } = await supabase.storage
      .from(target.bucket)
      .uploadToSignedUrl(target.path, target.token, selectedFile.value, {
        contentType: selectedFile.value.type || "text/csv",
      })

    if (uploadError) {
      throw new Error(uploadError.message)
    }

    preview.value = await $fetch<CsvPreviewResponse>(`/api/admin/imports/${target.uploadId}/preview`, {
      method: "POST",
    })

    await refreshUploadHistory()
    setSuccess(`Preview ready for ${selectedFile.value.name} on ${selectedArtistName.value}.`)
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

  isCommitting.value = true
  resetMessages()

  try {
    const result = await $fetch<CsvCommitResponse>(`/api/admin/imports/${preview.value.uploadId}/commit`, {
      method: "POST",
      body: {
        analytics: normalizeAnalyticsPayload(),
      },
    })

    setSuccess(
      `Committed ${formatCount(result.rowsInserted)} rows and ${formatMoney(result.totalAmount)} for ${selectedArtistName.value}.`,
    )
    resetUploadForm()
    await refreshUploadHistory()
  } catch (error: any) {
    setError(error, "Unable to commit this upload.")
  } finally {
    isCommitting.value = false
  }
}

async function reverseUpload(upload: CsvUploadHistoryItem) {
  if (!process.client) {
    return
  }

  const baseConfirmation = window.confirm(`Reverse ${upload.filename}? This action appends reversal rows and updates the artist balance.`)

  if (!baseConfirmation) {
    return
  }

  reversingUploadId.value = upload.id
  resetMessages()

  try {
    const result = await $fetch<CsvReverseResponse>(`/api/admin/imports/${upload.id}/reverse`, {
      method: "POST",
      body: {
        confirmNegative: false,
      },
    })

    setSuccess(
      `Reversed ${formatCount(result.rowsInserted)} rows. Artist balance moved to ${formatMoney(result.resultingBalance)}.`,
    )
    await refreshUploadHistory()
  } catch (error: any) {
    if (error?.data?.requiresConfirmation) {
      const currentBalance = formatMoney(error.data.currentBalance)
      const resultingBalance = formatMoney(error.data.resultingBalance)
      const confirmed = window.confirm(
        `This reversal will move the artist from ${currentBalance} to ${resultingBalance}. Continue anyway?`,
      )

      if (!confirmed) {
        reversingUploadId.value = ""
        return
      }

      try {
        const result = await $fetch<CsvReverseResponse>(`/api/admin/imports/${upload.id}/reverse`, {
          method: "POST",
          body: {
            confirmNegative: true,
          },
        })

        setSuccess(
          `Reversed ${formatCount(result.rowsInserted)} rows. Artist balance moved to ${formatMoney(result.resultingBalance)}.`,
        )
        await refreshUploadHistory()
      } catch (confirmedError: any) {
        setError(confirmedError, "Unable to reverse this upload.")
      } finally {
        reversingUploadId.value = ""
      }

      return
    }

    setError(error, "Unable to reverse this upload.")
  } finally {
    reversingUploadId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <div class="panel-grid">
      <SectionCard
        title="Upload and preview"
        eyebrow="Admin workflow"
        description="The file lands in Supabase Storage first, then the server parses the stored file once and keeps the review payload on csv_uploads."
      >
        <ul class="list">
          <li v-for="step in steps" :key="step">{{ step }}</li>
        </ul>
      </SectionCard>

      <SectionCard
        title="CSV intake"
        eyebrow="Live contract"
        :description="`Ingest for ${formatPeriodMonth(form.periodMonth)}`"
      >
        <div class="form-grid">
          <div v-if="artistLoadError" class="banner error">
            {{ artistLoadError.statusMessage || "Unable to load artists right now." }}
          </div>

          <div v-else-if="!artistPending && !artists.length" class="banner error">
            No active artists exist yet. Create one in <NuxtLink to="/admin/artists">Artist management</NuxtLink>.
          </div>

          <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
          <div v-if="successMessage" class="banner">{{ successMessage }}</div>

          <div class="field-row">
            <label for="ingestion-artist">Artist</label>
            <select id="ingestion-artist" v-model="form.artistId" class="input">
              <option disabled value="">Select artist</option>
              <option v-for="artist in artists" :key="artist.id" :value="artist.id">
                {{ artist.name }}
              </option>
            </select>
          </div>

          <div class="field-row">
            <label for="ingestion-month">Statement month</label>
            <input id="ingestion-month" v-model="form.periodMonth" class="input" type="month" />
          </div>

          <div class="field-row">
            <label for="ingestion-file">CSV file</label>
            <input
              :key="fileInputKey"
              id="ingestion-file"
              class="input input-file"
              type="file"
              accept=".csv,text/csv"
              @change="onFileSelected"
            />
            <p class="field-note">Maximum 5 MB. The browser uploads directly to Supabase Storage.</p>
          </div>

          <div class="pill pill-muted">{{ selectedFileLabel }}</div>

          <div class="button-row">
            <button class="button" :disabled="isUploading || !artists.length" @click="uploadAndPreview">
              {{ isUploading ? "Uploading and parsing..." : "Upload & preview" }}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>

    <template v-if="preview">
      <SectionCard
        title="Preview summary"
        eyebrow="Parsed once"
        description="This is stored on csv_uploads.parsed_data so commit does not need to re-parse the file."
      >
        <div class="metrics">
          <MetricCard label="Rows" :value="formatCount(preview.summary.rowCount)" tone="accent" />
          <MetricCard label="Matched" :value="formatCount(preview.summary.matchedCount)" />
          <MetricCard label="Unmatched" :value="formatCount(preview.summary.unmatchedCount)" />
          <MetricCard label="Revenue" :value="formatMoney(preview.summary.totalAmount)" tone="alt" />
          <MetricCard label="Units" :value="formatCount(preview.summary.totalUnits)" />
          <MetricCard label="Channels" :value="formatCount(preview.summary.channelCount)" />
          <MetricCard label="Countries" :value="formatCount(preview.summary.countryCount)" />
          <MetricCard label="Reporting date" :value="formatIsoDate(preview.summary.reportingDate)" />
        </div>
      </SectionCard>

      <div class="panel-grid">
        <SectionCard
          title="Matched releases"
          eyebrow="By release"
          description="Top matched releases from the preview payload. This is the financial shape before commit."
        >
          <div v-if="preview.releases.length" class="summary-table">
            <div v-for="release in preview.releases" :key="release.releaseId" class="summary-row">
              <div class="summary-copy">
                <strong>{{ release.releaseTitle }}</strong>
                <span class="detail-copy">
                  {{ formatCount(release.rowCount) }} rows / {{ formatCount(release.totalUnits) }} units
                </span>
              </div>
              <strong>{{ formatMoney(release.totalAmount) }}</strong>
            </div>
          </div>

          <p v-else class="muted-copy">
            No known tracks matched yet for {{ selectedArtistName }}. Add catalog tracks first or review unmatched ISRCs below.
          </p>
        </SectionCard>

        <SectionCard
          title="Unmatched ISRCs"
          eyebrow="Exceptions"
          description="Unknown ISRC rows stay out of financial truth until the catalog exists or the upload is corrected."
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
                  {{ item.releaseTitle || "Unknown release" }} / {{ formatCount(item.occurrences) }} rows /
                  {{ item.sampleChannels.join(", ") }}
                </span>
              </div>
              <strong>{{ formatMoney(item.totalAmount) }}</strong>
            </div>
          </div>

          <p v-else class="muted-copy">
            Every row matched a known track. This preview can move straight into earnings and the ledger.
          </p>
        </SectionCard>
      </div>

      <div class="panel-grid">
        <SectionCard
          title="Manual analytics"
          eyebrow="Monthly artist metrics"
          description="These metrics write to analytics_snapshots alongside the earnings commit."
        >
          <div class="catalog-grid">
            <div v-for="field in manualMetrics" :key="field.key" class="field-row">
              <label :for="field.key">{{ field.label }}</label>
              <input :id="field.key" v-model="analytics[field.key]" class="input" type="number" min="0" />
            </div>
          </div>
        </SectionCard>

        <SectionCard
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

            <div v-if="!canCommitPreview" class="banner error">
              Commit is blocked because this preview still has unmatched rows or no matched data.
            </div>

            <div class="button-row">
              <button class="button" :disabled="isCommitting || !canCommitPreview" @click="commitPreview">
                {{ isCommitting ? "Committing..." : "Commit upload" }}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>
    </template>

    <SectionCard
      title="Upload history"
      eyebrow="Per artist"
      :description="uploadsDescription"
    >
      <div v-if="uploadHistoryError" class="banner error">
        {{ uploadHistoryError.statusMessage || "Unable to load upload history." }}
      </div>

      <div v-else-if="uploadHistoryPending" class="status-message">Loading upload history...</div>

      <div v-else-if="!uploadHistory.length" class="muted-copy">
        No CSV uploads exist for this artist yet.
      </div>

      <div v-else class="summary-table">
        <div v-for="upload in uploadHistory" :key="upload.id" class="summary-row">
          <div class="summary-copy">
            <strong>{{ upload.filename }}</strong>
            <span class="detail-copy">
              {{ formatPeriodMonth(upload.periodMonth.slice(0, 7)) }} / {{ formatDateTime(upload.createdAt) }}
            </span>
            <span class="detail-copy">
              {{ formatCount(upload.rowCount) }} rows / {{ formatMoney(upload.totalAmount) }}
            </span>
            <span v-if="upload.errorMessage" class="detail-copy">{{ upload.errorMessage }}</span>
          </div>

          <div class="table-actions">
            <span class="status-pill" :class="statusClass(upload.status)">{{ formatStatus(upload.status) }}</span>
            <button
              v-if="upload.status === 'completed'"
              class="button button-secondary"
              :disabled="reversingUploadId === upload.id"
              @click="reverseUpload(upload)"
            >
              {{ reversingUploadId === upload.id ? "Reversing..." : "Reverse" }}
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  </div>
</template>
