<script setup lang="ts">
import type { DateValue } from "@internationalized/date"
import { getLocalTimeZone, today as calendarToday } from "@internationalized/date"
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  ImageUp,
  Info,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-vue-next"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  RELEASE_GENRE_OPTIONS,
  RELEASE_STORE_OPTIONS,
  TRACK_ADDITIONAL_CREDIT_ROLE_GROUPS,
  TRACK_ADDITIONAL_CREDIT_ROLE_OPTIONS,
  type ReleaseType,
  type TrackCreditInput,
} from "~~/types/catalog"
import type { ArtistSettingsResponse } from "~~/types/settings"
import { resolveDspLogo } from "~~/app/utils/dsp-logos"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

type UploadKind = "cover" | "audio"
type UploadState = "idle" | "uploading" | "done" | "error"

interface CreditDraft {
  creditedName: string
  roleCodes: string[]
  platformProfileExists?: Partial<Record<AdditionalArtistPlatform, boolean | null>>
  platformProfileUrl?: Partial<Record<AdditionalArtistPlatform, string>>
}

interface AssetUploadTargetResponse {
  bucket: string
  path: string
  token: string
  signedUrl: string
  publicUrl: string
  kind: UploadKind
  filename: string
}

interface UploadTrackDraft {
  id: string
  title: string
  isrc: string
  lyrics: string
  tiktokPreviewMinutes: string
  tiktokPreviewSeconds: string
  versionLine: string
  containsAiGeneratedElements: boolean
  aiGeneratedDetails: string
  audioFile: File | null
  audioInputVersion: number
  audioUploadProgress: number
  audioUploadedUrl: string
  audioUploadXhr: XMLHttpRequest | null
  audioUploadRequestId: number
  uploadState: UploadState
  error: string
  detailsSaved: boolean
  artistCreditsOverridden: boolean
  artistCredits: CreditDraft[]
  writerCredits: CreditDraft[]
  additionalCredits: CreditDraft[]
}

interface ArtistUploadReleaseResponse {
  ok: boolean
  release: {
    id: string
    title: string
  }
  trackCount: number
  storeCount: number
}

const { activeArtistId, activeArtist } = useActiveArtist()
const { viewer } = useViewerContext()
const session = useSupabaseSession()
const runtimeConfig = useRuntimeConfig()
const releaseDateTimeZone = getLocalTimeZone()
const { data: uploadSettingsData } = useLazyFetch<ArtistSettingsResponse>("/api/dashboard/settings", {
  server: false,
})

const nextTrackId = ref(0)
const coverFile = ref<File | null>(null)
const coverInputVersion = ref(0)
const coverPreviewUrl = ref("")
const coverUploadState = ref<UploadState>("idle")
const coverUploadProgress = ref(0)
const coverUploadedUrl = ref("")
const coverUploadXhr = ref<XMLHttpRequest | null>(null)
const coverUploadRequestId = ref(0)
const coverError = ref("")
const isSubmitting = ref(false)
const pageError = ref("")
const pageSuccess = ref("")
const submittedReleaseId = ref("")
const selectedStores = ref<string[]>([...RELEASE_STORE_OPTIONS])
const activeTrackDetailId = ref<string | null>(null)
const activeTrackDetailTab = ref<"essentials" | "credits" | "lyrics">("essentials")
const activeCreditDetailTab = ref<"writers" | "other">("writers")
const customVersionLineTrackIds = ref<string[]>([])
const draggingTrackId = ref<string | null>(null)
const dragOverTrackId = ref<string | null>(null)
const pointerTrackDrag = ref<{ trackId: string; startX: number; startY: number; active: boolean } | null>(null)
const genreSearch = ref("")
const GENRE_VISIBLE_BATCH_SIZE = 48
const visibleGenreLimit = ref(GENRE_VISIBLE_BATCH_SIZE)
const hasAttemptedSubmit = ref(false)
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))
const isUploadDisabled = computed(() => isSubmitting.value || isViewingAsArtist.value)
const coverAiParticles = [
  { x: 10, y: 14, size: 2.5, opacity: 0.46, delay: -120, duration: 2450, driftX: 20, driftY: 18 },
  { x: 24, y: 10, size: 2, opacity: 0.42, delay: -860, duration: 2700, driftX: 13, driftY: 22 },
  { x: 42, y: 8, size: 2.5, opacity: 0.52, delay: -420, duration: 2350, driftX: 3, driftY: 24 },
  { x: 62, y: 11, size: 2, opacity: 0.44, delay: -1300, duration: 2650, driftX: -8, driftY: 22 },
  { x: 82, y: 16, size: 2.5, opacity: 0.5, delay: -620, duration: 2500, driftX: -20, driftY: 16 },
  { x: 14, y: 31, size: 2, opacity: 0.45, delay: -1620, duration: 2800, driftX: 20, driftY: 9 },
  { x: 31, y: 27, size: 3, opacity: 0.58, delay: -230, duration: 2380, driftX: 9, driftY: 11 },
  { x: 51, y: 26, size: 2.5, opacity: 0.54, delay: -940, duration: 2580, driftX: -1, driftY: 12 },
  { x: 70, y: 29, size: 2, opacity: 0.46, delay: -520, duration: 2480, driftX: -12, driftY: 10 },
  { x: 90, y: 34, size: 2.5, opacity: 0.48, delay: -1180, duration: 2740, driftX: -24, driftY: 6 },
  { x: 8, y: 49, size: 3, opacity: 0.54, delay: -730, duration: 2600, driftX: 26, driftY: 0 },
  { x: 24, y: 47, size: 2, opacity: 0.43, delay: -1880, duration: 2900, driftX: 15, driftY: 1 },
  { x: 39, y: 43, size: 2.5, opacity: 0.58, delay: -360, duration: 2360, driftX: 7, driftY: 4 },
  { x: 58, y: 45, size: 2, opacity: 0.46, delay: -1040, duration: 2540, driftX: -5, driftY: 3 },
  { x: 76, y: 48, size: 3, opacity: 0.56, delay: -1490, duration: 2820, driftX: -17, driftY: 0 },
  { x: 92, y: 52, size: 2, opacity: 0.42, delay: -270, duration: 2460, driftX: -28, driftY: -1 },
  { x: 13, y: 68, size: 2.5, opacity: 0.49, delay: -970, duration: 2680, driftX: 22, driftY: -8 },
  { x: 30, y: 70, size: 2, opacity: 0.46, delay: -540, duration: 2440, driftX: 12, driftY: -10 },
  { x: 48, y: 68, size: 3.5, opacity: 0.66, delay: -1420, duration: 2720, driftX: 1, driftY: -9 },
  { x: 66, y: 71, size: 2, opacity: 0.44, delay: -780, duration: 2560, driftX: -10, driftY: -11 },
  { x: 84, y: 66, size: 2.5, opacity: 0.5, delay: -1740, duration: 2860, driftX: -22, driftY: -7 },
  { x: 18, y: 86, size: 2, opacity: 0.42, delay: -310, duration: 2500, driftX: 18, driftY: -22 },
  { x: 35, y: 90, size: 2.5, opacity: 0.48, delay: -1120, duration: 2760, driftX: 8, driftY: -25 },
  { x: 53, y: 91, size: 2, opacity: 0.45, delay: -670, duration: 2460, driftX: -1, driftY: -26 },
  { x: 72, y: 88, size: 2.5, opacity: 0.5, delay: -1510, duration: 2820, driftX: -13, driftY: -22 },
  { x: 89, y: 82, size: 2, opacity: 0.42, delay: -90, duration: 2400, driftX: -25, driftY: -18 },
  { x: 43, y: 57, size: 2, opacity: 0.48, delay: -1960, duration: 2940, driftX: 4, driftY: -3 },
  { x: 60, y: 58, size: 2.5, opacity: 0.52, delay: -1260, duration: 2660, driftX: -6, driftY: -4 },
].map((particle, index) => ({
  id: `cover-ai-particle-${index + 1}`,
  style: {
    "--cover-particle-x": `${particle.x}%`,
    "--cover-particle-y": `${particle.y}%`,
    "--cover-particle-size": `${particle.size}px`,
    "--cover-particle-opacity": String(particle.opacity),
    "--cover-particle-delay": `${particle.delay}ms`,
    "--cover-particle-duration": `${particle.duration}ms`,
    "--cover-particle-drift-x": `${particle.driftX}px`,
    "--cover-particle-drift-y": `${particle.driftY}px`,
  },
}))

const form = reactive({
  artistId: "",
  title: "",
  type: "single" as ReleaseType,
  genre: "Pop",
  releaseDate: defaultReleaseDate(),
  notes: "",
})

const tracks = ref<UploadTrackDraft[]>([createTrackDraft()])

const releaseTypeOptions: Array<{ label: string, value: ReleaseType }> = [
  { label: "Single", value: "single" },
  { label: "EP", value: "ep" },
  { label: "Album", value: "album" },
]
const VERSION_LINE_PRESETS = ["Original", "Instrumental", "Acoustic", "Remix"] as const
type VersionLinePreset = typeof VERSION_LINE_PRESETS[number]
const WRITER_CREDIT_ROLE_OPTIONS = ["Composer", "Lyricist"] as const
const WRITER_CREDIT_ROLE_GROUPS = [
  {
    group: "Writer Roles",
    roles: WRITER_CREDIT_ROLE_OPTIONS,
  },
] as const
type CreditDetailSection = "writers" | "other"
const additionalArtistPlatforms = [
  { id: "spotify", label: "Spotify", logoName: "Spotify" },
  { id: "apple_music", label: "Apple Music", logoName: "Apple Music" },
] as const
type AdditionalArtistPlatform = typeof additionalArtistPlatforms[number]["id"]
const additionalArtistRoleOptions = [
  { label: "Main artist", value: "Main Artist" },
  { label: "Featured artist", value: "Featured Artist" },
  { label: "Remixer", value: "Remixer" },
] as const
type AdditionalArtistRole = typeof additionalArtistRoleOptions[number]["value"]
interface AdditionalArtistDraftRow {
  id: string
  name: string
  roleCode: AdditionalArtistRole
}
interface SavedAdditionalArtistOption {
  id: string
  name: string
  profileExists: Partial<Record<AdditionalArtistPlatform, boolean | null>>
  profileUrl: Partial<Record<AdditionalArtistPlatform, string>>
  origin: "local"
}
const nextAdditionalArtistDraftId = ref(0)
const LOCAL_SAVED_ADDITIONAL_ARTISTS_STORAGE_KEY = "naad:uploader:saved-additional-artists"

const releaseTypeLabel = computed(() => releaseTypeOptions.find((option) => option.value === form.type)?.label ?? "Single")
const releaseGenreLabel = computed(() => form.genre || "Select genre")
const releaseGenreMatches = computed(() => {
  const query = genreSearch.value.trim().toLocaleLowerCase()

  if (query) {
    return RELEASE_GENRE_OPTIONS
      .filter((genre) => genre.toLocaleLowerCase().includes(query))
  }

  return RELEASE_GENRE_OPTIONS
})
const visibleReleaseGenres = computed(() => {
  const genres = new Set<string>(releaseGenreMatches.value.slice(0, visibleGenreLimit.value))

  if (form.genre && releaseGenreMatches.value.some((genre) => genre === form.genre)) {
    genres.add(form.genre)
  }

  return Array.from(genres)
})
const hasMoreReleaseGenres = computed(() => visibleGenreLimit.value < releaseGenreMatches.value.length)
const activeTrackDetail = computed(() => tracks.value.find((track) => track.id === activeTrackDetailId.value) ?? null)
const activeTrackDetailIndex = computed(() => tracks.value.findIndex((track) => track.id === activeTrackDetailId.value))
const settingsFullName = computed(() => uploadSettingsData.value?.profile.fullName.trim() || "")
const releaseArtistLine = computed(() => {
  return selectedArtistName() || "Artist name"
})
const additionalArtistCredits = computed(() => {
  const track = tracks.value[0]

  if (!track) {
    return []
  }

  return track.artistCredits
    .slice(1)
    .map((credit, offset) => {
      const name = credit.creditedName.trim()

      if (!name) {
        return null
      }

      const roleCode = normalizeAdditionalArtistRole(credit.roleCodes[0])

      return {
        id: `${track.id}-${offset + 1}-${name}`,
        creditIndex: offset + 1,
        name,
        roleLabel: additionalArtistRoleLabel(roleCode),
      }
    })
    .filter((credit): credit is NonNullable<typeof credit> => Boolean(credit))
})
const coverProgressDetail = computed(() => {
  if (!coverFile.value || coverUploadState.value === "idle") {
    return "JPG/PNG · 3000x3000 · RGB"
  }

  if (coverUploadState.value === "uploading") {
    const uploadedBytes = Math.round(coverFile.value.size * (coverUploadProgress.value / 100))
    return `${formatFileSize(uploadedBytes)} / ${formatFileSize(coverFile.value.size)}`
  }

  if (coverUploadState.value === "done") {
    return "Added"
  }

  return coverError.value || "Upload failed"
})
const readyTrackCount = computed(() => tracks.value.filter((track) => hasTrackAudioSource(track)).length)
const missingAudioCount = computed(() => tracks.value.filter((track) => !hasTrackAudioSource(track)).length)
const completeTrackDataCount = computed(() => tracks.value.filter((track, trackIndex) => !validateTrackDetails(track, trackIndex)).length)
const missingTrackDataCount = computed(() => tracks.value.length - completeTrackDataCount.value)
const platformMarqueeStores = computed(() => selectedStores.value.length ? selectedStores.value : RELEASE_STORE_OPTIONS)
const platformMarqueeItems = computed(() => platformMarqueeStores.value.filter((name) => Boolean(resolveDspLogo(name)?.assets?.onDark)))
const releaseStatusLabel = computed(() => readinessPercent.value === 100 ? "Ready" : "In progress")
const releaseStatusTone = computed(() => readinessPercent.value === 100 ? "success" : "neutral")
const isAdditionalArtistDialogOpen = ref(false)
const editingAdditionalArtistCreditIndex = ref<number | null>(null)
const localSavedAdditionalArtists = ref<SavedAdditionalArtistOption[]>([])
const additionalArtistDraft = reactive({
  artist: createAdditionalArtistDraftRow(),
  profileExists: {
    spotify: false as boolean | null,
    apple_music: false as boolean | null,
  },
  profileUrl: {
    spotify: "",
    apple_music: "",
  },
})
const savedAdditionalArtistOptions = computed(() => {
  const options = new Map<string, SavedAdditionalArtistOption>()
  const ownArtistName = normalizeSavedAdditionalArtistName(selectedArtistName())

  for (const artist of localSavedAdditionalArtists.value) {
    const name = artist.name.trim()
    const normalizedName = normalizeSavedAdditionalArtistName(name)

    if (!name || normalizedName === ownArtistName) {
      continue
    }

    options.set(normalizedName, {
      ...artist,
      name,
      origin: "local",
    })
  }

  return Array.from(options.values()).sort((left, right) => left.name.localeCompare(right.name))
})
const canSaveAdditionalArtist = computed(() => Boolean(additionalArtistDraft.artist.name.trim()) && !isUploadDisabled.value)
const additionalArtistDialogTitle = computed(() => editingAdditionalArtistCreditIndex.value === null ? "Artist" : "Edit artist")
const additionalArtistSaveLabel = computed(() => editingAdditionalArtistCreditIndex.value === null ? "Save artist" : "Update artist")

const checklistItems = computed(() => [
  {
    label: "Cover artwork",
    detail: coverUploadState.value === "done" ? "Added" : "Add cover",
    complete: coverUploadState.value === "done" && Boolean(coverUploadedUrl.value),
  },
  {
    label: "Audio files",
    detail: missingAudioCount.value ? `${missingAudioCount.value} left` : "Added",
    complete: tracks.value.length > 0 && missingAudioCount.value === 0,
  },
  {
    label: "Track metadata",
    detail: missingTrackDataCount.value ? "Review details" : "Complete",
    complete: tracks.value.length > 0 && missingTrackDataCount.value === 0,
  },
  {
    label: "Rights & ownership",
    detail: missingTrackDataCount.value ? "Review credits" : "Complete",
    complete: tracks.value.length > 0 && missingTrackDataCount.value === 0,
  },
  {
    label: "Delivery settings",
    detail: selectedStores.value.length ? "Ready" : "Choose stores",
    complete: selectedStores.value.length > 0,
  },
])
const completedChecklistCount = computed(() => checklistItems.value.filter((item) => item.complete).length)
const readinessPercent = computed(() => Math.round((completedChecklistCount.value / checklistItems.value.length) * 100))
const readinessSummary = computed(() => `${completedChecklistCount.value} of ${checklistItems.value.length}`)
const nextChecklistItem = computed(() => checklistItems.value.find((item) => !item.complete) ?? null)
const readinessHeadline = computed(() => {
  if (readinessPercent.value === 100) {
    return "Ready to review"
  }

  return nextChecklistItem.value ? `Next: ${nextChecklistItem.value.label}` : "Review package"
})

onMounted(() => {
  loadLocalSavedAdditionalArtists()
})

watch(
  localSavedAdditionalArtists,
  () => {
    persistLocalSavedAdditionalArtists()
  },
  { deep: true },
)

watch(
  activeArtistId,
  (value) => {
    if (value && (!form.artistId || !viewer.value.artistMemberships.some((artist) => artist.id === form.artistId))) {
      form.artistId = value
    }
  },
  { immediate: true },
)

watch(
  () => form.type,
  () => {
    syncSingleReleaseTitle(true)
  },
)

watch(
  () => tracks.value[0]?.title,
  () => {
    syncSingleReleaseTitle()
  },
)

watch(
  () => form.artistId,
  (value, previousValue) => {
    syncDefaultArtistCredits()

    if (!value || !previousValue || value === previousValue) {
      return
    }

    if (coverFile.value) {
      void uploadCoverFile(coverFile.value)
    }

    tracks.value.forEach((track) => {
      if (track.audioFile) {
        void uploadTrackAudioFile(track, track.audioFile)
      }
    })
  },
)

watch(
  () => activeArtist.value?.name,
  () => {
    syncDefaultArtistCredits()
  },
)

watch(
  coverFile,
  (file) => {
    if (coverPreviewUrl.value) {
      URL.revokeObjectURL(coverPreviewUrl.value)
    }

    coverPreviewUrl.value = file ? URL.createObjectURL(file) : ""
  },
)

onBeforeUnmount(() => {
  abortCoverUpload()
  tracks.value.forEach((track) => abortTrackUpload(track))
  cleanupTrackPointerDrag()

  if (coverPreviewUrl.value) {
    URL.revokeObjectURL(coverPreviewUrl.value)
  }
})

function defaultReleaseDate() {
  return formatReleaseDateValue(calendarToday(releaseDateTimeZone).add({ days: 10 }))
}

function formatReleaseDateValue(value: DateValue) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`
}

function selectedArtistName() {
  return selectedArtistNameForId(form.artistId)
    || activeArtist.value?.name
    || viewer.value.impersonation?.artistName
    || viewer.value.artistMemberships[0]?.name
    || settingsFullName.value
    || viewer.value.profile?.fullName
    || ""
}

function selectedArtistNameForId(artistId: string | null | undefined) {
  return viewer.value.artistMemberships.find((artist) => artist.id === artistId)?.name || ""
}

function syncSingleReleaseTitle(preferExistingReleaseTitle = false) {
  if (form.type !== "single") {
    return
  }

  const firstTrack = tracks.value[0]

  if (!firstTrack) {
    return
  }

  if (preferExistingReleaseTitle && form.title.trim() && !firstTrack.title.trim()) {
    firstTrack.title = form.title
    markTrackDetailsUnsaved(firstTrack)
    return
  }

  form.title = firstTrack.title
}

function setReleaseType(value: string | number | null) {
  form.type = String(value ?? "single") as ReleaseType
  syncSingleReleaseTitle(true)
}

function selectReleaseGenre(genre: string, close?: () => void) {
  form.genre = genre
  genreSearch.value = ""
  visibleGenreLimit.value = GENRE_VISIBLE_BATCH_SIZE
  close?.()
}

function handleGenrePopoverOpenChange(open: boolean) {
  visibleGenreLimit.value = GENRE_VISIBLE_BATCH_SIZE

  if (!open) {
    genreSearch.value = ""
  }
}

function loadMoreReleaseGenres() {
  visibleGenreLimit.value = Math.min(
    releaseGenreMatches.value.length,
    visibleGenreLimit.value + GENRE_VISIBLE_BATCH_SIZE,
  )
}

function handleGenreOptionsScroll(event: Event) {
  if (!hasMoreReleaseGenres.value) {
    return
  }

  const target = event.target

  if (!(target instanceof HTMLElement)) {
    return
  }

  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 40) {
    loadMoreReleaseGenres()
  }
}

watch(genreSearch, () => {
  visibleGenreLimit.value = GENRE_VISIBLE_BATCH_SIZE
})

function updateReleaseTitle(value: string | number | null) {
  const nextTitle = String(value ?? "")
  form.title = nextTitle

  if (form.type === "single" && tracks.value[0] && tracks.value[0].title !== nextTitle) {
    tracks.value[0].title = nextTitle
    markTrackDetailsUnsaved(tracks.value[0])
  }
}

function updateTrackTitle(track: UploadTrackDraft, value: string | number | null) {
  const nextTitle = String(value ?? "")
  track.title = nextTitle
  markTrackDetailsUnsaved(track)

  if (form.type === "single" && tracks.value[0]?.id === track.id) {
    form.title = nextTitle
  }
}

function setTrackVersion(track: UploadTrackDraft, value: string | number | null) {
  const nextVersion = String(value ?? "").trim() || "Original"
  track.versionLine = nextVersion
  removeCustomVersionLineTrack(track.id)
  markTrackDetailsUnsaved(track)
}

function isVersionLinePreset(value: string): value is VersionLinePreset {
  return VERSION_LINE_PRESETS.includes(value.trim() as VersionLinePreset)
}

function trackVersionLabel(track: UploadTrackDraft) {
  return track.versionLine.trim() || "Original"
}

function trackVersionPresetValue(track: UploadTrackDraft) {
  const versionLine = trackVersionLabel(track)
  return isVersionLinePreset(versionLine) ? versionLine : ""
}

function isCustomTrackVersion(track: UploadTrackDraft) {
  const versionLine = track.versionLine.trim()
  return customVersionLineTrackIds.value.includes(track.id) || Boolean(versionLine && !isVersionLinePreset(versionLine))
}

function addCustomVersionLineTrack(trackId: string) {
  if (!customVersionLineTrackIds.value.includes(trackId)) {
    customVersionLineTrackIds.value = [...customVersionLineTrackIds.value, trackId]
  }
}

function removeCustomVersionLineTrack(trackId: string) {
  customVersionLineTrackIds.value = customVersionLineTrackIds.value.filter((id) => id !== trackId)
}

function startCustomTrackVersion(track: UploadTrackDraft) {
  addCustomVersionLineTrack(track.id)

  if (isVersionLinePreset(track.versionLine)) {
    track.versionLine = ""
  }

  markTrackDetailsUnsaved(track)
  focusCustomVersionLineInput(track.id)
}

function setCustomTrackVersion(track: UploadTrackDraft, value: string | number | null) {
  track.versionLine = String(value ?? "")
  addCustomVersionLineTrack(track.id)
  markTrackDetailsUnsaved(track)
}

function commitCustomTrackVersion(track: UploadTrackDraft) {
  const versionLine = track.versionLine.trim()

  if (!versionLine) {
    track.versionLine = "Original"
    removeCustomVersionLineTrack(track.id)
    return
  }

  track.versionLine = versionLine

  if (isVersionLinePreset(versionLine)) {
    removeCustomVersionLineTrack(track.id)
  }
}

function focusCustomVersionLineInput(trackId: string) {
  if (typeof window === "undefined") {
    return
  }

  window.setTimeout(() => {
    document.querySelector<HTMLInputElement>(`[data-version-custom-track-id="${trackId}"]`)?.focus()
  }, 80)
}

function updateTiktokPreviewPart(track: UploadTrackDraft, part: "minutes" | "seconds", value: string | number | null) {
  const nextValue = String(value ?? "").trim()

  if (part === "minutes") {
    track.tiktokPreviewMinutes = nextValue
  } else {
    track.tiktokPreviewSeconds = nextValue
  }

  markTrackDetailsUnsaved(track)
}

function adjustedTiktokPreviewPartValue(value: string, delta: number) {
  const parsed = parseTiktokPreviewPart(value)
  const currentValue = parsed === null || Number.isNaN(parsed) ? 0 : parsed
  const nextValue = Math.trunc(currentValue) + delta

  return String(Math.min(59, Math.max(0, nextValue)))
}

function stepTiktokPreviewPart(track: UploadTrackDraft, part: "minutes" | "seconds", delta: number) {
  const currentValue = part === "minutes" ? track.tiktokPreviewMinutes : track.tiktokPreviewSeconds
  updateTiktokPreviewPart(track, part, adjustedTiktokPreviewPartValue(currentValue, delta))
}

function setTrackAiGeneratedElements(track: UploadTrackDraft, checked: boolean) {
  track.containsAiGeneratedElements = checked
  if (!checked) {
    track.aiGeneratedDetails = ""
  }
  markTrackDetailsUnsaved(track)
}

function setTrackAiGeneratedDetails(track: UploadTrackDraft, value: string | number | null) {
  track.aiGeneratedDetails = String(value ?? "")
  markTrackDetailsUnsaved(track)
}

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
}

function checkedValue(event: Event) {
  return (event.target as HTMLInputElement).checked
}

function normalizeSavedAdditionalArtistName(name: string) {
  return name.trim().toLocaleLowerCase()
}

function normalizeAdditionalArtistProfileExistsMap(value: unknown) {
  const source = value && typeof value === "object" ? value as Partial<Record<AdditionalArtistPlatform, unknown>> : {}

  return additionalArtistPlatforms.reduce((profileExists, platform) => {
    const exists = source[platform.id]
    profileExists[platform.id] = typeof exists === "boolean" ? exists : null
    return profileExists
  }, {} as Partial<Record<AdditionalArtistPlatform, boolean | null>>)
}

function normalizeAdditionalArtistProfileUrlMap(value: unknown) {
  const source = value && typeof value === "object" ? value as Partial<Record<AdditionalArtistPlatform, unknown>> : {}

  return additionalArtistPlatforms.reduce((profileUrl, platform) => {
    const url = source[platform.id]
    profileUrl[platform.id] = typeof url === "string" ? url.trim() : ""
    return profileUrl
  }, {} as Partial<Record<AdditionalArtistPlatform, string>>)
}

function sanitizeSavedAdditionalArtistOption(value: unknown): SavedAdditionalArtistOption | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const source = value as Partial<SavedAdditionalArtistOption>
  const name = typeof source.name === "string" ? source.name.trim() : ""

  if (!name) {
    return null
  }

  const normalizedName = normalizeSavedAdditionalArtistName(name)
  const rawId = typeof source.id === "string" && source.id.trim()
    ? source.id.trim()
    : `local:${normalizedName}`

  return {
    id: rawId.startsWith("local:") ? rawId : `local:${rawId}`,
    name,
    profileExists: normalizeAdditionalArtistProfileExistsMap(source.profileExists),
    profileUrl: normalizeAdditionalArtistProfileUrlMap(source.profileUrl),
    origin: "local",
  }
}

function loadLocalSavedAdditionalArtists() {
  if (typeof window === "undefined") {
    return
  }

  try {
    const rawValue = window.localStorage.getItem(LOCAL_SAVED_ADDITIONAL_ARTISTS_STORAGE_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) : []
    const parsedArtists = Array.isArray(parsed) ? parsed : []
    const artists = parsedArtists
      .map(sanitizeSavedAdditionalArtistOption)
      .filter((artist): artist is SavedAdditionalArtistOption => Boolean(artist))

    localSavedAdditionalArtists.value = artists
  }
  catch {
    localSavedAdditionalArtists.value = []
  }
}

function persistLocalSavedAdditionalArtists() {
  if (typeof window === "undefined") {
    return
  }

  try {
    window.localStorage.setItem(
      LOCAL_SAVED_ADDITIONAL_ARTISTS_STORAGE_KEY,
      JSON.stringify(localSavedAdditionalArtists.value),
    )
  }
  catch {
    // Ignore storage failures; the release draft itself still works.
  }
}

function blankCreditDraft(
  creditedName = "",
  roleCodes: string[] = [],
  platformProfileExists: Partial<Record<AdditionalArtistPlatform, boolean | null>> = {},
  platformProfileUrl: Partial<Record<AdditionalArtistPlatform, string>> = {},
): CreditDraft {
  return {
    creditedName,
    roleCodes,
    platformProfileExists: { ...platformProfileExists },
    platformProfileUrl: { ...platformProfileUrl },
  }
}

function cloneCreditDraft(credit: CreditDraft) {
  return blankCreditDraft(
    credit.creditedName,
    [...credit.roleCodes],
    { ...(credit.platformProfileExists ?? {}) },
    { ...(credit.platformProfileUrl ?? {}) },
  )
}

function primaryArtistCreditsForSync() {
  const artistName = selectedArtistName()
  return artistName ? [blankCreditDraft(artistName, ["Main Artist"])] : []
}

function syncDefaultArtistCredits() {
  const syncedCredits = primaryArtistCreditsForSync()

  if (!syncedCredits.length) {
    return
  }

  for (const track of tracks.value) {
    if (track.artistCreditsOverridden) {
      continue
    }

    track.artistCredits = syncedCredits.map(cloneCreditDraft)
    markTrackDetailsUnsaved(track)
  }
}

function markTrackDetailsUnsaved(track: UploadTrackDraft) {
  track.detailsSaved = false
}

function createTrackDraft(): UploadTrackDraft {
  nextTrackId.value += 1

  return {
    id: `upload-track-${nextTrackId.value}`,
    title: "",
    isrc: "",
    lyrics: "",
    tiktokPreviewMinutes: "",
    tiktokPreviewSeconds: "",
    versionLine: "Original",
    containsAiGeneratedElements: false,
    aiGeneratedDetails: "",
    audioFile: null,
    audioInputVersion: 0,
    audioUploadProgress: 0,
    audioUploadedUrl: "",
    audioUploadXhr: null,
    audioUploadRequestId: 0,
    uploadState: "idle",
    error: "",
    detailsSaved: false,
    artistCreditsOverridden: false,
    artistCredits: primaryArtistCreditsForSync().map(cloneCreditDraft),
    writerCredits: [blankCreditDraft()],
    additionalCredits: [blankCreditDraft()],
  }
}

function appendTrackDraft() {
  const track = createTrackDraft()
  tracks.value = [...tracks.value, track]
  return track
}

function emptyReusableTrack() {
  return tracks.value.find((track) => (
    !track.title.trim()
    && !track.audioFile
    && !track.audioUploadedUrl
    && track.uploadState !== "uploading"
  ))
}

function addTrack() {
  return appendTrackDraft()
}

function resetTrack(track: UploadTrackDraft) {
  abortTrackUpload(track)
  removeCustomVersionLineTrack(track.id)
  Object.assign(track, createTrackDraft(), { id: track.id })
}

function removeTrack(trackId: string) {
  const track = tracks.value.find((item) => item.id === trackId)

  if (tracks.value.length === 1) {
    if (track) {
      resetTrack(track)
    }
    return
  }

  if (track) {
    abortTrackUpload(track)
  }

  removeCustomVersionLineTrack(trackId)
  tracks.value = tracks.value.filter((item) => item.id !== trackId)
}

function reorderTracks(fromIndex: number, toIndex: number) {
  if (isUploadDisabled.value || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
    return
  }

  const nextTracks = [...tracks.value]
  const [track] = nextTracks.splice(fromIndex, 1)

  if (!track) {
    return
  }

  nextTracks.splice(toIndex, 0, track)
  tracks.value = nextTracks
  resetMessages()
}

function moveTrackByStep(trackId: string, direction: -1 | 1) {
  const fromIndex = tracks.value.findIndex((track) => track.id === trackId)
  const toIndex = fromIndex + direction

  if (toIndex < 0 || toIndex >= tracks.value.length) {
    return
  }

  reorderTracks(fromIndex, toIndex)
}

function placeTrackRelativeToTarget(sourceTrackId: string, targetTrackId: string, placement: "before" | "after") {
  if (sourceTrackId === targetTrackId || isUploadDisabled.value) {
    return
  }

  const draggedTrack = tracks.value.find((track) => track.id === sourceTrackId)
  const remainingTracks = tracks.value.filter((track) => track.id !== sourceTrackId)
  const targetIndex = remainingTracks.findIndex((track) => track.id === targetTrackId)

  if (!draggedTrack || targetIndex < 0) {
    return
  }

  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex
  const nextTracks = [...remainingTracks]
  nextTracks.splice(insertIndex, 0, draggedTrack)

  const currentOrder = tracks.value.map((track) => track.id).join("|")
  const nextOrder = nextTracks.map((track) => track.id).join("|")

  if (currentOrder !== nextOrder) {
    tracks.value = nextTracks
    resetMessages()
  }
}

function onTrackPointerDown(event: PointerEvent, trackId: string) {
  if (event.button !== 0 || isUploadDisabled.value || tracks.value.length < 2) {
    event.preventDefault()
    return
  }

  event.preventDefault()
  pointerTrackDrag.value = {
    trackId,
    startX: event.clientX,
    startY: event.clientY,
    active: false,
  }
  draggingTrackId.value = trackId
  dragOverTrackId.value = trackId

  const target = event.currentTarget as HTMLElement | null
  target?.setPointerCapture?.(event.pointerId)

  window.addEventListener("pointermove", onTrackPointerMove, { passive: false })
  window.addEventListener("pointerup", onTrackPointerUp, { once: true })
  window.addEventListener("pointercancel", onTrackPointerUp, { once: true })
}

function onTrackPointerMove(event: PointerEvent) {
  const dragState = pointerTrackDrag.value

  if (!dragState || isUploadDisabled.value) {
    return
  }

  const dragDistance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY)

  if (!dragState.active && dragDistance < 6) {
    return
  }

  dragState.active = true
  event.preventDefault()

  const targetElement = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
  const targetRow = targetElement?.closest(".masters-track-row") as HTMLElement | null
  const targetTrackId = targetRow?.dataset.trackId

  if (!targetTrackId) {
    return
  }

  const targetBounds = targetRow?.getBoundingClientRect()
  const placement = targetBounds && event.clientY > targetBounds.top + (targetBounds.height / 2) ? "after" : "before"

  dragOverTrackId.value = targetTrackId
  placeTrackRelativeToTarget(dragState.trackId, targetTrackId, placement)
}

function onTrackPointerUp() {
  cleanupTrackPointerDrag()
}

function cleanupTrackPointerDrag() {
  if (typeof window !== "undefined") {
    window.removeEventListener("pointermove", onTrackPointerMove)
    window.removeEventListener("pointerup", onTrackPointerUp)
    window.removeEventListener("pointercancel", onTrackPointerUp)
  }

  pointerTrackDrag.value = null
  draggingTrackId.value = null
  dragOverTrackId.value = null
}

function inferTrackTitle(filename: string) {
  const baseName = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return baseName
    ? baseName.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : "Untitled track"
}

function resetMessages() {
  pageError.value = ""
  pageSuccess.value = ""
  submittedReleaseId.value = ""
}

function setError(error: any, fallback: string) {
  pageError.value = error?.data?.statusMessage || error?.message || fallback
  pageSuccess.value = ""
}

function extensionFor(filename: string) {
  return filename.trim().toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ""
}

function fallbackContentType(file: File, kind: UploadKind) {
  if (file.type) {
    return file.type
  }

  const extension = extensionFor(file.name)

  if (kind === "audio") {
    if (extension === ".wav") return "audio/wav"
    return "audio/mpeg"
  }

  if (extension === ".png") return "image/png"
  if (extension === ".webp") return "image/webp"
  return "image/jpeg"
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`
}

function validateCoverFile(file: File) {
  const extension = extensionFor(file.name)

  if (![".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    return "Cover art must be JPG, PNG, or WEBP."
  }

  if (file.size > 36 * 1024 * 1024) {
    return "Cover art must be 36 MB or smaller."
  }

  return ""
}

function validateAudioFile(file: File) {
  const extension = extensionFor(file.name)

  if (![".mp3", ".wav"].includes(extension)) {
    return "Audio files must be WAV or MP3."
  }

  return ""
}

function hasTrackAudioSource(track: UploadTrackDraft) {
  return track.uploadState === "done" && Boolean(track.audioUploadedUrl)
}

function trackUploadTone(track: UploadTrackDraft) {
  if (track.uploadState === "done") return "success"
  if (track.uploadState === "uploading") return "warning"
  if (track.uploadState === "error") return "danger"
  return hasAttemptedSubmit.value ? "warning" : "neutral"
}

function trackUploadLabel(track: UploadTrackDraft) {
  if (track.uploadState === "done") return "Uploaded"
  if (track.uploadState === "uploading") return "Uploading"
  if (track.uploadState === "error") return "Failed"
  return hasAttemptedSubmit.value ? "Needs audio" : "No audio yet"
}

function readinessItemState(item: { complete: boolean }) {
  if (item.complete) return "complete"
  return hasAttemptedSubmit.value ? "attention" : "pending"
}

function readinessItemDetail(item: { complete: boolean, detail: string }) {
  return item.detail
}

function updatePrimaryArtistCredit(track: UploadTrackDraft, value: string) {
  if (!track.artistCredits.length) {
    track.artistCredits.push(blankCreditDraft("", ["Main Artist"]))
  }

  track.artistCredits[0].creditedName = value
  track.artistCreditsOverridden = true
  markTrackDetailsUnsaved(track)
}

function secondaryArtistCredit(track: UploadTrackDraft) {
  return track.artistCredits[1] ?? null
}

function ensureSecondaryArtistCredit(track: UploadTrackDraft) {
  if (!track.artistCredits[1]) {
    track.artistCredits.push(blankCreditDraft("", ["Featured Artist"]))
  }

  return track.artistCredits[1]
}

function removeSecondaryArtistCredit(track: UploadTrackDraft) {
  if (!track.artistCredits[1]) {
    return
  }

  track.artistCredits.splice(1, 1)
  track.artistCreditsOverridden = true
  markTrackDetailsUnsaved(track)
}

function updateSecondaryArtistCredit(track: UploadTrackDraft, value: string) {
  const nextName = value.trim()

  if (!nextName) {
    removeSecondaryArtistCredit(track)
    return
  }

  ensureSecondaryArtistCredit(track).creditedName = nextName
  track.artistCreditsOverridden = true
  markTrackDetailsUnsaved(track)
}

function trackCreditRows(track: UploadTrackDraft, section: CreditDetailSection) {
  return section === "writers" ? track.writerCredits : track.additionalCredits
}

function trackCreditRoleOptions(section: CreditDetailSection) {
  return section === "writers" ? [...WRITER_CREDIT_ROLE_OPTIONS] : TRACK_ADDITIONAL_CREDIT_ROLE_OPTIONS
}

function trackCreditRoleGroups(section: CreditDetailSection) {
  return section === "writers" ? WRITER_CREDIT_ROLE_GROUPS : TRACK_ADDITIONAL_CREDIT_ROLE_GROUPS
}

function trackCreditSectionLabel(section: CreditDetailSection) {
  return section === "writers" ? "writer" : "other"
}

function trackCreditRoleCodes(credit: CreditDraft, section: CreditDetailSection) {
  const allowedRoles = new Set(trackCreditRoleOptions(section))

  return [...new Set(credit.roleCodes.map((role) => role.trim()).filter((role) => allowedRoles.has(role)))]
}

function ensureCreditRow(track: UploadTrackDraft, section: CreditDetailSection, rowIndex: number) {
  const rows = trackCreditRows(track, section)

  while (!rows[rowIndex]) {
    rows.push(blankCreditDraft())
  }

  return rows[rowIndex]
}

function updateTrackCreditName(track: UploadTrackDraft, section: CreditDetailSection, rowIndex: number, value: string) {
  ensureCreditRow(track, section, rowIndex).creditedName = value
  markTrackDetailsUnsaved(track)
}

function updateTrackCreditRoles(track: UploadTrackDraft, section: CreditDetailSection, rowIndex: number, value: string[]) {
  const allowedRoles = new Set(trackCreditRoleOptions(section))
  ensureCreditRow(track, section, rowIndex).roleCodes = [...new Set(value.map((role) => role.trim()).filter((role) => allowedRoles.has(role)))]
  markTrackDetailsUnsaved(track)
}

function addTrackCreditRow(track: UploadTrackDraft, section: CreditDetailSection) {
  trackCreditRows(track, section).push(blankCreditDraft())
  markTrackDetailsUnsaved(track)
}

function removeTrackCreditRow(track: UploadTrackDraft, section: CreditDetailSection, rowIndex: number) {
  const rows = trackCreditRows(track, section)

  if (!rows[rowIndex]) {
    return
  }

  rows.splice(rowIndex, 1)

  if (section === "writers" && !rows.length) {
    rows.push(blankCreditDraft())
  }

  markTrackDetailsUnsaved(track)
}

function createAdditionalArtistDraftRow(name = "", roleCode: AdditionalArtistRole = "Main Artist"): AdditionalArtistDraftRow {
  nextAdditionalArtistDraftId.value += 1

  return {
    id: `additional-artist-${nextAdditionalArtistDraftId.value}`,
    name,
    roleCode,
  }
}

function normalizeAdditionalArtistRole(roleCode?: string): AdditionalArtistRole {
  return additionalArtistRoleOptions.some((option) => option.value === roleCode)
    ? roleCode as AdditionalArtistRole
    : "Main Artist"
}

function additionalArtistRoleLabel(roleCode: AdditionalArtistRole) {
  return additionalArtistRoleOptions.find((option) => option.value === roleCode)?.label ?? "Featured artist"
}

function setAdditionalArtistRole(row: AdditionalArtistDraftRow, roleCode: string) {
  row.roleCode = normalizeAdditionalArtistRole(roleCode)
}

function additionalArtistSavedMeta(artist: SavedAdditionalArtistOption) {
  const linkedPlatforms = additionalArtistPlatforms
    .filter((platform) => Boolean(artist.profileUrl[platform.id]?.trim()))
    .map((platform) => platform.label)

  return linkedPlatforms.length ? linkedPlatforms.join(" · ") : "Saved artist"
}

function additionalArtistPlatformProfileExists(credit: CreditDraft | null | undefined, platform: AdditionalArtistPlatform) {
  const profileUrl = credit?.platformProfileUrl?.[platform]?.trim()
  return credit?.platformProfileExists?.[platform] ?? (profileUrl ? true : false)
}

function resetAdditionalArtistDraft(credit: CreditDraft | null = null) {
  additionalArtistDraft.artist = createAdditionalArtistDraftRow(
    credit?.creditedName ?? "",
    normalizeAdditionalArtistRole(credit?.roleCodes[0]),
  )

  additionalArtistPlatforms.forEach((platform) => {
    additionalArtistDraft.profileExists[platform.id] = additionalArtistPlatformProfileExists(credit, platform.id)
    additionalArtistDraft.profileUrl[platform.id] = credit?.platformProfileUrl?.[platform.id] ?? ""
  })
}

function upsertLocalSavedAdditionalArtist(credit: CreditDraft) {
  const name = credit.creditedName.trim()

  if (!name) {
    return
  }

  const normalizedName = normalizeSavedAdditionalArtistName(name)
  const savedArtist: SavedAdditionalArtistOption = {
    id: `local:${normalizedName}`,
    name,
    profileExists: normalizeAdditionalArtistProfileExistsMap(credit.platformProfileExists),
    profileUrl: normalizeAdditionalArtistProfileUrlMap(credit.platformProfileUrl),
    origin: "local",
  }

  localSavedAdditionalArtists.value = [
    ...localSavedAdditionalArtists.value.filter((artist) => normalizeSavedAdditionalArtistName(artist.name) !== normalizedName),
    savedArtist,
  ]
}

function additionalArtistProfileExistsDraft() {
  return additionalArtistPlatforms.reduce((profileExists, platform) => {
    profileExists[platform.id] = additionalArtistDraft.profileExists[platform.id]
    return profileExists
  }, {} as Partial<Record<AdditionalArtistPlatform, boolean | null>>)
}

function additionalArtistProfileUrlDraft() {
  return additionalArtistPlatforms.reduce((profileUrl, platform) => {
    profileUrl[platform.id] = additionalArtistDraft.profileUrl[platform.id].trim()
    return profileUrl
  }, {} as Partial<Record<AdditionalArtistPlatform, string>>)
}

function saveAdditionalArtistCredit(track: UploadTrackDraft) {
  const name = additionalArtistDraft.artist.name.trim()

  if (!name) {
    return
  }

  const primaryCredit = track.artistCredits[0]
    ? cloneCreditDraft(track.artistCredits[0])
    : blankCreditDraft(selectedArtistName(), ["Main Artist"])
  const existingAdditionalCredits = track.artistCredits.slice(1).map(cloneCreditDraft)
  const savedCredit = blankCreditDraft(
    name,
    [additionalArtistDraft.artist.roleCode],
    additionalArtistProfileExistsDraft(),
    additionalArtistProfileUrlDraft(),
  )
  upsertLocalSavedAdditionalArtist(savedCredit)

  if (editingAdditionalArtistCreditIndex.value !== null) {
    const additionalCreditIndex = editingAdditionalArtistCreditIndex.value - 1

    if (additionalCreditIndex >= 0 && additionalCreditIndex < existingAdditionalCredits.length) {
      existingAdditionalCredits.splice(additionalCreditIndex, 1, savedCredit)
    }
    else {
      existingAdditionalCredits.push(savedCredit)
    }
  }
  else {
    existingAdditionalCredits.push(savedCredit)
  }

  track.artistCredits = [primaryCredit, ...existingAdditionalCredits]
  track.artistCreditsOverridden = true
  markTrackDetailsUnsaved(track)
}

function addSavedAdditionalArtistCredit(artistId: string) {
  const artist = savedAdditionalArtistOptions.value.find((option) => option.id === artistId)
  const track = tracks.value[0] ?? addTrack()

  if (!artist) {
    return
  }

  const normalizedName = normalizeSavedAdditionalArtistName(artist.name)
  const existingCreditIndex = track.artistCredits.findIndex((credit, index) => {
    return index > 0 && normalizeSavedAdditionalArtistName(credit.creditedName) === normalizedName
  })

  if (existingCreditIndex > 0) {
    openAdditionalArtistDetails(existingCreditIndex)
    return
  }

  const primaryCredit = track.artistCredits[0]
    ? cloneCreditDraft(track.artistCredits[0])
    : blankCreditDraft(selectedArtistName(), ["Main Artist"])
  const savedCredit = blankCreditDraft(
    artist.name,
    ["Main Artist"],
    artist.profileExists,
    artist.profileUrl,
  )

  track.artistCredits = [
    primaryCredit,
    ...track.artistCredits.slice(1).map(cloneCreditDraft),
    savedCredit,
  ]
  track.artistCreditsOverridden = true
  markTrackDetailsUnsaved(track)
  resetMessages()
}

function openAdditionalArtistDetails(creditIndex: number | null = null) {
  const track = tracks.value[0] ?? addTrack()
  const credit = creditIndex === null ? null : track.artistCredits[creditIndex] ?? null

  editingAdditionalArtistCreditIndex.value = credit ? creditIndex : null
  resetAdditionalArtistDraft(credit)
  isAdditionalArtistDialogOpen.value = true
}

function setAdditionalArtistDialogOpen(open: boolean) {
  isAdditionalArtistDialogOpen.value = open

  if (!open) {
    editingAdditionalArtistCreditIndex.value = null
    resetAdditionalArtistDraft()
  }
}

function setAdditionalArtistProfile(platform: AdditionalArtistPlatform, profileExists: boolean) {
  additionalArtistDraft.profileExists[platform] = profileExists

  if (!profileExists) {
    additionalArtistDraft.profileUrl[platform] = ""
  }
}

function saveAdditionalArtistDetails() {
  const track = tracks.value[0] ?? addTrack()

  saveAdditionalArtistCredit(track)
  setAdditionalArtistDialogOpen(false)
  resetMessages()
}

function removeAdditionalArtistCredit(creditIndex: number) {
  const track = tracks.value[0]

  if (!track || creditIndex <= 0 || !track.artistCredits[creditIndex]) {
    return
  }

  track.artistCredits.splice(creditIndex, 1)
  track.artistCreditsOverridden = true
  markTrackDetailsUnsaved(track)
  resetMessages()
}

function openTrackDetails(track: UploadTrackDraft, tab: "essentials" | "credits" | "lyrics" = "essentials") {
  activeTrackDetailId.value = track.id
  activeTrackDetailTab.value = tab
}

function setTrackDetailOpen(open: boolean) {
  if (!open) {
    activeTrackDetailId.value = null
  }
}

function saveActiveTrackDetails() {
  const track = activeTrackDetail.value
  const trackIndex = activeTrackDetailIndex.value

  if (!track || trackIndex < 0) {
    return
  }

  const detailError = validateTrackDetails(track, trackIndex)

  if (detailError) {
    pageError.value = detailError
    pageSuccess.value = ""
    return
  }

  track.detailsSaved = true
  setTrackDetailOpen(false)
  resetMessages()
}

function isBlankCreditDraft(credit: { creditedName: string, roleCodes: string[] }) {
  return !credit.creditedName && !credit.roleCodes.length
}

function buildCreditInputsForRows(
  rows: CreditDraft[],
  sectionLabel: string,
  trackLabel: string,
  sortBase: number,
) {
  const credits: TrackCreditInput[] = []

  rows.forEach((credit, creditIndex) => {
    const creditedName = credit.creditedName.trim()
    const roleCodes = [...new Set(credit.roleCodes.map((role) => role.trim()).filter(Boolean))]

    if (isBlankCreditDraft({ creditedName, roleCodes })) {
      return
    }

    if (!creditedName) {
      throw new Error(`${trackLabel} ${sectionLabel} credit ${creditIndex + 1} needs a full name.`)
    }

    if (!roleCodes.length) {
      throw new Error(`${trackLabel} ${sectionLabel} credit ${creditIndex + 1} needs at least one role.`)
    }

    roleCodes.forEach((roleCode, roleIndex) => {
      credits.push({
        creditedName,
        roleCode,
        sortOrder: sortBase + creditIndex * 100 + roleIndex,
      })
    })
  })

  return credits
}

function buildTrackCreditInputs(track: UploadTrackDraft, trackIndex: number) {
  const trackLabel = track.title.trim() || `Track ${trackIndex + 1}`

  return [
    ...buildCreditInputsForRows(track.artistCredits, "artist role", trackLabel, 0),
    ...buildCreditInputsForRows(track.writerCredits, "writer role", trackLabel, 1000),
    ...buildCreditInputsForRows(track.additionalCredits, "additional", trackLabel, 2000),
  ]
}

function parseTiktokPreviewPart(value: string) {
  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized)
  }

  return Number.NaN
}

function parseTiktokPreviewSeconds(track: UploadTrackDraft) {
  const minutes = parseTiktokPreviewPart(track.tiktokPreviewMinutes)
  const seconds = parseTiktokPreviewPart(track.tiktokPreviewSeconds)

  if (minutes === null && seconds === null) {
    return null
  }

  const safeMinutes = minutes ?? 0
  const safeSeconds = seconds ?? 0

  if (
    !Number.isInteger(safeMinutes)
    || !Number.isInteger(safeSeconds)
    || safeMinutes < 0
    || safeMinutes > 59
    || safeSeconds < 0
    || safeSeconds > 59
  ) {
    return Number.NaN
  }

  return safeMinutes * 60 + safeSeconds
}

function normalizedTiktokPreviewStartSeconds(track: UploadTrackDraft) {
  const seconds = parseTiktokPreviewSeconds(track)
  return Number.isInteger(seconds) ? seconds : null
}

function validateTiktokPreviewTime(track: UploadTrackDraft, trackIndex: number) {
  const seconds = parseTiktokPreviewSeconds(track)

  if (seconds === null) {
    return ""
  }

  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3599) {
    return `Track ${trackIndex + 1} TikTok audio time must be between 0:00 and 59:59.`
  }

  return ""
}

function validateAiGeneratedDetails(track: UploadTrackDraft, trackIndex: number) {
  if (track.containsAiGeneratedElements && !track.aiGeneratedDetails.trim()) {
    return `Track ${trackIndex + 1} needs the AI-generated part or instrument details.`
  }

  return ""
}

function validateRequiredWriter(track: UploadTrackDraft, trackIndex: number) {
  const hasWriterName = track.writerCredits.some((credit) => credit.creditedName.trim())

  if (!hasWriterName) {
    return `Track ${trackIndex + 1} needs at least one writer name.`
  }

  return ""
}

function validateTrackCredits(track: UploadTrackDraft, trackIndex: number) {
  try {
    buildTrackCreditInputs(track, trackIndex)
    return ""
  } catch (error: any) {
    return error?.message || `Track ${trackIndex + 1} credits are incomplete.`
  }
}

function validateTrackDetails(track: UploadTrackDraft, trackIndex: number) {
  if (!track.title.trim()) {
    return `Track ${trackIndex + 1} needs a title.`
  }

  return validateRequiredWriter(track, trackIndex)
    || validateTiktokPreviewTime(track, trackIndex)
    || validateAiGeneratedDetails(track, trackIndex)
    || validateTrackCredits(track, trackIndex)
}

function validateAudioSourcesReady() {
  const uploadingTrackIndex = tracks.value.findIndex((track) => track.uploadState === "uploading")

  if (uploadingTrackIndex !== -1) {
    return `Track ${uploadingTrackIndex + 1} audio is still uploading.`
  }

  const failedTrackIndex = tracks.value.findIndex((track) => track.uploadState === "error")

  if (failedTrackIndex !== -1) {
    return `Track ${failedTrackIndex + 1} audio upload failed. Upload it again.`
  }

  const incompleteTrackIndex = tracks.value.findIndex((track) => !track.title.trim() || !hasTrackAudioSource(track))

  if (incompleteTrackIndex !== -1) {
    return `Track ${incompleteTrackIndex + 1} needs a title and an uploaded audio file.`
  }

  return ""
}

function validateTrackDetailsReady() {
  for (const [trackIndex, track] of tracks.value.entries()) {
    const detailError = validateTrackDetails(track, trackIndex)

    if (detailError) {
      return detailError
    }
  }

  return ""
}

function validateTracksReadyForDelivery() {
  return validateAudioSourcesReady() || validateTrackDetailsReady()
}

function isUploadLimitError(status: number, message: string) {
  return status === 413 || /payload too large|file.?size|file_size|upload limit|too large|exceed|maximum/i.test(message)
}

function normalizeUploadError(message: string, status: number, file: File) {
  if (!isUploadLimitError(status, message)) {
    return message
  }

  return `${file.name} (${formatFileSize(file.size)}) is larger than the current upload limit. Choose a smaller file or contact Naad Backstage support before trying again.`
}

function storageErrorMessageFromBody(body: string, fallback: string) {
  try {
    const parsed = JSON.parse(body || "{}")
    return parsed.error || parsed.message || fallback
  } catch {
    return body || fallback
  }
}

function parseUploadError(xhr: XMLHttpRequest, file: File) {
  const fallback = xhr.status ? `Upload failed with status ${xhr.status}.` : "Upload failed."
  return normalizeUploadError(storageErrorMessageFromBody(xhr.responseText, fallback), xhr.status, file)
}

function uploadErrorMessage(error: any, fallback: string) {
  return error?.data?.statusMessage || error?.statusMessage || error?.data?.message || error?.message || fallback
}

function signedUploadUrl(target: AssetUploadTargetResponse) {
  if (target.signedUrl) {
    return target.signedUrl
  }

  const publicUrl = new URL(target.publicUrl)
  publicUrl.pathname = `/storage/v1/object/upload/sign/${target.bucket}/${target.path.replace(/^\/+/, "")}`
  publicUrl.search = ""
  publicUrl.searchParams.set("token", target.token)
  return publicUrl.toString()
}

function uploadSignedAssetWithProgress(
  target: AssetUploadTargetResponse,
  file: File,
  onProgress: (progress: number) => void,
  onXhr: (xhr: XMLHttpRequest | null) => void,
) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const body = new FormData()

    body.append("cacheControl", "3600")
    body.append("", file, file.name)

    xhr.open("PUT", signedUploadUrl(target))
    const supabasePublicKey = String(runtimeConfig.public.supabase?.key || "")

    if (supabasePublicKey) {
      xhr.setRequestHeader("apikey", supabasePublicKey)
    }

    const authorizationToken = session.value?.access_token || supabasePublicKey
    if (authorizationToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${authorizationToken}`)
    }

    xhr.setRequestHeader("x-upsert", "false")
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return
      }

      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))))
    }
    xhr.onload = () => {
      onXhr(null)

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve(target.publicUrl)
        return
      }

      reject(new Error(parseUploadError(xhr, file)))
    }
    xhr.onerror = () => {
      onXhr(null)
      reject(new Error("Network error while uploading this file."))
    }
    xhr.onabort = () => {
      onXhr(null)
      reject(new DOMException("Upload aborted.", "AbortError"))
    }

    onXhr(xhr)
    xhr.send(body)
  })
}

async function createUploadTarget(kind: UploadKind, file: File) {
  if (!form.artistId) {
    throw new Error("No artist profile is available for uploads.")
  }

  const contentType = fallbackContentType(file, kind)
  return await $fetch("/api/dashboard/uploads/create-asset", {
    method: "POST",
    body: {
      artistId: form.artistId,
      kind,
      filename: file.name,
      fileSize: file.size,
      contentType,
    },
  }) as AssetUploadTargetResponse
}

function resetCoverUploadState() {
  abortCoverUpload()
  coverUploadedUrl.value = ""
  coverUploadProgress.value = 0
  coverUploadState.value = "idle"
}

function abortCoverUpload() {
  if (coverUploadXhr.value) {
    coverUploadXhr.value.abort()
    coverUploadXhr.value = null
  }
}

function resetTrackUploadState(track: UploadTrackDraft) {
  abortTrackUpload(track)
  track.audioUploadedUrl = ""
  track.audioUploadProgress = 0
  track.uploadState = "idle"
}

function abortTrackUpload(track: UploadTrackDraft) {
  if (track.audioUploadXhr) {
    track.audioUploadXhr.abort()
    track.audioUploadXhr = null
  }
}

async function uploadCoverFile(file: File) {
  const requestId = coverUploadRequestId.value + 1
  coverUploadRequestId.value = requestId
  resetCoverUploadState()
  coverUploadState.value = "uploading"
  coverError.value = ""

  try {
    const target = await createUploadTarget("cover", file)

    if (requestId !== coverUploadRequestId.value) {
      return
    }

    const publicUrl = await uploadSignedAssetWithProgress(
      target,
      file,
      (progress) => {
        if (requestId === coverUploadRequestId.value) {
          coverUploadProgress.value = progress
        }
      },
      (xhr) => {
        if (requestId === coverUploadRequestId.value) {
          coverUploadXhr.value = xhr
        }
      },
    )

    if (requestId !== coverUploadRequestId.value) {
      return
    }

    coverUploadedUrl.value = publicUrl
    coverUploadProgress.value = 100
    coverUploadState.value = "done"
  } catch (error: any) {
    if (requestId !== coverUploadRequestId.value || error?.name === "AbortError") {
      return
    }

    coverUploadedUrl.value = ""
    coverUploadState.value = "error"
    coverError.value = uploadErrorMessage(error, "Cover upload failed.")
  }
}

async function uploadTrackAudioFile(track: UploadTrackDraft, file: File) {
  track.audioUploadRequestId += 1
  const requestId = track.audioUploadRequestId
  resetTrackUploadState(track)
  track.uploadState = "uploading"
  track.error = ""

  try {
    const target = await createUploadTarget("audio", file)

    if (requestId !== track.audioUploadRequestId) {
      return
    }

    const publicUrl = await uploadSignedAssetWithProgress(
      target,
      file,
      (progress) => {
        if (requestId === track.audioUploadRequestId) {
          track.audioUploadProgress = progress
        }
      },
      (xhr) => {
        if (requestId === track.audioUploadRequestId) {
          track.audioUploadXhr = xhr
        }
      },
    )

    if (requestId !== track.audioUploadRequestId) {
      return
    }

    track.audioUploadedUrl = publicUrl
    track.audioUploadProgress = 100
    track.uploadState = "done"
  } catch (error: any) {
    if (requestId !== track.audioUploadRequestId || error?.name === "AbortError") {
      return
    }

    track.audioUploadedUrl = ""
    track.uploadState = "error"
    track.error = uploadErrorMessage(error, "Audio upload failed.")
  }
}

function stageCoverFile(file: File | null, input?: HTMLInputElement) {
  coverError.value = ""
  resetCoverUploadState()

  if (!file) {
    coverFile.value = null
    return false
  }

  const validationError = validateCoverFile(file)

  if (validationError) {
    coverError.value = validationError
    coverFile.value = null
    if (input) {
      input.value = ""
    }
    return false
  }

  coverFile.value = file
  coverInputVersion.value += 1
  resetMessages()
  void uploadCoverFile(file)
  return true
}

function onCoverSelected(event: Event) {
  const input = event.target as HTMLInputElement
  stageCoverFile(input.files?.[0] ?? null, input)
}

function onCoverDrop(event: DragEvent) {
  if (isUploadDisabled.value || coverUploadState.value === "uploading") {
    return
  }

  stageCoverFile(Array.from(event.dataTransfer?.files ?? [])[0] ?? null)
}

function clearCoverFile() {
  coverUploadRequestId.value += 1
  resetCoverUploadState()
  coverFile.value = null
  coverInputVersion.value += 1
  coverError.value = ""
  resetMessages()
}

function stageTrackAudioFile(track: UploadTrackDraft, file: File | null, input?: HTMLInputElement) {
  track.error = ""
  track.audioUploadRequestId += 1
  resetTrackUploadState(track)

  if (!file) {
    track.audioFile = null
    markTrackDetailsUnsaved(track)
    return false
  }

  const validationError = validateAudioFile(file)

  if (validationError) {
    track.error = validationError
    track.audioFile = null
    if (input) {
      input.value = ""
    }
    markTrackDetailsUnsaved(track)
    return false
  }

  track.audioFile = file
  track.audioInputVersion += 1
  if (!track.title.trim()) {
    updateTrackTitle(track, inferTrackTitle(file.name))
  } else {
    markTrackDetailsUnsaved(track)
  }
  resetMessages()
  void uploadTrackAudioFile(track, file)
  return true
}

function onTrackAudioSelected(event: Event, track: UploadTrackDraft) {
  const input = event.target as HTMLInputElement
  stageTrackAudioFile(track, input.files?.[0] ?? null, input)
}

function onTrackAudioDrop(event: DragEvent, track: UploadTrackDraft) {
  if (isUploadDisabled.value || track.uploadState === "uploading") {
    return
  }

  stageTrackAudioFile(track, Array.from(event.dataTransfer?.files ?? [])[0] ?? null)
}

function stageAudioFiles(files: File[], preferredTrack?: UploadTrackDraft) {
  if (!files.length) {
    return
  }

  let firstInvalidMessage = ""

  files.forEach((file, fileIndex) => {
    const validationError = validateAudioFile(file)

    if (validationError) {
      firstInvalidMessage ||= validationError
      return
    }

    const targetTrack = fileIndex === 0 && preferredTrack
      ? preferredTrack
      : emptyReusableTrack() ?? appendTrackDraft()

    stageTrackAudioFile(targetTrack, file)
  })

  if (firstInvalidMessage) {
    pageError.value = firstInvalidMessage
    pageSuccess.value = ""
  }
}

function clearTrackAudioFile(track: UploadTrackDraft) {
  track.audioUploadRequestId += 1
  resetTrackUploadState(track)
  track.audioFile = null
  track.audioInputVersion += 1
  markTrackDetailsUnsaved(track)
  resetMessages()
}

function saveDraftLocally() {
  pageError.value = ""
  pageSuccess.value = "Draft saved in this session."
}

function scrollToFirstMissing() {
  const targetId = !coverUploadedUrl.value
    ? "uploader-artwork"
    : missingAudioCount.value
      ? "uploader-masters"
      : missingTrackDataCount.value
        ? "uploader-masters"
        : "uploader-review"

  document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" })
}

function validateSubmission() {
  if (isViewingAsArtist.value) {
    return "View-as mode is read-only. Sign in as the artist to upload a release."
  }

  if (!form.artistId) {
    return "No artist profile is available for uploads."
  }

  if (!form.title.trim()) {
    return "Release title is required."
  }

  if (!form.releaseDate) {
    return "Release date is required."
  }

  if (!coverFile.value) {
    return "Upload cover art before distribution."
  }

  if (coverUploadState.value === "uploading") {
    return "Wait for the cover art upload to finish."
  }

  if (coverUploadState.value === "error") {
    return "Cover art upload failed. Upload it again before distribution."
  }

  if (!coverUploadedUrl.value) {
    return "Cover art must finish uploading before distribution."
  }

  selectedStores.value = selectedStores.value.length ? selectedStores.value : [...RELEASE_STORE_OPTIONS]

  const trackError = validateTracksReadyForDelivery()
  if (trackError) {
    return trackError
  }

  return ""
}

function buildSubmissionNotes() {
  const notes = form.notes.trim()
  const aiNotes = tracks.value
    .map((track, trackIndex) => {
      if (!track.containsAiGeneratedElements || !track.aiGeneratedDetails.trim()) {
        return ""
      }

      const title = track.title.trim() || `Track ${trackIndex + 1}`
      return `Track ${trackIndex + 1} (${title}): ${track.aiGeneratedDetails.trim()}`
    })
    .filter(Boolean)

  if (!aiNotes.length) {
    return notes || null
  }

  return [
    notes,
    "AI-generated element notes:",
    ...aiNotes,
  ].filter(Boolean).join("\n")
}

async function submitRelease() {
  hasAttemptedSubmit.value = true
  const validationError = validateSubmission()

  if (validationError) {
    pageError.value = validationError
    pageSuccess.value = ""
    return
  }

  isSubmitting.value = true
  resetMessages()
  tracks.value.forEach((track) => {
    track.error = ""
  })

  try {
    const uploadedTracks = []

    for (const [trackIndex, track] of tracks.value.entries()) {
      uploadedTracks.push({
        title: track.title,
        isrc: track.isrc || null,
        audioUrl: track.audioUploadedUrl,
        filename: track.audioFile?.name ?? null,
        lyrics: track.lyrics || null,
        tiktokPreviewStartSeconds: normalizedTiktokPreviewStartSeconds(track),
        versionLine: track.versionLine || null,
        containsAiGeneratedElements: track.containsAiGeneratedElements,
        credits: buildTrackCreditInputs(track, trackIndex),
      })
    }

    const response = await $fetch("/api/dashboard/uploads/releases", {
      method: "POST",
      body: {
        artistId: form.artistId,
        title: form.title,
        type: form.type,
        genre: form.genre,
        releaseDate: form.releaseDate,
        coverArtUrl: coverUploadedUrl.value,
        stores: selectedStores.value,
        notes: buildSubmissionNotes(),
        tracks: uploadedTracks,
      },
    }) as ArtistUploadReleaseResponse

    submittedReleaseId.value = response.release.id
    pageSuccess.value = `${response.release.title} is pending review for ${response.storeCount} stores with ${response.trackCount} track${response.trackCount === 1 ? "" : "s"}.`
  } catch (error: any) {
    setError(error, "Unable to upload this release.")
  } finally {
    isSubmitting.value = false
  }
}

defineExpose({
  addTrack,
  clearTrackAudioFile,
  coverError,
  coverFile,
  coverPreviewUrl,
  coverUploadProgress,
  coverUploadedUrl,
  coverUploadState,
  form,
  isUploadDisabled,
  pageError,
  pageSuccess,
  removeTrack,
  selectedStores,
  setReleaseType,
  setTrackAiGeneratedElements,
  setTrackVersion,
  stageAudioFiles,
  stageCoverFile,
  stageTrackAudioFile,
  submitRelease,
  submittedReleaseId,
  tracks,
  updateReleaseTitle,
  updateTrackTitle,
  validateSubmission,
})
</script>

<template>
  <div class="page uploaded-page">
    <AppAlert v-if="pageError" variant="destructive">{{ pageError }}</AppAlert>
    <AppAlert v-if="pageSuccess" variant="success">
      {{ pageSuccess }}
      <NuxtLink v-if="submittedReleaseId" :to="`/dashboard/releases?release=${submittedReleaseId}`">
        View release
      </NuxtLink>
    </AppAlert>
    <AppAlert v-if="isViewingAsArtist" variant="warning">
      View-as mode is read-only. Upload and release submission calls remain disabled for impersonation.
    </AppAlert>

    <section class="release-desk" aria-label="Release package workspace">
      <main class="release-canvas">
        <PageHeader
          id="uploader-identity"
          class="release-page-title"
          eyebrow="Release uploader"
          title="New release"
          description="Add the essentials for review and delivery."
        />

        <section
          class="release-summary-card surface-glint surface-glint-hero"
          aria-label="Release summary"
        >
          <div class="release-summary-main">
            <div class="release-summary-heading">
              <div class="release-title-line">
                <span class="release-kicker">Release details</span>
                <input
                  class="release-title-input"
                  :value="form.title"
                  placeholder="Untitled release"
                  :disabled="isUploadDisabled"
                  aria-label="Public release title"
                  @input="updateReleaseTitle(inputValue($event))"
                >
                <span class="release-artist-row">
                  <span class="release-artist-label">Artist</span>
                  <span class="release-artist-line">{{ releaseArtistLine }}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <button
                        type="button"
                        class="artist-add-button"
                        :disabled="isUploadDisabled"
                        aria-label="Add additional artist"
                      >
                        <Plus class="size-4" aria-hidden="true" />
                        <span>Add artist</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" :side-offset="8" class="artist-add-menu">
                      <DropdownMenuItem class="artist-add-menu-new" @select="openAdditionalArtistDetails()">
                        <Plus class="size-4" aria-hidden="true" />
                        <span>New artist</span>
                      </DropdownMenuItem>
                      <div v-if="savedAdditionalArtistOptions.length" class="artist-add-menu-saved">
                        <span>Saved artists</span>
                        <DropdownMenuItem
                          v-for="artist in savedAdditionalArtistOptions"
                          :key="artist.id"
                          class="artist-add-menu-saved-item"
                          @select="addSavedAdditionalArtistCredit(artist.id)"
                        >
                          <span>
                            <strong>{{ artist.name }}</strong>
                            <small>{{ additionalArtistSavedMeta(artist) }}</small>
                          </span>
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
                <div v-if="additionalArtistCredits.length" class="release-collaborator-list" aria-label="Additional artists">
                  <div
                    v-for="artist in additionalArtistCredits"
                    :key="artist.id"
                    class="release-collaborator-chip"
                  >
                    <button
                      type="button"
                      class="release-collaborator-edit"
                      :disabled="isUploadDisabled"
                      :aria-label="`Edit ${artist.name}`"
                      @click="openAdditionalArtistDetails(artist.creditIndex)"
                    >
                      <span class="release-collaborator-name">{{ artist.name }}</span>
                      <span class="release-collaborator-role">{{ artist.roleLabel }}</span>
                    </button>
                    <button
                      type="button"
                      class="release-collaborator-delete"
                      :disabled="isUploadDisabled"
                      :aria-label="`Remove ${artist.name}`"
                      @click="removeAdditionalArtistCredit(artist.creditIndex)"
                    >
                      <Trash2 class="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
              <span class="release-status-chip status-pill" :class="`tone-${releaseStatusTone}`">
                <span aria-hidden="true"></span>
                {{ releaseStatusLabel }}
              </span>
            </div>

            <div class="release-summary-grid">
              <div class="release-summary-field">
                <span>Type</span>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <button type="button" class="release-select-trigger" :disabled="isUploadDisabled" aria-label="Select release type">
                      <span>{{ releaseTypeLabel }}</span>
                      <ChevronDown class="size-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" :side-offset="10" class="release-summary-menu">
                    <DropdownMenuRadioGroup :model-value="form.type" @update:model-value="setReleaseType(String($event))">
                      <DropdownMenuGroup>
                        <DropdownMenuRadioItem
                          v-for="option in releaseTypeOptions"
                          :key="option.value"
                          :value="option.value"
                        >
                          {{ option.label }}
                        </DropdownMenuRadioItem>
                      </DropdownMenuGroup>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div class="release-summary-field release-date-field">
                <span>Release date</span>
                <AppDatePicker
                  id="upload-release-date"
                  v-model="form.releaseDate"
                  class="release-date-picker"
                  popover-class="release-date-popover"
                  :disabled="isUploadDisabled"
                />
              </div>
              <div class="release-summary-field">
                <span>Genre</span>
                <Popover v-slot="{ close, open }" @update:open="handleGenrePopoverOpenChange">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      class="release-select-trigger release-genre-trigger"
                      :disabled="isUploadDisabled"
                      aria-label="Select release genre"
                    >
                      <span>{{ releaseGenreLabel }}</span>
                      <ChevronDown class="size-4" aria-hidden="true" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent v-if="open" align="start" :side-offset="8" class="release-genre-popover">
                    <input
                      v-model="genreSearch"
                      class="release-genre-search"
                      type="search"
                      placeholder="Search genre"
                      aria-label="Search release genre"
                    >
                    <div class="release-genre-options" role="listbox" aria-label="Release genres" @scroll.passive="handleGenreOptionsScroll">
                      <button
                        v-for="genre in visibleReleaseGenres"
                        :key="genre"
                        type="button"
                        class="release-genre-option"
                        :class="{ selected: genre === form.genre }"
                        :aria-selected="genre === form.genre"
                        role="option"
                        @click="selectReleaseGenre(genre, close)"
                      >
                        <Check class="size-4" aria-hidden="true" />
                        <span>{{ genre }}</span>
                      </button>
                      <span v-if="hasMoreReleaseGenres" class="release-genre-scroll-sentinel" aria-hidden="true"></span>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
        </section>

        <section id="uploader-artwork" class="release-section" data-step="2">
          <h3>Cover artwork</h3>
          <div class="artwork-row">
            <label
              class="cover-dropzone"
              :class="{ disabled: isUploadDisabled, uploading: coverUploadState === 'uploading' }"
              for="cover-art-input"
              @dragover.prevent
              @drop.prevent="onCoverDrop"
            >
              <img v-if="coverPreviewUrl" :src="coverPreviewUrl" alt="" class="cover-preview-image">
              <span v-else class="cover-dropzone-empty">
                <ImageUp class="size-6" aria-hidden="true" />
                <strong>Add cover</strong>
                <small>Drop artwork here</small>
              </span>
              <span v-if="coverUploadState === 'uploading'" class="cover-uploading-overlay" aria-live="polite">
                <span class="cover-ai-stage" aria-hidden="true">
                  <span class="cover-ai-grid"></span>
                  <span class="cover-ai-scan"></span>
                  <span class="cover-ai-particles">
                    <span
                      v-for="particle in coverAiParticles"
                      :key="particle.id"
                      class="cover-ai-particle"
                      :style="particle.style"
                    ></span>
                  </span>
                  <span class="cover-ai-core"></span>
                </span>
                <span class="cover-upload-copy">
                  <strong>Preparing cover art</strong>
                  <small>Rendering upload</small>
                </span>
              </span>
              <span v-if="coverPreviewUrl" class="cover-dropzone-overlay">Change cover</span>
              <input
                id="cover-art-input"
                :key="`cover-${coverInputVersion}`"
                class="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                :disabled="isUploadDisabled || coverUploadState === 'uploading'"
                @change="onCoverSelected"
              >
            </label>

            <div class="upload-file-state">
              <div class="upload-file-header">
                <span class="upload-file-eyebrow">Artwork file</span>
                <strong>{{ coverFile?.name || (hasAttemptedSubmit ? "Cover required" : "No cover added") }}</strong>
              </div>
              <p>Square JPG or PNG, 3000x3000 px, RGB.</p>
              <small v-if="coverUploadState === 'done' || coverUploadState === 'error'">{{ coverProgressDetail }}</small>
              <div v-if="coverFile" class="inline-actions">
                <label class="desk-button desk-button-secondary" for="cover-art-input">Replace cover</label>
                <button type="button" class="desk-icon-button" :disabled="isUploadDisabled || !coverFile" aria-label="Remove cover" @click="clearCoverFile">
                  <Trash2 class="size-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="uploader-masters" class="release-section" data-step="3">
          <div class="section-title-row">
            <h3>Audio masters</h3>
            <button
              type="button"
              class="desk-button desk-button-secondary"
              :disabled="isUploadDisabled"
              @click="addTrack"
            >
              Add track
            </button>
          </div>

          <div
            class="desk-table-shell surface-glint surface-glint-data"
          >
            <table class="desk-table masters-table">
              <colgroup>
                <col class="table-col-index">
                <col class="table-col-title">
                <col class="table-col-audio-file">
                <col class="table-col-actions">
              </colgroup>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Track title</th>
                  <th>Audio file</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <TransitionGroup tag="tbody" name="track-reorder">
                <tr
                  v-for="(track, trackIndex) in tracks"
                  :key="track.id"
                  class="masters-track-row"
                  :class="{
                    'is-dragging': draggingTrackId === track.id,
                    'is-drag-over': dragOverTrackId === track.id && draggingTrackId !== track.id,
                  }"
                  :data-track-id="track.id"
                >
                  <td>
                    <span class="track-order-cell">
                      <button
                        type="button"
                        class="track-grip-button"
                        :class="{ disabled: isUploadDisabled || tracks.length < 2 }"
                        :disabled="isUploadDisabled || tracks.length < 2"
                        :aria-label="`Drag to reorder track ${trackIndex + 1}. Press up or down to move.`"
                        @pointerdown="onTrackPointerDown($event, track.id)"
                        @keydown.up.prevent="moveTrackByStep(track.id, -1)"
                        @keydown.down.prevent="moveTrackByStep(track.id, 1)"
                      >
                        <GripVertical class="size-4" aria-hidden="true" />
                      </button>
                      <span>{{ trackIndex + 1 }}</span>
                    </span>
                  </td>
                  <td>
                    <input
                      class="table-input"
                      :value="track.title"
                      placeholder="Track title"
                      :disabled="isUploadDisabled"
                      :aria-label="`Track ${trackIndex + 1} title`"
                      @input="updateTrackTitle(track, inputValue($event))"
                    >
                  </td>
                  <td>
                    <div class="audio-file-cell">
                      <div class="audio-file-main">
                        <span class="status-pill compact" :class="`tone-${trackUploadTone(track)}`">
                          <Loader2 v-if="track.uploadState === 'uploading'" class="size-3 animate-spin" />
                          {{ trackUploadLabel(track) }}
                        </span>
                        <label
                          class="table-upload-button"
                          :class="{
                            disabled: isUploadDisabled || track.uploadState === 'uploading',
                            uploading: track.uploadState === 'uploading',
                          }"
                          :for="`track-audio-${track.id}`"
                          :aria-label="`${track.audioFile || track.audioUploadedUrl ? 'Replace audio' : 'Upload audio'} for track ${trackIndex + 1}`"
                          @dragover.prevent
                          @drop.prevent="onTrackAudioDrop($event, track)"
                        >
                          <span>{{ track.uploadState === "uploading" ? "Uploading" : (track.audioFile || track.audioUploadedUrl ? "Replace audio" : "Upload audio") }}</span>
                          <input
                            :id="`track-audio-${track.id}`"
                            :key="`track-audio-${track.id}-${track.audioInputVersion}`"
                            class="sr-only"
                            type="file"
                            accept="audio/mpeg,audio/mp3,audio/wav"
                            :disabled="isUploadDisabled || track.uploadState === 'uploading'"
                            @change="onTrackAudioSelected($event, track)"
                          >
                        </label>
                      </div>
                      <small v-if="track.error" class="row-error">{{ track.error }}</small>
                    </div>
                  </td>
                  <td>
                    <div class="table-action-cluster">
                      <button type="button" class="table-action-button" @click="openTrackDetails(track)">
                        Details
                        <ChevronRight class="size-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        class="table-icon-action table-icon-action-danger"
                        :disabled="isUploadDisabled"
                        :aria-label="tracks.length === 1 ? `Clear track ${trackIndex + 1}` : `Delete track ${trackIndex + 1}`"
                        @click="removeTrack(track.id)"
                      >
                        <Trash2 class="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              </TransitionGroup>
            </table>
          </div>
        </section>

        <section id="uploader-delivery" class="release-section platform-section" data-step="4">
          <h3>Platforms</h3>
          <div
            class="delivery-strip surface-glint surface-glint-quiet"
          >
            <div class="platform-marquee" aria-label="Selected platforms">
              <div class="platform-marquee-track">
                <span
                  v-for="copyIndex in 2"
                  :key="copyIndex"
                  class="platform-marquee-group"
                  :aria-hidden="copyIndex > 1"
                >
                  <DspLogo
                    v-for="item in platformMarqueeItems"
                    :key="`${copyIndex}-${item}`"
                    :name="item"
                    size="xs"
                    :interactive="false"
                    class="platform-marquee-logo"
                  />
                </span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <aside class="release-readiness-panel" aria-label="Release readiness">
        <div
          class="readiness-card surface-glint surface-glint-quiet"
        >
          <header class="readiness-header">
            <div>
              <span class="readiness-eyebrow">Readiness</span>
              <h3>{{ readinessHeadline }}</h3>
            </div>
            <span
              class="readiness-score"
              :style="{ '--readiness-progress': `${readinessPercent * 3.6}deg` }"
              aria-hidden="true"
            >
              <span>{{ readinessPercent }}%</span>
            </span>
          </header>

          <div class="readiness-status-row">
            <span>{{ readinessSummary }} complete</span>
            <strong>{{ readinessPercent === 100 ? "All set" : "In progress" }}</strong>
          </div>

          <div class="readiness-meter" aria-hidden="true">
            <span :style="{ width: `${readinessPercent}%` }"></span>
          </div>

          <div class="review-checklist">
            <div
              v-for="item in checklistItems"
              :key="item.label"
              class="review-line"
              :data-state="readinessItemState(item)"
            >
              <span class="review-icon">
                <Check v-if="item.complete" class="size-4" />
                <span v-else class="readiness-dot" aria-hidden="true"></span>
              </span>
              <span>{{ item.label }}</span>
              <small>{{ readinessItemDetail(item) }}</small>
            </div>
          </div>

          <div class="submit-stack">
            <button
              type="button"
              class="desk-button desk-button-primary"
              :disabled="isUploadDisabled || isSubmitting"
              @click="submitRelease"
            >
              <Loader2 v-if="isSubmitting" class="size-4 animate-spin" />
              <Send v-else class="size-4" />
              {{ isSubmitting ? "Sending..." : "Send for review" }}
            </button>
            <button
              type="button"
              class="desk-button desk-button-secondary"
              :disabled="isUploadDisabled"
              @click="saveDraftLocally"
            >
              Save draft
            </button>
          </div>
        </div>
      </aside>
    </section>

    <Dialog :open="isAdditionalArtistDialogOpen" @update:open="setAdditionalArtistDialogOpen">
      <DialogContent class="additional-artist-dialog">
        <DialogHeader class="additional-artist-dialog-header">
          <DialogTitle class="additional-artist-title">{{ additionalArtistDialogTitle }}</DialogTitle>
        </DialogHeader>

        <div class="additional-artist-panel">
          <section class="additional-artist-manager" aria-label="Additional artist">
            <header class="additional-artist-manager-header">
              <span>Artist credit</span>
            </header>

            <div class="additional-artist-rows">
              <div class="additional-artist-row">
                <label class="additional-artist-row-name" :for="`additional-artist-name-${additionalArtistDraft.artist.id}`">
                  <span>Artist name</span>
                  <input
                    :id="`additional-artist-name-${additionalArtistDraft.artist.id}`"
                    v-model="additionalArtistDraft.artist.name"
                    type="text"
                    placeholder="Artist name"
                    :disabled="isUploadDisabled"
                  >
                </label>

                <label class="additional-artist-row-role">
                  <span>Role</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <button
                        type="button"
                        class="additional-artist-role-trigger"
                        :disabled="isUploadDisabled"
                        aria-label="Select artist role"
                      >
                        <span>{{ additionalArtistRoleLabel(additionalArtistDraft.artist.roleCode) }}</span>
                        <ChevronDown class="size-4" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" :side-offset="8" class="additional-artist-role-menu">
                      <DropdownMenuRadioGroup
                        :model-value="additionalArtistDraft.artist.roleCode"
                        @update:model-value="setAdditionalArtistRole(additionalArtistDraft.artist, String($event))"
                      >
                        <DropdownMenuGroup>
                          <DropdownMenuRadioItem
                            v-for="role in additionalArtistRoleOptions"
                            :key="role.value"
                            :value="role.value"
                          >
                            {{ role.label }}
                          </DropdownMenuRadioItem>
                        </DropdownMenuGroup>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </label>
              </div>
            </div>
          </section>

          <div class="additional-artist-dsp-stack">
            <section
              v-for="platform in additionalArtistPlatforms"
              :key="platform.id"
              class="additional-artist-dsp-card"
            >
              <div class="additional-artist-dsp-main">
                <header class="additional-artist-dsp-header">
                  <DspLogo :name="platform.logoName" :label="platform.label" size="sm" />
                </header>
                <span>Existing artist page?</span>
              </div>

              <div class="additional-artist-choice-group" role="radiogroup" :aria-label="`Artist already in ${platform.label}?`">
                <label
                  class="additional-artist-choice"
                  :class="{ selected: additionalArtistDraft.profileExists[platform.id] === true }"
                >
                  <input
                    type="radio"
                    :name="`additional-artist-${platform.id}`"
                    :checked="additionalArtistDraft.profileExists[platform.id] === true"
                    :disabled="isUploadDisabled"
                    @change="setAdditionalArtistProfile(platform.id, true)"
                  >
                  Yes
                </label>
                <label
                  class="additional-artist-choice"
                  :class="{ selected: additionalArtistDraft.profileExists[platform.id] === false }"
                >
                  <input
                    type="radio"
                    :name="`additional-artist-${platform.id}`"
                    :checked="additionalArtistDraft.profileExists[platform.id] === false"
                    :disabled="isUploadDisabled"
                    @change="setAdditionalArtistProfile(platform.id, false)"
                  >
                  No
                </label>
              </div>

              <label v-if="additionalArtistDraft.profileExists[platform.id]" class="additional-artist-profile-url">
                <span>Profile URL</span>
                <input
                  v-model="additionalArtistDraft.profileUrl[platform.id]"
                  type="url"
                  placeholder="https://"
                  :disabled="isUploadDisabled"
                >
              </label>

              <div v-else-if="additionalArtistDraft.profileExists[platform.id] === false" class="additional-artist-info">
                <Info class="size-4" aria-hidden="true" />
                <span>New artist page routed during review.</span>
              </div>
            </section>
          </div>

          <footer class="additional-artist-footer">
            <button type="button" class="desk-button desk-button-secondary" @click="setAdditionalArtistDialogOpen(false)">
              Cancel
            </button>
            <button
              type="button"
              class="desk-button desk-button-primary"
              :disabled="!canSaveAdditionalArtist"
              @click="saveAdditionalArtistDetails"
            >
              {{ additionalArtistSaveLabel }}
            </button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog :open="Boolean(activeTrackDetail)" @update:open="setTrackDetailOpen">
      <DialogContent class="track-detail-dialog">
        <DialogHeader>
          <DialogTitle>Track details</DialogTitle>
        </DialogHeader>

        <div v-if="activeTrackDetail" class="detail-sheet">
          <nav class="detail-tabs" aria-label="Track detail tabs">
            <button type="button" :class="{ active: activeTrackDetailTab === 'essentials' }" @click="activeTrackDetailTab = 'essentials'">Essentials</button>
            <button type="button" :class="{ active: activeTrackDetailTab === 'credits' }" @click="activeTrackDetailTab = 'credits'">Credits</button>
            <button type="button" :class="{ active: activeTrackDetailTab === 'lyrics' }" @click="activeTrackDetailTab = 'lyrics'">Lyrics</button>
          </nav>

          <div v-if="activeTrackDetailTab === 'essentials'" class="detail-grid">
            <label>
              <span>ISRC</span>
              <input v-model="activeTrackDetail.isrc" placeholder="Optional">
            </label>
            <div class="detail-field">
              <span>Version line</span>
              <div class="detail-control-field">
                <div class="version-line-cell" :class="{ 'is-custom': isCustomTrackVersion(activeTrackDetail) }">
                  <input
                    v-if="isCustomTrackVersion(activeTrackDetail)"
                    class="table-input version-line-custom-input"
                    :data-version-custom-track-id="activeTrackDetail.id"
                    :value="activeTrackDetail.versionLine"
                    placeholder="Custom version"
                    :disabled="isUploadDisabled"
                    aria-label="Custom version line"
                    @input="setCustomTrackVersion(activeTrackDetail, inputValue($event))"
                    @blur="commitCustomTrackVersion(activeTrackDetail)"
                  >
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <button
                        type="button"
                        class="table-select-trigger version-line-trigger"
                        :class="{ compact: isCustomTrackVersion(activeTrackDetail) }"
                        :disabled="isUploadDisabled"
                        aria-label="Version line"
                      >
                        <span v-if="!isCustomTrackVersion(activeTrackDetail)">{{ trackVersionLabel(activeTrackDetail) }}</span>
                        <ChevronDown class="size-3.5" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" :side-offset="8" class="version-line-menu">
                      <DropdownMenuItem
                        v-for="versionLine in VERSION_LINE_PRESETS"
                        :key="versionLine"
                        class="version-line-option"
                        @select="setTrackVersion(activeTrackDetail, versionLine)"
                      >
                        <Check
                          v-if="trackVersionPresetValue(activeTrackDetail) === versionLine"
                          class="size-3.5"
                          aria-hidden="true"
                        />
                        <span v-else class="version-line-option-icon" aria-hidden="true"></span>
                        <span>{{ versionLine }}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem class="version-line-custom-option" @select="startCustomTrackVersion(activeTrackDetail)">
                        <span class="version-line-option-icon" aria-hidden="true"></span>
                        Custom version
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            <div class="detail-field detail-wide">
              <span>TikTok audio</span>
              <div class="detail-control-field tiktok-detail-control">
                <div class="tiktok-time-cell detail-time-cell">
                  <label class="sr-only" :for="`detail-tiktok-minutes-${activeTrackDetail.id}`">TikTok minutes</label>
                  <div class="tiktok-stepper-field">
                    <input
                      :id="`detail-tiktok-minutes-${activeTrackDetail.id}`"
                      class="table-input table-time-input"
                      :value="activeTrackDetail.tiktokPreviewMinutes"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="2"
                      autocomplete="off"
                      placeholder="Min"
                      :disabled="isUploadDisabled"
                      @input="updateTiktokPreviewPart(activeTrackDetail, 'minutes', inputValue($event))"
                    >
                    <div class="tiktok-stepper-buttons">
                      <button
                        class="tiktok-stepper-button"
                        type="button"
                        aria-label="Increase TikTok minutes"
                        :disabled="isUploadDisabled"
                        @click="stepTiktokPreviewPart(activeTrackDetail, 'minutes', 1)"
                      >
                        <ChevronUp class="size-3" aria-hidden="true" />
                      </button>
                      <button
                        class="tiktok-stepper-button"
                        type="button"
                        aria-label="Decrease TikTok minutes"
                        :disabled="isUploadDisabled"
                        @click="stepTiktokPreviewPart(activeTrackDetail, 'minutes', -1)"
                      >
                        <ChevronDown class="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <span class="table-time-separator" aria-hidden="true">:</span>
                  <label class="sr-only" :for="`detail-tiktok-seconds-${activeTrackDetail.id}`">TikTok seconds</label>
                  <div class="tiktok-stepper-field">
                    <input
                      :id="`detail-tiktok-seconds-${activeTrackDetail.id}`"
                      class="table-input table-time-input"
                      :value="activeTrackDetail.tiktokPreviewSeconds"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="2"
                      autocomplete="off"
                      placeholder="Sec"
                      :disabled="isUploadDisabled"
                      @input="updateTiktokPreviewPart(activeTrackDetail, 'seconds', inputValue($event))"
                    >
                    <div class="tiktok-stepper-buttons">
                      <button
                        class="tiktok-stepper-button"
                        type="button"
                        aria-label="Increase TikTok seconds"
                        :disabled="isUploadDisabled"
                        @click="stepTiktokPreviewPart(activeTrackDetail, 'seconds', 1)"
                      >
                        <ChevronUp class="size-3" aria-hidden="true" />
                      </button>
                      <button
                        class="tiktok-stepper-button"
                        type="button"
                        aria-label="Decrease TikTok seconds"
                        :disabled="isUploadDisabled"
                        @click="stepTiktokPreviewPart(activeTrackDetail, 'seconds', -1)"
                      >
                        <ChevronDown class="size-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <label class="checkbox-field">
              <input
                type="checkbox"
                :checked="activeTrackDetail.containsAiGeneratedElements"
                @change="setTrackAiGeneratedElements(activeTrackDetail, checkedValue($event))"
              >
              <span>Contains AI generated song elements</span>
            </label>
            <label v-if="activeTrackDetail.containsAiGeneratedElements" class="detail-wide">
              <span>Which part is AI generated, or which instrument was used?</span>
              <textarea
                :value="activeTrackDetail.aiGeneratedDetails"
                rows="4"
                placeholder="Example: AI-generated backing vocals, synth lead, drums, guitar, or full instrumental."
                @input="setTrackAiGeneratedDetails(activeTrackDetail, inputValue($event))"
              ></textarea>
            </label>
          </div>

          <div v-else-if="activeTrackDetailTab === 'credits'" class="credit-detail-panel">
            <nav class="credit-subtabs" aria-label="Credit sections">
              <button type="button" :class="{ active: activeCreditDetailTab === 'writers' }" @click="activeCreditDetailTab = 'writers'">Writers</button>
              <button type="button" :class="{ active: activeCreditDetailTab === 'other' }" @click="activeCreditDetailTab = 'other'">Other</button>
            </nav>

            <div class="credit-table-shell">
              <table class="credit-table">
                <colgroup>
                  <col class="credit-col-name">
                  <col class="credit-col-role">
                  <col class="credit-col-actions">
                </colgroup>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(credit, creditIndex) in trackCreditRows(activeTrackDetail, activeCreditDetailTab)"
                    :key="`${activeTrackDetail.id}-${activeCreditDetailTab}-${creditIndex}`"
                  >
                    <td>
                      <input
                        class="credit-table-input"
                        :value="credit.creditedName"
                        :placeholder="activeCreditDetailTab === 'writers' ? 'Writer name' : 'Credit name'"
                        :disabled="isUploadDisabled"
                        @input="updateTrackCreditName(activeTrackDetail, activeCreditDetailTab, creditIndex, inputValue($event))"
                      >
                    </td>
                    <td>
                      <CreditRoleMultiSelect
                        class="credit-role-table-picker"
                        :input-id="`track-credit-role-search-${activeTrackDetail.id}-${activeCreditDetailTab}-${creditIndex}`"
                        :model-value="trackCreditRoleCodes(credit, activeCreditDetailTab)"
                        :role-groups="trackCreditRoleGroups(activeCreditDetailTab)"
                        :disabled="isUploadDisabled"
                        :compact="true"
                        :searchable="activeCreditDetailTab === 'other'"
                        :search-placeholder="activeCreditDetailTab === 'other' ? 'Search other roles' : 'Search writer roles'"
                        :initial-visible-count="activeCreditDetailTab === 'other' ? 36 : 8"
                        :load-more-count="activeCreditDetailTab === 'other' ? 36 : 8"
                        @update:model-value="updateTrackCreditRoles(activeTrackDetail, activeCreditDetailTab, creditIndex, $event)"
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        class="table-icon-action table-icon-action-danger"
                        :aria-label="`Remove ${trackCreditSectionLabel(activeCreditDetailTab)} credit ${creditIndex + 1}`"
                        :disabled="isUploadDisabled || (activeCreditDetailTab === 'writers' && trackCreditRows(activeTrackDetail, 'writers').length <= 1)"
                        @click="removeTrackCreditRow(activeTrackDetail, activeCreditDetailTab, creditIndex)"
                      >
                        <Trash2 class="size-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <button type="button" class="credit-add-row-button" :disabled="isUploadDisabled" @click="addTrackCreditRow(activeTrackDetail, activeCreditDetailTab)">
              <Plus class="size-3.5" aria-hidden="true" />
              <span>Add {{ activeCreditDetailTab === 'writers' ? 'writer' : 'credit' }}</span>
            </button>
          </div>

          <div v-else class="detail-grid">
            <label class="detail-wide">
              <span>Lyrics</span>
              <textarea v-model="activeTrackDetail.lyrics" rows="8" placeholder="Optional lyrics"></textarea>
            </label>
          </div>

          <footer class="detail-footer">
            <span v-if="activeTrackDetailIndex >= 0">{{ validateTrackDetails(activeTrackDetail, activeTrackDetailIndex) || "Track metadata complete." }}</span>
            <button type="button" class="desk-button desk-button-secondary" @click="setTrackDetailOpen(false)">Cancel</button>
            <button type="button" class="desk-button desk-button-primary" @click="saveActiveTrackDetails">Save details</button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
.uploaded-page {
  --release-content-inset: 0px;
  --uploader-panel-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 99%, white 1%), color-mix(in srgb, var(--card) 96%, var(--muted) 4%)),
    var(--card);
  --uploader-panel-border: color-mix(in srgb, var(--surface-border, var(--border)) 90%, var(--foreground) 5%);
  --uploader-panel-shadow: var(--surface-depth-standard, var(--shadow-card));
  --uploader-panel-shadow-hover: var(--surface-depth-standard-hover, var(--shadow-card-hover));
  --uploader-panel-shadow-current: var(--surface-card-shadow-current, var(--uploader-panel-shadow));
  --uploader-panel-shadow-current-hover: var(--surface-card-shadow-current-hover, var(--uploader-panel-shadow-hover));
  --uploader-control-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, white 2%), color-mix(in srgb, var(--muted) 17%, var(--card))),
    var(--card);
  --uploader-control-border: color-mix(in srgb, var(--border) 92%, var(--foreground) 6%);
  --uploader-field-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--foreground) 2%), color-mix(in srgb, var(--muted) 18%, var(--card))),
    var(--card);
  --uploader-field-border: color-mix(in srgb, var(--border) 84%, var(--foreground) 12%);
  --uploader-field-shadow: var(--surface-control-shadow, var(--surface-depth-control-inset));
  --uploader-divider: color-mix(in srgb, var(--border) 82%, transparent);
  --uploader-control-shadow: var(--surface-control-shadow, var(--surface-depth-control-inset));
  --uploader-accent-soft: color-mix(in srgb, var(--status-success) 9%, var(--card));
  --uploader-ink-soft: color-mix(in srgb, var(--foreground) 74%, var(--muted-foreground));
  display: grid;
  gap: 18px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
  color: var(--foreground);
  font-family: var(--font-app-sans);
}

:global(.light) .uploaded-page {
  --uploader-panel-bg:
    linear-gradient(180deg, var(--surface-glass-strong) 0%, var(--surface-glass) 58%, var(--surface-muted) 100%),
    var(--card);
  --uploader-panel-border: var(--surface-border);
  --uploader-panel-shadow: var(--surface-depth-standard, var(--shadow-card));
  --uploader-panel-shadow-hover: var(--surface-depth-standard-hover, var(--shadow-card-hover));
  --uploader-panel-shadow-current: var(--surface-card-shadow-current, var(--uploader-panel-shadow));
  --uploader-panel-shadow-current-hover: var(--surface-card-shadow-current-hover, var(--uploader-panel-shadow-hover));
  --uploader-control-bg:
    linear-gradient(180deg, var(--surface-glass-strong) 0%, color-mix(in srgb, var(--surface-muted) 64%, var(--card)) 100%),
    var(--surface-glass);
  --uploader-control-border: color-mix(in srgb, var(--surface-border) 86%, var(--foreground) 8%);
  --uploader-field-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong) 82%, var(--card)) 0%, color-mix(in srgb, var(--surface-muted) 58%, var(--card)) 100%),
    var(--surface-glass);
  --uploader-field-border: color-mix(in srgb, var(--input) 88%, var(--foreground) 8%);
  --uploader-field-shadow: var(--surface-depth-control-inset);
  --uploader-divider: color-mix(in srgb, var(--surface-border) 76%, transparent);
  --uploader-control-shadow: var(--surface-depth-control-inset);
  --uploader-accent-soft: color-mix(in srgb, var(--status-success) 8%, var(--surface-glass));
  --uploader-ink-soft: #4d4942;
  position: relative;
  margin: 0;
  padding: 0;
  background: transparent;
}

:global(.dark) .uploaded-page {
  --uploader-panel-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--foreground) 3%), var(--card)),
    var(--card);
}

.inline-actions,
.section-title-row {
  display: flex;
  align-items: center;
}

.release-desk {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 336px);
  align-items: start;
  gap: 28px;
  min-width: 0;
  max-width: min(100%, 1320px);
  width: 100%;
  box-sizing: border-box;
  overflow-x: clip;
  margin: 0 auto;
}

.release-canvas {
  display: grid;
  gap: 18px;
  min-width: 0;
  max-width: 100%;
  overflow-x: clip;
}

.release-readiness-panel {
  position: sticky;
  top: calc(var(--topbar-height, 64px) + 18px);
  min-width: 0;
  max-width: 100%;
}

.release-page-title {
  margin-left: var(--release-content-inset);
  padding-bottom: 8px;
}

.release-page-title :deep(.page-header) {
  gap: 6px;
}

.release-page-title :deep(.page-header-eyebrow) {
  color: color-mix(in srgb, var(--muted-foreground) 78%, var(--foreground));
  font-size: 11px;
  font-weight: 720;
}

.release-page-title :deep(.page-header-title) {
  font-size: 2.25rem;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.12;
}

.release-page-title :deep(.page-header-description) {
  max-width: 560px;
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground));
}

.section-note,
.delivery-strip p,
.submit-stack small {
  margin: 0;
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line-height);
}

.release-summary-card,
.delivery-strip,
.desk-table-shell,
.readiness-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid var(--uploader-panel-border);
  border-radius: 16px;
  background: var(--uploader-panel-bg);
  color: var(--card-foreground);
  box-shadow: var(--surface-card-shadow-current, var(--uploader-panel-shadow));
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-standard, 200ms) var(--ease-out);
}

.release-summary-card:hover,
.delivery-strip:hover,
.desk-table-shell:hover {
  border-color: color-mix(in srgb, var(--uploader-panel-border) 84%, var(--foreground) 16%);
  box-shadow: var(--surface-card-shadow-current-hover, var(--uploader-panel-shadow-hover));
}

.release-summary-card {
  display: grid;
  margin-left: var(--release-content-inset);
  padding: 24px;
}

:global(.light) .release-title-input {
  color: #625f59;
}

:global(.light) .release-title-input::placeholder {
  color: rgb(145 139 130 / 70%);
}

.release-summary-main {
  display: grid;
  gap: 18px;
  min-width: 0;
}

.release-summary-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  min-width: 0;
}

.release-title-line {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.release-kicker {
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: var(--text-caption-line-height);
  text-transform: none;
}

.release-title-input {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: 0;
  outline: 0;
  background: transparent;
  color: var(--foreground);
  padding: 0;
  font-family: inherit;
  font-size: 1.875rem;
  font-weight: 660;
  letter-spacing: 0;
  line-height: 1.2;
  box-shadow: none;
  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease;
}

.release-title-input::placeholder {
  color: color-mix(in srgb, var(--muted-foreground) 48%, transparent);
}

.release-title-input:not(:disabled):hover {
  background: transparent;
}

.release-title-input:not(:disabled):focus {
  box-shadow: none;
}

.release-title-input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.release-artist-row {
  display: flex;
  align-items: center;
  max-width: 100%;
  gap: 8px;
  min-width: 0;
  color: var(--muted-foreground);
}

.release-artist-label {
  flex: 0 0 auto;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 680;
  line-height: 1;
}

.release-artist-line {
  min-width: 0;
  max-width: 100%;
  color: color-mix(in srgb, var(--foreground) 78%, var(--muted-foreground));
  font-size: 13px;
  font-weight: 680;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artist-add-button {
  display: inline-flex;
  min-height: 28px;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  padding: 0 8px 0 6px;
  font-size: 12px;
  font-weight: 680;
  cursor: pointer;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}

.artist-add-button:hover,
.artist-add-button:focus-visible {
  border-color: color-mix(in srgb, var(--uploader-control-border) 78%, var(--foreground) 12%);
  background: color-mix(in srgb, var(--muted) 24%, var(--card));
  color: color-mix(in srgb, var(--foreground) 84%, var(--priority));
}

.artist-add-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

:global(.artist-add-menu) {
  width: max-content !important;
  min-width: 164px !important;
  max-width: min(220px, calc(100vw - 32px)) !important;
  border: 1px solid var(--uploader-field-border) !important;
  border-radius: 10px !important;
  background: var(--popover) !important;
  color: var(--foreground) !important;
  padding: 4px !important;
  box-shadow:
    0 10px 22px -18px color-mix(in srgb, var(--foreground) 34%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent) !important;
}

:global(.artist-add-menu .app-dropdown-menu-item) {
  cursor: pointer;
  font-size: 13px;
}

:global(.artist-add-menu-new) {
  min-height: 32px !important;
  border-radius: 7px !important;
  color: var(--foreground);
  font-weight: 700;
}

:global(.artist-add-menu-new[data-highlighted]),
:global(.artist-add-menu-new:focus) {
  background: color-mix(in srgb, var(--muted) 20%, var(--popover)) !important;
  color: var(--foreground) !important;
}

:global(.artist-add-menu-saved) {
  display: grid;
  gap: 2px;
  border-top: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  margin-top: 4px;
  padding-top: 4px;
}

:global(.artist-add-menu-saved > span) {
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground) 14%);
  font-size: var(--text-caption-size);
  font-weight: 700;
  letter-spacing: 0;
  line-height: var(--text-caption-line-height);
  padding: 5px 8px 3px;
  text-transform: uppercase;
}

:global(.artist-add-menu-saved-item) {
  min-height: 38px !important;
  align-items: center !important;
  border: 1px solid transparent;
  border-radius: 7px !important;
  padding-inline: 8px !important;
}

:global(.artist-add-menu-saved-item[data-highlighted]),
:global(.artist-add-menu-saved-item:focus) {
  border-color: transparent;
  background: color-mix(in srgb, var(--muted) 18%, var(--popover)) !important;
  color: var(--foreground) !important;
}

:global(.artist-add-menu-saved-item > span) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

:global(.artist-add-menu-saved-item strong),
:global(.artist-add-menu-saved-item small) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.artist-add-menu-saved-item strong) {
  color: var(--foreground);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.15;
}

:global(.artist-add-menu-saved-item small) {
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground) 18%);
  font-size: 10px;
  font-weight: 610;
  line-height: 1.15;
}

.release-collaborator-list {
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  gap: 7px;
  min-width: 0;
}

.release-collaborator-chip {
  display: inline-flex;
  max-width: min(100%, 360px);
  min-width: 0;
  align-items: stretch;
  overflow: hidden;
  border: 1px solid var(--uploader-field-border);
  border-radius: 999px;
  background: var(--uploader-field-bg);
  color: var(--foreground);
  box-shadow: var(--uploader-field-shadow);
}

.release-collaborator-edit,
.release-collaborator-delete {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.release-collaborator-edit {
  display: inline-flex;
  min-width: 0;
  min-height: 30px;
  align-items: center;
  gap: 7px;
  padding: 0 10px 0 12px;
  text-align: left;
}

.release-collaborator-name {
  overflow: hidden;
  color: color-mix(in srgb, var(--foreground) 86%, var(--muted-foreground));
  font-size: 12px;
  font-weight: 720;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.release-collaborator-role {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
}

.release-collaborator-delete {
  display: inline-grid;
  width: 31px;
  min-height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-left: 1px solid color-mix(in srgb, var(--uploader-field-border) 72%, transparent);
  color: color-mix(in srgb, var(--muted-foreground) 76%, var(--foreground));
}

.release-collaborator-edit:hover,
.release-collaborator-edit:focus-visible {
  background: color-mix(in srgb, var(--muted) 18%, transparent);
  color: var(--foreground);
  outline: 0;
}

.release-collaborator-delete:hover,
.release-collaborator-delete:focus-visible {
  background: color-mix(in srgb, var(--destructive) 8%, var(--card));
  color: var(--destructive);
  outline: 0;
}

.release-collaborator-edit:disabled,
.release-collaborator-delete:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.release-status-chip {
  margin-top: 6px;
  opacity: 0.76;
}

.release-summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  border-top: 1px solid var(--uploader-divider);
  padding-top: 18px;
}

.detail-grid label,
.detail-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.release-summary-field {
  display: grid;
  gap: 8px;
  min-width: 0;
  min-height: 62px;
  padding: 0;
  transition:
    color 150ms ease;
}

.release-summary-grid span,
.delivery-strip span,
.detail-grid span {
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line-height);
}

.release-summary-field > span {
  color: color-mix(in srgb, var(--muted-foreground) 84%, var(--foreground) 16%);
  font-size: var(--text-caption-size);
  font-weight: var(--text-caption-weight);
}

.release-select-trigger,
.release-summary-grid input,
.detail-grid input,
.detail-grid textarea {
  width: 100%;
  min-height: 46px;
  border: 1px solid var(--uploader-field-border);
  border-radius: var(--surface-radius-control, 12px);
  background: var(--uploader-field-bg);
  color: var(--foreground);
  font-size: var(--text-body-size);
  font-weight: 650;
  letter-spacing: 0;
  outline: 0;
  box-shadow: var(--uploader-field-shadow);
}

.release-select-trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  overflow: hidden;
  padding: 0 12px;
  cursor: pointer;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease;
}

.release-select-trigger::before {
  display: none;
  content: none;
}

.release-select-trigger:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--uploader-field-border) 74%, var(--foreground) 18%);
  box-shadow:
    var(--uploader-field-shadow),
    0 0 0 1px color-mix(in srgb, var(--foreground) 5%, transparent);
}

.release-select-trigger:focus-visible,
.release-select-trigger[data-state="open"],
.release-select-trigger[aria-expanded="true"] {
  border-color: color-mix(in srgb, var(--ring) 58%, var(--uploader-field-border));
  box-shadow:
    var(--uploader-field-shadow),
    0 0 0 3px color-mix(in srgb, var(--ring) 14%, transparent);
}

.release-select-trigger span {
  overflow: hidden;
  color: inherit;
  font-size: inherit;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.release-select-trigger svg {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--muted-foreground) 84%, var(--foreground) 16%);
  transition:
    color 140ms ease,
    transform 140ms ease;
}

.release-select-trigger:not(:disabled):hover svg,
.release-select-trigger:focus-visible svg,
.release-select-trigger[data-state="open"] svg,
.release-select-trigger[aria-expanded="true"] svg {
  color: color-mix(in srgb, var(--foreground) 78%, var(--muted-foreground) 22%);
}

.release-select-trigger[data-state="open"] svg,
.release-select-trigger[aria-expanded="true"] svg {
  transform: rotate(180deg);
}

.release-select-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.release-date-field :deep(.release-date-picker .app-picker__trigger) {
  position: relative;
  min-height: 46px !important;
  height: 46px !important;
  border: 1px solid var(--uploader-field-border) !important;
  border-radius: var(--surface-radius-control, 12px) !important;
  background: var(--uploader-field-bg) !important;
  color: var(--foreground) !important;
  overflow: hidden;
  padding: 0 12px !important;
  box-shadow: var(--uploader-field-shadow) !important;
  transform: none !important;
  font-size: var(--text-body-size) !important;
  font-weight: 650 !important;
  letter-spacing: 0 !important;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease !important;
}

.release-date-field :deep(.release-date-picker .app-picker__trigger::before) {
  display: none;
  content: none;
}

.release-date-field :deep(.release-date-picker .app-picker__trigger:hover),
.release-date-field :deep(.release-date-picker .app-picker__trigger:focus-visible) {
  border-color: color-mix(in srgb, var(--ring) 54%, var(--uploader-field-border)) !important;
  box-shadow:
    var(--uploader-field-shadow),
    0 0 0 3px color-mix(in srgb, var(--ring) 13%, transparent) !important;
}

.release-date-field :deep(.release-date-picker .app-picker__icon) {
  margin-right: 4px;
  color: color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground) 32%) !important;
}

:global(.release-summary-menu) {
  width: var(--radix-dropdown-menu-trigger-width) !important;
  min-width: var(--radix-dropdown-menu-trigger-width);
  max-width: calc(100vw - 32px);
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent) !important;
  border-radius: var(--surface-radius-control, 12px) !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 98%, var(--foreground) 2%), var(--popover)),
    var(--popover) !important;
  color: var(--foreground) !important;
  padding: 6px !important;
  box-shadow:
    0 18px 34px -24px rgb(0 0 0 / 42%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent) !important;
  transform-origin: var(--radix-dropdown-menu-content-transform-origin);
  animation-duration: 80ms !important;
}

:global(.release-genre-popover) {
  width: min(320px, calc(100vw - 32px)) !important;
  max-height: min(18rem, var(--radix-popover-content-available-height, calc(100vh - 32px)));
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent) !important;
  border-radius: var(--surface-radius-control, 12px) !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 98%, var(--foreground) 2%), var(--popover)),
    var(--popover) !important;
  color: var(--foreground) !important;
  padding: 6px !important;
  box-shadow:
    0 18px 34px -24px rgb(0 0 0 / 42%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent) !important;
  overflow: hidden;
  transform-origin: var(--radix-popover-content-transform-origin);
  animation-duration: 80ms !important;
}

:global(.release-genre-search) {
  width: 100%;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, transparent);
  border-radius: var(--surface-radius-compact, 10px);
  background: color-mix(in srgb, var(--muted) 12%, var(--popover));
  color: var(--foreground);
  padding: 0 10px;
  font-size: var(--text-body-size);
  font-weight: 650;
  letter-spacing: 0;
  outline: 0;
  box-shadow: var(--surface-control-shadow, var(--surface-depth-control-inset));
}

:global(.release-genre-search:focus) {
  border-color: color-mix(in srgb, var(--ring) 54%, var(--border));
  background: color-mix(in srgb, var(--muted) 16%, var(--popover));
  box-shadow:
    var(--surface-control-shadow, var(--surface-depth-control-inset)),
    0 0 0 3px color-mix(in srgb, var(--ring) 13%, transparent);
}

:global(.release-genre-options) {
  display: grid;
  gap: 2px;
  max-height: 13rem;
  margin-top: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

:global(.release-genre-option) {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 32px;
  border: 0;
  border-radius: var(--surface-radius-compact, 10px);
  background: transparent;
  color: var(--foreground);
  padding: 0 9px 0 7px;
  font-size: var(--text-body-size);
  font-weight: 650;
  text-align: left;
  cursor: pointer;
}

:global(.release-genre-option:hover),
:global(.release-genre-option:focus-visible) {
  background: color-mix(in srgb, var(--muted) 22%, var(--popover));
  outline: 0;
}

:global(.release-genre-option.selected) {
  background: color-mix(in srgb, var(--muted) 18%, var(--popover));
}

:global(.release-genre-option svg) {
  color: transparent;
}

:global(.release-genre-option.selected svg) {
  color: color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground));
}

:global(.release-genre-option span) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.release-genre-scroll-sentinel) {
  display: block;
  min-height: 10px;
  border-radius: 999px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--border) 24%, transparent), transparent);
}

:global(.release-summary-menu .app-dropdown-menu-radio-item) {
  max-width: 100%;
  min-height: 38px;
  border-radius: var(--surface-radius-compact, 10px);
  color: var(--foreground);
  font-size: var(--text-body-size);
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    background-color 80ms ease,
    color 80ms ease;
}

:global(.release-summary-menu .app-dropdown-menu-radio-item[data-highlighted]),
:global(.release-summary-menu .app-dropdown-menu-radio-item:focus) {
  background: color-mix(in srgb, var(--muted) 22%, var(--popover));
  color: var(--foreground);
}

:global(.release-summary-menu .app-dropdown-menu-radio-item[data-state="checked"]) {
  background: color-mix(in srgb, var(--muted) 18%, var(--popover));
  color: var(--foreground);
}

:global(.release-summary-menu .app-dropdown-menu-radio-item span:first-child) {
  color: color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground));
}

:global(.release-date-popover) {
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent) !important;
  border-radius: 14px !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 98%, var(--foreground) 2%), var(--popover)),
    var(--popover) !important;
  box-shadow:
    0 18px 36px -24px rgb(0 0 0 / 42%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent) !important;
  overflow: hidden;
  animation-duration: 80ms !important;
}

.release-summary-grid input:not(:disabled):focus {
  border-color: color-mix(in srgb, var(--ring) 58%, var(--uploader-field-border));
  box-shadow:
    var(--uploader-field-shadow),
    0 0 0 3px color-mix(in srgb, var(--ring) 14%, transparent);
}

.detail-grid input:focus,
.detail-grid textarea:focus,
.table-input:focus,
.table-select-trigger:focus-visible {
  border-color: color-mix(in srgb, var(--ring) 52%, var(--uploader-field-border));
  box-shadow:
    var(--uploader-field-shadow),
    0 0 0 2px color-mix(in srgb, var(--ring) 14%, transparent);
}

.status-pill {
  display: inline-flex;
  width: max-content;
  max-width: 100%;
  min-height: 26px;
  align-items: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: var(--surface-radius-compact, 10px);
  padding: 4px 10px;
  font-size: var(--text-caption-size);
  font-weight: var(--text-caption-weight);
  line-height: var(--text-caption-line-height);
  white-space: nowrap;
}

.release-summary-heading > .status-pill {
  min-height: 24px;
  padding: 0 10px;
  font-size: 12px;
}

.status-pill span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
}

.status-pill.compact {
  min-height: 22px;
  padding: 3px 8px;
  font-size: var(--text-caption-size);
}

.tone-success {
  border-color: color-mix(in srgb, var(--status-success) 28%, var(--border));
  background: color-mix(in srgb, var(--status-success) 11%, var(--card));
  color: var(--status-success);
}

.tone-warning {
  border-color: color-mix(in srgb, var(--priority) 24%, var(--border));
  background: color-mix(in srgb, var(--priority) 8%, var(--card));
  color: color-mix(in srgb, var(--priority) 64%, var(--foreground));
}

.tone-danger {
  border-color: color-mix(in srgb, var(--destructive) 20%, var(--border));
  background: color-mix(in srgb, var(--destructive) 7%, var(--card));
  color: color-mix(in srgb, var(--destructive) 74%, var(--foreground));
}

.tone-neutral {
  border-color: color-mix(in srgb, var(--border) 92%, transparent);
  background: color-mix(in srgb, var(--muted) 26%, var(--card));
  color: color-mix(in srgb, var(--muted-foreground) 88%, var(--foreground));
}

:global(.light) .tone-neutral {
  border-color: rgba(69, 55, 38, 0.12);
  background: #f5ecdd;
  color: #665847;
}

.release-section {
  position: relative;
  display: grid;
  gap: 12px;
  min-width: 0;
  padding-left: var(--release-content-inset);
  border-top: 1px solid var(--uploader-divider);
  padding-top: 22px;
  scroll-margin-top: 18px;
}

.release-section h3 {
  margin: 0;
  color: var(--uploader-ink-soft);
  font-family: var(--font-app-display);
  font-size: 15px;
  font-weight: 720;
  letter-spacing: 0;
  line-height: 1.3;
}

.section-title-row {
  justify-content: space-between;
  gap: 12px;
}

.artwork-row {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  gap: 20px;
  align-items: center;
  border: 1px solid var(--uploader-panel-border);
  border-radius: 16px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 72%, transparent), color-mix(in srgb, var(--muted) 8%, transparent)),
    color-mix(in srgb, var(--card) 66%, transparent);
  padding: 14px;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    var(--surface-depth-edge, 0 16px 40px -34px color-mix(in srgb, var(--foreground) 26%, transparent));
}

:global(.light) .artwork-row {
  border-color: color-mix(in srgb, var(--surface-border) 86%, var(--foreground) 6%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong) 58%, transparent) 0%, color-mix(in srgb, var(--surface-muted) 50%, transparent) 100%),
    var(--surface-glass);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 46%),
    var(--surface-depth-edge, 0 16px 40px -34px rgb(72 68 61 / 26%));
}

.cover-dropzone {
  position: relative;
  display: grid;
  aspect-ratio: 1;
  min-height: 0;
  overflow: hidden;
  place-items: center;
  align-content: center;
  gap: 0;
  border: 1px solid var(--uploader-panel-border);
  border-radius: 12px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--card) 98%, white 2%), color-mix(in srgb, var(--uploader-accent-soft) 72%, var(--card))),
    var(--card);
  color: var(--foreground);
  cursor: pointer;
  text-align: center;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 50%, transparent),
    0 14px 30px -25px color-mix(in srgb, var(--foreground) 30%, transparent);
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    box-shadow 150ms ease;
}

.cover-dropzone:hover {
  border-color: color-mix(in srgb, var(--foreground) 18%, var(--uploader-panel-border));
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--card) 98%, white 2%), color-mix(in srgb, var(--uploader-accent-soft) 84%, var(--card))),
    var(--card);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 58%, transparent),
    0 18px 38px -25px color-mix(in srgb, var(--foreground) 34%, transparent);
}

:global(.light) .cover-dropzone {
  border-color: color-mix(in srgb, var(--surface-border) 86%, var(--foreground) 6%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface-glass-strong) 78%, var(--surface-glass)) 0%, color-mix(in srgb, var(--uploader-accent-soft) 72%, var(--surface-muted)) 100%),
    var(--surface-glass);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 52%),
    0 1px 2px rgb(72 68 61 / 12%),
    0 20px 44px -32px rgb(72 68 61 / 30%);
}

:global(.light) .cover-dropzone:hover {
  border-color: color-mix(in srgb, var(--surface-border) 72%, var(--foreground) 18%);
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--surface-glass-strong) 84%, var(--surface-glass)) 0%, color-mix(in srgb, var(--uploader-accent-soft) 78%, var(--surface-muted)) 100%),
    var(--surface-glass);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 58%),
    0 2px 5px rgb(72 68 61 / 13%),
    0 26px 54px -32px rgb(72 68 61 / 34%);
}

.cover-dropzone.disabled,
.table-upload-button.disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

.cover-dropzone.uploading {
  cursor: progress;
  border-color: color-mix(in srgb, var(--priority) 20%, var(--surface-border));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 42%),
    0 1px 2px rgb(72 68 61 / 10%),
    0 18px 36px -30px rgb(72 68 61 / 22%);
}

.cover-dropzone-empty {
  display: grid;
  place-items: center;
  gap: 7px;
  padding: 14px;
}

.cover-dropzone-empty svg {
  color: color-mix(in srgb, var(--foreground) 58%, var(--muted-foreground));
}

.cover-dropzone-empty strong {
  font-size: 13px;
  font-weight: 740;
}

.cover-dropzone-empty small {
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  font-size: 11px;
  font-weight: 620;
}

.cover-uploading-overlay {
  --cover-ai-core: color-mix(in srgb, var(--priority) 30%, white 20%);
  --cover-ai-dot: color-mix(in srgb, var(--priority) 72%, var(--foreground));
  --cover-ai-dot-soft: color-mix(in srgb, var(--priority) 28%, transparent);
  --cover-ai-grid-line: color-mix(in srgb, var(--foreground) 11%, transparent);
  --cover-ai-scan: color-mix(in srgb, var(--priority) 42%, white 22%);
  --cover-ai-surface: color-mix(in srgb, var(--popover) 86%, white 4%);
  position: absolute;
  inset: 10px;
  z-index: 3;
  isolation: isolate;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  place-items: center;
  gap: 7px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--priority, var(--ring)) 16%, transparent);
  border-radius: 10px;
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--cover-ai-core) 18%, transparent), transparent 40%),
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 86%, transparent), color-mix(in srgb, var(--card) 78%, transparent)),
    color-mix(in srgb, var(--popover) 76%, rgb(255 255 255 / 6%));
  color: var(--foreground);
  padding: 9px;
  text-align: center;
  backdrop-filter: blur(8px) saturate(1.06);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 24%, transparent),
    0 14px 28px -24px rgb(0 0 0 / 38%);
}

:global(.light) .cover-uploading-overlay {
  --cover-ai-core: #d0b57d;
  --cover-ai-dot: #a88752;
  --cover-ai-dot-soft: rgb(168 135 82 / 28%);
  --cover-ai-grid-line: rgb(47 39 29 / 10%);
  --cover-ai-scan: rgb(222 199 151 / 58%);
  --cover-ai-surface: rgb(252 247 238 / 84%);
  background:
    radial-gradient(circle at 50% 42%, rgb(205 177 121 / 19%), transparent 40%),
    linear-gradient(180deg, rgb(255 251 244 / 78%), rgb(239 232 220 / 68%)),
    rgb(246 240 229 / 72%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 62%),
    0 14px 28px -24px rgb(72 68 61 / 34%);
}

.cover-ai-stage {
  position: relative;
  display: block;
  width: min(72px, 78%);
  max-width: 74px;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--cover-ai-dot) 18%, transparent);
  border-radius: 14px;
  background:
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--cover-ai-core) 30%, transparent), transparent 48%),
    linear-gradient(135deg, color-mix(in srgb, var(--cover-ai-surface) 94%, white 3%), color-mix(in srgb, var(--card) 58%, transparent));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 28%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--foreground) 7%, transparent),
    0 18px 32px -30px color-mix(in srgb, var(--priority) 46%, transparent);
}

.cover-ai-stage::before {
  position: absolute;
  inset: 10px;
  z-index: 2;
  border: 1px solid color-mix(in srgb, var(--cover-ai-dot) 18%, transparent);
  border-radius: 999px;
  content: "";
  opacity: 0.42;
}

.cover-ai-stage::after {
  position: absolute;
  inset: 0;
  z-index: 5;
  background:
    linear-gradient(180deg, color-mix(in srgb, white 14%, transparent), transparent 46%),
    radial-gradient(circle at 50% 92%, color-mix(in srgb, var(--foreground) 10%, transparent), transparent 42%);
  content: "";
  pointer-events: none;
}

.cover-ai-grid,
.cover-ai-scan,
.cover-ai-particles,
.cover-ai-core {
  position: absolute;
  inset: 0;
}

.cover-ai-grid {
  z-index: 1;
  background-image:
    linear-gradient(var(--cover-ai-grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--cover-ai-grid-line) 1px, transparent 1px),
    radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--cover-ai-dot-soft) 86%, transparent), transparent 48%);
  background-position: center;
  background-size: 13px 13px, 13px 13px, 100% 100%;
  opacity: 0.88;
  animation: cover-ai-grid-breathe 2.8s ease-in-out infinite;
}

.cover-ai-scan {
  inset: -28% -64%;
  z-index: 4;
  background:
    linear-gradient(110deg, transparent 35%, color-mix(in srgb, var(--cover-ai-scan) 8%, transparent) 43%, var(--cover-ai-scan) 50%, color-mix(in srgb, var(--cover-ai-scan) 12%, transparent) 58%, transparent 67%);
  opacity: 0.72;
  transform: translateX(-34%) rotate(-13deg);
  animation: cover-ai-scan-pass 2.35s ease-in-out infinite;
  mix-blend-mode: screen;
}

.cover-ai-particles {
  z-index: 3;
}

.cover-ai-particle {
  position: absolute;
  top: var(--cover-particle-y);
  left: var(--cover-particle-x);
  width: var(--cover-particle-size);
  height: var(--cover-particle-size);
  border-radius: 999px;
  background: var(--cover-ai-dot);
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.68);
  animation: cover-ai-particle-bloom var(--cover-particle-duration) ease-in-out var(--cover-particle-delay) infinite;
  box-shadow:
    0 0 7px color-mix(in srgb, var(--cover-ai-dot) 64%, transparent),
    0 0 14px var(--cover-ai-dot-soft);
  will-change: opacity, transform;
}

.cover-ai-core {
  inset: 30%;
  z-index: 4;
  border-radius: 999px;
  background:
    radial-gradient(circle, color-mix(in srgb, white 78%, var(--cover-ai-core)) 0 7%, var(--cover-ai-core) 22%, color-mix(in srgb, var(--cover-ai-core) 36%, transparent) 46%, transparent 68%);
  opacity: 0.76;
  transform: scale(0.94);
  animation: cover-ai-core-pulse 2.2s ease-in-out infinite;
  box-shadow:
    0 0 18px color-mix(in srgb, var(--cover-ai-core) 54%, transparent),
    0 0 34px color-mix(in srgb, var(--cover-ai-dot) 20%, transparent);
}

.cover-upload-copy {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 1px;
  max-width: 100%;
}

.cover-upload-copy strong {
  font-size: 11px;
  font-weight: 780;
  line-height: 1.16;
}

.cover-upload-copy small {
  color: color-mix(in srgb, var(--muted-foreground) 72%, var(--foreground));
  font-size: 10px;
  font-weight: 720;
  line-height: 1.2;
}

.cover-preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition:
    filter 180ms ease,
    opacity 180ms ease,
    transform 220ms ease;
}

.cover-dropzone.uploading .cover-preview-image {
  opacity: 0.64;
  filter: blur(1.2px) saturate(0.78) contrast(0.92);
  transform: scale(1.012);
}

.cover-dropzone-overlay {
  position: absolute;
  inset: auto 10px 10px;
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 28%);
  border-radius: 9px;
  background: rgb(16 14 12 / 58%);
  color: white;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 720;
  opacity: 0;
  transition:
    opacity 150ms ease,
    transform 150ms ease;
  transform: translateY(4px);
}

.cover-dropzone:hover .cover-dropzone-overlay,
.cover-dropzone:focus-within .cover-dropzone-overlay {
  opacity: 1;
  transform: translateY(0);
}

@keyframes cover-ai-grid-breathe {
  0%,
  100% {
    background-size: 13px 13px, 13px 13px, 100% 100%;
    opacity: 0.76;
  }

  50% {
    background-size: 12px 12px, 12px 12px, 100% 100%;
    opacity: 0.98;
  }
}

@keyframes cover-ai-scan-pass {
  0%,
  16% {
    opacity: 0;
    transform: translateX(-34%) rotate(-13deg);
  }

  42% {
    opacity: 0.72;
  }

  72%,
  100% {
    opacity: 0;
    transform: translateX(34%) rotate(-13deg);
  }
}

@keyframes cover-ai-particle-bloom {
  0% {
    opacity: 0;
    filter: blur(0);
    transform: translate(-50%, -50%) scale(0.62);
  }

  18% {
    opacity: var(--cover-particle-opacity);
  }

  58% {
    opacity: var(--cover-particle-opacity);
    filter: blur(0);
    transform: translate(calc(-50% + var(--cover-particle-drift-x)), calc(-50% + var(--cover-particle-drift-y))) scale(1.04);
  }

  100% {
    opacity: 0;
    filter: blur(0.8px);
    transform: translate(calc(-50% + var(--cover-particle-drift-x)), calc(-50% + var(--cover-particle-drift-y))) scale(0.52);
  }
}

@keyframes cover-ai-core-pulse {
  0%,
  100% {
    opacity: 0.6;
    transform: scale(0.9);
  }

  50% {
    opacity: 0.86;
    transform: scale(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cover-ai-grid,
  .cover-ai-scan,
  .cover-ai-particle,
  .cover-ai-core {
    animation: none;
  }

  .cover-ai-grid {
    opacity: 0.82;
  }

  .cover-ai-scan {
    opacity: 0.22;
    transform: translateX(0) rotate(-13deg);
  }

  .cover-ai-particle {
    opacity: var(--cover-particle-opacity);
    filter: none;
    transform: translate(-50%, -50%) scale(0.86);
  }

  .cover-ai-core {
    opacity: 0.72;
    transform: scale(1);
  }
}

.upload-file-state small,
.row-error {
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
  line-height: var(--text-caption-line-height);
}

.upload-file-state {
  position: relative;
  display: grid;
  gap: 8px;
  min-width: 0;
}

.upload-file-header {
  position: relative;
  display: grid;
  gap: 4px;
  min-width: 0;
}

.upload-file-eyebrow {
  color: color-mix(in srgb, var(--muted-foreground) 80%, var(--foreground));
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.upload-file-state strong {
  overflow: hidden;
  color: var(--foreground);
  font-size: 15px;
  font-weight: 760;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-file-state p {
  max-width: 480px;
  margin: 0;
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground));
  font-size: 13px;
  line-height: 1.45;
}

.inline-actions {
  gap: 8px;
}

.desk-button,
.desk-icon-button,
.table-upload-button,
.table-action-button,
.table-icon-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  border: 1px solid var(--uploader-control-border);
  border-radius: 9px;
  background: var(--uploader-control-bg);
  color: var(--foreground);
  padding: 0 14px;
  font-size: 13px;
  font-weight: 680;
  letter-spacing: 0;
  text-decoration: none;
  cursor: pointer;
  box-shadow: var(--uploader-control-shadow);
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    box-shadow 150ms ease,
    opacity 150ms ease;
}

.table-upload-button,
.table-action-button {
  min-width: 88px;
}

.table-upload-button {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}

.table-upload-button > span:first-child {
  position: relative;
  z-index: 1;
}

.table-upload-button.uploading {
  cursor: progress;
  border-color: color-mix(in srgb, var(--priority) 18%, var(--uploader-control-border));
  background: color-mix(in srgb, var(--card) 96%, var(--priority) 4%);
  color: color-mix(in srgb, var(--foreground) 90%, var(--priority));
  box-shadow:
    var(--uploader-control-shadow),
    0 0 0 2px color-mix(in srgb, var(--priority) 5%, transparent);
}

.table-upload-button.uploading.disabled {
  opacity: 1;
}

.table-action-button {
  gap: 5px;
}

.table-icon-action {
  width: 34px;
  padding: 0;
}

.desk-button-primary {
  gap: 8px;
  min-height: 38px;
  border-color: color-mix(in srgb, var(--priority) 72%, var(--foreground) 10%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--priority-hover) 94%, white 6%), var(--priority));
  color: var(--priority-foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 38%, transparent),
    0 12px 24px -18px color-mix(in srgb, var(--priority) 64%, transparent);
}

.desk-button-primary:hover,
.desk-button-primary:focus-visible {
  border-color: color-mix(in srgb, var(--priority-hover) 84%, var(--foreground) 10%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 44%, transparent),
    0 0 0 3px color-mix(in srgb, var(--priority) 18%, transparent),
    0 18px 32px -24px color-mix(in srgb, var(--priority) 58%, transparent);
}

:global(.light) .desk-button-primary {
  border-color: color-mix(in srgb, var(--priority) 78%, #2a1e13 10%);
  background: linear-gradient(180deg, var(--priority-hover), var(--priority));
  color: var(--priority-foreground);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 38%),
    0 1px 1px rgb(72 68 61 / 10%),
    0 18px 30px -24px color-mix(in srgb, var(--priority) 42%, transparent);
}

:global(.light) .desk-button-primary:hover,
:global(.light) .desk-button-primary:focus-visible {
  border-color: color-mix(in srgb, var(--priority-hover) 82%, #3a2918 8%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 44%),
    0 0 0 3px color-mix(in srgb, var(--priority) 15%, transparent),
    0 22px 38px -26px color-mix(in srgb, var(--priority) 50%, transparent);
}

.desk-button-secondary:hover,
.table-upload-button:hover,
.table-action-button:hover,
.table-icon-action:hover,
.desk-icon-button:hover {
  border-color: color-mix(in srgb, var(--uploader-control-border) 72%, var(--foreground) 18%);
  background: color-mix(in srgb, var(--muted) 28%, var(--card));
}

.table-icon-action-danger {
  color: color-mix(in srgb, var(--destructive) 84%, var(--foreground));
}

.table-icon-action-danger:hover {
  border-color: color-mix(in srgb, var(--destructive) 42%, var(--border));
  background: color-mix(in srgb, var(--destructive) 9%, var(--card));
  color: var(--destructive);
}

.desk-button:disabled,
.desk-icon-button:disabled,
.table-icon-action:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.desk-icon-button {
  width: 34px;
  padding: 0;
}

.desk-table-shell {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-gutter: stable;
}

:global(.light) .desk-table-shell,
:global(.light) .delivery-strip {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong) 76%, transparent) 0%, color-mix(in srgb, var(--surface-muted) 64%, transparent) 100%),
    var(--surface-glass);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 54%),
    0 1px 2px rgb(72 68 61 / 11%),
    0 18px 40px -32px rgb(72 68 61 / 26%),
    0 44px 92px -74px rgb(72 68 61 / 24%);
}

.desk-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}

.masters-table {
  min-width: 780px;
}

.table-col-index {
  width: 82px;
}

.masters-table .table-col-audio-file {
  width: 260px;
}

.masters-table .table-col-actions {
  width: 188px;
}

.desk-table th,
.desk-table td {
  border-bottom: 1px solid var(--uploader-divider);
  height: 50px;
  padding: 8px 14px;
  text-align: left;
  vertical-align: middle;
}

.desk-table th {
  background: color-mix(in srgb, var(--muted) 14%, var(--card));
  color: color-mix(in srgb, var(--muted-foreground) 78%, var(--foreground));
  font-size: 11px;
  font-weight: 720;
}

.desk-table tr:last-child td {
  border-bottom: 0;
}

.masters-track-row {
  transition:
    background-color 160ms ease,
    opacity 160ms ease;
}

.masters-track-row td {
  transition:
    background-color 160ms ease,
    box-shadow 160ms ease;
}

.masters-track-row.is-dragging td {
  background: color-mix(in srgb, var(--priority) 8%, var(--card));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--priority) 24%, transparent);
}

.masters-track-row.is-drag-over td {
  background: color-mix(in srgb, var(--priority) 5%, var(--card));
}

.track-reorder-move {
  transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.track-reorder-enter-active,
.track-reorder-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.track-reorder-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.track-reorder-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.desk-table th,
.desk-table td,
.table-input,
.table-select-trigger {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.masters-table th:first-child,
.masters-table td:first-child {
  overflow: visible;
  text-overflow: clip;
}

.table-input,
.table-select-trigger {
  width: 100%;
  min-height: 32px;
  border: 1px solid transparent;
  border-radius: var(--surface-radius-compact, 8px);
  background: transparent;
  color: var(--foreground);
  outline: 0;
  box-shadow: none;
}

.table-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
  padding: 0 8px;
  font-size: 13px;
  font-weight: 680;
  text-align: left;
  cursor: pointer;
}

.table-select-trigger span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-select-trigger svg {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
}

.table-select-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.tiktok-time-cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.table-time-input {
  min-width: 0;
  padding: 0 8px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  appearance: textfield;
}

.table-time-input::-webkit-outer-spin-button,
.table-time-input::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}

.table-time-separator {
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  font-weight: 760;
}

.tiktok-stepper-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 24px;
  align-items: stretch;
  min-width: 0;
  min-height: 32px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--uploader-field-border) 82%, transparent);
  border-radius: 9px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--uploader-field-bg) 92%, var(--card) 8%),
      color-mix(in srgb, var(--uploader-field-bg) 86%, var(--foreground) 4%)
    );
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    0 1px 2px color-mix(in srgb, var(--foreground) 8%, transparent);
  transition:
    border-color 140ms ease,
    box-shadow 140ms ease,
    background 140ms ease;
}

.tiktok-stepper-field:focus-within {
  border-color: color-mix(in srgb, var(--ring) 52%, var(--uploader-field-border));
  box-shadow:
    var(--uploader-field-shadow),
    0 0 0 2px color-mix(in srgb, var(--ring) 14%, transparent);
}

.tiktok-stepper-field .table-time-input {
  min-height: 30px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.tiktok-stepper-field .table-time-input:focus {
  border-color: transparent;
  box-shadow: none;
}

.tiktok-stepper-buttons {
  display: grid;
  grid-template-rows: 1fr 1fr;
  min-width: 0;
  border-left: 1px solid color-mix(in srgb, var(--uploader-field-border) 78%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-muted) 42%, transparent),
      color-mix(in srgb, var(--surface-muted) 26%, transparent)
    );
}

.tiktok-stepper-button {
  display: grid;
  min-width: 0;
  min-height: 0;
  place-items: center;
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  cursor: pointer;
  padding: 0;
  transition:
    background-color 140ms ease,
    color 140ms ease;
}

.tiktok-stepper-button:first-child {
  border-bottom: 1px solid color-mix(in srgb, var(--uploader-field-border) 58%, transparent);
}

.tiktok-stepper-button:hover:not(:disabled),
.tiktok-stepper-button:focus-visible {
  background: color-mix(in srgb, var(--priority) 18%, transparent);
  color: var(--foreground);
  outline: 0;
}

.tiktok-stepper-button:disabled {
  cursor: not-allowed;
  opacity: 0.44;
}

.version-line-cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.version-line-cell.is-custom {
  grid-template-columns: minmax(120px, 1fr) 34px;
}

.version-line-custom-input {
  min-width: 0;
  padding: 0 8px;
}

.version-line-trigger.compact {
  width: 34px;
  min-width: 34px;
  padding: 0;
  justify-content: center;
}

:global(.version-line-menu) {
  width: max(176px, var(--radix-dropdown-menu-trigger-width)) !important;
  min-width: 176px;
  max-width: min(208px, calc(100vw - 32px));
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent) !important;
  border-radius: 10px !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 99%, var(--foreground) 1%), var(--popover)),
    var(--popover) !important;
  color: var(--foreground) !important;
  padding: 4px !important;
  box-shadow:
    0 14px 28px -22px rgb(0 0 0 / 38%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent) !important;
}

:global(.version-line-menu .app-dropdown-menu-item) {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  min-height: 32px;
  border-radius: 7px;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 660;
  line-height: 1.2;
  padding: 0 9px;
}

:global(.version-line-menu .app-dropdown-menu-item[data-highlighted]),
:global(.version-line-menu .app-dropdown-menu-item:focus) {
  background: color-mix(in srgb, var(--muted) 18%, var(--popover));
  color: var(--foreground);
}

:global(.version-line-menu .app-dropdown-menu-item svg),
.version-line-option-icon {
  width: 14px;
  height: 14px;
  align-self: center;
  color: color-mix(in srgb, var(--foreground) 74%, var(--muted-foreground));
}

:global(.version-line-menu .app-dropdown-menu-item span:last-child) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.version-line-custom-option) {
  margin-top: 4px;
  color: color-mix(in srgb, var(--foreground) 82%, var(--muted-foreground));
}

.audio-file-cell {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.audio-file-main {
  display: grid;
  grid-template-columns: minmax(0, max-content) minmax(112px, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.track-order-cell,
.table-action-cluster {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.track-order-cell {
  gap: 8px;
  color: var(--muted-foreground);
  font-variant-numeric: tabular-nums;
}

.track-grip-button {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: color-mix(in srgb, var(--muted-foreground) 76%, var(--foreground));
  cursor: grab;
  touch-action: none;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}

.track-grip-button:hover,
.track-grip-button:focus-visible {
  border-color: color-mix(in srgb, var(--foreground) 12%, var(--border));
  background: color-mix(in srgb, var(--muted) 24%, var(--card));
  color: color-mix(in srgb, var(--foreground) 74%, var(--muted-foreground));
}

.track-grip-button:active {
  cursor: grabbing;
  transform: scale(0.96);
}

.masters-track-row.is-dragging .track-grip-button {
  cursor: grabbing;
  border-color: color-mix(in srgb, var(--priority) 34%, var(--border));
  background: color-mix(in srgb, var(--priority) 10%, var(--card));
  color: var(--priority);
}

.track-grip-button.disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.table-action-cluster {
  justify-content: flex-end;
  width: 100%;
  gap: 7px;
  opacity: 0.72;
  transition: opacity 150ms ease;
}

.masters-track-row:hover .table-action-cluster,
.masters-track-row:focus-within .table-action-cluster {
  opacity: 1;
}

.row-error {
  display: block;
  margin-top: 4px;
  color: var(--destructive);
}

.delivery-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  align-items: center;
  min-height: 48px;
  padding: 0 12px;
}

.platform-section {
  gap: 10px;
}

.platform-marquee {
  position: relative;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 8px 0;
  mask-image: linear-gradient(90deg, transparent 0%, black 10%, black 90%, transparent 100%);
}

.platform-marquee-track {
  display: flex;
  width: max-content;
  align-items: center;
  animation: platform-marquee-left 30s linear infinite;
  will-change: transform;
}

.platform-marquee-group {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  min-width: max-content;
  padding-right: 12px;
}

.platform-marquee-logo {
  flex: 0 0 auto;
  opacity: 0.98;
  filter: saturate(0.96);
}

.platform-marquee:hover .platform-marquee-track {
  animation-play-state: paused;
}

@keyframes platform-marquee-left {
  from {
    transform: translateX(0);
  }

  to {
    transform: translateX(-50%);
  }
}

.readiness-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--foreground) 2%), color-mix(in srgb, var(--card) 92%, var(--muted) 8%)),
    var(--card);
}

:global(.light) .readiness-card {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass) 78%, transparent) 0%, color-mix(in srgb, var(--surface-muted) 70%, transparent) 100%),
    var(--surface-glass);
  border-color: color-mix(in srgb, var(--surface-border) 90%, var(--foreground) 6%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 48%),
    0 24px 62px -54px rgb(72 68 61 / 30%);
}

.readiness-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.readiness-header h3 {
  margin: 4px 0 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: 17px;
  font-weight: 740;
  letter-spacing: 0;
  line-height: var(--text-section-title-line-height);
}

.readiness-eyebrow {
  color: color-mix(in srgb, var(--muted-foreground) 78%, var(--foreground));
  font-size: 11px;
  font-weight: 720;
  letter-spacing: 0;
  line-height: var(--text-caption-line-height);
  text-transform: uppercase;
}

.readiness-score {
  --readiness-progress: 0deg;
  position: relative;
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border-radius: 999px;
  background:
    conic-gradient(from -90deg, color-mix(in srgb, var(--priority-hover) 92%, white 6%) var(--readiness-progress), color-mix(in srgb, var(--muted) 56%, var(--card)) 0);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 24%, transparent),
    0 14px 30px -24px color-mix(in srgb, var(--priority) 40%, transparent);
}

.readiness-score::before {
  position: absolute;
  inset: 6px;
  border-radius: inherit;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 2%), color-mix(in srgb, var(--card) 92%, var(--muted) 8%));
  content: "";
  box-shadow:
    inset 0 1px 1px color-mix(in srgb, var(--foreground) 10%, transparent),
    inset 0 -1px 0 color-mix(in srgb, white 9%, transparent);
}

.readiness-score span {
  position: relative;
  z-index: 1;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 780;
  line-height: 1;
}

.readiness-status-row {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--uploader-panel-border) 74%, transparent);
  border-radius: 11px;
  background: color-mix(in srgb, var(--muted) 12%, transparent);
  padding: 8px 10px;
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground));
  font-size: 12px;
  font-weight: 680;
}

.readiness-status-row strong {
  flex: 0 0 auto;
  color: var(--uploader-ink-soft);
  font-size: 12px;
  font-weight: 760;
}

.readiness-meter {
  overflow: hidden;
  height: 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 66%, var(--card));
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--foreground) 10%, transparent);
}

.readiness-meter span {
  position: relative;
  display: block;
  overflow: hidden;
  height: 100%;
  border-radius: inherit;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--priority) 80%, var(--foreground) 6%), var(--priority-hover));
  transition: width 220ms ease;
}

.readiness-meter span::after {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(110deg, transparent 0%, color-mix(in srgb, white 30%, transparent) 44%, transparent 66%);
  content: "";
  transform: translateX(-100%);
  animation: readiness-meter-sheen 1.8s ease-in-out infinite;
}

:global(.light) .readiness-meter {
  background: #d9d3c8;
  box-shadow:
    inset 0 1px 2px rgb(72 68 61 / 14%),
    inset 0 -1px 0 rgb(255 255 255 / 48%);
}

:global(.light) .readiness-meter span {
  background:
    linear-gradient(90deg, #ad9064 0%, #c5aa78 100%);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 22%),
    0 0 0 1px rgb(95 83 66 / 12%);
}

:global(.light) .readiness-score {
  background:
    conic-gradient(from -90deg, #c2a575 var(--readiness-progress), #ddd7cc 0);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 42%),
    0 18px 36px -28px rgb(72 68 61 / 28%);
}

:global(.light) .readiness-score::before {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong) 90%, white 4%), color-mix(in srgb, var(--surface-glass) 88%, var(--surface-muted)));
}

:global(.light) .readiness-status-row {
  border-color: color-mix(in srgb, var(--surface-border) 78%, transparent);
  background: color-mix(in srgb, var(--surface-glass-strong) 48%, transparent);
}

@keyframes readiness-meter-sheen {
  0% {
    transform: translateX(-100%);
  }

  54%,
  100% {
    transform: translateX(100%);
  }
}

.review-checklist,
.submit-stack {
  min-width: 0;
}

.review-checklist {
  display: grid;
  gap: 4px;
}

.review-line {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 2px 9px;
  align-items: center;
  min-height: 38px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px 7px;
  color: color-mix(in srgb, var(--foreground) 88%, var(--muted-foreground));
  font-size: 13px;
  font-weight: 650;
  background: transparent;
}

.review-line[data-state="attention"] {
  border-color: color-mix(in srgb, var(--priority) 12%, transparent);
  background: color-mix(in srgb, var(--priority) 7%, transparent);
}

.review-line small {
  grid-column: 2;
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  font-size: 12px;
  font-weight: 650;
  line-height: 1.25;
  white-space: normal;
}

.review-icon {
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 16%, var(--card));
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
}

.review-line[data-state="attention"] .review-icon {
  border-color: color-mix(in srgb, var(--priority) 22%, var(--border));
  background: color-mix(in srgb, var(--priority) 10%, var(--card));
  color: color-mix(in srgb, var(--priority) 68%, var(--foreground));
}

.review-line[data-state="complete"] .review-icon {
  border-color: color-mix(in srgb, var(--status-success) 22%, var(--border));
  background: color-mix(in srgb, var(--status-success) 10%, var(--card));
  color: color-mix(in srgb, var(--status-success) 84%, var(--foreground));
}

.readiness-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.72;
}

.submit-stack {
  display: grid;
  align-content: start;
  gap: 8px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

:global(.additional-artist-dialog) {
  --artist-modal-bg:
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--foreground) 4%, transparent), transparent 32%),
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--foreground) 2%), color-mix(in srgb, var(--card) 96%, var(--background) 6%)),
    var(--card);
  --artist-panel-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 2%), color-mix(in srgb, var(--muted) 10%, var(--card))),
    var(--card);
  --artist-panel-border: color-mix(in srgb, var(--surface-border, var(--border)) 82%, var(--foreground) 6%);
  --artist-panel-shadow: var(--surface-depth-edge);
  --artist-field-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, var(--foreground) 2%), color-mix(in srgb, var(--background) 10%, var(--card))),
    var(--card);
  --artist-field-border: color-mix(in srgb, var(--border) 84%, var(--foreground) 9%);
  --artist-field-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--background) 24%, transparent);
  --artist-button-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 97%, var(--foreground) 2%), color-mix(in srgb, var(--muted) 12%, var(--card))),
    var(--card);
  --artist-segment-bg: color-mix(in srgb, var(--background) 12%, transparent);
  --artist-selected-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--foreground) 10%, var(--card)), color-mix(in srgb, var(--foreground) 6%, var(--card))),
    var(--card);
  --artist-selected-border: color-mix(in srgb, var(--foreground) 22%, var(--artist-field-border));
  --artist-selected-fg: var(--foreground);
  --artist-focus-border: color-mix(in srgb, var(--foreground) 26%, var(--artist-field-border));
  --artist-focus-ring: color-mix(in srgb, var(--foreground) 9%, transparent);
  --artist-info-bg: color-mix(in srgb, var(--foreground) 5%, transparent);
  --artist-primary-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--foreground) 98%, var(--background) 4%), color-mix(in srgb, var(--foreground) 90%, var(--background) 10%));
  --artist-primary-fg: var(--background);
  max-width: min(720px, calc(100vw - 32px)) !important;
  max-height: min(820px, calc(100dvh - 48px));
  gap: 14px !important;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, var(--foreground) 7%) !important;
  border-radius: 18px !important;
  background:
    var(--artist-modal-bg) !important;
  color: var(--foreground) !important;
  padding: 24px 24px 20px !important;
  box-shadow:
    0 32px 72px -48px rgb(0 0 0 / 58%),
    0 10px 22px -20px rgb(0 0 0 / 42%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 10%, transparent),
    inset 0 -1px 0 color-mix(in srgb, var(--background) 42%, transparent) !important;
}

:global(.light .additional-artist-dialog) {
  --artist-modal-bg:
    radial-gradient(circle at 18% 0%, rgb(255 255 255 / 42%), transparent 36%),
    linear-gradient(180deg, var(--surface-glass-strong) 0%, var(--surface-glass) 100%),
    var(--card);
  --artist-panel-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong) 76%, var(--card)) 0%, color-mix(in srgb, var(--surface-muted) 42%, var(--card)) 100%),
    var(--surface-glass);
  --artist-panel-border: color-mix(in srgb, var(--surface-border) 92%, var(--foreground) 6%);
  --artist-panel-shadow: var(--surface-depth-edge);
  --artist-field-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong) 72%, var(--card)) 0%, color-mix(in srgb, var(--surface-muted) 50%, var(--card)) 100%),
    var(--surface-glass);
  --artist-field-border: color-mix(in srgb, var(--input) 86%, var(--foreground) 8%);
  --artist-field-shadow:
    inset 0 1px 0 rgb(255 255 255 / 48%),
    inset 0 -1px 0 rgb(42 34 25 / 7%);
  --artist-button-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong) 76%, var(--card)) 0%, color-mix(in srgb, var(--surface-muted) 48%, var(--card)) 100%),
    var(--surface-glass);
  --artist-segment-bg: color-mix(in srgb, var(--surface-muted) 72%, var(--card));
  --artist-selected-bg:
    linear-gradient(180deg, var(--surface-glass-strong) 0%, color-mix(in srgb, var(--surface-muted) 30%, var(--card)) 100%),
    var(--surface-glass);
  --artist-selected-border: color-mix(in srgb, var(--foreground) 24%, var(--surface-border));
  --artist-selected-fg: #17120d;
  --artist-focus-border: rgba(27, 22, 17, 0.28);
  --artist-focus-ring: rgba(27, 22, 17, 0.08);
  --artist-info-bg: rgba(27, 22, 17, 0.035);
  --artist-primary-bg:
    linear-gradient(180deg, #191510 0%, #11100d 100%);
  --artist-primary-fg: #fffaf3;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 92%),
    0 2px 5px rgb(69 55 38 / 10%),
    0 30px 74px -46px rgb(69 55 38 / 36%),
    0 72px 120px -92px rgb(69 55 38 / 32%) !important;
}

:global(.additional-artist-dialog::before) {
  position: absolute;
  inset: 0 24px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--foreground) 16%, transparent), transparent);
  content: "";
  pointer-events: none;
}

:global(.additional-artist-dialog [aria-label="Close"]) {
  top: 18px;
  right: 18px;
  display: inline-grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--artist-field-border) 82%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--muted) 12%, transparent);
  color: color-mix(in srgb, var(--foreground) 72%, var(--muted-foreground));
  opacity: 1;
  transition:
    background-color 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    box-shadow 150ms ease;
}

:global(.additional-artist-dialog [aria-label="Close"]:hover),
:global(.additional-artist-dialog [aria-label="Close"]:focus-visible) {
  border-color: color-mix(in srgb, var(--artist-field-border) 70%, var(--foreground) 20%);
  background: color-mix(in srgb, var(--muted) 22%, var(--card));
  color: var(--foreground);
  box-shadow: 0 0 0 3px var(--artist-focus-ring);
}

.additional-artist-dialog-header {
  padding-right: 44px;
}

.additional-artist-title {
  color: var(--foreground);
  font-size: 20px;
  font-weight: 780;
  letter-spacing: 0;
}

.additional-artist-panel {
  display: grid;
  gap: 14px;
  min-width: 0;
}

.additional-artist-manager {
  position: relative;
  display: grid;
  gap: 10px;
  min-width: 0;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 0 0 4px;
  box-shadow: none;
}

.additional-artist-dsp-card::before {
  position: absolute;
  inset: 0 16px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--foreground) 13%, transparent), transparent);
  content: "";
  display: none;
  pointer-events: none;
}

.additional-artist-manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--foreground);
}

.additional-artist-manager-header > span {
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground) 14%);
  font-size: var(--text-caption-size);
  font-weight: var(--text-caption-weight);
  letter-spacing: 0;
  line-height: var(--text-caption-line-height);
  text-transform: uppercase;
}

.additional-artist-rows {
  display: grid;
  gap: 8px;
}

.additional-artist-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(164px, 0.36fr);
  align-items: end;
  gap: 12px;
  min-width: 0;
}

.additional-artist-name-field,
.additional-artist-row-name,
.additional-artist-row-role,
.additional-artist-profile-url {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.additional-artist-profile-url {
  grid-column: 1 / -1;
}

.additional-artist-name-field span,
.additional-artist-row-name span,
.additional-artist-row-role span,
.additional-artist-profile-url span {
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground) 14%);
  font-size: 11px;
  font-weight: 650;
  line-height: 1;
}

.additional-artist-name-field input,
.additional-artist-row-name input,
.additional-artist-role-trigger,
.additional-artist-profile-url input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--artist-field-border);
  border-radius: 12px;
  background: var(--artist-field-bg);
  color: var(--foreground);
  padding: 0 13px;
  font-size: 13px;
  font-weight: 650;
  outline: 0;
  box-shadow: var(--artist-field-shadow);
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease;
}

.additional-artist-name-field input::placeholder,
.additional-artist-row-name input::placeholder,
.additional-artist-profile-url input::placeholder {
  color: color-mix(in srgb, var(--muted-foreground) 76%, transparent);
}

.additional-artist-name-field input:not(:disabled):hover,
.additional-artist-row-name input:not(:disabled):hover,
.additional-artist-role-trigger:not(:disabled):hover,
.additional-artist-profile-url input:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--artist-field-border) 74%, var(--foreground) 18%);
}

.additional-artist-name-field input:focus,
.additional-artist-row-name input:focus,
.additional-artist-role-trigger:focus-visible,
.additional-artist-role-trigger[data-state="open"],
.additional-artist-role-trigger[aria-expanded="true"],
.additional-artist-profile-url input:focus {
  border-color: var(--artist-focus-border);
  box-shadow:
    var(--artist-field-shadow),
    0 0 0 3px var(--artist-focus-ring);
}

.additional-artist-name-field input:disabled,
.additional-artist-row-name input:disabled,
.additional-artist-role-trigger:disabled,
.additional-artist-profile-url input:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.additional-artist-role-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
}

.additional-artist-role-trigger::before {
  position: absolute;
  inset: 0 14px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--foreground) 14%, transparent), transparent);
  content: "";
  display: none;
  pointer-events: none;
}

.additional-artist-role-trigger span {
  overflow: hidden;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.additional-artist-role-trigger svg {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--muted-foreground) 84%, var(--foreground) 16%);
  transition:
    color 140ms ease,
    transform 140ms ease;
}

.additional-artist-role-trigger:hover svg,
.additional-artist-role-trigger:focus-visible svg,
.additional-artist-role-trigger[data-state="open"] svg,
.additional-artist-role-trigger[aria-expanded="true"] svg {
  color: color-mix(in srgb, var(--foreground) 88%, var(--muted-foreground) 12%);
}

.additional-artist-role-trigger[data-state="open"] svg,
.additional-artist-role-trigger[aria-expanded="true"] svg {
  transform: rotate(180deg);
}

.additional-artist-role-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

:global(.additional-artist-role-menu) {
  width: var(--radix-dropdown-menu-trigger-width) !important;
  min-width: var(--radix-dropdown-menu-trigger-width);
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent) !important;
  border-radius: 14px !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 98%, var(--foreground) 2%), var(--popover)),
    var(--popover) !important;
  color: var(--foreground) !important;
  padding: 6px !important;
  box-shadow:
    0 18px 34px -24px rgb(0 0 0 / 42%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent) !important;
  transform-origin: var(--radix-dropdown-menu-content-transform-origin);
  animation-duration: 80ms !important;
}

:global(.additional-artist-role-menu .app-dropdown-menu-radio-item) {
  min-height: 38px;
  border-radius: 8px;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 680;
  transition:
    background-color 80ms ease,
    color 80ms ease;
}

:global(.additional-artist-role-menu .app-dropdown-menu-radio-item[data-highlighted]),
:global(.additional-artist-role-menu .app-dropdown-menu-radio-item:focus) {
  background: color-mix(in srgb, var(--muted) 22%, var(--popover));
  color: var(--foreground);
}

:global(.additional-artist-role-menu .app-dropdown-menu-radio-item[data-state="checked"]) {
  background: color-mix(in srgb, var(--muted) 18%, var(--popover));
  color: var(--foreground);
}

.additional-artist-dsp-stack {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.additional-artist-dsp-card {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px 12px;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--artist-panel-border);
  border-radius: 15px;
  background: var(--artist-panel-bg);
  padding: 14px;
  box-shadow: var(--artist-panel-shadow);
}

.additional-artist-dsp-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.additional-artist-dsp-header {
  display: flex;
  align-items: center;
  min-width: 0;
}

.additional-artist-dsp-main > span {
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground) 18%);
  font-size: 12px;
  font-weight: 640;
  line-height: 1.25;
}

:global(.additional-artist-dsp-header .dsp-logo) {
  opacity: 0.9;
}

:global(.dark .additional-artist-dsp-header .dsp-logo[aria-label="Apple Music"] .dsp-logo-image-dark) {
  filter: invert(1) brightness(1.78) contrast(0.94);
  opacity: 0.82;
}

.additional-artist-choice-group {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 5px;
  border: 1px solid color-mix(in srgb, var(--artist-field-border) 76%, transparent);
  border-radius: 12px;
  background: var(--artist-segment-bg);
  padding: 3px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent);
}

.additional-artist-choice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  min-height: 32px;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--foreground);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: none;
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease;
}

.additional-artist-choice:hover {
  border-color: color-mix(in srgb, var(--artist-field-border) 84%, var(--foreground) 8%);
  background: color-mix(in srgb, var(--card) 54%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent);
}

.additional-artist-choice:focus-within {
  border-color: var(--artist-focus-border);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    0 0 0 3px var(--artist-focus-ring);
}

.additional-artist-choice:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.58;
}

.additional-artist-choice.selected {
  border-color: var(--artist-selected-border);
  background: var(--artist-selected-bg);
  color: var(--artist-selected-fg);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    0 1px 0 color-mix(in srgb, var(--background) 32%, transparent);
}

.additional-artist-choice input {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 1px;
  margin: 0;
  appearance: none;
  opacity: 0;
  pointer-events: none;
}

.additional-artist-choice.selected input {
  opacity: 0;
}

.additional-artist-info {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  border: 0;
  border-radius: 10px;
  background: var(--artist-info-bg);
  color: color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground));
  padding: 7px 9px;
  font-size: 12px;
  font-weight: 620;
  line-height: 1.35;
}

.additional-artist-info svg {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--foreground) 66%, var(--muted-foreground) 34%);
}

.additional-artist-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid color-mix(in srgb, var(--artist-panel-border) 72%, transparent);
  padding-top: 16px;
}

.additional-artist-footer .desk-button {
  min-height: 42px;
  border-radius: 11px;
  padding: 0 18px;
  font-size: 13px;
}

.additional-artist-footer .desk-button-secondary {
  border-color: transparent;
  background: transparent;
  color: color-mix(in srgb, var(--foreground) 76%, var(--muted-foreground));
  box-shadow: none;
}

.additional-artist-footer .desk-button-secondary:hover,
.additional-artist-footer .desk-button-secondary:focus-visible {
  border-color: var(--artist-field-border);
  background: var(--artist-button-bg);
  color: var(--foreground);
  box-shadow: var(--artist-field-shadow);
}

.additional-artist-footer .desk-button-primary {
  border-color: color-mix(in srgb, var(--foreground) 76%, var(--background) 18%);
  background: var(--artist-primary-bg);
  color: var(--artist-primary-fg);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 14%, transparent),
    0 12px 22px -18px color-mix(in srgb, var(--foreground) 54%, transparent);
}

.additional-artist-footer .desk-button-primary:hover,
.additional-artist-footer .desk-button-primary:focus-visible {
  border-color: color-mix(in srgb, var(--foreground) 84%, var(--background) 12%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 18%, transparent),
    0 0 0 3px var(--artist-focus-ring),
    0 14px 26px -18px color-mix(in srgb, var(--foreground) 56%, transparent);
}

:global(.track-detail-dialog) {
  max-width: 640px !important;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 88%, var(--foreground) 6%) !important;
  border-radius: var(--radius-xl, 14px) !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 84%, var(--surface-muted) 16%), color-mix(in srgb, var(--card) 82%, var(--surface-muted) 18%)),
    var(--popover) !important;
  color: var(--foreground) !important;
  box-shadow:
    0 22px 44px -28px rgb(0 0 0 / 38%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent) !important;
}

.detail-sheet {
  display: grid;
  gap: 16px;
}

.detail-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--surface-border) 92%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-muted) 56%, var(--card));
  padding: 4px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent);
}

.detail-tabs button {
  min-height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 740;
  cursor: pointer;
}

.detail-tabs button.active {
  background: color-mix(in srgb, var(--surface-glass-strong) 74%, var(--card));
  color: var(--foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--surface-border) 96%, transparent);
}

.credit-detail-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.credit-subtabs {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: min(100%, 320px);
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--surface-border) 92%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-muted) 56%, var(--card));
  padding: 4px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent);
}

.credit-subtabs button {
  min-height: 32px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 740;
  cursor: pointer;
}

.credit-subtabs button.active {
  background: color-mix(in srgb, var(--surface-glass-strong) 74%, var(--card));
  color: var(--foreground);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--surface-border) 96%, transparent);
}

.credit-table-shell {
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--surface-border) 94%, transparent);
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--surface-glass-strong) 70%, var(--card)) 0%, color-mix(in srgb, var(--surface-glass) 72%, var(--surface-muted)) 100%),
    var(--surface-glass);
  box-shadow:
    var(--uploader-field-shadow),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent);
}

.credit-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.credit-col-name {
  width: 48%;
}

.credit-col-role {
  width: auto;
}

.credit-col-actions {
  width: 48px;
}

.credit-table th,
.credit-table td {
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border) 78%, transparent);
  padding: 7px 8px;
  text-align: left;
}

.credit-table tr:last-child td {
  border-bottom: 0;
}

.credit-table th {
  height: 34px;
  background: color-mix(in srgb, var(--surface-muted) 58%, transparent);
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground));
  font-size: 12px;
  font-weight: 760;
}

.credit-table td {
  height: 52px;
}

.credit-table-input,
.credit-role-trigger {
  width: 100%;
  min-height: 38px;
  border: 1px solid var(--input);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-muted) 48%, var(--card));
  color: var(--foreground);
  font-size: 14px;
  font-weight: 660;
  outline: 0;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent);
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease;
}

.credit-table-input {
  padding: 0 10px;
}

.credit-table-input::placeholder,
.credit-role-trigger.empty {
  color: color-mix(in srgb, var(--muted-foreground) 78%, var(--foreground));
}

.credit-table-input:focus,
.credit-role-trigger:focus-visible,
.credit-role-trigger[data-state="open"],
.credit-role-trigger[aria-expanded="true"] {
  border-color: var(--artist-focus-border);
  background: color-mix(in srgb, var(--surface-glass-strong) 70%, var(--card));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent),
    0 0 0 3px var(--artist-focus-ring);
}

.credit-role-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px;
  cursor: pointer;
  text-align: left;
}

.credit-role-trigger span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credit-role-trigger svg {
  flex: 0 0 auto;
  color: color-mix(in srgb, var(--muted-foreground) 84%, var(--foreground) 16%);
  transition:
    color 140ms ease,
    transform 140ms ease;
}

.credit-role-trigger[data-state="open"] svg,
.credit-role-trigger[aria-expanded="true"] svg {
  transform: rotate(180deg);
}

.credit-table td:last-child {
  text-align: right;
}

.credit-add-row-button {
  justify-self: start;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  border: 1px solid color-mix(in srgb, var(--surface-border) 88%, transparent);
  border-radius: 9px;
  background: color-mix(in srgb, var(--surface-glass) 72%, var(--surface-muted) 28%);
  color: var(--foreground);
  padding: 0 12px;
  font-size: 13px;
  font-weight: 740;
  cursor: pointer;
  box-shadow:
    var(--uploader-field-shadow),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent);
  transition:
    border-color 140ms ease,
    background-color 140ms ease,
    box-shadow 140ms ease;
}

.credit-add-row-button:hover,
.credit-add-row-button:focus-visible {
  border-color: color-mix(in srgb, var(--border) 72%, var(--foreground) 20%);
  background: color-mix(in srgb, var(--surface-glass-strong) 72%, var(--surface-glass) 28%);
  box-shadow:
    var(--uploader-field-shadow),
    0 0 0 3px var(--artist-focus-ring),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent);
}

:global(.credit-role-menu) {
  width: max(180px, var(--radix-dropdown-menu-trigger-width)) !important;
  max-width: min(320px, calc(100vw - 32px));
  max-height: min(330px, calc(100vh - 120px));
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent) !important;
  border-radius: 12px !important;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 98%, var(--foreground) 2%), var(--popover)),
    var(--popover) !important;
  color: var(--foreground) !important;
  padding: 5px !important;
  box-shadow:
    0 18px 34px -24px rgb(0 0 0 / 42%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent) !important;
}

:global(.credit-role-menu .app-dropdown-menu-radio-item) {
  min-height: 34px;
  border-radius: 8px;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 660;
}

:global(.credit-role-menu .app-dropdown-menu-radio-item[data-highlighted]),
:global(.credit-role-menu .app-dropdown-menu-radio-item:focus),
:global(.credit-role-menu .app-dropdown-menu-radio-item[data-state="checked"]) {
  background: color-mix(in srgb, var(--muted) 20%, var(--popover));
  color: var(--foreground);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-grid input,
.detail-grid textarea {
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--muted) 22%, var(--card));
  padding: 0 10px;
}

.detail-control-field {
  width: 100%;
  min-width: 0;
  min-height: 46px;
  border: 1px solid var(--border);
  border-radius: var(--surface-radius-control, 12px);
  background: color-mix(in srgb, var(--muted) 22%, var(--card));
  padding: 6px;
  box-shadow: var(--uploader-field-shadow);
}

.detail-control-field .table-input,
.detail-control-field .table-select-trigger {
  min-height: 32px;
  border-radius: 8px;
  background: transparent;
}

.tiktok-detail-control {
  width: max-content;
  max-width: 100%;
  min-height: 0;
  padding: 5px;
}

.detail-time-cell {
  max-width: 220px;
}

.tiktok-detail-control .detail-time-cell {
  grid-template-columns: 132px auto 132px;
  max-width: 100%;
}

.detail-grid textarea {
  padding-block: 10px;
  resize: vertical;
}

.detail-wide,
.checkbox-field {
  grid-column: 1 / -1;
}

.checkbox-field {
  grid-template-columns: auto minmax(0, 1fr) !important;
  align-items: center;
}

.checkbox-field input {
  width: 16px;
  min-height: 16px;
}

.detail-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}

.detail-footer span {
  color: var(--muted-foreground);
  font-size: 12px;
}

@media (max-width: 1320px) {
  .release-desk {
    grid-template-columns: 1fr;
    max-width: min(100%, 1180px);
  }

  .release-readiness-panel {
    position: static;
  }
}

@media (max-width: 960px) {
  .delivery-strip {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 780px) {
  .release-summary-card,
  .artwork-row,
  .delivery-strip {
    grid-template-columns: 1fr;
  }

  .release-summary-grid,
  .detail-grid {
    grid-template-columns: 1fr;
  }

  .additional-artist-dsp-stack,
  .additional-artist-dsp-card {
    grid-template-columns: 1fr;
  }

  .additional-artist-row {
    grid-template-columns: 1fr;
  }

  .additional-artist-row-name,
  .additional-artist-row-role {
    grid-column: 1 / -1;
  }

  .additional-artist-choice-group {
    width: 100%;
  }

  .additional-artist-footer {
    flex-direction: column-reverse;
  }

  .additional-artist-footer,
  .additional-artist-footer .desk-button {
    width: 100%;
  }

  .release-summary-grid {
    gap: 12px;
    padding-top: 12px;
  }

  .release-summary-card {
    padding: 14px;
  }

  .release-summary-heading {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .release-title-line {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .release-title-input {
    width: 100%;
    font-size: 1.375rem;
  }

  .release-artist-row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .release-artist-line {
    white-space: normal;
  }

  .readiness-header {
    display: grid;
  }

  .desk-table-shell {
    max-width: 100%;
    overflow: visible;
  }

  .uploaded-page,
  .release-desk,
  .release-canvas,
  .release-section {
    overflow-x: clip;
  }

  .desk-table,
  .desk-table tbody,
  .desk-table tr,
  .desk-table td {
    display: block;
    width: 100%;
  }

  .desk-table thead {
    display: none;
  }

  .masters-table {
    min-width: 0;
    border-collapse: separate;
    border-spacing: 0;
  }

  .masters-track-row {
    display: grid !important;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    padding: 14px;
  }

  .masters-track-row td {
    height: auto;
    border-bottom: 0;
    padding: 0;
    white-space: normal;
  }

  .masters-track-row td:nth-child(1) {
    width: max-content;
  }

  .masters-track-row td:nth-child(2) {
    min-width: 0;
  }

  .masters-track-row td:nth-child(3),
  .masters-track-row td:nth-child(4) {
    grid-column: 1 / -1;
  }

  .table-input,
  .table-select-trigger {
    min-height: 36px;
    border: 1px solid var(--uploader-field-border);
    border-radius: 8px;
    background: var(--uploader-field-bg);
    padding: 0 10px;
    box-shadow: var(--uploader-field-shadow);
  }

  .table-upload-button,
  .table-action-button {
    width: 100%;
  }

  .table-action-cluster {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    width: 100%;
    opacity: 1;
  }

  .detail-footer {
    grid-template-columns: 1fr;
  }

  .detail-footer .desk-button {
    width: 100%;
  }
}
</style>
