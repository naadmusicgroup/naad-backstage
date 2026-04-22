<script setup lang="ts">
import type {
  AdminReleaseCollaboratorRecord,
  AdminReleaseRecord,
  AdminTrackCollaboratorRecord,
  AdminTrackRecord,
  BulkCatalogImportResponse,
  CreateReleaseInput,
  CreateTrackInput,
  ReleaseType,
} from "~~/types/catalog"
import type { ImportArtistOption } from "~~/types/imports"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

interface ReleaseResponse {
  releases: AdminReleaseRecord[]
}

interface TrackResponse {
  tracks: AdminTrackRecord[]
}

interface ReleaseCollaboratorResponse {
  collaborators: AdminReleaseCollaboratorRecord[]
}

interface TrackCollaboratorResponse {
  collaborators: AdminTrackCollaboratorRecord[]
}

type EditableRelease = {
  title: string
  type: ReleaseType
  upc: string
  coverArtUrl: string
  streamingLink: string
  releaseDate: string
  isActive: boolean
}

type EditableTrack = {
  title: string
  isrc: string
  trackNumber: string
  audioPreviewUrl: string
  isActive: boolean
}

type EditableCollaborator = {
  artistId: string
  role: string
  splitPct: string
}

function blankCollaborator(): EditableCollaborator {
  return {
    artistId: "",
    role: "",
    splitPct: "",
  }
}

function nullableText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function formatSplit(value: number) {
  return `${value.toFixed(2)}%`
}

function onCatalogFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  catalogFile.value = target.files?.[0] ?? null
}

const selectedArtistId = ref("")
const catalogFile = ref<File | null>(null)
const catalogFileInput = ref<HTMLInputElement | null>(null)
const isCreatingRelease = ref(false)
const isCreatingTrack = ref(false)
const isBulkImporting = ref(false)
const pageError = ref("")
const pageSuccess = ref("")
const bulkImportResult = ref<BulkCatalogImportResponse | null>(null)
const releaseSaving = reactive<Record<string, boolean>>({})
const trackSaving = reactive<Record<string, boolean>>({})
const releaseCollaboratorCreating = reactive<Record<string, boolean>>({})
const trackCollaboratorCreating = reactive<Record<string, boolean>>({})
const releaseCollaboratorSaving = reactive<Record<string, boolean>>({})
const trackCollaboratorSaving = reactive<Record<string, boolean>>({})
const releaseCollaboratorRemoving = reactive<Record<string, boolean>>({})
const trackCollaboratorRemoving = reactive<Record<string, boolean>>({})
const releaseDrafts = reactive<Record<string, EditableRelease>>({})
const trackDrafts = reactive<Record<string, EditableTrack>>({})
const releaseCollaboratorDrafts = reactive<Record<string, EditableCollaborator>>({})
const trackCollaboratorDrafts = reactive<Record<string, EditableCollaborator>>({})
const releaseCollaboratorForms = reactive<Record<string, EditableCollaborator>>({})
const trackCollaboratorForms = reactive<Record<string, EditableCollaborator>>({})

const releaseForm = reactive<CreateReleaseInput>({
  artistId: "",
  title: "",
  type: "single",
  upc: null,
  coverArtUrl: null,
  streamingLink: null,
  releaseDate: null,
  isActive: true,
})

const trackForm = reactive<CreateTrackInput>({
  releaseId: "",
  title: "",
  isrc: "",
  trackNumber: null,
  audioPreviewUrl: null,
  isActive: true,
})

const catalogRules = [
  "Manual-first catalog: create the release, then tracks, then collaborator tags before CSV commit.",
  "UPC lives on the release, ISRC lives on the track, and preview matching starts from track.isrc.",
  "Release-level collaborator tags act as fallback when a track has no track-specific split map yet.",
  "Media stays URL-only in this slice so artists can stream from storage/CDN without app proxying.",
]

const catalogTemplateColumns = [
  "Release Title",
  "Original Release Date",
  "UPC",
  "ISRC",
  "Track Title",
  "Track Listing",
  "Track Preview Link",
  "Artwork File",
  "Release Link",
]

const { data: artistResponse, error: artistLoadError } = useLazyFetch<{
  artists: ImportArtistOption[]
}>("/api/admin/artists")

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

const { data: releaseResponse, error: releaseLoadError, pending: releasePending, refresh: refreshReleases } =
  useLazyFetch<ReleaseResponse>("/api/admin/releases", {
    query: computed(() => (selectedArtistId.value ? { artistId: selectedArtistId.value } : {})),
    immediate: false,
    watch: false,
  })

const { data: trackResponse, error: trackLoadError, pending: trackPending, refresh: refreshTracks } =
  useLazyFetch<TrackResponse>("/api/admin/tracks", {
    query: computed(() => (selectedArtistId.value ? { artistId: selectedArtistId.value } : {})),
    immediate: false,
    watch: false,
  })

const {
  data: releaseCollaboratorResponse,
  error: releaseCollaboratorLoadError,
  pending: releaseCollaboratorPending,
  refresh: refreshReleaseCollaborators,
} = useLazyFetch<ReleaseCollaboratorResponse>("/api/admin/releases/collaborators", {
  query: computed(() => (selectedArtistId.value ? { artistId: selectedArtistId.value } : {})),
  immediate: false,
  watch: false,
})

const {
  data: trackCollaboratorResponse,
  error: trackCollaboratorLoadError,
  pending: trackCollaboratorPending,
  refresh: refreshTrackCollaborators,
} = useLazyFetch<TrackCollaboratorResponse>("/api/admin/tracks/collaborators", {
  query: computed(() => (selectedArtistId.value ? { artistId: selectedArtistId.value } : {})),
  immediate: false,
  watch: false,
})

const releases = computed(() => releaseResponse.value?.releases ?? [])
const tracks = computed(() => trackResponse.value?.tracks ?? [])
const releaseCollaborators = computed(() => releaseCollaboratorResponse.value?.collaborators ?? [])
const trackCollaborators = computed(() => trackCollaboratorResponse.value?.collaborators ?? [])

watch(
  selectedArtistId,
  (value) => {
    if (!value) {
      return
    }

    void Promise.all([
      refreshReleases(),
      refreshTracks(),
      refreshReleaseCollaborators(),
      refreshTrackCollaborators(),
    ])
  },
  { immediate: true },
)

const tracksByReleaseId = computed(() => {
  return tracks.value.reduce<Record<string, AdminTrackRecord[]>>((accumulator, track) => {
    if (!accumulator[track.releaseId]) {
      accumulator[track.releaseId] = []
    }

    accumulator[track.releaseId].push(track)
    return accumulator
  }, {})
})

const releaseCollaboratorsByReleaseId = computed(() => {
  return releaseCollaborators.value.reduce<Record<string, AdminReleaseCollaboratorRecord[]>>((accumulator, collaborator) => {
    if (!accumulator[collaborator.releaseId]) {
      accumulator[collaborator.releaseId] = []
    }

    accumulator[collaborator.releaseId].push(collaborator)
    return accumulator
  }, {})
})

const trackCollaboratorsByTrackId = computed(() => {
  return trackCollaborators.value.reduce<Record<string, AdminTrackCollaboratorRecord[]>>((accumulator, collaborator) => {
    if (!accumulator[collaborator.trackId]) {
      accumulator[collaborator.trackId] = []
    }

    accumulator[collaborator.trackId].push(collaborator)
    return accumulator
  }, {})
})

watch(
  releases,
  (value) => {
    for (const release of value) {
      releaseDrafts[release.id] = {
        title: release.title,
        type: release.type,
        upc: release.upc ?? "",
        coverArtUrl: release.coverArtUrl ?? "",
        streamingLink: release.streamingLink ?? "",
        releaseDate: release.releaseDate ?? "",
        isActive: release.isActive,
      }

      if (!releaseCollaboratorForms[release.id]) {
        releaseCollaboratorForms[release.id] = blankCollaborator()
      }
    }

    const validRelease = value.find((release) => release.id === trackForm.releaseId)

    if (!validRelease) {
      trackForm.releaseId = value[0]?.id ?? ""
    }
  },
  { immediate: true },
)

watch(
  tracks,
  (value) => {
    for (const track of value) {
      trackDrafts[track.id] = {
        title: track.title,
        isrc: track.isrc,
        trackNumber: track.trackNumber === null ? "" : String(track.trackNumber),
        audioPreviewUrl: track.audioPreviewUrl ?? "",
        isActive: track.isActive,
      }

      if (!trackCollaboratorForms[track.id]) {
        trackCollaboratorForms[track.id] = blankCollaborator()
      }
    }
  },
  { immediate: true },
)

watch(
  releaseCollaborators,
  (value) => {
    for (const collaborator of value) {
      releaseCollaboratorDrafts[collaborator.id] = {
        artistId: collaborator.artistId,
        role: collaborator.role,
        splitPct: collaborator.splitPct.toFixed(2),
      }
    }
  },
  { immediate: true },
)

watch(
  trackCollaborators,
  (value) => {
    for (const collaborator of value) {
      trackCollaboratorDrafts[collaborator.id] = {
        artistId: collaborator.artistId,
        role: collaborator.role,
        splitPct: collaborator.splitPct.toFixed(2),
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

function setError(error: any, fallback: string) {
  pageError.value = error?.data?.statusMessage || error?.message || fallback
  pageSuccess.value = ""
}

async function refreshWorkspace() {
  await Promise.all([
    refreshReleases(),
    refreshTracks(),
    refreshReleaseCollaborators(),
    refreshTrackCollaborators(),
  ])
}

async function importCatalogFile() {
  if (!selectedArtistId.value) {
    pageError.value = "Select an artist before running the catalog import."
    return
  }

  if (!catalogFile.value) {
    pageError.value = "Choose the catalog CSV file before importing."
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
    catalogFile.value = null
    if (catalogFileInput.value) {
      catalogFileInput.value.value = ""
    }
    await refreshWorkspace()
    setSuccess(
      `Catalog import finished: ${result.createdReleaseCount} releases created, ${result.createdTrackCount} tracks created, ${result.skippedTrackCount} tracks skipped.`,
    )
  } catch (error: any) {
    setError(error, "Unable to bulk import the catalog CSV.")
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
    const result = await $fetch<{ release: AdminReleaseRecord }>("/api/admin/releases", {
      method: "POST",
      body: {
        artistId: releaseForm.artistId,
        title: releaseForm.title,
        type: releaseForm.type,
        upc: nullableText(releaseForm.upc),
        coverArtUrl: nullableText(releaseForm.coverArtUrl),
        streamingLink: nullableText(releaseForm.streamingLink),
        releaseDate: nullableText(releaseForm.releaseDate),
        isActive: releaseForm.isActive,
      },
    })

    releaseForm.title = ""
    releaseForm.upc = null
    releaseForm.coverArtUrl = null
    releaseForm.streamingLink = null
    releaseForm.releaseDate = null
    releaseForm.type = "single"
    releaseForm.isActive = true

    await refreshWorkspace()
    trackForm.releaseId = result.release.id
    setSuccess(`Created release ${result.release.title}.`)
  } catch (error: any) {
    setError(error, "Unable to create the release.")
  } finally {
    isCreatingRelease.value = false
  }
}

async function createTrack() {
  if (!trackForm.releaseId) {
    pageError.value = "Create a release before adding tracks."
    return
  }

  isCreatingTrack.value = true
  resetMessages()

  try {
    const result = await $fetch<{ track: AdminTrackRecord }>("/api/admin/tracks", {
      method: "POST",
      body: {
        releaseId: trackForm.releaseId,
        title: trackForm.title,
        isrc: trackForm.isrc,
        trackNumber: trackForm.trackNumber,
        audioPreviewUrl: nullableText(trackForm.audioPreviewUrl),
        isActive: trackForm.isActive,
      },
    })

    trackForm.title = ""
    trackForm.isrc = ""
    trackForm.trackNumber = null
    trackForm.audioPreviewUrl = null
    trackForm.isActive = true

    await refreshWorkspace()
    setSuccess(`Created track ${result.track.title}.`)
  } catch (error: any) {
    setError(error, "Unable to create the track.")
  } finally {
    isCreatingTrack.value = false
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
        upc: nullableText(draft.upc),
        coverArtUrl: nullableText(draft.coverArtUrl),
        streamingLink: nullableText(draft.streamingLink),
        releaseDate: nullableText(draft.releaseDate),
        isActive: draft.isActive,
      },
    })

    await refreshReleases()
    setSuccess("Release updated.")
  } catch (error: any) {
    setError(error, "Unable to save the release.")
  } finally {
    releaseSaving[releaseId] = false
  }
}

async function saveTrack(trackId: string, releaseId: string) {
  trackSaving[trackId] = true
  resetMessages()

  try {
    const draft = trackDrafts[trackId]

    await $fetch(`/api/admin/tracks/${trackId}`, {
      method: "PATCH",
      body: {
        releaseId,
        title: draft.title,
        isrc: draft.isrc,
        trackNumber: draft.trackNumber,
        audioPreviewUrl: nullableText(draft.audioPreviewUrl),
        isActive: draft.isActive,
      },
    })

    await refreshTracks()
    setSuccess("Track updated.")
  } catch (error: any) {
    setError(error, "Unable to save the track.")
  } finally {
    trackSaving[trackId] = false
  }
}

async function createReleaseCollaborator(releaseId: string) {
  releaseCollaboratorCreating[releaseId] = true
  resetMessages()

  try {
    const draft = releaseCollaboratorForms[releaseId]
    const result = await $fetch<{ collaborator: AdminReleaseCollaboratorRecord }>("/api/admin/releases/collaborators", {
      method: "POST",
      body: {
        releaseId,
        artistId: draft.artistId,
        role: draft.role,
        splitPct: draft.splitPct,
      },
    })

    releaseCollaboratorForms[releaseId] = blankCollaborator()
    await refreshReleaseCollaborators()
    setSuccess(`Added ${result.collaborator.artistName} to the release tags.`)
  } catch (error: any) {
    setError(error, "Unable to add the release collaborator.")
  } finally {
    releaseCollaboratorCreating[releaseId] = false
  }
}

async function saveReleaseCollaborator(collaboratorId: string) {
  releaseCollaboratorSaving[collaboratorId] = true
  resetMessages()

  try {
    const draft = releaseCollaboratorDrafts[collaboratorId]

    await $fetch(`/api/admin/releases/collaborators/${collaboratorId}`, {
      method: "PATCH",
      body: {
        artistId: draft.artistId,
        role: draft.role,
        splitPct: draft.splitPct,
      },
    })

    await refreshReleaseCollaborators()
    setSuccess("Release collaborator updated.")
  } catch (error: any) {
    setError(error, "Unable to save the release collaborator.")
  } finally {
    releaseCollaboratorSaving[collaboratorId] = false
  }
}

async function removeReleaseCollaborator(collaborator: AdminReleaseCollaboratorRecord) {
  if (import.meta.client && !window.confirm(`Remove ${collaborator.artistName} from this release?`)) {
    return
  }

  releaseCollaboratorRemoving[collaborator.id] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/releases/collaborators/${collaborator.id}`, {
      method: "DELETE",
    })

    await refreshReleaseCollaborators()
    setSuccess("Release collaborator removed.")
  } catch (error: any) {
    setError(error, "Unable to remove the release collaborator.")
  } finally {
    releaseCollaboratorRemoving[collaborator.id] = false
  }
}

async function createTrackCollaborator(trackId: string) {
  trackCollaboratorCreating[trackId] = true
  resetMessages()

  try {
    const draft = trackCollaboratorForms[trackId]
    const result = await $fetch<{ collaborator: AdminTrackCollaboratorRecord }>("/api/admin/tracks/collaborators", {
      method: "POST",
      body: {
        trackId,
        artistId: draft.artistId,
        role: draft.role,
        splitPct: draft.splitPct,
      },
    })

    trackCollaboratorForms[trackId] = blankCollaborator()
    await refreshTrackCollaborators()
    setSuccess(`Added ${result.collaborator.artistName} to the track split map.`)
  } catch (error: any) {
    setError(error, "Unable to add the track collaborator.")
  } finally {
    trackCollaboratorCreating[trackId] = false
  }
}

async function saveTrackCollaborator(collaboratorId: string) {
  trackCollaboratorSaving[collaboratorId] = true
  resetMessages()

  try {
    const draft = trackCollaboratorDrafts[collaboratorId]

    await $fetch(`/api/admin/tracks/collaborators/${collaboratorId}`, {
      method: "PATCH",
      body: {
        artistId: draft.artistId,
        role: draft.role,
        splitPct: draft.splitPct,
      },
    })

    await refreshTrackCollaborators()
    setSuccess("Track collaborator updated.")
  } catch (error: any) {
    setError(error, "Unable to save the track collaborator.")
  } finally {
    trackCollaboratorSaving[collaboratorId] = false
  }
}

async function removeTrackCollaborator(collaborator: AdminTrackCollaboratorRecord) {
  if (import.meta.client && !window.confirm(`Remove ${collaborator.artistName} from this track?`)) {
    return
  }

  trackCollaboratorRemoving[collaborator.id] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/tracks/collaborators/${collaborator.id}`, {
      method: "DELETE",
    })

    await refreshTrackCollaborators()
    setSuccess("Track collaborator removed.")
  } catch (error: any) {
    setError(error, "Unable to remove the track collaborator.")
  } finally {
    trackCollaboratorRemoving[collaborator.id] = false
  }
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Catalog rules"
      eyebrow="Manual-first"
      description="Build the release, media, track, and collaborator records first so preview and commit operate against known ISRCs only."
    >
      <ul class="list">
        <li v-for="item in catalogRules" :key="item">{{ item }}</li>
      </ul>
    </SectionCard>

    <div
      v-if="artistLoadError || releaseLoadError || trackLoadError || releaseCollaboratorLoadError || trackCollaboratorLoadError"
      class="banner error"
    >
      {{
        artistLoadError?.statusMessage ||
        releaseLoadError?.statusMessage ||
        trackLoadError?.statusMessage ||
        releaseCollaboratorLoadError?.statusMessage ||
        trackCollaboratorLoadError?.statusMessage ||
        "Unable to load the catalog workspace."
      }}
    </div>

    <div v-else-if="!artists.length" class="banner error">
      No artists exist yet. Create an artist account first in <NuxtLink to="/admin/artists">Artist management</NuxtLink>.
    </div>

    <template v-else>
      <SectionCard
        title="Artist scope"
        eyebrow="Catalog owner"
        description="Select the artist you are preparing before creating releases, tracks, and collaborator tags."
      >
        <div class="form-grid">
          <div v-if="pageError" class="banner error">{{ pageError }}</div>
          <div v-if="pageSuccess" class="banner">{{ pageSuccess }}</div>

          <div class="field-row">
            <label for="catalog-artist">Artist</label>
            <select id="catalog-artist" v-model="selectedArtistId" class="input">
              <option v-for="artist in artists" :key="artist.id" :value="artist.id">
                {{ artist.name }}
              </option>
            </select>
          </div>
        </div>
      </SectionCard>

      <div class="panel-grid">
        <SectionCard
          title="Create release"
          eyebrow="Step 1"
          description="One release can hold singles, EPs, or albums. The streaming link lives on the release, while the audio file play link is set per track in the next step."
        >
          <div class="form-grid">
            <div class="field-row">
              <label for="release-title">Release title</label>
              <input id="release-title" v-model="releaseForm.title" class="input" type="text" />
            </div>

            <div class="field-row">
              <label for="release-type">Release type</label>
              <select id="release-type" v-model="releaseForm.type" class="input">
                <option value="single">Single</option>
                <option value="ep">EP</option>
                <option value="album">Album</option>
              </select>
            </div>

            <div class="field-row">
              <label for="release-upc">UPC</label>
              <input id="release-upc" v-model="releaseForm.upc" class="input" type="text" />
            </div>

            <div class="field-row">
              <label for="release-cover">Cover art URL</label>
              <input id="release-cover" v-model="releaseForm.coverArtUrl" class="input" type="url" placeholder="https://..." />
            </div>

            <div class="field-row">
              <label for="release-link">Streaming link</label>
              <input id="release-link" v-model="releaseForm.streamingLink" class="input" type="url" placeholder="https://..." />
            </div>

            <div class="field-row">
              <label for="release-date">Release date</label>
              <input id="release-date" v-model="releaseForm.releaseDate" class="input" type="date" />
            </div>

            <label class="checkbox-row">
              <input v-model="releaseForm.isActive" type="checkbox" />
              <span>Release is active</span>
            </label>

            <div class="button-row">
              <button class="button" :disabled="isCreatingRelease" @click="createRelease">
                {{ isCreatingRelease ? "Creating release..." : "Create release" }}
              </button>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Create track"
          eyebrow="Step 2"
          description="Tracks are what the CSV preview matches by ISRC, so get the identifiers and audio file play link right before ingestion."
        >
          <div class="form-grid">
            <div class="field-row">
              <label for="track-release">Release</label>
              <select id="track-release" v-model="trackForm.releaseId" class="input">
                <option disabled value="">Select release</option>
                <option v-for="release in releases" :key="release.id" :value="release.id">
                  {{ release.title }}
                </option>
              </select>
            </div>

            <div class="field-row">
              <label for="track-title">Track title</label>
              <input id="track-title" v-model="trackForm.title" class="input" type="text" />
            </div>

            <div class="field-row">
              <label for="track-isrc">ISRC</label>
              <input id="track-isrc" v-model="trackForm.isrc" class="input mono" type="text" />
            </div>

            <div class="field-row">
              <label for="track-number">Track number</label>
              <input id="track-number" v-model="trackForm.trackNumber" class="input" type="number" min="1" />
            </div>

            <div class="field-row">
              <label for="track-audio">Audio file play link</label>
              <input id="track-audio" v-model="trackForm.audioPreviewUrl" class="input" type="url" placeholder="https://..." />
            </div>

            <label class="checkbox-row">
              <input v-model="trackForm.isActive" type="checkbox" />
              <span>Track is active</span>
            </label>

            <div class="button-row">
              <button class="button" :disabled="isCreatingTrack || !releases.length" @click="createTrack">
                {{ isCreatingTrack ? "Creating track..." : "Create track" }}
              </button>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Bulk import catalog"
        eyebrow="CSV template"
        description="Use the Toolost-style catalog CSV when you want to create many releases and tracks at once for the selected artist."
      >
        <div class="form-grid">
          <div class="field-row">
            <label for="catalog-file">Catalog CSV</label>
            <input
              id="catalog-file"
              ref="catalogFileInput"
              class="input input-file"
              type="file"
              accept=".csv,text/csv"
              @change="onCatalogFileChange"
            />
          </div>

          <div class="summary-table">
            <div class="summary-row">
              <div class="summary-copy">
                <strong>Expected columns</strong>
                <span class="detail-copy">The importer reads the exact catalog format and uses these fields directly.</span>
              </div>
              <span class="pill pill-muted">{{ catalogTemplateColumns.length }} mapped columns</span>
            </div>

            <div v-for="column in catalogTemplateColumns" :key="column" class="summary-row">
              <div class="detail-copy">{{ column }}</div>
            </div>
          </div>

          <div class="detail-copy">
            Grouping rule: releases are grouped by `UPC` when present, otherwise by `Release Title + Original Release Date`.
            Type rule: `1 track = single`, `2-6 = ep`, `7+ = album`.
          </div>

          <div class="button-row">
            <button class="button" :disabled="isBulkImporting || !selectedArtistId" @click="importCatalogFile">
              {{ isBulkImporting ? "Importing catalog..." : "Bulk import releases" }}
            </button>
          </div>

          <div v-if="bulkImportResult" class="catalog-track-list">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Last import result</strong>
                <span class="detail-copy">{{ bulkImportResult.filename }}</span>
              </div>
              <span class="pill pill-muted">{{ bulkImportResult.issues.length }} issue{{ bulkImportResult.issues.length === 1 ? "" : "s" }}</span>
            </div>

            <div class="metrics">
              <MetricCard label="Parsed releases" :value="String(bulkImportResult.parsedReleaseCount)" tone="accent" />
              <MetricCard label="Parsed tracks" :value="String(bulkImportResult.parsedTrackCount)" />
              <MetricCard label="Created releases" :value="String(bulkImportResult.createdReleaseCount)" />
              <MetricCard label="Created tracks" :value="String(bulkImportResult.createdTrackCount)" tone="alt" />
            </div>

            <div class="summary-table">
              <div class="summary-row">
                <div class="summary-copy">
                  <strong>Reused releases</strong>
                </div>
                <span>{{ bulkImportResult.reusedReleaseCount }}</span>
              </div>
              <div class="summary-row">
                <div class="summary-copy">
                  <strong>Skipped tracks</strong>
                </div>
                <span>{{ bulkImportResult.skippedTrackCount }}</span>
              </div>
            </div>

            <div v-if="bulkImportResult.issues.length" class="catalog-subitems">
              <div v-for="(issue, index) in bulkImportResult.issues" :key="`${issue.code}-${index}`" class="catalog-subitem catalog-subitem-compact">
                <div class="summary-copy">
                  <strong>{{ issue.message }}</strong>
                  <span class="detail-copy">
                    {{ issue.releaseTitle || "Unknown release" }}
                    <template v-if="issue.trackTitle"> / {{ issue.trackTitle }}</template>
                    <template v-if="issue.isrc"> / {{ issue.isrc }}</template>
                  </span>
                </div>
                <span class="pill pill-muted">{{ issue.scope }}</span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Release workspace"
        eyebrow="Live catalog"
        description="Edit releases, media, track rows, and collaborator tags in one place. Track-level splits override release-level tags on the artist side."
      >
        <div v-if="releasePending || trackPending || releaseCollaboratorPending || trackCollaboratorPending" class="status-message">
          Loading catalog...
        </div>

        <div v-else-if="!releases.length" class="muted-copy">
          No releases exist for this artist yet. Create the release first, then add tracks and collaborator tags underneath it.
        </div>

        <div v-else class="catalog-list">
          <article v-for="release in releases" :key="release.id" class="catalog-item">
            <div class="catalog-header">
              <div class="summary-copy">
                <strong>{{ release.title }}</strong>
                <span class="detail-copy">
                  {{ release.type.toUpperCase() }} / {{ release.releaseDate || "No release date" }}
                </span>
              </div>
              <span class="status-pill" :class="release.isActive ? 'status-completed' : 'status-abandoned'">
                {{ release.isActive ? "Active" : "Inactive" }}
              </span>
            </div>

            <div class="catalog-media-row">
              <div class="catalog-cover-frame" @contextmenu.prevent>
                <img
                  v-if="releaseDrafts[release.id].coverArtUrl"
                  :src="releaseDrafts[release.id].coverArtUrl"
                  :alt="`${release.title} cover art`"
                  class="catalog-cover-image"
                  draggable="false"
                  @dragstart.prevent
                />
                <div v-else class="catalog-cover-placeholder">
                  <span class="eyebrow">{{ release.type }}</span>
                  <strong>{{ release.title.slice(0, 1).toUpperCase() }}</strong>
                </div>
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
                  <label :for="`release-upc-${release.id}`">UPC</label>
                  <input :id="`release-upc-${release.id}`" v-model="releaseDrafts[release.id].upc" class="input" type="text" />
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
            </div>

            <div class="table-actions">
              <label class="checkbox-row">
                <input v-model="releaseDrafts[release.id].isActive" type="checkbox" />
                <span>Release is active</span>
              </label>

              <div class="button-row">
                <CopyableLink v-if="releaseDrafts[release.id].streamingLink" :url="releaseDrafts[release.id].streamingLink" />
                <button class="button button-secondary" :disabled="releaseSaving[release.id]" @click="saveRelease(release.id)">
                  {{ releaseSaving[release.id] ? "Saving..." : "Save release" }}
                </button>
              </div>
            </div>

            <div class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Release collaborators</strong>
                  <span class="detail-copy">These tags control collaboration visibility and act as fallback when a track has no track-specific split map.</span>
                </div>
                <span class="pill pill-muted">
                  {{ releaseCollaboratorsByReleaseId[release.id]?.length ?? 0 }} tag{{ (releaseCollaboratorsByReleaseId[release.id]?.length ?? 0) === 1 ? "" : "s" }}
                </span>
              </div>

              <div v-if="releaseCollaboratorsByReleaseId[release.id]?.length" class="catalog-subitems">
                <div
                  v-for="collaborator in releaseCollaboratorsByReleaseId[release.id]"
                  :key="collaborator.id"
                  class="catalog-subitem"
                >
                  <div class="collaborator-grid">
                    <div class="field-row">
                      <label :for="`release-collaborator-artist-${collaborator.id}`">Artist</label>
                      <select :id="`release-collaborator-artist-${collaborator.id}`" v-model="releaseCollaboratorDrafts[collaborator.id].artistId" class="input">
                        <option disabled value="">Select artist</option>
                        <option v-for="artist in artists" :key="artist.id" :value="artist.id">
                          {{ artist.name }}
                        </option>
                      </select>
                    </div>

                    <div class="field-row">
                      <label :for="`release-collaborator-role-${collaborator.id}`">Role</label>
                      <input :id="`release-collaborator-role-${collaborator.id}`" v-model="releaseCollaboratorDrafts[collaborator.id].role" class="input" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`release-collaborator-split-${collaborator.id}`">Split %</label>
                      <input
                        :id="`release-collaborator-split-${collaborator.id}`"
                        v-model="releaseCollaboratorDrafts[collaborator.id].splitPct"
                        class="input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                    </div>
                  </div>

                  <div class="table-actions">
                    <span class="detail-copy">Saved as {{ collaborator.artistName }} / {{ formatSplit(collaborator.splitPct) }}</span>
                    <div class="button-row">
                      <button
                        class="button button-secondary"
                        :disabled="releaseCollaboratorSaving[collaborator.id]"
                        @click="saveReleaseCollaborator(collaborator.id)"
                      >
                        {{ releaseCollaboratorSaving[collaborator.id] ? "Saving..." : "Save tag" }}
                      </button>
                      <button
                        class="button button-secondary button-danger"
                        :disabled="releaseCollaboratorRemoving[collaborator.id]"
                        @click="removeReleaseCollaborator(collaborator)"
                      >
                        {{ releaseCollaboratorRemoving[collaborator.id] ? "Removing..." : "Remove" }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <p v-else class="muted-copy">No release-level collaborators yet.</p>

              <div class="catalog-subitem catalog-subitem-muted">
                <div class="collaborator-grid">
                  <div class="field-row">
                    <label :for="`new-release-collaborator-artist-${release.id}`">Artist</label>
                    <select :id="`new-release-collaborator-artist-${release.id}`" v-model="releaseCollaboratorForms[release.id].artistId" class="input">
                      <option disabled value="">Select artist</option>
                      <option v-for="artist in artists" :key="artist.id" :value="artist.id">
                        {{ artist.name }}
                      </option>
                    </select>
                  </div>

                  <div class="field-row">
                    <label :for="`new-release-collaborator-role-${release.id}`">Role</label>
                    <input :id="`new-release-collaborator-role-${release.id}`" v-model="releaseCollaboratorForms[release.id].role" class="input" type="text" />
                  </div>

                  <div class="field-row">
                    <label :for="`new-release-collaborator-split-${release.id}`">Split %</label>
                    <input
                      :id="`new-release-collaborator-split-${release.id}`"
                      v-model="releaseCollaboratorForms[release.id].splitPct"
                      class="input"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                    />
                  </div>
                </div>

                <div class="button-row">
                  <button class="button" :disabled="releaseCollaboratorCreating[release.id]" @click="createReleaseCollaborator(release.id)">
                    {{ releaseCollaboratorCreating[release.id] ? "Adding collaborator..." : "Add release collaborator" }}
                  </button>
                </div>
              </div>
            </div>

            <div class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Tracks</strong>
                  <span class="detail-copy">Track-specific collaborator splits override the release fallback on the artist dashboard.</span>
                </div>
                <span class="pill pill-muted">
                  {{ tracksByReleaseId[release.id]?.length ?? 0 }} track{{ (tracksByReleaseId[release.id]?.length ?? 0) === 1 ? "" : "s" }}
                </span>
              </div>

              <div v-if="tracksByReleaseId[release.id]?.length" class="catalog-subitems">
                <div v-for="track in tracksByReleaseId[release.id]" :key="track.id" class="catalog-subitem">
                  <div class="catalog-grid catalog-grid-wide">
                    <div class="field-row">
                      <label :for="`track-title-${track.id}`">Track</label>
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
                      <label :for="`track-audio-${track.id}`">Audio file play link</label>
                      <input :id="`track-audio-${track.id}`" v-model="trackDrafts[track.id].audioPreviewUrl" class="input" type="url" />
                    </div>
                  </div>

                  <div class="table-actions">
                    <label class="checkbox-row">
                      <input v-model="trackDrafts[track.id].isActive" type="checkbox" />
                      <span>Track is active</span>
                    </label>

                    <div class="button-row">
                      <CopyableLink v-if="trackDrafts[track.id].audioPreviewUrl" :url="trackDrafts[track.id].audioPreviewUrl" />
                      <button class="button button-secondary" :disabled="trackSaving[track.id]" @click="saveTrack(track.id, release.id)">
                        {{ trackSaving[track.id] ? "Saving..." : "Save track" }}
                      </button>
                    </div>
                  </div>

                  <div class="catalog-track-list">
                    <div class="catalog-section-header">
                      <div class="summary-copy">
                        <strong>Track collaborators</strong>
                        <span class="detail-copy">
                          {{ trackCollaboratorsByTrackId[track.id]?.length ? "These splits override the release-level fallback." : "No track-specific tags yet. The artist page will fall back to the release tags." }}
                        </span>
                      </div>
                      <span class="pill pill-muted">
                        {{ trackCollaboratorsByTrackId[track.id]?.length ?? 0 }} tag{{ (trackCollaboratorsByTrackId[track.id]?.length ?? 0) === 1 ? "" : "s" }}
                      </span>
                    </div>

                    <div v-if="trackCollaboratorsByTrackId[track.id]?.length" class="catalog-subitems">
                      <div
                        v-for="collaborator in trackCollaboratorsByTrackId[track.id]"
                        :key="collaborator.id"
                        class="catalog-subitem catalog-subitem-compact"
                      >
                        <div class="collaborator-grid">
                          <div class="field-row">
                            <label :for="`track-collaborator-artist-${collaborator.id}`">Artist</label>
                            <select :id="`track-collaborator-artist-${collaborator.id}`" v-model="trackCollaboratorDrafts[collaborator.id].artistId" class="input">
                              <option disabled value="">Select artist</option>
                              <option v-for="artist in artists" :key="artist.id" :value="artist.id">
                                {{ artist.name }}
                              </option>
                            </select>
                          </div>

                          <div class="field-row">
                            <label :for="`track-collaborator-role-${collaborator.id}`">Role</label>
                            <input :id="`track-collaborator-role-${collaborator.id}`" v-model="trackCollaboratorDrafts[collaborator.id].role" class="input" type="text" />
                          </div>

                          <div class="field-row">
                            <label :for="`track-collaborator-split-${collaborator.id}`">Split %</label>
                            <input
                              :id="`track-collaborator-split-${collaborator.id}`"
                              v-model="trackCollaboratorDrafts[collaborator.id].splitPct"
                              class="input"
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                            />
                          </div>
                        </div>

                        <div class="table-actions">
                          <span class="detail-copy">{{ collaborator.artistName }} / {{ formatSplit(collaborator.splitPct) }}</span>
                          <div class="button-row">
                            <button
                              class="button button-secondary"
                              :disabled="trackCollaboratorSaving[collaborator.id]"
                              @click="saveTrackCollaborator(collaborator.id)"
                            >
                              {{ trackCollaboratorSaving[collaborator.id] ? "Saving..." : "Save split" }}
                            </button>
                            <button
                              class="button button-secondary button-danger"
                              :disabled="trackCollaboratorRemoving[collaborator.id]"
                              @click="removeTrackCollaborator(collaborator)"
                            >
                              {{ trackCollaboratorRemoving[collaborator.id] ? "Removing..." : "Remove" }}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="catalog-subitem catalog-subitem-muted">
                      <div class="collaborator-grid">
                        <div class="field-row">
                          <label :for="`new-track-collaborator-artist-${track.id}`">Artist</label>
                          <select :id="`new-track-collaborator-artist-${track.id}`" v-model="trackCollaboratorForms[track.id].artistId" class="input">
                            <option disabled value="">Select artist</option>
                            <option v-for="artist in artists" :key="artist.id" :value="artist.id">
                              {{ artist.name }}
                            </option>
                          </select>
                        </div>

                        <div class="field-row">
                          <label :for="`new-track-collaborator-role-${track.id}`">Role</label>
                          <input :id="`new-track-collaborator-role-${track.id}`" v-model="trackCollaboratorForms[track.id].role" class="input" type="text" />
                        </div>

                        <div class="field-row">
                          <label :for="`new-track-collaborator-split-${track.id}`">Split %</label>
                          <input
                            :id="`new-track-collaborator-split-${track.id}`"
                            v-model="trackCollaboratorForms[track.id].splitPct"
                            class="input"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                          />
                        </div>
                      </div>

                      <div class="button-row">
                        <button class="button" :disabled="trackCollaboratorCreating[track.id]" @click="createTrackCollaborator(track.id)">
                          {{ trackCollaboratorCreating[track.id] ? "Adding split..." : "Add track collaborator" }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p v-else class="muted-copy">No tracks yet for this release.</p>
            </div>
          </article>
        </div>
      </SectionCard>
    </template>
  </div>
</template>
