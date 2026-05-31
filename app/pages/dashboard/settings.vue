<script setup lang="ts">
import type { User, UserIdentity } from "@supabase/supabase-js"
import { ImagePlus, Palette, RotateCcw, Sparkles, Trash2, Upload } from "lucide-vue-next"
import { toast } from "vue-sonner"
import {
  ARTIST_AVATAR_MESH_PRESET_STYLES,
  ARTIST_AVATAR_PRESET_LABELS,
  ARTIST_AVATAR_PRESETS,
  ARTIST_DSP_PROFILE_PLATFORMS,
  DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS,
  type ArtistAvatarMode,
  type ArtistAvatarLibraryItem,
  type ArtistAvatarLibraryResponse,
  type ArtistAvatarPreset,
  type ArtistAvatarUploadResponse,
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

interface AuthAccountSummary {
  email: string | null
  pendingEmail: string | null
}

type SettingsSection = "profile" | "bank" | "preferences" | "login" | "publishing"
type AvatarPictureTab = "upload" | "library"

const settingsSectionValues: SettingsSection[] = ["profile", "bank", "preferences", "login", "publishing"]
const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024
const AVATAR_CROP_VIEW_SIZE = 280
const AVATAR_CROP_OUTPUT_SIZE = 256
const AVATAR_UPLOAD_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"])

interface ArtistFormState {
  avatarMode: ArtistAvatarMode
  avatarPreset: ArtistAvatarPreset
  avatarCustomColors: string[]
  avatarUrl: string
  country: string
  bio: string
}

const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const runtimeConfig = useRuntimeConfig()
const { viewer, refreshViewerContext } = useViewerContext()
const { signOutAndClear, isSigningOut } = useAuthSecurity()
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))

const { data, error, pending, refresh } = useLazyFetch<ArtistSettingsResponse>("/api/dashboard/settings")

const isSavingProfile = ref(false)
const isSavingAvatarSelection = ref(false)
const isUploadingAvatar = ref(false)
const isSavingBankDetails = ref(false)
const isSavingDspProfiles = ref(false)
const isLinkingGoogle = ref(false)
const isUnlinkingGoogle = ref(false)
const isSavingPassword = ref(false)
const isSavingEmailChange = ref(false)
const successMessage = ref("")
const errorMessage = ref("")
const loginMethodSuccess = ref("")
const loginMethodError = ref("")
const linkedIdentities = ref<UserIdentity[]>([])
const authAccount = ref<AuthAccountSummary>({
  email: null,
  pendingEmail: null,
})
const avatarFileInput = ref<HTMLInputElement | null>(null)
const avatarCropDialogOpen = ref(false)
const avatarCropFile = ref<File | null>(null)
const avatarCropImageUrl = ref("")
const avatarCropImageElement = ref<HTMLImageElement | null>(null)
const avatarCropNaturalWidth = ref(1)
const avatarCropNaturalHeight = ref(1)
const avatarCropZoom = ref(1)
const avatarCropOffset = reactive({
  x: 0,
  y: 0,
})
const avatarCropDrag = reactive({
  active: false,
  pointerId: 0,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
})
const avatarPictureTab = ref<AvatarPictureTab>("upload")
const avatarUploadDropActive = ref(false)
const avatarLibraryItems = ref<ArtistAvatarLibraryItem[]>([])
const showAllAvatarPresets = ref(false)
const isLoadingAvatarLibrary = ref(false)
const isSelectingAvatarLibrary = ref(false)
const deletingAvatarImageId = ref("")

const profileForm = reactive({
  fullName: "",
  phone: "",
})

const artistForm = reactive<ArtistFormState>({
  avatarMode: "mesh" as ArtistAvatarMode,
  avatarPreset: "aurora" as ArtistAvatarPreset,
  avatarCustomColors: [...DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS],
  avatarUrl: "",
  country: "",
  bio: "",
})
const avatarEditorMode = ref<ArtistAvatarMode>("mesh")

const bankForm = reactive({
  accountName: "",
  bankName: "",
  accountNumber: "",
  bankAddress: "",
})

const dspProfileDrafts = ref<ArtistDspProfileDraft[]>(blankDspProfileDrafts(""))

const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
})

const emailChangeForm = reactive({
  email: "",
})

const artists = computed(() => data.value?.artists ?? [])
const selectedArtist = computed(() => artists.value[0] ?? null)
const publishingInfo = computed(() => selectedArtist.value?.publishingInfo ?? null)
const avatarPresetOptions = computed(() => ARTIST_AVATAR_PRESETS.filter((preset) => preset !== "custom").map((preset) => ({
  value: preset,
  label: ARTIST_AVATAR_PRESET_LABELS[preset],
})))
const visibleAvatarPresetOptions = computed(() => (
  showAllAvatarPresets.value ? avatarPresetOptions.value : avatarPresetOptions.value.slice(0, 10)
))
const hasHiddenAvatarPresets = computed(() => avatarPresetOptions.value.length > visibleAvatarPresetOptions.value.length)
const avatarPickerDisabled = computed(() => (
  isViewingAsArtist.value
  || isSavingProfile.value
  || isUploadingAvatar.value
  || isSavingAvatarSelection.value
  || isSelectingAvatarLibrary.value
))
const avatarDisplayName = computed(() => selectedArtist.value?.artistName || profileForm.fullName || "Artist")
const activeAvatarLabel = computed(() => (
  artistForm.avatarMode === "uploaded" ? "Profile picture" : ARTIST_AVATAR_PRESET_LABELS[artistForm.avatarPreset]
))
const avatarCropScale = computed(() => {
  const width = Math.max(1, avatarCropNaturalWidth.value)
  const height = Math.max(1, avatarCropNaturalHeight.value)
  return Math.max(AVATAR_CROP_VIEW_SIZE / width, AVATAR_CROP_VIEW_SIZE / height) * avatarCropZoom.value
})
const avatarCropImageStyle = computed(() => ({
  width: `${avatarCropNaturalWidth.value * avatarCropScale.value}px`,
  height: `${avatarCropNaturalHeight.value * avatarCropScale.value}px`,
  transform: `translate(-50%, -50%) translate(${avatarCropOffset.x}px, ${avatarCropOffset.y}px)`,
}))
const hasAvatarLibraryItems = computed(() => avatarLibraryItems.value.length > 0)
const linkedProviders = computed(() => [...new Set(linkedIdentities.value.map((identity) => identity.provider))])
const hasPasswordIdentity = computed(() => linkedProviders.value.includes("email"))
const hasGoogleIdentity = computed(() => linkedProviders.value.includes("google"))
const hasAlternativeLoginMethod = computed(() => linkedProviders.value.some((provider) => provider !== "google"))
const canDisconnectGoogle = computed(() => hasGoogleIdentity.value && hasAlternativeLoginMethod.value)
const currentLoginEmail = computed(() => authAccount.value.email || data.value?.profile.email || null)
const pendingLoginEmail = computed(() => authAccount.value.pendingEmail)
const currentLoginEmailIsGmail = computed(() => isGmailLoginEmail(currentLoginEmail.value))
const canConnectGoogle = computed(() => !hasGoogleIdentity.value && currentLoginEmailIsGmail.value)
const emailStatusLabel = computed(() => (hasPasswordIdentity.value ? "Connected" : "Not connected"))
const googleStatusLabel = computed(() => (hasGoogleIdentity.value ? "Connected" : "Not connected"))
const passwordActionLabel = computed(() => (hasPasswordIdentity.value ? "Change password" : "Set password"))
const passwordActionDescription = computed(() =>
  hasPasswordIdentity.value
    ? "Update the password tied to this account."
    : "Add a password so this account can sign in without Google.",
)
const activeSettingsSection = computed<SettingsSection>({
  get: () => normalizeSettingsSection(route.query.section),
  set: (value) => {
    const query = { ...route.query }

    if (value === "profile") {
      delete query.section
    } else {
      query.section = value
    }

    void router.replace({ query })
  },
})
const settingsSections = computed(() => [
  {
    label: "Profile",
    value: "profile",
  },
  {
    label: "Bank",
    value: "bank",
    badge: bankForm.bankName ? "saved" : "",
  },
  {
    label: "Preferences",
    value: "preferences",
    badge: selectedArtist.value?.dspProfiles.some((profile) => profile.profileExists) ? "DSP" : "",
  },
  {
    label: "Login",
    value: "login",
    badge: hasGoogleIdentity.value ? "Google" : "",
  },
  {
    label: "Publishing",
    value: "publishing",
    badge: publishingInfo.value ? "saved" : "",
  },
])
const settingsFolders = computed(() => settingsSections.value.map((section) => ({
  ...section,
  icon: section.label.slice(0, 1),
  meta: section.value === "profile"
    ? "Identity, avatar, country, and bio"
    : section.value === "bank"
      ? "Payout destination"
      : section.value === "preferences"
        ? "DSP profile links"
        : section.value === "login"
          ? "Email, password, and Google"
          : "Read-only writer metadata",
  tone: section.value === "profile" ? "accent" as const : section.value === "bank" ? "alt" as const : "default" as const,
})))

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

function buildDspProfileDrafts(artist = selectedArtist.value): ArtistDspProfileDraft[] {
  return buildDspProfileDraftsFromRecords(artist?.dspProfiles ?? [], artist?.artistName ?? "")
}

function avatarColorsForPreset(preset: ArtistAvatarPreset) {
  const colors = ARTIST_AVATAR_MESH_PRESET_STYLES[preset]
  return [colors.c1, colors.c2, colors.c3, colors.c4, colors.c5]
}

function syncViewerArtistAvatar(input: {
  artistId: string
  avatarMode: ArtistAvatarMode
  avatarPreset: ArtistAvatarPreset
  avatarCustomColors: string[] | null
  avatarUrl?: string | null
}) {
  viewer.value = {
    ...viewer.value,
    artistMemberships: viewer.value.artistMemberships.map((artist) => (
      artist.id === input.artistId
        ? {
            ...artist,
            avatarMode: input.avatarMode,
            avatarPreset: input.avatarPreset,
            avatarCustomColors: input.avatarCustomColors,
            avatarUrl: typeof input.avatarUrl === "undefined" ? artist.avatarUrl : input.avatarUrl,
          }
        : artist
    )),
  }
}

function normalizeSettingsSection(value: unknown): SettingsSection {
  const raw = Array.isArray(value) ? value[0] : value

  return settingsSectionValues.includes(raw as SettingsSection) ? raw as SettingsSection : "profile"
}

watch(
  () => data.value?.profile,
  (profile) => {
    if (!profile) {
      return
    }

    profileForm.fullName = profile.fullName
    profileForm.phone = profile.phone ?? ""
  },
  { immediate: true },
)

watch(
  selectedArtist,
  (artist) => {
    const nextPreset = artist?.avatarPreset ?? "aurora"
    const savedCustomColors = artist?.avatarCustomColors?.length === DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS.length
      ? [...artist.avatarCustomColors]
      : null

    artistForm.avatarMode = artist?.avatarMode ?? (artist?.avatarUrl ? "uploaded" : "mesh")
    artistForm.avatarPreset = nextPreset
    artistForm.avatarCustomColors = nextPreset === "custom" && savedCustomColors
      ? savedCustomColors
      : avatarColorsForPreset(nextPreset)
    artistForm.avatarUrl = artist?.avatarUrl ?? ""
    avatarEditorMode.value = "mesh"
    artistForm.country = artist?.country ?? ""
    artistForm.bio = artist?.bio ?? ""
    bankForm.accountName = artist?.bankDetails?.accountName ?? ""
    bankForm.bankName = artist?.bankDetails?.bankName ?? ""
    bankForm.accountNumber = artist?.bankDetails?.accountNumber ?? ""
    bankForm.bankAddress = artist?.bankDetails?.bankAddress ?? ""
    dspProfileDrafts.value = buildDspProfileDrafts(artist)
  },
  { immediate: true },
)

watch(
  currentLoginEmail,
  (email) => {
    if (!emailChangeForm.email || emailChangeForm.email === authAccount.value.pendingEmail) {
      emailChangeForm.email = email ?? ""
    }
  },
  { immediate: true },
)

function normalizeLoginEmail(value: string) {
  const normalized = value.trim().toLowerCase()

  if (!normalized || !normalized.includes("@")) {
    throw new Error("Enter a valid login email.")
  }

  return normalized
}

function isGmailLoginEmail(value: string | null) {
  return /@gmail\.com$/i.test(value?.trim() ?? "")
}

function resetMessages() {
  successMessage.value = ""
  errorMessage.value = ""
}

function showErrorMessage(message: string) {
  errorMessage.value = message
  successMessage.value = ""

  if (import.meta.client) {
    toast.error(message)
  }
}

function setError(error: any, fallback: string) {
  showErrorMessage(error?.data?.statusMessage || error?.message || fallback)
}

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""

  if (import.meta.client) {
    toast.success(message)
  }
}

async function saveAvatarSelection(
  mode: ArtistAvatarMode,
  preset = artistForm.avatarPreset,
  customColors = artistForm.avatarCustomColors,
) {
  if (isViewingAsArtist.value) {
    showErrorMessage("View-as mode is read-only. Sign in as the artist to update settings.")
    return
  }

  const artist = selectedArtist.value

  if (!artist) {
    showErrorMessage("No artist profile is available for this account.")
    return
  }

  if (mode === "uploaded" && !artistForm.avatarUrl) {
    openAvatarFilePicker()
    return
  }

  isSavingAvatarSelection.value = true
  resetMessages()

  try {
    await $fetch("/api/dashboard/settings", {
      method: "PATCH",
      body: {
        artist: {
          artistId: artist.artistId,
          avatarMode: mode,
          avatarPreset: preset,
          ...(preset === "custom" ? { avatarCustomColors: customColors } : {}),
        },
      },
    })

    syncViewerArtistAvatar({
      artistId: artist.artistId,
      avatarMode: mode,
      avatarPreset: preset,
      avatarCustomColors: preset === "custom" ? [...customColors] : null,
    })

    await Promise.all([refresh(), refreshViewerContext(true)])
    syncViewerArtistAvatar({
      artistId: artist.artistId,
      avatarMode: mode,
      avatarPreset: preset,
      avatarCustomColors: preset === "custom" ? [...customColors] : null,
    })
    setSuccess(`Updated avatar for ${artist.artistName}.`)
  } catch (error: any) {
    await refresh().catch(() => undefined)
    setError(error, "Unable to update your avatar.")
  } finally {
    isSavingAvatarSelection.value = false
  }
}

async function selectAvatarMode(mode: ArtistAvatarMode) {
  if (avatarPickerDisabled.value) {
    return
  }

  avatarEditorMode.value = mode

  if (mode === "mesh" && artistForm.avatarMode === "mesh" && artistForm.avatarPreset !== "custom") {
    artistForm.avatarCustomColors = avatarColorsForPreset(artistForm.avatarPreset)
  }
}

async function selectAvatarPreset(preset: ArtistAvatarPreset) {
  if (avatarPickerDisabled.value) {
    return
  }

  const nextColors = preset === "custom" ? [...artistForm.avatarCustomColors] : avatarColorsForPreset(preset)

  artistForm.avatarMode = "mesh"
  avatarEditorMode.value = "mesh"
  artistForm.avatarPreset = preset
  artistForm.avatarCustomColors = nextColors
  await saveAvatarSelection("mesh", preset, nextColors)
}

function handleAvatarColorInput(index: number, event: Event) {
  const value = (event.target as HTMLInputElement).value
  artistForm.avatarCustomColors[index] = value
  artistForm.avatarMode = "mesh"
  avatarEditorMode.value = "mesh"
  artistForm.avatarPreset = "custom"
}

async function saveCustomAvatarColors() {
  if (avatarPickerDisabled.value) {
    return
  }

  artistForm.avatarMode = "mesh"
  avatarEditorMode.value = "mesh"
  artistForm.avatarPreset = "custom"
  await saveAvatarSelection("mesh", "custom", artistForm.avatarCustomColors)
}

function openAvatarFilePicker() {
  if (avatarPickerDisabled.value) {
    return
  }

  avatarFileInput.value?.click()
}

async function loadAvatarLibrary() {
  const artist = selectedArtist.value

  if (!artist) {
    avatarLibraryItems.value = []
    return
  }

  isLoadingAvatarLibrary.value = true

  try {
    const response = await $fetch("/api/dashboard/settings/avatar-library", {
      query: {
        artistId: artist.artistId,
      },
    }) as ArtistAvatarLibraryResponse

    avatarLibraryItems.value = response.avatars
  } catch (error: any) {
    setError(error, "Unable to load saved profile pictures.")
  } finally {
    isLoadingAvatarLibrary.value = false
  }
}

async function openAvatarPictureDialog(tab: AvatarPictureTab = "upload") {
  if (avatarPickerDisabled.value) {
    return
  }

  avatarEditorMode.value = "uploaded"
  avatarPictureTab.value = tab
  avatarCropDialogOpen.value = true
  await loadAvatarLibrary()
}

function clampAvatarCropOffset() {
  const scaledWidth = avatarCropNaturalWidth.value * avatarCropScale.value
  const scaledHeight = avatarCropNaturalHeight.value * avatarCropScale.value
  const maxX = Math.max(0, (scaledWidth - AVATAR_CROP_VIEW_SIZE) / 2)
  const maxY = Math.max(0, (scaledHeight - AVATAR_CROP_VIEW_SIZE) / 2)

  avatarCropOffset.x = Math.min(maxX, Math.max(-maxX, avatarCropOffset.x))
  avatarCropOffset.y = Math.min(maxY, Math.max(-maxY, avatarCropOffset.y))
}

function resetAvatarCropPosition() {
  avatarCropZoom.value = 1
  avatarCropOffset.x = 0
  avatarCropOffset.y = 0
}

function clearAvatarCropEditor() {
  if (avatarCropImageUrl.value) {
    URL.revokeObjectURL(avatarCropImageUrl.value)
  }

  avatarCropDialogOpen.value = false
  avatarCropFile.value = null
  avatarCropImageUrl.value = ""
  avatarCropImageElement.value = null
  avatarCropNaturalWidth.value = 1
  avatarCropNaturalHeight.value = 1
  resetAvatarCropPosition()
  avatarCropDrag.active = false
  avatarUploadDropActive.value = false
}

function setAvatarCropDialogOpen(open: boolean) {
  if (open) {
    avatarCropDialogOpen.value = true
    return
  }

  if (isUploadingAvatar.value) {
    return
  }

  clearAvatarCropEditor()
}

function openAvatarCropEditor(file: File) {
  if (avatarCropImageUrl.value) {
    URL.revokeObjectURL(avatarCropImageUrl.value)
  }

  avatarCropFile.value = file
  avatarCropImageElement.value = null
  avatarCropImageUrl.value = URL.createObjectURL(file)
  avatarCropNaturalWidth.value = 1
  avatarCropNaturalHeight.value = 1
  resetAvatarCropPosition()
  avatarPictureTab.value = "upload"
  avatarCropDialogOpen.value = true
}

function handleAvatarCropImageLoad(event: Event) {
  const image = event.target as HTMLImageElement

  avatarCropImageElement.value = image
  avatarCropNaturalWidth.value = image.naturalWidth || 1
  avatarCropNaturalHeight.value = image.naturalHeight || 1
  resetAvatarCropPosition()
  clampAvatarCropOffset()
}

function startAvatarCropDrag(event: PointerEvent) {
  if (isUploadingAvatar.value || !avatarCropImageElement.value) {
    return
  }

  avatarCropDrag.active = true
  avatarCropDrag.pointerId = event.pointerId
  avatarCropDrag.startX = event.clientX
  avatarCropDrag.startY = event.clientY
  avatarCropDrag.originX = avatarCropOffset.x
  avatarCropDrag.originY = avatarCropOffset.y
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function moveAvatarCropDrag(event: PointerEvent) {
  if (!avatarCropDrag.active || avatarCropDrag.pointerId !== event.pointerId) {
    return
  }

  avatarCropOffset.x = avatarCropDrag.originX + event.clientX - avatarCropDrag.startX
  avatarCropOffset.y = avatarCropDrag.originY + event.clientY - avatarCropDrag.startY
  clampAvatarCropOffset()
}

function endAvatarCropDrag(event: PointerEvent) {
  if (!avatarCropDrag.active || avatarCropDrag.pointerId !== event.pointerId) {
    return
  }

  avatarCropDrag.active = false
  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob)
      } else {
        reject(new Error("Unable to prepare the cropped avatar."))
      }
    }, type, quality)
  })
}

async function createCroppedAvatarFile() {
  const image = avatarCropImageElement.value

  if (!image || !avatarCropFile.value) {
    throw new Error("Choose an avatar image first.")
  }

  const scale = avatarCropScale.value
  const imageLeft = AVATAR_CROP_VIEW_SIZE / 2 - (avatarCropNaturalWidth.value * scale) / 2 + avatarCropOffset.x
  const imageTop = AVATAR_CROP_VIEW_SIZE / 2 - (avatarCropNaturalHeight.value * scale) / 2 + avatarCropOffset.y
  const sourceSize = AVATAR_CROP_VIEW_SIZE / scale
  const sourceX = Math.min(Math.max(0, avatarCropNaturalWidth.value - sourceSize), Math.max(0, -imageLeft / scale))
  const sourceY = Math.min(Math.max(0, avatarCropNaturalHeight.value - sourceSize), Math.max(0, -imageTop / scale))
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")

  if (!context) {
    throw new Error("Unable to prepare the cropped avatar.")
  }

  canvas.width = AVATAR_CROP_OUTPUT_SIZE
  canvas.height = AVATAR_CROP_OUTPUT_SIZE
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    AVATAR_CROP_OUTPUT_SIZE,
    AVATAR_CROP_OUTPUT_SIZE,
  )

  const blob = await canvasToBlob(canvas, "image/webp", 0.82)
  return new File([blob], "artist-avatar.webp", { type: "image/webp" })
}

function validateAvatarUploadFile(file: File) {
  if (!AVATAR_UPLOAD_TYPES.has(file.type)) {
    throw new Error("Avatar image must be JPG, PNG, or WEBP.")
  }

  if (file.size > MAX_AVATAR_UPLOAD_BYTES) {
    throw new Error("Avatar image must be 5 MB or smaller.")
  }
}

function stageAvatarUploadFile(file: File) {
  try {
    validateAvatarUploadFile(file)
    resetMessages()
    openAvatarCropEditor(file)
  } catch (error: any) {
    showErrorMessage(error?.message || "Choose a valid avatar image.")
  }
}

function handleAvatarDragEnter(event: DragEvent) {
  event.preventDefault()

  if (!avatarPickerDisabled.value) {
    avatarUploadDropActive.value = true
  }
}

function handleAvatarDragLeave(event: DragEvent) {
  event.preventDefault()

  if (event.currentTarget === event.target) {
    avatarUploadDropActive.value = false
  }
}

function handleAvatarDrop(event: DragEvent) {
  event.preventDefault()
  avatarUploadDropActive.value = false

  if (avatarPickerDisabled.value) {
    return
  }

  const file = event.dataTransfer?.files?.[0]

  if (file) {
    stageAvatarUploadFile(file)
  }
}

async function uploadAvatarFile(file: File) {
  const artist = selectedArtist.value

  if (!artist) {
    throw new Error("No artist profile is available for this account.")
  }

  isUploadingAvatar.value = true
  resetMessages()

  try {
    const body = new FormData()
    body.append("artistId", artist.artistId)
    body.append("file", file)

    const response = await $fetch("/api/dashboard/settings/avatar", {
      method: "POST",
      body,
    }) as ArtistAvatarUploadResponse

    artistForm.avatarMode = response.avatarMode
    avatarEditorMode.value = response.avatarMode
    artistForm.avatarPreset = response.avatarPreset
    artistForm.avatarCustomColors = response.avatarPreset === "custom" && response.avatarCustomColors?.length === DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS.length
      ? [...response.avatarCustomColors]
      : avatarColorsForPreset(response.avatarPreset)
    artistForm.avatarUrl = response.avatarUrl

    syncViewerArtistAvatar({
      artistId: artist.artistId,
      avatarMode: response.avatarMode,
      avatarPreset: response.avatarPreset,
      avatarCustomColors: response.avatarCustomColors,
      avatarUrl: response.avatarUrl,
    })

    await Promise.all([refresh(), refreshViewerContext(true)])
    syncViewerArtistAvatar({
      artistId: artist.artistId,
      avatarMode: response.avatarMode,
      avatarPreset: response.avatarPreset,
      avatarCustomColors: response.avatarCustomColors,
      avatarUrl: response.avatarUrl,
    })
    await loadAvatarLibrary()
    setSuccess(`Updated avatar for ${artist.artistName}.`)
  } catch (error: any) {
    setError(error, "Unable to upload your avatar image.")
  } finally {
    isUploadingAvatar.value = false
  }
}

async function confirmAvatarCropUpload() {
  try {
    if (!avatarCropFile.value) {
      throw new Error("Choose an avatar image first.")
    }

    validateAvatarUploadFile(avatarCropFile.value)
    const croppedFile = await createCroppedAvatarFile()
    await uploadAvatarFile(croppedFile)
    clearAvatarCropEditor()
  } catch (error: any) {
    setError(error, "Unable to upload your avatar image.")
  }
}

async function handleAvatarFileChange(event: Event) {
  if (isViewingAsArtist.value) {
    showErrorMessage("View-as mode is read-only. Sign in as the artist to update settings.")
    return
  }

  if (!selectedArtist.value) {
    showErrorMessage("No artist profile is available for this account.")
    return
  }

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ""

  if (!file) {
    return
  }

  stageAvatarUploadFile(file)
}

async function useAvatarLibraryImage(item: ArtistAvatarLibraryItem) {
  const artist = selectedArtist.value

  if (!artist || avatarPickerDisabled.value || item.isCurrent) {
    return
  }

  isSelectingAvatarLibrary.value = true
  resetMessages()

  try {
    const response = await $fetch("/api/dashboard/settings/avatar-library/select", {
      method: "POST",
      body: {
        artistId: artist.artistId,
        avatarImageId: item.id,
      },
    }) as ArtistAvatarUploadResponse

    artistForm.avatarMode = response.avatarMode
    avatarEditorMode.value = response.avatarMode
    artistForm.avatarPreset = response.avatarPreset
    artistForm.avatarCustomColors = response.avatarPreset === "custom" && response.avatarCustomColors?.length === DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS.length
      ? [...response.avatarCustomColors]
      : avatarColorsForPreset(response.avatarPreset)
    artistForm.avatarUrl = response.avatarUrl

    syncViewerArtistAvatar({
      artistId: artist.artistId,
      avatarMode: response.avatarMode,
      avatarPreset: response.avatarPreset,
      avatarCustomColors: response.avatarCustomColors,
      avatarUrl: response.avatarUrl,
    })

    await Promise.all([refresh(), refreshViewerContext(true)])
    syncViewerArtistAvatar({
      artistId: artist.artistId,
      avatarMode: response.avatarMode,
      avatarPreset: response.avatarPreset,
      avatarCustomColors: response.avatarCustomColors,
      avatarUrl: response.avatarUrl,
    })
    await loadAvatarLibrary()
    setSuccess(`Updated avatar for ${artist.artistName}.`)
    clearAvatarCropEditor()
  } catch (error: any) {
    setError(error, "Unable to use that saved profile picture.")
  } finally {
    isSelectingAvatarLibrary.value = false
  }
}

async function deleteAvatarLibraryImage(item: ArtistAvatarLibraryItem) {
  const artist = selectedArtist.value

  if (!artist || item.isCurrent || deletingAvatarImageId.value) {
    return
  }

  if (!window.confirm("Permanently delete this saved profile picture?")) {
    return
  }

  deletingAvatarImageId.value = item.id
  resetMessages()

  try {
    await $fetch(`/api/dashboard/settings/avatar-library/${item.id}`, {
      method: "DELETE",
      body: {
        artistId: artist.artistId,
      },
    })
    avatarLibraryItems.value = avatarLibraryItems.value.filter((avatar) => avatar.id !== item.id)
    setSuccess("Deleted saved profile picture.")
  } catch (error: any) {
    setError(error, "Unable to delete that saved profile picture.")
    await loadAvatarLibrary().catch(() => undefined)
  } finally {
    deletingAvatarImageId.value = ""
  }
}

watch(avatarCropZoom, () => {
  clampAvatarCropOffset()
})

onBeforeUnmount(() => {
  if (avatarCropImageUrl.value) {
    URL.revokeObjectURL(avatarCropImageUrl.value)
  }
})

function resetLoginMethodMessages() {
  loginMethodSuccess.value = ""
  loginMethodError.value = ""
}

function showLoginMethodErrorMessage(message: string) {
  loginMethodError.value = message
  loginMethodSuccess.value = ""

  if (import.meta.client) {
    toast.error(message)
  }
}

function setLoginMethodError(error: any, fallback: string) {
  showLoginMethodErrorMessage(error?.data?.statusMessage || error?.message || fallback)
}

function setLoginMethodSuccess(message: string) {
  loginMethodSuccess.value = message
  loginMethodError.value = ""

  if (import.meta.client) {
    toast.success(message)
  }
}

function resetPasswordForm() {
  passwordForm.currentPassword = ""
  passwordForm.newPassword = ""
  passwordForm.confirmPassword = ""
}

function applyAuthUserState(nextUser?: User | null) {
  if (!nextUser) {
    return
  }

  authAccount.value = {
    email: nextUser.email?.trim().toLowerCase() || null,
    pendingEmail: nextUser.new_email?.trim().toLowerCase() || null,
  }

  if (nextUser.identities?.length) {
    linkedIdentities.value = nextUser.identities
  }
}

async function refreshLoginMethods(options: { preserveMessages?: boolean } = {}) {
  if (!import.meta.client) {
    return
  }

  if (!options.preserveMessages) {
    resetLoginMethodMessages()
  }

  const [{ data: userResult, error: userError }, { data: identitiesResult, error: identitiesError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getUserIdentities(),
  ])

  if (userError) {
    setLoginMethodError(userError, "Unable to load the current account email.")
    return
  }

  applyAuthUserState(userResult.user)

  if (identitiesError) {
    linkedIdentities.value = userResult.user?.identities ?? []
    setLoginMethodError(identitiesError, "Unable to load connected login methods.")
    return
  }

  linkedIdentities.value = identitiesResult?.identities ?? userResult.user?.identities ?? []
}

onMounted(() => {
  if (!isViewingAsArtist.value) {
    refreshLoginMethods()
  }
})

async function saveProfile() {
  if (isViewingAsArtist.value) {
    showErrorMessage("View-as mode is read-only. Sign in as the artist to update settings.")
    return
  }

  if (!selectedArtist.value) {
    showErrorMessage("No artist profile is available for this account.")
    return
  }

  if (artistForm.avatarMode === "uploaded" && !artistForm.avatarUrl) {
    showErrorMessage("Upload a profile picture before selecting Profile picture.")
    return
  }

  isSavingProfile.value = true
  resetMessages()

  try {
    await $fetch("/api/dashboard/settings", {
      method: "PATCH",
      body: {
        profile: {
          fullName: profileForm.fullName,
          phone: profileForm.phone || null,
        },
        artist: {
          artistId: selectedArtist.value.artistId,
          avatarMode: artistForm.avatarMode,
          avatarPreset: artistForm.avatarPreset,
          ...(artistForm.avatarPreset === "custom" ? { avatarCustomColors: artistForm.avatarCustomColors } : {}),
          country: artistForm.country || null,
          bio: artistForm.bio || null,
        },
      },
    })

    await Promise.all([refresh(), refreshViewerContext(true)])
    setSuccess(`Saved profile details for ${selectedArtist.value.artistName}.`)
  } catch (error: any) {
    setError(error, "Unable to save your profile details.")
  } finally {
    isSavingProfile.value = false
  }
}

async function saveBankDetails() {
  if (isViewingAsArtist.value) {
    showErrorMessage("View-as mode is read-only. Sign in as the artist to update bank details.")
    return
  }

  if (!selectedArtist.value) {
    showErrorMessage("No artist profile is available for this account.")
    return
  }

  isSavingBankDetails.value = true
  resetMessages()

  try {
    await $fetch("/api/dashboard/settings", {
      method: "PATCH",
      body: {
        bankDetails: {
          artistId: selectedArtist.value.artistId,
          accountName: bankForm.accountName,
          bankName: bankForm.bankName,
          accountNumber: bankForm.accountNumber,
          bankAddress: bankForm.bankAddress || null,
        },
      },
    })

    await refresh()
    setSuccess(`Saved bank details for ${selectedArtist.value.artistName}.`)
  } catch (error: any) {
    setError(error, "Unable to save your bank details.")
  } finally {
    isSavingBankDetails.value = false
  }
}

async function saveDspProfiles() {
  if (isViewingAsArtist.value) {
    showErrorMessage("View-as mode is read-only. Sign in as the artist to update DSP preferences.")
    return
  }

  const artist = selectedArtist.value

  if (!artist) {
    showErrorMessage("No artist profile is available for this account.")
    return
  }

  isSavingDspProfiles.value = true
  resetMessages()

  try {
    const response = await $fetch("/api/dashboard/settings", {
      method: "PATCH",
      body: {
        dspProfiles: {
          artistId: artist.artistId,
          profiles: dspProfileDrafts.value,
        },
      },
    }) as ArtistSettingsMutationResponse

    await refresh()
    const refreshedArtist = artists.value.find((entry) => entry.artistId === artist.artistId)

    if (response.dspProfiles) {
      dspProfileDrafts.value = buildDspProfileDraftsFromRecords(response.dspProfiles, refreshedArtist?.artistName ?? artist.artistName)
    } else if (refreshedArtist) {
      dspProfileDrafts.value = buildDspProfileDrafts(refreshedArtist)
    }

    setSuccess(`Saved DSP preferences for ${refreshedArtist?.artistName ?? artist.artistName}.`)
  } catch (error: any) {
    setError(error, "Unable to save DSP profile preferences.")
  } finally {
    isSavingDspProfiles.value = false
  }
}

async function connectGoogle() {
  if (!currentLoginEmailIsGmail.value) {
    showLoginMethodErrorMessage("Google linking is limited to Gmail login emails in this app.")
    return
  }

  isLinkingGoogle.value = true
  resetLoginMethodMessages()

  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: `${runtimeConfig.public.siteUrl}/auth/callback`,
    },
  })

  if (error) {
    setLoginMethodError(error, "Unable to start Google linking.")
    isLinkingGoogle.value = false
  }
}

async function disconnectGoogle() {
  resetLoginMethodMessages()

  if (!canDisconnectGoogle.value) {
    showLoginMethodErrorMessage("Set a password before disconnecting Google so this account keeps another sign-in method.")
    return
  }

  const googleIdentity = linkedIdentities.value.find((identity) => identity.provider === "google")

  if (!googleIdentity) {
    showLoginMethodErrorMessage("Google is not currently linked to this account.")
    return
  }

  isUnlinkingGoogle.value = true

  try {
    const { error } = await supabase.auth.unlinkIdentity(googleIdentity)

    if (error) {
      throw error
    }

    await refreshLoginMethods()
    setLoginMethodSuccess("Google sign-in removed. Your remaining login method still works.")
  } catch (error: any) {
    setLoginMethodError(error, "Unable to disconnect Google.")
  } finally {
    isUnlinkingGoogle.value = false
  }
}

async function savePassword() {
  resetLoginMethodMessages()
  const hadPasswordIdentity = hasPasswordIdentity.value

  if (!passwordForm.newPassword || passwordForm.newPassword.length < 8) {
    showLoginMethodErrorMessage("Choose a password with at least 8 characters.")
    return
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    showLoginMethodErrorMessage("The new password confirmation does not match.")
    return
  }

  if (hasPasswordIdentity.value && !passwordForm.currentPassword) {
    showLoginMethodErrorMessage("Enter your current password to change it.")
    return
  }

  isSavingPassword.value = true

  try {
    const attributes: {
      password: string
      current_password?: string
    } = {
      password: passwordForm.newPassword,
    }

    if (hasPasswordIdentity.value) {
      attributes.current_password = passwordForm.currentPassword
    }

    const { data: updateResult, error } = await supabase.auth.updateUser(attributes)

    if (error) {
      throw error
    }

    applyAuthUserState(updateResult.user)
    resetPasswordForm()
    setLoginMethodSuccess(
      hadPasswordIdentity
        ? "Password updated for this account."
        : "Password login added. You can now sign in with email/password or Google.",
    )
    void refreshLoginMethods({ preserveMessages: true })
  } catch (error: any) {
    setLoginMethodError(error, "Unable to save the password for this account.")
  } finally {
    isSavingPassword.value = false
  }
}

async function requestEmailChange() {
  resetLoginMethodMessages()

  let nextEmail = ""

  try {
    nextEmail = normalizeLoginEmail(emailChangeForm.email)
  } catch (error: any) {
    setLoginMethodError(error, "Enter a valid login email.")
    return
  }

  if (nextEmail === currentLoginEmail.value && !pendingLoginEmail.value) {
    showLoginMethodErrorMessage("That is already the current login email for this account.")
    return
  }

  if (hasGoogleIdentity.value && !isGmailLoginEmail(nextEmail)) {
    showLoginMethodErrorMessage("Change the login email to another Gmail address while Google sign-in is linked.")
    return
  }

  isSavingEmailChange.value = true

  try {
    const { data: updateResult, error } = await supabase.auth.updateUser(
      { email: nextEmail },
      {
        emailRedirectTo: `${runtimeConfig.public.siteUrl}/auth/callback`,
      },
    )

    if (error) {
      throw error
    }

    applyAuthUserState(updateResult.user)

    if (!authAccount.value.pendingEmail && authAccount.value.email !== nextEmail) {
      authAccount.value.pendingEmail = nextEmail
    }

    const requestedEmail = authAccount.value.pendingEmail || nextEmail
    setLoginMethodSuccess(
      requestedEmail
        ? `Email change requested. Confirm ${requestedEmail} from the Supabase email link to finish it.`
        : "Login email updated for this account.",
    )
    void refreshLoginMethods({ preserveMessages: true })
  } catch (error: any) {
    setLoginMethodError(error, "Unable to start the login email change.")
  } finally {
    isSavingEmailChange.value = false
  }
}
</script>

<template>
  <div class="page">
    <AppAlert v-if="error" variant="destructive">
      {{ error.statusMessage || "Unable to load account settings right now." }}
      <template #action>
        <Button variant="secondary" @click="() => refresh()">Retry</Button>
      </template>
    </AppAlert>

    <DashboardSkeleton v-else-if="pending && !data" :rows="5" />

    <AppEmptyState
      v-else-if="!artists.length"
      title="No artist profile"
      description="No active artist profile is attached to this login."
    />

    <AppAlert v-else-if="isViewingAsArtist" variant="warning">
      View-as mode is read-only. Profile, bank, and login method changes are disabled for admins.
    </AppAlert>

    <WorkspaceFolderGrid
      v-if="artists.length"
      v-model="activeSettingsSection"
      :items="settingsFolders"
      label="Account settings sections"
    />

    <div v-if="artists.length" class="panel-grid panel-grid-single">
      <DataPanel
        v-if="activeSettingsSection === 'profile'"
        title="Avatar"
        eyebrow="Profile media"
        description="Choose a generated avatar or upload a profile picture for this artist."
      >
        <div class="artist-avatar-picker">
          <div class="artist-avatar-preview-row">
            <ArtistAvatar
              class="settings-avatar-preview"
              :display-name="avatarDisplayName"
              :fallback="avatarDisplayName"
              :avatar-mode="artistForm.avatarMode"
              :avatar-preset="artistForm.avatarPreset"
              :avatar-custom-colors="artistForm.avatarCustomColors"
              :avatar-url="artistForm.avatarUrl"
              :label="`${avatarDisplayName} avatar preview`"
            />
            <div class="summary-copy">
              <strong>{{ avatarDisplayName }}</strong>
              <span class="detail-copy">{{ isSavingAvatarSelection ? "Saving avatar..." : activeAvatarLabel }}</span>
            </div>
          </div>

          <div class="avatar-mode-tabs" role="radiogroup" aria-label="Avatar type">
            <button
              type="button"
              class="avatar-mode-tab"
              :class="{ active: avatarEditorMode === 'mesh' }"
              :disabled="avatarPickerDisabled"
              :aria-checked="avatarEditorMode === 'mesh'"
              role="radio"
              @click="selectAvatarMode('mesh')"
            >
              <Sparkles class="size-4" />
              <span>Generated avatar</span>
            </button>
            <button
              type="button"
              class="avatar-mode-tab"
              :class="{ active: avatarEditorMode === 'uploaded' }"
              :disabled="avatarPickerDisabled"
              :aria-checked="avatarEditorMode === 'uploaded'"
              role="radio"
              @click="selectAvatarMode('uploaded')"
            >
              <ImagePlus class="size-4" />
              <span>Profile picture</span>
            </button>
          </div>

          <div v-if="avatarEditorMode === 'mesh'" class="avatar-preset-shell">
            <div class="avatar-preset-grid" aria-label="Generated avatar presets">
              <button
                v-for="preset in visibleAvatarPresetOptions"
                :key="preset.value"
                type="button"
                class="avatar-preset-option"
                :class="{ active: artistForm.avatarPreset === preset.value }"
                :disabled="avatarPickerDisabled"
                :aria-label="preset.label"
                @click="selectAvatarPreset(preset.value)"
              >
                <ArtistAvatar
                  class="avatar-preset-preview"
                  :display-name="avatarDisplayName"
                  :fallback="avatarDisplayName"
                  avatar-mode="mesh"
                  :avatar-preset="preset.value"
                />
              </button>
            </div>
            <button
              v-if="hasHiddenAvatarPresets || showAllAvatarPresets"
              type="button"
              class="avatar-preset-more"
              :disabled="avatarPickerDisabled"
              @click="showAllAvatarPresets = !showAllAvatarPresets"
            >
              {{ showAllAvatarPresets ? "Show less" : `See more (${avatarPresetOptions.length - visibleAvatarPresetOptions.length})` }}
            </button>
          </div>

          <div v-if="avatarEditorMode === 'mesh'" class="avatar-color-editor">
            <div class="avatar-color-editor-header">
              <span class="avatar-color-editor-title">
                <Palette class="size-4" />
                <strong>Custom colors</strong>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                :disabled="avatarPickerDisabled"
                @click="saveCustomAvatarColors"
              >
                {{ artistForm.avatarPreset === "custom" ? "Save" : "Use" }}
              </Button>
            </div>
            <div class="avatar-color-grid">
              <label
                v-for="(_, index) in artistForm.avatarCustomColors"
                :key="index"
                class="avatar-color-control"
                :style="{ '--avatar-control-color': artistForm.avatarCustomColors[index] }"
              >
                <input
                  :aria-label="`Avatar color ${index + 1}`"
                  type="color"
                  :value="artistForm.avatarCustomColors[index]"
                  :disabled="avatarPickerDisabled"
                  @input="handleAvatarColorInput(index, $event)"
                  @change="saveCustomAvatarColors"
                >
              </label>
            </div>
          </div>

          <div v-else class="avatar-upload-panel">
            <input
              ref="avatarFileInput"
              class="sr-only"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              :disabled="avatarPickerDisabled"
              @change="handleAvatarFileChange"
            >
            <Button
              type="button"
              variant="secondary"
              :disabled="avatarPickerDisabled"
              @click="openAvatarPictureDialog('upload')"
            >
              <Upload class="size-4" />
              {{ isUploadingAvatar ? "Uploading..." : artistForm.avatarUrl ? "Replace picture" : "Upload picture" }}
            </Button>
            <span class="field-note">JPG, PNG, WEBP. 5 MB max.</span>
          </div>
        </div>
      </DataPanel>

      <DataPanel
        v-if="activeSettingsSection === 'profile'"
        title="Profile details"
        eyebrow="Editable"
        description="Full name and phone are account-level. Country and bio apply to this artist profile."
      >
        <div class="form-grid">
          <div class="field-row">
            <label for="settings-full-name">Full name</label>
            <Input id="settings-full-name" v-model="profileForm.fullName" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-phone">Phone</label>
            <Input id="settings-phone" v-model="profileForm.phone" type="tel" />
          </div>

          <div class="field-row">
            <label for="settings-email">Login email</label>
            <Input id="settings-email" :value="currentLoginEmail || ''" type="email" disabled />
          </div>

          <div class="field-row">
            <label for="settings-country">Country</label>
            <Input id="settings-country" v-model="artistForm.country" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-bio">Bio</label>
            <Textarea id="settings-bio" v-model="artistForm.bio" rows="4" />
          </div>

          <div class="flex flex-wrap gap-2">
            <Button :disabled="isSavingProfile || isViewingAsArtist" @click="saveProfile">
              {{ isSavingProfile ? "Saving..." : "Save profile" }}
            </Button>
          </div>
        </div>
      </DataPanel>

      <DataPanel
        id="bank-details"
        v-if="activeSettingsSection === 'bank'"
        title="Bank details"
        eyebrow="Payout destination"
        description="Admins use this information when they manually complete approved payout requests."
      >
        <div class="form-grid">
          <div class="field-row">
            <label for="settings-account-name">Account name</label>
            <Input id="settings-account-name" v-model="bankForm.accountName" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-bank-name">Bank name</label>
            <Input id="settings-bank-name" v-model="bankForm.bankName" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-account-number">Account number</label>
            <Input id="settings-account-number" v-model="bankForm.accountNumber" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-bank-address">Bank address</label>
            <Textarea id="settings-bank-address" v-model="bankForm.bankAddress" rows="3" />
          </div>

          <div class="flex flex-wrap gap-2">
            <Button :disabled="isSavingBankDetails || isViewingAsArtist" @click="saveBankDetails">
              {{ isSavingBankDetails ? "Saving..." : "Save bank details" }}
            </Button>
          </div>
        </div>
      </DataPanel>
    </div>

    <div v-if="artists.length" class="panel-grid panel-grid-single">
      <DataPanel
        v-if="activeSettingsSection === 'preferences'"
        title="DSP profile preferences"
        eyebrow="Artist links"
        description="Saved profile links prefill release uploads for this artist."
      >
        <div class="form-grid">
          <ArtistDspProfileEditor
            v-model="dspProfileDrafts"
            :artist-name="selectedArtist?.artistName || 'Artist'"
            :disabled="isViewingAsArtist || isSavingDspProfiles"
          />

          <div class="flex flex-wrap gap-2">
            <Button :disabled="isSavingDspProfiles || isViewingAsArtist" @click="saveDspProfiles">
              {{ isSavingDspProfiles ? "Saving..." : "Save DSP preferences" }}
            </Button>
          </div>
        </div>
      </DataPanel>

      <DataPanel
        v-if="!isViewingAsArtist && activeSettingsSection === 'login'"
        title="Connected login methods"
        eyebrow="Access"
        description="Account access is managed here for the whole login."
      >
        <div class="form-grid">
          <div class="summary-table">
            <div class="summary-row">
              <span class="detail-copy">Current login email</span>
              <strong>{{ currentLoginEmail || "Unavailable" }}</strong>
            </div>
            <div v-if="pendingLoginEmail" class="summary-row">
              <span class="detail-copy">Pending email change</span>
              <strong>{{ pendingLoginEmail }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Email / password</span>
              <strong>{{ emailStatusLabel }}</strong>
            </div>
            <div class="summary-row">
              <span class="detail-copy">Google</span>
              <strong>{{ googleStatusLabel }}</strong>
            </div>
          </div>

          <div class="field-row">
            <label for="settings-login-email-change">Change login email</label>
            <Input
              id="settings-login-email-change"
              v-model="emailChangeForm.email"

              type="email"
              autocomplete="email"
            />
          </div>

          <div class="flex flex-wrap gap-2">
            <Button :disabled="isSavingEmailChange" @click="requestEmailChange">
              {{ isSavingEmailChange ? "Sending change..." : "Change login email" }}
            </Button>
          </div>

          <p class="field-note">
            Supabase handles the confirmation email. Once the change is confirmed, the app will sync the new address
            across all artist records on the same account.
          </p>

          <div class="field-row" v-if="hasPasswordIdentity">
            <label for="settings-current-password">Current password</label>
            <Input
              id="settings-current-password"
              v-model="passwordForm.currentPassword"

              type="password"
              autocomplete="current-password"
            />
          </div>

          <div class="field-row">
            <label for="settings-new-password">
              {{ hasPasswordIdentity ? "New password" : "Set a password" }}
            </label>
            <Input
              id="settings-new-password"
              v-model="passwordForm.newPassword"

              type="password"
              autocomplete="new-password"
            />
          </div>

          <div class="field-row">
            <label for="settings-confirm-password">Confirm new password</label>
            <Input
              id="settings-confirm-password"
              v-model="passwordForm.confirmPassword"

              type="password"
              autocomplete="new-password"
            />
          </div>

          <div class="flex flex-wrap gap-2">
            <Button :disabled="isSavingPassword" @click="savePassword">
              {{ isSavingPassword ? "Saving password..." : passwordActionLabel }}
            </Button>
          </div>

          <p class="field-note">{{ passwordActionDescription }}</p>

          <div class="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              :disabled="isLinkingGoogle || !canConnectGoogle"
              @click="connectGoogle"
            >
              {{
                hasGoogleIdentity
                  ? "Google already linked"
                  : !currentLoginEmailIsGmail
                    ? "Gmail required"
                  : isLinkingGoogle
                    ? "Redirecting..."
                    : "Connect Google"
              }}
            </Button>
            <Button
              variant="secondary"
              :disabled="isUnlinkingGoogle || !hasGoogleIdentity || !canDisconnectGoogle"
              @click="disconnectGoogle"
            >
              {{
                isUnlinkingGoogle
                  ? "Disconnecting..."
                  : canDisconnectGoogle
                    ? "Disconnect Google"
                    : "Set password first"
              }}
            </Button>
          </div>

          <p v-if="hasGoogleIdentity && !canDisconnectGoogle" class="field-note">
            Add a password before disconnecting Google so the account keeps another sign-in method.
          </p>
          <p v-if="!hasGoogleIdentity && !currentLoginEmailIsGmail" class="field-note">
            Google linking is only available for Gmail login emails in this app.
          </p>

          <div class="flex flex-wrap gap-2">
            <Button variant="secondary" :disabled="isSigningOut" @click="signOutAndClear">
              {{ isSigningOut ? "Opening login..." : "Go to login for forgot password" }}
            </Button>
          </div>

          <p class="field-note">
            Use forgot password from the login page when you no longer know the current password. If Google linking
            fails, enable manual identity linking in Supabase Auth for the Google provider first.
          </p>
        </div>
      </DataPanel>

      <DataPanel
        v-if="activeSettingsSection === 'publishing'"
        title="Publishing info"
        eyebrow="Read only"
        description="Admins manage this for contracts and collection societies. Artists can view it here but cannot edit it."
      >
        <div v-if="publishingInfo" class="summary-table">
          <div class="summary-row">
            <span class="detail-copy">Legal name</span>
            <strong>{{ publishingInfo.legalName || "Not set" }}</strong>
          </div>
          <div class="summary-row">
            <span class="detail-copy">IPI / CAE</span>
            <strong>{{ publishingInfo.ipiNumber || "Not set" }}</strong>
          </div>
          <div class="summary-row">
            <span class="detail-copy">PRO</span>
            <strong>{{ publishingInfo.proName || "Not set" }}</strong>
          </div>
        </div>

        <AppEmptyState
          v-else
          compact
          icon="file"
          title="No publishing info"
          description="Publishing info has not been entered for this artist yet."
          class="border-0 bg-transparent shadow-none"
        />
      </DataPanel>
    </div>
  </div>

  <Dialog :open="avatarCropDialogOpen" @update:open="setAvatarCropDialogOpen">
    <DialogContent class="avatar-crop-dialog" :show-close-button="!isUploadingAvatar && !isSelectingAvatarLibrary">
      <DialogHeader>
        <DialogTitle>Profile picture</DialogTitle>
        <DialogDescription>
          Upload a new picture or reuse a previously uploaded one.
        </DialogDescription>
      </DialogHeader>

      <div class="avatar-picture-tabs" role="tablist" aria-label="Profile picture options">
        <button
          type="button"
          class="avatar-picture-tab"
          :class="{ active: avatarPictureTab === 'upload' }"
          :aria-selected="avatarPictureTab === 'upload'"
          role="tab"
          @click="avatarPictureTab = 'upload'"
        >
          Upload
        </button>
        <button
          type="button"
          class="avatar-picture-tab"
          :class="{ active: avatarPictureTab === 'library' }"
          :aria-selected="avatarPictureTab === 'library'"
          role="tab"
          @click="avatarPictureTab = 'library'; loadAvatarLibrary()"
        >
          Previous
        </button>
      </div>

      <div v-if="avatarPictureTab === 'upload'" class="avatar-crop-body">
        <button
          v-if="!avatarCropImageUrl"
          type="button"
          class="avatar-upload-dropzone"
          :class="{ active: avatarUploadDropActive }"
          :disabled="avatarPickerDisabled"
          @click="openAvatarFilePicker"
          @dragenter="handleAvatarDragEnter"
          @dragover.prevent
          @dragleave="handleAvatarDragLeave"
          @drop="handleAvatarDrop"
        >
          <Upload class="size-5" />
          <span>Drag and drop a picture here</span>
          <small>or click to choose a JPG, PNG, or WEBP</small>
        </button>

        <template v-else>
          <div
            class="avatar-crop-stage"
            :class="{ dragging: avatarCropDrag.active }"
            role="img"
            aria-label="Profile picture crop preview"
            @pointerdown="startAvatarCropDrag"
            @pointermove="moveAvatarCropDrag"
            @pointerup="endAvatarCropDrag"
            @pointercancel="endAvatarCropDrag"
          >
            <img
              :src="avatarCropImageUrl"
              :style="avatarCropImageStyle"
              alt=""
              draggable="false"
              @load="handleAvatarCropImageLoad"
            >
            <span class="avatar-crop-ring" aria-hidden="true" />
          </div>

          <div class="avatar-crop-controls">
            <label for="avatar-crop-zoom">Zoom</label>
            <input
              id="avatar-crop-zoom"
              v-model.number="avatarCropZoom"
              type="range"
              min="1"
              max="3"
              step="0.01"
              :disabled="isUploadingAvatar"
            >
            <Button type="button" variant="ghost" size="xs" :disabled="isUploadingAvatar" @click="resetAvatarCropPosition">
              <RotateCcw class="size-3.5" />
              Reset
            </Button>
          </div>
        </template>
      </div>

      <div v-else class="avatar-library-panel">
        <p v-if="isLoadingAvatarLibrary" class="field-note">Loading saved pictures...</p>
        <p v-else-if="!hasAvatarLibraryItems" class="field-note">No previous profile pictures yet.</p>
        <div v-else class="avatar-library-grid">
          <div
            v-for="item in avatarLibraryItems"
            :key="item.id"
            class="avatar-library-item"
            :class="{ current: item.isCurrent }"
          >
            <div class="avatar-library-thumb">
              <img :src="item.avatarUrl" alt="">
              <span v-if="item.isCurrent" class="avatar-library-current">Active</span>
            </div>
            <div class="avatar-library-actions">
              <Button
                type="button"
                variant="secondary"
                size="xs"
                :disabled="item.isCurrent || isSelectingAvatarLibrary || Boolean(deletingAvatarImageId)"
                @click="useAvatarLibraryImage(item)"
              >
                {{ item.isCurrent ? "Using" : "Use picture" }}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                :disabled="item.isCurrent || Boolean(deletingAvatarImageId)"
                :aria-label="item.isCurrent ? 'Current picture cannot be deleted' : 'Delete saved picture'"
                @click="deleteAvatarLibraryImage(item)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" :disabled="isUploadingAvatar || isSelectingAvatarLibrary" @click="setAvatarCropDialogOpen(false)">
          Cancel
        </Button>
        <Button
          v-if="avatarPictureTab === 'upload'"
          type="button"
          :disabled="isUploadingAvatar || !avatarCropImageElement"
          @click="confirmAvatarCropUpload"
        >
          {{ isUploadingAvatar ? "Uploading..." : "Use picture" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.artist-avatar-picker {
  display: grid;
  grid-column: 1 / -1;
  gap: 12px;
  padding: 0;
}

:global(.dark) .artist-avatar-picker {
  color: var(--foreground);
}

.artist-avatar-preview-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.settings-avatar-preview {
  width: 56px;
  height: 56px;
  border: 1px solid color-mix(in srgb, var(--border) 72%, var(--chart-1) 28%);
  border-radius: 999px !important;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 28%);
}

.avatar-mode-tabs {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  width: min(100%, 430px);
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--border) 86%, var(--foreground) 8%);
  border-radius: 10px;
  background: color-mix(in srgb, var(--muted) 38%, var(--card));
}

.avatar-mode-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  gap: 8px;
  min-width: 0;
  padding: 0 13px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: color-mix(in srgb, var(--muted-foreground) 86%, var(--foreground) 14%);
  font-size: 13px;
  font-weight: 620;
  white-space: nowrap;
  transition:
    background 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.avatar-mode-tab:hover:not(:disabled):not(.active) {
  background: color-mix(in srgb, var(--foreground) 4%, transparent);
  color: var(--foreground);
}

.avatar-mode-tab.active {
  background: color-mix(in srgb, var(--card) 88%, var(--priority) 7%);
  color: var(--foreground);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--priority) 28%, var(--border)),
    inset 0 1px 0 rgb(255 255 255 / 34%),
    0 10px 20px -18px color-mix(in srgb, var(--priority) 32%, transparent);
}

:global(.dark) .avatar-mode-tabs {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 90%, var(--foreground) 7%);
  background: color-mix(in srgb, var(--card) 58%, #0a0a0a 42%);
}

:global(.dark) .avatar-mode-tab:hover:not(:disabled):not(.active) {
  background: color-mix(in srgb, var(--foreground) 5%, transparent);
}

:global(.dark) .avatar-mode-tab.active {
  background: color-mix(in srgb, var(--card) 86%, var(--priority) 6%);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--priority) 24%, var(--surface-border, var(--border))),
    inset 0 1px 0 rgb(254 249 231 / 6%),
    0 12px 22px -20px rgb(0 0 0 / 78%);
}

.avatar-mode-tab:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--priority) 58%, transparent);
  outline-offset: 2px;
}

.avatar-mode-tab:disabled,
.avatar-preset-option:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.avatar-preset-shell {
  display: grid;
  gap: 10px;
}

.avatar-preset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.avatar-preset-option {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  transition:
    border-color 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.avatar-preset-option:hover:not(:disabled),
.avatar-preset-option.active {
  border-color: color-mix(in srgb, var(--chart-1) 58%, var(--border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--chart-1) 12%, transparent);
  transform: translateY(-1px);
}

.avatar-preset-preview {
  width: 32px;
  height: 32px;
  border-radius: 999px !important;
}

.avatar-preset-more {
  justify-self: start;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--border) 86%, var(--priority) 14%);
  border-radius: 7px;
  background: color-mix(in srgb, var(--card) 94%, var(--priority) 4%);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 640;
  transition:
    border-color 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    background 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color 160ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.avatar-preset-more:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--priority) 34%, var(--border));
  background: color-mix(in srgb, var(--card) 88%, var(--priority) 8%);
}

.avatar-preset-more:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

:global(.dark) .avatar-preset-more {
  background: color-mix(in srgb, var(--card) 90%, var(--priority) 4%);
}

.avatar-color-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  padding: 0;
}

:global(.dark) .avatar-color-editor {
  color: var(--foreground);
}

.avatar-color-editor-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
}

.avatar-color-editor-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--foreground);
  font-size: 13px;
  line-height: 1;
}

.avatar-color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.avatar-color-control {
  position: relative;
  display: block;
  width: 30px;
  height: 30px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 62%, var(--avatar-control-color));
  border-radius: 999px;
  background: var(--avatar-control-color);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 28%);
  cursor: pointer;
}

.avatar-color-control input {
  position: absolute;
  inset: -8px;
  width: calc(100% + 16px);
  height: calc(100% + 16px);
  border: 0;
  padding: 0;
  cursor: pointer;
  opacity: 0;
}

.avatar-color-control:has(input:disabled) {
  cursor: not-allowed;
  opacity: 0.6;
}

.avatar-upload-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.avatar-crop-dialog {
  max-width: 500px;
}

.avatar-picture-tabs {
  display: flex;
  gap: 8px;
}

.avatar-picture-tab {
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--card);
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 650;
}

.avatar-picture-tab.active,
.avatar-picture-tab:hover {
  border-color: color-mix(in srgb, var(--chart-1) 38%, var(--border));
  background: color-mix(in srgb, var(--muted) 72%, transparent);
  color: var(--foreground);
}

.avatar-upload-dropzone {
  display: grid;
  justify-items: center;
  gap: 6px;
  width: 100%;
  min-height: 150px;
  padding: 18px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--foreground);
  text-align: center;
}

.avatar-upload-dropzone.active,
.avatar-upload-dropzone:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--chart-1) 58%, var(--border));
  background: color-mix(in srgb, var(--muted) 42%, transparent);
}

.avatar-upload-dropzone small {
  color: var(--muted-foreground);
  font-size: 12px;
}

.avatar-crop-body {
  display: grid;
  justify-items: center;
  gap: 16px;
}

.avatar-library-panel {
  min-height: 190px;
}

.avatar-library-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
  gap: 10px;
}

.avatar-library-item {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card);
  box-shadow: none;
}

.avatar-library-item.current {
  border-color: color-mix(in srgb, var(--chart-1) 54%, var(--border));
}

.avatar-library-thumb {
  position: relative;
  display: grid;
  place-items: center;
}

.avatar-library-thumb img {
  width: 68px;
  height: 68px;
  border: 1px solid var(--border);
  border-radius: 999px;
  object-fit: cover;
  box-shadow: none;
}

.avatar-library-current {
  position: absolute;
  right: -8px;
  bottom: -2px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--card);
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
}

.avatar-library-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
}

:global(.dark) .avatar-library-item {
  background: var(--card);
  box-shadow: none;
}

.avatar-crop-stage {
  position: relative;
  width: 280px;
  height: 280px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 72%, var(--chart-1) 28%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 72%, transparent);
  box-shadow: none;
  cursor: grab;
  touch-action: none;
}

.avatar-crop-stage.dragging {
  cursor: grabbing;
}

.avatar-crop-stage img {
  position: absolute;
  top: 50%;
  left: 50%;
  max-width: none;
  object-fit: contain;
  user-select: none;
  will-change: transform;
}

.avatar-crop-ring {
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, var(--chart-1) 38%, white 20%);
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 18%),
    inset 0 0 0 999px rgb(0 0 0 / 0%);
  pointer-events: none;
}

.avatar-crop-controls {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.avatar-crop-controls label {
  color: var(--foreground);
  font-size: 0.8125rem;
  font-weight: 650;
}

.avatar-crop-controls input[type="range"] {
  width: 100%;
  accent-color: var(--chart-1);
}
</style>
