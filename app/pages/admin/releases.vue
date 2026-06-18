<script setup lang="ts">
import {
  Check,
  CircleSlash,
  CalendarDays,
  Copy,
  Disc3,
  Download,
  Eye,
  Filter,
  Pencil,
  Plus,
  Rocket,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-vue-next"
import type { RowAction } from "~/components/RowActions.vue"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type {
  AdminReleaseRecord,
  AdminReleaseChangeRequestRecord,
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
type AdminReleaseEventEntry = AdminReleaseRecord["events"][number]
type SnapshotCreditRow = { creditedName: string; roleCodes: string[]; sortOrder: number }
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

function copyDisplayValue(value: unknown, emptyText = "Not set") {
  const normalized = String(value ?? "").trim()
  return normalized || emptyText
}

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function unknownNumber(value: unknown) {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : null
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
  return status
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
}

function formatDate(value: string | null) {
  if (!value) {
    return "No release date"
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

function releaseTimelineActorLabel(entry: AdminReleaseEventEntry) {
  if (entry.actorRole === "admin") {
    return "Admin"
  }

  if (entry.actorRole === "system") {
    return "System"
  }

  return entry.actorName || "Artist"
}

function markReviewCopied(key: string) {
  copiedReviewKey.value = key

  if (copiedReviewTimer) {
    clearTimeout(copiedReviewTimer)
  }

  copiedReviewTimer = setTimeout(() => {
    copiedReviewKey.value = ""
    copiedReviewTimer = null
  }, 1400)
}

function fallbackCopyText(text: string) {
  if (!import.meta.client) {
    return
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "true")
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand("copy")
  document.body.removeChild(textarea)
}

async function copyReviewText(key: string, value: unknown) {
  const text = String(value ?? "").trim()

  if (!text || !import.meta.client) {
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      fallbackCopyText(text)
    }
  } catch {
    fallbackCopyText(text)
  }

  markReviewCopied(key)
}

function reviewCopyIcon(key: string) {
  return copiedReviewKey.value === key ? Check : Copy
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

function submissionCoverForReview(release: AdminReleaseRecord) {
  return release.submission?.finalCoverArtUrl || release.submission?.sourceCoverArtUrl || release.coverArtUrl || ""
}

function releaseCoverArtUrl(release: AdminReleaseRecord) {
  return release.coverArtUrl
}

function reviewAudioUrl(track: AdminTrackRecord) {
  return track.finalAudioUrl || track.sourceAudioUrl || track.audioPreviewUrl || ""
}

function submittedTrackAssetUrl(release: AdminReleaseRecord, track: AdminTrackRecord) {
  if (!release.submission?.tracks.some((item) => item.trackId === track.id)) {
    return ""
  }

  return submissionAssetDownloadUrl(release.submission.id, "audio", track.id)
}

function trackCreditCopyText(row: { creditedName: string; roleCodes: string[] }) {
  return `${row.creditedName} (${row.roleCodes.join(", ")})`
}

function requestSnapshotRelease(request: AdminReleaseChangeRequestRecord) {
  return objectValue(request.snapshot.release)
}

function requestSnapshotReleaseTitle(request: AdminReleaseChangeRequestRecord) {
  return copyDisplayValue(requestSnapshotRelease(request).title, "Untitled release")
}

function requestSnapshotGenre(request: AdminReleaseChangeRequestRecord) {
  return copyDisplayValue(request.snapshot.genre ?? requestSnapshotRelease(request).genre)
}

function requestSnapshotReleaseDate(request: AdminReleaseChangeRequestRecord) {
  return copyDisplayValue(requestSnapshotRelease(request).releaseDate, "No release date")
}

function requestSnapshotTrackTitle(track: Record<string, unknown>, index: string | number) {
  return copyDisplayValue(track.title, `Track ${Number(index) + 1}`)
}

function requestSnapshotTrackTiktok(track: Record<string, unknown>) {
  return formatTiktokPreviewTime(unknownNumber(track.tiktokPreviewStartSeconds))
}

function normalizeSnapshotCredits(credits: unknown[]) {
  const rows = new Map<string, SnapshotCreditRow>()

  credits.forEach((credit, index) => {
    const record = objectValue(credit)
    const creditedName = copyDisplayValue(record.creditedName, "").trim()
    const roleCode = copyDisplayValue(record.roleCode, "").trim()

    if (!creditedName || !roleCode) {
      return
    }

    const key = creditedName.toLowerCase()
    const existing = rows.get(key)

    if (existing) {
      existing.roleCodes = normalizeTrackCreditRoleCodes([...existing.roleCodes, roleCode])
      return
    }

    rows.set(key, {
      creditedName,
      roleCodes: normalizeTrackCreditRoleCodes([roleCode]),
      sortOrder: Number(record.sortOrder ?? index),
    })
  })

  return [...rows.values()].sort((left, right) => left.sortOrder - right.sortOrder)
}

function requestSnapshotTrackCredits(request: AdminReleaseChangeRequestRecord, track: Record<string, unknown>, trackIndex: string | number) {
  const normalizedTrackIndex = Number(trackIndex)
  const embeddedCredits = Array.isArray(track.credits) ? track.credits : []
  const flatCredits = request.snapshot.credits.filter((credit) => {
    const record = objectValue(credit)
    return Number(record.trackIndex) === normalizedTrackIndex || (!!track.id && record.trackId === track.id)
  })

  return normalizeSnapshotCredits(embeddedCredits.length ? embeddedCredits : flatCredits)
}

const WORKSPACE_PAGE_SIZE_OPTIONS = [4, 8, 12, 24] as const
const RELEASE_STATUS_FILTER_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Live", value: "live" },
  { label: "Taken down", value: "taken_down" },
  { label: "Deleted", value: "deleted" },
]
const RELEASE_TYPE_FILTER_OPTIONS = [
  { label: "All types", value: "" },
  { label: "Singles", value: "single" },
  { label: "EPs", value: "ep" },
  { label: "Albums", value: "album" },
]
const RELEASE_DATE_FILTER_OPTIONS = [
  { label: "Any release date", value: "all" },
  { label: "Upcoming", value: "upcoming" },
  { label: "Already released", value: "past" },
  { label: "This year", value: "this_year" },
  { label: "Last year", value: "last_year" },
  { label: "No release date", value: "undated" },
  { label: "Custom dates", value: "custom" },
]
const RELEASE_COLLABORATION_FILTER_OPTIONS = [
  { label: "All ownership", value: "all" },
  { label: "Solo releases", value: "solo" },
  { label: "Any collaboration", value: "collaborative" },
  { label: "Featured/remix credits", value: "featured" },
  { label: "Split collaborators", value: "splits" },
  { label: "Pending requests", value: "pending_request" },
]
const RELEASE_TRACK_COUNT_FILTER_OPTIONS = [
  { label: "Any track count", value: "all" },
  { label: "No tracks", value: "empty" },
  { label: "Single-track", value: "single" },
  { label: "Multi-track", value: "multi" },
  { label: "Large releases", value: "large" },
]

const selectedArtistId = ref("")
const workspacePage = ref(1)
const workspacePageSize = ref(8)
const releaseSearchQuery = ref("")
const selectedReleaseStatus = ref("")
const selectedReleaseType = ref("")
const selectedReleaseDateFilter = ref("all")
const releaseDateFrom = ref("")
const releaseDateTo = ref("")
const selectedReleaseCollaboration = ref("all")
const selectedReleaseTrackCount = ref("all")
const catalogFile = ref<File | null>(null)
const catalogFileInput = ref<HTMLInputElement | null>(null)
const pageError = ref("")
const pageSuccess = ref("")
const copiedReviewKey = ref("")
const bulkImportResult = ref<BulkCatalogImportResponse | null>(null)
const { confirmAction } = useConfirmAction()
let copiedReviewTimer: ReturnType<typeof setTimeout> | null = null

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

watch(
  [
    releaseSearchQuery,
    selectedReleaseStatus,
    selectedReleaseType,
    selectedReleaseDateFilter,
    releaseDateFrom,
    releaseDateTo,
    selectedReleaseCollaboration,
    selectedReleaseTrackCount,
  ],
  () => {
    workspacePage.value = 1
  },
)

const { data, pending, error, refresh } = useLazyFetch<AdminReleaseWorkspaceResponse>("/api/admin/releases/workspace", {
  query: computed(() => ({
    page: workspacePage.value,
    pageSize: workspacePageSize.value,
    ...(selectedArtistId.value ? { artistId: selectedArtistId.value } : {}),
    ...(releaseSearchQuery.value.trim() ? { search: releaseSearchQuery.value.trim() } : {}),
    ...(selectedReleaseStatus.value ? { status: selectedReleaseStatus.value } : {}),
    ...(selectedReleaseType.value ? { type: selectedReleaseType.value } : {}),
    ...(selectedReleaseDateFilter.value !== "all" ? { dateFilter: selectedReleaseDateFilter.value } : {}),
    ...(selectedReleaseDateFilter.value === "custom" && releaseDateFrom.value ? { dateFrom: releaseDateFrom.value } : {}),
    ...(selectedReleaseDateFilter.value === "custom" && releaseDateTo.value ? { dateTo: releaseDateTo.value } : {}),
    ...(selectedReleaseCollaboration.value !== "all" ? { collaboration: selectedReleaseCollaboration.value } : {}),
    ...(selectedReleaseTrackCount.value !== "all" ? { trackCount: selectedReleaseTrackCount.value } : {}),
  })),
  immediate: false,
  watch: false,
})

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

const releases = computed(() => data.value?.releases ?? [])
const selectedReleaseId = ref("")
const releaseDialogRenderId = ref(selectedReleaseId.value)
let releaseDialogCloseTimer: ReturnType<typeof setTimeout> | null = null
const selectedRelease = computed(() => releases.value.find((release) => release.id === releaseDialogRenderId.value) ?? null)
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
  { key: "tracks", label: "Tracks", align: "right" as const, accessor: (row: any) => row.snapshot.tracks.length },
  { key: "credits", label: "Credits", align: "right" as const, accessor: (row: any) => row.snapshot.credits.length },
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
const selectedArtistFilterLabel = computed(() => artists.value.find((artist) => artist.id === selectedArtistId.value)?.name || "All artists")
const activeWorkspaceFilterCount = computed(() => [
  selectedArtistId.value,
  releaseSearchQuery.value.trim(),
  selectedReleaseStatus.value,
  selectedReleaseType.value,
  selectedReleaseDateFilter.value !== "all" ? selectedReleaseDateFilter.value : "",
  selectedReleaseDateFilter.value === "custom" ? releaseDateFrom.value : "",
  selectedReleaseDateFilter.value === "custom" ? releaseDateTo.value : "",
  selectedReleaseCollaboration.value !== "all" ? selectedReleaseCollaboration.value : "",
  selectedReleaseTrackCount.value !== "all" ? selectedReleaseTrackCount.value : "",
].filter(Boolean).length)
const workspaceFilterSummary = computed(() => activeWorkspaceFilterCount.value
  ? `${activeWorkspaceFilterCount.value} filter${activeWorkspaceFilterCount.value === 1 ? "" : "s"} active / ${selectedArtistFilterLabel.value}`
  : `Full catalog / ${selectedArtistFilterLabel.value}`)
const selectedReleaseFolderId = computed({
  get: () => selectedReleaseId.value,
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

  if (copiedReviewTimer) {
    clearTimeout(copiedReviewTimer)
  }
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

  selectedReleaseId.value = releaseId
}

/* Review-queue keyboard flow: ←/→ (or K/J) steps between releases
   while the detail dialog is open — review the whole queue without
   touching the mouse. Typing targets are ignored. */
const selectedReleaseIndex = computed(() =>
  releases.value.findIndex((release) => release.id === releaseDialogRenderId.value),
)

function stepReleaseDetails(delta: number) {
  if (!selectedReleaseId.value || !releases.value.length) {
    return
  }

  const index = selectedReleaseIndex.value

  if (index === -1) {
    return
  }

  const next = releases.value[index + delta]

  if (next) {
    openReleaseDetails(next.id)
  }
}

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null

  if (!element) {
    return false
  }

  const tag = element.tagName

  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || element.isContentEditable
}

function handleReleaseReviewHotkeys(event: KeyboardEvent) {
  if (
    !selectedReleaseId.value ||
    trackEditOpen.value ||
    trackAddOpen.value ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    isTypingTarget(event.target)
  ) {
    return
  }

  const key = event.key.toLowerCase()

  if (event.key === "ArrowRight" || key === "j") {
    event.preventDefault()
    stepReleaseDetails(1)
  } else if (event.key === "ArrowLeft" || key === "k") {
    event.preventDefault()
    stepReleaseDetails(-1)
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleReleaseReviewHotkeys)
})

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleReleaseReviewHotkeys)
})

function handleReleaseCardKeydown(event: KeyboardEvent, releaseId: string) {
  if (event.key !== "Enter" && event.key !== " ") {
    return
  }

  event.preventDefault()
  openReleaseDetails(releaseId)
}

function closeReleaseDetails() {
  trackEditOpen.value = false
  trackAddOpen.value = false
  activeTrackId.value = ""
  selectedReleaseId.value = ""
}

function requestCloseReleaseDetails() {
  if (trackEditOpen.value || trackAddOpen.value) {
    return
  }

  closeReleaseDetails()
}

function resetWorkspaceFilters() {
  selectedArtistId.value = ""
  releaseSearchQuery.value = ""
  selectedReleaseStatus.value = ""
  selectedReleaseType.value = ""
  selectedReleaseDateFilter.value = "all"
  releaseDateFrom.value = ""
  releaseDateTo.value = ""
  selectedReleaseCollaboration.value = "all"
  selectedReleaseTrackCount.value = "all"
  workspacePage.value = 1
}

function releaseTrackCount(release: AdminReleaseRecord) {
  return release.tracks.length
}

function releaseWorkspaceCoverUrl(release: AdminReleaseRecord) {
  return releaseDrafts[release.id]?.coverArtUrl ||
    release.submission?.finalCoverArtUrl ||
    release.submission?.sourceCoverArtUrl ||
    release.coverThumbUrl ||
    release.coverArtUrl ||
    release.sourceCoverArtUrl ||
    ""
}

function releaseTrackPreview(release: AdminReleaseRecord) {
  const visibleTitles = release.tracks
    .slice()
    .sort((left, right) => (left.trackNumber ?? 9999) - (right.trackNumber ?? 9999))
    .slice(0, 3)
    .map((track) => track.title)

  if (!visibleTitles.length) {
    return "No tracks linked"
  }

  const overflow = release.tracks.length - visibleTitles.length
  return overflow > 0 ? `${visibleTitles.join(", ")} +${overflow}` : visibleTitles.join(", ")
}

function releaseCollaborationCount(release: AdminReleaseRecord) {
  const collaborators = new Set<string>()

  for (const collaborator of release.collaborators) {
    collaborators.add(collaborator.artistId || collaborator.artistName.toLowerCase())
  }

  for (const track of release.tracks) {
    for (const collaborator of track.collaborators) {
      collaborators.add(collaborator.artistId || collaborator.artistName.toLowerCase())
    }

    for (const credit of track.credits) {
      if (credit.roleCode === "Featured Artist" || credit.roleCode === "Remixer") {
        collaborators.add(credit.linkedArtistId || credit.creditedName.toLowerCase())
      }
    }
  }

  if (release.artistId) {
    collaborators.delete(release.artistId)
  }

  if (release.artistName) {
    collaborators.delete(release.artistName.toLowerCase())
  }

  return collaborators.size
}

function releaseCollaborationLabel(release: AdminReleaseRecord) {
  const count = releaseCollaborationCount(release)

  if (!count) {
    return "Solo"
  }

  return `${count} collaborator${count === 1 ? "" : "s"}`
}

watch(
  [
    selectedArtistId,
    workspacePage,
    workspacePageSize,
    releaseSearchQuery,
    selectedReleaseStatus,
    selectedReleaseType,
    selectedReleaseDateFilter,
    releaseDateFrom,
    releaseDateTo,
    selectedReleaseCollaboration,
    selectedReleaseTrackCount,
  ],
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

function normalizedSplitContributors(contributors: SplitContributorDraft[]) {
  return contributors
    .filter((contributor) => contributor.artistId || contributor.role.trim() || contributor.splitPct.trim())
    .map((contributor) => ({
      artistId: contributor.artistId,
      role: contributor.role,
      splitPct: contributor.splitPct,
    }))
}

function contributorLabel(contributor: { artistName?: string; role: string }) {
  return [contributor.artistName, contributor.role].filter(Boolean).join(" / ") || "this collaborator"
}

function findReleaseCurrentContributor(release: AdminReleaseRecord, contributor: SplitContributorDraft) {
  return release.collaborators.find((candidate) => candidate.artistId === contributor.artistId && candidate.role === contributor.role) ?? null
}

function findTrackCurrentContributor(track: AdminTrackRecord, contributor: SplitContributorDraft) {
  return track.collaborators.find((candidate) => candidate.artistId === contributor.artistId && candidate.role === contributor.role) ?? null
}

async function stopReleaseDraftContributor(release: AdminReleaseRecord, contributor: SplitContributorDraft) {
  const currentContributor = findReleaseCurrentContributor(release, contributor)

  if (currentContributor) {
    await stopReleaseSplitContributor(release, currentContributor)
  }
}

async function stopTrackDraftContributor(track: AdminTrackRecord, contributor: SplitContributorDraft) {
  const currentContributor = findTrackCurrentContributor(track, contributor)

  if (currentContributor) {
    await stopTrackSplitContributor(track, currentContributor)
  }
}

async function stopReleaseSplitContributor(release: AdminReleaseRecord, contributor: AdminReleaseRecord["collaborators"][number]) {
  const draft = releaseSplitDrafts[release.id] ?? blankSplitDraft()
  const label = contributorLabel(contributor)
  const confirmed = await confirmAction({
    title: "Stop collaboration",
    description: `Stop ${label} from ${draft.effectivePeriodMonth}? Past split history and revenue stay untouched.`,
    confirmLabel: "Stop collaboration",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  releaseSplitSaving[release.id] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/releases/${release.id}/split-version`, {
      method: "POST",
      body: {
        effectivePeriodMonth: draft.effectivePeriodMonth,
        changeReason: toNullableText(draft.changeReason) ?? `Stopped collaboration: ${label}`,
        contributors: release.collaborators
          .filter((candidate) => !(candidate.artistId === contributor.artistId && candidate.role === contributor.role))
          .map((candidate) => ({
            artistId: candidate.artistId,
            role: candidate.role,
            splitPct: candidate.splitPct.toFixed(2),
          })),
      },
    })

    await refresh()
    setSuccess("Collaboration stopped for the selected effective month.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to stop the release collaboration.")
  } finally {
    releaseSplitSaving[release.id] = false
  }
}

async function stopTrackSplitContributor(track: AdminTrackRecord, contributor: AdminTrackRecord["collaborators"][number]) {
  const draft = trackSplitDrafts[track.id] ?? blankSplitDraft()
  const label = contributorLabel(contributor)
  const confirmed = await confirmAction({
    title: "Stop track collaboration",
    description: `Stop ${label} from ${draft.effectivePeriodMonth}? Past split history and revenue stay untouched.`,
    confirmLabel: "Stop collaboration",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  trackSplitSaving[track.id] = true
  resetMessages()

  try {
    await $fetch(`/api/admin/tracks/${track.id}/split-version`, {
      method: "POST",
      body: {
        effectivePeriodMonth: draft.effectivePeriodMonth,
        changeReason: toNullableText(draft.changeReason) ?? `Stopped track collaboration: ${label}`,
        contributors: track.collaborators
          .filter((candidate) => !(candidate.artistId === contributor.artistId && candidate.role === contributor.role))
          .map((candidate) => ({
            artistId: candidate.artistId,
            role: candidate.role,
            splitPct: candidate.splitPct.toFixed(2),
          })),
      },
    })

    await refresh()
    setSuccess("Track collaboration stopped for the selected effective month.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to stop the track collaboration.")
  } finally {
    trackSplitSaving[track.id] = false
  }
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
    createReleaseOpen.value = false
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
    trackAddOpen.value = false
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
    if (activeTrackId.value === trackId) {
      trackEditOpen.value = false
    }
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
        contributors: normalizedSplitContributors(draft.contributors),
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
        contributors: normalizedSplitContributors(draft.contributors),
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
    ? "Catalog table editor"
    : section.value === "requests"
      ? "Approval queue"
      : "Bulk CSV tools",
  tone: section.value === "workspace" ? "accent" as const : section.value === "requests" ? "alt" as const : "default" as const,
})))

// ── Workspace table ──
const actionsColumn = { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false }
const workspaceColumns = [
  { key: "release", label: "Release", accessor: (row: any) => row.title },
  { key: "type", label: "Type", accessor: (row: any) => row.type },
  { key: "status", label: "Status", accessor: (row: any) => row.displayStatus },
  { key: "tracks", label: "Tracks", align: "right" as const, accessor: (row: any) => row.tracks.length },
  { key: "date", label: "Release date", accessor: (row: any) => row.releaseDate || "" },
  { key: "collabs", label: "Collaboration", accessor: (row: any) => releaseCollaborationCount(row) },
  { key: "upc", label: "UPC", accessor: (row: any) => row.upc || "" },
  actionsColumn,
]

function releaseRowActions(release: AdminReleaseRecord): RowAction[] {
  const actions: RowAction[] = [{ key: "open", label: "Open release", icon: Eye }]
  if (release.displayStatus === "scheduled") {
    actions.push({ key: "publish", label: "Publish live", icon: Rocket, separatorBefore: true })
  }
  if (release.status !== "deleted") {
    actions.push({ key: "delete", label: "Delete release", icon: Trash2, variant: "destructive", separatorBefore: true })
  }
  return actions
}

function onReleaseAction(key: string, release: AdminReleaseRecord) {
  if (key === "open") {
    openReleaseDetails(release.id)
  } else if (key === "publish") {
    void publishRelease(release.id)
  } else if (key === "delete") {
    void deleteRelease(release.id, release.title)
  }
}

// ── Create release dialog ──
const createReleaseOpen = ref(false)
function openCreateRelease() {
  resetMessages()
  Object.assign(releaseForm, blankCreateReleaseDraft(releaseForm.artistId || selectedArtistId.value || artists.value[0]?.id || ""))
  createReleaseOpen.value = true
}

// ── Track edit / add dialogs (inside the release detail dialog) ──
const trackEditOpen = ref(false)
const trackAddOpen = ref(false)
const activeTrackId = ref("")
const activeTrack = computed(() => selectedRelease.value?.tracks.find((track) => track.id === activeTrackId.value) ?? null)

function trackRowActions(track: AdminTrackRecord): RowAction[] {
  const actions: RowAction[] = [{ key: "edit", label: "Edit track", icon: Pencil }]
  if (track.status !== "deleted") {
    actions.push({ key: "delete", label: "Delete track", icon: Trash2, variant: "destructive", separatorBefore: true })
  }
  return actions
}

function onTrackAction(key: string, track: AdminTrackRecord, releaseStatus: ReleaseStatus) {
  if (key === "edit") {
    resetMessages()
    activeTrackId.value = track.id
    trackEditOpen.value = true
  } else if (key === "delete") {
    void deleteTrack(track.id, releaseStatus, track.title)
  }
}

function openAddTrack() {
  resetMessages()
  trackAddOpen.value = true
}

const trackTableColumns = [
  { key: "track", label: "Track", accessor: (row: any) => row.title },
  { key: "isrc", label: "ISRC", accessor: (row: any) => row.isrc || "" },
  { key: "credits", label: "Credits", accessor: (row: any) => row.credits.length, align: "right" as const },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  actionsColumn,
]
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

    <div class="release-page-alerts">
      <AppAlert v-if="pageError" variant="destructive">{{ pageError }}</AppAlert>
      <AppAlert v-if="pageSuccess" variant="success">{{ pageSuccess }}</AppAlert>
      <AppAlert v-if="error" variant="destructive">{{ error.statusMessage || "Unable to load the release workspace right now." }}</AppAlert>
    </div>

    <FormDialog
      v-model:open="createReleaseOpen"
      title="Draft release"
      description="Build a release with genre, initial tracks, and per-track credits in one submission. New releases default to draft until you intentionally push them live."
      submit-label="Create release"
      :pending="isCreatingRelease"
      :error="createReleaseOpen ? pageError : ''"
      :submit-disabled="!releaseForm.artistId || !releaseForm.title"
      content-class="max-w-4xl"
      @submit="createRelease"
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
        <Button variant="secondary" @click="addCreateTrack">
          <Plus class="size-4" />
          Add another track
        </Button>
      </div>
    </FormDialog>

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
      <DashboardSkeleton v-if="pending && !data" layout="admin-releases-requests" :rows="5" />

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
          <div class="request-copy-sheet">
            <div class="review-copy-grid">
              <div class="review-copy-field">
                <span>Release title</span>
                <strong>{{ requestSnapshotReleaseTitle(request) }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy release title" @click="copyReviewText(`request-${request.id}-title`, requestSnapshotReleaseTitle(request))">
                  <component :is="reviewCopyIcon(`request-${request.id}-title`)" class="size-4" />
                </button>
              </div>

              <div class="review-copy-field">
                <span>Artist</span>
                <strong>{{ request.requesterArtistName }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy artist name" @click="copyReviewText(`request-${request.id}-artist`, request.requesterArtistName)">
                  <component :is="reviewCopyIcon(`request-${request.id}-artist`)" class="size-4" />
                </button>
              </div>

              <div class="review-copy-field">
                <span>Genre</span>
                <strong>{{ requestSnapshotGenre(request) }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy genre" @click="copyReviewText(`request-${request.id}-genre`, requestSnapshotGenre(request))">
                  <component :is="reviewCopyIcon(`request-${request.id}-genre`)" class="size-4" />
                </button>
              </div>

              <div class="review-copy-field">
                <span>Release date</span>
                <strong>{{ requestSnapshotReleaseDate(request) }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy release date" @click="copyReviewText(`request-${request.id}-date`, requestSnapshotReleaseDate(request))">
                  <component :is="reviewCopyIcon(`request-${request.id}-date`)" class="size-4" />
                </button>
              </div>
            </div>

            <div v-if="request.takedownReason" class="review-copy-field review-copy-field-wide">
              <span>Takedown reason</span>
              <strong>{{ request.takedownReason }}</strong>
              <button type="button" class="review-copy-button" aria-label="Copy takedown reason" @click="copyReviewText(`request-${request.id}-reason`, request.takedownReason)">
                <component :is="reviewCopyIcon(`request-${request.id}-reason`)" class="size-4" />
              </button>
            </div>

            <div v-if="request.snapshot.tracks.length" class="review-copy-section">
              <strong>Tracks</strong>

              <div class="review-copy-track-list">
                <div v-for="(track, trackIndex) in request.snapshot.tracks" :key="`request-track-${request.id}-${trackIndex}`" class="review-copy-track">
                  <div class="review-copy-grid review-copy-grid-compact">
                    <div class="review-copy-field">
                      <span>Track name</span>
                      <strong>{{ requestSnapshotTrackTitle(objectValue(track), trackIndex) }}</strong>
                      <button type="button" class="review-copy-button" aria-label="Copy track name" @click="copyReviewText(`request-${request.id}-track-${trackIndex}-title`, requestSnapshotTrackTitle(objectValue(track), trackIndex))">
                        <component :is="reviewCopyIcon(`request-${request.id}-track-${trackIndex}-title`)" class="size-4" />
                      </button>
                    </div>

                    <div class="review-copy-field">
                      <span>TikTok time</span>
                      <strong>{{ requestSnapshotTrackTiktok(objectValue(track)) }}</strong>
                      <button type="button" class="review-copy-button" aria-label="Copy TikTok time" @click="copyReviewText(`request-${request.id}-track-${trackIndex}-tiktok`, requestSnapshotTrackTiktok(objectValue(track)))">
                        <component :is="reviewCopyIcon(`request-${request.id}-track-${trackIndex}-tiktok`)" class="size-4" />
                      </button>
                    </div>
                  </div>

                  <div class="review-credit-list">
                    <div
                      v-for="credit in requestSnapshotTrackCredits(request, objectValue(track), trackIndex)"
                      :key="`request-credit-${request.id}-${trackIndex}-${credit.creditedName}-${credit.roleCodes.join('-')}`"
                      class="review-copy-row"
                    >
                      <span>
                        <strong>{{ credit.creditedName }}</strong>
                        <em>{{ credit.roleCodes.join(", ") }}</em>
                      </span>
                      <button type="button" class="review-copy-button" :aria-label="`Copy ${credit.creditedName} credit`" @click="copyReviewText(`request-${request.id}-credit-${trackIndex}-${credit.creditedName}`, trackCreditCopyText(credit))">
                        <component :is="reviewCopyIcon(`request-${request.id}-credit-${trackIndex}-${credit.creditedName}`)" class="size-4" />
                      </button>
                    </div>
                    <span v-if="!requestSnapshotTrackCredits(request, objectValue(track), trackIndex).length" class="detail-copy">No credits in this request.</span>
                  </div>
                </div>
              </div>
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
      title-level="h1"
      eyebrow="Lifecycle"
      description="Edit catalog metadata, schedule split changes by month, keep track credits current, and review the release timeline without collapsing taken down and deleted into the same state."
    >
      <template #actions>
        <Button @click="openCreateRelease">
          <Plus class="size-4" />
          New release
        </Button>
      </template>

      <Card size="sm" class="admin-release-filter-card">
        <div class="admin-release-filter-heading">
          <div class="summary-copy">
            <span class="eyebrow">
              <Filter class="size-4" aria-hidden="true" />
              Filters
            </span>
            <strong>{{ workspaceFilterSummary }}</strong>
            <span class="detail-copy">{{ workspaceSummary }} / Page {{ workspacePagination.page }} of {{ workspacePagination.totalPages }}</span>
          </div>
        </div>

        <div class="admin-release-filter-grid">
          <div class="field-row admin-release-filter-search">
            <label for="workspace-release-search">Search releases or songs</label>
            <div class="admin-release-search-control">
              <Search class="size-4" aria-hidden="true" />
              <Input
                id="workspace-release-search"
                v-model="releaseSearchQuery"
                type="search"
                placeholder="Release, track, artist, UPC, ISRC"
              />
            </div>
          </div>

          <div class="field-row">
            <label for="workspace-artist-filter">Artist</label>
            <NativeSelect id="workspace-artist-filter" v-model="selectedArtistId">
              <option value="">All artists</option>
              <option v-for="artist in artists" :key="artist.id" :value="artist.id">
                {{ artist.name }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="workspace-release-date-filter">Release date</label>
            <NativeSelect id="workspace-release-date-filter" v-model="selectedReleaseDateFilter">
              <option v-for="option in RELEASE_DATE_FILTER_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="workspace-release-status-filter">Status</label>
            <NativeSelect id="workspace-release-status-filter" v-model="selectedReleaseStatus">
              <option v-for="option in RELEASE_STATUS_FILTER_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="workspace-release-type-filter">Type</label>
            <NativeSelect id="workspace-release-type-filter" v-model="selectedReleaseType">
              <option v-for="option in RELEASE_TYPE_FILTER_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="workspace-collaboration-filter">Collabs</label>
            <NativeSelect id="workspace-collaboration-filter" v-model="selectedReleaseCollaboration">
              <option v-for="option in RELEASE_COLLABORATION_FILTER_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="workspace-track-count-filter">Track count</label>
            <NativeSelect id="workspace-track-count-filter" v-model="selectedReleaseTrackCount">
              <option v-for="option in RELEASE_TRACK_COUNT_FILTER_OPTIONS" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="workspace-page-size">Per page</label>
            <NativeSelect id="workspace-page-size" v-model.number="workspacePageSize">
              <option v-for="option in WORKSPACE_PAGE_SIZE_OPTIONS" :key="option" :value="option">
                {{ option }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row admin-release-filter-action">
            <label aria-hidden="true">&nbsp;</label>
            <Button variant="secondary" class="admin-release-filter-reset" @click="resetWorkspaceFilters">
              <RotateCcw class="size-4" aria-hidden="true" />
              Reset
            </Button>
          </div>

          <template v-if="selectedReleaseDateFilter === 'custom'">
            <div class="field-row">
              <label for="workspace-release-date-from">From</label>
              <AppDatePicker id="workspace-release-date-from" v-model="releaseDateFrom" placeholder="Start date" />
            </div>
            <div class="field-row">
              <label for="workspace-release-date-to">To</label>
              <AppDatePicker id="workspace-release-date-to" v-model="releaseDateTo" placeholder="End date" />
            </div>
          </template>
        </div>
      </Card>

      <AppPagination
        v-if="workspacePagination.totalCount"
        :page="workspacePagination.page"
        :page-size="workspacePagination.pageSize"
        :total-count="workspacePagination.totalCount"
        :total-pages="workspacePagination.totalPages"
        :pending="pending"
        :summary="pending && data ? 'Refreshing this page...' : workspaceSummary"
        aria-label="Release workspace pagination"
        class="admin-release-pagination-top"
        @update:page="workspacePage = $event"
      />

      <DashboardSkeleton v-if="pending && !data" layout="admin-releases-workspace" :rows="5" />

      <AppEmptyState
        v-else-if="!releases.length"
        icon="search"
        title="No releases"
        :description="`No releases match ${workspaceFilterSummary.toLowerCase()}.`"
      />

      <template v-else>
      <DataTable
        :columns="workspaceColumns"
        :data="releases"
        row-key="id"
        empty-title="No releases"
        empty-description="No releases match this filter."
      >
        <template #cell-release="{ row: release }">
          <button type="button" class="release-table-title" @click="openReleaseDetails(release.id)">
            <span class="release-table-thumb">
              <img
                v-if="releaseWorkspaceCoverUrl(release)"
                :src="releaseWorkspaceCoverUrl(release)"
                :alt="`${release.title} cover art`"
                draggable="false"
                @dragstart.prevent
              />
              <Disc3 v-else class="size-4" aria-hidden="true" />
            </span>
            <span class="release-table-titletext">
              <strong>{{ release.title || "Untitled release" }}</strong>
              <span class="detail-copy">{{ release.artistName || "Unknown artist" }} · {{ release.genre }}</span>
            </span>
            <span v-if="release.currentRequest" class="release-table-request">Request</span>
          </button>
        </template>
        <template #cell-type="{ row: release }">
          <span class="tl-release-type-pill">
            <span class="tl-release-type-mark" aria-hidden="true"></span>
            <span>{{ formatReleaseTypeLabel(release.type) }}</span>
          </span>
        </template>
        <template #cell-status="{ row: release }">
          <StatusBadge :tone="statusTone(release.displayStatus)">{{ formatStatusLabel(release.displayStatus) }}</StatusBadge>
        </template>
        <template #cell-tracks="{ row: release }">
          <span class="tabular-nums">{{ releaseTrackCount(release) }}</span>
        </template>
        <template #cell-date="{ row: release }">{{ formatDate(release.releaseDate) }}</template>
        <template #cell-collabs="{ row: release }">{{ releaseCollaborationLabel(release) }}</template>
        <template #cell-upc="{ row: release }">
          <span class="mono">{{ release.upc || "No UPC" }}</span>
        </template>
        <template #cell-actions="{ row: release }">
          <RowActions :actions="releaseRowActions(release)" @select="(key) => onReleaseAction(key, release)" />
        </template>
      </DataTable>

      <ReleaseDetailDialog
        v-for="release in selectedRelease ? [selectedRelease] : []"
        :key="`admin-release-modal-${release.id}`"
        :open="Boolean(selectedReleaseId)"
        :title="release.title"
        eyebrow="Admin release workspace"
        :subtitle="`${release.artistName || 'Unknown artist'} / ${release.type.toUpperCase()} / ${release.genre} / ${release.releaseDate || 'No date'}`"
        :image-url="submissionCoverForReview(release)"
        :fallback="release.title.slice(0, 1).toUpperCase()"
        :tabs="releaseDetailTabs"
        :active-tab="activeReleaseDetailTab"
        @close="requestCloseReleaseDetails"
        @update:active-tab="activeReleaseDetailTab = $event"
      >
        <template #badges>
          <StatusBadge :tone="statusTone(release.displayStatus)">
            {{ formatStatusLabel(release.displayStatus) }}
          </StatusBadge>
          <StatusBadge v-if="release.currentRequest" tone="info">
            Request open
          </StatusBadge>
          <span
            v-if="selectedReleaseIndex !== -1 && releases.length > 1"
            class="release-review-position"
            :aria-label="`Release ${selectedReleaseIndex + 1} of ${releases.length}. Use the arrow keys to move between releases.`"
          >
            {{ selectedReleaseIndex + 1 }} / {{ releases.length }}
            <span class="release-review-keys" aria-hidden="true">← →</span>
          </span>
        </template>

        <Card
          v-if="releaseDrafts[release.id] && releaseSplitDrafts[release.id] && newTrackDrafts[release.id]"
          class="catalog-item release-modal-panel"
        >
          <div v-if="!(activeReleaseDetailTab === 'overview' && release.submission)" class="catalog-header">
            <div class="summary-copy">
              <strong>{{ release.title }}</strong>
              <span class="detail-copy">{{ release.type.toUpperCase() }} / {{ release.genre }} / {{ release.releaseDate || "No date" }}</span>
            </div>
            <StatusBadge :tone="statusTone(release.displayStatus)">
              {{ formatStatusLabel(release.displayStatus) }}
            </StatusBadge>
          </div>

          <section v-if="activeReleaseDetailTab === 'overview' && release.submission" class="submission-copy-sheet">
            <div class="review-copy-grid">
              <div class="review-copy-field">
                <span>Release title</span>
                <strong>{{ release.title || "Untitled release" }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy release title" @click="copyReviewText(`submission-${release.id}-title`, release.title)">
                  <component :is="reviewCopyIcon(`submission-${release.id}-title`)" class="size-4" />
                </button>
              </div>

              <div class="review-copy-field">
                <span>Artist</span>
                <strong>{{ release.artistName || release.submission.artistName || "Artist" }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy artist name" @click="copyReviewText(`submission-${release.id}-artist`, release.artistName || release.submission.artistName || 'Artist')">
                  <component :is="reviewCopyIcon(`submission-${release.id}-artist`)" class="size-4" />
                </button>
              </div>

              <div class="review-copy-field">
                <span>Genre</span>
                <strong>{{ release.genre }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy genre" @click="copyReviewText(`submission-${release.id}-genre`, release.genre)">
                  <component :is="reviewCopyIcon(`submission-${release.id}-genre`)" class="size-4" />
                </button>
              </div>

              <div class="review-copy-field">
                <span>Release date</span>
                <strong>{{ release.releaseDate || "No release date" }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy release date" @click="copyReviewText(`submission-${release.id}-date`, release.releaseDate || 'No release date')">
                  <component :is="reviewCopyIcon(`submission-${release.id}-date`)" class="size-4" />
                </button>
              </div>
            </div>

            <div class="review-copy-field review-copy-field-wide">
              <span>Cover art</span>
              <strong>{{ release.submission.sourceCoverArtUrl ? "Uploaded cover art" : "No cover art" }}</strong>
              <Button v-if="release.submission.sourceCoverArtUrl" variant="secondary" size="sm" class="review-download-button" as-child>
                <a :href="submissionAssetDownloadUrl(release.submission.id, 'cover')" download>
                  <Download class="size-4" />
                  Download cover
                </a>
              </Button>
            </div>

            <div class="review-copy-section">
              <strong>Artists</strong>
              <div class="review-credit-list">
                <div
                  v-for="(artistCredit, artistIndex) in releaseArtistChronology(release)"
                  :key="`submission-artist-${release.id}-${artistCredit.creditedName}-${artistIndex}`"
                  class="review-copy-row"
                >
                  <span>
                    <strong>{{ artistCredit.creditedName }}</strong>
                    <em>{{ artistCredit.roleCodes.join(", ") }}</em>
                  </span>
                  <button type="button" class="review-copy-button" :aria-label="`Copy ${artistCredit.creditedName}`" @click="copyReviewText(`submission-${release.id}-artist-${artistIndex}`, artistCredit.creditedName)">
                    <component :is="reviewCopyIcon(`submission-${release.id}-artist-${artistIndex}`)" class="size-4" />
                  </button>
                </div>
              </div>
            </div>

            <div class="review-copy-section">
              <strong>Tracks</strong>
              <div class="review-copy-track-list">
                <div v-for="(track, trackIndex) in release.tracks" :key="`submission-track-${track.id}`" class="review-copy-track">
                  <div class="review-copy-track-head">
                    <div class="review-copy-grid review-copy-grid-compact">
                      <div class="review-copy-field">
                        <span>Track name</span>
                        <strong>{{ track.title }}</strong>
                        <button type="button" class="review-copy-button" aria-label="Copy track name" @click="copyReviewText(`submission-${release.id}-track-${track.id}-title`, track.title)">
                          <component :is="reviewCopyIcon(`submission-${release.id}-track-${track.id}-title`)" class="size-4" />
                        </button>
                      </div>

                      <div class="review-copy-field">
                        <span>TikTok time</span>
                        <strong>{{ formatTiktokPreviewTime(track.tiktokPreviewStartSeconds) }}</strong>
                        <button type="button" class="review-copy-button" aria-label="Copy TikTok time" @click="copyReviewText(`submission-${release.id}-track-${track.id}-tiktok`, formatTiktokPreviewTime(track.tiktokPreviewStartSeconds))">
                          <component :is="reviewCopyIcon(`submission-${release.id}-track-${track.id}-tiktok`)" class="size-4" />
                        </button>
                      </div>
                    </div>

                    <Button v-if="submittedTrackAssetUrl(release, track)" variant="secondary" size="sm" class="review-download-button" as-child>
                      <a :href="submittedTrackAssetUrl(release, track)" download>
                        <Download class="size-4" />
                        Download track
                      </a>
                    </Button>
                  </div>

                  <div class="review-credit-list">
                    <div
                      v-for="credit in groupedCreditRows(orderedCredits(track.credits))"
                      :key="`submission-credit-${track.id}-${credit.creditedName}-${credit.roleCodes.join('-')}`"
                      class="review-copy-row"
                    >
                      <span>
                        <strong>{{ credit.creditedName }}</strong>
                        <em>{{ credit.roleCodes.join(", ") }}</em>
                      </span>
                      <button type="button" class="review-copy-button" :aria-label="`Copy ${credit.creditedName} credit`" @click="copyReviewText(`submission-${release.id}-track-${track.id}-credit-${credit.creditedName}`, trackCreditCopyText(credit))">
                        <component :is="reviewCopyIcon(`submission-${release.id}-track-${track.id}-credit-${credit.creditedName}`)" class="size-4" />
                      </button>
                    </div>
                    <span v-if="!track.credits.length" class="detail-copy">No credits on this track.</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="release.submission.status === 'pending_review'" class="submission-review-actions review-decision-actions">
              <Button :disabled="submissionActing[release.submission.id]" @click="approveSubmission(release)">
                {{ submissionActing[release.submission.id] ? "Working..." : "Approve and schedule" }}
              </Button>
              <Button variant="destructive" :disabled="submissionActing[release.submission.id]" @click="rejectSubmission(release)">
                {{ submissionActing[release.submission.id] ? "Working..." : "Reject submission" }}
              </Button>
            </div>

            <div v-else-if="release.displayStatus === 'scheduled'" class="submission-review-actions review-decision-actions">
              <Button :disabled="releasePublishing[release.id]" @click="publishRelease(release.id)">
                {{ releasePublishing[release.id] ? "Publishing..." : "Publish live" }}
              </Button>
            </div>
          </section>

          <section v-if="activeReleaseDetailTab === 'overview' && !release.submission" class="release-edit-section">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Release metadata</strong>
                <span class="detail-copy">Title, genre, UPC, cover URL, link, and release status.</span>
              </div>
            </div>
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
          </section>

      <div v-if="activeReleaseDetailTab === 'overview' && !release.submission" class="flex flex-wrap gap-2">
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

          <div v-if="activeReleaseDetailTab === 'overview' && !release.submission && release.takedownReason" class="summary-table">
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

            <div v-if="release.currentRequest" class="request-copy-sheet">
              <div class="review-copy-grid">
                <div class="review-copy-field">
                  <span>Release title</span>
                  <strong>{{ requestSnapshotReleaseTitle(release.currentRequest) }}</strong>
                  <button type="button" class="review-copy-button" aria-label="Copy release title" @click="copyReviewText(`release-request-${release.currentRequest.id}-title`, requestSnapshotReleaseTitle(release.currentRequest))">
                    <component :is="reviewCopyIcon(`release-request-${release.currentRequest.id}-title`)" class="size-4" />
                  </button>
                </div>

                <div class="review-copy-field">
                  <span>Artist</span>
                  <strong>{{ release.currentRequest.requesterArtistName }}</strong>
                  <button type="button" class="review-copy-button" aria-label="Copy artist name" @click="copyReviewText(`release-request-${release.currentRequest.id}-artist`, release.currentRequest.requesterArtistName)">
                    <component :is="reviewCopyIcon(`release-request-${release.currentRequest.id}-artist`)" class="size-4" />
                  </button>
                </div>

                <div class="review-copy-field">
                  <span>Genre</span>
                  <strong>{{ requestSnapshotGenre(release.currentRequest) }}</strong>
                  <button type="button" class="review-copy-button" aria-label="Copy genre" @click="copyReviewText(`release-request-${release.currentRequest.id}-genre`, requestSnapshotGenre(release.currentRequest))">
                    <component :is="reviewCopyIcon(`release-request-${release.currentRequest.id}-genre`)" class="size-4" />
                  </button>
                </div>

                <div class="review-copy-field">
                  <span>Release date</span>
                  <strong>{{ requestSnapshotReleaseDate(release.currentRequest) }}</strong>
                  <button type="button" class="review-copy-button" aria-label="Copy release date" @click="copyReviewText(`release-request-${release.currentRequest.id}-date`, requestSnapshotReleaseDate(release.currentRequest))">
                    <component :is="reviewCopyIcon(`release-request-${release.currentRequest.id}-date`)" class="size-4" />
                  </button>
                </div>
              </div>

              <div v-if="release.currentRequest.takedownReason" class="review-copy-field review-copy-field-wide">
                <span>Takedown reason</span>
                <strong>{{ release.currentRequest.takedownReason }}</strong>
                <button type="button" class="review-copy-button" aria-label="Copy takedown reason" @click="copyReviewText(`release-request-${release.currentRequest.id}-reason`, release.currentRequest.takedownReason)">
                  <component :is="reviewCopyIcon(`release-request-${release.currentRequest.id}-reason`)" class="size-4" />
                </button>
              </div>

              <div v-if="release.currentRequest.snapshot.tracks.length" class="review-copy-section">
                <strong>Tracks</strong>
                <div class="review-copy-track-list">
                  <div v-for="(track, trackIndex) in release.currentRequest.snapshot.tracks" :key="`release-request-track-${release.currentRequest.id}-${trackIndex}`" class="review-copy-track">
                    <div class="review-copy-grid review-copy-grid-compact">
                      <div class="review-copy-field">
                        <span>Track name</span>
                        <strong>{{ requestSnapshotTrackTitle(objectValue(track), trackIndex) }}</strong>
                        <button type="button" class="review-copy-button" aria-label="Copy track name" @click="copyReviewText(`release-request-${release.currentRequest.id}-track-${trackIndex}-title`, requestSnapshotTrackTitle(objectValue(track), trackIndex))">
                          <component :is="reviewCopyIcon(`release-request-${release.currentRequest.id}-track-${trackIndex}-title`)" class="size-4" />
                        </button>
                      </div>

                      <div class="review-copy-field">
                        <span>TikTok time</span>
                        <strong>{{ requestSnapshotTrackTiktok(objectValue(track)) }}</strong>
                        <button type="button" class="review-copy-button" aria-label="Copy TikTok time" @click="copyReviewText(`release-request-${release.currentRequest.id}-track-${trackIndex}-tiktok`, requestSnapshotTrackTiktok(objectValue(track)))">
                          <component :is="reviewCopyIcon(`release-request-${release.currentRequest.id}-track-${trackIndex}-tiktok`)" class="size-4" />
                        </button>
                      </div>
                    </div>

                    <div class="review-credit-list">
                      <div
                        v-for="credit in requestSnapshotTrackCredits(release.currentRequest, objectValue(track), trackIndex)"
                        :key="`release-request-credit-${release.currentRequest.id}-${trackIndex}-${credit.creditedName}-${credit.roleCodes.join('-')}`"
                        class="review-copy-row"
                      >
                        <span>
                          <strong>{{ credit.creditedName }}</strong>
                          <em>{{ credit.roleCodes.join(", ") }}</em>
                        </span>
                        <button type="button" class="review-copy-button" :aria-label="`Copy ${credit.creditedName} credit`" @click="copyReviewText(`release-request-${release.currentRequest.id}-credit-${trackIndex}-${credit.creditedName}`, trackCreditCopyText(credit))">
                          <component :is="reviewCopyIcon(`release-request-${release.currentRequest.id}-credit-${trackIndex}-${credit.creditedName}`)" class="size-4" />
                        </button>
                      </div>
                      <span v-if="!requestSnapshotTrackCredits(release.currentRequest, objectValue(track), trackIndex).length" class="detail-copy">No credits in this request.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button :disabled="requestActing[release.currentRequest.id]" @click="reviewRequest(release.currentRequest.id, 'approve')">
                  {{ requestActing[release.currentRequest.id] ? "Working..." : "Approve and apply" }}
                </Button>
                <Button variant="destructive" :disabled="requestActing[release.currentRequest.id]" @click="reviewRequest(release.currentRequest.id, 'reject')">
                  {{ requestActing[release.currentRequest.id] ? "Working..." : "Reject" }}
                </Button>
              </div>
            </div>

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
                  {{ version.contributors.map((contributor) => `${contributor.artistName} (${contributor.role} ${contributor.splitPct.toFixed(2)}%)`).join(", ") || "No active collaborators / Owner share 100.00%" }}
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
                    <Button
                      v-if="findReleaseCurrentContributor(release, contributor)"
                      variant="destructive"
                      :disabled="releaseSplitSaving[release.id]"
                      @click="stopReleaseDraftContributor(release, contributor)"
                    >
                      <CircleSlash class="size-4" aria-hidden="true" />
                      <span>Stop collaboration</span>
                    </Button>
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

          <div v-if="activeReleaseDetailTab === 'tracks'" class="release-edit-section">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Tracks</strong>
                <span class="detail-copy">Each track keeps its own credits and may override the release split map.</span>
              </div>
              <Button variant="secondary" size="sm" @click="openAddTrack">
                <Plus class="size-4" />
                Add track
              </Button>
            </div>

            <DataTable
              :columns="trackTableColumns"
              :data="release.tracks"
              row-key="id"
              empty-title="No tracks"
              empty-description="No tracks on this release yet."
            >
              <template #cell-track="{ row: track }">
                <strong>{{ track.trackNumber ? `${track.trackNumber}. ` : "" }}{{ track.title }}</strong>
                <div class="detail-copy">{{ track.versionLine || "Original" }}{{ track.containsAiGeneratedElements ? " · AI elements" : "" }}</div>
              </template>
              <template #cell-isrc="{ row: track }">
                <span class="mono">{{ track.isrc || "No ISRC" }}</span>
              </template>
              <template #cell-credits="{ row: track }">
                <span class="tabular-nums">{{ track.credits.length }}</span>
              </template>
              <template #cell-status="{ row: track }">
                <StatusBadge :tone="statusTone(track.status)">{{ formatStatusLabel(track.status) }}</StatusBadge>
              </template>
              <template #cell-actions="{ row: track }">
                <RowActions :actions="trackRowActions(track)" @select="(key) => onTrackAction(key, track, release.status)" />
              </template>
            </DataTable>
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
                  <span class="detail-copy">{{ releaseTimelineActorLabel(entry) }} / {{ formatDateTime(entry.createdAt) }}</span>
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

    <!-- Edit track (from the release detail dialog tracks table) -->
    <FormDialog
      v-model:open="trackEditOpen"
      :title="activeTrack ? `Edit track — ${activeTrack.title}` : 'Edit track'"
      :description="selectedRelease?.title"
      :error="trackEditOpen ? pageError : ''"
      content-class="admin-release-child-dialog admin-track-editor-dialog max-w-4xl"
    >
      <div v-if="activeTrack && trackDrafts[activeTrack.id] && trackCreditDrafts[activeTrack.id] && trackSplitDrafts[activeTrack.id]" class="track-editor-shell">
        <section class="track-editor-panel track-editor-details-panel">
          <div class="track-editor-section-header">
            <strong>Track details</strong>
            <span>Core metadata and review fields</span>
          </div>
          <div class="track-editor-grid">
            <div class="field-row track-editor-field-title">
              <label :for="`track-title-${activeTrack.id}`">Track title</label>
              <Input :id="`track-title-${activeTrack.id}`" v-model="trackDrafts[activeTrack.id].title" type="text" />
            </div>
            <div class="field-row track-editor-field-isrc">
              <label :for="`track-isrc-${activeTrack.id}`">ISRC</label>
              <Input :id="`track-isrc-${activeTrack.id}`" v-model="trackDrafts[activeTrack.id].isrc" class="font-mono" type="text" />
            </div>
            <div class="field-row track-editor-field-small">
              <label :for="`track-number-${activeTrack.id}`">Track no.</label>
              <Input :id="`track-number-${activeTrack.id}`" v-model="trackDrafts[activeTrack.id].trackNumber" type="number" min="1" />
            </div>
            <div class="field-row track-editor-field-third">
              <label :for="`track-tiktok-${activeTrack.id}`">TikTok time</label>
              <Input :id="`track-tiktok-${activeTrack.id}`" v-model="trackDrafts[activeTrack.id].tiktokPreviewStartSeconds" type="number" min="0" max="3599" />
            </div>
            <div class="field-row track-editor-field-third">
              <label :for="`track-version-${activeTrack.id}`">Version line</label>
              <Input :id="`track-version-${activeTrack.id}`" v-model="trackDrafts[activeTrack.id].versionLine" type="text" />
            </div>
            <div class="field-row track-editor-field-third">
              <label :for="`track-status-${activeTrack.id}`">Status</label>
              <NativeSelect :id="`track-status-${activeTrack.id}`" v-model="trackDrafts[activeTrack.id].status">
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="deleted">Deleted</option>
              </NativeSelect>
            </div>
            <Label class="field-row checkbox-row track-editor-toggle">
              <Checkbox v-model="trackDrafts[activeTrack.id].containsAiGeneratedElements" />
              <span>Contains AI-generated elements</span>
            </Label>
            <div class="field-row track-editor-field-full">
              <label :for="`track-audio-${activeTrack.id}`">Audio preview URL</label>
              <Input :id="`track-audio-${activeTrack.id}`" v-model="trackDrafts[activeTrack.id].audioPreviewUrl" type="url" />
            </div>
            <div class="field-row track-editor-field-full">
              <label :for="`track-lyrics-${activeTrack.id}`">Lyrics</label>
              <Textarea :id="`track-lyrics-${activeTrack.id}`" v-model="trackDrafts[activeTrack.id].lyrics" rows="5" />
            </div>
          </div>
          <div class="track-editor-actions">
            <Button variant="secondary" :disabled="trackSaving[activeTrack.id]" @click="saveTrack(activeTrack.id)">
              {{ trackSaving[activeTrack.id] ? "Saving..." : "Save details" }}
            </Button>
            <Button
              variant="destructive"
              :disabled="trackSaving[activeTrack.id] || activeTrack.status === 'deleted'"
              @click="selectedRelease && deleteTrack(activeTrack.id, selectedRelease.status, activeTrack.title)"
            >
              {{ activeTrack.status === "deleted" ? "Track deleted" : "Delete track" }}
            </Button>
          </div>
        </section>

        <section class="track-editor-panel">
          <div class="track-editor-section-header">
            <strong>Credits</strong>
            <span>Names and roles shown on the artist release page</span>
          </div>
          <div class="release-credit-table-frame release-credit-edit-table-frame">
            <Table class="release-credit-table release-credit-edit-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Credited name</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead class="release-credit-action-head">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(credit, creditIndex) in trackCreditDrafts[activeTrack.id]" :key="`track-credit-${activeTrack.id}-${creditIndex}`">
                  <TableCell class="release-credit-name-cell">
                    <label class="sr-only" :for="`track-credit-name-${activeTrack.id}-${creditIndex}`">Credited name</label>
                    <Input
                      :id="`track-credit-name-${activeTrack.id}-${creditIndex}`"
                      v-model="credit.creditedName"
                      type="text"
                      placeholder="Credited name"
                    />
                  </TableCell>
                  <TableCell class="release-credit-roles-cell">
                    <label class="sr-only" :for="`track-credit-role-search-${activeTrack.id}-${creditIndex}`">Roles</label>
                    <CreditRoleMultiSelect
                      :input-id="`track-credit-role-search-${activeTrack.id}-${creditIndex}`"
                      v-model="credit.roleCodes"
                      compact
                    />
                  </TableCell>
                  <TableCell class="release-credit-action-cell">
                    <Button variant="destructive" size="sm" @click="removeTrackCredit(activeTrack.id, creditIndex)">
                      <Trash2 class="size-4" aria-hidden="true" />
                      <span>Remove</span>
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div class="track-editor-actions">
            <Button variant="secondary" @click="addTrackCredit(activeTrack.id)">Add credit</Button>
            <Button :disabled="trackCreditSaving[activeTrack.id]" @click="saveTrackCredits(activeTrack.id)">
              {{ trackCreditSaving[activeTrack.id] ? "Saving..." : "Save credits" }}
            </Button>
          </div>
        </section>

        <section class="track-editor-panel track-editor-panel-muted">
          <div class="track-editor-section-header">
            <strong>Track split history</strong>
            <span>Only use this when the track differs from release splits</span>
          </div>

          <div v-if="activeTrack.splitHistory.length" class="catalog-subitems">
            <div v-for="version in activeTrack.splitHistory" :key="version.id" class="catalog-subitem catalog-subitem-compact">
              <div class="summary-copy">
                <strong>{{ formatMonth(version.effectivePeriodMonth) }}</strong>
                <span class="detail-copy">{{ version.changeReason || "No reason provided" }}</span>
                <span class="detail-copy">Saved {{ formatDateTime(version.createdAt) }}</span>
              </div>
              <div class="detail-copy">
                {{ version.contributors.map((contributor) => `${contributor.artistName} (${contributor.role} ${contributor.splitPct.toFixed(2)}%)`).join(", ") || "No active collaborators / Owner share 100.00%" }}
              </div>
            </div>
          </div>

          <div class="catalog-grid catalog-grid-wide">
            <div class="field-row">
              <label :for="`track-split-month-${activeTrack.id}`">Effective month</label>
              <AppMonthPicker :id="`track-split-month-${activeTrack.id}`" v-model="trackSplitDrafts[activeTrack.id].effectivePeriodMonth" required />
            </div>
            <div class="field-row field-row-full">
              <label :for="`track-split-reason-${activeTrack.id}`">Change reason</label>
              <Input :id="`track-split-reason-${activeTrack.id}`" v-model="trackSplitDrafts[activeTrack.id].changeReason" type="text" />
            </div>
          </div>

          <div class="catalog-subitems">
            <div v-for="(contributor, contributorIndex) in trackSplitDrafts[activeTrack.id].contributors" :key="`track-split-${activeTrack.id}-${contributorIndex}`" class="catalog-subitem catalog-subitem-compact">
              <div class="catalog-grid catalog-grid-wide">
                <div class="field-row">
                  <label :for="`track-split-artist-${activeTrack.id}-${contributorIndex}`">Artist</label>
                  <NativeSelect :id="`track-split-artist-${activeTrack.id}-${contributorIndex}`" v-model="contributor.artistId">
                    <option value="">Select artist</option>
                    <option v-for="artist in artists" :key="artist.id" :value="artist.id">{{ artist.name }}</option>
                  </NativeSelect>
                </div>
                <div class="field-row">
                  <label :for="`track-split-role-${activeTrack.id}-${contributorIndex}`">Role</label>
                  <Input :id="`track-split-role-${activeTrack.id}-${contributorIndex}`" v-model="contributor.role" type="text" />
                </div>
                <div class="field-row">
                  <label :for="`track-split-pct-${activeTrack.id}-${contributorIndex}`">Split %</label>
                  <Input :id="`track-split-pct-${activeTrack.id}-${contributorIndex}`" v-model="contributor.splitPct" type="number" min="0" max="100" step="0.01" />
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <Button
                  v-if="findTrackCurrentContributor(activeTrack, contributor)"
                  variant="destructive"
                  size="sm"
                  :disabled="trackSplitSaving[activeTrack.id]"
                  @click="stopTrackDraftContributor(activeTrack, contributor)"
                >
                  <CircleSlash class="size-4" aria-hidden="true" />
                  <span>Stop collaboration</span>
                </Button>
                <Button variant="destructive" size="sm" @click="removeTrackSplitContributor(activeTrack.id, contributorIndex)">Remove row</Button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button variant="secondary" @click="addTrackSplitContributor(activeTrack.id)">Add contributor</Button>
            <Button :disabled="trackSplitSaving[activeTrack.id]" @click="saveTrackSplit(activeTrack.id)">
              {{ trackSplitSaving[activeTrack.id] ? "Saving..." : "Save track split version" }}
            </Button>
          </div>
        </section>
      </div>

      <template #footer>
        <Button variant="ghost" @click="trackEditOpen = false">Close</Button>
      </template>
    </FormDialog>

    <!-- Add track -->
    <FormDialog
      v-model:open="trackAddOpen"
      title="Add track"
      :description="selectedRelease?.title"
      submit-label="Add track"
      :pending="selectedRelease ? trackCreating[selectedRelease.id] : false"
      :error="trackAddOpen ? pageError : ''"
      :submit-disabled="!selectedRelease || !newTrackDrafts[selectedRelease.id]?.title"
      content-class="admin-release-child-dialog admin-track-editor-dialog admin-track-add-dialog max-w-3xl"
      @submit="selectedRelease && createTrack(selectedRelease.id)"
    >
      <div v-if="selectedRelease && newTrackDrafts[selectedRelease.id]" class="track-editor-shell">
        <section class="track-editor-panel track-editor-details-panel">
          <div class="track-editor-section-header">
            <strong>Track details</strong>
            <span>Add the basics first; credits sit below</span>
          </div>
          <div class="track-editor-grid">
            <div class="field-row track-editor-field-title">
              <label :for="`new-track-title-${selectedRelease.id}`">Track title</label>
              <Input :id="`new-track-title-${selectedRelease.id}`" v-model="newTrackDrafts[selectedRelease.id].title" type="text" />
            </div>
            <div class="field-row track-editor-field-isrc">
              <label :for="`new-track-isrc-${selectedRelease.id}`">ISRC</label>
              <Input :id="`new-track-isrc-${selectedRelease.id}`" v-model="newTrackDrafts[selectedRelease.id].isrc" class="font-mono" type="text" />
            </div>
            <div class="field-row track-editor-field-small">
              <label :for="`new-track-number-${selectedRelease.id}`">Track no.</label>
              <Input :id="`new-track-number-${selectedRelease.id}`" v-model="newTrackDrafts[selectedRelease.id].trackNumber" type="number" min="1" />
            </div>
            <div class="field-row track-editor-field-third">
              <label :for="`new-track-tiktok-${selectedRelease.id}`">TikTok time</label>
              <Input :id="`new-track-tiktok-${selectedRelease.id}`" v-model="newTrackDrafts[selectedRelease.id].tiktokPreviewStartSeconds" type="number" min="0" max="3599" />
            </div>
            <div class="field-row track-editor-field-third">
              <label :for="`new-track-version-${selectedRelease.id}`">Version line</label>
              <Input :id="`new-track-version-${selectedRelease.id}`" v-model="newTrackDrafts[selectedRelease.id].versionLine" type="text" />
            </div>
            <div class="field-row track-editor-field-third">
              <label :for="`new-track-status-${selectedRelease.id}`">Status</label>
              <NativeSelect :id="`new-track-status-${selectedRelease.id}`" v-model="newTrackDrafts[selectedRelease.id].status">
                <option value="draft">Draft</option>
                <option value="live">Live</option>
                <option value="deleted">Deleted</option>
              </NativeSelect>
            </div>
            <Label class="field-row checkbox-row track-editor-toggle">
              <Checkbox v-model="newTrackDrafts[selectedRelease.id].containsAiGeneratedElements" />
              <span>Contains AI-generated elements</span>
            </Label>
            <div class="field-row track-editor-field-full">
              <label :for="`new-track-audio-${selectedRelease.id}`">Audio preview URL</label>
              <Input :id="`new-track-audio-${selectedRelease.id}`" v-model="newTrackDrafts[selectedRelease.id].audioPreviewUrl" type="url" />
            </div>
            <div class="field-row track-editor-field-full">
              <label :for="`new-track-lyrics-${selectedRelease.id}`">Lyrics</label>
              <Textarea :id="`new-track-lyrics-${selectedRelease.id}`" v-model="newTrackDrafts[selectedRelease.id].lyrics" rows="4" />
            </div>
          </div>
        </section>

        <section v-if="newTrackDrafts[selectedRelease.id].credits[0]" class="track-editor-panel track-editor-panel-muted">
          <div class="track-editor-section-header">
            <strong>First credit</strong>
            <span>You can add more credits after the track is created</span>
          </div>
          <div class="track-editor-credit-grid">
            <div class="field-row">
              <label for="new-track-credit-name">Credited name</label>
              <Input id="new-track-credit-name" v-model="newTrackDrafts[selectedRelease.id].credits[0].creditedName" type="text" />
            </div>
            <div class="field-row">
              <label>Roles</label>
              <CreditRoleMultiSelect input-id="new-track-credit-roles" v-model="newTrackDrafts[selectedRelease.id].credits[0].roleCodes" />
            </div>
          </div>
        </section>
      </div>
    </FormDialog>
  </div>
</template>

<style scoped>
:global(.dialog-morph-overlay:has(+ .admin-release-child-dialog)),
:global(.admin-release-child-dialog) {
  z-index: 60 !important;
}

:global(.admin-track-editor-dialog) {
  width: min(960px, calc(100vw - 32px)) !important;
  max-width: min(960px, calc(100vw - 32px)) !important;
  padding: 22px !important;
}

:global(.admin-track-add-dialog) {
  width: min(860px, calc(100vw - 32px)) !important;
  max-width: min(860px, calc(100vw - 32px)) !important;
}

:global(.admin-track-editor-dialog .form-dialog-body) {
  max-height: min(72vh, 700px) !important;
  padding-right: 6px !important;
}

.release-page-alerts {
  display: grid;
  gap: 8px;
}

.release-table-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.release-table-thumb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 34px;
  overflow: hidden;
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 80%, var(--primary));
  color: var(--muted-foreground);
}

.release-table-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.release-table-titletext {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.release-table-titletext strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.release-table-request {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--primary) 18%, transparent);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
}

.release-edit-section {
  display: grid;
  gap: 12px;
}

.release-dialog-stack {
  display: grid;
  gap: 20px;
}

.track-editor-shell {
  display: grid;
  gap: 14px;
}

.track-editor-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--background)) 0%, color-mix(in srgb, var(--card) 86%, var(--background)) 100%),
    var(--card);
}

.track-editor-panel-muted {
  background: color-mix(in srgb, var(--muted) 18%, transparent);
}

.track-editor-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.track-editor-section-header strong {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.2;
}

.track-editor-section-header span {
  min-width: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 620;
  line-height: 1.35;
  text-align: right;
}

.track-editor-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  align-items: end;
}

.track-editor-grid .field-row {
  gap: 6px;
}

.track-editor-grid .field-row label,
.track-editor-credit-grid .field-row label {
  color: color-mix(in srgb, var(--foreground) 88%, var(--muted-foreground));
  font-size: 12px;
  font-weight: 760;
  line-height: 1.25;
}

.track-editor-field-title {
  grid-column: span 3;
}

.track-editor-field-isrc {
  grid-column: span 2;
}

.track-editor-field-small {
  grid-column: span 1;
}

.track-editor-field-third {
  grid-column: span 2;
}

.track-editor-field-full {
  grid-column: 1 / -1;
}

.track-editor-panel :deep(input),
.track-editor-panel :deep(textarea),
.track-editor-panel :deep([data-slot="native-select"]) {
  min-height: 42px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 76%, transparent);
}

.track-editor-panel :deep(textarea) {
  min-height: 92px;
  resize: vertical;
}

.track-editor-toggle {
  grid-column: span 2;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 10px 12px;
  cursor: pointer;
  border-color: color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--muted) 18%, transparent);
}

.track-editor-toggle :deep(button) {
  width: 18px;
  height: 18px;
}

.track-editor-toggle span {
  min-width: 0;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 720;
  line-height: 1.2;
}

.track-editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 2px;
}

.track-editor-credit-grid {
  display: grid;
  grid-template-columns: minmax(180px, 0.75fr) minmax(0, 1.25fr);
  gap: 12px;
  align-items: end;
}

.track-editor-panel .release-credit-table-frame {
  margin: 0;
  border-radius: 10px;
}

.dialog-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.admin-release-filter-card {
  display: grid;
  gap: 12px;
  margin-bottom: 14px;
  padding: 14px;
  border-color: color-mix(in srgb, var(--border) 86%, var(--primary) 14%);
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--primary)) 0%, color-mix(in srgb, var(--card) 92%, var(--background)) 100%),
    var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-depth-quiet));
}

.admin-release-filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}

.admin-release-filter-heading .summary-copy {
  display: flex;
  align-items: center;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 5px 10px;
  min-width: 0;
}

.admin-release-filter-heading .eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: color-mix(in srgb, var(--muted-foreground) 78%, var(--foreground));
  font-size: 11px;
  letter-spacing: 0.04em;
}

.admin-release-filter-heading .summary-copy strong {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 750;
}

.admin-release-filter-heading .detail-copy {
  color: var(--muted-foreground);
  font-size: 12px;
}

.admin-release-filter-reset {
  width: 100%;
  min-height: 38px;
  justify-content: center;
  border-color: color-mix(in srgb, var(--primary) 34%, var(--border));
  background: color-mix(in srgb, var(--primary) 88%, #5c4311);
  color: var(--primary-foreground);
  box-shadow: 0 10px 18px -14px color-mix(in srgb, var(--primary) 70%, transparent);
}

.admin-release-filter-grid {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) repeat(4, minmax(140px, 1fr)) minmax(112px, 0.7fr);
  gap: 10px;
  align-items: end;
}

.admin-release-filter-card .field-row {
  gap: 5px;
  min-width: 0;
}

.admin-release-filter-card .field-row label {
  color: color-mix(in srgb, var(--muted-foreground) 84%, var(--foreground));
  font-size: 10px;
  font-weight: 760;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.admin-release-filter-search {
  grid-column: span 2;
}

.admin-release-filter-action {
  align-self: end;
}

.admin-release-search-control {
  position: relative;
}

.admin-release-search-control > svg {
  position: absolute;
  left: 12px;
  top: 50%;
  z-index: 1;
  color: var(--muted-foreground);
  transform: translateY(-50%);
  pointer-events: none;
}

.admin-release-search-control :deep(input) {
  min-height: 38px;
  padding-left: 38px;
  border-color: color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 68%, var(--card));
}

.admin-release-filter-card :deep([data-slot="native-select"]) {
  min-height: 38px;
  border-color: color-mix(in srgb, var(--border) 84%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--background) 68%, var(--card));
  font-size: 13px;
  font-weight: 650;
}

.admin-release-pagination-top {
  margin-bottom: 14px;
}

.tl-release-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

.admin-release-grid {
  margin-top: 4px;
}

.tl-release-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 12px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 12px;
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
  transition:
    border-color 200ms var(--ease-out, ease),
    box-shadow 250ms var(--ease-out, ease),
    background-color 200ms var(--ease-out, ease),
    transform 200ms var(--ease-out, ease);
}

.tl-release-card:hover,
.tl-release-card:focus-visible {
  border-color: color-mix(in srgb, var(--foreground) 18%, var(--border));
  background: color-mix(in srgb, var(--muted) 14%, var(--card));
  box-shadow: var(--surface-card-shadow-current-hover, var(--shadow-card-hover));
  transform: translateY(-2px);
  outline: none;
}

.tl-release-card-active {
  border-color: color-mix(in srgb, var(--primary) 54%, var(--border)) !important;
  background: color-mix(in srgb, var(--primary) 5%, var(--card));
  box-shadow: var(--surface-card-shadow-current-hover, var(--shadow-card-hover));
}

.tl-release-art {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 88%, var(--primary));
}

.admin-release-art {
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
}

.tl-release-art-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}

.tl-release-art-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  gap: 8px;
  color: var(--muted-foreground);
  font-size: 24px;
  font-weight: 800;
  background:
    radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--primary) 16%, transparent), transparent 34%),
    linear-gradient(135deg, var(--muted) 0%, color-mix(in srgb, var(--muted) 74%, var(--card)) 100%);
}

.tl-release-art-placeholder svg {
  color: color-mix(in srgb, var(--primary) 64%, var(--muted-foreground));
}

.tl-release-art-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  background: rgba(0, 0, 0, 0.42);
  transition: opacity 220ms var(--ease-out, ease);
}

.tl-release-card:hover .tl-release-art-overlay,
.tl-release-card:focus-visible .tl-release-art-overlay {
  opacity: 1;
}

.tl-release-view-label {
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.22);
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
  backdrop-filter: blur(4px);
}

.admin-release-request-chip {
  position: absolute;
  top: 10px;
  right: 10px;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 4px 9px;
  border: 1px solid color-mix(in srgb, var(--priority) 48%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--priority) 86%, #000000);
  color: var(--dashboard-ivory, #fff8dd);
  font-size: 11px;
  font-weight: 800;
}

.tl-release-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}

.tl-release-info {
  display: flex;
  align-items: center;
  min-width: 0;
}

.tl-release-title {
  min-width: 0;
  overflow: hidden;
  color: var(--foreground);
  font-size: 15px;
  font-weight: 750;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 200ms ease;
}

.tl-release-card:hover .tl-release-title,
.tl-release-card:focus-visible .tl-release-title {
  color: var(--primary);
}

.tl-release-artist {
  min-width: 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-release-badge-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 2px;
}

.tl-release-type-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 27px;
  padding: 5px 11px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 750;
  line-height: 1;
  letter-spacing: 0;
}

.tl-release-type-pill {
  border-color: color-mix(in srgb, var(--primary) 24%, var(--border));
  background: color-mix(in srgb, var(--primary) 8%, var(--card));
  color: var(--foreground);
}

.tl-release-type-mark {
  width: 11px;
  height: 11px;
  border-radius: 3px;
  background: var(--primary);
}

.admin-release-card-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 4px;
}

.admin-release-card-facts span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  padding: 8px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 34%, transparent);
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-release-card-facts span:first-child {
  grid-column: 1 / -1;
}

.admin-release-card-facts svg {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--primary) 58%, var(--muted-foreground));
}

.admin-release-track-preview {
  display: -webkit-box;
  min-height: 38px;
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.tl-release-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 18px;
  margin-top: auto;
  color: var(--muted-foreground);
  font-size: 12px;
}

.admin-release-footer {
  justify-content: space-between;
}

.admin-release-footer span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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

.submission-copy-sheet,
.request-copy-sheet {
  display: grid;
  gap: 14px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--card) 88%, var(--background));
}

.request-copy-sheet {
  background: color-mix(in srgb, var(--muted) 22%, transparent);
}

.review-copy-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.review-copy-grid-compact {
  flex: 1 1 420px;
}

.review-copy-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px 8px;
  align-items: center;
  min-width: 0;
  min-height: 58px;
  padding: 9px 10px 9px 12px;
  border: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--background) 58%, transparent);
}

.review-copy-field > span {
  grid-column: 1 / -1;
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.04em;
  line-height: 1.15;
  text-transform: uppercase;
}

.review-copy-field > strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: 14px;
  font-weight: 760;
  line-height: 1.25;
}

.review-copy-field-wide {
  grid-template-columns: minmax(0, 1fr) auto;
}

.review-copy-section {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.review-copy-section > strong {
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.review-copy-track-list {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.review-copy-track {
  display: grid;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 12%, transparent);
}

.review-copy-track-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.review-credit-list {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.review-copy-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 7px 8px 7px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--background) 48%, transparent);
}

.review-copy-row > span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.review-copy-row strong,
.review-copy-row em {
  min-width: 0;
  overflow-wrap: anywhere;
}

.review-copy-row strong {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 750;
}

.review-copy-row em {
  color: var(--muted-foreground);
  font-size: 12px;
  font-style: normal;
  font-weight: 620;
}

.review-copy-button {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  flex: none;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--muted) 24%, transparent);
  color: var(--muted-foreground);
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background-color 160ms ease;
}

.review-copy-button:hover,
.review-copy-button:focus-visible {
  border-color: color-mix(in srgb, var(--primary) 44%, var(--border));
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  color: var(--foreground);
  outline: none;
}

.review-download-button {
  justify-self: end;
  white-space: nowrap;
}

.review-download-button a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.review-decision-actions {
  padding-top: 2px;
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
  .admin-release-filter-heading {
    flex-direction: column;
  }

  .admin-release-filter-grid {
    grid-template-columns: 1fr;
  }

  .admin-release-filter-search {
    grid-column: auto;
  }

  .admin-release-filter-reset {
    width: 100%;
    justify-content: center;
  }

  .submission-review-panel,
  .submission-review-metrics,
  .review-copy-grid,
  .track-editor-grid,
  .track-editor-credit-grid,
  .admin-credit-review-grid {
    grid-template-columns: 1fr;
  }

  .track-editor-field-title,
  .track-editor-field-isrc,
  .track-editor-field-small,
  .track-editor-field-third,
  .track-editor-field-full,
  .track-editor-toggle {
    grid-column: auto;
  }

  .submission-review-art {
    width: min(100%, 280px);
  }

  .admin-track-review-main,
  .submission-review-header,
  .track-editor-section-header,
  .review-copy-track-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .track-editor-section-header span {
    text-align: left;
  }

  .review-download-button {
    justify-self: stretch;
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

@media (min-width: 640px) {
  .tl-release-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1180px) {
  .tl-release-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (min-width: 1500px) {
  .tl-release-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .admin-release-card-facts {
    grid-template-columns: 1fr;
  }

  :global(.admin-track-editor-dialog) {
    padding: 18px !important;
  }

  .track-editor-panel {
    padding: 12px;
  }
}

/* Queue position chip inside the review dialog */
.release-review-position {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--line-1, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 36%, transparent);
  color: var(--muted-foreground);
  padding: 3px 10px;
  font-family: var(--font-app-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}

.release-review-keys {
  letter-spacing: 2px;
  opacity: 0.75;
}
</style>
