<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Archive,
  Ban,
  CheckSquare,
  ExternalLink,
  Eye,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Snowflake,
  Sun,
  Trash2,
  X,
} from "lucide-vue-next"
import type { RowAction } from "~/components/RowActions.vue"
import type {
  AdminArtistMutationResponse,
  AdminArtistOverview,
  AdminArtistPasswordMutationResponse,
  AdminArtistsResponse,
  AdminBulkArtistDeleteResponse,
  AdminInvitesResponse,
  AdminLoginInviteDeleteResponse,
  AdminLoginInviteMutationResponse,
  AdminLoginInviteRecord,
  LoginInviteStatus,
  TransactionalEmailDelivery,
} from "~~/types/settings"
import {
  buildAccessDraft,
  emptyAccessDraft,
  nullableText,
  normalizedEmail,
  normalizedOptionalText,
  normalizedText,
  type AccessDraft,
} from "~/utils/admin-access"
import { countryNameFor } from "~~/app/utils/country-flags"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

interface ArtistDraft {
  name: string
  email: string
  artistSharePct: string
  avatarUrl: string
  country: string
  bio: string
  legalName: string
  ipiNumber: string
  proName: string
}

interface ArtistActionState {
  isSaving: boolean
  activeAction: "" | "freeze" | "unfreeze" | "archive" | "permanentDelete" | "password"
  successMessage: string
  errorMessage: string
}

interface ArtistPasswordDraft {
  password: string
  confirmPassword: string
}

interface AddAccessForm {
  role: "artist" | "admin"
  accessMethod: "password" | "gmailInvite"
  artistName: string
  fullName: string
  email: string
  password: string
  artistSharePct: string
  country: string
  bio: string
}

const route = useRoute()
const { refreshViewerContext } = useViewerContext()

const compactDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

const searchQuery = ref("")
const accessSearchQuery = ref("")
const accessStatusFilter = ref<"all" | LoginInviteStatus>("all")
const isSubmittingAccess = ref(false)
const createSuccessMessage = ref("")
const createErrorMessage = ref("")
const accessSuccessMessage = ref("")
const accessErrorMessage = ref("")
const directorySuccessMessage = ref("")
const directoryErrorMessage = ref("")
const startingViewAsArtistId = ref("")
const savingInviteId = ref("")
const isBulkDeletingArtists = ref(false)
const isBulkDeletingInvites = ref(false)
const selectedArtistIds = ref<string[]>([])
const selectedInviteIds = ref<string[]>([])
const artistDrafts = reactive<Record<string, ArtistDraft>>({})
const artistPasswordDrafts = reactive<Record<string, ArtistPasswordDraft>>({})
const artistStates = reactive<Record<string, ArtistActionState>>({})
const inviteDrafts = reactive<Record<string, AccessDraft>>({})
const { confirmAction } = useConfirmAction()

// ── Dialog state ──
const addAccessOpen = ref(false)
const editArtistOpen = ref(false)
const artistDetailsOpen = ref(false)
const editInviteOpen = ref(false)
const inviteDetailsOpen = ref(false)
const activeArtistId = ref("")
const activeInviteId = ref("")

const addAccessForm = reactive<AddAccessForm>(emptyAddAccessForm())

function emptyAddAccessForm(): AddAccessForm {
  return {
    role: "artist",
    accessMethod: "password",
    artistName: "",
    fullName: "",
    email: "",
    password: "",
    artistSharePct: "",
    country: "",
    bio: "",
  }
}

const {
  data: artistData,
  error: artistsError,
  pending: artistsPending,
  refresh: refreshArtists,
} = useLazyFetch<AdminArtistsResponse>("/api/admin/artists")
const {
  data: inviteData,
  error: invitesError,
  pending: invitesPending,
  refresh: refreshInvites,
} = useLazyFetch<AdminInvitesResponse>("/api/admin/invites")

useRevealPage({
  ready: computed(() => !artistsPending.value || !!artistData.value),
})

const artists = computed(() =>
  (artistData.value?.artists ?? []).filter((artist): artist is AdminArtistOverview => Boolean(artist)),
)
const invites = computed(() => inviteData.value?.invites ?? [])
const inviteSummary = computed(() => inviteData.value?.summary ?? {
  pendingCount: 0,
  acceptedCount: 0,
  revokedCount: 0,
  artistInviteCount: 0,
  adminInviteCount: 0,
})

const activeArtist = computed(() => artists.value.find((artist) => artist.id === activeArtistId.value) ?? null)
const activeInvite = computed(() => invites.value.find((invite) => invite.id === activeInviteId.value) ?? null)
const addAccessIsArtist = computed(() => addAccessForm.role === "artist")
const addAccessIsPassword = computed(() => addAccessForm.role === "artist" && addAccessForm.accessMethod === "password")

const filteredArtists = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  if (!query) {
    return artists.value
  }

  return artists.value.filter((artist) => {
    return [
      artist.name,
      artist.email,
      artist.artistSharePct,
      artist.country,
      artist.bio,
      artist.publishingInfo?.legalName,
      artist.publishingInfo?.ipiNumber,
      artist.publishingInfo?.proName,
    ].some((value) =>
      String(value ?? "")
        .toLowerCase()
        .includes(query),
    )
  })
})

const preparedFilteredArtists = computed(() => {
  for (const artist of filteredArtists.value) {
    if (!artistDrafts[artist.id]) {
      artistDrafts[artist.id] = buildArtistDraft(artist)
    }

    ensureArtistState(artist.id)
    ensureArtistPasswordDraft(artist.id)
  }

  return filteredArtists.value
})

const filteredInvites = computed(() => {
  const query = accessSearchQuery.value.trim().toLowerCase()

  return invites.value.filter((invite) => {
    if (accessStatusFilter.value !== "all" && invite.status !== accessStatusFilter.value) {
      return false
    }

    if (!query) {
      return true
    }

    return [
      invite.email,
      invite.fullName,
      invite.artistName ?? "",
      invite.artistSharePct ?? "",
      invite.role,
      invite.status,
      invite.invitedByAdminName ?? "",
      invite.acceptedByName ?? "",
      invite.revokedByAdminName ?? "",
    ].some((value) => value.toLowerCase().includes(query))
  })
})

const metrics = computed(() => [
  {
    label: "Active artists",
    value: String(artists.value.length),
    footnote: "Visible in the platform right now.",
    tone: "accent" as const,
  },
  {
    label: "Pending artist invites",
    value: String(invites.value.filter((invite) => invite.role === "artist" && invite.status === "pending").length),
    footnote: "Artist Gmail accounts still waiting for first sign-in.",
    tone: "default" as const,
  },
  {
    label: "Pending admin invites",
    value: String(invites.value.filter((invite) => invite.role === "admin" && invite.status === "pending").length),
    footnote: "Admin Gmail access still waiting for first sign-in.",
    tone: "alt" as const,
  },
  {
    label: "Accepted invites",
    value: String(inviteSummary.value.acceptedCount),
    footnote: "Provisioned through the Google callback already.",
    tone: "default" as const,
  },
  {
    label: "Bank details saved",
    value: String(artists.value.filter((artist) => artist.bankDetails).length),
    footnote: "Ready for payout processing.",
    tone: "default" as const,
  },
  {
    label: "Publishing info saved",
    value: String(artists.value.filter((artist) => artist.publishingInfo).length),
    footnote: "Legal metadata present.",
    tone: "default" as const,
  },
])

const artistDirectoryColumns = [
  {
    key: "select",
    label: "",
    accessor: (row: any) => artistDisplayName(row),
    sortable: false,
    searchable: false,
    hideable: false,
    class: "w-10",
  },
  { key: "artist", label: "Artist", accessor: (row: any) => artistDisplayName(row) },
  { key: "deal", label: "Deal", accessor: (row: any) => row.artistSharePct ?? "" },
  { key: "country", label: "Country", accessor: (row: any) => countryNameFor(row.country, "Not set") },
  { key: "access", label: "Access", accessor: (row: any) => row.loginFrozenAt ? "Frozen" : row.isActive ? "Active" : "Inactive" },
  { key: "bank", label: "Bank", accessor: (row: any) => row.bankDetails ? "Saved" : "Missing" },
  { key: "publishing", label: "Publishing", accessor: (row: any) => row.publishingInfo ? "Saved" : "Missing" },
  { key: "created", label: "Created", accessor: (row: any) => row.createdAt },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
]

const inviteColumns = [
  {
    key: "select",
    label: "",
    accessor: (row: any) => row.email,
    sortable: false,
    searchable: false,
    hideable: false,
    class: "w-10",
  },
  { key: "email", label: "Email", accessor: (row: any) => row.email },
  { key: "role", label: "Role", accessor: (row: any) => row.role },
  { key: "name", label: "Name", accessor: (row: any) => row.fullName },
  { key: "share", label: "Share %", accessor: (row: any) => row.artistSharePct ?? "" },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "created", label: "Invited", accessor: (row: any) => row.createdAt },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
]

const activeArtistSection = ref(route.query.section === "access" ? "access" : "directory")

const selectedArtistIdSet = computed(() => new Set(selectedArtistIds.value))
const selectedArtists = computed(() =>
  artists.value.filter((artist) => selectedArtistIdSet.value.has(artist.id)),
)
const selectedArtistCount = computed(() => selectedArtistIds.value.length)
const hasSelectedArtists = computed(() => selectedArtistCount.value > 0)
const selectedInviteIdSet = computed(() => new Set(selectedInviteIds.value))
const selectedInvites = computed(() =>
  invites.value.filter((invite) => selectedInviteIdSet.value.has(invite.id)),
)
const selectedInviteCount = computed(() => selectedInviteIds.value.length)
const hasSelectedInvites = computed(() => selectedInviteCount.value > 0)
const allVisibleArtistsSelected = computed(() =>
  Boolean(preparedFilteredArtists.value.length)
  && preparedFilteredArtists.value.every((artist) => selectedArtistIdSet.value.has(artist.id)),
)
const filteredInviteIds = computed(() => filteredInvites.value.map((invite) => invite.id))
const hasFilteredInvites = computed(() => filteredInviteIds.value.length > 0)
const allVisibleInvitesSelected = computed(() =>
  hasFilteredInvites.value
  && filteredInviteIds.value.every((inviteId) => selectedInviteIdSet.value.has(inviteId)),
)
const inviteSelectAllLabel = computed(() =>
  allVisibleInvitesSelected.value ? "Clear visible invite selection" : "Select all visible invites",
)
const selectedArtistPreviewNames = computed(() => {
  const names = selectedArtists.value.map((artist) => artistDisplayName(artist))
  const preview = names.slice(0, 5).join(", ")
  const remaining = names.length - 5

  return remaining > 0 ? `${preview}, and ${remaining} more` : preview
})
const selectedInvitePreviewNames = computed(() => {
  const names = selectedInvites.value.map((invite) => invite.email)
  const preview = names.slice(0, 5).join(", ")
  const remaining = names.length - 5

  return remaining > 0 ? `${preview}, and ${remaining} more` : preview
})

const artistSections = computed(() => [
  {
    label: "Directory",
    value: "directory",
    badge: artists.value.length,
  },
  {
    label: "Access Queue",
    value: "access",
    badge: inviteSummary.value.pendingCount,
  },
])

const artistSectionFolders = computed(() => artistSections.value.map((section) => ({
  ...section,
  icon: section.label.slice(0, 1),
  meta: section.value === "directory"
    ? "Artist records and profile operations"
    : "Gmail invites and access review",
  tone: section.value === "directory" ? "accent" as const : "default" as const,
})))

watch(
  artists,
  (value) => {
    const activeArtistIds = new Set(value.map((artist) => artist.id))

    for (const artist of value) {
      if (!artistDrafts[artist.id]) {
        artistDrafts[artist.id] = buildArtistDraft(artist)
      }

      ensureArtistState(artist.id)
      ensureArtistPasswordDraft(artist.id)
    }

    for (const artistId of Object.keys(artistDrafts)) {
      if (!activeArtistIds.has(artistId)) {
        delete artistDrafts[artistId]
      }
    }

    for (const artistId of Object.keys(artistPasswordDrafts)) {
      if (!activeArtistIds.has(artistId)) {
        delete artistPasswordDrafts[artistId]
      }
    }

    for (const artistId of Object.keys(artistStates)) {
      if (!activeArtistIds.has(artistId)) {
        delete artistStates[artistId]
      }
    }

    selectedArtistIds.value = selectedArtistIds.value.filter((artistId) => activeArtistIds.has(artistId))
  },
  { immediate: true },
)

watch(
  invites,
  (value) => {
    const activeInviteIds = new Set(value.map((invite) => invite.id))

    for (const invite of value) {
      inviteDrafts[invite.id] = buildAccessDraft(invite)
    }

    for (const inviteId of Object.keys(inviteDrafts)) {
      if (!activeInviteIds.has(inviteId)) {
        delete inviteDrafts[inviteId]
      }
    }

    selectedInviteIds.value = selectedInviteIds.value.filter((inviteId) => activeInviteIds.has(inviteId))
  },
  { immediate: true },
)

// Close artist dialogs if the active artist leaves the list (archive/delete).
watch(activeArtist, (value) => {
  if (!value) {
    editArtistOpen.value = false
    artistDetailsOpen.value = false
  }
})

watch(activeInvite, (value) => {
  if (!value) {
    editInviteOpen.value = false
    inviteDetailsOpen.value = false
  }
})

watch(
  () => addAccessForm.role,
  (value) => {
    if (value === "admin") {
      addAccessForm.accessMethod = "gmailInvite"
    }
  },
)

watch(
  () => addAccessForm.accessMethod,
  (value) => {
    if (value === "gmailInvite") {
      addAccessForm.password = ""
    }
  },
)

watch(
  () => route.query.section,
  () => {
    if (route.query.section === "access") {
      activeArtistSection.value = "access"
    }
  },
)

function buildArtistDraft(artist: AdminArtistOverview): ArtistDraft {
  return {
    name: artist.name,
    email: artist.email ?? "",
    artistSharePct: artist.artistSharePct ?? "",
    avatarUrl: artist.avatarUrl ?? "",
    country: artist.country ?? "",
    bio: artist.bio ?? "",
    legalName: artist.publishingInfo?.legalName ?? "",
    ipiNumber: artist.publishingInfo?.ipiNumber ?? "",
    proName: artist.publishingInfo?.proName ?? "",
  }
}

function ensureArtistState(artistId: string) {
  if (!artistStates[artistId]) {
    artistStates[artistId] = {
      isSaving: false,
      activeAction: "",
      successMessage: "",
      errorMessage: "",
    }
  }

  return artistStates[artistId]
}

function ensureArtistPasswordDraft(artistId: string) {
  if (!artistPasswordDrafts[artistId]) {
    artistPasswordDrafts[artistId] = {
      password: "",
      confirmPassword: "",
    }
  }

  return artistPasswordDrafts[artistId]
}

function resetArtistPasswordDraft(artistId: string) {
  artistPasswordDrafts[artistId] = {
    password: "",
    confirmPassword: "",
  }
}

function clearArtistMessages(artistId: string) {
  const state = ensureArtistState(artistId)
  state.successMessage = ""
  state.errorMessage = ""
}

function resetAccessMessages() {
  accessSuccessMessage.value = ""
  accessErrorMessage.value = ""
}

function resetDirectoryMessage() {
  directorySuccessMessage.value = ""
  directoryErrorMessage.value = ""
}

function formatDate(value: string | null) {
  if (!value) {
    return "Unknown date"
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return "Unknown date"
  }

  return compactDateFormatter.format(parsedDate)
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available"
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return "Not available"
  }

  return dateTimeFormatter.format(parsedDate)
}

function formatArtistSharePct(value: string | number | null | undefined) {
  if (value === null || typeof value === "undefined" || value === "") {
    return "Not set"
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)}%` : "Not set"
}

function statusLabel(status: LoginInviteStatus) {
  switch (status) {
    case "pending":
      return "Pending"
    case "accepted":
      return "Accepted"
    case "revoked":
      return "Revoked"
  }
}

function statusTone(status: LoginInviteStatus) {
  switch (status) {
    case "pending":
      return "warning"
    case "accepted":
      return "success"
    case "revoked":
      return "danger"
  }
}

function canEditInvite(invite: AdminLoginInviteRecord) {
  return invite.status !== "accepted"
}

function hasArtistChanges(artist: AdminArtistOverview) {
  const draft = artistDrafts[artist.id]

  if (!draft) {
    return false
  }

  return (
    normalizedText(draft.name) !== normalizedText(artist.name)
    || normalizedEmail(draft.email) !== normalizedEmail(artist.email)
    || normalizedOptionalText(draft.artistSharePct) !== normalizedOptionalText(artist.artistSharePct)
    || normalizedText(draft.avatarUrl) !== normalizedText(artist.avatarUrl)
    || normalizedOptionalText(draft.country) !== normalizedOptionalText(artist.country)
    || normalizedOptionalText(draft.bio) !== normalizedOptionalText(artist.bio)
    || normalizedOptionalText(draft.legalName) !== normalizedOptionalText(artist.publishingInfo?.legalName)
    || normalizedOptionalText(draft.ipiNumber) !== normalizedOptionalText(artist.publishingInfo?.ipiNumber)
    || normalizedOptionalText(draft.proName) !== normalizedOptionalText(artist.publishingInfo?.proName)
  )
}

function replaceArtist(updatedArtist: AdminArtistOverview) {
  if (!artistData.value) {
    artistData.value = {
      artists: [updatedArtist],
    }
    return
  }

  artistData.value = {
    artists: artistData.value.artists.map((artist) => (artist.id === updatedArtist.id ? updatedArtist : artist)),
  }
}

function saveMessageForSections(sections: AdminArtistMutationResponse["updatedSections"]) {
  if (!sections.length) {
    return "No changes were detected."
  }

  if (sections.includes("artist") && sections.includes("publishingInfo")) {
    return "Saved artist details and publishing info."
  }

  if (sections.includes("artist")) {
    return "Saved artist details."
  }

  if (sections.includes("publishingInfo")) {
    return "Saved publishing info."
  }

  return "Saved artist changes."
}

function artistActionLabel(action: ArtistActionState["activeAction"]) {
  switch (action) {
    case "freeze":
      return "Freezing..."
    case "unfreeze":
      return "Unfreezing..."
    case "archive":
      return "Archiving..."
    case "permanentDelete":
      return "Deleting forever..."
    case "password":
      return "Changing password..."
    default:
      return ""
  }
}

function isArtistBusy(artistId: string) {
  const state = ensureArtistState(artistId)
  return isBulkDeletingArtists.value || state.isSaving || Boolean(state.activeAction)
}

function sharedAccountWarning(artist: AdminArtistOverview) {
  if (artist.sharedAccountArtistCount <= 1) {
    return ""
  }

  return `This login is shared by ${artist.sharedAccountArtistCount} artists. Freezing it blocks sign-in for all of them.`
}

function passwordSharedAccountWarning(artist: AdminArtistOverview) {
  if (artist.sharedAccountArtistCount <= 1) {
    return ""
  }

  return `Changing this password updates the shared dashboard login for all ${artist.sharedAccountArtistCount} artists.`
}

function hasArtistPasswordInput(artistId: string) {
  const draft = artistPasswordDrafts[artistId]

  return Boolean(draft?.password || draft?.confirmPassword)
}

function artistDisplayName(artist: AdminArtistOverview) {
  return String(artistDrafts[artist.id]?.name || artist.name || "Unnamed artist").trim() || "Unnamed artist"
}

function artistInitial(artist: AdminArtistOverview) {
  return artistDisplayName(artist).slice(0, 1).toUpperCase()
}

function isArtistSelected(artistId: string) {
  return selectedArtistIdSet.value.has(artistId)
}

function toggleArtistSelection(artistId: string, checked: boolean) {
  const next = new Set(selectedArtistIds.value)

  if (checked) {
    next.add(artistId)
  } else {
    next.delete(artistId)
  }

  selectedArtistIds.value = [...next]
}

function selectAllVisibleArtists() {
  const next = new Set(selectedArtistIds.value)

  for (const artist of preparedFilteredArtists.value) {
    next.add(artist.id)
  }

  selectedArtistIds.value = [...next]
  resetDirectoryMessage()
}

function clearSelectedArtists() {
  selectedArtistIds.value = []
  resetDirectoryMessage()
}

function isInviteSelected(inviteId: string) {
  return selectedInviteIdSet.value.has(inviteId)
}

function toggleInviteSelection(inviteId: string, checked: boolean) {
  const next = new Set(selectedInviteIds.value)

  if (checked) {
    next.add(inviteId)
  } else {
    next.delete(inviteId)
  }

  selectedInviteIds.value = [...next]
}

function toggleVisibleInviteSelection(checked: boolean) {
  const next = new Set(selectedInviteIds.value)

  for (const inviteId of filteredInviteIds.value) {
    if (checked) {
      next.add(inviteId)
    } else {
      next.delete(inviteId)
    }
  }

  selectedInviteIds.value = [...next]
}

function clearSelectedInvites() {
  selectedInviteIds.value = []
  resetAccessMessages()
}

function bulkDeleteFailureMessage(response: AdminBulkArtistDeleteResponse) {
  if (!response.failure) {
    return "Permanent delete stopped before every selected artist was deleted."
  }

  const fallbackArtist = selectedArtists.value.find((artist) => artist.id === response.failure?.artistId)
  const artistName = response.failure.artistName || fallbackArtist?.name || response.failure.artistId || "the selected artist"
  const deletedCount = response.failure.deletedBeforeFailure
  const deletedText = deletedCount === 1 ? "1 artist was deleted before the error." : `${deletedCount} artists were deleted before the error.`

  return `Permanent delete stopped at ${artistName}. ${deletedText} ${response.failure.statusMessage}`
}

async function permanentlyDeleteSelectedArtists() {
  const artistIds = [...selectedArtistIds.value]

  if (!artistIds.length) {
    return
  }

  const count = artistIds.length
  const confirmed = await confirmAction({
    title: `Permanent delete ${count} ${count === 1 ? "artist" : "artists"}?`,
    description: `This destroys artist records, catalog, finance, analytics, payout history, CSV upload rows, and stored CSV/release/avatar files for ${selectedArtistPreviewNames.value || "the selected artists"}. This cannot be undone.`,
    confirmLabel: "Delete forever",
    cancelLabel: "No, keep artists",
    variant: "destructive",
    requiredText: "DELETE",
    adminVerification: { action: "artist.bulk_permanently_deleted" },
  })

  if (!confirmed) {
    return
  }

  isBulkDeletingArtists.value = true
  resetDirectoryMessage()

  try {
    const response = await $fetch("/api/admin/artists/bulk-permanent-delete", {
      method: "POST",
      body: {
        artistIds,
      },
    }) as AdminBulkArtistDeleteResponse

    if (response.deletedArtistIds.length) {
      await Promise.all([refreshArtists(), refreshInvites()])
    }

    const deletedIds = new Set(response.deletedArtistIds)
    selectedArtistIds.value = selectedArtistIds.value.filter((artistId) => !deletedIds.has(artistId))

    if (response.ok) {
      selectedArtistIds.value = []
      directorySuccessMessage.value = `Permanently deleted ${response.deletedArtistIds.length} ${response.deletedArtistIds.length === 1 ? "artist" : "artists"}.`
      return
    }

    directoryErrorMessage.value = bulkDeleteFailureMessage(response)
  } catch (fetchError: any) {
    directoryErrorMessage.value =
      fetchError?.data?.statusMessage || fetchError?.message || "Unable to permanently delete the selected artists."
  } finally {
    isBulkDeletingArtists.value = false
  }
}

async function runArtistLifecycleAction(
  artist: AdminArtistOverview,
  action: ArtistActionState["activeAction"],
  path: string,
  confirmMessage: string,
  successMessage: string,
) {
  const state = ensureArtistState(artist.id)

  const confirmed = await confirmAction({
    title: "Confirm artist access change",
    description: confirmMessage,
    confirmLabel: action === "permanentDelete"
      ? "Delete forever"
      : action === "archive"
        ? "Archive artist"
      : action === "freeze"
        ? "Freeze login"
        : "Continue",
    variant: action === "permanentDelete" || action === "archive" || action === "freeze" ? "destructive" : "default",
    requiredText: action === "permanentDelete" ? "DELETE" : undefined,
    adminVerification: action === "permanentDelete" ? { action: "artist.permanently_deleted" } : undefined,
  })

  if (!confirmed) {
    return
  }

  state.activeAction = action
  state.errorMessage = ""
  state.successMessage = ""
  resetDirectoryMessage()

  try {
    await $fetch(`/api/admin/artists/${artist.id}/${path}`, {
      method: "POST",
    })

    await Promise.all([refreshArtists(), refreshInvites()])
    directorySuccessMessage.value = successMessage
  } catch (fetchError: any) {
    state.errorMessage = fetchError?.data?.statusMessage || fetchError?.message || "Unable to update this artist lifecycle action."
    directoryErrorMessage.value = state.errorMessage
  } finally {
    state.activeAction = ""
  }
}

function buildInvitePayload(draft: { email: string; role: AccessDraft["role"]; fullName: string; artistName: string; artistSharePct: string; country: string; bio: string }) {
  return {
    email: draft.email,
    role: draft.role,
    fullName: draft.fullName,
    artistName: draft.role === "artist" ? draft.artistName : null,
    artistSharePct: draft.role === "artist" ? draft.artistSharePct : null,
    country: nullableText(draft.country),
    bio: nullableText(draft.bio),
  }
}

function setAccessSuccess(message: string) {
  accessSuccessMessage.value = message
  accessErrorMessage.value = ""
}

function setAccessError(error: any, fallback: string) {
  accessErrorMessage.value = error?.data?.statusMessage || error?.message || fallback
  accessSuccessMessage.value = ""
}

function emailDeliverySentence(delivery?: TransactionalEmailDelivery | null) {
  if (!delivery) {
    return " Email delivery was not reported by this deployment."
  }

  if (delivery.ok) {
    return " Email sent."
  }

  if (delivery.skipped === "missing_resend_api_key") {
    return " Email was not sent because RESEND_API_KEY is missing."
  }

  if (delivery.skipped === "disabled") {
    return " Email sending is disabled."
  }

  if (delivery.skipped === "missing_recipient") {
    return " Email was not sent because no recipient email was available."
  }

  return delivery.errorMessage
    ? ` Email was not sent: ${delivery.errorMessage}`
    : " Email was not sent."
}

// ── Add access (unified create) ──
function openAddAccess() {
  createSuccessMessage.value = ""
  createErrorMessage.value = ""
  Object.assign(addAccessForm, emptyAddAccessForm())
  addAccessOpen.value = true
}

async function submitAddAccess() {
  isSubmittingAccess.value = true
  createErrorMessage.value = ""
  resetDirectoryMessage()

  try {
    if (addAccessForm.role === "artist" && addAccessForm.accessMethod === "password") {
      const result = await $fetch("/api/admin/artists", {
        method: "POST",
        body: {
          stageName: addAccessForm.artistName,
          fullName: addAccessForm.fullName,
          email: addAccessForm.email,
          password: addAccessForm.password,
          artistSharePct: addAccessForm.artistSharePct,
          country: addAccessForm.country,
          bio: addAccessForm.bio,
        },
      }) as { artist: { name: string; email: string } }

      await refreshArtists()
      addAccessOpen.value = false
      directorySuccessMessage.value = `Created ${result.artist.name} (${result.artist.email}).`
      return
    }

    const result = await $fetch("/api/admin/invites", {
      method: "POST",
      body: buildInvitePayload({
        email: addAccessForm.email,
        role: addAccessForm.role,
        fullName: addAccessForm.fullName,
        artistName: addAccessForm.artistName,
        artistSharePct: addAccessForm.artistSharePct,
        country: addAccessForm.country,
        bio: addAccessForm.bio,
      }),
    }) as AdminLoginInviteMutationResponse

    await refreshInvites()
    addAccessOpen.value = false
    setAccessSuccess(`Created ${addAccessForm.role} Gmail invite for ${result.invite.email}.${emailDeliverySentence(result.emailDelivery)}`)
  } catch (fetchError: any) {
    createErrorMessage.value = fetchError?.data?.statusMessage || fetchError?.message || "Unable to create the access flow."
  } finally {
    isSubmittingAccess.value = false
  }
}

// ── Artist row actions + dialogs ──
function openArtistDetails(artist: AdminArtistOverview) {
  activeArtistId.value = artist.id
  artistDetailsOpen.value = true
}

function openEditArtist(artist: AdminArtistOverview) {
  if (!artistDrafts[artist.id]) {
    artistDrafts[artist.id] = buildArtistDraft(artist)
  }
  ensureArtistState(artist.id)
  ensureArtistPasswordDraft(artist.id)
  clearArtistMessages(artist.id)
  activeArtistId.value = artist.id
  editArtistOpen.value = true
}

function artistRowActions(artist: AdminArtistOverview): RowAction[] {
  return [
    { key: "view", label: "View as artist", icon: ExternalLink },
    { key: "details", label: "View details", icon: Eye },
    { key: "edit", label: "Edit artist", icon: Pencil },
    artist.loginFrozenAt
      ? { key: "unfreeze", label: "Unfreeze login", icon: Sun, separatorBefore: true }
      : { key: "freeze", label: "Freeze login", icon: Snowflake, variant: "destructive", separatorBefore: true },
    { key: "archive", label: "Archive artist", icon: Archive, variant: "destructive" },
    { key: "delete", label: "Permanent delete", icon: Trash2, variant: "destructive" },
  ]
}

function onArtistAction(key: string, artist: AdminArtistOverview) {
  switch (key) {
    case "view":
      void viewAsArtist(artist)
      break
    case "details":
      openArtistDetails(artist)
      break
    case "edit":
      openEditArtist(artist)
      break
    case "freeze":
      void freezeArtistLogin(artist)
      break
    case "unfreeze":
      void unfreezeArtistLogin(artist)
      break
    case "archive":
      void archiveArtist(artist)
      break
    case "delete":
      void permanentlyDeleteArtist(artist)
      break
  }
}

function resetArtistDraft(artist: AdminArtistOverview) {
  artistDrafts[artist.id] = buildArtistDraft(artist)
  clearArtistMessages(artist.id)
}

async function saveArtist(artist: AdminArtistOverview) {
  const draft = artistDrafts[artist.id]
  const state = ensureArtistState(artist.id)

  if (!draft) {
    return
  }

  state.isSaving = true
  state.errorMessage = ""
  state.successMessage = ""

  try {
    const result = await $fetch(`/api/admin/artists/${artist.id}`, {
      method: "PATCH",
      body: {
        name: draft.name,
        email: draft.email,
        artistSharePct: nullableText(draft.artistSharePct),
        avatarUrl: nullableText(draft.avatarUrl),
        country: nullableText(draft.country),
        bio: nullableText(draft.bio),
        publishingInfo: {
          legalName: nullableText(draft.legalName),
          ipiNumber: nullableText(draft.ipiNumber),
          proName: nullableText(draft.proName),
        },
      },
    })

    replaceArtist(result.artist)
    artistDrafts[artist.id] = buildArtistDraft(result.artist)
    state.successMessage = saveMessageForSections(result.updatedSections)
  } catch (fetchError: any) {
    state.errorMessage = fetchError?.data?.statusMessage || fetchError?.message || "Unable to save this artist."
  } finally {
    state.isSaving = false
  }
}

async function changeArtistPassword(artist: AdminArtistOverview) {
  const draft = ensureArtistPasswordDraft(artist.id)
  const state = ensureArtistState(artist.id)
  const password = draft.password.trim()
  const confirmPassword = draft.confirmPassword.trim()

  if (password.length < 8) {
    state.errorMessage = "Artist dashboard password must be at least 8 characters."
    state.successMessage = ""
    return
  }

  if (password !== confirmPassword) {
    state.errorMessage = "The dashboard password confirmation does not match."
    state.successMessage = ""
    return
  }

  const confirmed = await confirmAction({
    title: `Change password for ${artistDisplayName(artist)}?`,
    description: artist.sharedAccountArtistCount > 1
      ? `This updates the shared dashboard login password for all ${artist.sharedAccountArtistCount} artists on this account.`
      : "This updates the password this artist uses to sign in to the dashboard.",
    confirmLabel: "Change password",
    variant: "default",
    adminVerification: { action: "artist.password_changed" },
  })

  if (!confirmed) {
    return
  }

  state.activeAction = "password"
  state.errorMessage = ""
  state.successMessage = ""

  try {
    const result = await $fetch(`/api/admin/artists/${artist.id}/password`, {
      method: "POST",
      body: {
        password,
      },
    }) as AdminArtistPasswordMutationResponse

    resetArtistPasswordDraft(artist.id)
    state.successMessage = result.sharedAccountArtistCount > 1
      ? `Changed the shared dashboard password for ${result.sharedAccountArtistCount} artists.`
      : `Changed the dashboard password for ${artistDisplayName(artist)}.`
  } catch (fetchError: any) {
    state.errorMessage = fetchError?.data?.statusMessage || fetchError?.message || "Unable to change this artist dashboard password."
  } finally {
    state.activeAction = ""
  }
}

async function freezeArtistLogin(artist: AdminArtistOverview) {
  await runArtistLifecycleAction(
    artist,
    "freeze",
    "freeze",
    artist.sharedAccountArtistCount > 1
      ? `Freeze login for ${artist.name}? This will block sign-in for all ${artist.sharedAccountArtistCount} artists on this shared login.`
      : `Freeze login for ${artist.name}? The account will stay in the directory but nobody on this login can sign in until it is unfrozen.`,
    artist.sharedAccountArtistCount > 1
      ? `Froze the shared login for ${artist.name}. All sibling artists on that login are blocked until unfrozen.`
      : `Froze the login for ${artist.name}.`,
  )
}

async function unfreezeArtistLogin(artist: AdminArtistOverview) {
  await runArtistLifecycleAction(
    artist,
    "unfreeze",
    "unfreeze",
    `Unfreeze login for ${artist.name}? Sign-in access will be restored for every artist on this login.`,
    `Unfroze the login for ${artist.name}.`,
  )
}

async function archiveArtist(artist: AdminArtistOverview) {
  await runArtistLifecycleAction(
    artist,
    "archive",
    "archive",
    `Archive ${artist.name}? This removes dashboard access but keeps catalog, finance, and history available for restore from Settings.`,
    `Archived ${artist.name}. Restore the record from Settings when needed.`,
  )
}

async function permanentlyDeleteArtist(artist: AdminArtistOverview) {
  await runArtistLifecycleAction(
    artist,
    "permanentDelete",
    "permanent-delete",
    `Permanent delete ${artist.name}? This destroys the artist record and all linked catalog, finance, analytics, payout, and notification history. This cannot be undone.`,
    `Permanently deleted ${artist.name} and the linked app data.`,
  )
}

async function viewAsArtist(artist: AdminArtistOverview) {
  const state = ensureArtistState(artist.id)
  startingViewAsArtistId.value = artist.id
  state.errorMessage = ""
  state.successMessage = ""
  resetDirectoryMessage()

  try {
    await $fetch("/api/admin/impersonation", {
      method: "POST",
      body: {
        artistId: artist.id,
      },
    }) as AdminArtistMutationResponse
    await refreshViewerContext(true)
    await navigateTo("/dashboard")
  } catch (fetchError: any) {
    directoryErrorMessage.value = fetchError?.data?.statusMessage || fetchError?.message || "Unable to open this artist dashboard."
  } finally {
    startingViewAsArtistId.value = ""
  }
}

// ── Invite row actions + dialogs ──
function openInviteDetails(invite: AdminLoginInviteRecord) {
  activeInviteId.value = invite.id
  inviteDetailsOpen.value = true
}

function openEditInvite(invite: AdminLoginInviteRecord) {
  inviteDrafts[invite.id] = buildAccessDraft(invite)
  resetAccessMessages()
  activeInviteId.value = invite.id
  editInviteOpen.value = true
}

function inviteRowActions(invite: AdminLoginInviteRecord): RowAction[] {
  const actions: RowAction[] = [{ key: "details", label: "View details", icon: Eye }]

  if (canEditInvite(invite)) {
    actions.push({ key: "edit", label: "Edit invite", icon: Pencil })

    if (invite.status === "pending") {
      actions.push({ key: "resend", label: "Resend email", icon: Mail, separatorBefore: true })
      actions.push({ key: "revoke", label: "Revoke invite", icon: Ban, variant: "destructive" })
    } else if (invite.status === "revoked") {
      actions.push({ key: "reopen", label: "Reopen invite", icon: RotateCcw, separatorBefore: true })
    }

    actions.push({ key: "delete", label: "Delete invite", icon: Trash2, variant: "destructive" })
  }

  return actions
}

function onInviteAction(key: string, invite: AdminLoginInviteRecord) {
  switch (key) {
    case "details":
      openInviteDetails(invite)
      break
    case "edit":
      openEditInvite(invite)
      break
    case "resend":
      void resendInviteEmail(invite)
      break
    case "revoke":
      void changeInviteStatus(invite, "revoked")
      break
    case "reopen":
      void changeInviteStatus(invite, "pending")
      break
    case "delete":
      void deleteInvite(invite)
      break
  }
}

async function submitEditInvite() {
  const invite = activeInvite.value
  if (!invite) {
    return
  }
  await saveInvite(invite)
  if (!accessErrorMessage.value) {
    editInviteOpen.value = false
  }
}

function editFromArtistDetails() {
  if (activeArtist.value) {
    artistDetailsOpen.value = false
    openEditArtist(activeArtist.value)
  }
}

function editFromInviteDetails() {
  if (activeInvite.value) {
    inviteDetailsOpen.value = false
    openEditInvite(activeInvite.value)
  }
}

async function saveInvite(invite: AdminLoginInviteRecord) {
  if (!canEditInvite(invite)) {
    return
  }

  const draft = inviteDrafts[invite.id]

  if (!draft) {
    return
  }

  savingInviteId.value = invite.id
  resetAccessMessages()

  try {
    const result = await $fetch(`/api/admin/invites/${invite.id}`, {
      method: "PATCH",
      body: buildInvitePayload(draft),
    }) as AdminLoginInviteMutationResponse

    await refreshInvites()
    setAccessSuccess(`Invite updated for ${result.invite.email}.`)
  } catch (fetchError: any) {
    setAccessError(fetchError, "Unable to update the invite.")
  } finally {
    savingInviteId.value = ""
  }
}

async function changeInviteStatus(invite: AdminLoginInviteRecord, nextStatus: "pending" | "revoked") {
  if (!canEditInvite(invite)) {
    return
  }

  savingInviteId.value = invite.id
  resetAccessMessages()

  try {
    const result = await $fetch(`/api/admin/invites/${invite.id}`, {
      method: "PATCH",
      body: {
        status: nextStatus,
      },
    }) as AdminLoginInviteMutationResponse

    await refreshInvites()
    setAccessSuccess(
      nextStatus === "revoked"
        ? `Invite revoked for ${result.invite.email}.`
        : `Invite reopened for ${result.invite.email}.`,
    )
  } catch (fetchError: any) {
    setAccessError(fetchError, "Unable to update invite status.")
  } finally {
    savingInviteId.value = ""
  }
}

async function deleteInvite(invite: AdminLoginInviteRecord) {
  if (!canEditInvite(invite)) {
    return
  }

  const confirmed = await confirmAction({
    title: "Delete invite",
    description: `Delete the invite for ${invite.email}? You can invite this Gmail again later.`,
    confirmLabel: "Delete invite",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  savingInviteId.value = invite.id
  resetAccessMessages()

  try {
    const result = await $fetch(`/api/admin/invites/${invite.id}`, {
      method: "DELETE",
    }) as AdminLoginInviteDeleteResponse

    await refreshInvites()
    setAccessSuccess(`Deleted invite for ${result.email}. You can invite this Gmail again.`)
  } catch (fetchError: any) {
    setAccessError(fetchError, "Unable to delete the invite.")
  } finally {
    savingInviteId.value = ""
  }
}

async function deleteSelectedInvites() {
  const editableInvites = selectedInvites.value.filter((invite) => canEditInvite(invite))
  const blockedCount = selectedInviteCount.value - editableInvites.length

  if (!selectedInviteCount.value) {
    return
  }

  if (!editableInvites.length) {
    setAccessError({ message: "Accepted invites are already provisioned and cannot be deleted here." }, "Unable to delete selected invites.")
    return
  }

  const confirmed = await confirmAction({
    title: `Delete ${editableInvites.length} selected ${editableInvites.length === 1 ? "invite" : "invites"}?`,
    description: `${blockedCount ? `${blockedCount} accepted ${blockedCount === 1 ? "invite is" : "invites are"} already provisioned and will be skipped. ` : ""}Delete invites for ${editableInvites.map((invite) => invite.email).slice(0, 5).join(", ") || selectedInvitePreviewNames.value}? These Gmail addresses can be invited again later.`,
    confirmLabel: editableInvites.length === 1 ? "Delete invite" : "Delete invites",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  isBulkDeletingInvites.value = true
  resetAccessMessages()

  const deletedInviteIds = new Set<string>()

  try {
    for (const invite of editableInvites) {
      savingInviteId.value = invite.id
      await $fetch(`/api/admin/invites/${invite.id}`, {
        method: "DELETE",
      }) as AdminLoginInviteDeleteResponse
      deletedInviteIds.add(invite.id)
    }

    await refreshInvites()
    selectedInviteIds.value = selectedInviteIds.value.filter((inviteId) => !deletedInviteIds.has(inviteId))
    setAccessSuccess(`Deleted ${deletedInviteIds.size} selected ${deletedInviteIds.size === 1 ? "invite" : "invites"}.`)
  } catch (fetchError: any) {
    selectedInviteIds.value = selectedInviteIds.value.filter((inviteId) => !deletedInviteIds.has(inviteId))
    setAccessError(fetchError, "Unable to delete every selected invite.")
  } finally {
    savingInviteId.value = ""
    isBulkDeletingInvites.value = false
  }
}

async function resendInviteEmail(invite: AdminLoginInviteRecord) {
  if (invite.status !== "pending") {
    return
  }

  savingInviteId.value = invite.id
  resetAccessMessages()

  try {
    const result = await $fetch(`/api/admin/invites/${invite.id}/resend`, {
      method: "POST",
    }) as AdminLoginInviteMutationResponse

    setAccessSuccess(`Resent Gmail invite to ${result.invite.email}.${emailDeliverySentence(result.emailDelivery)}`)
  } catch (fetchError: any) {
    setAccessError(fetchError, "Unable to resend the invite email.")
  } finally {
    savingInviteId.value = ""
  }
}
</script>

<template>
  <div class="page">
    <div class="metrics">
      <StatCard
        v-for="metric in metrics"
        :key="metric.label"
        :label="metric.label"
        :value="metric.value"
        :footnote="metric.footnote"
        :tone="metric.tone"
      />
    </div>

    <WorkspaceFolderGrid
      v-model="activeArtistSection"
      :items="artistSectionFolders"
      label="Artist workspace sections"
    />

    <!-- ───────── Directory ───────── -->
    <DataPanel
      v-if="activeArtistSection === 'directory'"
      title="Artist directory"
      title-level="h1"
      eyebrow="Active records"
      description="Scan readiness at a glance, then open any artist's actions from the row menu."
    >
      <template #actions>
        <Button @click="openAddAccess">
          <Plus class="size-4" />
          Add access
        </Button>
      </template>

      <DashboardSkeleton v-if="artistsPending" layout="admin-artists-directory" :rows="5" table />

      <div v-else class="stack-lg">
        <div class="artist-directory-toolbar">
          <div class="field-row artist-search-field">
            <label for="artist-search">Search artists</label>
            <Input
              id="artist-search"
              v-model="searchQuery"
              type="search"
              placeholder="Search by name, email, country, bio, or publishing info"
            />
          </div>
          <Button
            v-if="preparedFilteredArtists.length"
            type="button"
            variant="secondary"
            size="sm"
            :disabled="allVisibleArtistsSelected || isBulkDeletingArtists"
            @click="selectAllVisibleArtists"
          >
            <CheckSquare class="size-4" />
            Select all visible
          </Button>
        </div>

        <AppAlert v-if="artistsError" variant="destructive">
          {{ artistsError.statusMessage || "Unable to load artist records right now." }}
        </AppAlert>
        <AppAlert v-if="directoryErrorMessage" variant="destructive">{{ directoryErrorMessage }}</AppAlert>
        <AppAlert v-if="directorySuccessMessage" variant="success">{{ directorySuccessMessage }}</AppAlert>

        <AppEmptyState
          v-if="!preparedFilteredArtists.length"
          icon="search"
          title="No active artists"
          description="No active artists match this search."
        />

        <DataTable
          v-else
          class="artist-directory-table"
          :columns="artistDirectoryColumns"
          :data="preparedFilteredArtists"
          row-key="id"
          :row-class="(artist) => isArtistSelected(artist.id) && 'artist-directory-row-selected-for-delete'"
        >
          <template #cell-select="{ row: artist }">
            <Checkbox
              :model-value="isArtistSelected(artist.id)"
              :aria-label="`Select ${artistDisplayName(artist)}`"
              :disabled="isBulkDeletingArtists"
              @click.stop
              @update:model-value="(checked) => toggleArtistSelection(artist.id, checked === true)"
            />
          </template>
          <template #cell-artist="{ row: artist }">
            <div class="artist-directory-primary">
              <Avatar class="artist-directory-avatar">
                <AvatarImage
                  v-if="artistDrafts[artist.id]?.avatarUrl || artist.avatarUrl"
                  :src="artistDrafts[artist.id]?.avatarUrl || artist.avatarUrl || ''"
                  :alt="`${artistDisplayName(artist)} avatar`"
                  draggable="false"
                />
                <AvatarFallback class="artist-directory-avatar-fallback">
                  {{ artistInitial(artist) }}
                </AvatarFallback>
              </Avatar>
              <div class="artist-directory-identity">
                <strong>{{ artistDisplayName(artist) }}</strong>
                <span>{{ artist.email || "No email saved" }}</span>
              </div>
            </div>
          </template>
          <template #cell-deal="{ row: artist }">
            <StatusBadge :tone="artist.artistSharePct ? 'success' : 'warning'" :class="artist.artistSharePct ? 'artist-deal-badge' : undefined">
              {{ formatArtistSharePct(artist.artistSharePct) }}
            </StatusBadge>
          </template>
          <template #cell-country="{ row: artist }">
            <CountryFlag :name="artist.country" :label="artist.country || 'Not set'" show-label />
          </template>
          <template #cell-access="{ row: artist }">
            <StatusBadge :tone="artist.loginFrozenAt ? 'danger' : artist.isActive ? 'success' : 'muted'">
              {{ artist.loginFrozenAt ? "Frozen" : artist.isActive ? "Active" : "Inactive" }}
            </StatusBadge>
          </template>
          <template #cell-bank="{ row: artist }">
            <StatusBadge :tone="artist.bankDetails ? 'success' : 'warning'">
              {{ artist.bankDetails ? "Saved" : "Missing" }}
            </StatusBadge>
          </template>
          <template #cell-publishing="{ row: artist }">
            <StatusBadge :tone="artist.publishingInfo ? 'success' : 'warning'">
              {{ artist.publishingInfo ? "Saved" : "Missing" }}
            </StatusBadge>
          </template>
          <template #cell-created="{ row: artist }">{{ formatDate(artist.createdAt) }}</template>
          <template #cell-actions="{ row: artist }">
            <RowActions :actions="artistRowActions(artist)" @select="(key) => onArtistAction(key, artist)" />
          </template>
        </DataTable>
      </div>

      <!-- Bulk action dock: rises from the bottom while rows are selected -->
      <Teleport to="body">
        <Transition name="bulk-dock">
          <div v-if="hasSelectedArtists" class="artist-bulk-dock" role="toolbar" aria-label="Bulk artist actions">
            <p class="bulk-dock-count" aria-live="polite">
              <strong>{{ selectedArtistCount }}</strong> selected
            </p>
            <div class="bulk-dock-actions">
              <Button type="button" variant="secondary" size="sm" :disabled="isBulkDeletingArtists" @click="clearSelectedArtists">
                <X class="size-4" />
                Clear
              </Button>
              <Button type="button" variant="destructive" size="sm" :disabled="isBulkDeletingArtists" @click="permanentlyDeleteSelectedArtists">
                <Trash2 class="size-4" />
                {{ isBulkDeletingArtists ? "Deleting..." : "Permanent delete" }}
              </Button>
            </div>
          </div>
        </Transition>
      </Teleport>
    </DataPanel>

    <!-- ───────── Access Queue ───────── -->
    <DataPanel
      v-else
      title="Access queue"
      title-level="h1"
      eyebrow="Gmail invites"
      description="Artist and admin Gmail invite history. Accepted artist invites also appear in the directory once provisioned."
    >
      <template #actions>
        <Button @click="openAddAccess">
          <Plus class="size-4" />
          Add access
        </Button>
      </template>

      <div class="artist-directory-toolbar">
        <div class="field-row artist-search-field">
          <label for="access-search">Search queue</label>
          <Input
            id="access-search"
            v-model="accessSearchQuery"
            type="search"
            placeholder="Search by email, name, role, or reviewer"
          />
        </div>
        <div class="field-row access-status-field">
          <label for="access-status-filter">Status</label>
          <NativeSelect id="access-status-filter" v-model="accessStatusFilter">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="revoked">Revoked</option>
          </NativeSelect>
        </div>
      </div>

      <AppAlert v-if="invitesError" variant="destructive">
        {{ invitesError.statusMessage || "Unable to load the access queue right now." }}
      </AppAlert>
      <AppAlert v-if="accessErrorMessage" variant="destructive">{{ accessErrorMessage }}</AppAlert>
      <AppAlert v-if="accessSuccessMessage" variant="success">{{ accessSuccessMessage }}</AppAlert>

      <DashboardSkeleton v-if="invitesPending" layout="admin-artists-access" :rows="5" table />

      <DataTable
        v-else
        :columns="inviteColumns"
        :data="filteredInvites"
        row-key="id"
        table-class="access-queue-table"
        empty-title="No invite records"
        empty-description="No invite records match the current filters."
        :row-class="(invite) => isInviteSelected(invite.id) && 'access-queue-row-selected'"
      >
        <template #header-select>
          <Checkbox
            :model-value="allVisibleInvitesSelected"
            :aria-label="inviteSelectAllLabel"
            :disabled="isBulkDeletingInvites || !hasFilteredInvites"
            @click.stop
            @update:model-value="(checked) => toggleVisibleInviteSelection(checked === true)"
          />
        </template>
        <template #cell-select="{ row: invite }">
          <Checkbox
            :model-value="isInviteSelected(invite.id)"
            :aria-label="`Select invite for ${invite.email}`"
            :disabled="isBulkDeletingInvites"
            @click.stop
            @update:model-value="(checked) => toggleInviteSelection(invite.id, checked === true)"
          />
        </template>
        <template #cell-email="{ row: invite }">
          <strong>{{ invite.email }}</strong>
        </template>
        <template #cell-role="{ row: invite }">
          <StatusBadge :tone="invite.role === 'admin' ? 'info' : 'default'">{{ invite.role }}</StatusBadge>
        </template>
        <template #cell-name="{ row: invite }">
          {{ invite.role === "artist" ? invite.artistName || invite.fullName : invite.fullName }}
        </template>
        <template #cell-share="{ row: invite }">
          {{ invite.role === "artist" ? formatArtistSharePct(invite.artistSharePct) : "—" }}
        </template>
        <template #cell-status="{ row: invite }">
          <StatusBadge :tone="statusTone(invite.status)">{{ statusLabel(invite.status) }}</StatusBadge>
        </template>
        <template #cell-created="{ row: invite }">{{ formatDate(invite.createdAt) }}</template>
        <template #cell-actions="{ row: invite }">
          <RowActions :actions="inviteRowActions(invite)" @select="(key) => onInviteAction(key, invite)" />
        </template>
      </DataTable>

      <Teleport to="body">
        <Transition name="bulk-dock">
          <div v-if="hasSelectedInvites" class="artist-bulk-dock" role="toolbar" aria-label="Bulk access queue actions">
            <p class="bulk-dock-count" aria-live="polite">
              <strong>{{ selectedInviteCount }}</strong> selected
            </p>
            <div class="bulk-dock-actions">
              <Button type="button" variant="secondary" size="sm" :disabled="isBulkDeletingInvites" @click="clearSelectedInvites">
                <X class="size-4" />
                Clear
              </Button>
              <Button type="button" variant="destructive" size="sm" :disabled="isBulkDeletingInvites" @click="deleteSelectedInvites">
                <Trash2 class="size-4" />
                {{ isBulkDeletingInvites ? "Deleting..." : "Delete invites" }}
              </Button>
            </div>
          </div>
        </Transition>
      </Teleport>
    </DataPanel>

    <!-- ───────── Add access dialog ───────── -->
    <FormDialog
      v-model:open="addAccessOpen"
      title="Add access"
      description="Create an artist account or send a Gmail invite for an artist or admin."
      submit-label="Create access"
      :pending="isSubmittingAccess"
      :error="addAccessOpen ? createErrorMessage : ''"
      :submit-disabled="!addAccessForm.email || (addAccessIsArtist && !addAccessForm.artistName) || (addAccessIsPassword && !addAccessForm.password)"
      content-class="max-w-2xl"
      @submit="submitAddAccess"
    >
      <div class="dialog-grid">
        <div class="field-row">
          <label for="add-role">Role</label>
          <NativeSelect id="add-role" v-model="addAccessForm.role">
            <option value="artist">Artist</option>
            <option value="admin">Admin</option>
          </NativeSelect>
        </div>
        <div v-if="addAccessIsArtist" class="field-row">
          <label for="add-method">Access method</label>
          <NativeSelect id="add-method" v-model="addAccessForm.accessMethod">
            <option value="password">Password account now</option>
            <option value="gmailInvite">Gmail invite</option>
          </NativeSelect>
        </div>
        <div v-else class="field-row">
          <label>Access method</label>
          <p class="field-note">Admins are provisioned by Gmail invite on first Google sign-in.</p>
        </div>

        <div v-if="addAccessIsArtist" class="field-row">
          <label for="add-stage-name">Stage name</label>
          <Input id="add-stage-name" v-model="addAccessForm.artistName" type="text" />
        </div>
        <div class="field-row">
          <label for="add-full-name">Legal / full name</label>
          <Input id="add-full-name" v-model="addAccessForm.fullName" type="text" />
        </div>
        <div v-if="addAccessIsArtist" class="field-row">
          <label for="add-share">Artist share %</label>
          <Input id="add-share" v-model="addAccessForm.artistSharePct" type="number" min="0" max="100" step="0.01" />
        </div>
        <div class="field-row">
          <label for="add-email">Email</label>
          <Input id="add-email" v-model="addAccessForm.email" type="email" />
        </div>
        <div v-if="addAccessIsPassword" class="field-row">
          <label for="add-password">Temporary password</label>
          <Input id="add-password" v-model="addAccessForm.password" type="password" autocomplete="new-password" />
        </div>
        <div class="field-row">
          <label for="add-country">Country</label>
          <Input id="add-country" v-model="addAccessForm.country" type="text" />
        </div>
        <div class="field-row dialog-col-2">
          <label for="add-bio">Bio</label>
          <Textarea id="add-bio" v-model="addAccessForm.bio" rows="3" />
        </div>
      </div>
    </FormDialog>

    <!-- ───────── Artist details dialog ───────── -->
    <FormDialog
      v-model:open="artistDetailsOpen"
      :title="activeArtist ? artistDisplayName(activeArtist) : 'Artist details'"
      :description="activeArtist?.email || undefined"
      readonly
      content-class="max-w-2xl"
    >
      <dl v-if="activeArtist" class="detail-list">
        <div class="detail-item">
          <dt>Status</dt>
          <dd>
            <StatusBadge :tone="activeArtist.loginFrozenAt ? 'danger' : activeArtist.isActive ? 'success' : 'muted'">
              {{ activeArtist.loginFrozenAt ? "Frozen" : activeArtist.isActive ? "Active" : "Inactive" }}
            </StatusBadge>
          </dd>
        </div>
        <div class="detail-item">
          <dt>Artist share</dt>
          <dd>{{ formatArtistSharePct(activeArtist.artistSharePct) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Country</dt>
          <dd>{{ countryNameFor(activeArtist.country, "Not set") }}</dd>
        </div>
        <div class="detail-item">
          <dt>Created</dt>
          <dd>{{ formatDate(activeArtist.createdAt) }}</dd>
        </div>
        <div v-if="activeArtist.sharedAccountArtistCount > 1" class="detail-item detail-col-2">
          <dt>Shared login</dt>
          <dd>Shared with {{ activeArtist.sharedAccountArtistCount }} artists</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Bio</dt>
          <dd>{{ activeArtist.bio || "None" }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Bank details</dt>
          <dd>
            {{ activeArtist.bankDetails
              ? `${activeArtist.bankDetails.accountName} · ${activeArtist.bankDetails.bankName} · ${activeArtist.bankDetails.accountNumber}`
              : "Not entered yet" }}
          </dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Publishing info</dt>
          <dd>
            {{ activeArtist.publishingInfo
              ? `${activeArtist.publishingInfo.legalName || "—"} · IPI ${activeArtist.publishingInfo.ipiNumber || "—"} · ${activeArtist.publishingInfo.proName || "—"}`
              : "Not set" }}
          </dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="artistDetailsOpen = false">Close</Button>
        <Button v-if="activeArtist" @click="editFromArtistDetails">
          <Pencil class="size-4" />
          Edit
        </Button>
      </template>
    </FormDialog>

    <!-- ───────── Artist edit dialog ───────── -->
    <FormDialog
      v-model:open="editArtistOpen"
      :title="activeArtist ? `Edit — ${artistDisplayName(activeArtist)}` : 'Edit artist'"
      :error="activeArtist ? artistStates[activeArtist.id]?.errorMessage : ''"
      content-class="max-w-3xl"
    >
      <template v-if="activeArtist && artistDrafts[activeArtist.id] && artistPasswordDrafts[activeArtist.id]">
        <AppAlert v-if="artistStates[activeArtist.id]?.successMessage" variant="success">
          {{ artistStates[activeArtist.id].successMessage }}
        </AppAlert>
        <AppAlert v-if="sharedAccountWarning(activeArtist)" variant="warning">
          {{ sharedAccountWarning(activeArtist) }}
        </AppAlert>

        <div class="dialog-section">
          <p class="dialog-section-title">Basic info</p>
          <div class="dialog-grid">
            <div class="field-row">
              <label :for="`edit-name-${activeArtist.id}`">Stage name</label>
              <Input :id="`edit-name-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].name" type="text" />
            </div>
            <div class="field-row">
              <label :for="`edit-email-${activeArtist.id}`">Login email</label>
              <Input :id="`edit-email-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].email" type="email" />
            </div>
            <div class="field-row">
              <label :for="`edit-share-${activeArtist.id}`">Artist share %</label>
              <Input :id="`edit-share-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].artistSharePct" type="number" min="0" max="100" step="0.01" />
            </div>
            <div class="field-row">
              <label :for="`edit-country-${activeArtist.id}`">Country</label>
              <Input :id="`edit-country-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].country" type="text" />
            </div>
            <div class="field-row dialog-col-2">
              <label :for="`edit-avatar-${activeArtist.id}`">Avatar URL</label>
              <Input :id="`edit-avatar-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].avatarUrl" type="url" />
            </div>
            <div class="field-row dialog-col-2">
              <label :for="`edit-bio-${activeArtist.id}`">Bio</label>
              <Textarea :id="`edit-bio-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].bio" rows="3" />
            </div>
          </div>
        </div>

        <div class="dialog-section">
          <p class="dialog-section-title">Publishing info</p>
          <div class="dialog-grid">
            <div class="field-row">
              <label :for="`edit-legal-${activeArtist.id}`">Legal name</label>
              <Input :id="`edit-legal-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].legalName" type="text" />
            </div>
            <div class="field-row">
              <label :for="`edit-ipi-${activeArtist.id}`">IPI / CAE</label>
              <Input :id="`edit-ipi-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].ipiNumber" type="text" />
            </div>
            <div class="field-row">
              <label :for="`edit-pro-${activeArtist.id}`">PRO</label>
              <Input :id="`edit-pro-${activeArtist.id}`" v-model="artistDrafts[activeArtist.id].proName" type="text" />
            </div>
          </div>
        </div>

        <div v-if="activeArtist.bankDetails" class="dialog-section">
          <p class="dialog-section-title">Bank details (artist-managed, read-only)</p>
          <dl class="detail-list">
            <div class="detail-item"><dt>Account name</dt><dd>{{ activeArtist.bankDetails.accountName }}</dd></div>
            <div class="detail-item"><dt>Bank name</dt><dd>{{ activeArtist.bankDetails.bankName }}</dd></div>
            <div class="detail-item"><dt>Account number</dt><dd>{{ activeArtist.bankDetails.accountNumber }}</dd></div>
            <div class="detail-item"><dt>Bank address</dt><dd>{{ activeArtist.bankDetails.bankAddress || "Not set" }}</dd></div>
          </dl>
        </div>

        <div class="dialog-section">
          <p class="dialog-section-title">Dashboard password</p>
          <AppAlert v-if="passwordSharedAccountWarning(activeArtist)" variant="warning">
            {{ passwordSharedAccountWarning(activeArtist) }}
          </AppAlert>
          <div class="dialog-grid">
            <div class="field-row">
              <label :for="`edit-pw-${activeArtist.id}`">New password</label>
              <Input :id="`edit-pw-${activeArtist.id}`" v-model="artistPasswordDrafts[activeArtist.id].password" type="password" autocomplete="new-password" :disabled="isArtistBusy(activeArtist.id)" />
            </div>
            <div class="field-row">
              <label :for="`edit-pw2-${activeArtist.id}`">Confirm password</label>
              <Input :id="`edit-pw2-${activeArtist.id}`" v-model="artistPasswordDrafts[activeArtist.id].confirmPassword" type="password" autocomplete="new-password" :disabled="isArtistBusy(activeArtist.id)" />
            </div>
            <div class="field-row dialog-align-end">
              <Button variant="secondary" type="button" :disabled="isArtistBusy(activeArtist.id) || !hasArtistPasswordInput(activeArtist.id)" @click="changeArtistPassword(activeArtist)">
                <KeyRound class="size-4" />
                {{ artistStates[activeArtist.id]?.activeAction === "password" ? "Changing…" : "Change password" }}
              </Button>
            </div>
          </div>
        </div>

        <div class="dialog-section dialog-danger">
          <p class="dialog-section-title">Danger actions</p>
          <p class="field-note">Freeze affects the whole login. Archive and permanent delete only affect this artist record.</p>
          <div class="dialog-danger-actions">
            <Button v-if="!activeArtist.loginFrozenAt" variant="destructive" type="button" :disabled="isArtistBusy(activeArtist.id)" @click="freezeArtistLogin(activeArtist)">
              <Snowflake class="size-4" />
              {{ artistStates[activeArtist.id]?.activeAction === "freeze" ? "Freezing…" : "Freeze login" }}
            </Button>
            <Button v-else variant="secondary" type="button" :disabled="isArtistBusy(activeArtist.id)" @click="unfreezeArtistLogin(activeArtist)">
              <Sun class="size-4" />
              {{ artistStates[activeArtist.id]?.activeAction === "unfreeze" ? "Unfreezing…" : "Unfreeze login" }}
            </Button>
            <Button variant="destructive" type="button" :disabled="isArtistBusy(activeArtist.id)" @click="archiveArtist(activeArtist)">
              <Archive class="size-4" />
              {{ artistStates[activeArtist.id]?.activeAction === "archive" ? "Archiving…" : "Archive artist" }}
            </Button>
            <Button variant="destructive" type="button" :disabled="isArtistBusy(activeArtist.id)" @click="permanentlyDeleteArtist(activeArtist)">
              <Trash2 class="size-4" />
              {{ artistStates[activeArtist.id]?.activeAction === "permanentDelete" ? "Deleting…" : "Permanent delete" }}
            </Button>
          </div>
        </div>
      </template>

      <template #footer>
        <Button variant="ghost" type="button" @click="editArtistOpen = false">Close</Button>
        <Button v-if="activeArtist" variant="secondary" type="button" :disabled="isArtistBusy(activeArtist.id) || !hasArtistChanges(activeArtist)" @click="resetArtistDraft(activeArtist)">
          Reset
        </Button>
        <Button v-if="activeArtist" type="button" :disabled="isArtistBusy(activeArtist.id) || !hasArtistChanges(activeArtist)" @click="saveArtist(activeArtist)">
          {{ artistStates[activeArtist.id]?.isSaving ? "Saving…" : "Save artist" }}
        </Button>
      </template>
    </FormDialog>

    <!-- ───────── Invite details dialog ───────── -->
    <FormDialog
      v-model:open="inviteDetailsOpen"
      :title="activeInvite ? activeInvite.email : 'Invite details'"
      :description="activeInvite ? `${activeInvite.role} invite` : undefined"
      readonly
      content-class="max-w-2xl"
    >
      <dl v-if="activeInvite" class="detail-list">
        <div class="detail-item">
          <dt>Status</dt>
          <dd><StatusBadge :tone="statusTone(activeInvite.status)">{{ statusLabel(activeInvite.status) }}</StatusBadge></dd>
        </div>
        <div class="detail-item">
          <dt>Role</dt>
          <dd>{{ activeInvite.role }}</dd>
        </div>
        <div class="detail-item">
          <dt>Full name</dt>
          <dd>{{ activeInvite.fullName || "—" }}</dd>
        </div>
        <div v-if="activeInvite.role === 'artist'" class="detail-item">
          <dt>Artist name</dt>
          <dd>{{ activeInvite.artistName || "—" }}</dd>
        </div>
        <div v-if="activeInvite.role === 'artist'" class="detail-item">
          <dt>Artist share</dt>
          <dd>{{ formatArtistSharePct(activeInvite.artistSharePct) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Country</dt>
          <dd>{{ countryNameFor(activeInvite.country, "Not set") }}</dd>
        </div>
        <div class="detail-item">
          <dt>Invited</dt>
          <dd>{{ formatDateTime(activeInvite.createdAt) }}{{ activeInvite.invitedByAdminName ? ` · ${activeInvite.invitedByAdminName}` : "" }}</dd>
        </div>
        <div class="detail-item">
          <dt>Accepted</dt>
          <dd>{{ formatDateTime(activeInvite.acceptedAt) }}{{ activeInvite.acceptedByName ? ` · ${activeInvite.acceptedByName}` : "" }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Bio</dt>
          <dd>{{ activeInvite.bio || "None" }}</dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="inviteDetailsOpen = false">Close</Button>
        <Button v-if="activeInvite && canEditInvite(activeInvite)" @click="editFromInviteDetails">
          <Pencil class="size-4" />
          Edit
        </Button>
      </template>
    </FormDialog>

    <!-- ───────── Invite edit dialog ───────── -->
    <FormDialog
      v-model:open="editInviteOpen"
      :title="activeInvite ? `Edit invite — ${activeInvite.email}` : 'Edit invite'"
      submit-label="Save invite"
      :pending="!!activeInvite && savingInviteId === activeInvite.id"
      :error="editInviteOpen ? accessErrorMessage : ''"
      content-class="max-w-2xl"
      @submit="submitEditInvite"
    >
      <div v-if="activeInvite && inviteDrafts[activeInvite.id]" class="dialog-grid">
        <div class="field-row">
          <label for="invite-email">Email</label>
          <Input id="invite-email" v-model="inviteDrafts[activeInvite.id].email" type="email" />
        </div>
        <div class="field-row">
          <label for="invite-full-name">Full name</label>
          <Input id="invite-full-name" v-model="inviteDrafts[activeInvite.id].fullName" type="text" />
        </div>
        <template v-if="activeInvite.role === 'artist'">
          <div class="field-row">
            <label for="invite-artist-name">Artist name</label>
            <Input id="invite-artist-name" v-model="inviteDrafts[activeInvite.id].artistName" type="text" />
          </div>
          <div class="field-row">
            <label for="invite-share">Artist share %</label>
            <Input id="invite-share" v-model="inviteDrafts[activeInvite.id].artistSharePct" type="number" min="0" max="100" step="0.01" />
          </div>
        </template>
        <div class="field-row">
          <label for="invite-country">Country</label>
          <Input id="invite-country" v-model="inviteDrafts[activeInvite.id].country" type="text" />
        </div>
        <div class="field-row dialog-col-2">
          <label for="invite-bio">Bio</label>
          <Textarea id="invite-bio" v-model="inviteDrafts[activeInvite.id].bio" rows="3" />
        </div>
      </div>
    </FormDialog>
  </div>
</template>

<style scoped>
.artist-directory-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  margin-bottom: 16px;
}

.artist-search-field {
  flex: 1;
  min-width: 240px;
}

.access-status-field {
  width: 200px;
}

.artist-directory-primary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.artist-directory-avatar {
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
}

.artist-directory-avatar-fallback {
  font-size: 12px;
  font-weight: 600;
}

.artist-directory-identity {
  display: grid;
  min-width: 0;
}

.artist-directory-identity strong {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artist-directory-identity span {
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.artist-directory-row-selected-for-delete) {
  background: color-mix(in srgb, var(--destructive) 8%, transparent);
}

:deep(.artist-deal-badge) {
  --status-badge-bg: #7c3aed;
  --status-badge-border: #7c3aed;
  --status-badge-fg: #ffffff;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, white 24%, transparent),
    0 8px 16px -14px color-mix(in srgb, #7c3aed 70%, transparent);
}

:deep(.access-queue-row-selected) {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

:deep(.access-queue-table) {
  min-width: 980px;
}

/* Dialog shared layout */
.dialog-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr 1fr;
}

.dialog-col-2 {
  grid-column: 1 / -1;
}

.dialog-align-end {
  align-self: end;
}

.dialog-section + .dialog-section {
  margin-top: 18px;
}

.dialog-section-title {
  margin: 0 0 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.dialog-danger {
  border-top: 1px solid var(--border);
  padding-top: 16px;
}

.dialog-danger-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.detail-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.detail-item {
  display: grid;
  gap: 3px;
}

.detail-col-2 {
  grid-column: 1 / -1;
}

.detail-item dt {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.detail-item dd {
  margin: 0;
  font-size: 14px;
  font-weight: 560;
}

/* Bulk dock */
.artist-bulk-dock {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 60;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  border: 1px solid var(--glass-border, var(--border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 86%, transparent);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  box-shadow: 0 20px 48px -24px rgb(0 0 0 / 60%);
}

.bulk-dock-count {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.bulk-dock-actions {
  display: flex;
  gap: 8px;
}

.bulk-dock-enter-active,
.bulk-dock-leave-active {
  transition: opacity 200ms var(--ease-out, ease-out), transform 200ms var(--ease-out, ease-out);
}

.bulk-dock-enter-from,
.bulk-dock-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}

@media (max-width: 560px) {
  .dialog-grid,
  .detail-list {
    grid-template-columns: 1fr;
  }

  .access-status-field {
    width: 100%;
  }
}
</style>
