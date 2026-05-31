<script setup lang="ts">
import {
  Download,
  ExternalLink,
  ImageDown,
  ListOrdered,
  Music2,
  Palette,
  UsersRound,
} from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
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
import {
  RELEASE_GENRE_OPTIONS,
  normalizeTrackCreditRoleCodes,
} from "~~/types/catalog"
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
  lyrics: string
  tiktokPreviewStartSeconds: string
  versionLine: string
  containsAiGeneratedElements: boolean
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
  lyrics: string
  tiktokPreviewStartSeconds: string
  versionLine: string
  containsAiGeneratedElements: boolean
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

type AdminTrackRecord = AdminReleaseRecord["tracks"][number]
type AdminTrackCreditRecord = AdminTrackRecord["credits"][number]
type CreditReviewLane = "artist" | "writer" | "additional"

const ARTIST_CREDIT_ROLE_SET = new Set(["Main Artist", "Featured Artist", "Remixer"])
const WRITER_CREDIT_ROLE_SET = new Set(["Lyricist", "Composer", "Songwriter", "Arranger"])
const creditReviewLanes: Array<{ value: CreditReviewLane; label: string; empty: string }> = [
  { value: "artist", label: "Artist order", empty: "No artist credits" },
  { value: "writer", label: "Writers", empty: "No writer credits" },
  { value: "additional", label: "Additional", empty: "No additional credits" },
]

function currentMonthValue() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
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

function nextTrackNumberValue(tracks: Array<{ trackNumber: string | number | null | undefined }>) {
  const numbers = tracks
    .map((track) => Number.parseInt(String(track.trackNumber ?? "").trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0)

  return String((numbers.length ? Math.max(...numbers) : 0) + 1)
}

function isBlankTrackCreateDraft(track: TrackCreateDraft | undefined) {
  if (!track) {
    return true
  }

  return !track.title.trim() &&
    !track.isrc.trim() &&
    !track.audioPreviewUrl.trim() &&
    !track.lyrics.trim() &&
    !track.tiktokPreviewStartSeconds.trim() &&
    !track.versionLine.trim() &&
    !track.containsAiGeneratedElements
}

function blankTrackCreateDraft(releaseId = "", trackNumber = "1"): TrackCreateDraft {
  return {
    releaseId,
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

function toNullableInteger(value: string | number | null | undefined) {
  const normalized = String(value ?? "").trim()
  return normalized ? Number(normalized) : null
}

function formatTiktokPreviewTime(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "TikTok time not set"
  }

  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return `TikTok ${minutes}:${String(seconds).padStart(2, "0")}`
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
    } satisfies TrackCreditInput))
  })
}

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ")
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

function submissionAssetDownloadUrl(submissionId: string, kind: "cover" | "audio", trackId?: string) {
  const params = new URLSearchParams({ kind })

  if (trackId) {
    params.set("trackId", trackId)
  }

  return `/api/admin/releases/submissions/${submissionId}/asset?${params.toString()}`
}

function orderedCredits(credits: AdminTrackCreditRecord[]) {
  return [...credits].sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt))
}

function creditMatchesLane(credit: AdminTrackCreditRecord, lane: CreditReviewLane) {
  if (lane === "artist") {
    return ARTIST_CREDIT_ROLE_SET.has(credit.roleCode)
  }

  if (lane === "writer") {
    return WRITER_CREDIT_ROLE_SET.has(credit.roleCode)
  }

  return !ARTIST_CREDIT_ROLE_SET.has(credit.roleCode) && !WRITER_CREDIT_ROLE_SET.has(credit.roleCode)
}

function trackCreditsByLane(track: AdminTrackRecord, lane: CreditReviewLane) {
  return orderedCredits(track.credits).filter((credit) => creditMatchesLane(credit, lane))
}

function groupedCreditRows(credits: AdminTrackCreditRecord[]) {
  const rows = new Map<string, { creditedName: string; roleCodes: string[]; sortOrder: number }>()

  for (const credit of credits) {
    const key = credit.creditedName.trim().toLowerCase()
    const existing = rows.get(key)

    if (existing) {
      existing.roleCodes = normalizeTrackCreditRoleCodes([...existing.roleCodes, credit.roleCode])
      existing.sortOrder = Math.min(existing.sortOrder, credit.sortOrder)
      continue
    }

    rows.set(key, {
      creditedName: credit.creditedName,
      roleCodes: normalizeTrackCreditRoleCodes([credit.roleCode]),
      sortOrder: credit.sortOrder,
    })
  }

  return [...rows.values()].sort((left, right) => left.sortOrder - right.sortOrder)
}

function releaseArtistChronology(release: AdminReleaseRecord) {
  const sortedTracks = [...release.tracks].sort((left, right) => (left.trackNumber ?? 9999) - (right.trackNumber ?? 9999))
  const firstTrackWithArtists = sortedTracks.find((track) => trackCreditsByLane(track, "artist").length)

  if (firstTrackWithArtists) {
    return groupedCreditRows(trackCreditsByLane(firstTrackWithArtists, "artist"))
  }

  const aggregatedArtistCredits = sortedTracks.flatMap((track) => trackCreditsByLane(track, "artist"))
  const groupedArtists = groupedCreditRows(aggregatedArtistCredits)

  if (groupedArtists.length) {
    return groupedArtists
  }

  return release.artistName ? [{ creditedName: release.artistName, roleCodes: ["Main Artist"], sortOrder: 0 }] : []
}

function creditLaneSummary(track: AdminTrackRecord, lane: CreditReviewLane) {
  const rows = groupedCreditRows(trackCreditsByLane(track, lane))
  const laneMeta = creditReviewLanes.find((item) => item.value === lane)

  if (!rows.length) {
    return laneMeta?.empty ?? "No credits"
  }

  return rows.map((row) => `${row.creditedName} (${row.roleCodes.join(", ")})`).join(" / ")
}

function creditLaneClass(lane: CreditReviewLane) {
  return `admin-credit-lane admin-credit-lane-${lane}`
}

function submissionCoverForReview(release: AdminReleaseRecord) {
  return release.submission?.finalCoverArtUrl || release.submission?.sourceCoverArtUrl || release.coverArtUrl || ""
}

function releaseCoverArtUrl(release: AdminReleaseRecord) {
  return release.coverArtUrl
}

function reviewAudioUrl(track: AdminTrackRecord) {
  return track.finalAudioUrl || track.sourceAudioUrl || track.audioPreviewUrl || ""
}

const WORKSPACE_PAGE_SIZE_OPTIONS = [4, 8, 12, 24] as const

const selectedArtistId = ref("")
const workspacePage = ref(1)
const workspacePageSize = ref(8)
const catalogFile = ref<File | null>(null)
const catalogFileInput = ref<HTMLInputElement | null>(null)
const pageError = ref("")
const pageSuccess = ref("")
const bulkImportResult = ref<BulkCatalogImportResponse | null>(null)
const { confirmAction } = useConfirmAction()

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
const submissionActing = reactive<Record<string, boolean>>({})
const submissionReviewNotes = reactive<Record<string, string>>({})
const releasePublishing = reactive<Record<string, boolean>>({})

const releaseForm = reactive<ReleaseCreateDraft>(blankCreateReleaseDraft())
const releaseDrafts = reactive<Record<string, EditableRelease>>({})
const trackDrafts = reactive<Record<string, EditableTrack>>({})
const trackCreditDrafts = reactive<Record<string, CreditDraft[]>>({})
const newTrackDrafts = reactive<Record<string, TrackCreateDraft>>({})
const releaseSplitDrafts = reactive<Record<string, SplitVersionDraft>>({})
const trackSplitDrafts = reactive<Record<string, SplitVersionDraft>>({})
const route = useRoute()
const router = useRouter()
const activeReleaseDetailTab = ref("overview")

const { data: artistResponse } = useLazyFetch<{ artists: ImportArtistOption[] }>("/api/admin/artists", {
  query: {
    surface: "options",
  },
})
const artists = computed(() => artistResponse.value?.artists ?? [])

watch(
  artists,
  (value) => {
    if (!releaseForm.artistId && value.length) {
      releaseForm.artistId = value[0].id
    }
  },
  { immediate: true },
)

watch(
  selectedArtistId,
  () => {
    workspacePage.value = 1
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

watch(workspacePageSize, () => {
  workspacePage.value = 1
})

const { data, pending, error, refresh } = useLazyFetch<AdminReleaseWorkspaceResponse>("/api/admin/releases/workspace", {
  query: computed(() => ({
    page: workspacePage.value,
    pageSize: workspacePageSize.value,
    ...(selectedArtistId.value ? { artistId: selectedArtistId.value } : {}),
  })),
  immediate: false,
  watch: false,
})

const releases = computed(() => data.value?.releases ?? [])
const selectedReleaseId = computed(() => {
  const value = route.query.release
  return Array.isArray(value) ? value[0] || "" : typeof value === "string" ? value : ""
})
const selectedRelease = computed(() => releases.value.find((release) => release.id === selectedReleaseId.value) ?? null)
const pendingRequests = computed(() => data.value?.pendingRequests ?? [])
const pendingRequestExpandedRowIds = computed(() => pendingRequests.value.map((request) => request.id))
const workspacePagination = computed(() => data.value?.pagination ?? {
  page: workspacePage.value,
  pageSize: workspacePageSize.value,
  totalCount: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
})
const pendingRequestColumns = [
  { key: "request", label: "Request", accessor: (row: any) => row.requestType },
  { key: "requester", label: "Requester", accessor: (row: any) => row.requesterArtistName },
  { key: "created", label: "Created", accessor: (row: any) => row.createdAt },
  { key: "tracks", label: "Snapshot tracks", align: "right" as const, accessor: (row: any) => row.snapshot.tracks.length },
  { key: "credits", label: "Snapshot credits", align: "right" as const, accessor: (row: any) => row.snapshot.credits.length },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
]
const visibleTrackCount = computed(() => releases.value.reduce((sum, release) => sum + release.tracks.length, 0))
const workspaceSummary = computed(() => {
  const totalCount = workspacePagination.value.totalCount

  if (!totalCount) {
    return "No releases in this workspace filter."
  }

  const from = (workspacePagination.value.page - 1) * workspacePagination.value.pageSize + 1
  const to = Math.min(workspacePagination.value.page * workspacePagination.value.pageSize, totalCount)
  return `Showing ${from}-${to} of ${totalCount} releases`
})
const releaseFolders = computed(() => releases.value.map((release) => ({
  label: release.title || "Untitled release",
  value: release.id,
  icon: release.title.slice(0, 1).toUpperCase() || "R",
  imageUrl: releaseDrafts[release.id]?.coverArtUrl || releaseCoverArtUrl(release),
  meta: `${release.artistName || "Unknown artist"} / ${release.tracks.length} track${release.tracks.length === 1 ? "" : "s"}`,
  badge: release.currentRequest ? "Request" : formatStatusLabel(release.displayStatus),
  tone: release.displayStatus === "live"
    ? "accent" as const
    : release.displayStatus === "deleted" || release.displayStatus === "rejected"
      ? "danger" as const
      : release.currentRequest || release.displayStatus === "pending_review" || release.displayStatus === "scheduled"
        ? "alt" as const
        : "default" as const,
})))
const selectedReleaseFolderId = computed({
  get: () => selectedRelease.value?.id || "",
  set: (value: string) => {
    openReleaseDetails(value)
  },
})

const releaseDetailTabs = computed(() => {
  const release = selectedRelease.value

  return [
    { label: "Overview/Edit", value: "overview" },
    { label: "Tracks", value: "tracks", badge: release?.tracks.length ?? 0 },
    { label: "Splits", value: "splits", badge: release?.splitHistory.length ?? 0 },
    { label: "Requests", value: "requests", badge: release?.currentRequest ? "1" : "" },
    { label: "Timeline", value: "timeline", badge: release?.events.length ?? 0 },
  ]
})

watch(selectedReleaseId, () => {
  activeReleaseDetailTab.value = "overview"
})

watch([releases, selectedReleaseId], ([items, releaseId]) => {
  if (releaseId && items.length && !items.some((release) => release.id === releaseId)) {
    closeReleaseDetails()
  }
})

function openReleaseDetails(releaseId: string) {
  if (!releaseId) {
    return
  }

  void router.push({
    query: {
      ...route.query,
      release: releaseId,
    },
  })
}

function closeReleaseDetails() {
  const { release: _release, ...query } = route.query
  void router.push({ query })
}

watch(
  [selectedArtistId, workspacePage, workspacePageSize],
  () => {
    void refresh()
  },
  { immediate: true },
)

watch(
  () => data.value?.pagination?.page,
  (value) => {
    if (typeof value === "number" && value !== workspacePage.value) {
      workspacePage.value = value
    }
  },
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
        coverArtUrl: release.submission?.status === "pending_review"
          ? release.submission.finalCoverArtUrl ?? release.submission.sourceCoverArtUrl ?? ""
          : release.coverArtUrl ?? "",
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
        newTrackDrafts[release.id] = blankTrackCreateDraft(release.id, nextTrackNumberValue(release.tracks))
      } else {
        newTrackDrafts[release.id].releaseId = release.id
        if (isBlankTrackCreateDraft(newTrackDrafts[release.id])) {
          newTrackDrafts[release.id].trackNumber = nextTrackNumberValue(release.tracks)
        }
      }

      if (requestNotes[release.id] === undefined) {
        requestNotes[release.id] = ""
      }

      if (release.submission && submissionReviewNotes[release.submission.id] === undefined) {
        submissionReviewNotes[release.submission.id] = release.submission.adminNotes ?? ""
      }

      for (const track of release.tracks) {
        trackDrafts[track.id] = {
          title: track.title,
          isrc: track.isrc,
          trackNumber: track.trackNumber === null ? "" : String(track.trackNumber),
          audioPreviewUrl: release.submission?.status === "pending_review"
            ? track.finalAudioUrl ?? track.sourceAudioUrl ?? ""
            : track.audioPreviewUrl ?? "",
          lyrics: track.lyrics ?? "",
          tiktokPreviewStartSeconds: track.tiktokPreviewStartSeconds === null ? "" : String(track.tiktokPreviewStartSeconds),
          versionLine: track.versionLine ?? "Original",
          containsAiGeneratedElements: track.containsAiGeneratedElements,
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

async function confirmEditorRemoval(title: string, description: string, confirmLabel: string) {
  return await confirmAction({
    title,
    description,
    confirmLabel,
    variant: "destructive",
  })
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
  releaseForm.tracks.push(blankTrackCreateDraft("", nextTrackNumberValue(releaseForm.tracks)))
}

async function removeCreateTrack(index: number) {
  const track = releaseForm.tracks[index]
  const trackLabel = track?.title.trim() || `Track ${index + 1}`
  const confirmed = await confirmEditorRemoval(
    "Remove draft track",
    releaseForm.tracks.length === 1
      ? `Reset ${trackLabel} to a blank draft row? A release needs at least one track row.`
      : `Remove ${trackLabel} from this release draft?`,
    releaseForm.tracks.length === 1 ? "Reset track" : "Remove track",
  )

  if (!confirmed) {
    return
  }

  if (releaseForm.tracks.length === 1) {
    releaseForm.tracks.splice(0, 1, blankTrackCreateDraft("", "1"))
    return
  }

  releaseForm.tracks.splice(index, 1)
}

function addCreateTrackCredit(index: number) {
  releaseForm.tracks[index]?.credits.push(blankCreditDraft())
}

async function removeCreateTrackCredit(trackIndex: number, creditIndex: number) {
  const credits = releaseForm.tracks[trackIndex]?.credits

  if (!credits) {
    return
  }

  const credit = credits[creditIndex]
  const confirmed = await confirmEditorRemoval(
    "Remove credit row",
    `Remove ${credit?.creditedName.trim() || `credit ${creditIndex + 1}`} from this draft track?`,
    credits.length === 1 ? "Reset credit" : "Remove credit",
  )

  if (!confirmed) {
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

async function removeTrackCredit(trackId: string, creditIndex: number) {
  const credits = trackCreditDrafts[trackId] ?? []
  const credit = credits[creditIndex]
  const confirmed = await confirmEditorRemoval(
    "Remove track credit",
    `Remove ${credit?.creditedName.trim() || `credit ${creditIndex + 1}`} from this track editor? Save credits to apply the change.`,
    credits.length <= 1 ? "Reset credit" : "Remove credit",
  )

  if (!confirmed) {
    return
  }

  if (credits.length <= 1) {
    trackCreditDrafts[trackId] = [blankCreditDraft()]
    return
  }

  credits.splice(creditIndex, 1)
}

function addReleaseSplitContributor(releaseId: string) {
  ;(releaseSplitDrafts[releaseId] ??= blankSplitDraft()).contributors.push(blankSplitContributor())
}

async function removeReleaseSplitContributor(releaseId: string, contributorIndex: number) {
  const contributors = releaseSplitDrafts[releaseId]?.contributors ?? []
  const contributor = contributors[contributorIndex]
  const artistName = artists.value.find((artist) => artist.id === contributor?.artistId)?.name
  const confirmed = await confirmEditorRemoval(
    "Remove split contributor",
    `Remove ${artistName || contributor?.role || `contributor ${contributorIndex + 1}`} from this release split draft?`,
    contributors.length <= 1 ? "Reset row" : "Remove row",
  )

  if (!confirmed) {
    return
  }

  if (contributors.length <= 1) {
    releaseSplitDrafts[releaseId].contributors = [blankSplitContributor()]
    return
  }

  contributors.splice(contributorIndex, 1)
}

function addTrackSplitContributor(trackId: string) {
  ;(trackSplitDrafts[trackId] ??= blankSplitDraft()).contributors.push(blankSplitContributor())
}

async function removeTrackSplitContributor(trackId: string, contributorIndex: number) {
  const contributors = trackSplitDrafts[trackId]?.contributors ?? []
  const contributor = contributors[contributorIndex]
  const artistName = artists.value.find((artist) => artist.id === contributor?.artistId)?.name
  const confirmed = await confirmEditorRemoval(
    "Remove split contributor",
    `Remove ${artistName || contributor?.role || `contributor ${contributorIndex + 1}`} from this track split draft?`,
    contributors.length <= 1 ? "Reset row" : "Remove row",
  )

  if (!confirmed) {
    return
  }

  if (contributors.length <= 1) {
    trackSplitDrafts[trackId].contributors = [blankSplitContributor()]
    return
  }

  contributors.splice(contributorIndex, 1)
}

async function importCatalogFile() {
  const artistId = selectedArtistId.value || releaseForm.artistId

  if (!artistId) {
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
    const result = await $fetch("/api/admin/releases/bulk-import", {
      method: "POST",
      body: {
        artistId,
        filename: catalogFile.value.name,
        csvText,
      },
    }) as BulkCatalogImportResponse

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
    const artistId = releaseForm.artistId

    await $fetch("/api/admin/releases", {
      method: "POST",
      body: {
        artistId,
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
          lyrics: toNullableText(track.lyrics),
          tiktokPreviewStartSeconds: toNullableInteger(track.tiktokPreviewStartSeconds),
          versionLine: toNullableText(track.versionLine),
          containsAiGeneratedElements: track.containsAiGeneratedElements,
          status: track.status,
          credits: buildCreditInputs(track.credits, track.title || "Track"),
        })),
      } satisfies CreateReleaseInput,
    })

    Object.assign(releaseForm, blankCreateReleaseDraft(artistId || artists.value[0]?.id || ""))
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
        lyrics: toNullableText(draft.lyrics),
        tiktokPreviewStartSeconds: toNullableInteger(draft.tiktokPreviewStartSeconds),
        versionLine: toNullableText(draft.versionLine),
        containsAiGeneratedElements: draft.containsAiGeneratedElements,
        status: draft.status,
        credits: buildCreditInputs(draft.credits, draft.title || "Track"),
      } satisfies CreateTrackInput,
    })

    await refresh()
    const refreshedRelease = releases.value.find((release) => release.id === releaseId)
    newTrackDrafts[releaseId] = blankTrackCreateDraft(releaseId, nextTrackNumberValue(refreshedRelease?.tracks ?? []))
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
        lyrics: toNullableText(draft.lyrics),
        tiktokPreviewStartSeconds: toNullableInteger(draft.tiktokPreviewStartSeconds),
        versionLine: toNullableText(draft.versionLine),
        containsAiGeneratedElements: draft.containsAiGeneratedElements,
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
  const confirmed = await confirmAction({
    title: "Delete release",
    description: `Delete "${releaseTitle}" from the active catalog? Historical earnings data will stay preserved.`,
    confirmLabel: "Delete release",
    variant: "destructive",
  })

  if (!confirmed) {
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

  const confirmed = await confirmAction({
    title: "Delete track",
    description: `Delete "${trackTitle}" from this draft release?`,
    confirmLabel: "Delete track",
    variant: "destructive",
  })

  if (!confirmed) {
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
  const confirmed = await confirmAction({
    title: action === "approve" ? "Approve release request" : "Reject release request",
    description: action === "approve"
      ? "Approve this artist request and apply the submitted catalog changes?"
      : "Reject this artist request? The submitted catalog changes will not be applied.",
    confirmLabel: action === "approve" ? "Approve request" : "Reject request",
    variant: action === "reject" ? "destructive" : "default",
  })

  if (!confirmed) {
    return
  }

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

async function approveSubmission(release: AdminReleaseRecord) {
  if (!release.submission) {
    pageError.value = "This release does not have a pending artist submission."
    pageSuccess.value = ""
    return
  }

  const confirmed = await confirmAction({
    title: "Approve release submission",
    description: `Approve "${release.title}" and schedule it with the reviewed metadata and assets?`,
    confirmLabel: "Approve submission",
    variant: "default",
  })

  if (!confirmed) {
    return
  }

  submissionActing[release.submission.id] = true
  resetMessages()

  try {
    const draft = releaseDrafts[release.id]

    await $fetch(`/api/admin/releases/submissions/${release.submission.id}/approve`, {
      method: "POST",
      body: {
        title: draft.title,
        type: draft.type,
        genre: draft.genre,
        upc: toNullableText(draft.upc),
        coverArtUrl: toNullableText(draft.coverArtUrl),
        streamingLink: toNullableText(draft.streamingLink),
        releaseDate: toNullableText(draft.releaseDate),
        adminNotes: toNullableText(submissionReviewNotes[release.submission.id]),
        tracks: release.tracks.map((track) => {
          const trackDraft = trackDrafts[track.id]

          return {
            trackId: track.id,
            title: trackDraft.title,
            isrc: trackDraft.isrc,
            trackNumber: trackDraft.trackNumber === "" ? null : Number(trackDraft.trackNumber),
            audioPreviewUrl: toNullableText(trackDraft.audioPreviewUrl),
            lyrics: toNullableText(trackDraft.lyrics),
            tiktokPreviewStartSeconds: toNullableInteger(trackDraft.tiktokPreviewStartSeconds),
            versionLine: toNullableText(trackDraft.versionLine),
            containsAiGeneratedElements: trackDraft.containsAiGeneratedElements,
          }
        }),
      },
    })

    await refresh()
    setSuccess("Release submission approved and scheduled.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to approve the release submission.")
  } finally {
    submissionActing[release.submission.id] = false
  }
}

async function rejectSubmission(release: AdminReleaseRecord) {
  if (!release.submission) {
    pageError.value = "This release does not have a pending artist submission."
    pageSuccess.value = ""
    return
  }

  const confirmed = await confirmAction({
    title: "Reject release submission",
    description: `Reject "${release.title}"? The artist will need to revise and submit again.`,
    confirmLabel: "Reject submission",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  submissionActing[release.submission.id] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/releases/submissions/${release.submission.id}/reject`, {
      method: "POST",
      body: {
        adminNotes: toNullableText(submissionReviewNotes[release.submission.id]),
      },
    })

    await refresh()
    setSuccess("Release submission rejected.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to reject the release submission.")
  } finally {
    submissionActing[release.submission.id] = false
  }
}

async function publishRelease(releaseId: string) {
  const release = releases.value.find((item) => item.id === releaseId)
  const confirmed = await confirmAction({
    title: "Publish release",
    description: `Publish "${release?.title || "this release"}" to the live catalog now?`,
    confirmLabel: "Publish release",
    variant: "default",
  })

  if (!confirmed) {
    return
  }

  releasePublishing[releaseId] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/releases/${releaseId}/publish`, {
      method: "POST",
    })

    await refresh()
    setSuccess("Release published.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to publish the release.")
  } finally {
    releasePublishing[releaseId] = false
  }
}

const summaryMetrics = computed(() => [
  {
    label: "Workspace releases",
    value: String(workspacePagination.value.totalCount),
    footnote: `${workspaceSummary.value}. Page ${workspacePagination.value.page} of ${workspacePagination.value.totalPages}.`,
    tone: "accent" as const,
  },
  {
    label: "Loaded tracks",
    value: String(visibleTrackCount.value),
    footnote: "Tracks nested under the releases currently loaded on this page.",
    tone: "default" as const,
  },
  {
    label: "Pending requests",
    value: String(pendingRequests.value.length),
    footnote: "Artist draft edits and takedown requests awaiting review.",
    tone: "alt" as const,
  },
])

const activeReleaseSection = ref("workspace")

const releaseSections = computed(() => [
  {
    label: "Workspace",
    value: "workspace",
    badge: workspacePagination.value.totalCount,
  },
  {
    label: "Create",
    value: "create",
  },
  {
    label: "Requests",
    value: "requests",
    badge: pendingRequests.value.length,
  },
  {
    label: "Import",
    value: "import",
  },
])

const releaseSectionFolders = computed(() => releaseSections.value.map((section) => ({
  ...section,
  icon: section.label.slice(0, 1),
  meta: section.value === "workspace"
    ? "Thumbnail catalog editor"
    : section.value === "create"
      ? "Draft a new release"
      : section.value === "requests"
        ? "Approval queue"
        : "Bulk CSV tools",
  tone: section.value === "workspace" ? "accent" as const : section.value === "requests" ? "alt" as const : "default" as const,
})))
</script>

<template>
  <div class="page">
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

    <WorkspaceFolderGrid
      v-model="activeReleaseSection"
      :items="releaseSectionFolders"
      label="Release workspace sections"
    />

    <DataPanel
      title="Lifecycle rules"
      eyebrow="Catalog model"
      description="Releases now move through draft, live, taken down, and deleted states. Splits are versioned with effective months, credits are separate from splits, and artist edits route through the request queue."
    >
      <div class="form-grid">
        <AppAlert v-if="pageError" variant="destructive">{{ pageError }}</AppAlert>
        <AppAlert v-if="pageSuccess" variant="success">{{ pageSuccess }}</AppAlert>
        <AppAlert v-if="error" variant="destructive">{{ error.statusMessage || "Unable to load the release workspace right now." }}</AppAlert>
      </div>
    </DataPanel>

    <DataPanel
      v-if="activeReleaseSection === 'create'"
      title="Draft Release"
      eyebrow="Create"
      description="Build a release with genre, initial tracks, and per-track credits in one submission. New releases default to draft until you intentionally push them live."
    >
      <div class="catalog-grid catalog-grid-wide">
        <div class="field-row">
          <label for="release-artist">Artist</label>
          <NativeSelect id="release-artist" v-model="releaseForm.artistId">
            <option disabled value="">Select artist</option>
            <option v-for="artist in artists" :key="artist.id" :value="artist.id">
              {{ artist.name }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="release-title">Title</label>
          <Input id="release-title" v-model="releaseForm.title" type="text" />
        </div>

        <div class="field-row">
          <label for="release-type">Type</label>
          <NativeSelect id="release-type" v-model="releaseForm.type">
            <option value="single">Single</option>
            <option value="ep">EP</option>
            <option value="album">Album</option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="release-status">Status</label>
          <NativeSelect id="release-status" v-model="releaseForm.status">
            <option value="draft">Draft</option>
            <option value="live">Live</option>
            <option value="taken_down">Taken down</option>
            <option value="deleted">Deleted</option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="release-genre">Genre</label>
          <NativeSelect id="release-genre" v-model="releaseForm.genre">
            <option v-for="genre in RELEASE_GENRE_OPTIONS" :key="genre" :value="genre">{{ genre }}</option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="release-upc">UPC</label>
          <Input id="release-upc" v-model="releaseForm.upc" class="font-mono" type="text" />
        </div>

        <div class="field-row">
          <label for="release-date">Release date</label>
          <AppDatePicker id="release-date" v-model="releaseForm.releaseDate" placeholder="No release date" />
        </div>

        <div class="field-row">
          <label for="release-cover">Cover art URL</label>
          <Input id="release-cover" v-model="releaseForm.coverArtUrl" type="url" />
        </div>

        <div class="field-row">
          <label for="release-link">Streaming link</label>
          <Input id="release-link" v-model="releaseForm.streamingLink" type="url" />
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
          <Card v-for="(track, trackIndex) in releaseForm.tracks" :key="`create-track-${trackIndex}`" size="sm" class="catalog-subitem">
            <div class="catalog-grid catalog-grid-wide">
              <div class="field-row">
                <label :for="`create-track-title-${trackIndex}`">Track title</label>
                <Input :id="`create-track-title-${trackIndex}`" v-model="track.title" type="text" />
              </div>

              <div class="field-row">
                <label :for="`create-track-isrc-${trackIndex}`">ISRC</label>
                <Input :id="`create-track-isrc-${trackIndex}`" v-model="track.isrc" class="font-mono" type="text" />
              </div>

              <div class="field-row">
                <label :for="`create-track-number-${trackIndex}`">Track no.</label>
                <Input :id="`create-track-number-${trackIndex}`" v-model="track.trackNumber" type="number" min="1" />
              </div>

              <div class="field-row">
                <label :for="`create-track-tiktok-${trackIndex}`">TikTok time</label>
                <Input :id="`create-track-tiktok-${trackIndex}`" v-model="track.tiktokPreviewStartSeconds" type="number" min="0" max="3599" />
              </div>

              <div class="field-row">
                <label :for="`create-track-version-${trackIndex}`">Version line</label>
                <Input :id="`create-track-version-${trackIndex}`" v-model="track.versionLine" type="text" />
              </div>

              <div class="field-row">
                <label :for="`create-track-status-${trackIndex}`">Track status</label>
                <NativeSelect :id="`create-track-status-${trackIndex}`" v-model="track.status">
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="deleted">Deleted</option>
                </NativeSelect>
              </div>

              <Label class="field-row checkbox-row">
                <Checkbox v-model="track.containsAiGeneratedElements" />
                <span>Contains AI-generated elements</span>
              </Label>

              <div class="field-row field-row-full">
                <label :for="`create-track-audio-${trackIndex}`">Audio preview URL</label>
                <Input :id="`create-track-audio-${trackIndex}`" v-model="track.audioPreviewUrl" type="url" />
              </div>

              <div class="field-row field-row-full">
                <label :for="`create-track-lyrics-${trackIndex}`">Lyrics</label>
                <Textarea :id="`create-track-lyrics-${trackIndex}`" v-model="track.lyrics" rows="4" />
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
                      <Input :id="`create-credit-name-${trackIndex}-${creditIndex}`" v-model="credit.creditedName" type="text" />
                    </div>

                    <div class="field-row field-row-full">
                      <label>Roles</label>
                      <CreditRoleMultiSelect
                        :input-id="`create-credit-role-search-${trackIndex}-${creditIndex}`"
                        v-model="credit.roleCodes"
                      />
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <Button variant="destructive" @click="removeCreateTrackCredit(trackIndex, creditIndex)">
                      Remove credit
                    </Button>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button variant="secondary" @click="addCreateTrackCredit(trackIndex)">Add credit</Button>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button variant="destructive" @click="removeCreateTrack(trackIndex)">Remove track</Button>
            </div>
          </Card>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" @click="addCreateTrack">Add another track</Button>
        <Button :disabled="isCreatingRelease" @click="createRelease">
          {{ isCreatingRelease ? "Creating..." : "Create release" }}
        </Button>
      </div>
    </DataPanel>

    <DataPanel
      v-if="activeReleaseSection === 'import'"
      title="Catalog Import"
      eyebrow="CSV tools"
      description="The CSV workflow still works for bulk seeding catalog entries. Imported releases inherit the new lifecycle schema from the database defaults."
    >
      <div class="catalog-grid">
        <div class="field-row">
          <label for="catalog-file">Catalog CSV</label>
          <Input id="catalog-file" ref="catalogFileInput" type="file" accept=".csv,text/csv" @change="onCatalogFileChange" />
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button variant="secondary" :disabled="isBulkImporting" @click="importCatalogFile">
          {{ isBulkImporting ? "Importing..." : "Run catalog import" }}
        </Button>
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
    </DataPanel>

    <DataPanel
      v-if="activeReleaseSection === 'requests'"
      title="Pending Requests"
      eyebrow="Review queue"
      description="Artists can edit draft releases and request takedowns, but the change does not apply until an admin reviews it here."
    >
      <DashboardSkeleton v-if="pending && !data" :rows="5" />

      <DataTable
        v-else
        :columns="pendingRequestColumns"
        :data="pendingRequests"
        empty-title="No artist change requests"
        empty-description="No artist change requests are pending right now."
        row-key="id"
        :expanded-row-ids="pendingRequestExpandedRowIds"
      >
        <template #cell-request="{ row: request }">
          <strong>{{ request.requestType === "draft_edit" ? "Draft edit request" : "Takedown request" }}</strong>
          <div class="detail-copy mono">{{ request.releaseId }}</div>
        </template>
        <template #cell-requester="{ row: request }">{{ request.requesterArtistName }}</template>
        <template #cell-created="{ row: request }">{{ formatDateTime(request.createdAt) }}</template>
        <template #cell-tracks="{ row: request }">
          <span class="tabular-nums">{{ request.snapshot.tracks.length }}</span>
        </template>
        <template #cell-credits="{ row: request }">
          <span class="tabular-nums">{{ request.snapshot.credits.length }}</span>
        </template>
        <template #cell-status="{ row: request }">
          <StatusBadge :tone="statusTone(request.status)">{{ formatStatusLabel(request.status) }}</StatusBadge>
        </template>
        <template #expandedRow="{ row: request }">
          <div class="form-grid">
            <div v-if="request.takedownReason" class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Takedown reason</span>
                <strong>{{ request.takedownReason }}</strong>
              </div>
            </div>

            <div class="field-row field-row-full">
              <label :for="`request-note-${request.id}`">Admin notes</label>
              <Textarea :id="`request-note-${request.id}`" v-model="requestNotes[request.id]" rows="3" />
            </div>

            <div class="flex flex-wrap gap-2">
              <Button :disabled="requestActing[request.id]" @click="reviewRequest(request.id, 'approve')">
                {{ requestActing[request.id] ? "Working..." : "Approve and apply" }}
              </Button>
              <Button variant="destructive" :disabled="requestActing[request.id]" @click="reviewRequest(request.id, 'reject')">
                {{ requestActing[request.id] ? "Working..." : "Reject" }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </DataPanel>

    <DataPanel
      v-if="activeReleaseSection === 'workspace'"
      title="Release Workspace"
      eyebrow="Lifecycle"
      description="Edit catalog metadata, schedule split changes by month, keep track credits current, and review the release timeline without collapsing taken down and deleted into the same state."
    >
      <div class="catalog-grid">
        <div class="field-row">
          <label for="workspace-artist-filter">Workspace filter</label>
          <NativeSelect id="workspace-artist-filter" v-model="selectedArtistId">
            <option value="">All artists</option>
            <option v-for="artist in artists" :key="artist.id" :value="artist.id">
              {{ artist.name }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row">
          <label for="workspace-page-size">Releases per page</label>
          <NativeSelect id="workspace-page-size" v-model="workspacePageSize">
            <option v-for="option in WORKSPACE_PAGE_SIZE_OPTIONS" :key="option" :value="option">
              {{ option }}
            </option>
          </NativeSelect>
        </div>

        <div class="field-row field-row-full">
          <div class="summary-copy">
            <strong>{{ workspaceSummary }}</strong>
            <span class="detail-copy">Page {{ workspacePagination.page }} of {{ workspacePagination.totalPages }}</span>
          </div>
        </div>
      </div>

      <AppPagination
        v-if="workspacePagination.totalCount"
        :page="workspacePagination.page"
        :page-size="workspacePagination.pageSize"
        :total-count="workspacePagination.totalCount"
        :total-pages="workspacePagination.totalPages"
        :pending="pending"
        :summary="pending && data ? 'Refreshing this page...' : workspaceSummary"
        aria-label="Release workspace pagination"
        class="mb-4"
        @update:page="workspacePage = $event"
      />

      <DashboardSkeleton v-if="pending && !data" :rows="5" />

      <AppEmptyState
        v-else-if="!releases.length"
        icon="search"
        title="No releases"
        description="No releases exist for this filter yet."
      />

      <template v-else>
      <WorkspaceFolderGrid
        v-model="selectedReleaseFolderId"
        :items="releaseFolders"
        label="Release workspace folders"
      />

      <ReleaseDetailDialog
        v-for="release in selectedRelease ? [selectedRelease] : []"
        :key="`admin-release-modal-${release.id}`"
        :open="Boolean(selectedRelease)"
        :title="release.title"
        eyebrow="Admin release workspace"
        :subtitle="`${release.artistName || 'Unknown artist'} / ${release.type.toUpperCase()} / ${release.genre} / ${release.releaseDate || 'No date'}`"
        :image-url="submissionCoverForReview(release)"
        :fallback="release.title.slice(0, 1).toUpperCase()"
        :tabs="releaseDetailTabs"
        :active-tab="activeReleaseDetailTab"
        @close="closeReleaseDetails"
        @update:active-tab="activeReleaseDetailTab = $event"
      >
        <template #badges>
          <StatusBadge :tone="statusTone(release.displayStatus)">
            {{ formatStatusLabel(release.displayStatus) }}
          </StatusBadge>
          <StatusBadge v-if="release.currentRequest" tone="info">
            Request open
          </StatusBadge>
        </template>

        <template #artActions>
          <Button v-if="release.submission" variant="ghost" size="icon-sm" class="release-detail-art-action-button" as-child>
            <a
              :href="submissionAssetDownloadUrl(release.submission.id, 'cover')"
              aria-label="Download cover art"
            >
              <ImageDown class="size-4" aria-hidden="true" />
            </a>
          </Button>
        </template>

        <Card
          v-if="releaseDrafts[release.id] && releaseSplitDrafts[release.id] && newTrackDrafts[release.id]"
          class="catalog-item release-modal-panel"
        >
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ release.title }}</strong>
              <span class="detail-copy">{{ release.type.toUpperCase() }} / {{ release.genre }} / {{ release.releaseDate || "No date" }}</span>
            </div>
            <StatusBadge :tone="statusTone(release.displayStatus)">
              {{ formatStatusLabel(release.displayStatus) }}
            </StatusBadge>
          </div>

          <section v-if="activeReleaseDetailTab === 'overview' && release.submission" class="submission-review-panel">
            <div class="submission-review-art" @contextmenu.prevent>
              <img
                v-if="submissionCoverForReview(release)"
                :src="submissionCoverForReview(release)"
                :alt="`${release.title} cover art`"
              />
              <div v-else class="submission-review-art-fallback">
                <Palette class="size-6" />
                <span>No cover</span>
              </div>
            </div>

            <div class="submission-review-content">
              <div class="submission-review-header">
                <div class="summary-copy">
                  <span class="eyebrow">Submission review</span>
                  <strong>{{ release.title }}</strong>
                  <span class="detail-copy">
                    {{ formatStatusLabel(release.submission.status) }} / submitted by {{ release.submission.submittedByName || release.submission.artistName || "Artist" }}
                  </span>
                </div>
                <StatusBadge :tone="statusTone(release.submission.status)">
                  {{ formatStatusLabel(release.submission.status) }}
                </StatusBadge>
              </div>

              <div class="submission-review-metrics">
                <div class="submission-review-metric submission-review-metric-primary">
                  <Palette class="size-4" />
                  <span>Genre</span>
                  <strong>{{ releaseDrafts[release.id].genre || release.genre }}</strong>
                </div>
                <div class="submission-review-metric submission-review-metric-info">
                  <ListOrdered class="size-4" />
                  <span>Release date</span>
                  <strong>{{ releaseDrafts[release.id].releaseDate || release.releaseDate || "No date" }}</strong>
                </div>
                <div class="submission-review-metric submission-review-metric-success">
                  <Music2 class="size-4" />
                  <span>Tracks</span>
                  <strong>{{ release.tracks.length }}</strong>
                </div>
                <div class="submission-review-metric submission-review-metric-muted">
                  <UsersRound class="size-4" />
                  <span>Stores</span>
                  <strong>{{ release.submission.targetStores.length }}</strong>
                </div>
              </div>

              <div class="admin-artist-order">
                <div class="admin-artist-order-heading">
                  <UsersRound class="size-4" />
                  <strong>Artist chronology</strong>
                </div>
                <div v-if="releaseArtistChronology(release).length" class="admin-artist-order-list">
                  <div v-for="(artistCredit, artistIndex) in releaseArtistChronology(release)" :key="`release-review-artist-${release.id}-${artistCredit.creditedName}-${artistIndex}`" class="admin-artist-order-row">
                    <span>{{ artistIndex + 1 }}</span>
                    <strong>{{ artistCredit.creditedName }}</strong>
                    <em>{{ artistCredit.roleCodes.join(", ") }}</em>
                  </div>
                </div>
                <span v-else class="detail-copy">No artist credits available.</span>
              </div>

              <div class="summary-table submission-review-table">
                <div class="summary-row">
                  <span class="detail-copy">Stores</span>
                  <strong class="submission-store-logos">
                    <DspLogoList :names="release.submission.targetStores" :max="8" size="sm" />
                  </strong>
                </div>
                <div v-if="release.submission.artistNotes" class="summary-row">
                  <span class="detail-copy">Artist notes</span>
                  <strong>{{ release.submission.artistNotes }}</strong>
                </div>
              </div>

              <div class="asset-action-group asset-action-group-inline">
                <Button v-if="submissionCoverForReview(release)" variant="secondary" size="sm" as-child>
                  <a :href="submissionCoverForReview(release)" target="_blank" rel="noopener noreferrer">
                    <ExternalLink class="size-4" />
                    Open cover
                  </a>
                </Button>
              </div>

              <div class="field-row field-row-full">
                <label :for="`submission-review-notes-${release.submission.id}`">Admin notes</label>
                <Textarea :id="`submission-review-notes-${release.submission.id}`" v-model="submissionReviewNotes[release.submission.id]" rows="3" />
              </div>

              <div v-if="release.submission.status === 'pending_review'" class="submission-review-actions">
                <Button :disabled="submissionActing[release.submission.id]" @click="approveSubmission(release)">
                  {{ submissionActing[release.submission.id] ? "Working..." : "Approve and schedule" }}
                </Button>
                <Button variant="destructive" :disabled="submissionActing[release.submission.id]" @click="rejectSubmission(release)">
                  {{ submissionActing[release.submission.id] ? "Working..." : "Reject submission" }}
                </Button>
              </div>

              <div v-else-if="release.displayStatus === 'scheduled'" class="submission-review-actions">
                <Button :disabled="releasePublishing[release.id]" @click="publishRelease(release.id)">
                  {{ releasePublishing[release.id] ? "Publishing..." : "Publish live" }}
                </Button>
              </div>
            </div>
          </section>

          <CollapsiblePanel
            v-if="activeReleaseDetailTab === 'overview'"
            title="Finalize release metadata"
            description="Title, genre, UPC, cover URL, link, and release status"
            :default-open="!release.submission"
            class="admin-edit-disclosure"
            content-class="admin-edit-disclosure-content"
          >
            <div class="catalog-grid catalog-grid-wide">
              <div class="field-row">
                <label :for="`release-title-${release.id}`">Title</label>
                <Input :id="`release-title-${release.id}`" v-model="releaseDrafts[release.id].title" type="text" />
              </div>

              <div class="field-row">
                <label :for="`release-type-${release.id}`">Type</label>
                <NativeSelect :id="`release-type-${release.id}`" v-model="releaseDrafts[release.id].type">
                  <option value="single">Single</option>
                  <option value="ep">EP</option>
                  <option value="album">Album</option>
                </NativeSelect>
              </div>

              <div class="field-row">
                <label :for="`release-genre-${release.id}`">Genre</label>
                <NativeSelect :id="`release-genre-${release.id}`" v-model="releaseDrafts[release.id].genre">
                  <option v-for="genre in RELEASE_GENRE_OPTIONS" :key="genre" :value="genre">{{ genre }}</option>
                </NativeSelect>
              </div>

              <div class="field-row">
                <label :for="`release-status-${release.id}`">Status</label>
                <NativeSelect :id="`release-status-${release.id}`" v-model="releaseDrafts[release.id].status">
                  <option value="draft">Draft</option>
                  <option value="live">Live</option>
                  <option value="taken_down">Taken down</option>
                  <option value="deleted">Deleted</option>
                </NativeSelect>
              </div>

              <div class="field-row">
                <label :for="`release-upc-${release.id}`">UPC</label>
                <Input :id="`release-upc-${release.id}`" v-model="releaseDrafts[release.id].upc" class="font-mono" type="text" />
              </div>

              <div class="field-row">
                <label :for="`release-date-${release.id}`">Release date</label>
                <AppDatePicker :id="`release-date-${release.id}`" v-model="releaseDrafts[release.id].releaseDate" placeholder="No release date" />
              </div>

              <div class="field-row">
                <label :for="`release-cover-${release.id}`">Cover art URL</label>
                <Input :id="`release-cover-${release.id}`" v-model="releaseDrafts[release.id].coverArtUrl" type="url" />
              </div>

              <div class="field-row">
                <label :for="`release-link-${release.id}`">Streaming link</label>
                <Input :id="`release-link-${release.id}`" v-model="releaseDrafts[release.id].streamingLink" type="url" />
              </div>
            </div>
          </CollapsiblePanel>

      <div v-if="activeReleaseDetailTab === 'overview'" class="flex flex-wrap gap-2">
        <CopyableLink v-if="releaseDrafts[release.id].streamingLink" :url="releaseDrafts[release.id].streamingLink" />
        <Button variant="secondary" :disabled="releaseSaving[release.id]" @click="saveRelease(release.id)">
          {{ releaseSaving[release.id] ? "Saving..." : "Save release" }}
        </Button>
        <Button
          variant="destructive"
          :disabled="releaseSaving[release.id] || release.status === 'deleted'"
          @click="deleteRelease(release.id, release.title)"
        >
          {{ release.status === "deleted" ? "Release deleted" : "Delete release" }}
        </Button>
      </div>

          <div v-if="activeReleaseDetailTab === 'overview' && release.takedownReason" class="summary-table">
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

          <div v-if="activeReleaseDetailTab === 'requests'" class="catalog-track-list">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Release request</strong>
                <span class="detail-copy">Review open artist change requests without leaving the release workspace.</span>
              </div>
            </div>

            <Card v-if="release.currentRequest" size="sm" class="catalog-subitem">
              <div class="catalog-header">
                <div class="summary-copy">
                  <strong>{{ release.currentRequest.requestType === "draft_edit" ? "Draft edit request" : "Takedown request" }}</strong>
                  <span class="detail-copy">{{ release.currentRequest.requesterArtistName }} on {{ formatDateTime(release.currentRequest.createdAt) }}</span>
                </div>
                <StatusBadge :tone="statusTone(release.currentRequest.status)">{{ formatStatusLabel(release.currentRequest.status) }}</StatusBadge>
              </div>

              <div class="summary-table">
                <div class="summary-row">
                  <span class="detail-copy">Snapshot tracks</span>
                  <strong>{{ release.currentRequest.snapshot.tracks.length }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Snapshot credits</span>
                  <strong>{{ release.currentRequest.snapshot.credits.length }}</strong>
                </div>
                <div v-if="release.currentRequest.takedownReason" class="summary-row">
                  <span class="detail-copy">Takedown reason</span>
                  <strong>{{ release.currentRequest.takedownReason }}</strong>
                </div>
              </div>

              <div class="field-row field-row-full">
                <label :for="`release-request-note-${release.currentRequest.id}`">Admin notes</label>
                <Textarea :id="`release-request-note-${release.currentRequest.id}`" v-model="requestNotes[release.currentRequest.id]" rows="3" />
              </div>

              <div class="flex flex-wrap gap-2">
                <Button :disabled="requestActing[release.currentRequest.id]" @click="reviewRequest(release.currentRequest.id, 'approve')">
                  {{ requestActing[release.currentRequest.id] ? "Working..." : "Approve and apply" }}
                </Button>
                <Button variant="destructive" :disabled="requestActing[release.currentRequest.id]" @click="reviewRequest(release.currentRequest.id, 'reject')">
                  {{ requestActing[release.currentRequest.id] ? "Working..." : "Reject" }}
                </Button>
              </div>
            </Card>

            <AppEmptyState
              v-else
              compact
              icon="file"
              title="No artist change request"
              description="No artist change request is open for this release."
              class="border-0 bg-transparent shadow-none"
            />
          </div>

          <div v-if="activeReleaseDetailTab === 'splits'" class="catalog-track-list">
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
                  <AppMonthPicker :id="`release-split-month-${release.id}`" v-model="releaseSplitDrafts[release.id].effectivePeriodMonth" required />
                </div>

                <div class="field-row field-row-full">
                  <label :for="`release-split-reason-${release.id}`">Change reason</label>
                  <Input :id="`release-split-reason-${release.id}`" v-model="releaseSplitDrafts[release.id].changeReason" type="text" />
                </div>
              </div>

              <div class="catalog-subitems">
                <div v-for="(contributor, contributorIndex) in releaseSplitDrafts[release.id].contributors" :key="`release-split-${release.id}-${contributorIndex}`" class="catalog-subitem catalog-subitem-compact">
                  <div class="catalog-grid catalog-grid-wide">
                    <div class="field-row">
                      <label :for="`release-split-artist-${release.id}-${contributorIndex}`">Artist</label>
                      <NativeSelect :id="`release-split-artist-${release.id}-${contributorIndex}`" v-model="contributor.artistId">
                        <option value="">Select artist</option>
                        <option v-for="artist in artists" :key="artist.id" :value="artist.id">{{ artist.name }}</option>
                      </NativeSelect>
                    </div>

                    <div class="field-row">
                      <label :for="`release-split-role-${release.id}-${contributorIndex}`">Role</label>
                      <Input :id="`release-split-role-${release.id}-${contributorIndex}`" v-model="contributor.role" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`release-split-pct-${release.id}-${contributorIndex}`">Split %</label>
                      <Input :id="`release-split-pct-${release.id}-${contributorIndex}`" v-model="contributor.splitPct" type="number" min="0" max="100" step="0.01" />
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <Button variant="destructive" @click="removeReleaseSplitContributor(release.id, contributorIndex)">
                      Remove row
                    </Button>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button variant="secondary" @click="addReleaseSplitContributor(release.id)">Add contributor</Button>
                <Button :disabled="releaseSplitSaving[release.id]" @click="saveReleaseSplit(release.id)">
                  {{ releaseSplitSaving[release.id] ? "Saving..." : "Save split version" }}
                </Button>
              </div>
            </div>
          </div>

          <div v-if="activeReleaseDetailTab === 'tracks'" class="catalog-track-list">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Tracks</strong>
                <span class="detail-copy">Tracks keep their own credits and may optionally override the release split map with track-specific split versions.</span>
              </div>
            </div>

            <div class="catalog-subitems">
              <template v-for="track in release.tracks" :key="track.id">
              <Card
                v-if="trackDrafts[track.id] && trackCreditDrafts[track.id] && trackSplitDrafts[track.id]"
                size="sm"
                class="catalog-subitem"
              >
                <div class="catalog-header">
                  <div class="summary-copy">
                    <strong>{{ track.trackNumber ? `${track.trackNumber}. ` : "" }}{{ track.title }}</strong>
                    <span class="detail-copy mono">{{ track.isrc }}</span>
                  </div>
                  <StatusBadge :tone="statusTone(track.status)">{{ formatStatusLabel(track.status) }}</StatusBadge>
                </div>

                <div class="admin-track-review-card">
                  <div class="admin-track-review-main">
                    <span class="admin-track-number">
                      <Music2 class="size-4" />
                      {{ track.trackNumber || "-" }}
                    </span>
                    <div class="summary-copy">
                      <strong>{{ track.title }}</strong>
                      <span class="detail-copy mono">{{ track.isrc || "No ISRC" }}</span>
                      <span class="detail-copy">{{ formatTiktokPreviewTime(track.tiktokPreviewStartSeconds) }}</span>
                      <span class="detail-copy">{{ track.versionLine || "Original" }} / {{ track.containsAiGeneratedElements ? "AI elements" : "No AI elements" }}</span>
                    </div>
                    <span v-if="reviewAudioUrl(track)" class="asset-action-group">
                      <Button variant="secondary" size="sm" as-child>
                        <a :href="reviewAudioUrl(track)" target="_blank" rel="noopener noreferrer">
                          <ExternalLink class="size-4" />
                          Open audio
                        </a>
                      </Button>
                      <Button v-if="release.submission" size="sm" as-child>
                        <a :href="submissionAssetDownloadUrl(release.submission.id, 'audio', track.id)">
                          <Download class="size-4" />
                          Download audio
                        </a>
                      </Button>
                    </span>
                  </div>

                  <div class="admin-credit-review-grid">
                    <div v-for="lane in creditReviewLanes" :key="`track-review-${track.id}-${lane.value}`" :class="creditLaneClass(lane.value)">
                      <strong>{{ lane.label }}</strong>
                      <span>{{ creditLaneSummary(track, lane.value) }}</span>
                    </div>
                  </div>

                  <CollapsiblePanel
                    :title="track.lyrics ? 'Lyrics provided' : 'No lyrics provided'"
                    class="admin-track-lyrics-review"
                    content-class="admin-track-lyrics-review-content"
                  >
                    <p>{{ track.lyrics || "This track does not include lyrics yet." }}</p>
                  </CollapsiblePanel>
                </div>

                <CollapsiblePanel
                  title="Edit track metadata"
                  description="Title, ISRC, order, TikTok time, status, audio URL, and lyrics"
                  class="admin-edit-disclosure"
                  content-class="admin-edit-disclosure-content"
                >
                  <div class="catalog-grid catalog-grid-wide">
                    <div class="field-row">
                      <label :for="`track-title-${track.id}`">Track title</label>
                      <Input :id="`track-title-${track.id}`" v-model="trackDrafts[track.id].title" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`track-isrc-${track.id}`">ISRC</label>
                      <Input :id="`track-isrc-${track.id}`" v-model="trackDrafts[track.id].isrc" class="font-mono" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`track-number-${track.id}`">Track no.</label>
                      <Input :id="`track-number-${track.id}`" v-model="trackDrafts[track.id].trackNumber" type="number" min="1" />
                    </div>

                    <div class="field-row">
                      <label :for="`track-tiktok-${track.id}`">TikTok time</label>
                      <Input :id="`track-tiktok-${track.id}`" v-model="trackDrafts[track.id].tiktokPreviewStartSeconds" type="number" min="0" max="3599" />
                    </div>

                    <div class="field-row">
                      <label :for="`track-version-${track.id}`">Version line</label>
                      <Input :id="`track-version-${track.id}`" v-model="trackDrafts[track.id].versionLine" type="text" />
                    </div>

                    <div class="field-row">
                      <label :for="`track-status-${track.id}`">Status</label>
                      <NativeSelect :id="`track-status-${track.id}`" v-model="trackDrafts[track.id].status">
                        <option value="draft">Draft</option>
                        <option value="live">Live</option>
                        <option value="deleted">Deleted</option>
                      </NativeSelect>
                    </div>

                    <Label class="field-row checkbox-row">
                      <Checkbox v-model="trackDrafts[track.id].containsAiGeneratedElements" />
                      <span>Contains AI-generated elements</span>
                    </Label>

                    <div class="field-row field-row-full">
                      <label :for="`track-audio-${track.id}`">Audio preview URL</label>
                      <Input :id="`track-audio-${track.id}`" v-model="trackDrafts[track.id].audioPreviewUrl" type="url" />
                    </div>

                    <div class="field-row field-row-full">
                      <label :for="`track-lyrics-${track.id}`">Lyrics</label>
                      <Textarea :id="`track-lyrics-${track.id}`" v-model="trackDrafts[track.id].lyrics" rows="5" />
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    <Button variant="secondary" :disabled="trackSaving[track.id]" @click="saveTrack(track.id)">
                      {{ trackSaving[track.id] ? "Saving..." : "Save track" }}
                    </Button>
                    <Button
                      variant="destructive"
                      :disabled="trackSaving[track.id] || track.status === 'deleted'"
                      @click="deleteTrack(track.id, release.status, track.title)"
                    >
                      {{ track.status === "deleted" ? "Track deleted" : "Delete track" }}
                    </Button>
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel
                  title="Edit track credits"
                  description="Artist, writer, and additional credits"
                  class="admin-edit-disclosure admin-edit-disclosure-credits"
                  content-class="admin-edit-disclosure-content"
                >
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
                          <Input :id="`track-credit-name-${track.id}-${creditIndex}`" v-model="credit.creditedName" type="text" />
                        </div>

                        <div class="field-row field-row-full">
                          <label>Roles</label>
                          <CreditRoleMultiSelect
                            :input-id="`track-credit-role-search-${track.id}-${creditIndex}`"
                            v-model="credit.roleCodes"
                          />
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <Button variant="destructive" @click="removeTrackCredit(track.id, creditIndex)">
                          Remove credit
                        </Button>
                      </div>
                    </div>
                  </div>

                    <div class="flex flex-wrap gap-2">
                      <Button variant="secondary" @click="addTrackCredit(track.id)">Add credit</Button>
                      <Button :disabled="trackCreditSaving[track.id]" @click="saveTrackCredits(track.id)">
                        {{ trackCreditSaving[track.id] ? "Saving..." : "Save credits" }}
                      </Button>
                    </div>
                  </div>
                </CollapsiblePanel>

                <CollapsiblePanel
                  title="Track split history"
                  description="Track-specific payout split changes"
                  class="admin-edit-disclosure"
                  content-class="admin-edit-disclosure-content"
                >
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
                        <AppMonthPicker :id="`track-split-month-${track.id}`" v-model="trackSplitDrafts[track.id].effectivePeriodMonth" required />
                      </div>

                      <div class="field-row field-row-full">
                        <label :for="`track-split-reason-${track.id}`">Change reason</label>
                        <Input :id="`track-split-reason-${track.id}`" v-model="trackSplitDrafts[track.id].changeReason" type="text" />
                      </div>
                    </div>

                    <div class="catalog-subitems">
                      <div v-for="(contributor, contributorIndex) in trackSplitDrafts[track.id].contributors" :key="`track-split-${track.id}-${contributorIndex}`" class="catalog-subitem catalog-subitem-compact">
                        <div class="catalog-grid catalog-grid-wide">
                          <div class="field-row">
                            <label :for="`track-split-artist-${track.id}-${contributorIndex}`">Artist</label>
                            <NativeSelect :id="`track-split-artist-${track.id}-${contributorIndex}`" v-model="contributor.artistId">
                              <option value="">Select artist</option>
                              <option v-for="artist in artists" :key="artist.id" :value="artist.id">{{ artist.name }}</option>
                            </NativeSelect>
                          </div>

                          <div class="field-row">
                            <label :for="`track-split-role-${track.id}-${contributorIndex}`">Role</label>
                            <Input :id="`track-split-role-${track.id}-${contributorIndex}`" v-model="contributor.role" type="text" />
                          </div>

                          <div class="field-row">
                            <label :for="`track-split-pct-${track.id}-${contributorIndex}`">Split %</label>
                            <Input :id="`track-split-pct-${track.id}-${contributorIndex}`" v-model="contributor.splitPct" type="number" min="0" max="100" step="0.01" />
                          </div>
                        </div>

                        <div class="flex flex-wrap gap-2">
                          <Button variant="destructive" @click="removeTrackSplitContributor(track.id, contributorIndex)">
                            Remove row
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <Button variant="secondary" @click="addTrackSplitContributor(track.id)">Add contributor</Button>
                      <Button :disabled="trackSplitSaving[track.id]" @click="saveTrackSplit(track.id)">
                        {{ trackSplitSaving[track.id] ? "Saving..." : "Save track split version" }}
                      </Button>
                    </div>
                  </div>
                </div>
                </CollapsiblePanel>
              </Card>
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
                  <Input :id="`new-track-title-${release.id}`" v-model="newTrackDrafts[release.id].title" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`new-track-isrc-${release.id}`">ISRC</label>
                  <Input :id="`new-track-isrc-${release.id}`" v-model="newTrackDrafts[release.id].isrc" class="font-mono" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`new-track-number-${release.id}`">Track no.</label>
                  <Input :id="`new-track-number-${release.id}`" v-model="newTrackDrafts[release.id].trackNumber" type="number" min="1" />
                </div>

                <div class="field-row">
                  <label :for="`new-track-tiktok-${release.id}`">TikTok time</label>
                  <Input :id="`new-track-tiktok-${release.id}`" v-model="newTrackDrafts[release.id].tiktokPreviewStartSeconds" type="number" min="0" max="3599" />
                </div>

                <div class="field-row">
                  <label :for="`new-track-version-${release.id}`">Version line</label>
                  <Input :id="`new-track-version-${release.id}`" v-model="newTrackDrafts[release.id].versionLine" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`new-track-status-${release.id}`">Status</label>
                  <NativeSelect :id="`new-track-status-${release.id}`" v-model="newTrackDrafts[release.id].status">
                    <option value="draft">Draft</option>
                    <option value="live">Live</option>
                    <option value="deleted">Deleted</option>
                  </NativeSelect>
                </div>

                <Label class="field-row checkbox-row">
                  <Checkbox v-model="newTrackDrafts[release.id].containsAiGeneratedElements" />
                  <span>Contains AI-generated elements</span>
                </Label>

                <div class="field-row field-row-full">
                  <label :for="`new-track-audio-${release.id}`">Audio preview URL</label>
                  <Input :id="`new-track-audio-${release.id}`" v-model="newTrackDrafts[release.id].audioPreviewUrl" type="url" />
                </div>

                <div class="field-row field-row-full">
                  <label :for="`new-track-lyrics-${release.id}`">Lyrics</label>
                  <Textarea :id="`new-track-lyrics-${release.id}`" v-model="newTrackDrafts[release.id].lyrics" rows="4" />
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button :disabled="trackCreating[release.id]" @click="createTrack(release.id)">
                  {{ trackCreating[release.id] ? "Adding..." : "Add track" }}
                </Button>
              </div>
            </div>
          </div>

          <div v-if="activeReleaseDetailTab === 'timeline'" class="catalog-track-list">
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
        </Card>
      </ReleaseDetailDialog>
      </template>

      <AppPagination
        v-if="workspacePagination.totalCount && releases.length"
        :page="workspacePagination.page"
        :page-size="workspacePagination.pageSize"
        :total-count="workspacePagination.totalCount"
        :total-pages="workspacePagination.totalPages"
        :pending="pending"
        :summary="workspaceSummary"
        aria-label="Release workspace pagination"
        class="mt-5"
        @update:page="workspacePage = $event"
      />
    </DataPanel>
  </div>
</template>

<style scoped>
.release-modal-panel {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.asset-action-group {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.asset-action-group-inline {
  justify-content: flex-start;
  margin-top: 6px;
}

.asset-action-group a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.submission-review-panel {
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--primary) 22%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--card) 88%, var(--muted));
  box-shadow: var(--shadow-sm);
}

.submission-review-art {
  position: relative;
  overflow: hidden;
  align-self: start;
  aspect-ratio: 1;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 8px;
  background: var(--muted);
}

.submission-review-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.submission-review-art-fallback {
  display: grid;
  height: 100%;
  place-items: center;
  gap: 8px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 700;
}

.submission-review-content,
.admin-track-review-card {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.submission-review-header,
.admin-track-review-main,
.admin-artist-order-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.submission-review-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.submission-review-metric {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 6px 8px;
  min-width: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--metric-color, var(--border)) 24%, var(--border));
  border-left: 3px solid var(--metric-color, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--metric-color, var(--muted)) 7%, transparent);
}

.submission-review-metric span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.submission-review-metric strong {
  grid-column: 1 / -1;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 13px;
}

.submission-review-metric-primary {
  --metric-color: var(--primary);
}

.submission-review-metric-info {
  --metric-color: var(--status-info);
}

.submission-review-metric-success {
  --metric-color: var(--status-success);
}

.submission-review-metric-muted {
  --metric-color: var(--priority);
}

.admin-artist-order {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--status-info) 24%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--status-info) 7%, transparent);
}

.admin-artist-order-heading {
  justify-content: flex-start;
  color: var(--status-info);
}

.admin-artist-order-list {
  display: grid;
  gap: 8px;
}

.admin-artist-order-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) minmax(120px, auto);
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.admin-artist-order-row span,
.admin-track-number {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--status-info) 13%, transparent);
  color: var(--status-info);
  font-size: 12px;
  font-weight: 800;
}

.admin-artist-order-row strong,
.admin-artist-order-row em {
  min-width: 0;
  overflow-wrap: anywhere;
}

.admin-artist-order-row em {
  color: var(--muted-foreground);
  font-size: 12px;
  font-style: normal;
  font-weight: 650;
  text-align: right;
}

.submission-review-table {
  margin: 0;
}

.submission-store-logos {
  display: flex;
  min-width: 0;
  justify-content: flex-end;
}

.submission-review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.admin-edit-disclosure {
  display: grid;
  gap: 14px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 34%, transparent);
}

.admin-edit-disclosure[open] {
  padding-bottom: 14px;
}

.admin-edit-disclosure summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  cursor: pointer;
  padding: 12px 14px;
  list-style: none;
}

.admin-edit-disclosure summary::-webkit-details-marker {
  display: none;
}

.admin-edit-disclosure summary span {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 800;
}

.admin-edit-disclosure summary em {
  color: var(--muted-foreground);
  font-size: 12px;
  font-style: normal;
  font-weight: 650;
  text-align: right;
}

.admin-edit-disclosure > .catalog-grid,
.admin-edit-disclosure > .catalog-track-list,
.admin-edit-disclosure > .flex {
  margin-inline: 14px;
}

.admin-track-review-card {
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--primary) 16%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--card) 84%, var(--muted));
}

.admin-track-review-main {
  align-items: center;
}

.admin-track-number {
  display: inline-flex;
  width: auto;
  min-width: 54px;
  gap: 6px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--priority) 7%, transparent);
  color: var(--priority);
}

.admin-credit-review-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.admin-credit-lane {
  --lane-color: var(--muted-foreground);
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--lane-color) 24%, var(--border));
  border-left: 3px solid var(--lane-color);
  border-radius: 8px;
  background: color-mix(in srgb, var(--lane-color) 7%, transparent);
}

.admin-credit-lane-artist {
  --lane-color: var(--status-info);
}

.admin-credit-lane-writer {
  --lane-color: var(--priority);
}

.admin-credit-lane-additional {
  --lane-color: var(--status-success);
}

.admin-credit-lane strong {
  color: var(--lane-color);
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
}

.admin-credit-lane span {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.45;
}

.admin-track-lyrics-review {
  display: grid;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--status-success) 18%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--status-success) 6%, transparent);
}

.admin-track-lyrics-review summary {
  cursor: pointer;
  padding: 10px 12px;
  color: var(--status-success);
  font-size: 12px;
  font-weight: 800;
  list-style: none;
  text-transform: uppercase;
}

.admin-track-lyrics-review summary::-webkit-details-marker {
  display: none;
}

.admin-track-lyrics-review p {
  margin: 0;
  padding: 0 12px 12px;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .submission-review-panel,
  .submission-review-metrics,
  .admin-credit-review-grid {
    grid-template-columns: 1fr;
  }

  .submission-review-art {
    width: min(100%, 280px);
  }

  .admin-track-review-main,
  .submission-review-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-artist-order-row {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .admin-artist-order-row em {
    grid-column: 2;
    text-align: left;
  }

  .admin-edit-disclosure summary {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-edit-disclosure summary em {
    text-align: left;
  }
}
</style>
