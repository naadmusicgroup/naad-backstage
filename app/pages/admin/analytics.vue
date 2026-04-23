<script setup lang="ts">
import type {
  AdminAnalyticsMutationInput,
  AdminAnalyticsRecord,
  AdminAnalyticsResponse,
  AdminAnalyticsUpdateInput,
} from "~~/types/admin"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const ALL_FILTER = "all"
const NO_RELEASE = "none"

interface AnalyticsDraft {
  releaseId: string
  metricKey: string
  value: string
  periodMonth: string
}

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
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
  metricKey: "",
  value: "",
  periodMonth: new Date().toISOString().slice(0, 7),
})
const filters = reactive({
  artistId: ALL_FILTER,
  releaseId: ALL_FILTER,
  periodMonth: ALL_FILTER,
  metricKey: ALL_FILTER,
  source: ALL_FILTER,
})
const successMessage = ref("")
const errorMessage = ref("")
const creating = ref(false)
const updatingEntryId = ref("")
const deletingEntryId = ref("")
const editDrafts = reactive<Record<string, AnalyticsDraft>>({})

const { data, pending, error, refresh } = useLazyFetch<AdminAnalyticsResponse>("/api/admin/analytics")

const entries = computed(() => data.value?.entries ?? [])
const artistOptions = computed(() => data.value?.artistOptions ?? [])
const releaseOptions = computed(() => data.value?.releaseOptions ?? [])
const metricOptions = computed(() => data.value?.metricOptions ?? [])
const summary = computed(() => data.value?.summary ?? {
  entryCount: 0,
  manualEntryCount: 0,
  uploadLinkedEntryCount: 0,
  totalValue: "0",
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

const filteredReleaseOptions = computed(() => {
  if (filters.artistId === ALL_FILTER) {
    return releaseOptions.value
  }

  return releaseOptions.value.filter((option) => option.meta === filters.artistId)
})

const periodOptions = computed(() => [
  { value: ALL_FILTER, label: "All periods" },
  ...[...new Set(entries.value.map((entry) => entry.periodMonth))]
    .sort((left, right) => right.localeCompare(left))
    .map((periodMonth) => ({
      value: periodMonth,
      label: formatMonth(periodMonth),
    })),
])

const metricFilterOptions = computed(() => [
  { value: ALL_FILTER, label: "All metrics" },
  ...metricOptions.value.map((option) => ({
    value: metricKey(option.platform, option.metricType),
    label: option.label,
  })),
])

const filteredEntries = computed(() => {
  return entries.value.filter((entry) => {
    return (
      matches(filters.artistId, entry.artistId)
      && matches(filters.releaseId, entry.releaseId)
      && matches(filters.periodMonth, entry.periodMonth)
      && matches(filters.metricKey, metricKey(entry.platform, entry.metricType))
      && (
        filters.source === ALL_FILTER
        || (filters.source === "manual" && !entry.uploadId)
        || (filters.source === "upload" && Boolean(entry.uploadId))
      )
    )
  })
})

const summaryMetrics = computed(() => [
  {
    label: "Snapshots",
    value: summary.value.entryCount.toLocaleString(),
    footnote: `${summary.value.manualEntryCount.toLocaleString()} manual / ${summary.value.uploadLinkedEntryCount.toLocaleString()} CSV-linked`,
    tone: "accent" as const,
  },
  {
    label: "Total audience value",
    value: formatCount(summary.value.totalValue),
    footnote: "Raw sum across visible snapshot rows",
    tone: "alt" as const,
  },
  {
    label: "Artists",
    value: summary.value.artistCount.toLocaleString(),
    footnote: `${summary.value.releaseCount.toLocaleString()} linked releases`,
    tone: "default" as const,
  },
  {
    label: "Periods",
    value: summary.value.periodCount.toLocaleString(),
    footnote: "Monthly audience snapshots",
    tone: "default" as const,
  },
])

watch(
  metricOptions,
  (value) => {
    if (!createForm.metricKey && value.length) {
      createForm.metricKey = metricKey(value[0].platform, value[0].metricType)
    }
  },
  { immediate: true },
)

watch(
  entries,
  (value) => {
    for (const entry of value) {
      editDrafts[entry.id] = {
        releaseId: entry.releaseId ?? NO_RELEASE,
        metricKey: metricKey(entry.platform, entry.metricType),
        value: entry.value,
        periodMonth: inputMonthValue(entry.periodMonth),
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

watch(
  () => filters.artistId,
  () => {
    if (filters.releaseId !== ALL_FILTER && !filteredReleaseOptions.value.some((option) => option.value === filters.releaseId)) {
      filters.releaseId = ALL_FILTER
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

function metricKey(platform: string, metricType: string) {
  return `${platform}:${metricType}`
}

function metricParts(value: string) {
  const [platform, metricType] = value.split(":")
  return { platform, metricType }
}

function matches(selectedValue: string, rowValue: string | null) {
  if (selectedValue === ALL_FILTER) {
    return true
  }

  if (selectedValue === NO_RELEASE) {
    return !rowValue
  }

  return rowValue === selectedValue
}

function formatCount(value: string | number | null | undefined) {
  return compactNumberFormatter.format(Number(value ?? 0))
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

function periodMonthForApi(value: string) {
  return value.length === 7 ? `${value}-01` : value
}

function releaseIdForApi(value: string) {
  return value === NO_RELEASE ? null : value
}

function releaseOptionsForEntry(entry: AdminAnalyticsRecord) {
  return releaseOptions.value.filter((option) => option.meta === entry.artistId)
}

function resetCreateForm() {
  createForm.releaseId = NO_RELEASE
  createForm.value = ""
}

async function createAnalyticsSnapshot() {
  const metric = metricParts(createForm.metricKey)
  creating.value = true
  resetMessages()

  try {
    const body: AdminAnalyticsMutationInput = {
      artistId: createForm.artistId,
      releaseId: releaseIdForApi(createForm.releaseId),
      platform: metric.platform as AdminAnalyticsMutationInput["platform"],
      metricType: metric.metricType as AdminAnalyticsMutationInput["metricType"],
      value: createForm.value,
      periodMonth: periodMonthForApi(createForm.periodMonth),
    }

    await $fetch("/api/admin/analytics", {
      method: "POST",
      body,
    })

    await refresh()
    resetCreateForm()
    setSuccess("Analytics snapshot created.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to create this analytics snapshot.")
  } finally {
    creating.value = false
  }
}

async function updateAnalyticsSnapshot(entry: AdminAnalyticsRecord) {
  const draft = editDrafts[entry.id]

  if (!draft) {
    return
  }

  const metric = metricParts(draft.metricKey)
  updatingEntryId.value = entry.id
  resetMessages()

  try {
    const body: AdminAnalyticsUpdateInput = {
      releaseId: releaseIdForApi(draft.releaseId),
      platform: metric.platform as AdminAnalyticsUpdateInput["platform"],
      metricType: metric.metricType as AdminAnalyticsUpdateInput["metricType"],
      value: draft.value,
      periodMonth: periodMonthForApi(draft.periodMonth),
    }

    await $fetch(`/api/admin/analytics/${entry.id}`, {
      method: "PATCH",
      body,
    })

    await refresh()
    setSuccess(`Analytics snapshot for ${entry.artistName} updated.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to update this analytics snapshot.")
  } finally {
    updatingEntryId.value = ""
  }
}

async function deleteAnalyticsSnapshot(entry: AdminAnalyticsRecord) {
  if (import.meta.client && !window.confirm(`Delete ${entry.label} for ${entry.artistName}?`)) {
    return
  }

  deletingEntryId.value = entry.id
  resetMessages()

  try {
    await $fetch(`/api/admin/analytics/${entry.id}`, {
      method: "DELETE",
    })

    await refresh()
    setSuccess(`Analytics snapshot for ${entry.artistName} deleted.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to delete this analytics snapshot.")
  } finally {
    deletingEntryId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Analytics"
      eyebrow="Manual snapshots"
      description="Create and edit monthly audience metrics at artist or release level. These snapshots feed the artist analytics dashboard without requiring a CSV commit."
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
          {{ error.statusMessage || "Unable to load analytics snapshots right now." }}
        </div>
        <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="banner">{{ successMessage }}</div>
      </div>
    </SectionCard>

    <SectionCard
      title="Create snapshot"
      eyebrow="Standalone entry"
      description="Use artist-level for global profile stats or link a release when the metric belongs to one catalog item."
    >
      <form class="analytics-form-grid" @submit.prevent="createAnalyticsSnapshot">
        <div class="field-row">
          <label for="analytics-artist">Artist</label>
          <select id="analytics-artist" v-model="createForm.artistId" class="input" required>
            <option value="" disabled>Select artist</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">
              {{ artist.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="analytics-release">Release</label>
          <select id="analytics-release" v-model="createForm.releaseId" class="input" :disabled="!createForm.artistId">
            <option :value="NO_RELEASE">Artist-level snapshot</option>
            <option v-for="release in createReleaseOptions" :key="release.value" :value="release.value">
              {{ release.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="analytics-metric">Metric</label>
          <select id="analytics-metric" v-model="createForm.metricKey" class="input" required>
            <option v-for="metric in metricOptions" :key="metricKey(metric.platform, metric.metricType)" :value="metricKey(metric.platform, metric.metricType)">
              {{ metric.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="analytics-value">Value</label>
          <input id="analytics-value" v-model="createForm.value" class="input" type="number" min="0" step="1" placeholder="0" required>
        </div>

        <div class="field-row">
          <label for="analytics-period">Period month</label>
          <input id="analytics-period" v-model="createForm.periodMonth" class="input" type="month" required>
        </div>

        <div class="analytics-form-actions">
          <button class="button" type="submit" :disabled="creating || !createForm.artistId || !createForm.metricKey">
            {{ creating ? "Creating..." : "Create snapshot" }}
          </button>
        </div>
      </form>
    </SectionCard>

    <SectionCard
      title="Snapshot ledger"
      eyebrow="Filter and edit"
      description="CSV-linked rows are labeled, but can still be corrected when a platform report needs an audience metric adjustment."
    >
      <div class="analytics-filter-grid">
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
          <label for="filter-release">Release</label>
          <select id="filter-release" v-model="filters.releaseId" class="input">
            <option :value="ALL_FILTER">All releases</option>
            <option :value="NO_RELEASE">Artist-level only</option>
            <option v-for="release in filteredReleaseOptions" :key="release.value" :value="release.value">
              {{ release.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="filter-period">Period</label>
          <select id="filter-period" v-model="filters.periodMonth" class="input">
            <option v-for="option in periodOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="filter-metric">Metric</label>
          <select id="filter-metric" v-model="filters.metricKey" class="input">
            <option v-for="option in metricFilterOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="filter-source">Source</label>
          <select id="filter-source" v-model="filters.source" class="input">
            <option :value="ALL_FILTER">All sources</option>
            <option value="manual">Manual only</option>
            <option value="upload">CSV-linked only</option>
          </select>
        </div>
      </div>

      <div v-if="pending && !data" class="muted-copy">Loading analytics snapshots...</div>
      <div v-else-if="!filteredEntries.length" class="muted-copy">
        No analytics snapshots match the current filters.
      </div>

      <div v-else class="catalog-list">
        <article v-for="entry in filteredEntries" :key="entry.id" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ entry.artistName }}</strong>
              <span class="detail-copy">
                {{ entry.releaseTitle || "Artist-level snapshot" }} / {{ entry.label }} / {{ formatMonth(entry.periodMonth) }}
              </span>
            </div>
            <strong>{{ formatCount(entry.value) }}</strong>
          </div>

          <div class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Source</span>
              <strong>{{ entry.uploadFilename ? `CSV: ${entry.uploadFilename}` : "Manual entry" }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Entered by</span>
              <strong>{{ entry.enteredByName || "Unknown admin" }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Created / updated</span>
              <strong>{{ formatDate(entry.createdAt) }} / {{ formatDate(entry.updatedAt) }}</strong>
            </div>
          </div>

          <div v-if="editDrafts[entry.id]" class="analytics-edit-grid">
            <div class="field-row">
              <label :for="`analytics-release-${entry.id}`">Release</label>
              <select :id="`analytics-release-${entry.id}`" v-model="editDrafts[entry.id].releaseId" class="input">
                <option :value="NO_RELEASE">Artist-level snapshot</option>
                <option v-for="release in releaseOptionsForEntry(entry)" :key="release.value" :value="release.value">
                  {{ release.label }}
                </option>
              </select>
            </div>

            <div class="field-row">
              <label :for="`analytics-metric-${entry.id}`">Metric</label>
              <select :id="`analytics-metric-${entry.id}`" v-model="editDrafts[entry.id].metricKey" class="input">
                <option v-for="metric in metricOptions" :key="metricKey(metric.platform, metric.metricType)" :value="metricKey(metric.platform, metric.metricType)">
                  {{ metric.label }}
                </option>
              </select>
            </div>

            <div class="field-row">
              <label :for="`analytics-value-${entry.id}`">Value</label>
              <input :id="`analytics-value-${entry.id}`" v-model="editDrafts[entry.id].value" class="input" type="number" min="0" step="1">
            </div>

            <div class="field-row">
              <label :for="`analytics-period-${entry.id}`">Period month</label>
              <input :id="`analytics-period-${entry.id}`" v-model="editDrafts[entry.id].periodMonth" class="input" type="month">
            </div>
          </div>

          <div class="button-row">
            <button class="button" type="button" :disabled="updatingEntryId === entry.id || deletingEntryId === entry.id" @click="updateAnalyticsSnapshot(entry)">
              {{ updatingEntryId === entry.id ? "Saving..." : "Save changes" }}
            </button>
            <button class="button button-secondary button-danger" type="button" :disabled="deletingEntryId === entry.id || updatingEntryId === entry.id" @click="deleteAnalyticsSnapshot(entry)">
              {{ deletingEntryId === entry.id ? "Deleting..." : "Delete snapshot" }}
            </button>
          </div>
        </article>
      </div>
    </SectionCard>
  </div>
</template>

<style scoped>
.analytics-form-grid,
.analytics-filter-grid,
.analytics-edit-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.analytics-form-actions {
  display: flex;
  align-items: end;
}
</style>
