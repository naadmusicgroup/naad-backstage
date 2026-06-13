<script setup lang="ts">
import {
  Download,
  ImageDown,
  Search,
} from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type {
  ArtistReleaseItem,
  ArtistReleasesResponse,
  ArtistReleaseTrack,
} from "~~/types/dashboard"
import type { ReleaseStatus, ReleaseType, TrackStatus } from "~~/types/catalog"
import {
  RELEASE_GENRE_OPTIONS,
  normalizeTrackCreditRoleCodes,
} from "~~/types/catalog"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

interface CreditDraft {
  creditedName: string
  roleCodes: string[]
}

interface EditableTrackDraft {
  id?: string
  title: string
  isrc: string
  trackNumber: string
  audioPreviewUrl: string
  lyrics: string
  tiktokPreviewStartSeconds: string
  versionLine: string
  containsAiGeneratedElements: boolean
  status: TrackStatus
  credits: CreditDraft[]
}

interface EditableReleaseDraft {
  title: string
  type: ReleaseType
  genre: string
  upc: string
  coverArtUrl: string
  streamingLink: string
  releaseDate: string
  status: ReleaseStatus
  tracks: EditableTrackDraft[]
  takedownReason: string
  proofUrlsText: string
}

type ReleaseDownloadAssetType = "cover" | "audio"

function releaseCoverArtUrl(release: ArtistReleaseItem) {
  return release.coverArtUrl
}

function blankCreditDraft(roleCodes: string[] = ["Main Artist"]): CreditDraft {
  return {
    creditedName: "",
    roleCodes: normalizeTrackCreditRoleCodes(roleCodes),
  }
}

function groupCreditDrafts(credits: Array<{ creditedName: string; roleCode: string }>) {
  const drafts = new Map<string, CreditDraft>()

  for (const credit of credits) {
    const normalizedName = credit.creditedName.trim()
    const key = normalizedName.toLowerCase()
    const existing = drafts.get(key)

    if (existing) {
      existing.roleCodes = normalizeTrackCreditRoleCodes([...existing.roleCodes, credit.roleCode])
      continue
    }

    drafts.set(key, {
      creditedName: normalizedName,
      roleCodes: normalizeTrackCreditRoleCodes([credit.roleCode]),
    })
  }

  return [...drafts.values()]
}

function nextTrackNumberValue(tracks: Array<{ trackNumber: string | number | null | undefined }>) {
  const numbers = tracks
    .map((track) => Number.parseInt(String(track.trackNumber ?? "").trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0)

  return String((numbers.length ? Math.max(...numbers) : 0) + 1)
}

function blankEditableTrackDraft(trackNumber = "1"): EditableTrackDraft {
  return {
    title: "",
    isrc: "",
    trackNumber,
    audioPreviewUrl: "",
    lyrics: "",
    tiktokPreviewStartSeconds: "",
    versionLine: "Original",
    containsAiGeneratedElements: false,
    status: "draft",
    credits: [blankCreditDraft()],
  }
}

function buildCreditInputs(credits: CreditDraft[], label: string) {
  return credits.flatMap((credit, creditIndex) => {
    const creditedName = credit.creditedName.trim()

    if (!creditedName) {
      throw new Error(`${label} credit ${creditIndex + 1} needs a credited name.`)
    }

    const roleCodes = normalizeTrackCreditRoleCodes(credit.roleCodes)

    if (!roleCodes.length) {
      throw new Error(`${label} credit ${creditIndex + 1} needs at least one role.`)
    }

    return roleCodes.map((roleCode, roleIndex) => ({
      creditedName,
      roleCode,
      sortOrder: creditIndex * 100 + roleIndex,
    }))
  })
}

function toEditableTrack(track: ArtistReleaseTrack): EditableTrackDraft {
  return {
    id: track.id,
    title: track.title,
    isrc: track.isrc,
    trackNumber: track.trackNumber === null ? "" : String(track.trackNumber),
    audioPreviewUrl: track.audioPreviewUrl ?? "",
    lyrics: track.lyrics ?? "",
    tiktokPreviewStartSeconds: track.tiktokPreviewStartSeconds === null ? "" : String(track.tiktokPreviewStartSeconds),
    versionLine: track.versionLine ?? "Original",
    containsAiGeneratedElements: track.containsAiGeneratedElements,
    status: track.status,
    credits: track.credits.length
      ? groupCreditDrafts(track.credits)
      : [blankCreditDraft()],
  }
}

function toEditableRelease(release: ArtistReleaseItem): EditableReleaseDraft {
  return {
    title: release.title,
    type: release.type,
    genre: release.genre,
    upc: release.upc ?? "",
    coverArtUrl: release.coverArtUrl ?? "",
    streamingLink: release.streamingLink ?? "",
    releaseDate: release.releaseDate ?? "",
    status: release.status,
    tracks: release.tracks.map(toEditableTrack),
    takedownReason: "",
    proofUrlsText: "",
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "Release date not set"
  }

  const date = new Date(`${value}T00:00:00Z`)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
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

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) {
    return null
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`
}

function formatStatusLabel(status: string) {
  if (status === "taken_down") {
    return "Takedown"
  }

  return status
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function formatReleaseTypeLabel(type: ReleaseType) {
  return type === "ep" ? "EP" : type.charAt(0).toUpperCase() + type.slice(1)
}

function statusTone(status: string) {
  if (status === "live") {
    return "success"
  }

  if (status === "scheduled" || status === "approved") {
    return "info"
  }

  if (status === "taken_down" || status === "deleted" || status === "rejected") {
    return "danger"
  }

  return "warning"
}

function toNullableText(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()
  return normalized || null
}

function toNullableInteger(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim()
  return normalized ? Number(normalized) : null
}

const { activeArtistId } = useActiveArtist()
const { viewer } = useViewerContext()
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))
const pageError = ref("")
const pageSuccess = ref("")
const submittingDraftRequest = reactive<Record<string, boolean>>({})
const submittingTakedownRequest = reactive<Record<string, boolean>>({})
const downloadingReleaseAssets = reactive<Record<string, boolean>>({})
const releaseDrafts = reactive<Record<string, EditableReleaseDraft>>({})
const { confirmAction } = useConfirmAction()
const route = useRoute()
const activeReleaseDetailTab = ref("overview")

const releasesPage = ref(1)
const releasesPageSize = 8
const releaseSearchQuery = ref("")
const normalizedReleaseSearchQuery = computed(() => releaseSearchQuery.value.trim().replace(/\s+/g, " "))

const { data, pending, error, refresh } = useLazyFetch<ArtistReleasesResponse>("/api/dashboard/releases", {
  query: computed(() => (activeArtistId.value ? {
    artistId: activeArtistId.value,
    surface: "catalog_list",
    page: releasesPage.value,
    pageSize: releasesPageSize,
    ...(normalizedReleaseSearchQuery.value ? { search: normalizedReleaseSearchQuery.value } : {}),
  } : undefined)),
})

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

const releases = computed(() => data.value?.releases ?? [])

const paginatedReleases = computed(() => releases.value)
const totalReleasesCount = computed(() => data.value?.pagination?.totalCount ?? releases.value.length)
const totalReleasesPages = computed(() => data.value?.pagination?.totalPages ?? (Math.ceil(releases.value.length / releasesPageSize) || 1))
const releaseSearchCountNoun = computed(() => totalReleasesCount.value === 1 ? "release" : "releases")
const hasReleaseSearchQuery = computed(() => Boolean(normalizedReleaseSearchQuery.value))

watch(activeArtistId, () => {
  releasesPage.value = 1
  releaseSearchQuery.value = ""
  selectedRelease.value = null
  selectedReleaseError.value = ""
})

watch(releaseSearchQuery, () => {
  releasesPage.value = 1
})

watch(totalReleasesPages, (newTotal) => {
  if (releasesPage.value > newTotal) {
    releasesPage.value = Math.max(1, newTotal)
  }
})

function releaseIdFromQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] || "" : typeof value === "string" ? value : ""
}

function replaceReleaseUrlParam(releaseId: string) {
  if (!import.meta.client) {
    return
  }

  const url = new URL(window.location.href)

  if (releaseId) {
    url.searchParams.set("release", releaseId)
  } else {
    url.searchParams.delete("release")
  }

  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}

const selectedReleaseId = ref(releaseIdFromQueryValue(route.query.release))
const releaseDialogRenderId = ref(selectedReleaseId.value)
const selectedRelease = ref<ArtistReleaseItem | null>(null)
const selectedReleasePending = ref(false)
const selectedReleaseError = ref("")
let releaseDialogCloseTimer: ReturnType<typeof setTimeout> | null = null
const selectedReleasePreview = computed(() => releases.value.find((release) => release.id === releaseDialogRenderId.value) ?? null)
const selectedReleaseForDialog = computed(() => {
  const loadedRelease = selectedRelease.value

  if (loadedRelease?.id === releaseDialogRenderId.value) {
    return loadedRelease
  }

  return selectedReleasePreview.value
})
const selectedReleaseIsHydrating = computed(() =>
  Boolean(selectedReleaseId.value && selectedReleasePending.value && selectedRelease.value?.id !== selectedReleaseId.value),
)
const releaseFolders = computed(() => releases.value.map((release) => ({
  label: release.title || "Untitled release",
  value: release.id,
  icon: release.title.slice(0, 1).toUpperCase() || "R",
  imageUrl: releaseDrafts[release.id]?.coverArtUrl || releaseCoverArtUrl(release),
  meta: `${release.artistName} / ${releaseTrackCount(release)} track${releaseTrackCount(release) === 1 ? "" : "s"}`,
  badge: release.pendingRequest ? "Request" : formatStatusLabel(release.displayStatus),
  tone: release.displayStatus === "live"
    ? "accent" as const
    : release.displayStatus === "taken_down" || release.displayStatus === "pending_review" || release.displayStatus === "scheduled"
      ? "alt" as const
      : "default" as const,
})))
const selectedReleaseFolderId = computed({
  get: () => selectedReleaseId.value,
  set: (value: string) => {
    openReleaseDetails(value)
  },
})

const releaseDetailTabs = computed(() => [
  { label: "Overview", value: "overview" },
  { label: "Tracks", value: "tracks" },
  { label: "Collaborators", value: "contributors" },
  { label: "Actions", value: "actions" },
])

watch(releaseDetailTabs, (tabs) => {
  if (!tabs.some((tab) => tab.value === activeReleaseDetailTab.value)) {
    activeReleaseDetailTab.value = "overview"
  }
})

watch(selectedReleaseId, (releaseId) => {
  activeReleaseDetailTab.value = "overview"

  if (releaseDialogCloseTimer) {
    clearTimeout(releaseDialogCloseTimer)
    releaseDialogCloseTimer = null
  }

  if (releaseId) {
    releaseDialogRenderId.value = releaseId
    return
  }

  releaseDialogCloseTimer = setTimeout(() => {
    releaseDialogRenderId.value = ""
    releaseDialogCloseTimer = null
  }, 240)
})

onBeforeUnmount(() => {
  if (releaseDialogCloseTimer) {
    clearTimeout(releaseDialogCloseTimer)
  }
})

watch(
  () => route.query.release,
  (value) => {
    const nextReleaseId = releaseIdFromQueryValue(value)

    if (nextReleaseId !== selectedReleaseId.value) {
      selectedReleaseId.value = nextReleaseId
    }
  },
)

let selectedReleaseRequestId = 0

async function loadSelectedReleaseDetail(releaseId: string) {
  if (!releaseId || !activeArtistId.value) {
    selectedReleaseRequestId++
    selectedRelease.value = null
    selectedReleasePending.value = false
    selectedReleaseError.value = ""
    return
  }

  const requestId = ++selectedReleaseRequestId
  selectedReleasePending.value = true
  selectedReleaseError.value = ""

  try {
    const result = await $fetch("/api/dashboard/releases", {
      query: {
        artistId: activeArtistId.value,
        releaseId,
      },
    }) as ArtistReleasesResponse

    if (requestId !== selectedReleaseRequestId) {
      return
    }

    selectedRelease.value = result.releases[0] ?? null

    if (!selectedRelease.value) {
      selectedReleaseError.value = "That release is no longer visible in this dashboard scope."
    }
  } catch (fetchError: any) {
    if (requestId !== selectedReleaseRequestId) {
      return
    }

    selectedRelease.value = null
    selectedReleaseError.value = fetchError?.data?.statusMessage || fetchError?.message || "Unable to load release details."
  } finally {
    if (requestId === selectedReleaseRequestId) {
      selectedReleasePending.value = false
    }
  }
}

watch([selectedReleaseId, activeArtistId], ([releaseId]) => {
  void loadSelectedReleaseDetail(releaseId)
}, { immediate: true })

function openReleaseDetails(releaseId: string) {
  if (!releaseId) {
    return
  }

  selectedReleaseId.value = releaseId
  replaceReleaseUrlParam(releaseId)
}

function handleReleaseCardKeydown(event: KeyboardEvent, releaseId: string) {
  if (event.key !== "Enter" && event.key !== " ") {
    return
  }

  event.preventDefault()
  openReleaseDetails(releaseId)
}

function closeReleaseDetails() {
  selectedReleaseId.value = ""
  selectedRelease.value = null
  selectedReleaseError.value = ""
  replaceReleaseUrlParam("")
}

watch(
  selectedRelease,
  (release) => {
    if (release?.viewerRelation === "owner") {
      releaseDrafts[release.id] = toEditableRelease(release)
    }
  },
  { immediate: true },
)

function releaseTrackCount(release: ArtistReleaseItem) {
  return release.trackCount ?? release.tracks.length
}

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

function releaseAssetDownloadKey(assetType: ReleaseDownloadAssetType, releaseId: string, trackId = "") {
  return `${assetType}:${releaseId}:${trackId}`
}

function isReleaseAssetDownloading(assetType: ReleaseDownloadAssetType, releaseId: string, trackId = "") {
  return Boolean(downloadingReleaseAssets[releaseAssetDownloadKey(assetType, releaseId, trackId)])
}

function filenameFromContentDisposition(value: string | null) {
  if (!value) {
    return ""
  }

  const encodedMatch = value.match(/filename\*=UTF-8''([^;]+)/i)

  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1])
    } catch {
      return encodedMatch[1]
    }
  }

  return value.match(/filename="([^"]+)"/i)?.[1] ?? ""
}

async function downloadErrorMessage(response: Response) {
  const contentType = response.headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null) as { statusMessage?: string; message?: string } | null
    return body?.statusMessage || body?.message || response.statusText
  }

  const text = await response.text().catch(() => "")
  return text || response.statusText
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = objectUrl
  link.download = filename || "download"
  link.rel = "noopener"
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

async function downloadReleaseAsset(input: {
  assetType: ReleaseDownloadAssetType
  releaseId: string
  trackId?: string
}) {
  if (!import.meta.client) {
    return
  }

  const key = releaseAssetDownloadKey(input.assetType, input.releaseId, input.trackId)

  if (downloadingReleaseAssets[key]) {
    return
  }

  downloadingReleaseAssets[key] = true
  resetMessages()

  try {
    const response = await fetch("/api/dashboard/releases/download", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    })

    if (!response.ok) {
      throw new Error(await downloadErrorMessage(response))
    }

    const blob = await response.blob()
    const filename =
      response.headers.get("x-download-filename")
      || filenameFromContentDisposition(response.headers.get("content-disposition"))
      || `${input.assetType}-download`

    triggerBrowserDownload(blob, filename)
  } catch (downloadError) {
    setError(downloadError, input.assetType === "cover" ? "Unable to download cover art." : "Unable to download audio file.")
  } finally {
    delete downloadingReleaseAssets[key]
  }
}

function addDraftTrack(releaseId: string) {
  const tracks = releaseDrafts[releaseId]?.tracks ?? []
  tracks.push(blankEditableTrackDraft(nextTrackNumberValue(tracks)))
}

async function removeDraftTrack(releaseId: string, trackIndex: number) {
  const tracks = releaseDrafts[releaseId]?.tracks ?? []
  const track = tracks[trackIndex]
  const confirmed = await confirmAction({
    title: "Remove draft track",
    description: tracks.length <= 1
      ? `Reset ${track?.title.trim() || `track ${trackIndex + 1}`} to a blank draft row? A release needs at least one track row.`
      : `Remove ${track?.title.trim() || `track ${trackIndex + 1}`} from this edit request?`,
    confirmLabel: tracks.length <= 1 ? "Reset track" : "Remove track",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  if (tracks.length <= 1) {
    releaseDrafts[releaseId].tracks = [blankEditableTrackDraft("1")]
    return
  }

  tracks.splice(trackIndex, 1)
}

function addDraftCredit(releaseId: string, trackIndex: number) {
  releaseDrafts[releaseId]?.tracks[trackIndex]?.credits.push(
    blankCreditDraft(),
  )
}

async function removeDraftCredit(releaseId: string, trackIndex: number, creditIndex: number) {
  const credits = releaseDrafts[releaseId]?.tracks[trackIndex]?.credits ?? []
  const credit = credits[creditIndex]
  const confirmed = await confirmAction({
    title: "Remove credit row",
    description: `Remove ${credit?.creditedName.trim() || `credit ${creditIndex + 1}`} from this edit request?`,
    confirmLabel: credits.length <= 1 ? "Reset credit" : "Remove credit",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  if (credits.length <= 1) {
    releaseDrafts[releaseId].tracks[trackIndex].credits = [blankCreditDraft()]
    return
  }

  credits.splice(creditIndex, 1)
}

async function submitDraftEditRequest(release: ArtistReleaseItem) {
  if (isViewingAsArtist.value) {
    pageError.value = "View-as mode is read-only. Sign in as the artist to submit release requests."
    return
  }

  const confirmed = await confirmAction({
    title: "Submit edit request",
    description: `Send the edited metadata for "${release.title}" to admin review?`,
    confirmLabel: "Submit request",
    variant: "default",
  })

  if (!confirmed) {
    return
  }

  submittingDraftRequest[release.id] = true
  resetMessages()

  try {
    const draft = releaseDrafts[release.id]

    await $fetch("/api/dashboard/releases/requests", {
      method: "POST",
      body: {
        releaseId: release.id,
        requestType: "draft_edit",
        snapshot: {
          release: {
            title: draft.title,
            type: draft.type,
            upc: toNullableText(draft.upc),
            coverArtUrl: toNullableText(draft.coverArtUrl),
            streamingLink: toNullableText(draft.streamingLink),
            releaseDate: toNullableText(draft.releaseDate),
            status: draft.status,
          },
          tracks: draft.tracks.map((track) => ({
            id: track.id,
            title: track.title,
            isrc: track.isrc,
            trackNumber: toNullableText(track.trackNumber),
            audioPreviewUrl: toNullableText(track.audioPreviewUrl),
            lyrics: toNullableText(track.lyrics),
            tiktokPreviewStartSeconds: toNullableInteger(track.tiktokPreviewStartSeconds),
            versionLine: toNullableText(track.versionLine),
            containsAiGeneratedElements: track.containsAiGeneratedElements,
            status: track.status,
            credits: buildCreditInputs(track.credits, track.title || "Track"),
          })),
          credits: draft.tracks.flatMap((track, trackIndex) =>
            buildCreditInputs(track.credits, track.title || `Track ${trackIndex + 1}`).map((credit) => ({
              trackIndex,
              ...credit,
            })),
          ),
          genre: draft.genre,
        },
      },
    })

    await refresh()
    await loadSelectedReleaseDetail(release.id)
    setSuccess("Draft edit request submitted for admin approval.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to submit the draft edit request.")
  } finally {
    submittingDraftRequest[release.id] = false
  }
}

async function submitTakedownRequest(release: ArtistReleaseItem) {
  if (isViewingAsArtist.value) {
    pageError.value = "View-as mode is read-only. Sign in as the artist to submit release requests."
    return
  }

  const confirmed = await confirmAction({
    title: "Submit takedown request",
    description: `Request takedown review for "${release.title}"? Admin approval is required before the catalog status changes.`,
    confirmLabel: "Request takedown",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  submittingTakedownRequest[release.id] = true
  resetMessages()

  try {
    const draft = releaseDrafts[release.id]

    await $fetch("/api/dashboard/releases/requests", {
      method: "POST",
      body: {
        releaseId: release.id,
        requestType: "takedown",
        takedownReason: draft.takedownReason,
        proofUrls: draft.proofUrlsText
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      },
    })

    await refresh()
    await loadSelectedReleaseDetail(release.id)
    setSuccess("Takedown request submitted for admin review.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to submit the takedown request.")
  } finally {
    submittingTakedownRequest[release.id] = false
  }
}
</script>

<template>
  <div class="page">
    <PageHeader
      eyebrow="Artist catalog"
      title="Releases"
      description="Your catalog of releases and tracks. Click on a release to view details, manage tracks, and submit edit requests."
    />

    <div class="tl-alerts">
      <AppAlert v-if="pageError" variant="destructive">{{ pageError }}</AppAlert>
      <AppAlert v-if="pageSuccess" variant="success">{{ pageSuccess }}</AppAlert>
      <AppAlert v-if="isViewingAsArtist" variant="warning">
        View-as mode is read-only. Draft edit and takedown requests are disabled for admins.
      </AppAlert>
      <AppAlert v-if="error" variant="destructive">{{ error.statusMessage || "Unable to load your releases right now." }}</AppAlert>
      <AppAlert v-if="selectedReleaseError" variant="destructive">{{ selectedReleaseError }}</AppAlert>
    </div>

    <DashboardSkeleton v-if="pending && !data" layout="releases" />

    <template v-else>
      <div class="release-search-panel" v-reveal-group="{ trigger: 'mount', stagger: 0.06, y: 16 }" role="search">
        <label class="release-search-label" for="artist-release-search">Search releases</label>
        <div class="release-search-control">
          <Search class="release-search-icon" aria-hidden="true" />
          <Input
            id="artist-release-search"
            v-model="releaseSearchQuery"
            type="search"
            autocomplete="off"
            spellcheck="false"
            placeholder="Find release, UPC, ISRC"
          />
        </div>
        <div class="release-search-count" aria-live="polite" :aria-label="`${totalReleasesCount} ${releaseSearchCountNoun}`">
          <strong>{{ totalReleasesCount }}</strong>
          <span>{{ releaseSearchCountNoun }}</span>
        </div>
      </div>

      <AppEmptyState
        v-if="!releases.length"
        icon="file"
        :title="hasReleaseSearchQuery ? 'No matching releases' : 'No releases yet'"
        :description="hasReleaseSearchQuery ? 'Try another artist, release title, UPC, or ISRC.' : 'No releases are visible on this artist account yet.'"
      />

      <template v-else>
      <AppPagination
        v-if="totalReleasesPages > 1"
        :page="releasesPage"
        :page-size="releasesPageSize"
        :total-count="totalReleasesCount"
        :total-pages="totalReleasesPages"
        :pending="pending"
        aria-label="Releases pagination before list"
        class="mb-6 border-b border-border/40 pb-5"
        @update:page="releasesPage = $event"
      />

      <!-- ═══ Elite 4-Column Release Card Grid ═══ -->
      <div class="tl-release-grid" v-reveal-group="{ stagger: 0.07, y: 24 }">
        <Card
          v-for="release in paginatedReleases"
          :key="release.id"
          size="sm"
          class="tl-release-card"
          :class="{ 'tl-release-card-active': release.id === selectedReleaseFolderId }"
          data-dialog-origin="release-card"
          data-dialog-origin-scale="0.56"
          data-dialog-origin-radius="16"
          role="button"
          tabindex="0"
          :aria-label="`Open details for ${release.title || 'release'}`"
          @click="openReleaseDetails(release.id)"
          @keydown="handleReleaseCardKeydown($event, release.id)"
        >
          <!-- Premium Cover Art Frame -->
          <div class="tl-release-art" @contextmenu.prevent>
            <img
              v-if="releaseCoverArtUrl(release)"
              :src="releaseCoverArtUrl(release) || ''"
              :alt="`${release.title} cover art`"
              class="tl-release-art-img"
              draggable="false"
              @dragstart.prevent
            />
            <div v-else class="tl-release-art-placeholder">
              <span>{{ release.title.slice(0, 2).toUpperCase() }}</span>
            </div>

            <!-- Subtle overlay on hover inside the card -->
            <div class="tl-release-art-overlay">
              <span class="tl-release-view-label">View Details</span>
            </div>
          </div>

          <!-- Content Area -->
          <div class="tl-release-meta">
            <div class="tl-release-info">
              <span class="tl-release-title" :title="release.title">{{ release.title }}</span>
            </div>
            <span class="tl-release-artist" :title="release.artistName">{{ release.artistName }}</span>

            <div class="tl-release-badge-row">
              <StatusBadge :tone="statusTone(release.displayStatus)" class="tl-status-dot-pill">
                {{ formatStatusLabel(release.displayStatus) }}
              </StatusBadge>
              <span class="tl-release-type-pill">
                <span class="tl-release-type-mark" aria-hidden="true"></span>
                <span>{{ formatReleaseTypeLabel(release.type) }}</span>
              </span>
            </div>

            <div class="tl-release-footer">
              <span class="tl-release-tracks-count">
                {{ releaseTrackCount(release) }} track{{ releaseTrackCount(release) === 1 ? '' : 's' }}
              </span>
            </div>
          </div>

        </Card>
      </div>

      <!-- Premium Pagination Footer -->
      <AppPagination
        v-if="totalReleasesPages > 1"
        :page="releasesPage"
        :page-size="releasesPageSize"
        :total-count="totalReleasesCount"
        :total-pages="totalReleasesPages"
        :pending="pending"
        aria-label="Releases pagination"
        class="mt-8 border-t border-border/40 pt-6"
        @update:page="releasesPage = $event"
      />

      <!-- ═══ Quickview Detail Panel ═══ -->
      <ReleaseDetailDialog
        v-for="release in selectedReleaseForDialog ? [selectedReleaseForDialog] : []"
        :key="`release-modal-${release.id}`"
        :open="Boolean(selectedReleaseId)"
        :title="release.title"
        eyebrow="Release workspace"
        :subtitle="`${release.type.toUpperCase()} / ${release.genre} / ${formatDate(release.releaseDate)}`"
        :image-url="releaseCoverArtUrl(release)"
        :fallback="release.title.slice(0, 1).toUpperCase()"
        :tabs="releaseDetailTabs"
        :active-tab="activeReleaseDetailTab"
        @close="closeReleaseDetails"
        @update:active-tab="activeReleaseDetailTab = $event"
      >
        <div v-if="selectedReleaseIsHydrating" class="release-detail-loading-strip" aria-live="polite">
          <span class="release-detail-loading-dot" aria-hidden="true"></span>
          <span>Loading full release workspace</span>
        </div>

        <template #badges>
          <StatusBadge :tone="statusTone(release.displayStatus)">
            {{ formatStatusLabel(release.displayStatus) }}
          </StatusBadge>
        </template>

        <template #artActions>
          <Button
            v-if="release.coverArtUrl"
            type="button"
            variant="ghost"
            size="icon-sm"
            class="release-detail-art-action-button"
            :disabled="isReleaseAssetDownloading('cover', release.id)"
            :aria-label="isReleaseAssetDownloading('cover', release.id) ? 'Downloading cover art' : 'Download cover art'"
            @click.stop="downloadReleaseAsset({ assetType: 'cover', releaseId: release.id })"
          >
            <ImageDown class="size-4" aria-hidden="true" />
          </Button>
        </template>

        <Card class="catalog-item release-card release-modal-panel">
            <div v-if="activeReleaseDetailTab === 'overview'" class="release-overview-grid">
              <!-- Catalog Details -->
              <div class="metadata-card">
                <div class="metadata-header">
                  <h3 class="metadata-group-title">Catalog details</h3>
                </div>
                <div class="metadata-body">
                  <div class="metadata-row">
                    <span class="metadata-label">Primary artist</span>
                    <span class="metadata-value">{{ release.artistName }}</span>
                  </div>
                  <div class="metadata-row">
                    <span class="metadata-label">Barcode (UPC)</span>
                    <span class="metadata-value mono">{{ release.upc || "Not assigned" }}</span>
                  </div>
                  <div class="metadata-row">
                    <span class="metadata-label">Release date</span>
                    <span class="metadata-value">{{ formatDate(release.releaseDate) }}</span>
                  </div>
                  <div class="metadata-row">
                    <span class="metadata-label">Genre</span>
                    <span class="metadata-value">{{ release.genre }}</span>
                  </div>
                </div>
              </div>

              <!-- Highlights Panel -->
              <div class="highlights-panel">
                <div class="highlight-item">
                  <span class="highlight-label">Tracks count</span>
                  <div class="highlight-value tabular-nums">{{ release.tracks.length }} {{ release.tracks.length === 1 ? 'Track' : 'Tracks' }}</div>
                </div>
                <div class="highlight-item highlight-link-container">
                  <span class="highlight-label">Streaming URL</span>
                  <div class="highlight-link-box">
                    <CopyableLink :url="release.streamingLink" />
                  </div>
                </div>
              </div>
            </div>

            <div v-if="activeReleaseDetailTab === 'overview' && release.takedownReason" class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Takedown reason</span>
                <strong>{{ release.takedownReason }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Proof links</span>
                <strong>{{ release.takedownProofUrls.length || 0 }}</strong>
              </div>
            </div>

            <div v-if="activeReleaseDetailTab === 'overview' && release.pendingRequest" class="catalog-subitem catalog-subitem-muted">
              <div class="summary-copy">
                <strong>Open request</strong>
                <span class="detail-copy">
                  {{ release.pendingRequest.requestType === "draft_edit" ? "Draft edit" : "Takedown" }}
                  /
                  {{ formatStatusLabel(release.pendingRequest.status) }}
                  /
                  {{ formatDateTime(release.pendingRequest.createdAt) }}
                </span>
                <span v-if="release.pendingRequest.adminNotes" class="detail-copy">
                  {{ release.pendingRequest.adminNotes }}
                </span>
              </div>
            </div>

            <div v-if="activeReleaseDetailTab === 'overview' && release.submissionStatus" class="catalog-subitem catalog-subitem-muted">
              <div class="summary-copy">
                <strong>Submission review</strong>
                <span class="detail-copy">{{ formatStatusLabel(release.displayStatus) }}</span>
                <span v-if="release.submissionAdminNotes" class="detail-copy">{{ release.submissionAdminNotes }}</span>
              </div>
            </div>

            <div v-if="activeReleaseDetailTab === 'contributors'" class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Collaborators</strong>
                  <span class="detail-copy">People connected to the release or split map. Track credits stay inside the Tracks section.</span>
                </div>
              </div>

              <div v-if="release.releaseCollaborators.length" class="catalog-subitems">
                <div
                  v-for="collaborator in release.releaseCollaborators"
                  :key="`${release.id}-${collaborator.artistId}-${collaborator.role}`"
                  class="catalog-subitem catalog-subitem-compact"
                >
                  <div class="summary-copy">
                    <strong>{{ collaborator.name }}</strong>
                    <span class="detail-copy">{{ collaborator.role }}</span>
                  </div>
                  <Badge v-if="collaborator.visibleSplitPct" variant="secondary">{{ collaborator.visibleSplitPct }}%</Badge>
                </div>
              </div>

              <AppEmptyState
                v-else
                compact
                icon="file"
                title="No collaborators"
                description="This release has no visible collaborators. Track credits are listed under Tracks."
                class="border-0 bg-transparent shadow-none"
              />

              <div v-if="release.viewerSplitHistory.length" class="catalog-subitems">
                <div v-for="history in release.viewerSplitHistory" :key="`${release.id}-${history.scope}-${history.role}-${history.changedAt}`" class="catalog-subitem catalog-subitem-compact">
                  <div class="summary-copy">
                    <strong>Your release split</strong>
                    <span class="detail-copy">{{ history.role }} / {{ history.splitPct }}% / effective {{ history.effectivePeriodMonth }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="activeReleaseDetailTab === 'tracks'" class="catalog-track-list">
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Tracks</strong>
                  <span class="detail-copy">Track-level split maps win. Credits stay separate and render below each track.</span>
                </div>
              </div>

              <div v-if="release.tracks.length" class="catalog-subitems">
                <div v-for="track in release.tracks" :key="track.id" class="catalog-subitem track-card">
                  <div class="catalog-header">
                    <div class="summary-copy">
                      <strong>{{ track.trackNumber ? `${track.trackNumber}. ` : "" }}{{ track.title }}</strong>
                      <span class="detail-copy mono">ISRC: {{ track.isrc || "Not assigned" }}</span>
                      <span v-if="formatDuration(track.durationSeconds)" class="detail-copy">{{ formatDuration(track.durationSeconds) }}</span>
                    </div>

                    <div class="badge-row">
                      <StatusBadge :tone="statusTone(track.status)">{{ formatStatusLabel(track.status) }}</StatusBadge>
                      <Badge v-if="track.collaborationSource === 'track'" variant="muted">Track split map</Badge>
                      <Badge v-else-if="track.collaborationSource === 'release'" variant="muted">Release fallback</Badge>
                    </div>
                  </div>

                  <div v-if="track.audioPreviewUrl" class="track-audio-preview-row">
                    <PremiumAudioPlayer
                      :src="track.audioPreviewUrl"
                      :title="track.title"
                      :artist-name="release.artistName"
                      :artwork-url="releaseCoverArtUrl(release)"
                      :duration-seconds="track.durationSeconds"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      class="track-audio-download-button"
                      :disabled="isReleaseAssetDownloading('audio', release.id, track.id)"
                      @click.stop="downloadReleaseAsset({ assetType: 'audio', releaseId: release.id, trackId: track.id })"
                    >
                      <Download class="size-4" aria-hidden="true" />
                      <span>{{ isReleaseAssetDownloading('audio', release.id, track.id) ? "Downloading..." : "Download audio" }}</span>
                    </Button>
                  </div>

                  <AppEmptyState
                    v-else
                    compact
                    icon="file"
                    title="No audio preview"
                    description="No audio preview is attached to this track yet."
                    class="border-0 bg-transparent shadow-none"
                  />

                  <div v-if="track.collaborators.length" class="catalog-track-list">
                    <div class="summary-copy">
                      <strong>Track collaborators</strong>
                      <span class="detail-copy">
                        {{ track.collaborationSource === "release" ? "Using the release-level split map for this track." : "Showing the track-specific split map." }}
                      </span>
                    </div>

                    <div class="catalog-subitems">
                      <div
                        v-for="collaborator in track.collaborators"
                        :key="`${track.id}-${collaborator.artistId}-${collaborator.role}`"
                        class="catalog-subitem catalog-subitem-compact"
                      >
                        <div class="summary-copy">
                          <strong>{{ collaborator.name }}</strong>
                          <span class="detail-copy">{{ collaborator.role }}</span>
                        </div>
                        <Badge v-if="collaborator.visibleSplitPct" variant="secondary">{{ collaborator.visibleSplitPct }}%</Badge>
                      </div>
                    </div>

                    <div v-if="track.viewerSplitHistory.length" class="catalog-subitems">
                      <div v-for="history in track.viewerSplitHistory" :key="`${track.id}-${history.role}-${history.changedAt}`" class="catalog-subitem catalog-subitem-compact">
                        <div class="summary-copy">
                          <strong>Your track split</strong>
                          <span class="detail-copy">{{ history.role }} / {{ history.splitPct }}% / effective {{ history.effectivePeriodMonth }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="catalog-track-list">
                    <div class="summary-copy">
                      <strong>Credits</strong>
                    </div>

                    <div v-if="track.credits.length" class="release-credit-table-frame">
                      <Table class="release-credit-table">
                        <TableHeader>
                          <TableRow>
                            <TableHead>Credited name</TableHead>
                            <TableHead>Roles</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow
                            v-for="credit in groupCreditDrafts(track.credits)"
                            :key="`${track.id}-${credit.creditedName}-${credit.roleCodes.join('-')}`"
                          >
                            <TableCell>
                              <div class="release-credit-person">
                                <span class="release-credit-avatar">{{ credit.creditedName.slice(0, 1).toUpperCase() || "?" }}</span>
                                <strong>{{ credit.creditedName }}</strong>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div class="release-credit-role-list">
                                <Badge
                                  v-for="role in credit.roleCodes"
                                  :key="`${track.id}-${credit.creditedName}-${role}`"
                                  variant="secondary"
                                  class="release-credit-role-badge"
                                >
                                  {{ role }}
                                </Badge>
                              </div>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    <AppEmptyState
                      v-else
                      compact
                      icon="file"
                      title="No credits listed"
                      description="No credits are listed for this track yet."
                      class="border-0 bg-transparent shadow-none"
                    />
                  </div>
                </div>
              </div>

              <AppEmptyState
                v-else
                compact
                icon="file"
                title="No visible tracks"
                description="No visible tracks are attached to this release yet."
                class="border-0 bg-transparent shadow-none"
              />
            </div>

            <div
              v-if="activeReleaseDetailTab === 'actions' && !isViewingAsArtist && release.viewerRelation === 'owner' && release.status === 'draft' && release.canSubmitDraftEdit && releaseDrafts[release.id]"
              class="catalog-track-list"
            >
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Edit draft for approval</strong>
                  <span class="detail-copy">Your draft changes stay pending until an admin approves them.</span>
                </div>
              </div>

              <div class="catalog-grid catalog-grid-wide">
                <div class="field-row">
                  <label :for="`draft-title-${release.id}`">Title</label>
                  <Input :id="`draft-title-${release.id}`" v-model="releaseDrafts[release.id].title" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`draft-type-${release.id}`">Type</label>
                  <NativeSelect :id="`draft-type-${release.id}`" v-model="releaseDrafts[release.id].type">
                    <option value="single">Single</option>
                    <option value="ep">EP</option>
                    <option value="album">Album</option>
                  </NativeSelect>
                </div>

                <div class="field-row">
                  <label :for="`draft-genre-${release.id}`">Genre</label>
                  <NativeSelect :id="`draft-genre-${release.id}`" v-model="releaseDrafts[release.id].genre">
                    <option v-for="genre in RELEASE_GENRE_OPTIONS" :key="genre" :value="genre">{{ genre }}</option>
                  </NativeSelect>
                </div>

                <div class="field-row">
                  <label :for="`draft-upc-${release.id}`">UPC</label>
                  <Input :id="`draft-upc-${release.id}`" v-model="releaseDrafts[release.id].upc" class="font-mono" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`draft-date-${release.id}`">Release date</label>
                  <AppDatePicker :id="`draft-date-${release.id}`" v-model="releaseDrafts[release.id].releaseDate" />
                </div>

                <div class="field-row">
                  <label :for="`draft-cover-${release.id}`">Cover art URL</label>
                  <Input :id="`draft-cover-${release.id}`" v-model="releaseDrafts[release.id].coverArtUrl" type="url" />
                </div>

                <div class="field-row field-row-full">
                  <label :for="`draft-link-${release.id}`">Streaming link</label>
                  <Input :id="`draft-link-${release.id}`" v-model="releaseDrafts[release.id].streamingLink" type="url" />
                </div>
              </div>

              <div class="catalog-subitems">
                <Card v-for="(track, trackIndex) in releaseDrafts[release.id].tracks" :key="`draft-track-${release.id}-${trackIndex}`" size="sm" class="catalog-subitem">
                  <div class="catalog-grid catalog-grid-wide">
                    <div class="field-row">
                      <label :for="`draft-track-title-${release.id}-${trackIndex}`">Track title</label>
                      <Input :id="`draft-track-title-${release.id}-${trackIndex}`" v-model="track.title" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`draft-track-isrc-${release.id}-${trackIndex}`">ISRC</label>
                      <Input :id="`draft-track-isrc-${release.id}-${trackIndex}`" v-model="track.isrc" class="font-mono" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`draft-track-number-${release.id}-${trackIndex}`">Track no.</label>
                      <Input :id="`draft-track-number-${release.id}-${trackIndex}`" v-model="track.trackNumber" type="number" min="1" />
                    </div>

                    <div class="field-row">
                      <label :for="`draft-track-tiktok-${release.id}-${trackIndex}`">TikTok time</label>
                      <Input :id="`draft-track-tiktok-${release.id}-${trackIndex}`" v-model="track.tiktokPreviewStartSeconds" type="number" min="0" max="3599" />
                    </div>

                    <div class="field-row">
                      <label :for="`draft-track-version-${release.id}-${trackIndex}`">Version line</label>
                      <Input :id="`draft-track-version-${release.id}-${trackIndex}`" v-model="track.versionLine" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`draft-track-audio-${release.id}-${trackIndex}`">Audio preview URL</label>
                      <Input :id="`draft-track-audio-${release.id}-${trackIndex}`" v-model="track.audioPreviewUrl" type="url" />
                    </div>

                    <Label class="field-row checkbox-row">
                      <Checkbox v-model="track.containsAiGeneratedElements" />
                      <span>Contains AI-generated elements</span>
                    </Label>

                    <div class="field-row field-row-full">
                      <label :for="`draft-track-lyrics-${release.id}-${trackIndex}`">Lyrics</label>
                      <Textarea :id="`draft-track-lyrics-${release.id}-${trackIndex}`" v-model="track.lyrics" rows="4" />
                    </div>
                  </div>

                  <div class="catalog-subitems">
                    <div v-for="(credit, creditIndex) in track.credits" :key="`draft-credit-${release.id}-${trackIndex}-${creditIndex}`" class="catalog-subitem catalog-subitem-compact">
                      <div class="catalog-grid catalog-grid-wide">
                        <div class="field-row">
                          <label :for="`draft-credit-name-${release.id}-${trackIndex}-${creditIndex}`">Credited name</label>
                          <Input :id="`draft-credit-name-${release.id}-${trackIndex}-${creditIndex}`" v-model="credit.creditedName" type="text" />
                        </div>

                        <div class="field-row field-row-full">
                          <label>Roles</label>
                          <CreditRoleMultiSelect
                            :input-id="`draft-credit-role-search-${release.id}-${trackIndex}-${creditIndex}`"
                            v-model="credit.roleCodes"
                          />
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <Button variant="destructive" @click="removeDraftCredit(release.id, trackIndex, creditIndex)">
                          Remove credit
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <Button variant="secondary" @click="addDraftCredit(release.id, trackIndex)">Add credit</Button>
                    <Button variant="destructive" @click="removeDraftTrack(release.id, trackIndex)">Remove track</Button>
                  </div>
        </Card>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button variant="secondary" @click="addDraftTrack(release.id)">Add track</Button>
                <Button :disabled="submittingDraftRequest[release.id]" @click="submitDraftEditRequest(release)">
                  {{ submittingDraftRequest[release.id] ? "Submitting..." : "Submit draft edit request" }}
                </Button>
              </div>
            </div>

            <div
              v-if="activeReleaseDetailTab === 'actions' && !isViewingAsArtist && release.viewerRelation === 'owner' && release.status === 'live' && !release.pendingRequest && releaseDrafts[release.id]"
              class="catalog-track-list"
            >
              <div class="catalog-section-header">
                <div class="summary-copy">
                  <strong>Request takedown</strong>
                  <span class="detail-copy">Takedowns preserve earnings history while changing the release status from live to taken down after admin approval.</span>
                </div>
              </div>

              <div class="field-row">
                <label :for="`takedown-reason-${release.id}`">Reason</label>
                <Textarea :id="`takedown-reason-${release.id}`" v-model="releaseDrafts[release.id].takedownReason" rows="3" />
              </div>

              <div class="field-row">
                <label :for="`takedown-proof-${release.id}`">Proof links (one per line)</label>
                <Textarea :id="`takedown-proof-${release.id}`" v-model="releaseDrafts[release.id].proofUrlsText" rows="3" />
              </div>

              <div class="flex flex-wrap gap-2">
                <Button variant="secondary" :disabled="submittingTakedownRequest[release.id]" @click="submitTakedownRequest(release)">
                  {{ submittingTakedownRequest[release.id] ? "Submitting..." : "Submit takedown request" }}
                </Button>
              </div>
            </div>
          </Card>
      </ReleaseDetailDialog>
        </template>
      </template>
  </div>
</template>

<style scoped>
.page {
  gap: 18px;
}

:deep(.page-header) {
  padding-bottom: 8px;
}

/* ═══ Too Lost Release Card Grid ═══ */
.tl-alerts {
  display: grid;
  gap: 8px;
}

.release-search-panel {
  --release-search-input-border: color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  --release-search-input-background:
    linear-gradient(145deg, color-mix(in srgb, var(--background) 80%, var(--card) 20%), color-mix(in srgb, var(--card) 90%, var(--background) 10%));
  --release-search-input-shadow:
    inset 2px 2px 6px rgb(74 58 30 / 9%),
    inset -2px -2px 6px rgb(255 255 255 / 58%),
    0 1px 0 rgb(255 255 255 / 48%);
  --release-search-input-focus-border: color-mix(in srgb, var(--primary) 44%, var(--surface-border, var(--border)));
  --release-search-input-focus-shadow:
    inset 2px 2px 6px rgb(74 58 30 / 10%),
    inset -2px -2px 6px rgb(255 255 255 / 62%),
    0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent);

  display: grid;
  grid-template-columns: minmax(280px, clamp(340px, 42vw, 640px)) auto;
  width: fit-content;
  max-width: 100%;
  gap: 14px;
  align-items: center;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: 15px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 94%, white 6%), color-mix(in srgb, var(--card) 96%, var(--muted) 4%));
  box-shadow:
    -7px -7px 18px -14px rgb(255 255 255 / 78%),
    12px 16px 30px -26px rgb(70 55 28 / 26%),
    inset 1px 1px 0 rgb(255 255 255 / 72%),
    inset -1px -1px 0 rgb(80 62 32 / 6%);
}

.release-search-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.release-search-control {
  position: relative;
  width: 100%;
  min-width: 0;
}

.release-search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  z-index: 1;
  width: 17px;
  height: 17px;
  color: color-mix(in srgb, var(--muted-foreground) 74%, var(--primary));
  transform: translateY(-50%);
  pointer-events: none;
}

.release-search-control :deep(input) {
  min-height: 42px;
  appearance: none;
  padding-left: 46px;
  padding-right: 16px;
  border-width: 1px;
  border-color: var(--release-search-input-border);
  border-radius: 12px;
  background: var(--release-search-input-background);
  box-shadow: var(--release-search-input-shadow);
  font-size: 13px;
  font-weight: 650;
}

.release-search-control :deep(input::placeholder) {
  color: color-mix(in srgb, var(--muted-foreground) 78%, transparent);
  font-weight: 600;
}

.release-search-control :deep(input:focus-visible) {
  border-color: var(--release-search-input-focus-border);
  box-shadow: var(--release-search-input-focus-shadow);
}

.release-search-count {
  display: inline-flex;
  min-height: 32px;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding: 0 4px 0 14px;
  border: 0;
  border-left: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  border-radius: 0;
  background: transparent;
  color: color-mix(in srgb, var(--foreground) 86%, var(--primary));
  box-shadow: none;
  white-space: nowrap;
}

.release-search-count strong {
  color: var(--foreground);
  font-size: 18px;
  font-weight: 780;
  line-height: 1;
}

.release-search-count span {
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground));
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1;
  text-transform: lowercase;
}

:global(.dark .release-search-panel) {
  --release-search-input-border: color-mix(in srgb, #f4eedf 12%, var(--surface-border, var(--border)));
  --release-search-input-background:
    linear-gradient(145deg, color-mix(in srgb, #0b0a08 44%, var(--background)), color-mix(in srgb, #1a1814 34%, var(--card)));
  --release-search-input-shadow:
    inset 2px 2px 6px rgb(0 0 0 / 42%),
    inset -2px -2px 5px rgb(255 231 172 / 5%),
    0 1px 0 rgb(255 255 255 / 4%);
  --release-search-input-focus-border: color-mix(in srgb, var(--primary) 42%, var(--surface-border, var(--border)));
  --release-search-input-focus-shadow:
    inset 2px 2px 6px rgb(0 0 0 / 42%),
    inset -2px -2px 5px rgb(255 231 172 / 6%),
    0 0 0 3px color-mix(in srgb, var(--primary) 17%, transparent);

  border-color: color-mix(in srgb, #f4eedf 11%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, color-mix(in srgb, #24211c 44%, var(--card)), color-mix(in srgb, #0d0c0a 30%, var(--card)));
  box-shadow:
    -7px -7px 18px -15px rgb(255 231 172 / 8%),
    14px 18px 34px -23px rgb(0 0 0 / 82%),
    inset 1px 1px 0 rgb(255 255 255 / 5%),
    inset -1px -1px 0 rgb(0 0 0 / 28%);
}

:global(.dark .release-search-count) {
  border-color: color-mix(in srgb, #f4eedf 13%, var(--surface-border, var(--border)));
  background: transparent;
  box-shadow: none;
}

@media (max-width: 640px) {
  .release-search-panel {
    grid-template-columns: 1fr;
    width: 100%;
    gap: 10px;
    padding: 12px;
  }

  .release-search-count {
    width: 100%;
    justify-content: flex-start;
    padding: 2px 2px 0 46px;
    border-left: 0;
  }
}

.tl-release-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(1, 1fr);
}

@media (min-width: 640px) {
  .tl-release-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .tl-release-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1280px) {
  .tl-release-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.tl-release-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 13px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  border-radius: 15px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 96%, white 4%), color-mix(in srgb, var(--card) 92%, var(--muted) 8%)),
    var(--card);
  padding: 13px;
  box-shadow:
    -9px -9px 18px -15px color-mix(in srgb, white 86%, transparent),
    14px 18px 34px -24px color-mix(in srgb, var(--foreground) 26%, transparent),
    inset 1px 1px 0 color-mix(in srgb, white 68%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--foreground) 7%, transparent);
  cursor: pointer;
  transition:
    border-color 200ms var(--ease-out),
    background 200ms var(--ease-out),
    box-shadow 250ms var(--ease-out),
    transform 220ms var(--ease-out);
  transform: translateY(0);
}

.tl-release-card::before {
  position: absolute;
  inset: 1px;
  border-radius: 14px;
  background:
    linear-gradient(145deg, color-mix(in srgb, white 22%, transparent), transparent 42%),
    linear-gradient(315deg, color-mix(in srgb, var(--foreground) 5%, transparent), transparent 46%);
  content: "";
  opacity: 0.62;
  pointer-events: none;
  transition: opacity 200ms var(--ease-out);
}

.tl-release-card:hover {
  border-color: color-mix(in srgb, var(--primary) 24%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 98%, white 5%), color-mix(in srgb, var(--card) 90%, var(--muted) 10%)),
    var(--card);
  box-shadow:
    -12px -12px 24px -18px color-mix(in srgb, white 92%, transparent),
    18px 24px 44px -26px color-mix(in srgb, var(--foreground) 34%, transparent),
    0 14px 26px -22px color-mix(in srgb, var(--primary) 34%, transparent),
    inset 1px 1px 0 color-mix(in srgb, white 74%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
  transform: translateY(-4px);
}

.tl-release-card:hover::before {
  opacity: 0.82;
}

.tl-release-card:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--primary) 42%, var(--surface-border, var(--border)));
  box-shadow:
    -9px -9px 18px -15px color-mix(in srgb, white 86%, transparent),
    14px 18px 34px -24px color-mix(in srgb, var(--foreground) 26%, transparent),
    0 0 0 3px color-mix(in srgb, var(--primary) 18%, transparent),
    inset 1px 1px 0 color-mix(in srgb, white 68%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--foreground) 7%, transparent);
}

.tl-release-card-active {
  border-color: color-mix(in srgb, var(--primary) 48%, var(--border)) !important;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 94%, var(--primary) 6%), color-mix(in srgb, var(--card) 90%, var(--muted) 10%)),
    var(--card);
  box-shadow:
    -10px -10px 20px -16px color-mix(in srgb, white 90%, transparent),
    18px 24px 42px -26px color-mix(in srgb, var(--primary) 34%, transparent),
    inset 1px 1px 0 color-mix(in srgb, white 72%, transparent),
    inset -1px -1px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
}

:global(.dark .tl-release-card) {
  border-color: rgb(255 255 255 / 10%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 92%, var(--background) 8%), color-mix(in srgb, var(--card) 78%, black 22%)),
    var(--card);
  box-shadow:
    0 18px 42px -34px rgb(0 0 0 / 88%),
    inset 0 1px 0 rgb(255 255 255 / 4%);
}

:global(.dark .tl-release-card:hover),
:global(.dark .tl-release-card-active) {
  border-color: color-mix(in srgb, var(--primary) 24%, rgb(255 255 255 / 12%)) !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--background) 6%), color-mix(in srgb, var(--card) 80%, black 20%)),
    var(--card);
  box-shadow:
    0 22px 48px -34px rgb(0 0 0 / 92%),
    0 0 0 1px color-mix(in srgb, var(--primary) 8%, transparent),
    inset 0 1px 0 rgb(255 255 255 / 5%);
}

:global(.dark .tl-release-card::before) {
  background:
    linear-gradient(180deg, rgb(255 255 255 / 3%), transparent 38%),
    linear-gradient(315deg, rgb(0 0 0 / 14%), transparent 52%);
  opacity: 0.26;
}

:global(.dark .tl-release-card:hover::before) {
  opacity: 0.34;
}

.tl-release-art {
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 70%, transparent);
  border-radius: 11px;
  overflow: hidden;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--muted) 72%, var(--card)), color-mix(in srgb, var(--muted) 88%, var(--foreground) 4%));
  box-shadow:
    inset 2px 2px 7px color-mix(in srgb, var(--foreground) 13%, transparent),
    inset -2px -2px 6px color-mix(in srgb, white 38%, transparent),
    0 12px 20px -18px color-mix(in srgb, var(--foreground) 38%, transparent);
  z-index: 1;
}

:global(.dark .tl-release-art) {
  border-color: rgb(255 255 255 / 8%);
  background: color-mix(in srgb, var(--muted) 82%, black 18%);
  box-shadow:
    0 12px 26px -22px rgb(0 0 0 / 92%),
    inset 0 0 0 1px rgb(255 255 255 / 3%);
}

.tl-release-art-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}

.tl-release-art-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 700;
  color: var(--muted-foreground);
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--muted) 88%, white 6%), color-mix(in srgb, var(--muted) 80%, var(--primary) 12%));
}

.tl-release-art-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 250ms var(--ease-out);
}

.tl-release-card:hover .tl-release-art-overlay {
  opacity: 1;
}

.tl-release-view-label {
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  border: 1px solid rgba(255, 255, 255, 0.4);
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(4px);
}

.tl-release-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  position: relative;
  z-index: 1;
}

.tl-release-info {
  display: flex;
  align-items: center;
  min-width: 0;
}

.tl-release-title {
  font-size: 15px;
  font-weight: 650;
  color: var(--foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
  transition: color 200ms ease;
}

.tl-release-card:hover .tl-release-title {
  color: var(--primary);
}

.tl-release-artist {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-release-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
  font-size: 12px;
  color: var(--muted-foreground);
  margin-top: 4px;
}

.tl-release-badge-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 9px;
  margin-top: 8px;
}

.tl-status-dot-pill,
.tl-release-type-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 28px;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 5px 13px;
  font-family: var(--font-app-sans);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  letter-spacing: 0;
  text-transform: none;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, white 24%, transparent),
    0 8px 16px -14px color-mix(in srgb, var(--foreground) 28%, transparent);
}

:global(.dark .tl-status-dot-pill),
:global(.dark .tl-release-type-pill) {
  box-shadow: none;
}

.tl-release-type-pill {
  background: color-mix(in srgb, var(--surface-glass-strong, var(--card)) 72%, var(--surface-muted, var(--muted)));
  border-color: color-mix(in srgb, var(--priority, #8a6a28) 30%, var(--surface-border, var(--border)));
  color: var(--foreground, #1b1a17);
}

:global(.dark .tl-release-type-pill) {
  border-color: color-mix(in srgb, #e8c028 28%, rgb(255 255 255 / 8%));
  background: rgb(255 255 255 / 4%);
  color: rgb(244 237 222 / 90%);
}

.tl-release-type-mark {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: #e8c028;
  opacity: 1;
}

.release-detail-loading-strip {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  margin: 0 24px 14px;
  padding: 8px 11px;
  border: 1px solid color-mix(in srgb, var(--primary) 26%, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 8%, var(--card));
  color: color-mix(in srgb, var(--foreground) 82%, var(--primary));
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  box-shadow: 0 10px 22px -18px color-mix(in srgb, var(--primary) 60%, transparent);
}

.release-detail-loading-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--primary);
  animation: release-detail-loading-pulse 900ms ease-in-out infinite;
}

@keyframes release-detail-loading-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.86);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
}

.release-modal-panel {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.release-modal-panel.catalog-item:hover {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  transform: none;
}

.release-modal-panel .catalog-subitem,
.release-modal-panel .summary-row,
.release-modal-panel .metadata-card,
.release-modal-panel .highlight-item {
  transform: none;
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background-color var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out);
}

.release-modal-panel .catalog-subitem:hover,
.release-modal-panel .catalog-subitem:active {
  border-color: var(--border);
  background: var(--card);
  box-shadow: var(--surface-depth-edge, var(--shadow-card));
  transform: none;
}

.release-modal-panel .summary-row:hover,
.release-modal-panel .summary-row:active {
  border-color: var(--border);
  background: transparent;
  box-shadow: none;
  transform: none;
}

.release-modal-panel .metadata-card:hover,
.release-modal-panel .metadata-card:active {
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
  transform: none;
}

.release-modal-panel .highlight-item:hover,
.release-modal-panel .highlight-item:active {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  background: color-mix(in srgb, var(--muted) 18%, var(--card));
  box-shadow: none;
  transform: none;
}

.release-modal-panel .catalog-subitem-muted:hover {
  border-color: var(--border);
  border-style: dashed;
  background: color-mix(in srgb, var(--muted) 44%, transparent);
  box-shadow: var(--surface-depth-edge, var(--shadow-card));
  transform: none;
}

.release-modal-panel .track-card:hover {
  border-color: var(--border);
  background: var(--card);
  box-shadow: var(--surface-depth-edge, var(--shadow-card));
  transform: none;
}

.track-audio-preview-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.track-audio-download-button {
  min-height: 40px;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .track-audio-preview-row {
    grid-template-columns: 1fr;
  }

  .track-audio-download-button {
    width: 100%;
  }
}

/* ═══ Redesigned Premium Release Overview Tab ═══ */
.release-overview-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .release-overview-grid {
    grid-template-columns: 2fr 1fr;
  }
}

.metadata-card {
  background: var(--card);
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 12px;
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
  overflow: hidden;
}

.metadata-header {
  padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  background: color-mix(in srgb, var(--muted) 18%, var(--card));
}

.metadata-group-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--primary);
}

.metadata-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.metadata-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding-bottom: 12px;
  border-bottom: 1px dashed color-mix(in srgb, var(--border) 25%, transparent);
}

@media (min-width: 640px) {
  .metadata-row {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
}

.metadata-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.metadata-label {
  font-size: 13px;
  font-weight: 550;
  color: var(--muted-foreground);
}

.metadata-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground);
}

.metadata-value.mono {
  font-family: var(--font-mono, monospace);
  letter-spacing: -0.02em;
}

.highlights-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.highlight-item {
  background: color-mix(in srgb, var(--muted) 18%, var(--card));
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.highlight-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}

.highlight-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--foreground);
}

.highlight-link-container {
  gap: 10px;
}

.highlight-link-box {
  width: 100%;
}
</style>
