<script setup lang="ts">
import {
  Plus,
  Search,
  Trash2,
} from "lucide-vue-next"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { ArtistReleasesResponse } from "~~/types/dashboard"
import type {
  ArtistPublishingBatchInput,
  ArtistPublishingResponse,
  PublishingCatalogTrackOption,
  PublishingRegistrationStatus,
  PublishingRegistrationTrackRecord,
  PublishingRegistrationTrackSource,
} from "~~/types/publishing"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

interface WriterDraft {
  mode: "existing" | "new"
  writerId: string
  fullName: string
  firstName: string
  middleName: string
  lastName: string
  ipiNumber: string
  proName: string
  role: string
  sharePct: string
  collectRoyalties: boolean
}

interface TrackDraft {
  key: string
  source: PublishingRegistrationTrackSource
  trackId: string
  songTitle: string
  performerName: string
  spotifyUrl: string
  writers: WriterDraft[]
}

const { activeArtistId } = useActiveArtist()
const { viewer } = useViewerContext()
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))
const activeTab = ref<"accepted" | "register">("accepted")
const registerMode = ref<PublishingRegistrationTrackSource>("catalog")
const statusFilter = ref<"all" | PublishingRegistrationStatus>("all")
const searchQuery = ref("")
const catalogSearchQuery = ref("")
const draftTracks = ref<TrackDraft[]>([])
const artistNotes = ref("")
const pageError = ref("")
const pageSuccess = ref("")
const isSubmitting = ref(false)
let draftKeyCounter = 0
const writerRoleOptions = ["Lyrics", "Composition"] as const
const defaultWriterRole = "Composition"
type WriterRoleOption = (typeof writerRoleOptions)[number]

const { data, pending, error, refresh } = useLazyFetch<ArtistPublishingResponse>("/api/dashboard/publishing", {
  query: computed(() => activeArtistId.value ? { artistId: activeArtistId.value } : undefined),
})

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})
const {
  data: releaseCatalogData,
  pending: releaseCatalogPending,
  error: releaseCatalogError,
  refresh: refreshReleaseCatalog,
} = useLazyFetch<ArtistReleasesResponse>("/api/dashboard/releases", {
  query: computed(() => activeArtistId.value ? { artistId: activeArtistId.value } : undefined),
})

const tracks = computed(() => data.value?.tracks ?? [])
const writerOptions = computed(() => data.value?.writerOptions ?? [])
const settingsDefaultWriter = computed(() => data.value?.defaultWriter ?? null)
const apiCatalogTrackOptions = computed(() => data.value?.catalogTrackOptions ?? [])
const releaseCatalogTrackOptions = computed<PublishingCatalogTrackOption[]>(() => {
  return (releaseCatalogData.value?.releases ?? []).flatMap((release) => {
    return release.tracks
      .filter((track) => track.status !== "deleted")
      .map((track) => ({
        value: track.id,
        label: `${track.title} / ${release.title}`,
        artistId: release.artistId,
        releaseId: release.id,
        releaseTitle: release.title,
        trackTitle: track.title,
        isrc: track.isrc,
        performerName: release.artistName,
        registrationStatus: null,
      }))
  })
})
const catalogTrackOptions = computed<PublishingCatalogTrackOption[]>(() => {
  const optionsByTrackId = new Map<string, PublishingCatalogTrackOption>()

  for (const option of [...releaseCatalogTrackOptions.value, ...apiCatalogTrackOptions.value]) {
    optionsByTrackId.set(option.value, option)
  }

  return [...optionsByTrackId.values()].sort((left, right) => {
    const titleCompare = left.trackTitle.localeCompare(right.trackTitle)
    return titleCompare || left.releaseTitle.localeCompare(right.releaseTitle)
  })
})
const summary = computed(() => data.value?.summary ?? {
  trackCount: 0,
  pendingCount: 0,
  acceptedCount: 0,
  rejectedCount: 0,
  artistCount: 0,
  writerCount: 0,
})

const filteredTracks = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return tracks.value
    .filter((track) => statusFilter.value === "all" || track.status === statusFilter.value)
    .filter((track) => {
      if (!query) {
        return true
      }

      return [
        track.trackTitle,
        track.performerName,
        track.releaseTitle,
        track.spotifyUrl,
        track.batchSource,
        track.writers.map((writer) => writer.fullName).join(" "),
      ].filter(Boolean).join(" ").toLowerCase().includes(query)
    })
})
const filteredCatalogTrackOptions = computed(() => {
  const query = catalogSearchQuery.value.trim().toLowerCase()

  if (!query) {
    return catalogTrackOptions.value
  }

  return catalogTrackOptions.value.filter((option) => [
    option.trackTitle,
    option.releaseTitle,
    option.isrc,
    option.performerName,
  ].filter(Boolean).join(" ").toLowerCase().includes(query))
})
const catalogDraftTrackIds = computed(() => new Set(
  draftTracks.value
    .filter((track) => track.source === "catalog" && track.trackId)
    .map((track) => track.trackId),
))
const activeDraftTracks = computed(() => draftTracks.value.filter((track) => track.source === registerMode.value))
const currentDraftCount = computed(() => activeDraftTracks.value.length)
const publishingSectionItems = computed(() => [
  {
    label: "Accepted",
    value: "accepted",
    badge: summary.value.acceptedCount,
  },
  {
    label: "Register",
    value: "register",
    badge: currentDraftCount.value,
  },
])
const canSubmitPublishingBatch = computed(() => (
  !isSubmitting.value
  && currentDraftCount.value > 0
  && activeDraftTracks.value.every((track) => writerShareIsValid(track) && track.writers.every(writerIsComplete))
))

watch(activeArtistId, () => {
  catalogSearchQuery.value = ""
  draftTracks.value = []
  artistNotes.value = ""
  pageError.value = ""
  pageSuccess.value = ""
})

watch([settingsDefaultWriter, writerOptions], () => {
  applySettingsDefaultToEmptyFirstWriters()
})

watch([activeTab, registerMode], () => {
  if (activeTab.value === "register" && registerMode.value === "manual") {
    ensureManualTrack()
  }
})

function statusLabel(status: PublishingRegistrationStatus) {
  if (status === "pending_review") return "Pending"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusTone(status: PublishingRegistrationStatus) {
  if (status === "accepted") return "success" as const
  if (status === "rejected") return "danger" as const
  return "warning" as const
}

function sourceLabel(source: string) {
  return source === "admin_direct" ? "Admin added" : source === "artist_request" ? "Artist request" : source
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not dated"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "Not dated"
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

function writerShareTotal(track: TrackDraft) {
  const total = track.writers.reduce((sum, writer) => {
    const nextShare = Number.parseFloat(String(writer.sharePct || 0))
    return sum + (Number.isFinite(nextShare) ? nextShare : 0)
  }, 0)

  return total
}

function writerShareTotalLabel(track: TrackDraft) {
  return writerShareTotal(track).toFixed(2)
}

function writerShareIsValid(track: TrackDraft) {
  return Math.abs(writerShareTotal(track) - 100) < 0.01
}

function writerIsComplete(writer: WriterDraft) {
  if (writer.mode === "existing") {
    return Boolean(writer.writerId)
  }

  return Boolean(writer.fullName.trim())
}

function resetMessages() {
  pageError.value = ""
  pageSuccess.value = ""
}

function selectedWriterRoles(writer: WriterDraft) {
  const roleParts = writer.role.split(",").map((role) => role.trim()).filter(Boolean)
  const selectedRoles = writerRoleOptions.filter((roleOption) => roleParts.includes(roleOption))

  return selectedRoles.length ? selectedRoles : [defaultWriterRole]
}

function writerHasRole(writer: WriterDraft, roleOption: WriterRoleOption) {
  return selectedWriterRoles(writer).includes(roleOption)
}

function setWriterRole(writer: WriterDraft, roleOption: WriterRoleOption, checked: boolean | "indeterminate") {
  const nextRoles = new Set(selectedWriterRoles(writer))

  if (checked === true) {
    nextRoles.add(roleOption)
  } else if (nextRoles.size > 1) {
    nextRoles.delete(roleOption)
  }

  writer.role = writerRoleOptions.filter((option) => nextRoles.has(option)).join(", ")
}

function setError(fetchError: any, fallback: string) {
  pageError.value = fetchError?.data?.statusMessage || fetchError?.message || fallback
  pageSuccess.value = ""
}

function blankWriterDraft(sharePct = "100.00", options: { useSettingsDefault?: boolean } = {}): WriterDraft {
  const defaultWriter = options.useSettingsDefault === false ? null : settingsDefaultWriter.value

  if (defaultWriter) {
    return {
      mode: "new",
      writerId: "",
      fullName: defaultWriter.fullName,
      firstName: "",
      middleName: "",
      lastName: "",
      ipiNumber: defaultWriter.ipiNumber ?? "",
      proName: defaultWriter.proName ?? "",
      role: defaultWriterRole,
      sharePct,
      collectRoyalties: true,
    }
  }

  return {
    mode: "new",
    writerId: "",
    fullName: "",
    firstName: "",
    middleName: "",
    lastName: "",
    ipiNumber: "",
    proName: "",
    role: defaultWriterRole,
    sharePct,
    collectRoyalties: true,
  }
}

function writerCanReceiveSettingsDefault(writer: WriterDraft) {
  return writer.mode === "new"
    && !writer.writerId
    && !writer.fullName.trim()
    && !writer.firstName.trim()
    && !writer.middleName.trim()
    && !writer.lastName.trim()
    && !writer.ipiNumber.trim()
    && !writer.proName.trim()
}

function applySettingsDefaultToEmptyFirstWriters() {
  if (!settingsDefaultWriter.value) {
    return
  }

  for (const track of draftTracks.value) {
    const firstWriter = track.writers[0]

    if (firstWriter && writerCanReceiveSettingsDefault(firstWriter)) {
      track.writers[0] = blankWriterDraft(firstWriter.sharePct || "100.00")
    }
  }
}

function blankManualTrack(): TrackDraft {
  return {
    key: nextDraftKey(),
    source: "manual",
    trackId: "",
    songTitle: "",
    performerName: "",
    spotifyUrl: "",
    writers: [blankWriterDraft()],
  }
}

function catalogTrackDraft(trackId: string): TrackDraft | null {
  const option = catalogTrackOptions.value.find((entry) => entry.value === trackId)

  if (!option) {
    return null
  }

  return {
    key: nextDraftKey(),
    source: "catalog",
    trackId: option.value,
    songTitle: option.trackTitle,
    performerName: option.performerName,
    spotifyUrl: "",
    writers: [blankWriterDraft()],
  }
}

function nextDraftKey() {
  draftKeyCounter += 1
  return `publishing-draft-${Date.now()}-${draftKeyCounter}`
}

function openRegister(mode: PublishingRegistrationTrackSource) {
  activeTab.value = "register"
  registerMode.value = mode

  if (mode === "manual") {
    ensureManualTrack()
  }
}

function selectPublishingSection(value: string) {
  if (value === "register") {
    openRegister(registerMode.value)
    return
  }

  activeTab.value = "accepted"
}

function catalogTrackIsRegistered(option: PublishingCatalogTrackOption | null | undefined) {
  return Boolean(option?.registrationStatus)
}

function catalogTrackActionLabel(option: PublishingCatalogTrackOption) {
  if (catalogTrackIsRegistered(option)) {
    return "Track already registered"
  }

  return catalogDraftTrackIds.value.has(option.value) ? "Added" : "Add"
}

function addCatalogTrack(trackId: string) {
  const option = catalogTrackOptions.value.find((entry) => entry.value === trackId)

  if (!option || catalogTrackIsRegistered(option)) {
    return
  }

  if (catalogDraftTrackIds.value.has(trackId)) {
    return
  }

  const trackDraft = catalogTrackDraft(trackId)

  if (trackDraft) {
    draftTracks.value = [...draftTracks.value, trackDraft]
  }
}

function ensureManualTrack() {
  if (!draftTracks.value.some((track) => track.source === "manual")) {
    draftTracks.value = [...draftTracks.value, blankManualTrack()]
  }
}

function addManualTrack() {
  draftTracks.value = [...draftTracks.value, blankManualTrack()]
  openRegister("manual")
}

function removeTrackByKey(trackKey: string) {
  draftTracks.value = draftTracks.value.filter((track) => track.key !== trackKey)
}

function addWriter(track: TrackDraft) {
  track.writers.push(blankWriterDraft("0.00", { useSettingsDefault: false }))
}

function removeWriter(track: TrackDraft, writerIndex: number) {
  if (track.writers.length <= 1) {
    return
  }

  track.writers.splice(writerIndex, 1)
}

function setWriterMode(writer: WriterDraft, mode: unknown) {
  writer.mode = mode === "existing" ? "existing" : "new"
  writer.writerId = ""

  if (writer.mode === "new") {
    writer.fullName = ""
    writer.ipiNumber = ""
    writer.proName = ""
  }
}

function setSavedWriter(writer: WriterDraft, writerId: unknown) {
  writer.writerId = String(writerId ?? "")
  const option = writerOptions.value.find((entry) => entry.value === writer.writerId)

  if (option) {
    writer.fullName = option.label
    writer.ipiNumber = option.ipiNumber ?? ""
    writer.proName = option.proName ?? ""
  }
}

function registrationWriterPayload(writer: WriterDraft) {
  if (writer.mode === "existing") {
    return {
      writerId: writer.writerId,
      role: writer.role,
      sharePct: writer.sharePct,
      collectRoyalties: true,
    }
  }

  return {
    fullName: writer.fullName,
    firstName: writer.firstName || null,
    middleName: writer.middleName || null,
    lastName: writer.lastName || null,
    ipiNumber: writer.ipiNumber || null,
    proName: writer.proName || null,
    role: writer.role,
    sharePct: writer.sharePct,
    collectRoyalties: true,
  }
}

async function submitPublishingBatch() {
  if (!activeArtistId.value || !canSubmitPublishingBatch.value) {
    return
  }

  if (isViewingAsArtist.value) {
    pageError.value = "View-as mode is read-only. Sign in as the artist to submit publishing registrations."
    return
  }

  isSubmitting.value = true
  resetMessages()

  try {
    const submittedTracks = [...activeDraftTracks.value]
    const submittedTrackKeys = new Set(submittedTracks.map((track) => track.key))
    const body: ArtistPublishingBatchInput = {
      artistId: activeArtistId.value,
      artistNotes: artistNotes.value || null,
      tracks: submittedTracks.map((track) => ({
        source: track.source,
        trackId: track.source === "catalog" ? track.trackId : null,
        songTitle: track.source === "manual" ? track.songTitle : null,
        performerName: track.source === "manual" ? track.performerName : null,
        spotifyUrl: track.source === "manual" ? track.spotifyUrl : null,
        writers: track.writers.map(registrationWriterPayload),
      })),
    }

    await $fetch("/api/dashboard/publishing/batches", {
      method: "POST",
      body,
    })

    draftTracks.value = draftTracks.value.filter((track) => !submittedTrackKeys.has(track.key))
    artistNotes.value = ""
    activeTab.value = "accepted"
    statusFilter.value = "pending_review"
    pageSuccess.value = "Publishing registration submitted for admin review."
    await Promise.all([refresh(), refreshReleaseCatalog()])
  } catch (fetchError: any) {
    setError(fetchError, "Unable to submit publishing registration.")
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="page publishing-page">
    <div class="publishing-alerts">
      <AppAlert v-if="error" variant="destructive">
        {{ error.statusMessage || "Unable to load publishing registrations right now." }}
      </AppAlert>
      <AppAlert v-if="releaseCatalogError" variant="destructive">
        {{ releaseCatalogError.statusMessage || "Unable to load existing releases for catalog registration." }}
      </AppAlert>
      <AppAlert v-if="pageError" variant="destructive">{{ pageError }}</AppAlert>
      <AppAlert v-if="pageSuccess" variant="success">{{ pageSuccess }}</AppAlert>
    </div>

    <WorkspaceFolderGrid
      :model-value="activeTab"
      :items="publishingSectionItems"
      label="Publishing sections"
      @update:model-value="selectPublishingSection"
    />

    <section v-if="activeTab === 'accepted'" class="publishing-section">
      <div class="publishing-accepted-info">
        <strong>{{ summary.acceptedCount.toLocaleString() }}</strong>
        <span>{{ summary.acceptedCount === 1 ? "registered song" : "registered songs" }}</span>
      </div>

      <div class="publishing-toolbar">
        <div class="publishing-search">
          <Search class="size-4" aria-hidden="true" />
          <Input v-model="searchQuery" type="search" placeholder="Search songs" />
        </div>
        <NativeSelect v-model="statusFilter">
          <option value="all">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="pending_review">Pending</option>
          <option value="rejected">Rejected</option>
        </NativeSelect>
      </div>

      <DashboardSkeleton v-if="pending && !data" :rows="4" />
      <Empty v-else-if="!filteredTracks.length" class="publishing-empty">
        <EmptyHeader>
          <EmptyTitle>No songs yet</EmptyTitle>
        </EmptyHeader>
      </Empty>
      <div v-else class="publishing-track-list">
        <article
          v-for="track in filteredTracks"
          :key="track.id"
          class="publishing-track-card"
          :data-status="track.status"
        >
          <div class="publishing-track-main">
            <div class="publishing-track-heading">
              <StatusBadge :tone="statusTone(track.status)">{{ statusLabel(track.status) }}</StatusBadge>
            </div>
            <h3>{{ track.trackTitle }}</h3>
            <p>
              {{ track.releaseTitle || track.spotifyUrl || "Outside dashboard song" }}
            </p>
          </div>

          <div class="publishing-track-meta">
            <span>{{ track.performerName }}</span>
            <span>{{ sourceLabel(track.batchSource) }}</span>
            <span>Submitted {{ formatDate(track.createdAt) }}</span>
          </div>

          <div class="writer-grid">
            <div v-for="writer in track.writers" :key="writer.id" class="writer-chip">
              <strong>{{ writer.fullName }}</strong>
              <span>{{ writer.role }} / {{ writer.sharePct }}%</span>
              <span v-if="writer.ipiNumber || writer.proName">{{ writer.ipiNumber || "No IPI" }} / {{ writer.proName || "No PRO" }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-else class="publishing-section publishing-register-view">
      <div
        class="publishing-register-mode-actions"
        role="tablist"
        aria-label="Publishing registration type"
        :data-active="registerMode"
      >
        <Button
          type="button"
          :variant="registerMode === 'catalog' ? 'default' : 'secondary'"
          size="sm"
          class="publishing-mode-button"
          :class="{ 'is-active': registerMode === 'catalog' }"
          role="tab"
          :aria-selected="registerMode === 'catalog'"
          @click="openRegister('catalog')"
        >
          Existing track
        </Button>
        <Button
          type="button"
          :variant="registerMode === 'manual' ? 'default' : 'secondary'"
          size="sm"
          class="publishing-mode-button"
          :class="{ 'is-active': registerMode === 'manual' }"
          role="tab"
          :aria-selected="registerMode === 'manual'"
          @click="openRegister('manual')"
        >
          Outside song
        </Button>
      </div>

      <div v-if="registerMode === 'catalog'" class="publishing-register-layout">
        <Card glint="data" size="sm" class="publishing-catalog-panel" aria-label="Existing dashboard tracks">
          <div class="publishing-search">
            <Search class="size-4" aria-hidden="true" />
            <Input v-model="catalogSearchQuery" type="search" placeholder="Find track, release, ISRC..." />
          </div>

          <DashboardSkeleton v-if="(pending || releaseCatalogPending) && !catalogTrackOptions.length" :rows="3" />
          <Empty v-else-if="!catalogTrackOptions.length" class="publishing-empty">
            <EmptyHeader>
              <EmptyTitle>No existing tracks</EmptyTitle>
            </EmptyHeader>
          </Empty>
          <Empty v-else-if="!filteredCatalogTrackOptions.length" class="publishing-empty">
            <EmptyHeader>
              <EmptyTitle>No matching tracks</EmptyTitle>
            </EmptyHeader>
          </Empty>
          <div v-else class="publishing-catalog-list">
            <button
              v-for="option in filteredCatalogTrackOptions"
              :key="option.value"
              type="button"
              class="publishing-catalog-row"
              :class="{
                selected: catalogDraftTrackIds.has(option.value),
                registered: catalogTrackIsRegistered(option),
              }"
              :disabled="catalogDraftTrackIds.has(option.value) || catalogTrackIsRegistered(option)"
              @click="addCatalogTrack(option.value)"
            >
              <span>
                <strong>{{ option.trackTitle }}</strong>
                <small>{{ option.releaseTitle }} / ISRC {{ option.isrc || "Not set" }}</small>
              </span>
              <small>{{ catalogTrackActionLabel(option) }}</small>
            </button>
          </div>
        </Card>
      </div>

      <div v-if="registerMode === 'manual'" class="publishing-register-actions">
        <Button type="button" variant="secondary" size="sm" @click="addManualTrack">
          <Plus class="size-4" aria-hidden="true" />
          Add song
        </Button>
      </div>

      <Card
        v-if="registerMode === 'catalog' && !activeDraftTracks.length"
        glint="quiet"
        size="sm"
        class="publishing-start-card"
      >
        <Empty class="publishing-empty">
          <EmptyHeader>
            <EmptyTitle>Choose a track to start</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </Card>

      <div v-else class="publishing-draft-stack">
        <Card
          v-for="(track, trackIndex) in activeDraftTracks"
          :key="track.key"
          glint="quiet"
          size="sm"
          class="publishing-registration-card"
        >
          <div class="publishing-draft-header">
            <div class="publishing-draft-title">
              <h3>{{ track.source === "catalog" ? track.songTitle : (track.songTitle || `Song ${trackIndex + 1}`) }}</h3>
              <span
                v-if="!writerShareIsValid(track)"
                class="publishing-share-indicator"
              >
                {{ writerShareTotalLabel(track) }}%
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="`Remove track ${trackIndex + 1}`"
              @click="removeTrackByKey(track.key)"
            >
              <Trash2 class="size-4" />
            </Button>
          </div>

          <div class="publishing-draft-body">
            <div v-if="track.source === 'manual'" class="publishing-manual-fields">
              <div class="space-y-2">
                <Label :for="`publishing-song-${track.key}`">Song name</Label>
                <Input :id="`publishing-song-${track.key}`" v-model="track.songTitle" type="text" placeholder="Song title" />
              </div>
              <div class="space-y-2">
                <Label :for="`publishing-performer-${track.key}`">Performer name</Label>
                <Input :id="`publishing-performer-${track.key}`" v-model="track.performerName" type="text" placeholder="Artist / performer" />
              </div>
              <div class="space-y-2 publishing-wide-field">
                <Label :for="`publishing-spotify-${track.key}`">Spotify URL</Label>
                <Input
                  :id="`publishing-spotify-${track.key}`"
                  v-model="track.spotifyUrl"
                  type="url"
                  placeholder="https://open.spotify.com/track/..."
                />
              </div>
            </div>

            <div class="publishing-writer-section">
              <div class="publishing-writer-heading">
                <h4>Writers</h4>
                <Button type="button" variant="secondary" size="sm" @click="addWriter(track)">
                  <Plus class="size-4" aria-hidden="true" />
                  Add writer
                </Button>
              </div>

              <div class="publishing-writer-list">
                <div
                  v-for="(writer, writerIndex) in track.writers"
                  :key="`${track.key}-writer-${writerIndex}`"
                  class="publishing-writer-row"
                >
                  <div class="space-y-2">
                    <Label :for="`writer-mode-${track.key}-${writerIndex}`">Writer</Label>
                    <NativeSelect
                      :id="`writer-mode-${track.key}-${writerIndex}`"
                      :model-value="writer.mode"
                      size="sm"
                      @update:model-value="setWriterMode(writer, $event)"
                    >
                      <option value="existing" :disabled="!writerOptions.length">Saved writer</option>
                      <option value="new">New writer</option>
                    </NativeSelect>
                  </div>

                  <div v-if="writer.mode === 'existing'" class="space-y-2">
                    <Label :for="`writer-existing-${track.key}-${writerIndex}`">Writer profile</Label>
                    <NativeSelect
                      :id="`writer-existing-${track.key}-${writerIndex}`"
                      :model-value="writer.writerId"
                      size="sm"
                      @update:model-value="setSavedWriter(writer, $event)"
                    >
                      <option value="" disabled>Select writer</option>
                      <option v-for="option in writerOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                      </option>
                    </NativeSelect>
                  </div>
                  <div v-else class="space-y-2">
                    <Label :for="`writer-name-${track.key}-${writerIndex}`">Full name</Label>
                    <Input :id="`writer-name-${track.key}-${writerIndex}`" v-model="writer.fullName" type="text" class="h-9 rounded-md" />
                  </div>

                  <div class="space-y-2">
                    <Label :for="`writer-share-${track.key}-${writerIndex}`">Share %</Label>
                    <Input :id="`writer-share-${track.key}-${writerIndex}`" v-model="writer.sharePct" type="number" min="0" max="100" step="0.01" class="h-9 rounded-md" />
                  </div>
                  <div class="space-y-2">
                    <Label :for="`writer-role-${track.key}-${writerIndex}`">Role</Label>
                    <div :id="`writer-role-${track.key}-${writerIndex}`" class="publishing-role-checks" role="group">
                      <Label
                        v-for="roleOption in writerRoleOptions"
                        :key="roleOption"
                        class="publishing-role-check"
                      >
                        <Checkbox
                          :model-value="writerHasRole(writer, roleOption)"
                          @update:model-value="setWriterRole(writer, roleOption, $event)"
                        />
                        <span>{{ roleOption }}</span>
                      </Label>
                    </div>
                  </div>
                  <div class="space-y-2">
                    <Label :for="`writer-ipi-${track.key}-${writerIndex}`">IPI</Label>
                    <Input :id="`writer-ipi-${track.key}-${writerIndex}`" v-model="writer.ipiNumber" :disabled="writer.mode === 'existing'" type="text" class="h-9 rounded-md" />
                  </div>
                  <div class="space-y-2">
                    <Label :for="`writer-pro-${track.key}-${writerIndex}`">PRO</Label>
                    <Input :id="`writer-pro-${track.key}-${writerIndex}`" v-model="writer.proName" :disabled="writer.mode === 'existing'" type="text" class="h-9 rounded-md" />
                  </div>
                  <div class="publishing-writer-row-action">
                    <Button
                      v-if="track.writers.length > 1"
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      :aria-label="`Remove writer ${writerIndex + 1}`"
                      @click="removeWriter(track, writerIndex)"
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card v-if="activeDraftTracks.length" glint="quiet" size="sm" class="publishing-submit-panel">
        <div class="space-y-2">
          <Label for="publishing-artist-notes">Artist note</Label>
          <Textarea id="publishing-artist-notes" v-model="artistNotes" rows="2" placeholder="Optional note" />
        </div>
        <Button type="button" :disabled="!canSubmitPublishingBatch" @click="submitPublishingBatch">
          {{ isSubmitting ? "Submitting..." : `Submit ${currentDraftCount || ""} Track${currentDraftCount === 1 ? "" : "s"}` }}
        </Button>
      </Card>
    </section>
  </div>
</template>

<style scoped>
.publishing-page {
  display: grid;
  gap: 20px;
}

.publishing-alerts {
  display: grid;
  gap: 10px;
}

.publishing-alerts:empty {
  display: none;
}

.publishing-section {
  display: grid;
  gap: 16px;
  width: 100%;
}

.publishing-accepted-info {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 3%), var(--card)),
    var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
  padding: 14px 16px;
}

.publishing-accepted-info::before {
  position: absolute;
  inset: 0 var(--surface-glint-inset, 24px) auto;
  z-index: 0;
  height: 1px;
  background: var(--surface-glint-line);
  content: "";
  opacity: var(--surface-glint-opacity, 0.46);
  pointer-events: none;
}

.publishing-accepted-info strong {
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: var(--text-metric-size);
  font-weight: var(--text-metric-weight);
  line-height: 1;
}

.publishing-accepted-info span {
  color: var(--muted-foreground);
  font-size: var(--text-body-size);
  font-weight: var(--text-body-weight);
}

.publishing-toolbar {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) minmax(180px, 240px);
  align-items: center;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 82%, var(--muted) 18%);
  box-shadow: var(--surface-control-shadow, none);
  padding: 10px;
}

.publishing-search {
  position: relative;
}

.publishing-search svg {
  position: absolute;
  left: 12px;
  top: 50%;
  z-index: 1;
  color: var(--muted-foreground);
  transform: translateY(-50%);
  pointer-events: none;
}

.publishing-search :deep(input) {
  padding-left: 38px;
}

.publishing-empty {
  border: 1px dashed color-mix(in srgb, var(--surface-border, var(--border)) 90%, transparent);
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 72%, transparent) !important;
  box-shadow: none !important;
  gap: 0;
  padding: 18px !important;
}

.publishing-empty :deep([data-slot="empty-header"]) {
  gap: 0;
}

.publishing-start-card {
  display: grid;
  min-height: 92px;
  place-items: center;
  overflow: hidden;
  padding: 14px;
}

.publishing-start-card .publishing-empty {
  width: 100%;
  min-height: 62px;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, var(--foreground) 8%);
  background: color-mix(in srgb, var(--card) 78%, var(--background)) !important;
}

.publishing-track-list {
  display: grid;
  gap: 10px;
}

.publishing-track-card {
  position: relative;
  display: grid;
  gap: 10px;
  overflow: hidden;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 3%), var(--card)),
    var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-depth-edge, var(--shadow-card)));
  padding: 14px 16px 14px 18px;
  transition:
    border-color 200ms var(--ease-out, ease),
    background 200ms var(--ease-out, ease),
    box-shadow 200ms var(--ease-out, ease);
}

.publishing-track-card[data-status="pending_review"] {
  border-left-color: color-mix(in srgb, var(--status-warning) 72%, var(--surface-border, var(--border)));
}

.publishing-track-card[data-status="accepted"] {
  border-left-color: color-mix(in srgb, var(--status-success) 70%, var(--surface-border, var(--border)));
}

.publishing-track-card[data-status="rejected"] {
  border-left-color: color-mix(in srgb, var(--destructive) 64%, var(--surface-border, var(--border)));
}

.publishing-track-card::before {
  position: absolute;
  inset: 0 var(--surface-glint-inset, 24px) auto;
  z-index: 0;
  height: 1px;
  background: var(--surface-glint-line);
  content: "";
  opacity: var(--surface-glint-opacity, 0.46);
  pointer-events: none;
}

.publishing-track-card > * {
  position: relative;
  z-index: 1;
}

.publishing-track-card:hover {
  border-color: color-mix(in srgb, var(--foreground) 10%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--card) 92%, var(--foreground) 4%);
  box-shadow: var(--surface-card-shadow-current-hover, var(--surface-depth-edge-hover, var(--shadow-card)));
}

.publishing-track-main {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.publishing-track-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.publishing-track-main h3,
.publishing-draft-header h3 {
  margin: 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: var(--text-section-title-size);
  font-weight: var(--text-section-title-weight);
  letter-spacing: 0;
  line-height: var(--text-section-title-line-height);
}

.publishing-track-main p,
.publishing-catalog-row small {
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line-height);
}

.publishing-track-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.publishing-track-meta span {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
}

:global(.dark .publishing-track-card) {
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-depth-edge, var(--shadow-card)));
}

:global(.dark .publishing-track-card::before) {
  opacity: 0.72;
}

:global(.dark .publishing-track-card:hover) {
  border-color: color-mix(in srgb, var(--foreground) 12%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--card) 92%, var(--foreground) 4%);
  box-shadow: var(--surface-card-shadow-current-hover, var(--surface-depth-edge-hover, var(--shadow-card)));
}

.publishing-draft-header,
.publishing-writer-heading,
.publishing-submit-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.publishing-register-mode-actions {
  --publishing-switch-pad: 4px;
  --publishing-switch-radius: 12px;
  --publishing-switch-track-start: color-mix(in srgb, var(--card) 95%, var(--foreground) 3%);
  --publishing-switch-track-end: color-mix(in srgb, var(--card) 86%, var(--background));
  --publishing-switch-plate-start: color-mix(in srgb, var(--priority-hover) 88%, #fff7cf 12%);
  --publishing-switch-plate-end: color-mix(in srgb, var(--priority) 84%, #735514 16%);
  --publishing-switch-plate-text: #fffef7;
  --publishing-switch-motion: 220ms var(--ease-out, ease);
  --publishing-switch-outer-radius: calc(var(--publishing-switch-radius) - 4px);
  --publishing-switch-inner-radius: 3px;
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: min(100%, 284px);
  align-items: center;
  gap: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, var(--foreground) 8%);
  border-radius: var(--publishing-switch-radius);
  background:
    linear-gradient(180deg, var(--publishing-switch-track-start), var(--publishing-switch-track-end));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--foreground) 8%, transparent),
    var(--surface-control-shadow, none);
  padding: var(--publishing-switch-pad);
  transform: translateZ(0);
}

.publishing-register-mode-actions::before {
  position: absolute;
  top: var(--publishing-switch-pad);
  bottom: var(--publishing-switch-pad);
  left: var(--publishing-switch-pad);
  z-index: 1;
  width: calc((100% - (var(--publishing-switch-pad) * 2)) / 2);
  border: 1px solid color-mix(in srgb, var(--priority-hover) 54%, var(--priority) 46%);
  border-radius:
    var(--publishing-switch-outer-radius)
    var(--publishing-switch-inner-radius)
    var(--publishing-switch-inner-radius)
    var(--publishing-switch-outer-radius);
  background:
    radial-gradient(120% 180% at 50% -92%, rgb(255 250 220 / 46%), transparent 50%),
    linear-gradient(180deg, var(--publishing-switch-plate-start), var(--publishing-switch-plate-end));
  box-shadow:
    inset 0 1px 0 rgb(255 252 232 / 70%),
    inset 0 -2px 0 rgb(73 51 8 / 32%),
    0 1px 0 rgb(255 252 232 / 18%),
    0 8px 16px -16px color-mix(in srgb, var(--priority) 46%, black 54%);
  backface-visibility: hidden;
  content: "";
  transform: translate3d(0, 0, 0);
  transition:
    transform var(--publishing-switch-motion),
    border-radius 220ms var(--ease-out, ease),
    box-shadow 220ms var(--ease-out, ease);
  will-change: transform;
}

.publishing-register-mode-actions::after {
  position: absolute;
  top: 9px;
  bottom: 9px;
  left: 50%;
  z-index: 0;
  width: 1px;
  background: color-mix(in srgb, var(--surface-border, var(--border)) 72%, var(--foreground) 10%);
  content: "";
  opacity: 0.72;
  transform: translateX(-0.5px);
  pointer-events: none;
}

.publishing-register-mode-actions[data-active="manual"]::before {
  border-radius:
    var(--publishing-switch-inner-radius)
    var(--publishing-switch-outer-radius)
    var(--publishing-switch-outer-radius)
    var(--publishing-switch-inner-radius);
  transform: translate3d(100%, 0, 0);
}

.publishing-register-mode-actions:has(.publishing-mode-button.is-active:active)::before {
  filter: brightness(0.98);
  box-shadow:
    inset 0 1px 0 rgb(255 252 232 / 36%),
    inset 0 2px 8px -5px rgb(73 51 8 / 50%),
    0 7px 14px -16px color-mix(in srgb, var(--priority) 48%, black 52%);
}

.publishing-mode-button {
  position: relative;
  z-index: 2;
  min-width: 0;
  min-height: 34px;
  border: 0 !important;
  border-radius: calc(var(--publishing-switch-radius) - 5px) !important;
  background: transparent !important;
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground)) !important;
  box-shadow: none !important;
  font-size: 12px;
  font-weight: 720;
  letter-spacing: 0;
  text-shadow: none;
  transform: none !important;
  transition:
    color 180ms var(--ease-out, ease),
    text-shadow 180ms var(--ease-out, ease),
  background-color 180ms var(--ease-out, ease);
}

.publishing-mode-button:first-child {
  border-top-left-radius: var(--publishing-switch-outer-radius) !important;
  border-top-right-radius: var(--publishing-switch-inner-radius) !important;
  border-bottom-right-radius: var(--publishing-switch-inner-radius) !important;
  border-bottom-left-radius: var(--publishing-switch-outer-radius) !important;
}

.publishing-mode-button:last-child {
  border-top-left-radius: var(--publishing-switch-inner-radius) !important;
  border-top-right-radius: var(--publishing-switch-outer-radius) !important;
  border-bottom-right-radius: var(--publishing-switch-outer-radius) !important;
  border-bottom-left-radius: var(--publishing-switch-inner-radius) !important;
}

.publishing-mode-button:not(.is-active) {
  background: transparent !important;
  box-shadow: none !important;
}

.publishing-mode-button:not(.is-active):hover {
  background: color-mix(in srgb, var(--priority) 7%, transparent) !important;
  color: var(--foreground) !important;
}

.publishing-mode-button.is-active {
  color: var(--publishing-switch-plate-text) !important;
  text-shadow: 0 1px 1px rgb(20 15 5 / 24%);
}

.publishing-mode-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 22%, transparent) !important;
}

:global(.dark .publishing-register-mode-actions) {
  --publishing-switch-track-start: color-mix(in srgb, var(--card) 82%, var(--foreground) 3%);
  --publishing-switch-track-end: color-mix(in srgb, var(--background) 58%, var(--card));
  --publishing-switch-plate-start: #f1d33d;
  --publishing-switch-plate-end: #c89318;
  --publishing-switch-plate-text: #120e05;
  --publishing-switch-motion: 340ms cubic-bezier(0.2, 0.9, 0.2, 1);
  --publishing-switch-inner-radius: 3px;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 78%, var(--priority) 22%);
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 5%),
    inset 0 -1px 0 rgb(0 0 0 / 32%),
    0 14px 26px -22px rgb(0 0 0 / 78%);
}

:global(.dark .publishing-register-mode-actions::before) {
  border-color: rgb(255 232 94 / 42%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 240 / 58%),
    inset 0 -1px 0 rgb(77 55 10 / 24%),
    0 1px 0 rgb(255 252 232 / 8%),
    0 10px 18px -17px rgb(0 0 0 / 68%);
}

:global(.dark .publishing-register-mode-actions::after) {
  background: color-mix(in srgb, var(--surface-border, var(--border)) 70%, var(--priority) 12%);
  opacity: 0.52;
}

:global(.dark .publishing-mode-button) {
  color: color-mix(in srgb, var(--muted-foreground) 80%, var(--foreground)) !important;
}

:global(.dark .publishing-mode-button:not(.is-active)) {
  background: transparent !important;
  box-shadow: none !important;
}

:global(.dark .publishing-mode-button:not(.is-active):hover) {
  background: color-mix(in srgb, var(--priority) 8%, transparent) !important;
  color: color-mix(in srgb, var(--foreground) 90%, var(--priority)) !important;
}

:global(.dark .publishing-mode-button.is-active) {
  color: var(--publishing-switch-plate-text) !important;
  text-shadow: 0 1px 0 rgb(255 252 232 / 30%);
}

.publishing-register-layout {
  display: grid;
  gap: 14px;
}

.publishing-catalog-panel {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: 14px;
  overflow: hidden;
  padding: 14px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 3%), var(--card)),
    var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
}

.publishing-catalog-list {
  display: grid;
  max-height: 336px;
  overflow: auto;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 88%, var(--muted) 12%);
  box-shadow: var(--surface-control-shadow, none);
}

.publishing-catalog-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  background: transparent;
  color: var(--foreground);
  padding: 12px 13px;
  text-align: left;
  transition:
    background-color 160ms var(--ease-out, ease),
    color 160ms var(--ease-out, ease);
}

.publishing-catalog-row:last-child {
  border-bottom: 0;
}

.publishing-catalog-row.selected {
  background: color-mix(in srgb, var(--priority) 8%, transparent);
}

.publishing-catalog-row.registered,
.publishing-catalog-row:disabled {
  cursor: not-allowed;
  opacity: 0.72;
}

.publishing-catalog-row:hover {
  background: color-mix(in srgb, var(--priority) 5%, transparent);
}

.publishing-catalog-row:disabled:hover {
  background: transparent;
}

.publishing-catalog-row span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.publishing-catalog-row strong,
.publishing-catalog-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.publishing-catalog-row > small {
  justify-self: end;
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, var(--priority) 20%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--priority) 6%, var(--card));
  color: color-mix(in srgb, var(--foreground) 76%, var(--priority));
  font-weight: 760;
  padding: 0 11px;
  white-space: nowrap;
}

.publishing-catalog-row.selected > small {
  border-color: color-mix(in srgb, var(--priority) 34%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--priority) 11%, var(--card));
  color: var(--foreground);
}

.publishing-catalog-row.registered > small {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background: color-mix(in srgb, var(--muted) 18%, var(--card));
  color: var(--muted-foreground);
}

.publishing-register-actions {
  display: flex;
  justify-content: flex-start;
}

.publishing-draft-stack {
  display: grid;
  gap: 12px;
}

.publishing-registration-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: 0;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 3%), var(--card)),
    var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
}

.publishing-registration-card::before {
  position: absolute;
  inset: 0 var(--surface-glint-inset, 24px) auto;
  z-index: 0;
  height: 1px;
  background: var(--surface-glint-line);
  content: "";
  opacity: var(--surface-glint-opacity, 0.46);
  pointer-events: none;
}

.publishing-draft-header {
  border-bottom: 1px solid var(--surface-border, var(--border));
  background: color-mix(in srgb, var(--card) 88%, var(--muted) 12%);
  padding: 14px 16px;
}

.publishing-draft-title {
  display: inline-flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
}

.publishing-share-indicator {
  color: var(--status-warning, #a16207);
  font-size: 12px;
  font-weight: 760;
}

.publishing-draft-body {
  display: grid;
  gap: 16px;
  padding: 16px;
}

.publishing-manual-fields {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.publishing-wide-field {
  grid-column: 1 / -1;
}

.publishing-writer-section {
  display: grid;
  gap: 10px;
}

.publishing-writer-heading {
  justify-content: flex-start;
}

.publishing-writer-heading h4 {
  margin: 0;
  color: var(--foreground);
  font-size: 15px;
  font-weight: 760;
}

.publishing-writer-list {
  display: grid;
  gap: 10px;
}

.publishing-writer-row {
  display: grid;
  grid-template-columns:
    minmax(118px, 0.72fr)
    minmax(170px, 1.15fr)
    minmax(92px, 0.46fr)
    minmax(132px, 0.8fr)
    minmax(112px, 0.65fr)
    minmax(112px, 0.65fr)
    auto;
  gap: 10px;
  align-items: end;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 92%, var(--muted) 8%);
  box-shadow: var(--surface-control-shadow, none);
  padding: 12px;
}

.publishing-writer-row-action {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: flex-end;
}

.publishing-role-checks {
  display: flex;
  min-height: 36px;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.publishing-role-check {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 9px;
  border: 1px solid var(--surface-border);
  border-radius: 7px;
  background: transparent;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 650;
}

.writer-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}

.writer-chip {
  display: grid;
  gap: 3px;
  padding: 0;
  background: transparent;
}

.writer-chip span {
  color: var(--muted-foreground);
  font-size: 12px;
}

.publishing-submit-panel {
  flex-direction: row;
  align-items: end;
  justify-content: space-between;
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, var(--foreground) 8%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 95%, var(--foreground) 3%), var(--card)),
    var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
  padding: 14px;
}

.publishing-submit-panel > div {
  flex: 1 1 360px;
  max-width: 720px;
}

@media (max-width: 820px) {
  .publishing-toolbar {
    grid-template-columns: 1fr;
  }

  .publishing-register-mode-actions {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    display: grid;
  }

  .publishing-register-mode-actions :deep(button) {
    width: 100%;
    justify-content: center;
  }

  .publishing-manual-fields {
    grid-template-columns: 1fr;
  }

  .publishing-writer-row {
    grid-template-columns: 1fr;
  }

  .publishing-submit-panel {
    align-items: stretch;
  }

  .publishing-submit-panel .premium-box-button {
    width: 100%;
    justify-content: center;
  }
}
</style>
