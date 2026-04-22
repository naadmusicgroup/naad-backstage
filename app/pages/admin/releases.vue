<script setup lang="ts">
import type {
  AdminReleaseRecord,
  AdminReleaseWorkspaceResponse,
  BulkCatalogImportResponse,
  CreateReleaseInput,
  CreateTrackInput,
  ReleaseChangeRequestType,
  ReleaseStatus,
  ReleaseType,
  ReplaceTrackCreditsInput,
  TrackCreditInput,
  TrackStatus,
} from "~~/types/catalog"
import { RELEASE_GENRE_OPTIONS, TRACK_CREDIT_ROLE_GROUPS } from "~~/types/catalog"
import type { ImportArtistOption } from "~~/types/imports"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

interface CreditDraft {
  creditedName: string
  roleCodes: string[]
}

interface EditableTrack {
  title: string
  isrc: string
  trackNumber: string
  audioPreviewUrl: string
  status: TrackStatus
}

interface EditableRelease {
  title: string
  type: ReleaseType
  genre: string
  upc: string
  coverArtUrl: string
  streamingLink: string
  releaseDate: string
  status: ReleaseStatus
}

interface SplitContributorDraft {
  artistId: string
  role: string
  splitPct: string
}

interface SplitVersionDraft {
  effectivePeriodMonth: string
  changeReason: string
  contributors: SplitContributorDraft[]
}

interface TrackCreateDraft {
  releaseId: string
  title: string
  isrc: string
  trackNumber: string
  audioPreviewUrl: string
  status: TrackStatus
  credits: CreditDraft[]
}

interface ReleaseCreateDraft {
  artistId: string
  title: string
  type: ReleaseType
  genre: string
  upc: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  status: ReleaseStatus
  tracks: TrackCreateDraft[]
}

function currentMonthValue() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
}

const TRACK_CREDIT_ROLE_OPTIONS = TRACK_CREDIT_ROLE_GROUPS.flatMap((group) => [...group.roles]) as string[]

function normalizeCreditRoleCodes(roleCodes: string[]) {
  return [...new Set(roleCodes.filter(Boolean))].sort((left, right) => {
    const leftIndex = TRACK_CREDIT_ROLE_OPTIONS.indexOf(left)
    const rightIndex = TRACK_CREDIT_ROLE_OPTIONS.indexOf(right)

    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right)
    }

    if (leftIndex === -1) {
      return 1
    }

    if (rightIndex === -1) {
      return -1
    }

    return leftIndex - rightIndex
  })
}

function blankCreditDraft(roleCodes: string[] = ["Main Artist"]): CreditDraft {
  return {
    creditedName: "",
    roleCodes: normalizeCreditRoleCodes(roleCodes),
  }
}

function groupCreditDrafts(credits: Array<{ creditedName: string; roleCode: string }>) {
  const drafts = new Map<string, CreditDraft>()

  for (const credit of credits) {
    const normalizedName = credit.creditedName.trim()
    const key = normalizedName.toLowerCase()
    const existing = drafts.get(key)

    if (existing) {
      existing.roleCodes = normalizeCreditRoleCodes([...existing.roleCodes, credit.roleCode])
      continue
    }

    drafts.set(key, {
      creditedName: normalizedName,
      roleCodes: normalizeCreditRoleCodes([credit.roleCode]),
    })
  }

  return [...drafts.values()]
}

function blankSplitContributor(): SplitContributorDraft {
  return {
    artistId: "",
    role: "",
    splitPct: "",
  }
}

function blankSplitDraft(): SplitVersionDraft {
  return {
    effectivePeriodMonth: currentMonthValue(),
    changeReason: "",
    contributors: [blankSplitContributor()],
  }
}

function blankTrackCreateDraft(releaseId = ""): TrackCreateDraft {
  return {
    releaseId,
    title: "",
    isrc: "",
    trackNumber: "",
    audioPreviewUrl: "",
    status: "draft",
    credits: [blankCreditDraft()],
  }
}

function blankCreateReleaseDraft(artistId = ""): ReleaseCreateDraft {
  return {
    artistId,
    title: "",
    type: "single",
    genre: "Pop",
    upc: null,
    coverArtUrl: null,
    streamingLink: null,
    releaseDate: null,
    status: "draft",
    tracks: [blankTrackCreateDraft()],
  }
}

function toNullableText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function buildCreditInputs(credits: CreditDraft[], label: string) {
  return credits.flatMap((credit, creditIndex) => {
    const creditedName = credit.creditedName.trim()

    if (!creditedName) {
      throw new Error(`${label} credit ${creditIndex + 1} needs a credited name.`)
    }

    const roleCodes = normalizeCreditRoleCodes(credit.roleCodes)

    if (!roleCodes.length) {
      throw new Error(`${label} credit ${creditIndex + 1} needs at least one role.`)
    }

    return roleCodes.map((roleCode, roleIndex) => ({
      creditedName,
      roleCode,
      sortOrder: creditIndex * 100 + roleIndex,
    } satisfies TrackCreditInput))
  })
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ")
}

function statusClass(status: ReleaseStatus | TrackStatus) {
  if (status === "live") {
    return "status-completed"
  }

  if (status === "taken_down") {
    return "status-processing"
  }

  if (status === "deleted") {
    return "status-abandoned"
  }

  return "status-processing"
}

function formatMonth(value: string) {
  if (!value) {
    return "No month"
  }

  const date = new Date(`${value}-01T00:00:00Z`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not recorded"
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)
}

function eventLabel(eventType: string) {
  return eventType
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

const selectedArtistId = ref("")
const catalogFile = ref<File | null>(null)
const catalogFileInput = ref<HTMLInputElement | null>(null)
const pageError = ref("")
const pageSuccess = ref("")
const bulkImportResult = ref<BulkCatalogImportResponse | null>(null)

const isCreatingRelease = ref(false)
const isBulkImporting = ref(false)
const releaseSaving = reactive<Record<string, boolean>>({})
const trackSaving = reactive<Record<string, boolean>>({})
const trackCreating = reactive<Record<string, boolean>>({})
const trackCreditSaving = reactive<Record<string, boolean>>({})
const releaseSplitSaving = reactive<Record<string, boolean>>({})
const trackSplitSaving = reactive<Record<string, boolean>>({})
const requestActing = reactive<Record<string, boolean>>({})
const requestNotes = reactive<Record<string, string>>({})

const releaseForm = reactive<ReleaseCreateDraft>(blankCreateReleaseDraft())
const releaseDrafts = reactive<Record<string, EditableRelease>>({})
const trackDrafts = reactive<Record<string, EditableTrack>>({})
const trackCreditDrafts = reactive<Record<string, CreditDraft[]>>({})
const newTrackDrafts = reactive<Record<string, TrackCreateDraft>>({})
const releaseSplitDrafts = reactive<Record<string, SplitVersionDraft>>({})
const trackSplitDrafts = reactive<Record<string, SplitVersionDraft>>({})

const { data: artistResponse } = useLazyFetch<{ artists: ImportArtistOption[] }>("/api/admin/artists")
const artists = computed(() => artistResponse.value?.artists ?? [])

watch(
  artists,
  (value) => {
    if (!selectedArtistId.value && value.length) {
      selectedArtistId.value = value[0].id
    }
  },
  { immediate: true },
)

watch(
  selectedArtistId,
  (value) => {
    releaseForm.artistId = value
    bulkImportResult.value = null
    catalogFile.value = null
    if (catalogFileInput.value) {
      catalogFileInput.value.value = ""
    }
    pageError.value = ""
    pageSuccess.value = ""
  },
  { immediate: true },
)

const { data, pending, error, refresh } = useLazyFetch<AdminReleaseWorkspaceResponse>("/api/admin/releases/workspace", {
  query: computed(() => (selectedArtistId.value ? { artistId: selectedArtistId.value } : undefined)),
  immediate: false,
  watch: false,
})

const releases = computed(() => data.value?.releases ?? [])
const pendingRequests = computed(() => data.value?.pendingRequests ?? [])

watch(
  selectedArtistId,
  (value) => {
    if (!value) {
      return
    }

    void refresh()
  },
  { immediate: true },
)

watch(
  releases,
  (items) => {
    for (const release of items) {
      releaseDrafts[release.id] = {
        title: release.title,
        type: release.type,
        genre: release.genre,
        upc: release.upc ?? "",
        coverArtUrl: release.coverArtUrl ?? "",
        streamingLink: release.streamingLink ?? "",
        releaseDate: release.releaseDate ?? "",
        status: release.status,
      }

      releaseSplitDrafts[release.id] = {
        effectivePeriodMonth: currentMonthValue(),
        changeReason: "",
        contributors: release.collaborators.length
          ? release.collaborators.map((collaborator) => ({
              artistId: collaborator.artistId,
              role: collaborator.role,
              splitPct: collaborator.splitPct.toFixed(2),
            }))
          : [blankSplitContributor()],
      }

      if (!newTrackDrafts[release.id]) {
        newTrackDrafts[release.id] = blankTrackCreateDraft(release.id)
      } else {
        newTrackDrafts[release.id].releaseId = release.id
      }

      if (requestNotes[release.id] === undefined) {
        requestNotes[release.id] = ""
      }

      for (const track of release.tracks) {
        trackDrafts[track.id] = {
          title: track.title,
          isrc: track.isrc,
          trackNumber: track.trackNumber === null ? "" : String(track.trackNumber),
          audioPreviewUrl: track.audioPreviewUrl ?? "",
          status: track.status,
        }

        trackCreditDrafts[track.id] = track.credits.length
          ? groupCreditDrafts(track.credits)
          : [blankCreditDraft()]

        trackSplitDrafts[track.id] = {
          effectivePeriodMonth: currentMonthValue(),
          changeReason: "",
          contributors: track.collaborators.length
            ? track.collaborators.map((collaborator) => ({
                artistId: collaborator.artistId,
                role: collaborator.role,
                splitPct: collaborator.splitPct.toFixed(2),
              }))
            : [blankSplitContributor()],
        }
      }
    }
  },
  { immediate: true },
)

function resetMessages() {
  pageError.value = ""
  pageSuccess.value = ""
}

function setSuccess(message: string) {
  pageSuccess.value = message
  pageError.value = ""
}

function setError(fetchError: any, fallback: string) {
  pageError.value = fetchError?.data?.statusMessage || fetchError?.message || fallback
  pageSuccess.value = ""
}

function onCatalogFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  catalogFile.value = target.files?.[0] ?? null
}

function addCreateTrack() {
  releaseForm.tracks.push(blankTrackCreateDraft())
}

function removeCreateTrack(index: number) {
  if (releaseForm.tracks.length === 1) {
    releaseForm.tracks.splice(0, 1, blankTrackCreateDraft())
    return
  }

  releaseForm.tracks.splice(index, 1)
}

function addCreateTrackCredit(index: number) {
  releaseForm.tracks[index]?.credits.push(blankCreditDraft())
}

function removeCreateTrackCredit(trackIndex: number, creditIndex: number) {
  const credits = releaseForm.tracks[trackIndex]?.credits

  if (!credits) {
    return
  }

  if (credits.length === 1) {
    credits.splice(0, 1, blankCreditDraft())
    return
  }

  credits.splice(creditIndex, 1)
}

function addTrackCredit(trackId: string) {
  ;(trackCreditDrafts[trackId] ??= [blankCreditDraft()]).push(blankCreditDraft())
}

function removeTrackCredit(trackId: string, creditIndex: number) {
  const credits = trackCreditDrafts[trackId] ?? []

  if (credits.length <= 1) {
    trackCreditDrafts[trackId] = [blankCreditDraft()]
    return
  }

  credits.splice(creditIndex, 1)
}

function confirmAction(message: string) {
  if (typeof window === "undefined") {
    return true
  }

  return window.confirm(message)
}

function addReleaseSplitContributor(releaseId: string) {
  ;(releaseSplitDrafts[releaseId] ??= blankSplitDraft()).contributors.push(blankSplitContributor())
}

function removeReleaseSplitContributor(releaseId: string, contributorIndex: number) {
  const contributors = releaseSplitDrafts[releaseId]?.contributors ?? []

  if (contributors.length <= 1) {
    releaseSplitDrafts[releaseId].contributors = [blankSplitContributor()]
    return
  }

  contributors.splice(contributorIndex, 1)
}

function addTrackSplitContributor(trackId: string) {
  ;(trackSplitDrafts[trackId] ??= blankSplitDraft()).contributors.push(blankSplitContributor())
}

function removeTrackSplitContributor(trackId: string, contributorIndex: number) {
  const contributors = trackSplitDrafts[trackId]?.contributors ?? []

  if (contributors.length <= 1) {
    trackSplitDrafts[trackId].contributors = [blankSplitContributor()]
    return
  }

  contributors.splice(contributorIndex, 1)
}

async function importCatalogFile() {
  if (!selectedArtistId.value) {
    pageError.value = "Select an artist before importing a catalog CSV."
    return
  }

  if (!catalogFile.value) {
    pageError.value = "Choose a catalog CSV file first."
    return
  }

  isBulkImporting.value = true
  resetMessages()

  try {
    const csvText = await catalogFile.value.text()
    const result = await $fetch<BulkCatalogImportResponse>("/api/admin/releases/bulk-import", {
      method: "POST",
      body: {
        artistId: selectedArtistId.value,
        filename: catalogFile.value.name,
        csvText,
      },
    })

    bulkImportResult.value = result
    await refresh()
    setSuccess(`Catalog import finished: ${result.createdReleaseCount} releases created and ${result.createdTrackCount} tracks created.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to import the catalog file.")
  } finally {
    isBulkImporting.value = false
  }
}

async function createRelease() {
  if (!releaseForm.artistId) {
    pageError.value = "Select an artist before creating a release."
    return
  }

  isCreatingRelease.value = true
  resetMessages()

  try {
    await $fetch("/api/admin/releases", {
      method: "POST",
      body: {
        artistId: releaseForm.artistId,
        title: releaseForm.title,
        type: releaseForm.type,
        genre: releaseForm.genre,
        upc: toNullableText(releaseForm.upc),
        coverArtUrl: toNullableText(releaseForm.coverArtUrl),
        streamingLink: toNullableText(releaseForm.streamingLink),
        releaseDate: toNullableText(releaseForm.releaseDate),
        status: releaseForm.status,
        tracks: releaseForm.tracks.map((track) => ({
          releaseId: "",
          title: track.title,
          isrc: track.isrc,
          trackNumber: track.trackNumber === "" ? null : Number(track.trackNumber),
          audioPreviewUrl: toNullableText(track.audioPreviewUrl),
          status: track.status,
          credits: buildCreditInputs(track.credits, track.title || "Track"),
        })),
      } satisfies CreateReleaseInput,
    })

    Object.assign(releaseForm, blankCreateReleaseDraft(selectedArtistId.value))
    await refresh()
    setSuccess("Release created.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to create the release.")
  } finally {
    isCreatingRelease.value = false
  }
}

async function saveRelease(releaseId: string) {
  releaseSaving[releaseId] = true
  resetMessages()

  try {
    const draft = releaseDrafts[releaseId]

    await $fetch(`/api/admin/releases/${releaseId}`, {
      method: "PATCH",
      body: {
        title: draft.title,
        type: draft.type,
        genre: draft.genre,
        upc: toNullableText(draft.upc),
        coverArtUrl: toNullableText(draft.coverArtUrl),
        streamingLink: toNullableText(draft.streamingLink),
        releaseDate: toNullableText(draft.releaseDate),
        status: draft.status,
      },
    })

    await refresh()
    setSuccess("Release saved.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to save the release.")
  } finally {
    releaseSaving[releaseId] = false
  }
}

async function createTrack(releaseId: string) {
  trackCreating[releaseId] = true
  resetMessages()

  try {
    const draft = newTrackDrafts[releaseId]

    await $fetch("/api/admin/tracks", {
      method: "POST",
      body: {
        releaseId,
        title: draft.title,
        isrc: draft.isrc,
        trackNumber: draft.trackNumber === "" ? null : Number(draft.trackNumber),
        audioPreviewUrl: toNullableText(draft.audioPreviewUrl),
        status: draft.status,
        credits: buildCreditInputs(draft.credits, draft.title || "Track"),
      } satisfies CreateTrackInput,
    })

    newTrackDrafts[releaseId] = blankTrackCreateDraft(releaseId)
    await refresh()
    setSuccess("Track added.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to add the track.")
  } finally {
    trackCreating[releaseId] = false
  }
}

async function saveTrack(trackId: string) {
  trackSaving[trackId] = true
  resetMessages()

  try {
    const draft = trackDrafts[trackId]

    await $fetch(`/api/admin/tracks/${trackId}`, {
      method: "PATCH",
      body: {
        title: draft.title,
        isrc: draft.isrc,
        trackNumber: draft.trackNumber === "" ? null : Number(draft.trackNumber),
        audioPreviewUrl: toNullableText(draft.audioPreviewUrl),
        status: draft.status,
      },
    })

    await refresh()
    setSuccess("Track saved.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to save the track.")
  } finally {
    trackSaving[trackId] = false
  }
}

async function saveTrackCredits(trackId: string) {
  trackCreditSaving[trackId] = true
  resetMessages()

  try {
    const body: ReplaceTrackCreditsInput = {
      credits: buildCreditInputs(trackCreditDrafts[trackId] ?? [], "Track"),
    }

    await $fetch(`/api/admin/tracks/${trackId}/credits`, {
      method: "PUT",
      body,
    })

    await refresh()
    setSuccess("Track credits updated.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to save track credits.")
  } finally {
    trackCreditSaving[trackId] = false
  }
}

async function deleteRelease(releaseId: string, releaseTitle: string) {
  if (!confirmAction(`Delete "${releaseTitle}" from the active catalog? Historical earnings data will stay preserved.`)) {
    return
  }

  releaseSaving[releaseId] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/releases/${releaseId}`, {
      method: "PATCH",
      body: {
        status: "deleted",
      },
    })

    await refresh()
    setSuccess("Release marked deleted.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to delete the release.")
  } finally {
    releaseSaving[releaseId] = false
  }
}

async function deleteTrack(trackId: string, releaseStatus: ReleaseStatus, trackTitle: string) {
  if (releaseStatus !== "draft") {
    pageError.value = "Tracks can only be deleted directly while the release is still in draft."
    pageSuccess.value = ""
    return
  }

  if (!confirmAction(`Delete "${trackTitle}" from this draft release?`)) {
    return
  }

  trackSaving[trackId] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/tracks/${trackId}`, {
      method: "PATCH",
      body: {
        status: "deleted",
      },
    })

    await refresh()
    setSuccess("Track marked deleted.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to delete the track.")
  } finally {
    trackSaving[trackId] = false
  }
}

async function saveReleaseSplit(releaseId: string) {
  releaseSplitSaving[releaseId] = true
  resetMessages()

  try {
    const draft = releaseSplitDrafts[releaseId]

    await $fetch(`/api/admin/releases/${releaseId}/split-version`, {
      method: "POST",
      body: {
        effectivePeriodMonth: draft.effectivePeriodMonth,
        changeReason: toNullableText(draft.changeReason),
        contributors: draft.contributors.map((contributor) => ({
          artistId: contributor.artistId,
          role: contributor.role,
          splitPct: contributor.splitPct,
        })),
      },
    })

    await refresh()
    setSuccess("Release split version saved.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to save the release split version.")
  } finally {
    releaseSplitSaving[releaseId] = false
  }
}

async function saveTrackSplit(trackId: string) {
  trackSplitSaving[trackId] = true
  resetMessages()

  try {
    const draft = trackSplitDrafts[trackId]

    await $fetch(`/api/admin/tracks/${trackId}/split-version`, {
      method: "POST",
      body: {
        effectivePeriodMonth: draft.effectivePeriodMonth,
        changeReason: toNullableText(draft.changeReason),
        contributors: draft.contributors.map((contributor) => ({
          artistId: contributor.artistId,
          role: contributor.role,
          splitPct: contributor.splitPct,
        })),
      },
    })

    await refresh()
    setSuccess("Track split version saved.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to save the track split version.")
  } finally {
    trackSplitSaving[trackId] = false
  }
}

async function reviewRequest(requestId: string, action: "approve" | "reject") {
  requestActing[requestId] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/releases/requests/${requestId}/${action}`, {
      method: "POST",
      body: {
        adminNotes: toNullableText(requestNotes[requestId]),
      },
    })

    await refresh()
    setSuccess(action === "approve" ? "Request approved." : "Request rejected.")
  } catch (fetchError: any) {
    setError(fetchError, `Unable to ${action} the request.`)
  } finally {
    requestActing[requestId] = false
  }
}

const summaryMetrics = computed(() => [
  {
    label: "Visible releases",
    value: String(releases.value.length),
    footnote: "Draft, live, taken down, and deleted catalog rows for this artist.",
    tone: "accent" as const,
  },
  {
    label: "Visible tracks",
    value: String(releases.value.reduce((sum, release) => sum + release.tracks.length, 0)),
    footnote: "Track rows nested under the selected artist's releases.",
    tone: "default" as const,
  },
  {
    label: "Pending requests",
    value: String(pendingRequests.value.length),
    footnote: "Artist draft edits and takedown requests awaiting review.",
    tone: "alt" as const,
  },
])
</script>

<template>
  <div class="page">
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

    <SectionCard
      title="Lifecycle rules"
      eyebrow="Catalog model"
      description="Releases now move through draft, live, taken down, and deleted states. Splits are versioned with effective months, credits are separate from splits, and artist edits route through the request queue."
    >
      <div class="form-grid">
        <div v-if="pageError" class="banner error">{{ pageError }}</div>
        <div v-if="pageSuccess" class="banner">{{ pageSuccess }}</div>
        <div v-if="error" class="banner error">{{ error.statusMessage || "Unable to load the release workspace right now." }}</div>
      </div>
    </SectionCard>

    <SectionCard
      title="Draft Release"
      eyebrow="Create"
      description="Build a release with genre, initial tracks, and per-track credits in one submission. New releases default to draft until you intentionally push them live."
    >
      <div class="catalog-grid catalog-grid-wide">
        <div class="field-row">
          <label for="release-artist">Artist</label>
          <select id="release-artist" v-model="selectedArtistId" class="input">
            <option disabled value="">Select artist</option>
            <option v-for="artist in artists" :key="artist.id" :value="artist.id">
              {{ artist.name }}
            </option>
          </select>
        </div>

        <div class="field-row">
          <label for="release-title">Title</label>
          <input id="release-title" v-model="releaseForm.title" class="input" type="text" />
        </div>

        <div class="field-row">
          <label for="release-type">Type</label>
          <select id="release-type" v-model="releaseForm.type" class="input">
            <option value="single">Single</option>
            <option value="ep">EP</option>
            <option value="album">Album</option>
          </select>
        </div>

        <div class="field-row">
          <label for="release-status">Status</label>
          <select id="release-status" v-model="releaseForm.status" class="input">
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="taken_down">Taken down</option>
            <option value="deleted">Deleted</option>
          </select>
        </div>

        <div class="field-row">
          <label for="release-genre">Genre</label>
          <select id="release-genre" v-model="releaseForm.genre" class="input">
            <option v-for="genre in RELEASE_GENRE_OPTIONS" :key="genre" :value="genre">{{ genre }}</option>
          </select>
        </div>

        <div class="field-row">
          <label for="release-upc">UPC</label>
          <input id="release-upc" v-model="releaseForm.upc" class="input mono" type="text" />
        </div>

        <div class="field-row">
          <label for="release-date">Release date</label>
          <input id="release-date" v-model="releaseForm.releaseDate" class="input" type="date" />
        </div>

        <div class="field-row">
          <label for="release-cover">Cover art URL</label>
          <input id="release-cover" v-model="releaseForm.coverArtUrl" class="input" type="url" />
        </div>

        <div class="field-row">
          <label for="release-link">Streaming link</label>
          <input id="release-link" v-model="releaseForm.streamingLink" class="input" type="url" />
        </div>
      </div>

      <div class="catalog-track-list">
        <div class="catalog-section-header">
          <div class="summary-copy">
            <strong>Initial tracks and credits</strong>
            <span class="detail-copy">Credits are stored separately from royalty splits and show on the artist release page under each track.</span>
          </div>
        </div>

        <div class="catalog-subitems">
          <article v-for="(track, trackIndex) in releaseForm.tracks" :key="`create-track-${trackIndex}`" class="catalog-subitem">
            <div class="catalog-grid catalog-grid-wide">
              <div class="field-row">
                <label :for="`create-track-title-${trackIndex}`">Track title</label>
                <input :id="`create-track-title-${trackIndex}`" v-model="track.title" class="input" type="text" />
              </div>

              <div class="field-row">
                <label :for="`create-track-isrc-${trackIndex}`">ISRC</label>
                <input :id="`create-track-isrc-${trackIndex}`" v-model="track.isrc" class="input mono" type="text" />
              </div>

              <div class="field-row">
                <label :for="`create-track-number-${trackIndex}`">Track no.</label>
                <input :id="`create-track-number-${trackIndex}`" v-model="track.trackNumber" class="input" type="number" min="1" />
              </div>

              <div class="field-row">
                <label :for="`create-track-status-${trackIndex}`">Track status</label>
                <select :id="`create-track-status-${trackIndex}`" v-model="track.status" class="input">
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="deleted">Deleted</option>
                </select>
              </div>

              <div class="field-row field-row-full">
                <label :for="`create-track-audio-${trackIndex}`">Audio preview URL</label>
                <input :id="`create-track-audio-${trackIndex}`" v-model="track.audioPreviewUrl" class="input" type="url" />
              </div>
            </div>

            <div class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Credits</strong>
                  <span class="detail-copy">A credited person can hold multiple roles on the same track.</span>
                </div>
              </div>

              <div class="catalog-subitems">
                <div v-for="(credit, creditIndex) in track.credits" :key="`create-credit-${trackIndex}-${creditIndex}`" class="catalog-subitem catalog-subitem-compact">
                  <div class="catalog-grid catalog-grid-wide">
                    <div class="field-row">
                      <label :for="`create-credit-name-${trackIndex}-${creditIndex}`">Credited name</label>
                      <input :id="`create-credit-name-${trackIndex}-${creditIndex}`" v-model="credit.creditedName" class="input" type="text" />
                    </div>

                    <div class="field-row field-row-full">
                      <label>Roles</label>
                      <div class="role-checkbox-groups">
                        <div v-for="group in TRACK_CREDIT_ROLE_GROUPS" :key="`${group.group}-${trackIndex}-${creditIndex}`" class="role-checkbox-group">
                          <strong>{{ group.group }}</strong>
                          <div class="role-checkbox-list">
                            <label
                              v-for="role in group.roles"
                              :key="`create-credit-role-${trackIndex}-${creditIndex}-${role}`"
                              class="role-checkbox"
                            >
                              <input
                                :id="`create-credit-role-${trackIndex}-${creditIndex}-${role}`"
                                v-model="credit.roleCodes"
                                type="checkbox"
                                :value="role"
                              />
                              <span>{{ role }}</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="button-row">
                    <button class="button button-secondary button-danger" @click="removeCreateTrackCredit(trackIndex, creditIndex)">
                      Remove credit
                    </button>
                  </div>
                </div>
              </div>

              <div class="button-row">
                <button class="button button-secondary" @click="addCreateTrackCredit(trackIndex)">Add credit</button>
              </div>
            </div>

            <div class="button-row">
              <button class="button button-secondary button-danger" @click="removeCreateTrack(trackIndex)">Remove track</button>
            </div>
          </article>
        </div>
      </div>

      <div class="button-row">
        <button class="button button-secondary" @click="addCreateTrack">Add another track</button>
        <button class="button" :disabled="isCreatingRelease" @click="createRelease">
          {{ isCreatingRelease ? "Creating..." : "Create release" }}
        </button>
      </div>
    </SectionCard>

    <SectionCard
      title="Catalog Import"
      eyebrow="CSV tools"
      description="The CSV workflow still works for bulk seeding catalog rows. Imported releases inherit the new lifecycle schema from the database defaults."
    >
      <div class="catalog-grid">
        <div class="field-row">
          <label for="catalog-file">Catalog CSV</label>
          <input id="catalog-file" ref="catalogFileInput" class="input" type="file" accept=".csv,text/csv" @change="onCatalogFileChange" />
        </div>
      </div>

      <div class="button-row">
        <button class="button button-secondary" :disabled="isBulkImporting" @click="importCatalogFile">
          {{ isBulkImporting ? "Importing..." : "Run catalog import" }}
        </button>
      </div>

      <div v-if="bulkImportResult" class="summary-table">
        <div class="summary-row">
          <span class="detail-copy">Releases created</span>
          <strong>{{ bulkImportResult.createdReleaseCount }}</strong>
        </div>
        <div class="summary-row">
          <span class="detail-copy">Tracks created</span>
          <strong>{{ bulkImportResult.createdTrackCount }}</strong>
        </div>
        <div class="summary-row">
          <span class="detail-copy">Tracks skipped</span>
          <strong>{{ bulkImportResult.skippedTrackCount }}</strong>
        </div>
      </div>
    </SectionCard>

    <SectionCard
      title="Pending Requests"
      eyebrow="Review queue"
      description="Artists can edit draft releases and request takedowns, but the change does not apply until an admin reviews it here."
    >
      <div v-if="pending && !data" class="status-message">Loading request queue...</div>

      <div v-else-if="!pendingRequests.length" class="muted-copy">
        No artist change requests are pending right now.
      </div>

      <div v-else class="catalog-list">
        <article v-for="request in pendingRequests" :key="request.id" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ request.requestType === "draft_edit" ? "Draft edit request" : "Takedown request" }}</strong>
              <span class="detail-copy">{{ request.requesterArtistName }} on {{ formatDateTime(request.createdAt) }}</span>
            </div>
            <span class="status-pill status-processing">{{ formatStatusLabel(request.status) }}</span>
          </div>

          <div class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Release id</span>
              <strong class="mono">{{ request.releaseId }}</strong>
            </div>
            <div v-if="request.takedownReason" class="summary-row">
              <span class="detail-copy">Takedown reason</span>
              <strong>{{ request.takedownReason }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Snapshot tracks</span>
              <strong>{{ request.snapshot.tracks.length }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Snapshot credits</span>
              <strong>{{ request.snapshot.credits.length }}</strong>
            </div>
          </div>

          <div class="field-row field-row-full">
            <label :for="`request-note-${request.id}`">Admin notes</label>
            <textarea :id="`request-note-${request.id}`" v-model="requestNotes[request.id]" class="input" rows="3" />
          </div>

          <div class="button-row">
            <button class="button" :disabled="requestActing[request.id]" @click="reviewRequest(request.id, 'approve')">
              {{ requestActing[request.id] ? "Working..." : "Approve and apply" }}
            </button>
            <button class="button button-secondary button-danger" :disabled="requestActing[request.id]" @click="reviewRequest(request.id, 'reject')">
              {{ requestActing[request.id] ? "Working..." : "Reject" }}
            </button>
          </div>
        </article>
      </div>
    </SectionCard>

    <SectionCard
      title="Release Workspace"
      eyebrow="Lifecycle"
      description="Edit catalog metadata, schedule split changes by month, keep track credits current, and review the release timeline without collapsing taken down and deleted into the same state."
    >
      <div v-if="pending && !data" class="status-message">Loading release workspace...</div>

      <div v-else-if="!releases.length" class="muted-copy">
        No releases exist for this artist yet.
      </div>

      <div v-else class="catalog-list">
        <template v-for="release in releases" :key="release.id">
        <article
          v-if="releaseDrafts[release.id] && releaseSplitDrafts[release.id] && newTrackDrafts[release.id]"
          class="catalog-item"
        >
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ release.title }}</strong>
              <span class="detail-copy">{{ release.type.toUpperCase() }} / {{ release.genre }} / {{ release.releaseDate || "No date" }}</span>
            </div>
            <span class="status-pill" :class="statusClass(release.status)">
              {{ formatStatusLabel(release.status) }}
            </span>
          </div>

          <div class="catalog-grid catalog-grid-wide">
            <div class="field-row">
              <label :for="`release-title-${release.id}`">Title</label>
              <input :id="`release-title-${release.id}`" v-model="releaseDrafts[release.id].title" class="input" type="text" />
            </div>

            <div class="field-row">
              <label :for="`release-type-${release.id}`">Type</label>
              <select :id="`release-type-${release.id}`" v-model="releaseDrafts[release.id].type" class="input">
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Album</option>
              </select>
            </div>

            <div class="field-row">
              <label :for="`release-genre-${release.id}`">Genre</label>
              <select :id="`release-genre-${release.id}`" v-model="releaseDrafts[release.id].genre" class="input">
                <option v-for="genre in RELEASE_GENRE_OPTIONS" :key="genre" :value="genre">{{ genre }}</option>
              </select>
            </div>

            <div class="field-row">
              <label :for="`release-status-${release.id}`">Status</label>
              <select :id="`release-status-${release.id}`" v-model="releaseDrafts[release.id].status" class="input">
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="taken_down">Taken down</option>
                <option value="deleted">Deleted</option>
              </select>
            </div>

            <div class="field-row">
              <label :for="`release-upc-${release.id}`">UPC</label>
              <input :id="`release-upc-${release.id}`" v-model="releaseDrafts[release.id].upc" class="input mono" type="text" />
            </div>

            <div class="field-row">
              <label :for="`release-date-${release.id}`">Release date</label>
              <input :id="`release-date-${release.id}`" v-model="releaseDrafts[release.id].releaseDate" class="input" type="date" />
            </div>

            <div class="field-row">
              <label :for="`release-cover-${release.id}`">Cover art URL</label>
              <input :id="`release-cover-${release.id}`" v-model="releaseDrafts[release.id].coverArtUrl" class="input" type="url" />
            </div>

            <div class="field-row">
              <label :for="`release-link-${release.id}`">Streaming link</label>
              <input :id="`release-link-${release.id}`" v-model="releaseDrafts[release.id].streamingLink" class="input" type="url" />
            </div>
          </div>

      <div class="button-row">
        <CopyableLink v-if="releaseDrafts[release.id].streamingLink" :url="releaseDrafts[release.id].streamingLink" />
        <button class="button button-secondary" :disabled="releaseSaving[release.id]" @click="saveRelease(release.id)">
          {{ releaseSaving[release.id] ? "Saving..." : "Save release" }}
        </button>
        <button
          class="button button-secondary button-danger"
          :disabled="releaseSaving[release.id] || release.status === 'deleted'"
          @click="deleteRelease(release.id, release.title)"
        >
          {{ release.status === "deleted" ? "Release deleted" : "Delete release" }}
        </button>
      </div>

          <div v-if="release.takedownReason" class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Takedown reason</span>
              <strong>{{ release.takedownReason }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Requested</span>
              <strong>{{ formatDateTime(release.takedownRequestedAt) }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Completed</span>
              <strong>{{ formatDateTime(release.takedownCompletedAt) }}</strong>
            </div>
          </div>

          <div class="catalog-track-list">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Release split history</strong>
                <span class="detail-copy">Saving creates a new version with an effective statement month instead of mutating history in place.</span>
              </div>
            </div>

            <div class="catalog-subitems">
              <div v-for="version in release.splitHistory" :key="version.id" class="catalog-subitem catalog-subitem-compact">
                <div class="summary-copy">
                  <strong>{{ formatMonth(version.effectivePeriodMonth) }}</strong>
                  <span class="detail-copy">{{ version.changeReason || "No reason provided" }}</span>
                  <span class="detail-copy">Saved {{ formatDateTime(version.createdAt) }}</span>
                </div>
                <div class="detail-copy">
                  {{ version.contributors.map((contributor) => `${contributor.artistName} (${contributor.role} ${contributor.splitPct.toFixed(2)}%)`).join(", ") || "No contributors" }}
                </div>
              </div>
            </div>

            <div class="catalog-subitem catalog-subitem-muted">
              <div class="catalog-grid catalog-grid-wide">
                <div class="field-row">
                  <label :for="`release-split-month-${release.id}`">Effective month</label>
                  <input :id="`release-split-month-${release.id}`" v-model="releaseSplitDrafts[release.id].effectivePeriodMonth" class="input" type="month" />
                </div>

                <div class="field-row field-row-full">
                  <label :for="`release-split-reason-${release.id}`">Change reason</label>
                  <input :id="`release-split-reason-${release.id}`" v-model="releaseSplitDrafts[release.id].changeReason" class="input" type="text" />
                </div>
              </div>

              <div class="catalog-subitems">
                <div v-for="(contributor, contributorIndex) in releaseSplitDrafts[release.id].contributors" :key="`release-split-${release.id}-${contributorIndex}`" class="catalog-subitem catalog-subitem-compact">
                  <div class="catalog-grid catalog-grid-wide">
                    <div class="field-row">
                      <label :for="`release-split-artist-${release.id}-${contributorIndex}`">Artist</label>
                      <select :id="`release-split-artist-${release.id}-${contributorIndex}`" v-model="contributor.artistId" class="input">
                        <option value="">Select artist</option>
                        <option v-for="artist in artists" :key="artist.id" :value="artist.id">{{ artist.name }}</option>
                      </select>
                    </div>

                    <div class="field-row">
                      <label :for="`release-split-role-${release.id}-${contributorIndex}`">Role</label>
                      <input :id="`release-split-role-${release.id}-${contributorIndex}`" v-model="contributor.role" class="input" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`release-split-pct-${release.id}-${contributorIndex}`">Split %</label>
                      <input :id="`release-split-pct-${release.id}-${contributorIndex}`" v-model="contributor.splitPct" class="input" type="number" min="0" max="100" step="0.01" />
                    </div>
                  </div>

                  <div class="button-row">
                    <button class="button button-secondary button-danger" @click="removeReleaseSplitContributor(release.id, contributorIndex)">
                      Remove row
                    </button>
                  </div>
                </div>
              </div>

              <div class="button-row">
                <button class="button button-secondary" @click="addReleaseSplitContributor(release.id)">Add contributor</button>
                <button class="button" :disabled="releaseSplitSaving[release.id]" @click="saveReleaseSplit(release.id)">
                  {{ releaseSplitSaving[release.id] ? "Saving..." : "Save split version" }}
                </button>
              </div>
            </div>
          </div>

          <div class="catalog-track-list">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Tracks</strong>
                <span class="detail-copy">Tracks keep their own credits and may optionally override the release split map with track-specific split versions.</span>
              </div>
            </div>

            <div class="catalog-subitems">
              <template v-for="track in release.tracks" :key="track.id">
              <article
                v-if="trackDrafts[track.id] && trackCreditDrafts[track.id] && trackSplitDrafts[track.id]"
                class="catalog-subitem"
              >
                <div class="catalog-header">
                  <div class="summary-copy">
                    <strong>{{ track.trackNumber ? `${track.trackNumber}. ` : "" }}{{ track.title }}</strong>
                    <span class="detail-copy mono">{{ track.isrc }}</span>
                  </div>
                  <span class="status-pill" :class="statusClass(track.status)">{{ formatStatusLabel(track.status) }}</span>
                </div>

                <div class="catalog-grid catalog-grid-wide">
                  <div class="field-row">
                    <label :for="`track-title-${track.id}`">Track title</label>
                    <input :id="`track-title-${track.id}`" v-model="trackDrafts[track.id].title" class="input" type="text" />
                  </div>

                  <div class="field-row">
                    <label :for="`track-isrc-${track.id}`">ISRC</label>
                    <input :id="`track-isrc-${track.id}`" v-model="trackDrafts[track.id].isrc" class="input mono" type="text" />
                  </div>

                  <div class="field-row">
                    <label :for="`track-number-${track.id}`">Track no.</label>
                    <input :id="`track-number-${track.id}`" v-model="trackDrafts[track.id].trackNumber" class="input" type="number" min="1" />
                  </div>

                  <div class="field-row">
                    <label :for="`track-status-${track.id}`">Status</label>
                    <select :id="`track-status-${track.id}`" v-model="trackDrafts[track.id].status" class="input">
                      <option value="draft">Draft</option>
                      <option value="live">Live</option>
                      <option value="deleted">Deleted</option>
                    </select>
                  </div>

                  <div class="field-row field-row-full">
                    <label :for="`track-audio-${track.id}`">Audio preview URL</label>
                    <input :id="`track-audio-${track.id}`" v-model="trackDrafts[track.id].audioPreviewUrl" class="input" type="url" />
                  </div>
                </div>

                <div class="button-row">
                  <button class="button button-secondary" :disabled="trackSaving[track.id]" @click="saveTrack(track.id)">
                    {{ trackSaving[track.id] ? "Saving..." : "Save track" }}
                  </button>
                  <button
                    class="button button-secondary button-danger"
                    :disabled="trackSaving[track.id] || track.status === 'deleted'"
                    @click="deleteTrack(track.id, release.status, track.title)"
                  >
                    {{ track.status === "deleted" ? "Track deleted" : "Delete track" }}
                  </button>
                </div>

                <div class="catalog-track-list">
                  <div class="catalog-section-header">
                    <div class="summary-copy">
                      <strong>Credits</strong>
                      <span class="detail-copy">These credits show under the track on the artist page and stay separate from payout splits.</span>
                    </div>
                  </div>

                  <div class="catalog-subitems">
                    <div v-for="(credit, creditIndex) in trackCreditDrafts[track.id]" :key="`track-credit-${track.id}-${creditIndex}`" class="catalog-subitem catalog-subitem-compact">
                      <div class="catalog-grid catalog-grid-wide">
                        <div class="field-row">
                          <label :for="`track-credit-name-${track.id}-${creditIndex}`">Credited name</label>
                          <input :id="`track-credit-name-${track.id}-${creditIndex}`" v-model="credit.creditedName" class="input" type="text" />
                        </div>

                        <div class="field-row field-row-full">
                          <label>Roles</label>
                          <div class="role-checkbox-groups">
                            <div v-for="group in TRACK_CREDIT_ROLE_GROUPS" :key="`${group.group}-${track.id}-${creditIndex}`" class="role-checkbox-group">
                              <strong>{{ group.group }}</strong>
                              <div class="role-checkbox-list">
                                <label
                                  v-for="role in group.roles"
                                  :key="`track-credit-role-${track.id}-${creditIndex}-${role}`"
                                  class="role-checkbox"
                                >
                                  <input
                                    :id="`track-credit-role-${track.id}-${creditIndex}-${role}`"
                                    v-model="credit.roleCodes"
                                    type="checkbox"
                                    :value="role"
                                  />
                                  <span>{{ role }}</span>
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div class="button-row">
                        <button class="button button-secondary button-danger" @click="removeTrackCredit(track.id, creditIndex)">
                          Remove credit
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="button-row">
                    <button class="button button-secondary" @click="addTrackCredit(track.id)">Add credit</button>
                    <button class="button" :disabled="trackCreditSaving[track.id]" @click="saveTrackCredits(track.id)">
                      {{ trackCreditSaving[track.id] ? "Saving..." : "Save credits" }}
                    </button>
                  </div>
                </div>

                <div class="catalog-track-list">
                  <div class="catalog-section-header">
                    <div class="summary-copy">
                      <strong>Track split history</strong>
                      <span class="detail-copy">Use track-specific versions only when this track should diverge from the release-level split map.</span>
                    </div>
                  </div>

                  <div class="catalog-subitems">
                    <div v-for="version in track.splitHistory" :key="version.id" class="catalog-subitem catalog-subitem-compact">
                      <div class="summary-copy">
                        <strong>{{ formatMonth(version.effectivePeriodMonth) }}</strong>
                        <span class="detail-copy">{{ version.changeReason || "No reason provided" }}</span>
                        <span class="detail-copy">Saved {{ formatDateTime(version.createdAt) }}</span>
                      </div>
                      <div class="detail-copy">
                        {{ version.contributors.map((contributor) => `${contributor.artistName} (${contributor.role} ${contributor.splitPct.toFixed(2)}%)`).join(", ") || "No contributors" }}
                      </div>
                    </div>
                  </div>

                  <div class="catalog-subitem catalog-subitem-muted">
                    <div class="catalog-grid catalog-grid-wide">
                      <div class="field-row">
                        <label :for="`track-split-month-${track.id}`">Effective month</label>
                        <input :id="`track-split-month-${track.id}`" v-model="trackSplitDrafts[track.id].effectivePeriodMonth" class="input" type="month" />
                      </div>

                      <div class="field-row field-row-full">
                        <label :for="`track-split-reason-${track.id}`">Change reason</label>
                        <input :id="`track-split-reason-${track.id}`" v-model="trackSplitDrafts[track.id].changeReason" class="input" type="text" />
                      </div>
                    </div>

                    <div class="catalog-subitems">
                      <div v-for="(contributor, contributorIndex) in trackSplitDrafts[track.id].contributors" :key="`track-split-${track.id}-${contributorIndex}`" class="catalog-subitem catalog-subitem-compact">
                        <div class="catalog-grid catalog-grid-wide">
                          <div class="field-row">
                            <label :for="`track-split-artist-${track.id}-${contributorIndex}`">Artist</label>
                            <select :id="`track-split-artist-${track.id}-${contributorIndex}`" v-model="contributor.artistId" class="input">
                              <option value="">Select artist</option>
                              <option v-for="artist in artists" :key="artist.id" :value="artist.id">{{ artist.name }}</option>
                            </select>
                          </div>

                          <div class="field-row">
                            <label :for="`track-split-role-${track.id}-${contributorIndex}`">Role</label>
                            <input :id="`track-split-role-${track.id}-${contributorIndex}`" v-model="contributor.role" class="input" type="text" />
                          </div>

                          <div class="field-row">
                            <label :for="`track-split-pct-${track.id}-${contributorIndex}`">Split %</label>
                            <input :id="`track-split-pct-${track.id}-${contributorIndex}`" v-model="contributor.splitPct" class="input" type="number" min="0" max="100" step="0.01" />
                          </div>
                        </div>

                        <div class="button-row">
                          <button class="button button-secondary button-danger" @click="removeTrackSplitContributor(track.id, contributorIndex)">
                            Remove row
                          </button>
                        </div>
                      </div>
                    </div>

                    <div class="button-row">
                      <button class="button button-secondary" @click="addTrackSplitContributor(track.id)">Add contributor</button>
                      <button class="button" :disabled="trackSplitSaving[track.id]" @click="saveTrackSplit(track.id)">
                        {{ trackSplitSaving[track.id] ? "Saving..." : "Save track split version" }}
                      </button>
                    </div>
                  </div>
                </div>
              </article>
              </template>
            </div>

            <div class="catalog-subitem catalog-subitem-muted">
              <div class="summary-copy">
                <strong>Add track</strong>
                <span class="detail-copy">Use this for new tracks after the release already exists.</span>
              </div>

              <div class="catalog-grid catalog-grid-wide">
                <div class="field-row">
                  <label :for="`new-track-title-${release.id}`">Track title</label>
                  <input :id="`new-track-title-${release.id}`" v-model="newTrackDrafts[release.id].title" class="input" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`new-track-isrc-${release.id}`">ISRC</label>
                  <input :id="`new-track-isrc-${release.id}`" v-model="newTrackDrafts[release.id].isrc" class="input mono" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`new-track-number-${release.id}`">Track no.</label>
                  <input :id="`new-track-number-${release.id}`" v-model="newTrackDrafts[release.id].trackNumber" class="input" type="number" min="1" />
                </div>

                <div class="field-row">
                  <label :for="`new-track-status-${release.id}`">Status</label>
                  <select :id="`new-track-status-${release.id}`" v-model="newTrackDrafts[release.id].status" class="input">
                    <option value="draft">Draft</option>
                    <option value="live">Live</option>
                    <option value="deleted">Deleted</option>
                  </select>
                </div>

                <div class="field-row field-row-full">
                  <label :for="`new-track-audio-${release.id}`">Audio preview URL</label>
                  <input :id="`new-track-audio-${release.id}`" v-model="newTrackDrafts[release.id].audioPreviewUrl" class="input" type="url" />
                </div>
              </div>

              <div class="button-row">
                <button class="button" :disabled="trackCreating[release.id]" @click="createTrack(release.id)">
                  {{ trackCreating[release.id] ? "Adding..." : "Add track" }}
                </button>
              </div>
            </div>
          </div>

          <div class="catalog-track-list">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Release timeline</strong>
                <span class="detail-copy">Append-only history of edits, requests, split versions, takedowns, and deletes.</span>
              </div>
            </div>

            <div class="catalog-subitems">
              <div v-for="entry in release.events" :key="entry.id" class="catalog-subitem catalog-subitem-compact">
                <div class="summary-copy">
                  <strong>{{ eventLabel(entry.eventType) }}</strong>
                  <span class="detail-copy">{{ entry.actorName || entry.actorRole }} / {{ formatDateTime(entry.createdAt) }}</span>
                </div>
              </div>
            </div>
          </div>
        </article>
        </template>
      </div>
    </SectionCard>
  </div>
</template>

<style scoped>
.role-checkbox-groups {
  display: grid;
  gap: 0.75rem;
}

.role-checkbox-group {
  display: grid;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 0.75rem;
}

.role-checkbox-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.5rem 0.75rem;
}

.role-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
}
</style>
