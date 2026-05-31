<script setup lang="ts">
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Clock3,
  Disc3,
  FileAudio,
  ImageUp,
  ListMusic,
  Loader2,
  MoreHorizontal,
  Music2,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  ShieldCheck,
  Shuffle,
  SkipBack,
  SkipForward,
  Store,
  Trash2,
  UploadCloud,
  Volume2,
  XCircle,
} from "lucide-vue-next"
import type { DateValue } from "@internationalized/date"
import { getLocalTimeZone, parseDate, today as calendarToday } from "@internationalized/date"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  TRACK_ADDITIONAL_CREDIT_ROLE_GROUPS,
  TRACK_ARTIST_CREDIT_ROLE_GROUPS,
  TRACK_WRITER_CREDIT_ROLE_GROUPS,
  RELEASE_GENRE_OPTIONS,
  RELEASE_STORE_OPTIONS,
  type ReleaseType,
  type TrackCreditInput,
} from "~~/types/catalog"
import {
  ARTIST_DSP_PROFILE_PLATFORMS,
  type ArtistDspProfileDraft,
  type ArtistDspProfileRecord,
  type ArtistSettingsMutationResponse,
  type ArtistSettingsResponse,
} from "~~/types/settings"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

type UploadKind = "cover" | "audio"
type UploadState = "idle" | "uploading" | "done" | "error"
type TrackDetailTab = "general" | "participants" | "lyrics"
type ParticipantCreditSection = "artist" | "writer" | "additional"
type UploadStep = "identity" | "cover" | "audio" | "credits" | "stores" | "submit"
type ReleaseDateHighlightTone = "emergency" | "perfect" | "playlist"

interface CreditDraft {
  creditedName: string
  roleCodes: string[]
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
  tiktokPreviewTime: string
  versionLine: string
  containsAiGeneratedElements: boolean
  audioFile: File | null
  audioInputVersion: number
  audioUploadProgress: number
  audioUploadedUrl: string
  audioUploadXhr: XMLHttpRequest | null
  audioUploadRequestId: number
  uploadState: UploadState
  error: string
  detailOpen: boolean
  detailTab: TrackDetailTab
  detailsSaved: boolean
  participantSection: ParticipantCreditSection
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
const uploadSettingsQuery = {
  surface: "upload_preferences",
}
const { data: settingsData, refresh: refreshSettings } = useLazyFetch<ArtistSettingsResponse>("/api/dashboard/settings", {
  query: uploadSettingsQuery,
})
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))
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
const isSavingDspProfiles = ref(false)
const pageError = ref("")
const pageSuccess = ref("")
const dspProfileMessage = ref("")
const submittedReleaseId = ref("")
const selectedStores = ref<string[]>([...RELEASE_STORE_OPTIONS])
const activeUploadStep = ref<UploadStep>("identity")
const uploaderScroller = ref<HTMLElement | null>(null)
const activeUploaderSectionIndex = ref(0)
const uploaderScrollProgress = ref(0)
const mainArtistDrafts = reactive<Record<string, string>>({})
const spotifyTrackTable = ref<HTMLElement | null>(null)
const spotifyPreviewAudio = ref<HTMLAudioElement | null>(null)
const metaWaveformCanvas = ref<HTMLCanvasElement | null>(null)
const audioPreviewUrls = reactive<Record<string, string>>({})
const activePreviewTrackId = ref("")
const previewPlaybackRequested = ref(false)
const isPreviewPlaying = ref(false)
const previewCurrentTime = ref(0)
const previewDuration = ref(0)
const previewVolume = ref(0.82)
const previewPlaybackSurface = ref<"release" | "meta">("release")
const metaStickerStyle = ref<"card" | "minimal">("card")
const metaClipStart = ref(0)
const metaPreviewTimeInput = ref("")
const isMetaPreviewTimeFocused = ref(false)
const isMetaWaveformDragging = ref(false)
const { confirmAction } = useConfirmAction()
const releaseDateTimeZone = getLocalTimeZone()

const form = reactive({
  artistId: "",
  title: "",
  type: "single" as ReleaseType,
  genre: "Pop",
  releaseDate: defaultReleaseDate(),
  notes: "",
})
const dspProfileDrafts = ref<ArtistDspProfileDraft[]>(blankDspProfileDrafts(""))
const tracks = ref<UploadTrackDraft[]>([createTrackDraft()])

const releaseTypeOptions: Array<{ label: string; value: ReleaseType; meta: string }> = [
  { label: "Single", value: "single", meta: "1 track" },
  { label: "EP", value: "ep", meta: "2 to 6 tracks" },
  { label: "Album", value: "album", meta: "7+ tracks" },
]
const trackVersionOptions = ["Original", "Cover", "Remix", "Instrumental", "Reprise Version"] as const
const META_CLIP_SECONDS = 15
const showLegacyUploadSections = false
const uploaderScrollSections = [
  { id: "spotify", label: "Spotify" },
  { id: "meta", label: "Meta" },
]
let uploaderGsap: any = null
let uploaderScrollElement: HTMLElement | null = null
let uploaderScrollFrame = 0
let uploaderTouchStartY = 0
let uploaderTouchStartX = 0
let uploaderTouchStartedInLocalScroll = false

function blankDspProfileDrafts(artistName: string): ArtistDspProfileDraft[] {
  return ARTIST_DSP_PROFILE_PLATFORMS.map((platform) => ({
    platform,
    profileExists: null,
    profileUrl: "",
    displayName: artistName,
    avatarUrl: "",
  }))
}

function buildDspProfileDraftsFromRecords(
  records: ArtistDspProfileRecord[],
  artistName: string,
): ArtistDspProfileDraft[] {
  return ARTIST_DSP_PROFILE_PLATFORMS.map((platform) => {
    const record = records.find((profile) => profile.platform === platform)

    return {
      platform,
      profileExists: record?.profileExists ?? null,
      profileUrl: record?.profileUrl ?? "",
      displayName: record?.displayName ?? artistName,
      avatarUrl: record?.avatarUrl ?? "",
    }
  })
}

function buildDspProfileDrafts(artistId = form.artistId): ArtistDspProfileDraft[] {
  const artistName = selectedArtistNameForId(artistId)
  const artistSettings = settingsData.value?.artists.find((artist) => artist.artistId === artistId)
  return buildDspProfileDraftsFromRecords(artistSettings?.dspProfiles ?? [], artistName)
}

const uploadSteps: Array<{ label: string; value: UploadStep; helper: string }> = [
  { label: "Identity", value: "identity", helper: "Artist, title, and date" },
  { label: "Cover", value: "cover", helper: "Release artwork" },
  { label: "Audio", value: "audio", helper: "Track files" },
  { label: "Credits", value: "credits", helper: "Roles, lyrics, and flags" },
  { label: "DSPs", value: "stores", helper: "Delivery stores" },
  { label: "Submit", value: "submit", helper: "Final review" },
]

const uploadStepOrder = uploadSteps.map((step) => step.value)

const deliveryChecklist = computed(() => [
  {
    label: "Metadata",
    complete: Boolean(form.artistId && form.title.trim() && form.genre && form.releaseDate),
    detail: form.title.trim() || "Release title pending",
  },
  {
    label: "Cover",
    complete: isCoverUploaded.value,
    detail: coverChecklistDetail.value,
  },
  {
    label: "Audio",
    complete: readyTrackCount.value > 0 && readyTrackCount.value === tracks.value.length,
    detail: `${readyTrackCount.value}/${tracks.value.length} tracks uploaded`,
  },
  {
    label: "Credits",
    complete: trackDetailsComplete.value,
    detail: `${savedTrackDetailCount.value}/${tracks.value.length} saved`,
  },
  {
    label: "Stores",
    complete: selectedStores.value.length > 0,
    detail: `${selectedStores.value.length} selected`,
  },
])

const completedChecklistCount = computed(() => deliveryChecklist.value.filter((item) => item.complete).length)
const completionPercent = computed(() => Math.round((completedChecklistCount.value / deliveryChecklist.value.length) * 100))
const isCoverUploading = computed(() => coverUploadState.value === "uploading")
const isCoverUploaded = computed(() => coverUploadState.value === "done" && Boolean(coverUploadedUrl.value))
const coverChecklistDetail = computed(() => {
  if (isCoverUploading.value) {
    return `${coverUploadProgress.value}% uploaded`
  }

  if (isCoverUploaded.value && coverFile.value) {
    return `Uploaded / ${formatFileSize(coverFile.value.size)}`
  }

  if (coverUploadState.value === "error") {
    return "Upload failed"
  }

  return coverFile.value ? "Waiting to upload" : "No cover selected"
})
const readyTrackCount = computed(() => tracks.value.filter((track) => track.title.trim() && hasTrackAudioSource(track)).length)
const uploadingTrackCount = computed(() => tracks.value.filter((track) => track.uploadState === "uploading").length)
const isUploadingAssets = computed(() => isCoverUploading.value || uploadingTrackCount.value > 0)
const totalAudioPayloadLabel = computed(() => `${readyTrackCount.value} uploaded source${readyTrackCount.value === 1 ? "" : "s"}`)
const previewableTracks = computed(() => tracks.value.filter((track) => trackHasPreviewAudio(track)))
const activePreviewTrack = computed(() => {
  return tracks.value.find((track) => track.id === activePreviewTrackId.value)
    ?? previewableTracks.value[0]
    ?? null
})
const activePreviewTrackIndex = computed(() => {
  if (!activePreviewTrack.value) {
    return -1
  }

  return previewableTracks.value.findIndex((track) => track.id === activePreviewTrack.value?.id)
})
const activePreviewSource = computed(() => activePreviewTrack.value ? trackPreviewSource(activePreviewTrack.value) : "")
const spotifyPreviewReady = computed(() => Boolean(activePreviewTrack.value && activePreviewSource.value))
const spotifyPreviewTitle = computed(() => activePreviewTrack.value ? trackDisplayTitle(activePreviewTrack.value) : "Uploaded audio")
const spotifyPreviewArtists = computed(() => activePreviewTrack.value ? mainArtistNamesForTrack(activePreviewTrack.value).join(", ") : selectedArtistName() || "Artist profile")
const spotifyPreviewCover = computed(() => coverPreviewUrl.value || coverUploadedUrl.value)
const previewProgressPercent = computed(() => {
  if (!previewDuration.value) {
    return 0
  }

  return Math.min(100, Math.max(0, (previewCurrentTime.value / previewDuration.value) * 100))
})
const previewVolumePercent = computed(() => Math.round(previewVolume.value * 100))
const metaPreviewTrack = computed(() => activePreviewTrack.value ?? tracks.value[0] ?? null)
const metaPreviewTitle = computed(() => metaPreviewTrack.value ? trackDisplayTitle(metaPreviewTrack.value) : form.title.trim() || "Add track name")
const metaPreviewArtists = computed(() => metaPreviewTrack.value ? mainArtistNamesForTrack(metaPreviewTrack.value).join(", ") : selectedArtistName() || "Artist profile")
const metaPreviewCover = computed(() => spotifyPreviewCover.value)
const metaPreviewDuration = computed(() => Math.max(META_CLIP_SECONDS, Math.ceil(previewDuration.value || 45)))
const metaClipStartMax = computed(() => Math.max(0, metaPreviewDuration.value - META_CLIP_SECONDS))
const metaClipWindowWidth = computed(() => Math.min(52, Math.max(42, (META_CLIP_SECONDS / metaPreviewDuration.value) * 100)))
const metaClipEndTime = computed(() => Math.min(metaPreviewDuration.value, metaClipStart.value + META_CLIP_SECONDS))
const metaPreviewTimeInputId = "meta-preview-time"
const metaClipPlaybackPercent = computed(() => {
  if (!spotifyPreviewReady.value) {
    return 0
  }

  const elapsed = previewCurrentTime.value - metaClipStart.value
  return Math.min(100, Math.max(0, (elapsed / META_CLIP_SECONDS) * 100))
})
const metaClipScrubValue = computed(() => Math.max(0, metaClipStartMax.value - metaClipStart.value))
const metaWaveformBars = computed(() => Array.from({ length: 76 }, (_, index) => {
  const seed = ((index * 19) + 37) % 29
  return 18 + ((seed * 7) % 48)
}))
let metaWaveformResizeObserver: ResizeObserver | null = null
let metaWaveformAnimationFrame = 0
let metaWaveformPlaybackFrame = 0
let metaWaveformVisualClipStart = 0
let metaWaveformVisualPlaybackPercent = 0
let metaWaveformPointerId: number | null = null
let metaWaveformPointerStartX = 0
let metaWaveformPointerStartClip = 0
let metaWaveformPointerMoved = false
const isAllStoresSelected = computed(() => selectedStores.value.length === RELEASE_STORE_OPTIONS.length)
const submitLabel = computed(() => {
  if (isSubmitting.value) {
    return "Submitting package..."
  }

  return isAllStoresSelected.value ? "Distribute to all stores" : "Distribute to selected stores"
})
const selectedStoreSummary = computed(() => {
  if (isAllStoresSelected.value) {
    return "All stores selected"
  }

  return `${selectedStores.value.length} stores selected`
})
const releaseTypeDisplay = computed(() => releaseTypeOptions.find((option) => option.value === form.type)?.label ?? "Single")
const releaseYearDisplay = computed(() => {
  if (!form.releaseDate) {
    return new Date().getFullYear()
  }

  const parsedDate = new Date(`${form.releaseDate}T00:00:00`)
  return Number.isNaN(parsedDate.getTime()) ? new Date().getFullYear() : parsedDate.getFullYear()
})
const trackCountDisplay = computed(() => `${tracks.value.length} song${tracks.value.length === 1 ? "" : "s"}`)
const spotifyReleaseMeta = computed(() => [
  selectedArtistName() || "Artist profile",
  String(releaseYearDisplay.value),
  trackCountDisplay.value,
  totalAudioPayloadLabel.value,
].join(" / "))
const minimumReleaseDate = computed(() => calendarToday(releaseDateTimeZone))
const recommendedReleaseDate = computed(() => minimumReleaseDate.value.add({ days: 10 }))
const releaseDateHighlights = computed(() => {
  const highlights: Array<{ date: string; tone: ReleaseDateHighlightTone }> = []

  for (let dayOffset = 0; dayOffset <= 540; dayOffset += 1) {
    const tone: ReleaseDateHighlightTone = dayOffset < 10
      ? "emergency"
      : dayOffset < 21
        ? "perfect"
        : "playlist"

    highlights.push({
      date: formatReleaseDateValue(minimumReleaseDate.value.add({ days: dayOffset })),
      tone,
    })
  }

  return highlights
})
const selectedReleaseDate = computed(() => parseReleaseDateValue(form.releaseDate))
const releaseDateDisplay = computed(() => {
  return selectedReleaseDate.value ? formatReleaseDateLabel(selectedReleaseDate.value) : "Pick date"
})
const releaseIdentityComplete = computed(() => Boolean(form.artistId && form.title.trim() && form.genre && form.releaseDate))
const audioComplete = computed(() => readyTrackCount.value > 0 && readyTrackCount.value === tracks.value.length)
const trackDetailsComplete = computed(() => tracks.value.every((track, trackIndex) => !validateTrackDetails(track, trackIndex, true)))
const savedTrackDetailCount = computed(() => tracks.value.filter((track, trackIndex) => !validateTrackDetails(track, trackIndex, true)).length)
const currentStepIndex = computed(() => Math.max(0, uploadStepOrder.indexOf(activeUploadStep.value)))
const currentStepLabel = computed(() => uploadSteps[currentStepIndex.value]?.label ?? "Upload")
const activeUploaderSection = computed(() => uploaderScrollSections[activeUploaderSectionIndex.value] ?? uploaderScrollSections[0])
const showSpotifyPreviewPlayer = computed(() =>
  spotifyPreviewReady.value
  && isPreviewPlaying.value
  && previewPlaybackSurface.value === "release"
  && activeUploaderSection.value?.id === "spotify"
)
const uploaderTargetSectionIndex = computed(() => {
  if (activeUploaderSectionIndex.value >= uploaderScrollSections.length - 1) {
    return 0
  }

  return activeUploaderSectionIndex.value + 1
})
const uploaderScrollButtonLabel = computed(() => {
  const target = uploaderScrollSections[uploaderTargetSectionIndex.value]

  if (!target) {
    return "Move through uploader sections"
  }

  return `Scroll to ${target.label}`
})

function uploadStepComplete(step: UploadStep) {
  if (step === "identity") {
    return releaseIdentityComplete.value
  }

  if (step === "cover") {
    return isCoverUploaded.value
  }

  if (step === "audio") {
    return audioComplete.value
  }

  if (step === "credits") {
    return trackDetailsComplete.value
  }

  if (step === "stores") {
    return selectedStores.value.length > 0
  }

  return completionPercent.value === 100
}

function goToUploadStep(step: UploadStep) {
  const targetStepIndex = uploadStepOrder.indexOf(step)

  if (targetStepIndex <= currentStepIndex.value) {
    activeUploadStep.value = step
    return
  }

  const blocked = firstBlockedStepBefore(targetStepIndex)
  if (blocked) {
    pageError.value = blocked
    pageSuccess.value = ""
    return
  }

  activeUploadStep.value = step
}

function goToNextUploadStep() {
  const blocked = validateUploadStepForAdvance(activeUploadStep.value)

  if (blocked) {
    pageError.value = blocked
    pageSuccess.value = ""
    return
  }

  activeUploadStep.value = uploadStepOrder[Math.min(currentStepIndex.value + 1, uploadStepOrder.length - 1)] ?? "submit"
}

function goToPreviousUploadStep() {
  activeUploadStep.value = uploadStepOrder[Math.max(currentStepIndex.value - 1, 0)] ?? "identity"
}

function getUploaderSectionElements() {
  const scroller = uploaderScroller.value

  if (!scroller) {
    return []
  }

  return Array.from(scroller.querySelectorAll<HTMLElement>("[data-uploader-section]"))
}

function uploaderSectionMarkerStyle(sectionIndex: number) {
  const denominator = Math.max(uploaderScrollSections.length - 1, 1)

  return {
    "--uploader-marker-position": `${(sectionIndex / denominator) * 100}%`,
  }
}

function syncUploaderScrollState() {
  const scroller = uploaderScroller.value

  if (!scroller) {
    return
  }

  const maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight)
  uploaderScrollProgress.value = Math.min(100, Math.max(0, (scroller.scrollTop / maxScroll) * 100))

  const sections = getUploaderSectionElements()
  if (!sections.length) {
    activeUploaderSectionIndex.value = 0
    return
  }

  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  sections.forEach((section, sectionIndex) => {
    const distance = Math.abs(section.offsetTop - scroller.scrollTop)

    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = sectionIndex
    }
  })

  activeUploaderSectionIndex.value = closestIndex
}

function scheduleUploaderScrollSync() {
  if (typeof window === "undefined" || uploaderScrollFrame) {
    return
  }

  uploaderScrollFrame = window.requestAnimationFrame(() => {
    uploaderScrollFrame = 0
    syncUploaderScrollState()
  })
}

async function loadUploaderGsap() {
  if (uploaderGsap || typeof window === "undefined") {
    return uploaderGsap
  }

  try {
    const module = await import("gsap")
    uploaderGsap = module.gsap
  } catch {
    uploaderGsap = null
  }

  return uploaderGsap
}

async function animateUploaderToSection(targetSectionIndex: number) {
  const scroller = uploaderScroller.value
  const sections = getUploaderSectionElements()

  if (!scroller || !sections.length) {
    return
  }

  const clampedIndex = Math.min(Math.max(targetSectionIndex, 0), sections.length - 1)
  const target = sections[clampedIndex]
  const targetTop = target.offsetTop

  activeUploaderSectionIndex.value = clampedIndex

  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scroller.scrollTo({ top: targetTop, behavior: "auto" })
    syncUploaderScrollState()
    return
  }

  const gsap = await loadUploaderGsap()

  if (!gsap) {
    scroller.scrollTo({ top: targetTop, behavior: "smooth" })
    window.setTimeout(syncUploaderScrollState, 720)
    return
  }

  gsap.killTweensOf(scroller)
  gsap.to(scroller, {
    scrollTop: targetTop,
    duration: 0.86,
    ease: "power3.inOut",
    overwrite: true,
    onUpdate: syncUploaderScrollState,
    onComplete: syncUploaderScrollState,
    onInterrupt: syncUploaderScrollState,
  })
}

function moveToUploaderSection(sectionIndex: number) {
  void animateUploaderToSection(sectionIndex)
}

function moveToAdjacentUploaderSection() {
  void animateUploaderToSection(uploaderTargetSectionIndex.value)
}

function findLocalScrollable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return null
  }

  const root = uploaderScroller.value
  let node: HTMLElement | null = target

  while (node && node !== root) {
    const overflowY = window.getComputedStyle(node).overflowY
    const isScrollable = node.dataset.uploaderLocalScroll !== undefined
      || overflowY === "auto"
      || overflowY === "scroll"

    if (isScrollable && node.scrollHeight > node.clientHeight + 1) {
      return node
    }

    node = node.parentElement
  }

  return null
}

function targetInsideLocalScrollLock(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const root = uploaderScroller.value
  let node: HTMLElement | null = target

  while (node && node !== root) {
    if (node.dataset.uploaderLocalScrollLock !== undefined) {
      return true
    }

    node = node.parentElement
  }

  return false
}

function localScrollableCanMove(scrollable: HTMLElement, direction: number) {
  const canMoveDown = scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1
  const canMoveUp = scrollable.scrollTop > 1

  return (direction > 0 && canMoveDown) || (direction < 0 && canMoveUp)
}

function handleUploaderWheel(event: WheelEvent) {
  if (!uploaderScroller.value || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
    return
  }

  const direction = event.deltaY > 0 ? 1 : -1
  const localScrollable = findLocalScrollable(event.target)

  if (localScrollable && localScrollableCanMove(localScrollable, direction)) {
    return
  }

  if (localScrollable || targetInsideLocalScrollLock(event.target)) {
    event.preventDefault()
    return
  }

  event.preventDefault()

  const nextIndex = activeUploaderSectionIndex.value + direction

  if (nextIndex < 0 || nextIndex >= uploaderScrollSections.length) {
    return
  }

  void animateUploaderToSection(nextIndex)
}

function handleUploaderTouchStart(event: TouchEvent) {
  const touch = event.touches[0]

  if (!touch) {
    return
  }

  uploaderTouchStartY = touch.clientY
  uploaderTouchStartX = touch.clientX
  uploaderTouchStartedInLocalScroll = Boolean(findLocalScrollable(event.target)) || targetInsideLocalScrollLock(event.target)
}

function handleUploaderTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]

  if (!touch) {
    return
  }

  const deltaY = uploaderTouchStartY - touch.clientY
  const deltaX = uploaderTouchStartX - touch.clientX

  if (Math.abs(deltaY) < 56 || Math.abs(deltaY) < Math.abs(deltaX) * 1.35) {
    return
  }

  const direction = deltaY > 0 ? 1 : -1

  if (uploaderTouchStartedInLocalScroll) {
    uploaderTouchStartedInLocalScroll = false
    return
  }

  const nextIndex = activeUploaderSectionIndex.value + direction

  if (nextIndex < 0 || nextIndex >= uploaderScrollSections.length) {
    return
  }

  void animateUploaderToSection(nextIndex)
}

async function setupUploaderScrollStage() {
  await nextTick()

  const scroller = uploaderScroller.value

  if (!scroller || uploaderScrollElement === scroller) {
    syncUploaderScrollState()
    return
  }

  destroyUploaderScrollStage()
  uploaderScrollElement = scroller
  scroller.addEventListener("wheel", handleUploaderWheel, { passive: false })
  scroller.addEventListener("scroll", scheduleUploaderScrollSync, { passive: true })
  scroller.addEventListener("touchstart", handleUploaderTouchStart, { passive: true })
  scroller.addEventListener("touchend", handleUploaderTouchEnd, { passive: true })
  window.addEventListener("resize", syncUploaderScrollState, { passive: true })
  syncUploaderScrollState()
}

function destroyUploaderScrollStage() {
  if (uploaderScrollFrame) {
    cancelAnimationFrame(uploaderScrollFrame)
    uploaderScrollFrame = 0
  }

  if (uploaderScrollElement) {
    uploaderScrollElement.removeEventListener("wheel", handleUploaderWheel)
    uploaderScrollElement.removeEventListener("scroll", scheduleUploaderScrollSync)
    uploaderScrollElement.removeEventListener("touchstart", handleUploaderTouchStart)
    uploaderScrollElement.removeEventListener("touchend", handleUploaderTouchEnd)
    uploaderScrollElement = null
  }

  window.removeEventListener("resize", syncUploaderScrollState)

  if (uploaderGsap && uploaderScroller.value) {
    uploaderGsap.killTweensOf(uploaderScroller.value)
  }
}

function syncSingleReleaseTitle(preferExistingReleaseTitle = false) {
  const firstTrack = tracks.value[0]

  if (form.type !== "single" || !firstTrack) {
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
  track.versionLine = String(value ?? "Original")
  markTrackDetailsUnsaved(track)
}

function normalizeArtistName(value: string | number | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ")
}

function artistNamesMatch(firstName: string, secondName: string) {
  return normalizeArtistName(firstName).toLowerCase() === normalizeArtistName(secondName).toLowerCase()
}

function isMainArtistCredit(credit: CreditDraft) {
  return credit.roleCodes.some((roleCode) => roleCode.trim() === "Main Artist")
}

function mainArtistCreditNames(track: UploadTrackDraft) {
  const artistNames: string[] = []

  for (const credit of track.artistCredits) {
    const creditedName = normalizeArtistName(credit.creditedName)

    if (!creditedName || !isMainArtistCredit(credit)) {
      continue
    }

    if (!artistNames.some((artistName) => artistNamesMatch(artistName, creditedName))) {
      artistNames.push(creditedName)
    }
  }

  return artistNames
}

function mainArtistNamesForTrack(track: UploadTrackDraft) {
  const artistNames = mainArtistCreditNames(track)

  if (artistNames.length) {
    return artistNames
  }

  const primaryArtistName = normalizeArtistName(selectedArtistName())
  return primaryArtistName ? [primaryArtistName] : ["Artist profile"]
}

function mainArtistDraftForTrack(track: UploadTrackDraft) {
  return mainArtistDrafts[track.id] ?? ""
}

function setMainArtistDraft(track: UploadTrackDraft, value: string | number | null) {
  mainArtistDrafts[track.id] = String(value ?? "")
}

function hasMainArtistName(track: UploadTrackDraft, artistName: string) {
  return mainArtistCreditNames(track).some((existingArtistName) => artistNamesMatch(existingArtistName, artistName))
}

function ensurePrimaryMainArtistCredit(track: UploadTrackDraft) {
  const primaryArtistName = normalizeArtistName(selectedArtistName())

  if (!primaryArtistName || hasMainArtistName(track, primaryArtistName)) {
    return
  }

  track.artistCredits.unshift(blankCreditDraft(primaryArtistName, ["Main Artist"]))
}

function addMainArtistToTrack(track: UploadTrackDraft, close?: () => void) {
  const creditedName = normalizeArtistName(mainArtistDrafts[track.id])

  if (!creditedName) {
    return
  }

  ensurePrimaryMainArtistCredit(track)

  if (!hasMainArtistName(track, creditedName)) {
    track.artistCredits.push(blankCreditDraft(creditedName, ["Main Artist"]))
    markTrackArtistCreditsOverridden(track)
    markTrackDetailsUnsaved(track)
  }

  mainArtistDrafts[track.id] = ""
  close?.()
}

function canRemoveMainArtist(track: UploadTrackDraft, artistName: string) {
  const creditedName = normalizeArtistName(artistName)
  const primaryArtistName = normalizeArtistName(selectedArtistName())

  if (!creditedName || creditedName === "Artist profile") {
    return false
  }

  if (primaryArtistName && artistNamesMatch(creditedName, primaryArtistName)) {
    return false
  }

  return mainArtistCreditNames(track).length > 1 || Boolean(primaryArtistName)
}

function removeMainArtistFromTrack(track: UploadTrackDraft, artistName: string) {
  if (!canRemoveMainArtist(track, artistName)) {
    return
  }

  const creditedName = normalizeArtistName(artistName)
  const creditIndex = track.artistCredits.findIndex((credit) =>
    isMainArtistCredit(credit) && artistNamesMatch(credit.creditedName, creditedName),
  )

  if (creditIndex === -1) {
    return
  }

  track.artistCredits.splice(creditIndex, 1)

  if (!mainArtistCreditNames(track).length) {
    ensurePrimaryMainArtistCredit(track)
  }

  markTrackArtistCreditsOverridden(track)
  markTrackDetailsUnsaved(track)
}

function firstBlockedStepBefore(targetStepIndex: number) {
  for (let stepIndex = 0; stepIndex < targetStepIndex; stepIndex += 1) {
    const blocked = validateUploadStepForAdvance(uploadStepOrder[stepIndex])

    if (blocked) {
      activeUploadStep.value = uploadStepOrder[stepIndex]
      return blocked
    }
  }

  return ""
}

function validateUploadStepForAdvance(step: UploadStep) {
  if (step === "identity") {
    if (!form.artistId) return "No artist profile is available for this upload."
    if (!form.title.trim()) return "Release title is required before continuing."
    if (!form.releaseDate) return "Release date is required before continuing."
    if (!form.genre) return "Genre is required before continuing."
    return ""
  }

  if (step === "cover") {
    if (coverUploadState.value === "uploading") return "Wait for the cover art upload to finish."
    if (!isCoverUploaded.value) {
      return coverUploadState.value === "error"
        ? "Cover art upload failed. Upload it again before continuing."
        : "Upload cover art before continuing."
    }
    return ""
  }

  if (step === "audio") {
    return validateAudioSourcesReady()
  }

  if (step === "credits") {
    return validateTrackDetailsReady()
  }

  if (step === "stores" && !selectedStores.value.length) {
    return "Select at least one store before review."
  }

  return ""
}

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
    dspProfileDrafts.value = buildDspProfileDrafts(value)
    dspProfileMessage.value = ""

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
    dspProfileDrafts.value = buildDspProfileDrafts()
  },
)

watch(
  settingsData,
  () => {
    if (!isSavingDspProfiles.value) {
      dspProfileDrafts.value = buildDspProfileDrafts()
    }
  },
  { immediate: true },
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

watch(
  activePreviewSource,
  async () => {
    previewCurrentTime.value = 0
    previewDuration.value = 0
    isPreviewPlaying.value = false
    await nextTick()

    if (spotifyPreviewAudio.value) {
      spotifyPreviewAudio.value.volume = previewVolume.value
      spotifyPreviewAudio.value.load()
    }
  },
)

watch(
  previewVolume,
  (volume) => {
    if (spotifyPreviewAudio.value) {
      spotifyPreviewAudio.value.volume = volume
    }
  },
)

watch(
  () => previewableTracks.value.map((track) => track.id).join(","),
  () => {
    if (!activePreviewTrackId.value) {
      return
    }

    if (!previewableTracks.value.some((track) => track.id === activePreviewTrackId.value)) {
      pauseActivePreview()
      activePreviewTrackId.value = previewableTracks.value[0]?.id ?? ""
      previewPlaybackRequested.value = false
    }
  },
)

watch(
  metaClipStartMax,
  (maxStart) => {
    if (metaClipStart.value > maxStart) {
      metaClipStart.value = maxStart
    }
  },
)

watch(
  [metaClipStart, () => metaPreviewTrack.value?.id],
  () => {
    if (!isMetaPreviewTimeFocused.value) {
      syncMetaPreviewTimeInput()
    }
  },
  { immediate: true },
)

watch(
  [
    metaClipStart,
    metaClipStartMax,
    metaClipPlaybackPercent,
    metaClipWindowWidth,
    metaPreviewDuration,
    activePreviewTrackId,
    () => metaWaveformBars.value.join(","),
  ],
  scheduleMetaWaveformDraw,
  { flush: "post" },
)

watch(
  [isPreviewPlaying, previewPlaybackSurface],
  () => {
    if (isPreviewPlaying.value && previewPlaybackSurface.value === "meta") {
      startMetaWaveformPlaybackLoop()
      return
    }

    stopMetaWaveformPlaybackLoop()
  },
  { flush: "post" },
)

watch(
  activePreviewSource,
  () => {
    resetMetaWaveformVisuals()
  },
  { flush: "post" },
)

onMounted(() => {
  void setupUploaderScrollStage()

  nextTick(() => {
    const canvas = metaWaveformCanvas.value
    const editor = canvas?.parentElement

    if (editor && typeof ResizeObserver !== "undefined") {
      metaWaveformResizeObserver = new ResizeObserver(scheduleMetaWaveformDraw)
      metaWaveformResizeObserver.observe(editor)
    }

    window.addEventListener("resize", scheduleMetaWaveformDraw, { passive: true })
    scheduleMetaWaveformDraw()
  })
})

onBeforeUnmount(() => {
  destroyUploaderScrollStage()
  abortCoverUpload()
  tracks.value.forEach((track) => abortTrackUpload(track))

  if (metaWaveformAnimationFrame) {
    cancelAnimationFrame(metaWaveformAnimationFrame)
    metaWaveformAnimationFrame = 0
  }

  if (metaWaveformPlaybackFrame) {
    cancelAnimationFrame(metaWaveformPlaybackFrame)
    metaWaveformPlaybackFrame = 0
  }

  metaWaveformResizeObserver?.disconnect()
  metaWaveformResizeObserver = null
  window.removeEventListener("resize", scheduleMetaWaveformDraw)

  if (coverPreviewUrl.value) {
    URL.revokeObjectURL(coverPreviewUrl.value)
  }

  Object.keys(audioPreviewUrls).forEach(revokeTrackPreviewUrl)
})

function scheduleMetaWaveformDraw() {
  if (typeof window === "undefined") {
    return
  }

  if (metaWaveformPlaybackFrame) {
    return
  }

  if (metaWaveformAnimationFrame) {
    return
  }

  metaWaveformAnimationFrame = requestAnimationFrame(() => {
    metaWaveformAnimationFrame = 0
    const shouldContinue = drawMetaWaveform()

    if (shouldContinue) {
      scheduleMetaWaveformDraw()
    }
  })
}

function startMetaWaveformPlaybackLoop() {
  if (typeof window === "undefined" || metaWaveformPlaybackFrame) {
    return
  }

  const runFrame = () => {
    metaWaveformPlaybackFrame = 0

    if (!isPreviewPlaying.value || previewPlaybackSurface.value !== "meta") {
      scheduleMetaWaveformDraw()
      return
    }

    const audio = spotifyPreviewAudio.value

    if (audio && Number.isFinite(audio.currentTime) && audio.currentTime >= metaClipEndTime.value) {
      audio.pause()
      audio.currentTime = metaClipStart.value
      previewCurrentTime.value = metaClipStart.value
      isPreviewPlaying.value = false
      previewPlaybackRequested.value = false
      resetMetaWaveformVisuals()
      return
    }

    drawMetaWaveform()
    metaWaveformPlaybackFrame = requestAnimationFrame(runFrame)
  }

  metaWaveformPlaybackFrame = requestAnimationFrame(runFrame)
}

function stopMetaWaveformPlaybackLoop() {
  if (metaWaveformPlaybackFrame) {
    cancelAnimationFrame(metaWaveformPlaybackFrame)
    metaWaveformPlaybackFrame = 0
  }

  scheduleMetaWaveformDraw()
}

function resetMetaWaveformVisuals() {
  metaWaveformVisualClipStart = metaClipStart.value
  metaWaveformVisualPlaybackPercent = getMetaPlaybackTargetPercent()
  scheduleMetaWaveformDraw()
}

function getMetaPlaybackTargetPercent() {
  if (!spotifyPreviewReady.value) {
    return 0
  }

  const audioTime = spotifyPreviewAudio.value && previewPlaybackSurface.value === "meta"
    ? spotifyPreviewAudio.value.currentTime
    : previewCurrentTime.value
  const elapsed = (Number.isFinite(audioTime) ? audioTime : previewCurrentTime.value) - metaClipStart.value

  return Math.min(100, Math.max(0, (elapsed / META_CLIP_SECONDS) * 100))
}

function easeMetaWaveformVisuals() {
  const targetClipStart = metaClipStart.value
  const targetPlaybackPercent = getMetaPlaybackTargetPercent()
  const clipDifference = targetClipStart - metaWaveformVisualClipStart
  const playbackDifference = targetPlaybackPercent - metaWaveformVisualPlaybackPercent

  metaWaveformVisualClipStart += clipDifference * 0.28
  metaWaveformVisualPlaybackPercent += playbackDifference * 0.32

  if (Math.abs(clipDifference) < 0.008) {
    metaWaveformVisualClipStart = targetClipStart
  }

  if (Math.abs(playbackDifference) < 0.12) {
    metaWaveformVisualPlaybackPercent = targetPlaybackPercent
  }

  return Math.abs(targetClipStart - metaWaveformVisualClipStart) > 0.008
    || Math.abs(targetPlaybackPercent - metaWaveformVisualPlaybackPercent) > 0.12
}

function drawMetaWaveform() {
  const canvas = metaWaveformCanvas.value
  const context = canvas?.getContext("2d")

  if (!canvas || !context || typeof window === "undefined") {
    return
  }

  const rect = canvas.getBoundingClientRect()

  if (!rect.width || !rect.height) {
    return
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const canvasWidth = Math.round(rect.width * pixelRatio)
  const canvasHeight = Math.round(rect.height * pixelRatio)

  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth
    canvas.height = canvasHeight
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, rect.width, rect.height)

  const shouldContinue = easeMetaWaveformVisuals()
  const width = rect.width
  const height = rect.height
  const frameWidth = Math.min(width - 24, Math.max(132, width * (metaClipWindowWidth.value / 100)))
  const frameHeight = Math.min(58, height - 8)
  const frameX = (width - frameWidth) / 2
  const frameY = (height - frameHeight) / 2
  const frameRadius = 10
  const frameBorder = 3
  const wavePadding = 12
  const waveX = frameX + frameBorder + wavePadding
  const waveWidth = frameWidth - ((frameBorder + wavePadding) * 2)
  const pixelsPerSecond = waveWidth / META_CLIP_SECONDS
  const waveformOriginX = waveX - (metaWaveformVisualClipStart * pixelsPerSecond)
  const waveformCenterY = frameY + (frameHeight / 2)
  const waveformMaxHeight = frameHeight - 20
  const activeWidth = (frameWidth - (frameBorder * 2)) * (metaWaveformVisualPlaybackPercent / 100)

  drawMetaWaveformBars(context, {
    width,
    originX: waveformOriginX,
    centerY: waveformCenterY,
    maxHeight: waveformMaxHeight,
    pixelsPerSecond,
    color: "rgba(214, 218, 224, 0.48)",
  })

  const frameGradient = context.createLinearGradient(frameX, frameY, frameX + frameWidth, frameY + frameHeight)
  frameGradient.addColorStop(0, "#ffd23f")
  frameGradient.addColorStop(0.48, "#ff0a6f")
  frameGradient.addColorStop(1, "#7a35ff")

  context.save()
  context.shadowColor = "rgba(0, 0, 0, 0.28)"
  context.shadowBlur = 20
  context.shadowOffsetY = 8
  drawRoundedRect(context, frameX, frameY, frameWidth, frameHeight, frameRadius)
  context.fillStyle = frameGradient
  context.fill()
  context.restore()

  const frameInnerX = frameX + frameBorder
  const frameInnerY = frameY + frameBorder
  const frameInnerWidth = frameWidth - (frameBorder * 2)
  const frameInnerHeight = frameHeight - (frameBorder * 2)
  const frameInnerRadius = Math.max(0, frameRadius - frameBorder)

  drawRoundedRect(context, frameInnerX, frameInnerY, frameInnerWidth, frameInnerHeight, frameInnerRadius)
  context.fillStyle = "#f8f9fb"
  context.fill()

  if (activeWidth > 0) {
    const activeGradient = context.createLinearGradient(frameInnerX, frameInnerY, frameInnerX + frameInnerWidth, frameInnerY)
    activeGradient.addColorStop(0, "#ffd23f")
    activeGradient.addColorStop(0.32, "#ff9a00")
    activeGradient.addColorStop(0.66, "#ff0a6f")
    activeGradient.addColorStop(1, "#7a35ff")

    context.save()
    drawRoundedRect(context, frameInnerX, frameInnerY, frameInnerWidth, frameInnerHeight, frameInnerRadius)
    context.clip()
    context.fillStyle = activeGradient
    context.fillRect(frameInnerX, frameInnerY, activeWidth, frameInnerHeight)
    context.restore()
  }

  context.save()
  drawRoundedRect(context, frameInnerX, frameInnerY, frameInnerWidth, frameInnerHeight, frameInnerRadius)
  context.clip()
  drawMetaWaveformBars(context, {
    width,
    originX: waveformOriginX,
    centerY: waveformCenterY,
    maxHeight: waveformMaxHeight,
    pixelsPerSecond,
    color: "#d7d9dd",
  })
  context.restore()

  if (activeWidth > 0) {
    context.save()
    drawRoundedRect(context, frameInnerX, frameInnerY, frameInnerWidth, frameInnerHeight, frameInnerRadius)
    context.clip()
    context.beginPath()
    context.rect(frameInnerX, frameInnerY, activeWidth, frameInnerHeight)
    context.clip()
    drawMetaWaveformBars(context, {
      width,
      originX: waveformOriginX,
      centerY: waveformCenterY,
      maxHeight: waveformMaxHeight,
      pixelsPerSecond,
      color: "rgba(255, 249, 222, 0.95)",
    })
    context.restore()
  }

  return shouldContinue
}

function drawMetaWaveformBars(
  context: CanvasRenderingContext2D,
  options: {
    width: number
    originX: number
    centerY: number
    maxHeight: number
    pixelsPerSecond: number
    color: string
  },
) {
  const barValues = metaWaveformBars.value
  const duration = metaPreviewDuration.value
  const stepSeconds = 0.86
  const barWidth = Math.max(3, Math.min(5, options.pixelsPerSecond * 0.48))
  const barCount = Math.ceil(duration / stepSeconds)

  context.fillStyle = options.color

  for (let index = 0; index <= barCount; index += 1) {
    const time = index === barCount ? duration : index * stepSeconds
    const x = options.originX + (time * options.pixelsPerSecond)

    if (x + barWidth < -20 || x > options.width + 20) {
      continue
    }

    const heightPercent = barValues[index % barValues.length] ?? 42
    const barHeight = Math.max(12, (heightPercent / 100) * options.maxHeight)
    drawRoundedRect(context, x, options.centerY - (barHeight / 2), barWidth, barHeight, barWidth / 2)
    context.fill()
  }
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const cornerRadius = Math.min(radius, width / 2, height / 2)

  context.beginPath()
  context.moveTo(x + cornerRadius, y)
  context.lineTo(x + width - cornerRadius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + cornerRadius)
  context.lineTo(x + width, y + height - cornerRadius)
  context.quadraticCurveTo(x + width, y + height, x + width - cornerRadius, y + height)
  context.lineTo(x + cornerRadius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - cornerRadius)
  context.lineTo(x, y + cornerRadius)
  context.quadraticCurveTo(x, y, x + cornerRadius, y)
  context.closePath()
}

function defaultReleaseDate() {
  return formatReleaseDateValue(calendarToday(releaseDateTimeZone).add({ days: 10 }))
}

function parseReleaseDateValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined
  }

  try {
    return parseDate(normalized)
  } catch {
    return undefined
  }
}

function formatReleaseDateValue(value: DateValue) {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`
}

function formatReleaseDateLabel(value: DateValue) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(value.year, value.month - 1, value.day)))
}

function setReleaseDate(value: DateValue, close?: () => void) {
  const safeDate = value.compare(minimumReleaseDate.value) < 0 ? minimumReleaseDate.value : value
  form.releaseDate = formatReleaseDateValue(safeDate)
  close?.()
}

function handleReleaseDateSelect(value: DateValue | undefined, close?: () => void) {
  if (!value) {
    return
  }

  setReleaseDate(value, close)
}

function selectedArtistName() {
  return selectedArtistNameForId(form.artistId)
    || activeArtist.value?.name
    || ""
}

function selectedArtistNameForId(artistId: string | null | undefined) {
  return viewer.value.artistMemberships.find((artist) => artist.id === artistId)?.name || ""
}

function blankCreditDraft(creditedName = "", roleCodes: string[] = []): CreditDraft {
  return {
    creditedName,
    roleCodes,
  }
}

function cloneCreditDraft(credit: CreditDraft) {
  return blankCreditDraft(credit.creditedName, [...credit.roleCodes])
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

function markTrackArtistCreditsOverridden(track: UploadTrackDraft) {
  track.artistCreditsOverridden = true
}

function markTrackDetailsUnsaved(track: UploadTrackDraft) {
  track.detailsSaved = false
}

async function resetTrackArtistCredits(track: UploadTrackDraft) {
  const confirmed = await confirmAction({
    title: "Reset artist credits",
    description: `Replace the custom artist credits on ${track.title.trim() || "this track"} with the primary artist credit?`,
    confirmLabel: "Reset credits",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  track.artistCredits = primaryArtistCreditsForSync().map(cloneCreditDraft)
  track.artistCreditsOverridden = false
  markTrackDetailsUnsaved(track)
}

function createTrackDraft(): UploadTrackDraft {
  nextTrackId.value += 1

  return {
    id: `upload-track-${nextTrackId.value}`,
    title: "",
    isrc: "",
    tiktokPreviewTime: "",
    versionLine: "Original",
    containsAiGeneratedElements: false,
    audioFile: null,
    audioInputVersion: 0,
    audioUploadProgress: 0,
    audioUploadedUrl: "",
    audioUploadXhr: null,
    audioUploadRequestId: 0,
    uploadState: "idle",
    error: "",
    detailOpen: false,
    detailTab: "general",
    detailsSaved: false,
    participantSection: "artist",
    artistCreditsOverridden: false,
    artistCredits: primaryArtistCreditsForSync().map(cloneCreditDraft),
    writerCredits: [blankCreditDraft("", ["Songwriter"])],
    additionalCredits: [blankCreditDraft()],
    lyrics: "",
  }
}

function resetMessages() {
  pageError.value = ""
  pageSuccess.value = ""
  submittedReleaseId.value = ""
}

async function confirmUploadRemoval(title: string, description: string, confirmLabel: string) {
  return await confirmAction({
    title,
    description,
    confirmLabel,
    variant: "destructive",
  })
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

function filenameWithoutExtension(filename: string) {
  return filename.trim().replace(/\.[^.]+$/, "")
}

function trackDisplayTitle(track: UploadTrackDraft) {
  return track.title.trim()
    || (track.audioFile ? filenameWithoutExtension(track.audioFile.name) : "")
    || "Untitled track"
}

function trackPreviewSource(track: UploadTrackDraft) {
  if (track.audioFile && !audioPreviewUrls[track.id]) {
    audioPreviewUrls[track.id] = URL.createObjectURL(track.audioFile)
  }

  return audioPreviewUrls[track.id] || track.audioUploadedUrl || ""
}

function trackHasPreviewAudio(track: UploadTrackDraft) {
  return Boolean(trackPreviewSource(track))
}

function audioPreviewLabel(track: UploadTrackDraft) {
  if (track.uploadState === "uploading") {
    return `${track.audioUploadProgress}% uploaded`
  }

  if (track.uploadState === "done") {
    return track.audioFile ? `${track.audioFile.name} / ready` : "Ready to preview"
  }

  return track.audioFile ? track.audioFile.name : "Audio selected"
}

function isTrackPreviewActive(track: UploadTrackDraft) {
  return activePreviewTrack.value?.id === track.id
}

function isTrackPreviewPlaying(track: UploadTrackDraft) {
  return isTrackPreviewActive(track) && isPreviewPlaying.value
}

function revokeTrackPreviewUrl(trackId: string) {
  const previewUrl = audioPreviewUrls[trackId]

  if (!previewUrl) {
    return
  }

  URL.revokeObjectURL(previewUrl)
  delete audioPreviewUrls[trackId]
}

function setTrackPreviewFile(track: UploadTrackDraft, file: File) {
  if (isTrackPreviewActive(track)) {
    pauseActivePreview()
  }

  revokeTrackPreviewUrl(track.id)
  audioPreviewUrls[track.id] = URL.createObjectURL(file)
  activePreviewTrackId.value = track.id
  previewPlaybackRequested.value = false
  previewCurrentTime.value = 0
  previewDuration.value = 0
}

function clearTrackPreview(track: UploadTrackDraft) {
  if (isTrackPreviewActive(track)) {
    pauseActivePreview()
    activePreviewTrackId.value = previewableTracks.value.find((previewTrack) => previewTrack.id !== track.id)?.id ?? ""
  }

  revokeTrackPreviewUrl(track.id)
  previewPlaybackRequested.value = false
}

async function toggleReleasePreview() {
  const track = activePreviewTrack.value ?? previewableTracks.value[0]

  if (!track) {
    return
  }

  previewPlaybackSurface.value = "release"
  await toggleTrackPreview(track)
}

async function toggleTrackPreview(track: UploadTrackDraft) {
  const source = trackPreviewSource(track)

  if (!source) {
    return
  }

  previewPlaybackSurface.value = "release"

  if (!isTrackPreviewActive(track)) {
    activePreviewTrackId.value = track.id
    previewPlaybackRequested.value = true
    await nextTick()

    if (spotifyPreviewAudio.value) {
      spotifyPreviewAudio.value.load()
    }

    await playActivePreview()
    return
  }

  if (isPreviewPlaying.value) {
    pauseActivePreview()
    previewPlaybackRequested.value = false
    return
  }

  previewPlaybackRequested.value = true
  await playActivePreview()
}

async function playActivePreview() {
  const audio = spotifyPreviewAudio.value

  if (!audio || !activePreviewSource.value) {
    return
  }

  try {
    audio.volume = previewVolume.value
    await audio.play()
    isPreviewPlaying.value = true
    previewPlaybackRequested.value = true
  } catch {
    isPreviewPlaying.value = false
    previewPlaybackRequested.value = false
  }
}

function pauseActivePreview() {
  spotifyPreviewAudio.value?.pause()
  isPreviewPlaying.value = false
}

async function playPreviousPreviewTrack() {
  if (previewableTracks.value.length < 2) {
    return
  }

  previewPlaybackSurface.value = "release"
  const activeIndex = activePreviewTrackIndex.value <= 0
    ? previewableTracks.value.length - 1
    : activePreviewTrackIndex.value - 1
  activePreviewTrackId.value = previewableTracks.value[activeIndex]?.id ?? ""
  previewPlaybackRequested.value = true
  await nextTick()

  if (spotifyPreviewAudio.value) {
    spotifyPreviewAudio.value.load()
  }

  await playActivePreview()
}

async function playNextPreviewTrack() {
  if (previewableTracks.value.length < 2) {
    return
  }

  previewPlaybackSurface.value = "release"
  const activeIndex = activePreviewTrackIndex.value === -1 || activePreviewTrackIndex.value >= previewableTracks.value.length - 1
    ? 0
    : activePreviewTrackIndex.value + 1
  activePreviewTrackId.value = previewableTracks.value[activeIndex]?.id ?? ""
  previewPlaybackRequested.value = true
  await nextTick()

  if (spotifyPreviewAudio.value) {
    spotifyPreviewAudio.value.load()
  }

  await playActivePreview()
}

function handlePreviewLoadedMetadata(event: Event) {
  const audio = event.currentTarget as HTMLAudioElement
  previewDuration.value = Number.isFinite(audio.duration) ? audio.duration : 0
}

function handlePreviewTimeUpdate(event: Event) {
  const audio = event.currentTarget as HTMLAudioElement
  previewCurrentTime.value = Number.isFinite(audio.currentTime) ? audio.currentTime : 0

  if (previewPlaybackSurface.value === "meta" && audio.currentTime >= metaClipEndTime.value) {
    audio.pause()
    audio.currentTime = metaClipStart.value
    previewCurrentTime.value = metaClipStart.value
    isPreviewPlaying.value = false
    previewPlaybackRequested.value = false
  }
}

function handlePreviewEnded() {
  isPreviewPlaying.value = false
  previewPlaybackRequested.value = false
  previewCurrentTime.value = 0
}

function handlePreviewAudioError() {
  isPreviewPlaying.value = false
  previewPlaybackRequested.value = false
}

function seekPreview(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const nextTime = Number(input.value)

  if (!Number.isFinite(nextTime)) {
    return
  }

  previewPlaybackSurface.value = "release"
  previewCurrentTime.value = nextTime

  if (spotifyPreviewAudio.value) {
    spotifyPreviewAudio.value.currentTime = nextTime
  }
}

function setPreviewVolume(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const nextVolume = Math.min(1, Math.max(0, Number(input.value) / 100))

  if (!Number.isFinite(nextVolume)) {
    return
  }

  previewVolume.value = nextVolume
}

async function selectMetaPreviewTrack(track: UploadTrackDraft) {
  activePreviewTrackId.value = track.id
  metaClipStart.value = normalizedTiktokPreviewStartSeconds(track) ?? 0
  syncMetaPreviewTimeInput()
  await nextTick()

  if (spotifyPreviewAudio.value) {
    spotifyPreviewAudio.value.load()
  }
}

async function toggleMetaPreview(track = metaPreviewTrack.value) {
  if (!track || !trackHasPreviewAudio(track)) {
    return
  }

  previewPlaybackSurface.value = "meta"

  if (!isTrackPreviewActive(track)) {
    activePreviewTrackId.value = track.id
    await nextTick()

    if (spotifyPreviewAudio.value) {
      spotifyPreviewAudio.value.load()
    }
  }

  if (isPreviewPlaying.value) {
    pauseActivePreview()
    previewPlaybackRequested.value = false
    return
  }

  if (spotifyPreviewAudio.value) {
    spotifyPreviewAudio.value.currentTime = Math.min(metaClipStart.value, metaClipStartMax.value)
  }

  await playActivePreview()
}

async function replayMetaPreviewFromClipStart() {
  const track = metaPreviewTrack.value

  if (!track || !trackHasPreviewAudio(track)) {
    return
  }

  previewPlaybackSurface.value = "meta"

  if (!isTrackPreviewActive(track)) {
    activePreviewTrackId.value = track.id
    await nextTick()

    if (spotifyPreviewAudio.value) {
      spotifyPreviewAudio.value.load()
    }
  }

  if (spotifyPreviewAudio.value) {
    spotifyPreviewAudio.value.currentTime = Math.min(metaClipStart.value, metaClipStartMax.value)
  }

  await playActivePreview()
}

function setMetaStickerStyle(style: "card" | "minimal") {
  metaStickerStyle.value = style
}

function syncMetaPreviewTimeInput() {
  metaPreviewTimeInput.value = formatPlaybackTime(metaClipStart.value)
}

function setMetaPreviewTimeInput(value: string | number | null) {
  metaPreviewTimeInput.value = String(value ?? "")
  const seconds = parseTiktokPreviewSeconds(metaPreviewTimeInput.value)

  if (Number.isInteger(seconds)) {
    applyMetaClipStart(Number(seconds), { updateInput: false })
  }
}

function handleMetaPreviewTimeFocus() {
  isMetaPreviewTimeFocused.value = true
}

function handleMetaPreviewTimeBlur() {
  isMetaPreviewTimeFocused.value = false
  const seconds = parseTiktokPreviewSeconds(metaPreviewTimeInput.value)

  if (Number.isInteger(seconds)) {
    applyMetaClipStart(Number(seconds))
    return
  }

  syncMetaPreviewTimeInput()
}

function applyMetaClipStart(nextStart: number, options: { updateInput?: boolean } = {}) {
  if (!Number.isFinite(nextStart)) {
    return
  }

  const clampedStart = Math.min(metaClipStartMax.value, Math.max(0, nextStart))
  previewPlaybackSurface.value = "meta"
  metaClipStart.value = clampedStart
  previewCurrentTime.value = clampedStart

  if (spotifyPreviewAudio.value && activePreviewSource.value) {
    spotifyPreviewAudio.value.currentTime = clampedStart
  }

  if (metaPreviewTrack.value) {
    metaPreviewTrack.value.tiktokPreviewTime = formatPlaybackTime(clampedStart)
    markTrackDetailsUnsaved(metaPreviewTrack.value)
  }

  if (options.updateInput !== false && !isMetaPreviewTimeFocused.value) {
    syncMetaPreviewTimeInput()
  }

  scheduleMetaWaveformDraw()
}

function setMetaClipStart(event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const scrubValue = Number(input.value)
  const nextStart = metaClipStartMax.value - scrubValue

  if (!Number.isFinite(scrubValue)) {
    return
  }

  applyMetaClipStart(nextStart)
}

function metaWaveformPixelsPerSecond() {
  const rect = metaWaveformCanvas.value?.getBoundingClientRect()

  if (!rect?.width) {
    return 1
  }

  const availableFrameWidth = Math.max(1, rect.width - 24)
  const frameWidth = Math.min(availableFrameWidth, Math.max(132, rect.width * (metaClipWindowWidth.value / 100)))
  const waveWidth = Math.max(1, frameWidth - 30)

  return waveWidth / META_CLIP_SECONDS
}

function beginMetaWaveformGesture(event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return
  }

  metaWaveformPointerId = event.pointerId
  metaWaveformPointerStartX = event.clientX
  metaWaveformPointerStartClip = metaClipStart.value
  metaWaveformPointerMoved = false

  const editor = event.currentTarget as HTMLElement
  editor.setPointerCapture?.(event.pointerId)
}

function moveMetaWaveformGesture(event: PointerEvent) {
  if (metaWaveformPointerId !== event.pointerId) {
    return
  }

  const deltaX = event.clientX - metaWaveformPointerStartX

  if (!metaWaveformPointerMoved && Math.abs(deltaX) < 6) {
    return
  }

  metaWaveformPointerMoved = true
  isMetaWaveformDragging.value = true
  event.preventDefault()

  const secondsDelta = deltaX / metaWaveformPixelsPerSecond()
  applyMetaClipStart(metaWaveformPointerStartClip - secondsDelta)
}

function endMetaWaveformGesture(event: PointerEvent) {
  if (metaWaveformPointerId !== event.pointerId) {
    return
  }

  const shouldReplay = !metaWaveformPointerMoved
  const editor = event.currentTarget as HTMLElement
  if (editor.hasPointerCapture?.(event.pointerId)) {
    editor.releasePointerCapture(event.pointerId)
  }
  metaWaveformPointerId = null
  isMetaWaveformDragging.value = false

  if (shouldReplay) {
    void replayMetaPreviewFromClipStart()
  }
}

function cancelMetaWaveformGesture(event: PointerEvent) {
  if (metaWaveformPointerId !== event.pointerId) {
    return
  }

  const editor = event.currentTarget as HTMLElement
  if (editor.hasPointerCapture?.(event.pointerId)) {
    editor.releasePointerCapture(event.pointerId)
  }
  metaWaveformPointerId = null
  isMetaWaveformDragging.value = false
}

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00"
  }

  const totalSeconds = Math.floor(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = String(totalSeconds % 60).padStart(2, "0")
  return `${minutes}:${remainder}`
}

function creditRowsForSection(track: UploadTrackDraft, section: ParticipantCreditSection) {
  if (section === "artist") return track.artistCredits
  if (section === "writer") return track.writerCredits
  return track.additionalCredits
}

function addCreditRow(track: UploadTrackDraft, section: ParticipantCreditSection) {
  creditRowsForSection(track, section).push(
    section === "artist"
      ? blankCreditDraft("", ["Featured Artist"])
      : section === "writer"
        ? blankCreditDraft("", ["Songwriter"])
        : blankCreditDraft(),
  )

  if (section === "artist") {
    markTrackArtistCreditsOverridden(track)
  }

  markTrackDetailsUnsaved(track)
}

async function removeCreditRow(track: UploadTrackDraft, section: ParticipantCreditSection, creditIndex: number) {
  const rows = creditRowsForSection(track, section)
  const credit = rows[creditIndex]
  const sectionLabel = section === "artist" ? "artist" : section === "writer" ? "writer" : "additional"
  const confirmed = await confirmUploadRemoval(
    `Remove ${sectionLabel} credit`,
    `Remove ${credit?.creditedName.trim() || `${sectionLabel} credit ${creditIndex + 1}`} from ${track.title.trim() || "this track"}?`,
    rows.length <= 1 ? "Reset credit" : "Remove credit",
  )

  if (!confirmed) {
    return
  }

  if (rows.length <= 1) {
    rows.splice(
      0,
      1,
      section === "artist"
        ? blankCreditDraft(selectedArtistName(), ["Main Artist"])
        : section === "writer"
          ? blankCreditDraft("", ["Songwriter"])
          : blankCreditDraft(),
    )
    if (section === "artist") {
      markTrackArtistCreditsOverridden(track)
    }
    markTrackDetailsUnsaved(track)
    return
  }

  rows.splice(creditIndex, 1)

  if (section === "artist") {
    markTrackArtistCreditsOverridden(track)
  }

  markTrackDetailsUnsaved(track)
}

function updateCreditName(track: UploadTrackDraft, section: ParticipantCreditSection, creditIndex: number, value: string | number | null) {
  const credit = creditRowsForSection(track, section)[creditIndex]

  if (!credit) {
    return
  }

  credit.creditedName = String(value ?? "")

  if (section === "artist") {
    markTrackArtistCreditsOverridden(track)
  }

  markTrackDetailsUnsaved(track)
}

function updateCreditRoles(track: UploadTrackDraft, section: ParticipantCreditSection, creditIndex: number, roleCodes: string[]) {
  const credit = creditRowsForSection(track, section)[creditIndex]

  if (!credit) {
    return
  }

  credit.roleCodes = roleCodes

  if (section === "artist") {
    markTrackArtistCreditsOverridden(track)
  }

  markTrackDetailsUnsaved(track)
}

function isBlankCreditDraft(credit: CreditDraft) {
  return !credit.creditedName.trim() && !credit.roleCodes.length
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

function validateTrackCredits(track: UploadTrackDraft, trackIndex: number) {
  try {
    buildTrackCreditInputs(track, trackIndex)
    return ""
  } catch (error: any) {
    return error?.message || `Track ${trackIndex + 1} credits are incomplete.`
  }
}

function parseTiktokPreviewSeconds(value: string) {
  const normalized = value.trim()

  if (!normalized) {
    return null
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized)
  }

  const parts = normalized.split(":")

  if (parts.length === 2 && parts.every((part) => /^\d+$/.test(part))) {
    const minutes = Number(parts[0])
    const seconds = Number(parts[1])

    if (seconds >= 60) {
      return Number.NaN
    }

    return minutes * 60 + seconds
  }

  return Number.NaN
}

function validateTiktokPreviewTime(track: UploadTrackDraft, trackIndex: number) {
  const seconds = parseTiktokPreviewSeconds(track.tiktokPreviewTime)

  if (seconds === null) {
    return ""
  }

  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3599) {
    return `Track ${trackIndex + 1} TikTok preview time must be seconds or M:SS, between 0:00 and 59:59.`
  }

  return ""
}

function normalizedTiktokPreviewStartSeconds(track: UploadTrackDraft) {
  const seconds = parseTiktokPreviewSeconds(track.tiktokPreviewTime)
  return Number.isInteger(seconds) ? seconds : null
}

function validateRequiredWriter(track: UploadTrackDraft, trackIndex: number) {
  const hasWriterName = track.writerCredits.some((credit) => credit.creditedName.trim())

  if (!hasWriterName) {
    return `Track ${trackIndex + 1} needs at least one writer name in Participants.`
  }

  return ""
}

function validateTrackDetails(track: UploadTrackDraft, trackIndex: number, requireSaved = false) {
  if (!track.title.trim()) {
    return `Track ${trackIndex + 1} needs a title in Credits.`
  }

  const writerError = validateRequiredWriter(track, trackIndex)

  if (writerError) {
    return writerError
  }

  const tiktokError = validateTiktokPreviewTime(track, trackIndex)

  if (tiktokError) {
    return tiktokError
  }

  const creditError = validateTrackCredits(track, trackIndex)

  if (creditError) {
    return creditError
  }

  if (requireSaved && !track.detailsSaved) {
    return `Save Credits for Track ${trackIndex + 1} before choosing DSPs.`
  }

  return ""
}

function focusTrackDetailError(track: UploadTrackDraft, message: string) {
  activeUploadStep.value = "credits"
  track.detailOpen = true

  if (/credit|role|artist|writer|additional/i.test(message)) {
    track.detailTab = "participants"
    if (/writer/i.test(message)) track.participantSection = "writer"
    else if (/additional/i.test(message)) track.participantSection = "additional"
    else track.participantSection = "artist"
    return
  }

  track.detailTab = "general"
}

function validateAudioSourcesReady() {
  const uploadingTrackIndex = tracks.value.findIndex((track) => track.uploadState === "uploading")

  if (uploadingTrackIndex !== -1) {
    activeUploadStep.value = "audio"
    return `Track ${uploadingTrackIndex + 1} audio is still uploading.`
  }

  const failedTrackIndex = tracks.value.findIndex((track) => track.uploadState === "error")

  if (failedTrackIndex !== -1) {
    activeUploadStep.value = "audio"
    return `Track ${failedTrackIndex + 1} audio upload failed. Upload it again.`
  }

  const incompleteTrackIndex = tracks.value.findIndex((track) => !track.title.trim() || !hasTrackAudioSource(track))

  if (incompleteTrackIndex !== -1) {
    const track = tracks.value[incompleteTrackIndex]
    activeUploadStep.value = "audio"
    track.detailOpen = true
    track.detailTab = "general"
    return `Track ${incompleteTrackIndex + 1} needs a title and an uploaded audio file.`
  }

  return ""
}

function validateTrackDetailsReady() {
  for (const [trackIndex, track] of tracks.value.entries()) {
    const detailError = validateTrackDetails(track, trackIndex, true)

    if (detailError) {
      focusTrackDetailError(track, detailError)
      return detailError
    }
  }

  return ""
}

function validateTracksReadyForDelivery() {
  return validateAudioSourcesReady() || validateTrackDetailsReady()
}

async function saveTrackDetails(track: UploadTrackDraft, trackIndex: number) {
  const detailError = validateTrackDetails(track, trackIndex)

  if (detailError) {
    focusTrackDetailError(track, detailError)
    pageError.value = detailError
    pageSuccess.value = ""
    return
  }

  track.detailsSaved = true
  track.error = ""
  pageError.value = ""

  if (track.detailTab === "participants") {
    await saveDspProfilesFromUpload()
  }
}

function assetStateText(state: UploadState, progress: number) {
  if (state === "idle") {
    return "Required"
  }

  if (state === "uploading") {
    return `${progress}%`
  }

  return state
}

function assetStateTone(state: UploadState) {
  if (state === "done") return "success"
  if (state === "uploading") return "warning"
  if (state === "error") return "danger"
  return "muted"
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

function abortTrackUpload(track: UploadTrackDraft) {
  if (track.audioUploadXhr) {
    track.audioUploadXhr.abort()
    track.audioUploadXhr = null
  }
}

function resetTrackUploadState(track: UploadTrackDraft) {
  abortTrackUpload(track)
  track.audioUploadedUrl = ""
  track.audioUploadProgress = 0
  track.uploadState = "idle"
}

function isUploadLimitError(status: number, message: string) {
  return status === 413 || /payload too large|file.?size|file_size|upload limit|too large|exceed|maximum/i.test(message)
}

function normalizeUploadError(message: string, status: number, file: File) {
  if (!isUploadLimitError(status, message)) {
    return message
  }

  return `Supabase rejected ${file.name} (${formatFileSize(file.size)}). The app is not capping audio now; the Supabase project Storage global file size limit is still below this file. Raise Storage Settings > Global file size limit above ${formatFileSize(file.size)}.`
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
      reject(new Error("Network error while uploading to Supabase Storage."))
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

function onCoverSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null

  coverError.value = ""
  resetCoverUploadState()

  if (!file) {
    coverFile.value = null
    return
  }

  const validationError = validateCoverFile(file)

  if (validationError) {
    coverError.value = validationError
    coverFile.value = null
    input.value = ""
    return
  }

  coverFile.value = file
  coverInputVersion.value += 1
  resetMessages()
  void uploadCoverFile(file)
}

function onTrackAudioSelected(event: Event, track: UploadTrackDraft) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null

  track.error = ""
  track.audioUploadRequestId += 1
  clearTrackPreview(track)
  resetTrackUploadState(track)

  if (!file) {
    track.audioFile = null
    markTrackDetailsUnsaved(track)
    return
  }

  const validationError = validateAudioFile(file)

  if (validationError) {
    track.error = validationError
    track.audioFile = null
    input.value = ""
    markTrackDetailsUnsaved(track)
    return
  }

  track.audioFile = file
  setTrackPreviewFile(track, file)
  track.audioInputVersion += 1
  markTrackDetailsUnsaved(track)
  resetMessages()
  void uploadTrackAudioFile(track, file)
}

async function clearTrackAudioFile(track: UploadTrackDraft) {
  const confirmed = await confirmUploadRemoval(
    "Remove audio file",
    `Remove ${track.audioFile?.name || "the uploaded audio"} from ${track.title.trim() || "this track"}?`,
    "Remove file",
  )

  if (!confirmed) {
    return
  }

  track.audioUploadRequestId += 1
  clearTrackPreview(track)
  resetTrackUploadState(track)
  track.audioFile = null
  track.audioInputVersion += 1
  markTrackDetailsUnsaved(track)
  resetMessages()
}

async function addTrack() {
  tracks.value = [...tracks.value, createTrackDraft()]
  await nextTick()

  if (spotifyTrackTable.value) {
    spotifyTrackTable.value.scrollTo({
      top: spotifyTrackTable.value.scrollHeight,
      behavior: "smooth",
    })
  }
}

async function removeTrack(trackId: string) {
  const trackIndex = tracks.value.findIndex((item) => item.id === trackId)
  const previewTrack = tracks.value[trackIndex]
  const confirmed = await confirmUploadRemoval(
    "Remove track",
    tracks.value.length === 1
      ? `Reset ${previewTrack?.title.trim() || "this track"} to a blank upload row? A release needs at least one track.`
      : `Remove ${previewTrack?.title.trim() || `track ${trackIndex + 1}`} and its uploaded audio from this package?`,
    tracks.value.length === 1 ? "Reset track" : "Remove track",
  )

  if (!confirmed) {
    return
  }

  if (tracks.value.length === 1) {
    abortTrackUpload(tracks.value[0])
    clearTrackPreview(tracks.value[0])
    tracks.value = [createTrackDraft()]
    return
  }

  const selectedTrack = tracks.value.find((item) => item.id === trackId)
  if (selectedTrack) {
    selectedTrack.audioUploadRequestId += 1
    clearTrackPreview(selectedTrack)
    abortTrackUpload(selectedTrack)
  }

  tracks.value = tracks.value.filter((item) => item.id !== trackId)
}

function selectAllStores() {
  selectedStores.value = [...RELEASE_STORE_OPTIONS]
}

async function clearStores() {
  const confirmed = await confirmUploadRemoval(
    "Clear selected stores",
    "Remove every selected DSP from this delivery package?",
    "Clear stores",
  )

  if (!confirmed) {
    return
  }

  selectedStores.value = []
}

function storeCheckboxId(store: string) {
  return `store-${store.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
}

function setStoreSelected(store: string, checked: boolean) {
  if (checked) {
    if (!selectedStores.value.includes(store)) {
      selectedStores.value = [...selectedStores.value, store]
    }
    return
  }

  selectedStores.value = selectedStores.value.filter((selectedStore) => selectedStore !== store)
}

function setTrackAiGeneratedElements(track: UploadTrackDraft, checked: boolean | "indeterminate") {
  track.containsAiGeneratedElements = checked === true
  markTrackDetailsUnsaved(track)
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

  if (!isCoverUploaded.value) {
    return coverUploadState.value === "error"
      ? "Cover art upload failed. Upload it again before distribution."
      : "Cover art must finish uploading before distribution."
  }

  if (!selectedStores.value.length) {
    return "Select at least one store."
  }

  const trackError = validateTracksReadyForDelivery()
  if (trackError) return trackError

  return ""
}

async function submitRelease() {
  const validationError = validateSubmission()

  if (validationError) {
    pageError.value = validationError
    pageSuccess.value = ""
    return
  }

  const confirmed = await confirmAction({
    title: "Submit release package",
    description: `Submit "${form.title.trim()}" for admin review across ${selectedStores.value.length} store${selectedStores.value.length === 1 ? "" : "s"}?`,
    confirmLabel: "Submit release",
    variant: "default",
  })

  if (!confirmed) {
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
        notes: form.notes || null,
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

async function saveDspProfilesFromUpload() {
  if (isViewingAsArtist.value) {
    pageError.value = "View-as mode is read-only. Sign in as the artist to update DSP preferences."
    dspProfileMessage.value = ""
    return
  }

  if (!form.artistId) {
    pageError.value = "Select the main artist before saving DSP preferences."
    dspProfileMessage.value = ""
    return
  }

  isSavingDspProfiles.value = true
  pageError.value = ""
  dspProfileMessage.value = ""

  try {
    const response = await $fetch("/api/dashboard/settings", {
      method: "PATCH",
      body: {
        dspProfiles: {
          artistId: form.artistId,
          profiles: dspProfileDrafts.value,
        },
      },
    }) as ArtistSettingsMutationResponse

    await refreshSettings()
    dspProfileDrafts.value = response.dspProfiles
      ? buildDspProfileDraftsFromRecords(response.dspProfiles, selectedArtistName() || "Artist")
      : buildDspProfileDrafts()
    dspProfileMessage.value = `Saved DSP preferences for ${selectedArtistName() || "this artist"}.`
  } catch (error: any) {
    setError(error, "Unable to save DSP profile preferences.")
  } finally {
    isSavingDspProfiles.value = false
  }
}
</script>

<template>
  <div class="page uploaded-page" :class="{ 'has-spotify-preview-player': showSpotifyPreviewPlayer }">
    <AppAlert v-if="pageError" variant="destructive">{{ pageError }}</AppAlert>
    <AppAlert v-if="pageSuccess" variant="success">
      {{ pageSuccess }}
      <template v-if="submittedReleaseId" #action>
        <Button variant="secondary" size="sm" as-child>
          <NuxtLink :to="`/dashboard/releases?release=${submittedReleaseId}`">Open draft</NuxtLink>
        </Button>
      </template>
    </AppAlert>
    <AppAlert v-if="isViewingAsArtist" variant="warning">
      View-as mode is read-only. Upload actions are disabled while an admin is inspecting this dashboard.
    </AppAlert>
    <audio
      ref="spotifyPreviewAudio"
      :src="activePreviewSource"
      preload="metadata"
      class="sr-only"
      @loadedmetadata="handlePreviewLoadedMetadata"
      @durationchange="handlePreviewLoadedMetadata"
      @timeupdate="handlePreviewTimeUpdate"
      @ended="handlePreviewEnded"
      @error="handlePreviewAudioError"
      @play="isPreviewPlaying = true"
      @pause="isPreviewPlaying = false"
    />

    <div class="uploader-story-shell">
      <div ref="uploaderScroller" class="uploader-scroll-stage" role="region" aria-label="Uploader sections">
    <section class="spotify-story-page uploader-story-section" data-uploader-section="spotify" aria-label="Spotify-style release uploader">
      <PageHeader
        class="spotify-page-header"
        eyebrow="Artist delivery"
        title="Uploaded"
        description="Build the release from a Spotify-style uploader."
      >
        <template #actions>
          <Button variant="secondary" as-child>
            <NuxtLink to="/dashboard/releases">
              <Disc3 class="size-4" />
              Releases
            </NuxtLink>
          </Button>
        </template>
      </PageHeader>

      <div class="spotify-upload-shell">
      <div class="spotify-upload-main">
      <div class="spotify-release-hero">
        <label class="spotify-cover-card" for="spotify-cover-file" @contextmenu.prevent>
          <img
            v-if="coverPreviewUrl"
            :src="coverPreviewUrl"
            alt="Selected cover art preview"
            draggable="false"
            @dragstart.prevent
          >
          <span v-else class="spotify-cover-placeholder">
            <ImageUp class="size-9" />
            <span>Upload photo</span>
          </span>
          <span class="spotify-cover-action">
            <UploadCloud class="size-4" />
            {{ coverFile ? "Replace photo" : "Upload photo" }}
          </span>
          <StatusBadge :tone="assetStateTone(coverUploadState)" class="spotify-cover-status rounded-full px-2 py-1">
            <Loader2 v-if="coverUploadState === 'uploading'" class="size-3 animate-spin" />
            <Check v-else-if="coverUploadState === 'done'" class="size-3" />
            <XCircle v-else-if="coverUploadState === 'error'" class="size-3" />
            {{ assetStateText(coverUploadState, coverUploadProgress) }}
          </StatusBadge>
        </label>
        <Input
          :key="`spotify-cover-${coverInputVersion}`"
          id="spotify-cover-file"
          class="sr-only"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          :disabled="isSubmitting || isCoverUploading"
          @change="onCoverSelected"
        />

        <div class="spotify-release-copy">
          <div class="spotify-release-kicker">
            <NativeSelect
              class="spotify-release-type-select"
              :model-value="form.type"
              :disabled="isSubmitting"
              :aria-label="`Release type: ${releaseTypeDisplay}`"
              @update:model-value="setReleaseType"
            >
              <option v-for="option in releaseTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </NativeSelect>
          </div>
          <Input
            class="spotify-release-title-input"
            :model-value="form.title"
            type="text"
            placeholder="Release name"
            :disabled="isSubmitting"
            aria-label="Release name"
            @update:model-value="updateReleaseTitle"
          />
          <div class="spotify-release-meta-row">
            <p class="spotify-release-meta">{{ spotifyReleaseMeta }}</p>
            <Popover v-slot="{ open, close }">
              <PopoverTrigger as-child>
                <Button
                  type="button"
                  variant="ghost"
                  class="spotify-release-date-button"
                  :disabled="isSubmitting"
                  :aria-label="`Release date: ${releaseDateDisplay}`"
                >
                  <CalendarDays class="size-4" />
                  <span class="spotify-release-date-copy">
                    <span>Release date</span>
                    <strong>{{ releaseDateDisplay }}</strong>
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent v-if="open" align="start" class="spotify-release-date-popover">
                <Calendar
                  :model-value="selectedReleaseDate"
                  :default-placeholder="selectedReleaseDate ?? recommendedReleaseDate"
                  :min-value="minimumReleaseDate"
                  :date-highlights="releaseDateHighlights"
                  calendar-label="Choose release date"
                  initial-focus
                  class="spotify-release-calendar"
                  @update:model-value="handleReleaseDateSelect($event, close)"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div class="spotify-control-bar" aria-label="Release controls">
        <Button
          type="button"
          class="spotify-play-button"
          size="icon-lg"
          :disabled="!previewableTracks.length"
          :aria-label="isPreviewPlaying ? 'Pause release preview' : 'Play release preview'"
          @click="toggleReleasePreview"
        >
          <Pause v-if="isPreviewPlaying" class="size-5 fill-current" />
          <Play v-else class="size-5 fill-current" />
        </Button>
        <Button type="button" variant="ghost" size="icon-lg" class="spotify-icon-button" aria-label="Upload cover" :disabled="isSubmitting || isCoverUploading" as-child>
          <label for="spotify-cover-file">
            <ImageUp class="size-5" />
          </label>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button type="button" variant="ghost" size="icon-lg" class="spotify-icon-button" aria-label="Release actions">
              <MoreHorizontal class="size-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" class="spotify-action-menu">
            <DropdownMenuItem @select="addTrack">
              <Plus class="size-4" />
              Add track
            </DropdownMenuItem>
            <DropdownMenuItem as-child>
              <label for="spotify-cover-file">
                <ImageUp class="size-4" />
                Upload photo
              </label>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span class="spotify-list-mode">
          <span>List</span>
          <ListMusic class="size-4" />
        </span>
      </div>

      <div ref="spotifyTrackTable" class="spotify-track-table" data-uploader-local-scroll role="table" aria-label="Upload tracks">
        <div class="spotify-track-head" role="row">
          <span>#</span>
          <span>Title</span>
          <span>Audio</span>
          <span>Version</span>
          <span>Status</span>
          <span class="spotify-track-time"><Clock3 class="size-4" /></span>
        </div>

        <div
          v-for="(track, trackIndex) in tracks"
          :key="`spotify-track-${track.id}`"
          class="spotify-track-row"
          :class="{ 'is-preview-active': isTrackPreviewActive(track) }"
          role="row"
        >
          <span class="spotify-track-index" :class="{ 'has-preview': trackHasPreviewAudio(track), 'is-playing': isTrackPreviewPlaying(track) }">
            <button
              v-if="trackHasPreviewAudio(track)"
              type="button"
              class="spotify-track-play-toggle"
              :aria-label="isTrackPreviewPlaying(track) ? `Pause ${trackDisplayTitle(track)}` : `Play ${trackDisplayTitle(track)}`"
              @click="toggleTrackPreview(track)"
            >
              <Pause v-if="isTrackPreviewPlaying(track)" class="size-3 fill-current" />
              <Play v-else class="size-3 fill-current" />
            </button>
            <span class="spotify-track-number">{{ trackIndex + 1 }}</span>
          </span>
          <div class="spotify-track-title-cell">
            <div class="spotify-track-title-editor">
              <Input
                class="spotify-track-title-input"
                :model-value="track.title"
                type="text"
                placeholder="Add track name"
                :disabled="isSubmitting"
                :aria-label="`Track ${trackIndex + 1} title`"
                @update:model-value="updateTrackTitle(track, $event)"
              />
              <Pencil class="spotify-track-edit-icon size-4" aria-hidden="true" />
            </div>
            <div class="spotify-main-artist-row" :aria-label="`Track ${trackIndex + 1} main artists`">
              <span v-for="artistName in mainArtistNamesForTrack(track)" :key="`${track.id}-${artistName}`" class="spotify-main-artist-chip">
                <span class="spotify-main-artist-chip-name">{{ artistName }}</span>
                <button
                  v-if="canRemoveMainArtist(track, artistName)"
                  type="button"
                  class="spotify-main-artist-remove"
                  :disabled="isSubmitting"
                  :aria-label="`Remove ${artistName} from track ${trackIndex + 1}`"
                  @click="removeMainArtistFromTrack(track, artistName)"
                >
                  <XCircle class="size-3" />
                </button>
              </span>
              <Popover v-slot="{ open, close }">
                <PopoverTrigger as-child>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    class="spotify-main-artist-add"
                    :disabled="isSubmitting"
                    :aria-label="`Add main artist to track ${trackIndex + 1}`"
                  >
                    <Plus class="size-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent v-if="open" align="start" class="spotify-main-artist-popover">
                  <form class="spotify-main-artist-form" @submit.prevent="addMainArtistToTrack(track, close)">
                    <Input
                      class="spotify-main-artist-input"
                      :model-value="mainArtistDraftForTrack(track)"
                      type="text"
                      placeholder="Artist name"
                      autocomplete="off"
                      :disabled="isSubmitting"
                      :aria-label="`New main artist for track ${trackIndex + 1}`"
                      @update:model-value="setMainArtistDraft(track, $event)"
                      @keydown.enter.prevent="addMainArtistToTrack(track, close)"
                    />
                    <Button type="submit" size="sm" class="spotify-main-artist-submit" :disabled="isSubmitting">
                      Add
                    </Button>
                  </form>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div class="spotify-audio-cell">
            <div v-if="trackHasPreviewAudio(track)" class="spotify-audio-preview" :class="{ playing: isTrackPreviewPlaying(track) }">
              <button
                type="button"
                class="spotify-audio-preview-button"
                :aria-label="isTrackPreviewPlaying(track) ? `Pause ${trackDisplayTitle(track)}` : `Play ${trackDisplayTitle(track)}`"
                @click="toggleTrackPreview(track)"
              >
                <Pause v-if="isTrackPreviewPlaying(track)" class="size-3 fill-current" />
                <Play v-else class="size-3 fill-current" />
              </button>
              <span class="spotify-audio-preview-copy">{{ audioPreviewLabel(track) }}</span>
              <label class="spotify-audio-replace" :for="`spotify-track-audio-${track.id}`">Replace</label>
            </div>
            <label v-else class="spotify-audio-upload" :for="`spotify-track-audio-${track.id}`">
              <FileAudio class="size-4" />
              <span>Upload audio</span>
            </label>
            <Input
              :key="`spotify-audio-${track.id}-${track.audioInputVersion}`"
              :id="`spotify-track-audio-${track.id}`"
              class="sr-only"
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/vnd.wave"
              :disabled="isSubmitting || track.uploadState === 'uploading'"
              @change="onTrackAudioSelected($event, track)"
            />
            <Progress
              v-if="track.uploadState === 'uploading'"
              :model-value="track.audioUploadProgress"
              class="spotify-track-progress"
              :aria-label="`Track ${trackIndex + 1} audio upload progress`"
              :aria-valuetext="`${track.audioUploadProgress}% uploaded`"
            />
          </div>
          <NativeSelect
            class="spotify-version-select"
            :model-value="track.versionLine"
            :disabled="isSubmitting"
            :aria-label="`Track ${trackIndex + 1} version`"
            @update:model-value="setTrackVersion(track, $event)"
          >
            <option v-for="version in trackVersionOptions" :key="version" :value="version">{{ version }}</option>
          </NativeSelect>
          <StatusBadge :tone="assetStateTone(track.uploadState)" class="spotify-track-status rounded-full px-2 py-1">
            <Loader2 v-if="track.uploadState === 'uploading'" class="size-3 animate-spin" />
            <Check v-else-if="track.uploadState === 'done'" class="size-3" />
            <XCircle v-else-if="track.uploadState === 'error'" class="size-3" />
            {{ assetStateText(track.uploadState, track.audioUploadProgress) }}
          </StatusBadge>
          <div class="spotify-track-menu-cell">
            <span v-if="isTrackPreviewActive(track) && previewDuration" class="spotify-track-duration">
              {{ formatPlaybackTime(previewDuration) }}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button type="button" variant="ghost" size="icon-sm" class="spotify-track-menu-button" :aria-label="`Track ${trackIndex + 1} actions`">
                  <MoreHorizontal class="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="spotify-action-menu">
                <DropdownMenuItem as-child>
                  <label :for="`spotify-track-audio-${track.id}`">
                    <UploadCloud class="size-4" />
                    {{ track.audioFile ? "Replace audio" : "Upload audio" }}
                  </label>
                </DropdownMenuItem>
                <DropdownMenuItem v-if="track.audioFile" @select.prevent="clearTrackAudioFile(track)">
                  <XCircle class="size-4" />
                  Remove audio
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" @select.prevent="removeTrack(track.id)">
                  <Trash2 class="size-4" />
                  Remove track
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p v-if="track.error" class="spotify-track-error">{{ track.error }}</p>
        </div>

      </div>

      <button
        type="button"
        class="spotify-add-track-row"
        data-uploader-local-scroll-lock
        :disabled="isSubmitting"
        :aria-label="`Add track ${tracks.length + 1}`"
        @click="addTrack"
      >
        <span class="spotify-add-track-index"><Plus class="size-4" /></span>
        <span class="spotify-add-track-copy">
          <strong>Add track</strong>
        </span>
      </button>

      <div class="spotify-release-footnote">
        <span>{{ selectedReleaseDate ? releaseDateDisplay : "Release date pending" }}</span>
        <span>{{ coverChecklistDetail }}</span>
      </div>
      </div>

      <ClientOnly>
        <Teleport to="body">
          <div
            v-if="showSpotifyPreviewPlayer"
            class="spotify-preview-player spotify-preview-player--overlay"
            role="region"
            aria-label="Audio preview player"
          >
            <div class="spotify-preview-now">
              <img
                v-if="spotifyPreviewReady && spotifyPreviewCover"
                :src="spotifyPreviewCover"
                alt=""
                class="spotify-preview-cover"
                draggable="false"
                @dragstart.prevent
              >
              <span v-else class="spotify-preview-cover spotify-preview-cover-empty">
                <Music2 class="size-5" />
              </span>
              <span class="spotify-preview-now-copy">
                <strong>{{ spotifyPreviewReady ? spotifyPreviewTitle : "Upload audio to preview" }}</strong>
                <span>{{ spotifyPreviewReady ? spotifyPreviewArtists : "Select WAV or MP3 on a track" }}</span>
              </span>
            </div>

            <div class="spotify-preview-center">
              <div class="spotify-preview-controls">
                <Button type="button" variant="ghost" size="icon-sm" class="spotify-preview-icon" :disabled="!spotifyPreviewReady" aria-label="Shuffle preview">
                  <Shuffle class="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="spotify-preview-icon"
                  :disabled="previewableTracks.length < 2"
                  aria-label="Previous track"
                  @click="playPreviousPreviewTrack"
                >
                  <SkipBack class="size-4 fill-current" />
                </Button>
                <Button
                  type="button"
                  class="spotify-preview-play"
                  size="icon-sm"
                  :disabled="!spotifyPreviewReady"
                  :aria-label="isPreviewPlaying ? 'Pause preview' : 'Play preview'"
                  @click="toggleReleasePreview"
                >
                  <Pause v-if="isPreviewPlaying" class="size-4 fill-current" />
                  <Play v-else class="size-4 fill-current" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="spotify-preview-icon"
                  :disabled="previewableTracks.length < 2"
                  aria-label="Next track"
                  @click="playNextPreviewTrack"
                >
                  <SkipForward class="size-4 fill-current" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" class="spotify-preview-icon active" :disabled="!spotifyPreviewReady" aria-label="Repeat preview">
                  <Repeat2 class="size-4" />
                </Button>
              </div>
              <div class="spotify-preview-timeline">
                <span>{{ formatPlaybackTime(previewCurrentTime) }}</span>
                <input
                  type="range"
                  min="0"
                  :max="previewDuration || 0"
                  step="0.1"
                  :value="previewCurrentTime"
                  :disabled="!spotifyPreviewReady || !previewDuration"
                  class="spotify-preview-range"
                  :style="`--range-progress: ${previewProgressPercent}%`"
                  aria-label="Preview position"
                  @input="seekPreview"
                >
                <span>{{ formatPlaybackTime(previewDuration) }}</span>
              </div>
            </div>

            <div class="spotify-preview-tools">
              <Volume2 class="size-4" aria-hidden="true" />
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                :value="previewVolumePercent"
                class="spotify-preview-volume"
                :disabled="!spotifyPreviewReady"
                :style="`--range-progress: ${previewVolumePercent}%`"
                aria-label="Preview volume"
                @input="setPreviewVolume"
              >
            </div>
          </div>
        </Teleport>
      </ClientOnly>
      </div>
    </section>

    <section class="meta-music-page uploader-story-section" data-uploader-section="meta" aria-label="Meta music preview">
      <div class="meta-music-phone" :class="{ 'is-playing': isPreviewPlaying && previewPlaybackSurface === 'meta' }">
        <div class="meta-story-background" aria-hidden="true">
          <span></span>
        </div>
        <div class="meta-story-overlay" aria-hidden="true"></div>

        <header class="meta-story-top">
          <span aria-hidden="true"></span>
          <button type="button" class="meta-story-cover-button" aria-label="Cover art">
            <img v-if="metaPreviewCover" :src="metaPreviewCover" alt="" draggable="false">
            <ImageUp v-else class="size-5" />
          </button>
          <button type="button" class="meta-color-wheel" aria-label="Story background color">
            <span></span>
          </button>
          <button type="button" class="meta-done-button">Done</button>
        </header>

        <div class="meta-story-canvas">
          <div class="meta-sticker-stage">
            <div v-if="metaStickerStyle === 'card'" class="meta-music-sticker-card">
              <span class="meta-sticker-cover">
                <img v-if="metaPreviewCover" :src="metaPreviewCover" alt="" draggable="false">
                <Music2 v-else class="size-5" />
                <span class="meta-sticker-bars" aria-hidden="true">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
              </span>
              <span class="meta-sticker-copy">
                <strong>{{ metaPreviewTitle }}</strong>
                <span>{{ metaPreviewArtists }}</span>
              </span>
            </div>

            <div v-else class="meta-music-sticker-minimal">
              <span class="meta-minimal-disc">
                <img v-if="metaPreviewCover" :src="metaPreviewCover" alt="" draggable="false">
                <Music2 v-else class="size-4" />
              </span>
              <strong class="meta-minimal-copy">{{ metaPreviewTitle }}</strong>
            </div>

            <div class="meta-style-toggle" aria-label="Music sticker style">
              <button
                type="button"
                :class="{ active: metaStickerStyle === 'card' }"
                aria-label="Card sticker"
                @click="setMetaStickerStyle('card')"
              >
                <span class="meta-style-card-icon"></span>
              </button>
              <button
                type="button"
                :class="{ active: metaStickerStyle === 'minimal' }"
                aria-label="Minimal sticker"
                @click="setMetaStickerStyle('minimal')"
              >
                <span class="meta-style-minimal-icon"></span>
              </button>
            </div>
          </div>
        </div>

        <footer class="meta-story-bottom">
          <div class="meta-track-strip" aria-label="Preview track">
            <button
              v-for="track in tracks"
              :key="`meta-track-${track.id}`"
              type="button"
              class="meta-track-chip"
              :class="{ active: metaPreviewTrack?.id === track.id }"
              :disabled="!trackHasPreviewAudio(track)"
              @click="selectMetaPreviewTrack(track)"
            >
              <span>{{ trackDisplayTitle(track) }}</span>
            </button>
          </div>

          <div class="meta-clip-controls">
            <span class="meta-clip-duration">{{ META_CLIP_SECONDS }}</span>
            <div
              class="meta-waveform-editor"
              :class="{ 'is-dragging': isMetaWaveformDragging }"
              :aria-label="`Preview starts at ${formatPlaybackTime(metaClipStart)}`"
              role="slider"
              tabindex="0"
              :aria-valuemin="0"
              :aria-valuemax="metaClipStartMax"
              :aria-valuenow="metaClipStart"
              :aria-valuetext="`${formatPlaybackTime(metaClipStart)} to ${formatPlaybackTime(metaClipEndTime)}`"
              @pointerdown="beginMetaWaveformGesture"
              @pointermove="moveMetaWaveformGesture"
              @pointerup="endMetaWaveformGesture"
              @pointercancel="cancelMetaWaveformGesture"
              @lostpointercapture="cancelMetaWaveformGesture"
            >
              <canvas ref="metaWaveformCanvas" class="meta-waveform-canvas" aria-hidden="true"></canvas>
              <input
                class="meta-waveform-range"
                type="range"
                min="0"
                :max="metaClipStartMax"
                step="1"
                :value="metaClipScrubValue"
                tabindex="-1"
                aria-hidden="true"
                @input="setMetaClipStart"
              >
            </div>
            <label class="meta-time-field" :for="metaPreviewTimeInputId">
              <span>IG/TikTok</span>
              <Input
                :id="metaPreviewTimeInputId"
                class="meta-time-input"
                :model-value="metaPreviewTimeInput"
                type="text"
                inputmode="numeric"
                placeholder="0:15"
                @focus="handleMetaPreviewTimeFocus"
                @blur="handleMetaPreviewTimeBlur"
                @update:model-value="setMetaPreviewTimeInput"
              />
            </label>
            <button
              type="button"
              class="meta-story-play"
              :disabled="!metaPreviewTrack || !trackHasPreviewAudio(metaPreviewTrack)"
              :aria-label="metaPreviewTrack && isTrackPreviewPlaying(metaPreviewTrack) && previewPlaybackSurface === 'meta' ? 'Pause Meta preview' : 'Play Meta preview'"
              @click="toggleMetaPreview()"
            >
              <Pause v-if="metaPreviewTrack && isTrackPreviewPlaying(metaPreviewTrack) && previewPlaybackSurface === 'meta'" class="size-5 fill-current" />
              <Play v-else class="size-5 fill-current" />
            </button>
          </div>

          <div class="meta-mini-progress" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </footer>
      </div>
    </section>

      </div>

      <aside
        class="uploader-scroll-nav"
        :style="{ '--uploader-scroll-ratio': uploaderScrollProgress / 100 }"
        aria-label="Uploader section map"
      >
        <button
          type="button"
          class="uploader-scroll-action"
          :aria-label="uploaderScrollButtonLabel"
          @click="moveToAdjacentUploaderSection"
        >
          <ChevronUp v-if="activeUploaderSectionIndex === uploaderScrollSections.length - 1" class="size-4" />
          <ChevronDown v-else class="size-4" />
        </button>

        <div class="uploader-section-map">
          <button
            v-for="(section, sectionIndex) in uploaderScrollSections"
            :key="section.id"
            type="button"
            class="uploader-map-marker"
            :class="{ active: activeUploaderSection?.id === section.id }"
            :style="uploaderSectionMarkerStyle(sectionIndex)"
            :aria-label="`Scroll to ${section.label}`"
            @click="moveToUploaderSection(sectionIndex)"
          >
            <span></span>
          </button>
        </div>
      </aside>
    </div>

    <section v-if="showLegacyUploadSections" class="upload-status-band" aria-label="Release package status">
      <div class="upload-status-copy">
        <p class="eyebrow">Distribution package</p>
        <h2>{{ form.title || "New release package" }}</h2>
        <p>{{ activeArtist?.name || "Artist profile" }} / {{ selectedStoreSummary }} / {{ totalAudioPayloadLabel }}</p>
      </div>
      <div class="readiness-meter">
        <span>{{ currentStepLabel }} step</span>
        <strong>{{ completionPercent }}%</strong>
        <Progress
          :model-value="completionPercent"
          class="readiness-progress"
          aria-label="Release package readiness"
          :aria-valuetext="`${completionPercent}% complete`"
        />
      </div>
    </section>

    <nav v-if="showLegacyUploadSections" class="upload-step-rail" aria-label="Upload steps">
      <button
        v-for="(step, stepIndex) in uploadSteps"
        :key="step.value"
        type="button"
        class="upload-step"
        :class="{ active: activeUploadStep === step.value, complete: uploadStepComplete(step.value) }"
        @click="goToUploadStep(step.value)"
      >
        <span class="upload-step-index">
          <Check v-if="uploadStepComplete(step.value)" class="size-4" />
          <span v-else>{{ stepIndex + 1 }}</span>
        </span>
        <span class="upload-step-copy">
          <strong>{{ step.label }}</strong>
          <small>{{ step.helper }}</small>
        </span>
      </button>
    </nav>

    <div v-if="showLegacyUploadSections" class="upload-workspace">
      <Card id="upload-metadata-section" class="upload-panel upload-step-panel metadata-panel">
        <div class="upload-section-header">
          <span class="upload-section-icon"><Disc3 class="size-5" /></span>
          <div>
            <p class="eyebrow">Release details</p>
            <h3>Release settings</h3>
          </div>
        </div>

        <div class="upload-form-grid">
          <div class="field-row">
            <label>Artist</label>
            <div class="upload-static-field">
              {{ selectedArtistName() || "Artist profile" }}
            </div>
          </div>

          <div class="field-row">
            <label for="upload-type">Release type</label>
            <NativeSelect id="upload-type" :model-value="form.type" :disabled="isSubmitting" @update:model-value="setReleaseType">
              <option v-for="option in releaseTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }} - {{ option.meta }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row field-row-full">
            <label for="upload-title">Release title</label>
            <Input id="upload-title" :model-value="form.title" type="text" placeholder="Release title" :disabled="isSubmitting" @update:model-value="updateReleaseTitle" />
          </div>

          <div class="field-row">
            <label for="upload-genre">Genre</label>
            <NativeSelect id="upload-genre" v-model="form.genre" :disabled="isSubmitting">
              <option v-for="genre in RELEASE_GENRE_OPTIONS" :key="genre" :value="genre">{{ genre }}</option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="upload-release-date">Release date</label>
            <AppDatePicker id="upload-release-date" v-model="form.releaseDate" required :disabled="isSubmitting" />
          </div>
        </div>

        <div class="step-actions">
          <span class="step-action-copy">Cover art opens after the release identity is set.</span>
          <Button :disabled="isSubmitting" @click="goToNextUploadStep">
            Next: cover art
            <ChevronRight class="size-4" />
          </Button>
        </div>
      </Card>

      <Card class="upload-panel upload-step-panel legacy-asset-panel cover-panel">
        <div class="upload-section-header">
          <span class="upload-section-icon"><ImageUp class="size-5" /></span>
          <div>
            <p class="eyebrow">Artwork</p>
            <h3>Cover art</h3>
          </div>
        </div>

        <div class="cover-step-layout">
          <div class="cover-uploader">
            <div class="cover-preview" @contextmenu.prevent>
              <img
                v-if="coverPreviewUrl"
                :src="coverPreviewUrl"
                alt="Selected cover art preview"
                draggable="false"
                @dragstart.prevent
              >
              <div v-else class="cover-placeholder">
                <ImageUp class="size-8" />
                <span>Cover art</span>
              </div>
              <StatusBadge :tone="assetStateTone(coverUploadState)" class="asset-state-badge rounded-full px-2 py-1">
                <Loader2 v-if="coverUploadState === 'uploading'" class="size-3 animate-spin" />
                <Check v-else-if="coverUploadState === 'done'" class="size-3" />
                <XCircle v-else-if="coverUploadState === 'error'" class="size-3" />
                {{ assetStateText(coverUploadState, coverUploadProgress) }}
              </StatusBadge>
            </div>
            <label class="file-drop-zone" for="cover-file">
              <UploadCloud class="size-5" />
              <span>{{ coverFile ? coverFile.name : "Upload cover art" }}</span>
              <small>{{ coverUploadState === "done" ? "Uploaded to Supabase" : "JPG, PNG, WEBP / max 36 MB" }}</small>
            </label>
            <Input
              :key="coverInputVersion"
              id="cover-file"
              class="sr-only"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              :disabled="isSubmitting || isCoverUploading"
              @change="onCoverSelected"
            />
            <div v-if="coverFile" class="asset-upload-meta">
              <span>{{ coverChecklistDetail }}</span>
              <Progress
                v-if="coverUploadState === 'uploading'"
                :model-value="coverUploadProgress"
                class="asset-upload-progress"
                aria-label="Cover art upload progress"
                :aria-valuetext="`${coverUploadProgress}% uploaded`"
              />
            </div>
            <p v-if="coverError" class="field-note error-text">{{ coverError }}</p>
          </div>

          <div class="step-note-panel">
            <p class="eyebrow">Artwork standard</p>
            <strong>{{ coverFile ? coverFile.name : "Select the final square cover" }}</strong>
            <span>Upload starts immediately after selection. The file must finish before submission.</span>
          </div>
        </div>

        <div class="step-actions">
          <Button variant="secondary" :disabled="isSubmitting" @click="goToPreviousUploadStep">
            <ArrowLeft class="size-4" />
            Back
          </Button>
          <Button :disabled="isSubmitting || isCoverUploading" @click="goToNextUploadStep">
            Next: audio
            <ChevronRight class="size-4" />
          </Button>
        </div>
      </Card>

      <Card class="upload-panel upload-step-panel legacy-asset-panel audio-panel">
        <div class="upload-section-header">
          <span class="upload-section-icon"><Music2 class="size-5" /></span>
          <div>
            <p class="eyebrow">{{ totalAudioPayloadLabel }}</p>
            <h3>Audio files</h3>
          </div>
        </div>

        <div class="track-stack">
          <div class="track-stack-header">
            <p>Upload one master per track. Credits, lyrics, and release flags are handled in the next step.</p>
            <Button variant="secondary" size="sm" :disabled="isSubmitting" @click="addTrack">
              <Plus class="size-4" />
              Add track
            </Button>
          </div>

          <Card v-for="(track, trackIndex) in tracks" :key="track.id" size="sm" class="track-row-upload">
            <div class="track-number">{{ trackIndex + 1 }}</div>
            <div class="track-fields">
              <div class="upload-form-grid track-field-grid">
                <div class="field-row">
                  <label :for="`track-title-${track.id}`">Track title</label>
                  <Input :id="`track-title-${track.id}`" :model-value="track.title" type="text" placeholder="Track title" :disabled="isSubmitting" @update:model-value="updateTrackTitle(track, $event)" />
                </div>
                <div class="field-row">
                  <label :for="`track-isrc-${track.id}`">ISRC</label>
                  <Input :id="`track-isrc-${track.id}`" v-model="track.isrc" type="text" placeholder="Optional" :disabled="isSubmitting" @update:model-value="markTrackDetailsUnsaved(track)" />
                </div>
              </div>

              <div class="field-row field-row-full">
                <label :for="`track-audio-file-${track.id}`">Audio file</label>
                <label class="file-drop-zone audio-file-zone" :for="`track-audio-file-${track.id}`">
                  <UploadCloud class="size-5" />
                  <span>{{ track.audioFile ? track.audioFile.name : "Upload WAV or MP3" }}</span>
                  <small>{{ track.uploadState === "done" ? "Uploaded to Supabase" : "WAV or MP3" }}</small>
                </label>
                <Input
                  :key="track.audioInputVersion"
                  :id="`track-audio-file-${track.id}`"
                  class="sr-only"
                  type="file"
                  accept=".mp3,.wav,audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/vnd.wave"
                  :disabled="isSubmitting || track.uploadState === 'uploading'"
                  @change="onTrackAudioSelected($event, track)"
                />
                <div v-if="track.audioFile" class="audio-file-meta">
                  <span>
                    {{ track.uploadState === "uploading" ? `${track.audioUploadProgress}% uploaded` : track.uploadState === "done" ? `Uploaded / ${formatFileSize(track.audioFile.size)}` : formatFileSize(track.audioFile.size) }}
                  </span>
                  <Button variant="ghost" size="sm" :disabled="isSubmitting" @click="clearTrackAudioFile(track)">
                    <XCircle class="size-4" />
                    Remove file
                  </Button>
                  <Progress
                    v-if="track.uploadState === 'uploading'"
                    :model-value="track.audioUploadProgress"
                    class="asset-upload-progress audio-upload-progress"
                    :aria-label="`Track ${trackIndex + 1} audio upload progress`"
                    :aria-valuetext="`${track.audioUploadProgress}% uploaded`"
                  />
                </div>
              </div>
              <p v-if="track.error" class="field-note error-text">{{ track.error }}</p>
            </div>

            <div class="track-actions">
              <StatusBadge :tone="assetStateTone(track.uploadState)" class="asset-state-badge rounded-full px-2 py-1">
                <Loader2 v-if="track.uploadState === 'uploading'" class="size-3 animate-spin" />
                <Check v-else-if="track.uploadState === 'done'" class="size-3" />
                <XCircle v-else-if="track.uploadState === 'error'" class="size-3" />
                {{ assetStateText(track.uploadState, track.audioUploadProgress) }}
              </StatusBadge>
              <Button variant="ghost" size="icon" :disabled="isSubmitting" :aria-label="`Remove track ${trackIndex + 1}`" @click="removeTrack(track.id)">
                <Trash2 class="size-4" />
              </Button>
            </div>
          </Card>
        </div>

        <div class="step-actions">
          <Button variant="secondary" :disabled="isSubmitting" @click="goToPreviousUploadStep">
            <ArrowLeft class="size-4" />
            Back
          </Button>
          <Button :disabled="isSubmitting" @click="goToNextUploadStep">
            Next: credits
            <ChevronRight class="size-4" />
          </Button>
        </div>
      </Card>

      <Card id="upload-credits-section" class="upload-panel upload-step-panel credits-panel">
        <div class="upload-section-header">
          <span class="upload-section-icon"><Pencil class="size-5" /></span>
          <div>
            <p class="eyebrow">{{ savedTrackDetailCount }}/{{ tracks.length }} saved</p>
            <h3>Credits and track metadata</h3>
          </div>
        </div>

        <div class="credit-track-stack">
          <Card v-for="(track, trackIndex) in tracks" :key="`credit-track-${track.id}`" size="sm" class="credit-track-shell">
            <div class="credit-track-header">
              <div>
                <p class="eyebrow">Track {{ trackIndex + 1 }}</p>
                <strong>{{ track.title || "Untitled track" }}</strong>
                <span v-if="track.detailsSaved" class="track-detail-save-state">Details saved</span>
              </div>
              <Button size="sm" :disabled="isSubmitting || isSavingDspProfiles" @click="saveTrackDetails(track, trackIndex)">
                {{ isSavingDspProfiles ? "Saving..." : "Save details" }}
              </Button>
            </div>

            <div class="track-detail-tabs" role="tablist" :aria-label="`Track ${trackIndex + 1} credit sections`">
              <button type="button" :class="{ active: track.detailTab === 'general' }" @click="track.detailTab = 'general'">General</button>
              <button type="button" :class="{ active: track.detailTab === 'participants' }" @click="track.detailTab = 'participants'">Participants</button>
              <button type="button" :class="{ active: track.detailTab === 'lyrics' }" @click="track.detailTab = 'lyrics'">Lyrics</button>
            </div>

            <div v-if="track.detailTab === 'general'" class="track-detail-body">
              <div class="upload-form-grid track-field-grid">
                <div class="field-row">
                  <label :for="`detail-track-tiktok-${track.id}`">TikTok preview time</label>
                  <Input
                    :id="`detail-track-tiktok-${track.id}`"
                    v-model="track.tiktokPreviewTime"
                    type="text"
                    inputmode="numeric"
                    placeholder="0:30"
                    :disabled="isSubmitting"
                    @update:model-value="markTrackDetailsUnsaved(track)"
                  />
                </div>
                <div class="field-row">
                  <label :for="`detail-track-version-${track.id}`">Version line</label>
                  <Input
                    :id="`detail-track-version-${track.id}`"
                    :model-value="track.versionLine"
                    type="text"
                    placeholder="Original, remix, acoustic"
                    :disabled="isSubmitting"
                    @update:model-value="setTrackVersion(track, $event)"
                  />
                </div>
              </div>
              <Label class="track-ai-toggle" :for="`track-ai-${track.id}`">
                <Checkbox
                  :id="`track-ai-${track.id}`"
                  :model-value="track.containsAiGeneratedElements"
                  :disabled="isSubmitting"
                  @update:model-value="setTrackAiGeneratedElements(track, $event)"
                />
                <span>
                  <strong>Contains AI-generated elements</strong>
                  <small>Mark this if vocals, composition, artwork, or meaningful audio elements were generated with AI.</small>
                </span>
              </Label>
              <div class="metadata-rules">
                <p>Keep title metadata clean. Do not include primary or featured artists in track titles.</p>
                <p>Avoid dates, years, remix labels, or decorative symbols in metadata unless they are part of the registered title.</p>
              </div>
            </div>

            <div v-else-if="track.detailTab === 'participants'" class="track-detail-body participant-editor">
              <div class="participant-section-tabs">
                <button type="button" :class="{ active: track.participantSection === 'artist' }" @click="track.participantSection = 'artist'">Artist roles</button>
                <button type="button" :class="{ active: track.participantSection === 'writer' }" @click="track.participantSection = 'writer'">Writer roles</button>
                <button type="button" :class="{ active: track.participantSection === 'additional' }" @click="track.participantSection = 'additional'">Additional</button>
              </div>

              <div class="participant-section-body">
                <div class="participant-section-heading">
                  <strong>{{ track.participantSection === "artist" ? "Artist roles" : track.participantSection === "writer" ? "Writer roles" : "Additional credits" }}</strong>
                  <span class="participant-help-button" aria-hidden="true">
                    <CircleHelp class="size-4" />
                  </span>
                </div>

                <div v-if="track.participantSection === 'artist'" class="credit-row-stack">
                <p class="participant-note">DSP profiles saved here also update your delivery preferences.</p>
                  <Card v-for="(credit, creditIndex) in track.artistCredits" :key="`artist-credit-${track.id}-${creditIndex}`" size="sm" class="credit-row-card participant-credit-row">
                    <div class="field-row floating-field">
                      <label :for="`artist-credit-name-${track.id}-${creditIndex}`">Artist name</label>
                      <Input
                        :id="`artist-credit-name-${track.id}-${creditIndex}`"
                        :model-value="credit.creditedName"
                        type="text"
                        placeholder="Full name"
                        :disabled="isSubmitting"
                        @update:model-value="updateCreditName(track, 'artist', creditIndex, $event)"
                      />
                    </div>
                    <div class="field-row field-row-full floating-field">
                      <label>Role</label>
                      <CreditRoleMultiSelect
                        :input-id="`artist-credit-role-${track.id}-${creditIndex}`"
                        :model-value="credit.roleCodes"
                        :role-groups="TRACK_ARTIST_CREDIT_ROLE_GROUPS"
                        @update:model-value="updateCreditRoles(track, 'artist', creditIndex, $event)"
                      />
                    </div>
                    <Button variant="ghost" size="icon" :disabled="isSubmitting" :aria-label="`Remove artist credit ${creditIndex + 1}`" @click="removeCreditRow(track, 'artist', creditIndex)">
                      <Trash2 class="size-4" />
                    </Button>
                  </Card>
                  <div class="participant-reset-row">
                    <Button v-if="track.artistCreditsOverridden" variant="ghost" size="sm" :disabled="isSubmitting" @click="resetTrackArtistCredits(track)">
                      <RotateCcw class="size-4" />
                      Reset to primary artist
                    </Button>
                  </div>
                  <ArtistDspProfileEditor
                    v-model="dspProfileDrafts"
                    :artist-name="selectedArtistName() || 'Artist'"
                    :disabled="isSubmitting || isViewingAsArtist || isSavingDspProfiles"
                  />
                  <div class="dsp-preference-actions">
                    <Button
                      variant="secondary"
                      size="sm"
                      :disabled="isSubmitting || isViewingAsArtist || isSavingDspProfiles || !form.artistId"
                      @click="saveDspProfilesFromUpload"
                    >
                      <Loader2 v-if="isSavingDspProfiles" class="size-4 animate-spin" />
                      <Check v-else class="size-4" />
                      {{ isSavingDspProfiles ? "Saving preferences..." : "Save DSP preferences" }}
                    </Button>
                    <span>Saved preferences reload with this artist account.</span>
                  </div>
                  <p v-if="dspProfileMessage" class="field-note success-text">{{ dspProfileMessage }}</p>
                </div>

                <div v-else-if="track.participantSection === 'writer'" class="credit-row-stack">
                  <Card v-for="(credit, creditIndex) in track.writerCredits" :key="`writer-credit-${track.id}-${creditIndex}`" size="sm" class="credit-row-card participant-credit-row">
                    <div class="field-row floating-field">
                      <label :for="`writer-credit-name-${track.id}-${creditIndex}`">Full name</label>
                      <Input
                        :id="`writer-credit-name-${track.id}-${creditIndex}`"
                        :model-value="credit.creditedName"
                        type="text"
                        placeholder="Full name"
                        :disabled="isSubmitting"
                        @update:model-value="updateCreditName(track, 'writer', creditIndex, $event)"
                      />
                    </div>
                    <div class="field-row field-row-full floating-field">
                      <label>Role</label>
                      <CreditRoleMultiSelect
                        :input-id="`writer-credit-role-${track.id}-${creditIndex}`"
                        :model-value="credit.roleCodes"
                        :role-groups="TRACK_WRITER_CREDIT_ROLE_GROUPS"
                        @update:model-value="updateCreditRoles(track, 'writer', creditIndex, $event)"
                      />
                    </div>
                    <Button variant="ghost" size="icon" :disabled="isSubmitting" :aria-label="`Remove writer credit ${creditIndex + 1}`" @click="removeCreditRow(track, 'writer', creditIndex)">
                      <Trash2 class="size-4" />
                    </Button>
                  </Card>
                </div>

                <div v-else class="credit-row-stack">
                  <Card v-for="(credit, creditIndex) in track.additionalCredits" :key="`additional-credit-${track.id}-${creditIndex}`" size="sm" class="credit-row-card participant-credit-row">
                    <div class="field-row floating-field">
                      <label :for="`additional-credit-name-${track.id}-${creditIndex}`">Full name</label>
                      <Input
                        :id="`additional-credit-name-${track.id}-${creditIndex}`"
                        :model-value="credit.creditedName"
                        type="text"
                        placeholder="Full name"
                        :disabled="isSubmitting"
                        @update:model-value="updateCreditName(track, 'additional', creditIndex, $event)"
                      />
                    </div>
                    <div class="field-row field-row-full floating-field">
                      <label>Role</label>
                      <CreditRoleMultiSelect
                        :input-id="`additional-credit-role-${track.id}-${creditIndex}`"
                        :model-value="credit.roleCodes"
                        :role-groups="TRACK_ADDITIONAL_CREDIT_ROLE_GROUPS"
                        @update:model-value="updateCreditRoles(track, 'additional', creditIndex, $event)"
                      />
                    </div>
                    <Button variant="ghost" size="icon" :disabled="isSubmitting" :aria-label="`Remove additional credit ${creditIndex + 1}`" @click="removeCreditRow(track, 'additional', creditIndex)">
                      <Trash2 class="size-4" />
                    </Button>
                  </Card>
                </div>

                <div class="participant-add-row">
                  <Button variant="secondary" size="sm" :disabled="isSubmitting" @click="addCreditRow(track, track.participantSection)">
                    <Plus class="size-4" />
                    Add credit
                  </Button>
                </div>
              </div>
            </div>

            <div v-else class="track-detail-body lyrics-editor">
              <div class="field-row field-row-full">
                <label :for="`track-lyrics-${track.id}`">Lyrics</label>
                <Textarea
                  :id="`track-lyrics-${track.id}`"
                  v-model="track.lyrics"
                  rows="12"
                  placeholder="Paste the final lyrics for this track."
                  :disabled="isSubmitting"
                  @update:model-value="markTrackDetailsUnsaved(track)"
                />
              </div>
            </div>
          </Card>
        </div>

        <div class="step-actions">
          <Button variant="secondary" :disabled="isSubmitting" @click="goToPreviousUploadStep">
            <ArrowLeft class="size-4" />
            Back
          </Button>
          <Button :disabled="isSubmitting || isSavingDspProfiles" @click="goToNextUploadStep">
            Next: choose DSPs
            <ChevronRight class="size-4" />
          </Button>
        </div>
      </Card>

      <Card id="upload-stores-section" class="upload-panel upload-step-panel stores-panel">
        <div class="upload-section-header">
          <span class="upload-section-icon"><Store class="size-5" /></span>
          <div>
            <p class="eyebrow">DSP delivery</p>
            <h3>Choose stores</h3>
          </div>
        </div>

        <div class="store-step-copy">
          <strong>{{ selectedStoreSummary }}</strong>
          <span>Pick the DSPs for this release after the cover, audio, and credits are ready.</span>
        </div>

        <div class="store-toolbar">
          <Button variant="secondary" size="sm" :disabled="isSubmitting || isAllStoresSelected" @click="selectAllStores">
            Select all
          </Button>
          <Button variant="ghost" size="sm" :disabled="isSubmitting || !selectedStores.length" @click="clearStores">
            Clear
          </Button>
        </div>

        <div class="store-grid">
          <Label v-for="store in RELEASE_STORE_OPTIONS" :key="store" class="store-option" :for="storeCheckboxId(store)">
            <Checkbox
              :id="storeCheckboxId(store)"
              class="store-check"
              :model-value="selectedStores.includes(store)"
              :disabled="isSubmitting"
              @update:model-value="setStoreSelected(store, $event === true)"
            />
            <DspLogo :name="store" :label="store" size="md" />
          </Label>
        </div>

        <div class="step-actions">
          <Button variant="secondary" :disabled="isSubmitting" @click="goToPreviousUploadStep">
            <ArrowLeft class="size-4" />
            Back
          </Button>
          <Button :disabled="isSubmitting || !selectedStores.length" @click="goToNextUploadStep">
            Next: review
            <ChevronRight class="size-4" />
          </Button>
        </div>
      </Card>

      <Card id="upload-submit-section" class="upload-panel upload-step-panel submit-panel">
        <div class="upload-section-header">
          <span class="upload-section-icon"><ShieldCheck class="size-5" /></span>
          <div>
            <p class="eyebrow">Submit</p>
            <h3>Review package</h3>
          </div>
        </div>

        <div class="submit-summary">
          <div>
            <span>Audio sources</span>
            <strong>{{ totalAudioPayloadLabel }}</strong>
          </div>
          <div>
            <span>Target stores</span>
            <strong class="submit-store-logos">
              <DspLogoList :names="selectedStores" :max="6" size="xs" />
            </strong>
          </div>
          <div>
            <span>Cover art</span>
            <strong>{{ coverUploadState === "done" ? "Uploaded" : "Missing" }}</strong>
          </div>
          <div>
            <span>Readiness</span>
            <strong>{{ completionPercent }}%</strong>
          </div>
        </div>

        <div class="field-row">
          <label for="upload-notes">Notes</label>
          <Textarea id="upload-notes" v-model="form.notes" rows="4" :disabled="isSubmitting" />
        </div>

        <div class="step-actions">
          <Button variant="secondary" :disabled="isSubmitting" @click="goToPreviousUploadStep">
            <ArrowLeft class="size-4" />
            Back
          </Button>
          <Button size="lg" :disabled="isSubmitting || isUploadingAssets || completionPercent < 100" @click="submitRelease">
            <Loader2 v-if="isSubmitting" class="size-4 animate-spin" />
            <UploadCloud v-else class="size-4" />
            {{ submitLabel }}
          </Button>
        </div>
      </Card>

      <Card class="upload-panel upload-check-panel">
        <div class="upload-section-header">
          <span class="upload-section-icon"><ShieldCheck class="size-5" /></span>
          <div>
            <p class="eyebrow">Readiness</p>
            <h3>Package checks</h3>
          </div>
        </div>

        <div class="checklist">
          <div v-for="item in deliveryChecklist" :key="item.label" class="checklist-row">
            <span :class="['check-icon', { complete: item.complete }]">
              <CheckCircle2 v-if="item.complete" class="size-4" />
              <XCircle v-else class="size-4" />
            </span>
            <div>
              <strong>{{ item.label }}</strong>
              <span>{{ item.detail }}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.uploaded-page {
  --upload-accent: var(--priority);
  --upload-accent-foreground: var(--priority-foreground);
  --upload-surface: color-mix(in srgb, var(--surface-glass-strong, var(--card)) 92%, transparent);
  --upload-muted-surface: color-mix(in srgb, var(--surface-muted, var(--muted)) 54%, transparent);
}

.uploaded-page.has-spotify-preview-player {
  padding-bottom: 0;
  scroll-padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
}

.uploaded-page :deep(button:focus),
.uploaded-page :deep(a:focus),
.uploaded-page :deep(input:focus),
.uploaded-page :deep(select:focus),
.uploaded-page :deep(button:focus-visible),
.uploaded-page :deep(a:focus-visible),
.uploaded-page :deep(input:focus-visible),
.uploaded-page :deep(select:focus-visible) {
  outline: 2px solid var(--upload-accent);
  outline-offset: 2px;
  box-shadow: none;
}

.uploaded-page :deep(input[type="file"].sr-only) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
  margin: -1px;
  padding: 0;
  white-space: nowrap;
}

.upload-success {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-status-band {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  border-radius: 16px;
  background: var(--card);
  padding: 18px;
  box-shadow: var(--shadow-card);
}

@media (min-width: 860px) {
  .upload-status-band {
    grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
  }
}

.upload-status-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.upload-status-copy h2 {
  margin: 0;
  color: var(--foreground);
  font-size: clamp(24px, 3vw, 34px);
  font-weight: 760;
  line-height: 1.15;
  letter-spacing: 0;
  text-wrap: balance;
}

.upload-status-copy p:not(.eyebrow) {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 14px;
  line-height: 1.5;
}

.readiness-meter {
  display: grid;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--muted) 22%, var(--card));
  box-shadow: none;
  padding: 16px;
}

.readiness-meter span {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 720;
  text-transform: uppercase;
}

.readiness-meter strong {
  color: var(--foreground);
  font-size: 30px;
  font-weight: 780;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.readiness-progress,
.asset-upload-progress {
  position: relative;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--upload-accent) 16%, var(--muted));
  box-shadow: none;
}

.readiness-progress :deep([data-slot="progress-indicator"]),
.asset-upload-progress :deep([data-slot="progress-indicator"]) {
  background: var(--upload-accent);
  box-shadow: none;
}

.upload-step-rail {
  display: grid;
  grid-auto-columns: minmax(156px, 1fr);
  grid-auto-flow: column;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}

@media (min-width: 1180px) {
  .upload-step-rail {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    grid-auto-flow: row;
    overflow: visible;
  }
}

.upload-step {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 56px;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--muted) 16%, var(--card));
  color: var(--foreground);
  padding: 9px 10px;
  text-align: left;
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out);
}

.upload-step:hover {
  border-color: color-mix(in srgb, var(--upload-accent) 32%, var(--border));
  background: color-mix(in srgb, var(--muted) 22%, var(--card));
  box-shadow: none;
}

.upload-step.active {
  border-color: color-mix(in srgb, var(--upload-accent) 46%, var(--border));
  background: color-mix(in srgb, var(--upload-accent) 5%, var(--card));
  box-shadow: none;
}

.upload-step-index {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--foreground) 8%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--foreground) 7%, transparent);
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 680;
  font-variant-numeric: tabular-nums;
}

.upload-step.active .upload-step-index,
.upload-step.complete .upload-step-index {
  border-color: color-mix(in srgb, var(--upload-accent) 72%, transparent);
  background: var(--upload-accent);
  color: var(--upload-accent-foreground);
}

.upload-step-copy,
.upload-step-copy strong,
.upload-step-copy small {
  display: block;
  min-width: 0;
}

.upload-step-copy strong {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 680;
}

.upload-step-copy small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark .upload-step) {
  background: color-mix(in srgb, var(--card) 74%, #0a0a0a 18%);
}

:global(.dark .upload-step:hover) {
  border-color: color-mix(in srgb, var(--foreground) 14%, var(--border));
  background: color-mix(in srgb, var(--card) 84%, #0a0a0a 12%);
}

:global(.dark .upload-step.active) {
  border-color: color-mix(in srgb, var(--upload-accent) 42%, var(--border));
  background: color-mix(in srgb, var(--upload-accent) 5%, var(--card) 86%);
}

.upload-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}

@media (min-width: 1180px) {
  .upload-workspace {
    grid-template-columns: minmax(0, 1fr) minmax(300px, 360px);
  }

  .upload-check-panel {
    position: sticky;
    top: 88px;
  }
}

.upload-panel {
  display: grid;
  gap: 20px;
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  padding: 20px;
  box-shadow: var(--shadow-card);
}

.upload-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.upload-section-header h3 {
  margin: 0;
  color: var(--foreground);
  font-size: 18px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.25;
}

.upload-section-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--upload-accent) 24%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--upload-accent) 12%, transparent);
  color: var(--upload-accent);
}

.upload-form-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 720px) {
  .upload-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.field-row,
.floating-field {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.field-row label,
.floating-field label {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 680;
  line-height: 1.4;
}

.field-row-full {
  grid-column: 1 / -1;
}

.upload-static-field {
  display: flex;
  align-items: center;
  min-height: 42px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 34%, transparent);
  color: var(--foreground);
  padding: 9px 12px;
  font-size: 15px;
  font-weight: 650;
  line-height: 1.35;
}

.cover-step-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}

@media (min-width: 860px) {
  .cover-step-layout {
    grid-template-columns: minmax(220px, 300px) minmax(0, 1fr);
  }
}

.cover-uploader {
  display: grid;
  gap: 12px;
  align-content: start;
}

.cover-preview {
  position: relative;
  aspect-ratio: 1;
  width: 100%;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--muted) 72%, var(--background));
}

.cover-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.cover-placeholder {
  display: grid;
  height: 100%;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
}

.step-note-panel,
.store-step-copy,
.metadata-rules {
  display: grid;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 12px;
  background: var(--upload-muted-surface);
  padding: 16px;
}

.step-note-panel strong,
.store-step-copy strong {
  color: var(--foreground);
  font-size: 16px;
  font-weight: 760;
  line-height: 1.3;
}

.step-note-panel span,
.store-step-copy span,
.metadata-rules p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
  text-wrap: pretty;
}

.file-drop-zone {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 2px 12px;
  align-items: center;
  min-height: 68px;
  cursor: pointer;
  border: 1px dashed color-mix(in srgb, var(--upload-accent) 42%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--upload-accent) 8%, transparent);
  padding: 14px;
  color: var(--foreground);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background var(--duration-fast, 150ms) var(--ease-out),
    transform var(--duration-standard, 200ms) var(--ease-out);
}

.file-drop-zone:hover {
  border-color: color-mix(in srgb, var(--upload-accent) 72%, var(--border));
  background: color-mix(in srgb, var(--upload-accent) 12%, transparent);
  transform: translateY(-1px);
}

.file-drop-zone svg {
  grid-row: span 2;
  color: var(--upload-accent);
}

.file-drop-zone span,
.file-drop-zone small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-drop-zone span {
  font-size: 13px;
  font-weight: 740;
}

.file-drop-zone small {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.35;
}

.track-stack,
.credit-track-stack,
.credit-row-stack {
  display: grid;
  gap: 12px;
}

.track-stack-header,
.credit-track-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.track-stack-header p {
  max-width: 620px;
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
}

.track-row-upload,
.credit-track-shell {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 12px;
  background: color-mix(in srgb, var(--background) 34%, transparent);
  padding: 14px;
}

.credit-track-shell {
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

@media (min-width: 760px) {
  .track-row-upload {
    grid-template-columns: 34px minmax(0, 1fr) auto;
  }
}

.track-number {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--upload-accent) 15%, transparent);
  color: var(--upload-accent);
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.track-fields {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.track-actions {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

@media (min-width: 760px) {
  .track-actions {
    grid-column: auto;
    flex-direction: column;
    align-items: flex-end;
  }
}

.audio-file-meta,
.asset-upload-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
  flex-wrap: wrap;
}

.audio-upload-progress {
  flex: 1 0 100%;
}

.track-detail-save-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-glass, var(--card)) 72%, transparent);
  color: var(--muted-foreground);
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 780;
  line-height: 1;
  text-transform: capitalize;
}

.cover-preview .asset-state-badge {
  position: absolute;
  top: 10px;
  right: 10px;
}

.track-detail-save-state {
  border-color: color-mix(in srgb, var(--status-success) 38%, transparent);
  background: color-mix(in srgb, var(--status-success) 11%, var(--card));
  color: var(--status-success);
}

.credit-track-header strong {
  display: block;
  margin-bottom: 6px;
  color: var(--foreground);
  font-size: 17px;
  font-weight: 760;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.track-detail-tabs,
.participant-section-tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.track-detail-tabs button,
.participant-section-tabs button {
  min-height: 44px;
  min-width: max-content;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface-glass, var(--card)) 74%, transparent);
  color: color-mix(in srgb, var(--foreground) 78%, transparent);
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out);
}

.track-detail-tabs button.active,
.participant-section-tabs button.active {
  border-color: color-mix(in srgb, var(--upload-accent) 54%, var(--border));
  background: color-mix(in srgb, var(--upload-accent) 12%, transparent);
  color: var(--foreground);
}

.track-detail-body {
  display: grid;
  gap: 16px;
}

.track-ai-toggle {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 50%, transparent);
  padding: 14px;
  color: var(--foreground);
  cursor: pointer;
}

.track-ai-toggle [role="checkbox"] {
  width: 18px;
  height: 18px;
  margin-top: 2px;
  border-color: color-mix(in srgb, var(--upload-accent) 52%, var(--border));
}

:global(.dark .upload-status-band),
:global(.dark .upload-panel) {
  background: var(--card);
  box-shadow: var(--shadow-card);
}

:global(.dark .readiness-meter),
:global(.dark .cover-preview),
:global(.dark .step-note-panel),
:global(.dark .store-step-copy),
:global(.dark .metadata-rules),
:global(.dark .track-detail-tabs button),
:global(.dark .participant-section-tabs button),
:global(.dark .track-ai-toggle),
:global(.dark .store-option),
:global(.dark .submit-summary > div) {
  background: color-mix(in srgb, var(--background) 34%, transparent);
  box-shadow: none;
}

.track-ai-toggle [role="checkbox"][data-state="checked"] {
  border-color: var(--upload-accent);
  background: var(--upload-accent);
  color: var(--upload-accent-foreground);
}

.track-ai-toggle strong,
.track-ai-toggle small {
  display: block;
}

.track-ai-toggle strong {
  font-size: 13px;
  font-weight: 760;
}

.track-ai-toggle small {
  margin-top: 3px;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.participant-editor {
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}

@media (min-width: 1500px) {
  .participant-editor {
    grid-template-columns: 170px minmax(0, 1fr);
  }
}

.participant-section-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: visible;
}

.participant-section-tabs button {
  min-width: 0;
  padding-inline: 8px;
  white-space: normal;
}

@media (min-width: 1500px) {
  .participant-section-tabs {
    grid-template-columns: 1fr;
    flex-direction: column;
    overflow: visible;
  }
}

.participant-section-body {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.participant-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.participant-section-heading strong {
  color: var(--foreground);
  font-size: 15px;
  font-weight: 760;
}

.participant-help-button {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 999px;
  background: var(--muted);
  color: var(--muted-foreground);
}

.participant-note {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.5;
}

.credit-row-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  padding-bottom: 12px;
}

.credit-row-card:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

@media (min-width: 1120px) {
  .credit-row-card {
    grid-template-columns: minmax(180px, 0.85fr) minmax(240px, 1.15fr) auto;
  }
}

.participant-add-row,
.participant-reset-row {
  display: flex;
  justify-content: flex-start;
}

.dsp-preference-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  padding-top: 12px;
}

.dsp-preference-actions span {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.4;
}

.lyrics-editor :deep(textarea) {
  min-height: 260px;
  resize: vertical;
}

.store-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.store-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: 1fr;
}

@media (min-width: 680px) {
  .store-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1040px) {
  .store-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.store-option {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-height: 46px;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 84%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-glass, var(--card)) 74%, transparent);
  padding: 10px 12px;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 700;
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background var(--duration-fast, 150ms) var(--ease-out);
}

.store-option:hover,
.store-option:has([role="checkbox"][data-state="checked"]) {
  border-color: color-mix(in srgb, var(--upload-accent) 52%, var(--border));
  background: color-mix(in srgb, var(--upload-accent) 10%, transparent);
}

.store-check {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: transparent;
}

.store-check[data-state="checked"] {
  border-color: var(--upload-accent);
  background: var(--upload-accent);
  color: var(--upload-accent-foreground);
}

.submit-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.submit-summary > div {
  display: grid;
  gap: 3px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 50%, transparent);
  padding: 12px;
}

.submit-summary span {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.submit-summary strong {
  color: var(--foreground);
  font-size: 17px;
  font-weight: 760;
  line-height: 1.25;
}

.submit-store-logos {
  display: flex;
  min-width: 0;
}

.checklist {
  display: grid;
  gap: 0;
}

.checklist-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  padding: 10px 0;
}

.checklist-row:first-child {
  padding-top: 0;
}

.checklist-row:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.check-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  background: var(--muted);
  color: var(--muted-foreground);
}

.check-icon.complete {
  background: color-mix(in srgb, var(--status-success) 13%, transparent);
  color: var(--status-success);
}

.checklist-row strong,
.checklist-row span {
  display: block;
  min-width: 0;
}

.checklist-row strong {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 760;
}

.checklist-row span {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.4;
}

.step-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid color-mix(in srgb, var(--border) 74%, transparent);
  padding-top: 16px;
  flex-wrap: wrap;
}

.step-action-copy {
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.45;
}

.error-text {
  color: var(--destructive);
}

.success-text {
  color: var(--status-success);
}

.upload-status-band,
.upload-step-rail,
.legacy-asset-panel {
  display: none;
}

.metadata-panel .step-actions,
.credits-panel .step-actions,
.stores-panel .step-actions,
.submit-panel .step-actions > :first-child {
  display: none;
}

.uploader-story-shell {
  position: relative;
  display: block;
  height: clamp(600px, calc(100dvh - var(--topbar-height, 64px) - 48px), 900px);
  min-height: 0;
}

.uploader-scroll-stage {
  position: relative;
  min-width: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: 8px;
  background: #080808;
  scroll-behavior: smooth;
  scroll-snap-type: y mandatory;
  scrollbar-width: none;
}

.uploader-scroll-stage::-webkit-scrollbar {
  display: none;
}

.uploader-story-section {
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  scroll-snap-align: start;
  scroll-snap-stop: always;
}

.spotify-story-page {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  background: #080808;
}

.spotify-page-header {
  padding-bottom: 0;
}

.spotify-page-header :deep(.page-header-title) {
  color: #fff;
}

.spotify-page-header :deep(.page-header-eyebrow),
.spotify-page-header :deep(.page-header-description) {
  color: rgb(255 255 255 / 68%);
}

.uploader-scroll-nav {
  --scroll-map-accent: #ffd23f;
  position: absolute;
  top: 50%;
  right: -30px;
  z-index: 5;
  display: grid;
  width: 24px;
  height: min(220px, calc(100% - 96px));
  min-height: 150px;
  grid-template-rows: 24px minmax(0, 1fr);
  justify-items: center;
  pointer-events: none;
  transform: translateY(-50%);
}

.uploader-scroll-action {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgb(255 210 63 / 86%);
  cursor: pointer;
  pointer-events: auto;
  padding: 0;
  transition: background-color 160ms ease, color 160ms ease, transform 160ms ease;
}

.uploader-scroll-action:hover {
  background: rgb(255 210 63 / 9%);
  color: var(--scroll-map-accent);
  transform: translateY(-1px);
}

.uploader-section-map {
  position: relative;
  width: 18px;
  height: calc(100% - 8px);
  margin-top: 8px;
  pointer-events: auto;
}

.uploader-section-map::before,
.uploader-section-map::after {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 50%;
  width: 2px;
  border-radius: 999px;
  content: "";
  transform: translateX(-50%);
}

.uploader-section-map::before {
  background: rgb(255 210 63 / 22%);
}

.uploader-section-map::after {
  background: rgb(255 210 63 / 76%);
  transform: translateX(-50%) scaleY(var(--uploader-scroll-ratio, 0));
  transform-origin: top;
}

.uploader-map-marker {
  position: absolute;
  z-index: 1;
  top: var(--uploader-marker-position);
  left: 50%;
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  padding: 0;
  transform: translate(-50%, -50%);
}

.uploader-map-marker span {
  width: 6px;
  height: 6px;
  border: 0;
  border-radius: inherit;
  background: rgb(255 210 63 / 52%);
  transition: width 170ms ease, height 170ms ease, background-color 170ms ease, box-shadow 170ms ease;
}

.uploader-map-marker:hover span,
.uploader-map-marker.active span {
  width: 9px;
  height: 9px;
  background: rgb(255 210 63 / 92%);
  box-shadow: 0 0 12px rgb(255 210 63 / 22%);
}

.spotify-upload-shell {
  display: grid;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, #ffffff 9%, transparent);
  border-radius: 8px;
  background: #121212;
  color: #fff;
  box-shadow: 0 18px 60px rgb(0 0 0 / 32%);
}

.spotify-upload-main {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto auto;
  min-height: 0;
  overflow: visible;
  overscroll-behavior: contain;
  background: #121212;
}

.spotify-release-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  align-items: end;
  min-height: 290px;
  padding: 36px 28px 28px;
  background:
    linear-gradient(180deg, rgb(139 139 139 / 88%) 0%, rgb(75 75 75 / 84%) 56%, rgb(34 34 34 / 98%) 100%),
    #535353;
}

.spotify-cover-card {
  position: relative;
  display: grid;
  aspect-ratio: 1;
  width: min(232px, 100%);
  overflow: hidden;
  cursor: pointer;
  border-radius: 4px;
  background: #242424;
  box-shadow: 0 18px 48px rgb(0 0 0 / 48%);
}

.spotify-cover-card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.spotify-cover-placeholder {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: rgb(255 255 255 / 72%);
  font-size: 13px;
  font-weight: 760;
}

.spotify-cover-action {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  background: rgb(0 0 0 / 70%);
  color: #fff;
  font-size: 13px;
  font-weight: 760;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 160ms ease-out,
    transform 160ms ease-out;
}

.spotify-cover-card:hover .spotify-cover-action,
.spotify-cover-card:focus-within .spotify-cover-action {
  opacity: 1;
  transform: translateY(0);
}

.spotify-cover-status {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgb(0 0 0 / 72%);
  color: #fff;
}

.spotify-release-copy {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.spotify-release-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: #fff;
  font-size: 13px;
  font-weight: 780;
}

.spotify-release-kicker > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotify-release-type-select {
  width: 128px;
}

.spotify-release-type-select :deep([data-slot="native-select"]),
.spotify-version-select :deep([data-slot="native-select"]) {
  border-color: rgb(255 255 255 / 16%);
  background: rgb(0 0 0 / 26%);
  color: #fff;
  box-shadow: none;
}

.spotify-release-title-input {
  height: auto;
  min-height: 78px;
  border: 0;
  background: transparent;
  color: #fff;
  box-shadow: none;
  padding: 0;
  font-size: clamp(42px, 7vw, 82px);
  font-weight: 900;
  line-height: 0.98;
  letter-spacing: 0;
}

.spotify-release-title-input:hover,
.spotify-release-title-input:focus {
  background: rgb(0 0 0 / 12%);
}

.spotify-release-title-input::placeholder {
  color: rgb(255 255 255 / 62%);
}

.spotify-release-meta {
  margin: 0;
  color: rgb(255 255 255 / 78%);
  font-size: 14px;
  font-weight: 680;
  line-height: 1.45;
}

.spotify-release-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  min-width: 0;
}

.spotify-release-date-button {
  display: inline-flex;
  height: auto;
  min-height: 42px;
  max-width: 100%;
  align-items: center;
  gap: 9px;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 999px;
  background: rgb(0 0 0 / 24%);
  color: #fff;
  padding: 6px 12px 6px 10px;
}

.spotify-release-date-button:hover {
  border-color: rgb(255 255 255 / 26%);
  background: rgb(255 255 255 / 8%);
}

.spotify-release-date-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
  text-align: left;
}

.spotify-release-date-copy > span {
  overflow: hidden;
  color: rgb(255 255 255 / 55%);
  font-size: 10px;
  font-weight: 780;
  line-height: 1.1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.spotify-release-date-copy > strong {
  overflow: hidden;
  color: #fff;
  font-size: 13px;
  font-weight: 760;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotify-release-date-popover {
  width: min(420px, calc(100vw - 32px));
  border-color: rgb(255 255 255 / 14%);
  background: rgb(18 18 18 / 98%);
  padding: 6px;
  color: #fff;
  box-shadow: 0 24px 64px rgb(0 0 0 / 52%);
}

.spotify-release-calendar {
  width: 100%;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.spotify-release-calendar :deep([data-disabled]),
.spotify-release-calendar :deep([data-unavailable]) {
  opacity: 0.22;
}

.spotify-control-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 86px;
  padding: 20px 28px;
  background: linear-gradient(180deg, rgb(35 35 35 / 96%) 0%, #121212 100%);
}

.spotify-play-button {
  width: 56px;
  height: 56px;
  border: 0;
  border-radius: 999px;
  background: #1ed760;
  color: #000;
  box-shadow: none;
}

.spotify-play-button:hover {
  background: #1fdf64;
  transform: scale(1.035);
}

.spotify-play-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
  transform: none;
}

.spotify-icon-button {
  color: rgb(255 255 255 / 72%);
}

.spotify-icon-button:hover,
.spotify-track-menu-button:hover {
  color: #fff;
  background: rgb(255 255 255 / 8%);
}

.spotify-icon-button label {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  cursor: pointer;
}

.spotify-list-mode {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  color: rgb(255 255 255 / 66%);
  font-size: 13px;
  font-weight: 700;
}

.spotify-track-table {
  align-self: stretch;
  display: grid;
  gap: 2px;
  height: 100%;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  padding: 0 28px 10px;
  overscroll-behavior: contain;
  background: #121212;
  scrollbar-color: rgb(255 255 255 / 22%) transparent;
  scrollbar-width: thin;
}

.spotify-track-table::-webkit-scrollbar {
  width: 10px;
}

.spotify-track-table::-webkit-scrollbar-track {
  background: transparent;
}

.spotify-track-table::-webkit-scrollbar-thumb {
  border: 3px solid #121212;
  border-radius: 999px;
  background: rgb(255 255 255 / 22%);
}

.spotify-track-head,
.spotify-track-row {
  display: grid;
  grid-template-columns: 36px minmax(220px, 1.4fr) minmax(170px, 0.8fr) minmax(150px, 0.6fr) minmax(112px, 0.44fr) 42px;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.spotify-track-head {
  position: sticky;
  top: 0;
  z-index: 2;
  min-height: 38px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  background: #121212;
  color: rgb(255 255 255 / 58%);
  font-size: 13px;
  font-weight: 680;
}

.spotify-track-time {
  display: flex;
  justify-content: center;
}

.spotify-track-row {
  position: relative;
  min-height: 68px;
  border-radius: 4px;
  color: #fff;
  padding: 7px 0;
}

.spotify-track-row:hover {
  background: rgb(255 255 255 / 7%);
}

.spotify-track-row.is-preview-active {
  background: rgb(255 255 255 / 5%);
}

.spotify-track-index {
  position: relative;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  justify-self: center;
  color: rgb(255 255 255 / 56%);
  font-size: 15px;
  font-variant-numeric: tabular-nums;
}

.spotify-track-number {
  transition: opacity 140ms ease;
}

.spotify-track-play-toggle {
  position: absolute;
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  opacity: 0;
  padding: 0;
  transform: scale(0.92);
  transition: color 140ms ease, opacity 140ms ease, transform 140ms ease;
}

.spotify-track-play-toggle:hover {
  color: #1ed760;
  transform: scale(1);
}

.spotify-track-row:hover .spotify-track-index.has-preview .spotify-track-number,
.spotify-track-index.is-playing .spotify-track-number {
  opacity: 0;
}

.spotify-track-row:hover .spotify-track-play-toggle,
.spotify-track-index.is-playing .spotify-track-play-toggle {
  opacity: 1;
  transform: scale(1);
}

.spotify-track-index.is-playing .spotify-track-play-toggle {
  color: #1ed760;
}

.spotify-track-title-cell {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.spotify-track-title-editor {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: min(380px, 100%);
  border-radius: 6px;
}

.spotify-track-title-editor::after {
  position: absolute;
  right: 9px;
  bottom: 3px;
  left: 9px;
  height: 2px;
  border-radius: 999px;
  background: #1ed760;
  content: "";
  opacity: 0;
  transform: scaleX(0.68);
  transform-origin: left;
  transition: opacity 160ms ease, transform 160ms ease;
}

.spotify-track-title-editor:hover::after,
.spotify-track-title-editor:focus-within::after {
  opacity: 1;
  transform: scaleX(1);
}

.spotify-track-title-input {
  height: 34px;
  border: 1px solid rgb(255 255 255 / 0%);
  border-radius: 6px;
  background: rgb(255 255 255 / 5%);
  color: #fff;
  box-shadow: none;
  padding: 0 34px 0 10px;
  font-size: 15px;
  font-weight: 760;
}

.spotify-track-title-input:hover,
.spotify-track-title-input:focus {
  border-color: rgb(255 255 255 / 15%);
  background: rgb(255 255 255 / 9%);
}

.spotify-track-title-input::placeholder {
  color: rgb(255 255 255 / 56%);
}

.spotify-track-edit-icon {
  position: absolute;
  right: 10px;
  color: rgb(255 255 255 / 44%);
  pointer-events: none;
  transition: color 160ms ease, opacity 160ms ease;
}

.spotify-track-title-editor:hover .spotify-track-edit-icon,
.spotify-track-title-editor:focus-within .spotify-track-edit-icon {
  color: rgb(255 255 255 / 76%);
}

.spotify-main-artist-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.spotify-main-artist-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 68%);
  padding: 3px 7px;
  font-size: 12px;
  font-weight: 680;
  line-height: 1;
}

.spotify-main-artist-chip-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotify-main-artist-remove {
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgb(255 255 255 / 52%);
  cursor: pointer;
  padding: 0;
}

.spotify-main-artist-remove:hover {
  color: #fff;
  background: rgb(255 255 255 / 12%);
}

.spotify-main-artist-add {
  width: 24px;
  height: 24px;
  min-width: 24px;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 999px;
  background: rgb(255 255 255 / 4%);
  color: rgb(255 255 255 / 62%);
}

.spotify-main-artist-add:hover {
  border-color: rgb(30 215 96 / 48%);
  background: rgb(30 215 96 / 13%);
  color: #1ed760;
}

.spotify-main-artist-popover {
  width: min(310px, calc(100vw - 32px));
  border-color: rgb(255 255 255 / 14%);
  background: rgb(18 18 18 / 98%);
  padding: 12px;
  box-shadow: 0 18px 48px rgb(0 0 0 / 44%);
}

.spotify-main-artist-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.spotify-main-artist-input {
  height: 38px;
  border-color: rgb(255 255 255 / 14%);
  border-radius: 999px;
  background: rgb(255 255 255 / 8%);
  color: #fff;
}

.spotify-main-artist-submit {
  height: 38px;
  border-radius: 999px;
  background: #1ed760;
  color: #000;
  font-weight: 780;
}

.spotify-audio-cell {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.spotify-audio-upload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  min-height: 34px;
  cursor: pointer;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 999px;
  background: rgb(255 255 255 / 7%);
  color: #fff;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 780;
}

.spotify-audio-upload span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotify-audio-upload:hover {
  border-color: rgb(255 255 255 / 32%);
  background: rgb(255 255 255 / 11%);
}

.spotify-audio-preview {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  min-height: 34px;
  border: 1px solid rgb(255 255 255 / 11%);
  border-radius: 999px;
  background: rgb(255 255 255 / 5%);
  padding: 3px 4px 3px 5px;
}

.spotify-audio-preview.playing {
  border-color: rgb(30 215 96 / 34%);
  background: rgb(30 215 96 / 9%);
}

.spotify-audio-preview-button {
  display: inline-flex;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #000;
  cursor: pointer;
  padding: 0;
  transition: background-color 140ms ease, transform 140ms ease;
}

.spotify-audio-preview-button:hover {
  background: #1ed760;
  transform: scale(1.04);
}

.spotify-audio-preview-copy {
  min-width: 0;
  max-width: min(170px, 34vw);
  overflow: hidden;
  color: rgb(255 255 255 / 82%);
  font-size: 12px;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotify-audio-replace {
  flex: 0 0 auto;
  cursor: pointer;
  border-radius: 999px;
  color: rgb(255 255 255 / 52%);
  padding: 3px 7px;
  font-size: 11px;
  font-weight: 760;
  transition: background-color 140ms ease, color 140ms ease;
}

.spotify-audio-replace:hover {
  background: rgb(255 255 255 / 10%);
  color: #fff;
}

.spotify-track-progress {
  height: 4px;
  max-width: 180px;
  background: rgb(255 255 255 / 12%);
}

.spotify-track-progress :deep([data-slot="progress-indicator"]) {
  background: #1ed760;
}

.spotify-version-select {
  max-width: 170px;
}

.spotify-track-status {
  justify-self: start;
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 7%);
  color: #fff;
  text-transform: capitalize;
}

.spotify-track-menu-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
}

.spotify-track-menu-button {
  color: rgb(255 255 255 / 62%);
}

.spotify-track-duration {
  color: rgb(255 255 255 / 56%);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
}

.spotify-track-error {
  grid-column: 2 / -1;
  margin: -2px 0 6px;
  color: #ff9b9b;
  font-size: 12px;
  line-height: 1.35;
}

.spotify-add-track-row {
  display: grid;
  grid-template-columns: 36px minmax(220px, 1.4fr) minmax(170px, 0.8fr) minmax(150px, 0.6fr) minmax(112px, 0.44fr) 42px;
  gap: 12px;
  align-items: center;
  min-height: 42px;
  margin: 4px 28px 0;
  cursor: pointer;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #fff;
  padding: 4px 0;
  text-align: left;
  transition: background-color 160ms ease, color 160ms ease;
}

.spotify-add-track-row:hover {
  background: rgb(255 255 255 / 7%);
}

.spotify-add-track-row:focus-visible {
  outline: 1px solid rgb(30 215 96 / 72%);
  outline-offset: -1px;
}

.spotify-add-track-row:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.spotify-add-track-index {
  display: flex;
  align-items: center;
  justify-self: center;
  justify-content: center;
  color: rgb(255 255 255 / 48%);
  transition: color 160ms ease;
}

.spotify-add-track-copy {
  display: flex;
  align-items: center;
  min-width: 0;
}

.spotify-add-track-copy strong {
  overflow: hidden;
  color: rgb(255 255 255 / 64%);
  font-size: 14px;
  font-weight: 720;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 160ms ease;
}

.spotify-add-track-row:hover .spotify-add-track-index,
.spotify-add-track-row:hover .spotify-add-track-copy strong {
  color: #fff;
}

.spotify-release-footnote {
  display: grid;
  gap: 4px;
  padding: 0 28px 28px;
  color: rgb(255 255 255 / 62%);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.35;
}

.meta-music-page {
  display: grid;
  min-height: 100%;
  place-items: center;
  overflow: hidden;
  padding: clamp(18px, 4dvh, 42px) clamp(18px, 5vw, 64px);
  background:
    linear-gradient(180deg, #0f1317 0%, #0a0c0f 100%);
}

.meta-music-phone {
  position: relative;
  isolation: isolate;
  display: grid;
  width: min(620px, 100%);
  height: auto;
  aspect-ratio: auto;
  min-height: 0;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: #fff;
  box-shadow: none;
}

.meta-story-background,
.meta-story-overlay {
  display: none;
}

.meta-story-background span {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 24% 21%, rgb(255 255 255 / 12%), transparent 28%),
    linear-gradient(180deg, #4b5962 0%, #344554 48%, #28323d 100%);
}

.meta-story-overlay {
  z-index: 1;
  background:
    linear-gradient(180deg, rgb(31 39 48 / 24%) 0%, rgb(42 54 66 / 8%) 42%, rgb(35 43 52 / 26%) 100%),
    repeating-linear-gradient(90deg, rgb(255 255 255 / 1.6%) 0 1px, transparent 1px 3px);
}

.meta-story-top,
.meta-story-canvas,
.meta-story-bottom {
  position: relative;
  z-index: 1;
}

.meta-story-top {
  display: none;
  grid-template-columns: minmax(0, 1fr) 44px 44px auto;
  gap: 13px;
  align-items: center;
  padding: 18px 22px 0;
}

.meta-story-cover-button {
  display: grid;
  width: 44px;
  height: 44px;
  grid-column: 2;
  place-items: center;
  overflow: hidden;
  border: 2px solid rgb(255 255 255 / 86%);
  border-radius: 12px;
  background: rgb(255 255 255 / 10%);
  color: #fff;
  padding: 0;
  box-shadow: 0 10px 22px rgb(0 0 0 / 18%);
}

.meta-color-wheel {
  display: grid;
  width: 44px;
  height: 44px;
  grid-column: 3;
  place-items: center;
  border: 2px solid rgb(255 255 255 / 86%);
  border-radius: 999px;
  background: conic-gradient(#ff005d, #ffb800, #12d871, #00a6ff, #7a35ff, #ff005d);
  padding: 0;
  box-shadow: 0 10px 22px rgb(0 0 0 / 16%);
}

.meta-color-wheel span {
  width: 32px;
  height: 32px;
  border-radius: inherit;
  background: conic-gradient(#ff005d, #ffb800, #12d871, #00a6ff, #7a35ff, #ff005d);
}

.meta-done-button {
  justify-self: end;
  border: 0;
  background: transparent;
  color: #fff;
  padding: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0;
  text-shadow: 0 1px 0 rgb(0 0 0 / 42%);
}

.meta-story-canvas {
  display: none;
  min-height: 0;
  place-items: center;
  padding: 22px 28px 0;
}

.meta-sticker-stage {
  display: grid;
  justify-items: center;
  gap: 22px;
  width: 100%;
  transform: translateY(4px);
}

.meta-music-sticker-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  width: min(258px, 86%);
  min-height: 56px;
  border-radius: 999px;
  background: #fff;
  color: #0f0f0f;
  padding: 6px 18px 6px 6px;
  box-shadow: 0 18px 38px rgb(0 0 0 / 22%);
  animation: metaStickerPop 420ms cubic-bezier(0.2, 1.25, 0.22, 1);
}

.meta-sticker-cover {
  position: relative;
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  overflow: hidden;
  border-radius: 999px;
  background: #f1f1f1;
  color: #111;
}

.meta-sticker-cover::after {
  content: none;
}

.meta-sticker-bars {
  position: absolute;
  right: -4px;
  bottom: 9px;
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.meta-sticker-bars i {
  width: 3px;
  height: 12px;
  border-radius: 999px;
  background: #111;
  animation: metaStickerBar 820ms ease-in-out infinite;
  animation-play-state: paused;
}

.meta-sticker-bars i:nth-child(2) {
  height: 19px;
  animation-delay: 120ms;
}

.meta-sticker-bars i:nth-child(3) {
  height: 10px;
  animation-delay: 240ms;
}

.meta-music-phone.is-playing .meta-sticker-bars i {
  animation-play-state: running;
}

.meta-sticker-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.meta-sticker-copy strong,
.meta-sticker-copy span,
.meta-minimal-copy {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-sticker-copy strong {
  font-size: 16px;
  font-weight: 850;
}

.meta-sticker-copy span {
  display: none;
  font-size: 17px;
  font-weight: 500;
}

.meta-music-sticker-minimal {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  max-width: 82%;
  border-radius: 999px;
  background: #fff;
  color: #111;
  padding: 8px 16px 8px 8px;
  box-shadow: 0 18px 38px rgb(0 0 0 / 22%);
  animation: metaStickerPop 420ms cubic-bezier(0.2, 1.25, 0.22, 1);
}

.meta-minimal-disc {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  overflow: hidden;
  border-radius: 999px;
  background: #f1f1f1;
}

.meta-minimal-copy {
  max-width: 190px;
  font-size: 16px;
  font-weight: 780;
}

.meta-style-toggle {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 999px;
  background: rgb(0 0 0 / 16%);
  padding: 5px;
  box-shadow: 0 12px 28px rgb(0 0 0 / 16%);
}

.meta-style-toggle button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #fff;
  padding: 0;
  opacity: 0.74;
  transition: background-color 160ms ease, opacity 160ms ease;
}

.meta-style-toggle button.active {
  background: #fff;
  opacity: 1;
}

.meta-style-card-icon,
.meta-style-minimal-icon {
  position: relative;
  display: block;
}

.meta-style-card-icon {
  width: 22px;
  height: 16px;
  border-radius: 4px;
  background: #ff006e;
}

.meta-style-card-icon::after {
  position: absolute;
  right: 5px;
  top: 4px;
  width: 4px;
  height: 8px;
  border-radius: 999px;
  background: #fff;
  content: "";
}

.meta-style-minimal-icon {
  width: 17px;
  height: 23px;
  border-bottom: 4px solid currentColor;
}

.meta-style-minimal-icon::before,
.meta-style-minimal-icon::after {
  position: absolute;
  right: 0;
  left: 0;
  height: 8px;
  border-radius: 3px;
  background: currentColor;
  content: "";
}

.meta-style-minimal-icon::before {
  top: 0;
}

.meta-style-minimal-icon::after {
  bottom: 7px;
}

.meta-style-toggle button.active .meta-style-minimal-icon {
  color: #111;
}

.meta-story-bottom {
  align-self: center;
  display: grid;
  gap: 0;
  padding: 0;
}

.meta-track-strip {
  display: none;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.meta-track-strip::-webkit-scrollbar {
  display: none;
}

.meta-track-chip {
  max-width: 160px;
  flex: 0 0 auto;
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 999px;
  background: rgb(255 255 255 / 13%);
  color: rgb(255 255 255 / 78%);
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 740;
}

.meta-track-chip span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-track-chip.active {
  border-color: rgb(255 255 255 / 76%);
  background: #fff;
  color: #111;
}

.meta-track-chip:disabled {
  opacity: 0.45;
}

.meta-clip-controls {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 88px 42px;
  gap: 14px;
  align-items: center;
  width: min(720px, calc(100vw - 72px));
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 12px;
  background: rgb(255 255 255 / 3.8%);
  padding: 10px 12px;
  box-shadow: 0 18px 54px rgb(0 0 0 / 24%);
}

.meta-clip-duration,
.meta-story-play {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 999px;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 82%);
  box-shadow: none;
}

.meta-clip-duration {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgb(255 255 255 / 14%);
  font-size: 12px;
  font-weight: 760;
  font-variant-numeric: tabular-nums;
}

.meta-clip-duration::after {
  content: "s";
  margin-left: 1px;
  color: rgb(255 255 255 / 50%);
  font-size: 10px;
  font-weight: 700;
}

.meta-story-play {
  border: 1px solid rgb(255 255 255 / 10%);
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.meta-story-play svg {
  display: none;
}

.meta-story-play::before {
  width: 0;
  height: 0;
  margin-left: 2px;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 10px solid rgb(255 255 255 / 82%);
  content: "";
}

.meta-story-play:not(:disabled):hover {
  border-color: rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 9%);
  transform: scale(1.04);
}

.meta-music-phone.is-playing .meta-story-play {
  border-color: rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 10%);
}

.meta-music-phone.is-playing .meta-story-play::before {
  width: 11px;
  height: 14px;
  margin-left: 0;
  border-top: 0;
  border-bottom: 0;
  border-left: 3px solid rgb(255 255 255 / 82%);
  border-right: 3px solid rgb(255 255 255 / 82%);
}

.meta-story-play:disabled {
  opacity: 0.5;
}

.meta-time-field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.meta-time-field span {
  overflow: hidden;
  color: rgb(255 255 255 / 48%);
  font-size: 9px;
  font-weight: 760;
  letter-spacing: 0.06em;
  line-height: 1;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.meta-time-input {
  height: 34px;
  min-height: 34px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(0 0 0 / 22%);
  color: rgb(255 255 255 / 88%);
  padding: 0 9px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-weight: 720;
  text-align: center;
  box-shadow: none;
}

.meta-time-input:hover,
.meta-time-input:focus {
  border-color: rgb(255 255 255 / 18%);
  background: rgb(0 0 0 / 28%);
}

.meta-mini-progress {
  display: none;
  align-items: center;
  gap: 8px;
}

.meta-mini-progress::before,
.meta-mini-progress::after {
  height: 3px;
  flex: 1;
  border-radius: 999px;
  background: rgb(255 255 255 / 28%);
  content: "";
}

.meta-mini-progress span {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #ff006e;
  animation: metaDotPulse 1.4s ease-in-out infinite;
}

.meta-mini-progress span:nth-child(2) {
  animation-delay: 120ms;
}

.meta-mini-progress span:nth-child(3) {
  animation-delay: 240ms;
}

.meta-waveform-editor {
  position: relative;
  height: 70px;
  overflow: hidden;
  border-radius: 10px;
  background:
    repeating-linear-gradient(90deg, rgb(255 255 255 / 1.8%) 0 1px, transparent 1px 7px),
    rgb(18 24 29 / 52%);
  touch-action: pan-y;
  cursor: grab;
  user-select: none;
}

.meta-waveform-editor.is-dragging {
  cursor: grabbing;
}

.meta-waveform-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
}

.meta-waveform-range {
  position: absolute;
  z-index: 2;
  inset: 0;
  width: 100%;
  opacity: 0;
  pointer-events: none;
}

@keyframes metaStickerPop {
  0% {
    opacity: 0;
    transform: translateY(10px) scale(0.92);
  }

  72% {
    opacity: 1;
    transform: translateY(-2px) scale(1.035);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes metaStickerBar {
  0%,
  100% {
    transform: scaleY(0.62);
  }

  50% {
    transform: scaleY(1.16);
  }
}

@keyframes metaDotPulse {
  0%,
  100% {
    opacity: 0.62;
    transform: scale(0.86);
  }

  50% {
    opacity: 1;
    transform: scale(1.08);
  }
}

.spotify-preview-player {
  position: fixed;
  z-index: 1000;
  right: 0;
  bottom: 0;
  left: 0;
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(360px, 1.25fr) minmax(180px, 1fr);
  gap: 18px;
  align-items: center;
  min-height: 82px;
  border-top: 1px solid rgb(255 255 255 / 9%);
  background: #000;
  color: #fff;
  width: 100vw;
  max-width: none;
  margin: 0;
  border-radius: 0;
  padding: 10px 18px calc(10px + env(safe-area-inset-bottom, 0px));
  box-shadow: 0 -18px 42px rgb(0 0 0 / 42%);
  transform: translateZ(0);
}

:global(.spotify-preview-player--overlay) {
  position: fixed !important;
  inset: auto 0 0 0 !important;
  z-index: 1000;
  width: 100vw;
}

.spotify-preview-player.empty {
  color: rgb(255 255 255 / 72%);
}

.spotify-preview-now,
.spotify-preview-tools,
.spotify-preview-controls,
.spotify-preview-timeline {
  display: flex;
  align-items: center;
  min-width: 0;
}

.spotify-preview-now {
  gap: 12px;
}

.spotify-preview-cover {
  width: 54px;
  height: 54px;
  flex: 0 0 54px;
  border-radius: 2px;
  object-fit: cover;
  box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
}

.spotify-preview-cover-empty {
  display: inline-grid;
  place-items: center;
  background: linear-gradient(135deg, rgb(255 255 255 / 16%), rgb(255 255 255 / 5%));
  color: rgb(255 255 255 / 62%);
}

.spotify-preview-now-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.spotify-preview-now-copy strong,
.spotify-preview-now-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotify-preview-now-copy strong {
  font-size: 13px;
  font-weight: 760;
}

.spotify-preview-now-copy span {
  color: rgb(255 255 255 / 62%);
  font-size: 12px;
  font-weight: 620;
}

.spotify-preview-center {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.spotify-preview-controls {
  justify-content: center;
  gap: 12px;
}

.spotify-preview-icon {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  color: rgb(255 255 255 / 62%);
}

.spotify-preview-icon:hover,
.spotify-preview-icon.active {
  color: #1ed760;
  background: transparent;
}

.spotify-preview-icon:disabled {
  opacity: 0.3;
}

.spotify-preview-play {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #000;
  transition: background-color 140ms ease, transform 140ms ease;
}

.spotify-preview-play:hover {
  background: #1ed760;
  transform: scale(1.05);
}

.spotify-preview-play:disabled {
  cursor: not-allowed;
  background: rgb(255 255 255 / 42%);
  color: rgb(0 0 0 / 70%);
  transform: none;
}

.spotify-preview-timeline {
  gap: 8px;
}

.spotify-preview-timeline span {
  width: 38px;
  flex: 0 0 38px;
  color: rgb(255 255 255 / 58%);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 640;
  text-align: center;
}

.spotify-preview-range,
.spotify-preview-volume {
  width: 100%;
  height: 4px;
  cursor: pointer;
  appearance: none;
  border-radius: 999px;
  background: linear-gradient(to right, #fff var(--range-progress, 0%), rgb(255 255 255 / 22%) var(--range-progress, 0%));
  outline: 0;
}

.spotify-preview-range:hover,
.spotify-preview-volume:hover {
  background: linear-gradient(to right, #1ed760 var(--range-progress, 0%), rgb(255 255 255 / 28%) var(--range-progress, 0%));
}

.spotify-preview-range:disabled {
  cursor: default;
  opacity: 0.42;
}

.spotify-preview-volume:disabled {
  cursor: default;
  opacity: 0.35;
}

.spotify-preview-range::-webkit-slider-thumb,
.spotify-preview-volume::-webkit-slider-thumb {
  width: 12px;
  height: 12px;
  appearance: none;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 34%);
  opacity: 0;
  transition: opacity 140ms ease;
}

.spotify-preview-range::-moz-range-thumb,
.spotify-preview-volume::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 34%);
  opacity: 0;
  transition: opacity 140ms ease;
}

.spotify-preview-timeline:hover .spotify-preview-range::-webkit-slider-thumb,
.spotify-preview-tools:hover .spotify-preview-volume::-webkit-slider-thumb,
.spotify-preview-timeline:hover .spotify-preview-range::-moz-range-thumb,
.spotify-preview-tools:hover .spotify-preview-volume::-moz-range-thumb {
  opacity: 1;
}

.spotify-preview-tools {
  justify-content: flex-end;
  gap: 8px;
  color: rgb(255 255 255 / 68%);
}

.spotify-preview-volume {
  max-width: 112px;
}

.spotify-action-menu label {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  cursor: pointer;
}

@media (min-width: 820px) {
  .spotify-release-hero {
    grid-template-columns: 232px minmax(0, 1fr);
  }
}

@media (max-height: 920px) and (min-width: 721px) {
  .spotify-story-page {
    gap: 10px;
  }

  .spotify-page-header :deep(.page-header) {
    gap: 8px;
  }

  .spotify-page-header :deep(.page-header-title) {
    font-size: 28px;
    line-height: 1.1;
  }

  .spotify-page-header :deep(.page-header-description) {
    line-height: 1.35;
  }

  .spotify-release-hero {
    grid-template-columns: minmax(188px, 204px) minmax(0, 1fr);
    gap: 22px;
    min-height: 232px;
    padding: 24px 24px 20px;
  }

  .spotify-cover-card {
    width: min(204px, 100%);
  }

  .spotify-release-title-input {
    min-height: 64px;
    font-size: clamp(42px, 5.8vw, 68px);
  }

  .spotify-control-bar {
    min-height: 70px;
    padding: 12px 24px;
  }

  .spotify-play-button {
    width: 48px;
    height: 48px;
  }
}

@media (max-height: 760px) and (min-width: 721px) {
  .spotify-page-header :deep(.page-header-description) {
    display: none;
  }

  .spotify-release-hero {
    grid-template-columns: minmax(132px, 150px) minmax(0, 1fr);
    gap: 16px;
    min-height: 164px;
    padding: 12px 20px;
  }

  .spotify-cover-card {
    width: min(150px, 100%);
  }

  .spotify-release-title-input {
    min-height: 46px;
    font-size: clamp(32px, 4.4vw, 52px);
  }

  .spotify-control-bar {
    min-height: 54px;
    padding: 6px 20px;
  }

  .spotify-play-button {
    width: 44px;
    height: 44px;
  }
}

@media (max-width: 1040px) {
  .spotify-track-head {
    display: none;
  }

  .spotify-track-index {
    width: 30px;
    height: 30px;
  }

  .spotify-track-row {
    grid-template-columns: 30px minmax(0, 1fr) auto;
    gap: 10px;
    border-bottom: 1px solid rgb(255 255 255 / 8%);
    padding: 12px 0;
  }

  .spotify-audio-cell,
  .spotify-version-select,
  .spotify-track-status,
  .spotify-track-error {
    grid-column: 2 / -1;
  }

  .spotify-track-menu-cell {
    grid-column: 3;
    grid-row: 1;
  }

  .spotify-track-duration {
    display: none;
  }

  .spotify-add-track-row {
    grid-template-columns: 30px minmax(0, 1fr) auto;
    gap: 10px;
    min-height: 42px;
  }
}

@media (max-width: 900px) {
  .uploaded-page.has-spotify-preview-player {
    padding-bottom: 0;
    scroll-padding-bottom: calc(148px + env(safe-area-inset-bottom, 0px));
  }

  .spotify-preview-player {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    min-height: 132px;
    padding: 10px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  }

  .spotify-preview-now {
    max-width: 100%;
  }

  .spotify-preview-cover {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
  }

  .spotify-preview-controls {
    gap: 10px;
  }

  .spotify-preview-tools {
    display: none;
  }
}

@media (max-width: 720px) {
  .uploader-story-shell {
    height: clamp(600px, calc(100dvh - var(--topbar-height, 64px) - 40px), 760px);
  }

  .uploader-scroll-nav {
    right: -28px;
    height: min(172px, calc(100% - 104px));
    min-height: 128px;
  }

  .uploader-scroll-action {
    width: 22px;
    height: 22px;
  }

  .uploader-section-map {
    width: 16px;
  }

  .spotify-release-hero,
  .spotify-control-bar,
  .spotify-track-table,
  .spotify-release-footnote {
    padding-inline: 18px;
  }

  .spotify-release-hero {
    grid-template-columns: minmax(82px, 104px) minmax(0, 1fr);
    gap: 14px;
    align-items: end;
    min-height: auto;
    padding-block: 18px;
  }

  .spotify-cover-card {
    width: 100%;
  }

  .spotify-cover-placeholder {
    gap: 6px;
    font-size: 11px;
  }

  .spotify-cover-action {
    display: none;
  }

  .spotify-cover-status {
    top: 6px;
    right: 6px;
  }

  .spotify-release-copy {
    gap: 8px;
  }

  .spotify-release-type-select {
    width: 108px;
    height: 38px;
  }

  .spotify-release-title-input {
    min-height: 42px;
    font-size: clamp(26px, 7vw, 34px);
  }

  .spotify-release-meta {
    font-size: 12px;
  }

  .spotify-release-meta-row {
    gap: 8px;
  }

  .spotify-release-date-button {
    min-height: 36px;
    padding: 6px 10px;
  }

  .spotify-release-date-copy > span {
    display: none;
  }

  .spotify-control-bar {
    gap: 12px;
    min-height: 74px;
    overflow-x: auto;
  }

  .spotify-add-track-row {
    margin-inline: 18px;
  }

  .spotify-play-button {
    width: 48px;
    height: 48px;
  }

  .spotify-list-mode span {
    display: none;
  }

  .meta-clip-controls {
    grid-template-columns: 34px minmax(0, 1fr) 74px 34px;
    gap: 8px;
    width: min(100%, calc(100vw - 64px));
    padding: 8px;
  }

  .meta-clip-duration,
  .meta-story-play {
    width: 34px;
    height: 34px;
  }

  .meta-waveform-editor {
    height: 64px;
  }

  .meta-time-input {
    height: 30px;
    min-height: 30px;
    padding-inline: 7px;
    font-size: 11px;
  }
}

@media (max-width: 560px) {
  .uploader-scroll-nav {
    right: -28px;
  }

  .uploader-map-marker span {
    width: 5px;
    height: 5px;
  }

  .uploader-map-marker:hover span,
  .uploader-map-marker.active span {
    width: 8px;
    height: 8px;
  }

  .upload-status-band,
  .upload-panel {
    border-radius: 12px;
    padding: 16px;
  }

  .upload-status-copy h2 {
    font-size: 25px;
  }

  .readiness-meter strong {
    font-size: 28px;
  }

  .file-drop-zone {
    grid-template-columns: 24px minmax(0, 1fr);
  }

  .track-row-upload {
    padding: 12px;
  }

  .submit-summary {
    grid-template-columns: 1fr;
  }

  .step-actions {
    align-items: stretch;
  }

  .step-actions :deep(button),
  .step-actions :deep(a) {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .uploaded-page :deep(*),
  .uploaded-page :deep(*::before),
  .uploaded-page :deep(*::after) {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }

  .upload-step,
  .uploader-scroll-stage,
  .uploader-scroll-action,
  .uploader-map-marker span,
  .file-drop-zone,
  .store-option {
    transition: none;
  }

  .uploader-scroll-stage {
    scroll-behavior: auto;
  }

  .spotify-preview-range::-webkit-slider-thumb,
  .spotify-preview-volume::-webkit-slider-thumb,
  .spotify-preview-range::-moz-range-thumb,
  .spotify-preview-volume::-moz-range-thumb {
    opacity: 1;
  }

  .upload-step:active,
  .file-drop-zone:hover {
    transform: none;
  }
}
</style>
