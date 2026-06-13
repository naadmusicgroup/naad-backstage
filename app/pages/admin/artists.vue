<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { CheckSquare, KeyRound, Trash2, X } from "lucide-vue-next"
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
  accessDraftChanged,
  buildAccessDraft,
  emptyAccessDraft,
  emptyArtistCreateDraft,
  nullableText,
  normalizedEmail,
  normalizedOptionalText,
  normalizedText,
  type AccessDraft,
  type ArtistCreateDraft,
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
  activeAction: "" | "freeze" | "unfreeze" | "orphan" | "permanentDelete" | "password"
  successMessage: string
  errorMessage: string
}

interface ArtistPasswordDraft {
  password: string
  confirmPassword: string
}

const route = useRoute()
const { refreshViewerContext } = useViewerContext()
const accessQueueAnchor = ref<HTMLElement | null>(null)

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

const createArtistForm = reactive<ArtistCreateDraft>(emptyArtistCreateDraft())
const adminInviteForm = reactive<AccessDraft>(emptyAccessDraft("admin"))

const searchQuery = ref("")
const accessSearchQuery = ref("")
const accessStatusFilter = ref<"all" | LoginInviteStatus>("all")
const isSubmittingArtistCreate = ref(false)
const isSubmittingAdminInvite = ref(false)
const createSuccessMessage = ref("")
const createErrorMessage = ref("")
const accessSuccessMessage = ref("")
const accessErrorMessage = ref("")
const directorySuccessMessage = ref("")
const directoryErrorMessage = ref("")
const startingViewAsArtistId = ref("")
const savingInviteId = ref("")
const isBulkDeletingArtists = ref(false)
const selectedArtistIds = ref<string[]>([])
const artistDrafts = reactive<Record<string, ArtistDraft>>({})
const artistPasswordDrafts = reactive<Record<string, ArtistPasswordDraft>>({})
const artistStates = reactive<Record<string, ArtistActionState>>({})
const inviteDrafts = reactive<Record<string, AccessDraft>>({})
const { confirmAction } = useConfirmAction()

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
const isArtistInviteMode = computed(() => createArtistForm.accessMethod === "gmailInvite")

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
  { key: "actions", label: "", align: "right" as const, sortable: false },
]

const activeArtistSection = ref(route.query.section === "access" ? "access" : "directory")
const selectedArtistId = ref("")
const selectedArtistFolderId = computed({
  get: () => preparedFilteredArtists.value.some((artist) => artist.id === selectedArtistId.value)
    ? selectedArtistId.value
    : preparedFilteredArtists.value[0]?.id || "",
  set: (value: string) => {
    selectedArtistId.value = value
  },
})

const visibleDirectoryArtists = computed(() => {
  const selectedArtist = preparedFilteredArtists.value.find((artist) => artist.id === selectedArtistFolderId.value)

  return selectedArtist ? [selectedArtist] : preparedFilteredArtists.value.slice(0, 1)
})

const selectedArtistIdSet = computed(() => new Set(selectedArtistIds.value))
const selectedArtists = computed(() =>
  artists.value.filter((artist) => selectedArtistIdSet.value.has(artist.id)),
)
const selectedArtistCount = computed(() => selectedArtistIds.value.length)
const hasSelectedArtists = computed(() => selectedArtistCount.value > 0)
const allVisibleArtistsSelected = computed(() =>
  Boolean(preparedFilteredArtists.value.length)
  && preparedFilteredArtists.value.every((artist) => selectedArtistIdSet.value.has(artist.id)),
)
const selectedArtistPreviewNames = computed(() => {
  const names = selectedArtists.value.map((artist) => artistDisplayName(artist))
  const preview = names.slice(0, 5).join(", ")
  const remaining = names.length - 5

  return remaining > 0 ? `${preview}, and ${remaining} more` : preview
})

watch(
  preparedFilteredArtists,
  (value) => {
    if (!value.some((artist) => artist.id === selectedArtistId.value)) {
      selectedArtistId.value = value[0]?.id || ""
    }
  },
  { immediate: true },
)

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
    ? "Artist thumbnails and profile operations"
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
  },
  { immediate: true },
)

watch(
  () => createArtistForm.accessMethod,
  (value) => {
    if (value === "gmailInvite") {
      createArtistForm.password = ""
    }
  },
)

watch(
  () => route.query.section,
  () => {
    if (route.query.section === "access") {
      activeArtistSection.value = "access"
    }
    void scrollToAccessQueueIfNeeded()
  },
)

onMounted(() => {
  void scrollToAccessQueueIfNeeded()
})

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

function resetCreateMessages() {
  createSuccessMessage.value = ""
  createErrorMessage.value = ""
}

function resetAccessMessages() {
  accessSuccessMessage.value = ""
  accessErrorMessage.value = ""
}

function resetDirectoryMessage() {
  directorySuccessMessage.value = ""
  directoryErrorMessage.value = ""
}

function resetArtistCreateForm() {
  const accessMethod = createArtistForm.accessMethod
  Object.assign(createArtistForm, emptyArtistCreateDraft())
  createArtistForm.accessMethod = accessMethod
}

function resetAdminInviteForm() {
  Object.assign(adminInviteForm, emptyAccessDraft("admin"))
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
    case "orphan":
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

function selectDirectoryArtist(artistId: string) {
  selectedArtistId.value = artistId
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

    if (deletedIds.has(selectedArtistId.value)) {
      selectedArtistId.value = ""
    }

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
      : action === "orphan"
        ? "Archive artist"
      : action === "freeze"
        ? "Freeze login"
        : "Continue",
    variant: action === "permanentDelete" || action === "orphan" || action === "freeze" ? "destructive" : "default",
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
  } finally {
    state.activeAction = ""
  }
}

function buildInvitePayload(draft: AccessDraft) {
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

async function scrollToAccessQueueIfNeeded() {
  if (!import.meta.client || route.query.section !== "access") {
    return
  }

  await nextTick()
  accessQueueAnchor.value?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  })
}

async function createArtistAccess() {
  isSubmittingArtistCreate.value = true
  resetCreateMessages()
  resetDirectoryMessage()

  try {
    if (createArtistForm.accessMethod === "password") {
      const result = await $fetch("/api/admin/artists", {
        method: "POST",
        body: {
          stageName: createArtistForm.artistName,
          fullName: createArtistForm.fullName,
          email: createArtistForm.email,
          password: createArtistForm.password,
          artistSharePct: createArtistForm.artistSharePct,
          country: createArtistForm.country,
          bio: createArtistForm.bio,
        },
      }) as { artist: { name: string; email: string } }

      createSuccessMessage.value = `Created ${result.artist.name} (${result.artist.email}).`
      resetArtistCreateForm()
      await refreshArtists()
      return
    }

    const result = await $fetch("/api/admin/invites", {
      method: "POST",
      body: buildInvitePayload({
        ...createArtistForm,
        role: "artist",
      }),
    }) as AdminLoginInviteMutationResponse

    createSuccessMessage.value = `Created Gmail invite for ${result.invite.email}.${emailDeliverySentence(result.emailDelivery)}`
    resetArtistCreateForm()
    await refreshInvites()
  } catch (fetchError: any) {
    createErrorMessage.value =
      fetchError?.data?.statusMessage || fetchError?.message || "Unable to create the artist access flow."
  } finally {
    isSubmittingArtistCreate.value = false
  }
}

async function createAdminInvite() {
  isSubmittingAdminInvite.value = true
  resetAccessMessages()

  try {
    const result = await $fetch("/api/admin/invites", {
      method: "POST",
      body: buildInvitePayload({
        ...adminInviteForm,
        role: "admin",
      }),
    }) as AdminLoginInviteMutationResponse

    resetAdminInviteForm()
    await refreshInvites()
    setAccessSuccess(`Created admin Gmail invite for ${result.invite.email}.${emailDeliverySentence(result.emailDelivery)}`)
  } catch (fetchError: any) {
    setAccessError(fetchError, "Unable to create the admin invite.")
  } finally {
    isSubmittingAdminInvite.value = false
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
  resetDirectoryMessage()

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
  resetDirectoryMessage()

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
    `${artist.sharedAccountArtistCount > 1
      ? `Freeze login for ${artist.name}? This will block sign-in for all ${artist.sharedAccountArtistCount} artists on this shared login.`
      : `Freeze login for ${artist.name}? The account will stay in the directory but nobody on this login can sign in until it is unfrozen.`}`,
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

async function orphanArtist(artist: AdminArtistOverview) {
  await runArtistLifecycleAction(
    artist,
    "orphan",
    "orphan",
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
    state.errorMessage = fetchError?.data?.statusMessage || fetchError?.message || "Unable to open this artist dashboard."
  } finally {
    startingViewAsArtistId.value = ""
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

    <DataPanel
      v-if="activeArtistSection === 'directory'"
      title="Artist directory"
      title-level="h1"
      eyebrow="Active records"
      description="Search, scan readiness, then open one artist edit surface when action is needed."
    >
      <DashboardSkeleton v-if="artistsPending" :rows="5" table />

      <div v-else class="stack-lg">
        <div class="artist-directory-toolbar">
          <div class="field-row">
            <label for="artist-search">Search artists</label>
            <Input
              id="artist-search"
              v-model="searchQuery"
              type="search"
              placeholder="Search by name, email, country, bio, or publishing info"
            />
          </div>
          <p class="field-note">
            Bank details remain artist-managed. Publishing info is admin-owned and saved from the selected artist surface.
          </p>
          <div v-if="preparedFilteredArtists.length" class="artist-bulk-toolbar">
            <div class="artist-bulk-actions">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                :disabled="!preparedFilteredArtists.length || allVisibleArtistsSelected || isBulkDeletingArtists"
                @click="selectAllVisibleArtists"
              >
                <CheckSquare />
                Select all visible
              </Button>
            </div>
          </div>

          <!-- Bulk action dock: rises from the bottom while rows are selected -->
          <Teleport to="body">
            <Transition name="bulk-dock">
              <div v-if="hasSelectedArtists" class="artist-bulk-dock" role="toolbar" aria-label="Bulk artist actions">
                <p class="bulk-dock-count" aria-live="polite">
                  <strong>{{ selectedArtistCount }}</strong> selected
                </p>
                <div class="bulk-dock-actions">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    :disabled="isBulkDeletingArtists"
                    @click="clearSelectedArtists"
                  >
                    <X />
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    :disabled="isBulkDeletingArtists"
                    @click="permanentlyDeleteSelectedArtists"
                  >
                    <Trash2 />
                    {{ isBulkDeletingArtists ? "Deleting..." : "Permanent delete" }}
                  </Button>
                </div>
              </div>
            </Transition>
          </Teleport>
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

        <template v-else>
          <DataTable
            class="artist-directory-table"
            :columns="artistDirectoryColumns"
            :data="preparedFilteredArtists"
            row-key="id"
            :row-class="(artist) => [
              'artist-directory-row',
              selectedArtistFolderId === artist.id && 'artist-directory-row-selected',
              isArtistSelected(artist.id) && 'artist-directory-row-selected-for-delete',
            ]"
          >
            <template #cell-select="{ row: artist }">
              <Checkbox
                class="artist-directory-checkbox"
                :model-value="isArtistSelected(artist.id)"
                :aria-label="`Select ${artistDisplayName(artist)}`"
                :disabled="isBulkDeletingArtists"
                @click.stop
                @update:model-value="(checked) => toggleArtistSelection(artist.id, checked === true)"
              />
            </template>
            <template #cell-artist="{ row: artist }">
              <Button type="button" variant="ghost" size="sm" class="artist-directory-primary h-auto px-0 py-0 text-left" @click="selectDirectoryArtist(artist.id)">
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
                <div>
                  <strong>{{ artistDisplayName(artist) }}</strong>
                  <span>{{ artist.email || "No email saved" }}</span>
                </div>
              </Button>
            </template>
            <template #cell-deal="{ row: artist }">
              <StatusBadge :tone="artist.artistSharePct ? 'success' : 'warning'">
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
              <Button
                variant="secondary"
                :disabled="startingViewAsArtistId === artist.id"
                @click.stop="viewAsArtist(artist)"
              >
                {{ startingViewAsArtistId === artist.id ? "Opening..." : "View" }}
              </Button>
            </template>
          </DataTable>

          <div v-if="visibleDirectoryArtists[0]" class="artist-selection-note">
            Editing {{ artistDisplayName(visibleDirectoryArtists[0]) }}
          </div>
        </template>
      </div>
    </DataPanel>

    <div class="panel-grid panel-grid-single">
      <CollapsiblePanel
        title="Create artist account"
        eyebrow="Onboarding"
        :badge="isArtistInviteMode ? 'Gmail' : 'Password'"
        :default-open="activeArtistSection === 'access'"
        class="create-artist-panel"
      >
        <div class="form-grid">
          <AppAlert v-if="createErrorMessage" variant="destructive">{{ createErrorMessage }}</AppAlert>
          <AppAlert v-if="createSuccessMessage" variant="success">{{ createSuccessMessage }}</AppAlert>

          <div class="field-row">
            <label for="artist-access-method">Access method</label>
            <NativeSelect id="artist-access-method" v-model="createArtistForm.accessMethod">
              <option value="password">Password account now</option>
              <option value="gmailInvite">Gmail invite</option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="artist-stage-name">Stage name</label>
            <Input id="artist-stage-name" v-model="createArtistForm.artistName" type="text" />
          </div>

          <div class="field-row">
            <label for="artist-full-name">Legal/full name</label>
            <Input id="artist-full-name" v-model="createArtistForm.fullName" type="text" />
          </div>

          <div class="field-row">
            <label for="artist-share-pct">Artist share %</label>
            <Input
              id="artist-share-pct"
              v-model="createArtistForm.artistSharePct"
              type="number"
              min="0"
              max="100"
              step="0.01"
            />
          </div>

          <div class="field-row">
            <label for="artist-email">Email</label>
            <Input id="artist-email" v-model="createArtistForm.email" type="email" />
          </div>

          <div v-if="!isArtistInviteMode" class="field-row">
            <label for="artist-password">Temporary password</label>
            <Input id="artist-password" v-model="createArtistForm.password" type="password" />
          </div>

          <div class="field-row">
            <label for="artist-country">Country</label>
            <Input id="artist-country" v-model="createArtistForm.country" type="text" />
          </div>

          <div class="field-row">
            <label for="artist-bio">Bio</label>
            <Textarea id="artist-bio" v-model="createArtistForm.bio" rows="3" />
          </div>

          <div class="flex flex-wrap gap-2">
            <Button :disabled="isSubmittingArtistCreate" @click="createArtistAccess">
              {{
                isSubmittingArtistCreate
                  ? (isArtistInviteMode ? "Creating invite..." : "Creating artist...")
                  : (isArtistInviteMode ? "Create Gmail invite" : "Create artist")
              }}
            </Button>
          </div>
        </div>
      </CollapsiblePanel>
    </div>

    <DataPanel
      v-if="activeArtistSection === 'directory'"
      title="Selected artist"
      eyebrow="Edit surface"
      description="Live admin edit surface for the selected artist account while keeping payout bank details visible."
    >
      <DashboardSkeleton v-if="artistsPending" :rows="3" />
      <AppEmptyState
        v-else-if="!visibleDirectoryArtists.length"
        compact
        title="Select an artist"
        description="Select an artist from the directory to edit."
      />
      <div v-else class="catalog-list">
        <template v-for="artist in visibleDirectoryArtists" :key="artist.id">
        <Card v-if="artistDrafts[artist.id] && artistPasswordDrafts[artist.id]" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ artistDisplayName(artist) }}</strong>
              <span class="detail-copy">{{ artist.email || "No email saved" }}</span>
              <span class="detail-copy">Artist share {{ formatArtistSharePct(artist.artistSharePct) }}</span>
              <span class="detail-copy">Created {{ formatDate(artist.createdAt) }}</span>
              <span v-if="artist.sharedAccountArtistCount > 1" class="detail-copy">
                Shared login with {{ artist.sharedAccountArtistCount }} artists
              </span>
              <span v-if="artist.loginFrozenAt" class="detail-copy">
                Frozen {{ formatDateTime(artist.loginFrozenAt) }}{{ artist.loginFrozenByName ? ` by ${artist.loginFrozenByName}` : "" }}
              </span>
            </div>
            <div class="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                :disabled="isArtistBusy(artist.id) || startingViewAsArtistId === artist.id"
                @click="viewAsArtist(artist)"
              >
                {{ startingViewAsArtistId === artist.id ? "Opening..." : "View as artist" }}
              </Button>
              <StatusBadge :tone="artist.isActive ? 'success' : 'danger'">
                {{ artist.isActive ? "Active" : "Inactive" }}
              </StatusBadge>
              <StatusBadge v-if="artist.loginFrozenAt" tone="danger">Frozen login</StatusBadge>
            </div>
          </div>

          <AppAlert v-if="artistStates[artist.id]?.errorMessage" variant="destructive">
            {{ artistStates[artist.id].errorMessage }}
          </AppAlert>
          <AppAlert v-if="artistStates[artist.id]?.successMessage" variant="success">
            {{ artistStates[artist.id].successMessage }}
          </AppAlert>
          <AppAlert v-if="sharedAccountWarning(artist)" variant="warning">
            {{ sharedAccountWarning(artist) }}
          </AppAlert>

          <div class="catalog-media-row">
            <Avatar class="catalog-cover-frame artist-detail-avatar">
              <AvatarImage
                v-if="artistDrafts[artist.id]?.avatarUrl"
                :src="artistDrafts[artist.id].avatarUrl"
                :alt="`${artistDisplayName(artist)} avatar`"
                class="catalog-cover-image"
                draggable="false"
              />
              <AvatarFallback class="catalog-cover-placeholder artist-detail-avatar-fallback">
                <strong>{{ artistInitial(artist) }}</strong>
                <span class="detail-copy">No avatar</span>
              </AvatarFallback>
            </Avatar>

            <div class="catalog-grid catalog-grid-wide">
              <div class="field-row">
                <label :for="`artist-name-${artist.id}`">Stage name</label>
                <Input :id="`artist-name-${artist.id}`" v-model="artistDrafts[artist.id].name" type="text" />
              </div>

              <div class="field-row">
                <label :for="`artist-email-draft-${artist.id}`">Login email</label>
                <Input :id="`artist-email-draft-${artist.id}`" v-model="artistDrafts[artist.id].email" type="email" />
              </div>

              <div class="field-row">
                <label :for="`artist-share-draft-${artist.id}`">Artist share %</label>
                <Input
                  :id="`artist-share-draft-${artist.id}`"
                  v-model="artistDrafts[artist.id].artistSharePct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>

              <div class="field-row">
                <label :for="`artist-avatar-${artist.id}`">Avatar URL</label>
                <Input :id="`artist-avatar-${artist.id}`" v-model="artistDrafts[artist.id].avatarUrl" type="url" />
              </div>

              <div class="field-row">
                <label :for="`artist-country-draft-${artist.id}`">Country</label>
                <Input :id="`artist-country-draft-${artist.id}`" v-model="artistDrafts[artist.id].country" type="text" />
              </div>

              <div class="field-row field-row-full">
                <label :for="`artist-bio-draft-${artist.id}`">Bio</label>
                <Textarea :id="`artist-bio-draft-${artist.id}`" v-model="artistDrafts[artist.id].bio" rows="3" />
              </div>
            </div>
          </div>

          <div class="panel-grid">
            <div class="catalog-subitem catalog-subitem-muted">
              <div class="summary-copy">
                <strong>Bank details</strong>
                <span class="detail-copy">Artist-managed payout destination data. Visible here for payout review only.</span>
              </div>

              <div v-if="artist.bankDetails" class="summary-table">
                <div class="summary-row">
                  <span class="detail-copy">Account name</span>
                  <strong>{{ artist.bankDetails.accountName }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Bank name</span>
                  <strong>{{ artist.bankDetails.bankName }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Account number</span>
                  <strong>{{ artist.bankDetails.accountNumber }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Bank address</span>
                  <strong>{{ artist.bankDetails.bankAddress || "Not set" }}</strong>
                </div>
              </div>

              <p v-else class="muted-copy">
                This artist has not entered bank details yet.
              </p>
            </div>

            <div class="catalog-subitem catalog-subitem-muted">
              <div class="summary-copy">
                <strong>Publishing info</strong>
                <span class="detail-copy">Admin-owned songwriter and collection metadata shown to the artist in settings.</span>
              </div>

              <div class="catalog-grid">
                <div class="field-row">
                  <label :for="`artist-legal-name-${artist.id}`">Legal name</label>
                  <Input :id="`artist-legal-name-${artist.id}`" v-model="artistDrafts[artist.id].legalName" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`artist-ipi-${artist.id}`">IPI / CAE</label>
                  <Input :id="`artist-ipi-${artist.id}`" v-model="artistDrafts[artist.id].ipiNumber" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`artist-pro-${artist.id}`">PRO</label>
                  <Input :id="`artist-pro-${artist.id}`" v-model="artistDrafts[artist.id].proName" type="text" />
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <Button

              :disabled="isArtistBusy(artist.id) || !hasArtistChanges(artist)"
              @click="saveArtist(artist)"
            >
              {{ artistStates[artist.id]?.isSaving ? "Saving..." : "Save artist" }}
            </Button>
            <Button
              variant="secondary"
              :disabled="isArtistBusy(artist.id) || !hasArtistChanges(artist)"
              @click="resetArtistDraft(artist)"
            >
              Reset
            </Button>
          </div>

          <div class="catalog-subitem catalog-subitem-muted">
            <div class="summary-copy">
              <strong>Dashboard password</strong>
              <span class="detail-copy">Set a new sign-in password for this artist account.</span>
            </div>

            <AppAlert v-if="passwordSharedAccountWarning(artist)" variant="warning">
              {{ passwordSharedAccountWarning(artist) }}
            </AppAlert>

            <div class="catalog-grid">
              <div class="field-row">
                <label :for="`artist-dashboard-password-${artist.id}`">New dashboard password</label>
                <Input
                  :id="`artist-dashboard-password-${artist.id}`"
                  v-model="artistPasswordDrafts[artist.id].password"
                  type="password"
                  autocomplete="new-password"
                  :disabled="isArtistBusy(artist.id)"
                />
              </div>

              <div class="field-row">
                <label :for="`artist-dashboard-password-confirm-${artist.id}`">Confirm dashboard password</label>
                <Input
                  :id="`artist-dashboard-password-confirm-${artist.id}`"
                  v-model="artistPasswordDrafts[artist.id].confirmPassword"
                  type="password"
                  autocomplete="new-password"
                  :disabled="isArtistBusy(artist.id)"
                />
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                :disabled="isArtistBusy(artist.id) || !hasArtistPasswordInput(artist.id)"
                @click="changeArtistPassword(artist)"
              >
                <KeyRound />
                {{ artistStates[artist.id]?.activeAction === "password" ? artistActionLabel("password") : "Change dashboard password" }}
              </Button>
            </div>
          </div>

          <div class="catalog-subitem catalog-subitem-muted">
            <div class="summary-copy">
              <strong>Danger actions</strong>
              <span class="detail-copy">Freeze affects the whole login. Archive and permanent delete only affect this artist record.</span>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button
                v-if="!artist.loginFrozenAt"
                variant="destructive"
                :disabled="isArtistBusy(artist.id)"
                @click="freezeArtistLogin(artist)"
              >
                {{ artistStates[artist.id]?.activeAction === "freeze" ? artistActionLabel("freeze") : "Freeze login" }}
              </Button>
              <Button
                v-else
                variant="secondary"
                :disabled="isArtistBusy(artist.id)"
                @click="unfreezeArtistLogin(artist)"
              >
                {{ artistStates[artist.id]?.activeAction === "unfreeze" ? artistActionLabel("unfreeze") : "Unfreeze login" }}
              </Button>

              <Button
                variant="destructive"
                :disabled="isArtistBusy(artist.id)"
                @click="orphanArtist(artist)"
              >
                {{ artistStates[artist.id]?.activeAction === "orphan" ? artistActionLabel("orphan") : "Archive artist" }}
              </Button>

              <Button
                variant="destructive"
                :disabled="isArtistBusy(artist.id)"
                @click="permanentlyDeleteArtist(artist)"
              >
                {{ artistStates[artist.id]?.activeAction === "permanentDelete" ? artistActionLabel("permanentDelete") : "Permanent delete" }}
              </Button>
            </div>

            <p class="field-note" v-if="artist.loginFrozenAt">
              Sign-in is blocked for this login until an admin unfreezes it.
            </p>
            <p class="field-note" v-if="artist.sharedAccountArtistCount > 1">
              Freezing this login affects every sibling artist on the same auth account.
            </p>
          </div>
        </Card>
        </template>
      </div>
    </DataPanel>

    <div v-if="activeArtistSection === 'access'" ref="accessQueueAnchor">
      <section class="grid gap-4">
        <div class="grid gap-1">
          <p class="eyebrow">Gmail invites</p>
          <h3 class="section-title text-lg">Access queue</h3>
          <p class="helper-copy max-w-2xl">
            Review artist and admin Gmail invite history here. Accepted artist invites stay in this audit queue and surface in the directory once provisioned.
          </p>
        </div>

        <AppAlert v-if="invitesError" variant="destructive">
          {{ invitesError.statusMessage || "Unable to load the access queue right now." }}
        </AppAlert>
        <AppAlert v-if="accessErrorMessage" variant="destructive">{{ accessErrorMessage }}</AppAlert>
        <AppAlert v-if="accessSuccessMessage" variant="success">{{ accessSuccessMessage }}</AppAlert>

        <div class="panel-grid">
          <DataPanel
            title="Admin Gmail invite"
            eyebrow="Access-only"
            description="Admins stay out of the artist directory. Use this compact form to allow a Gmail admin to provision on first Google sign-in."
          >
            <div class="form-grid">
              <div class="field-row">
                <label for="admin-invite-email">Gmail address</label>
                <Input id="admin-invite-email" v-model="adminInviteForm.email" type="email" />
              </div>

              <div class="field-row">
                <label for="admin-invite-full-name">Full name</label>
                <Input id="admin-invite-full-name" v-model="adminInviteForm.fullName" type="text" />
              </div>

              <div class="field-row">
                <label for="admin-invite-country">Country</label>
                <Input id="admin-invite-country" v-model="adminInviteForm.country" type="text" />
              </div>

              <div class="field-row">
                <label for="admin-invite-bio">Bio</label>
                <Textarea id="admin-invite-bio" v-model="adminInviteForm.bio" rows="3" />
              </div>

              <div class="flex flex-wrap gap-2">
                <Button :disabled="isSubmittingAdminInvite" @click="createAdminInvite">
                  {{ isSubmittingAdminInvite ? "Creating invite..." : "Create admin invite" }}
                </Button>
              </div>
            </div>
          </DataPanel>

          <DataPanel
            title="Queue filters"
            eyebrow="Review"
            description="Filter all invite history without leaving the Artists workspace."
          >
            <div class="form-grid">
              <div class="field-row">
                <label for="access-search">Search access queue</label>
                <Input
                  id="access-search"
                  v-model="accessSearchQuery"

                  type="search"
                  placeholder="Search by email, name, role, or reviewer"
                />
              </div>

              <div class="field-row">
                <label for="access-status-filter">Status</label>
                <NativeSelect id="access-status-filter" v-model="accessStatusFilter">
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="revoked">Revoked</option>
                </NativeSelect>
              </div>

              <div class="summary-table">
                <div class="summary-row">
                  <span class="detail-copy">Pending invites</span>
                  <strong>{{ inviteSummary.pendingCount }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Accepted invites</span>
                  <strong>{{ inviteSummary.acceptedCount }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Revoked invites</span>
                  <strong>{{ inviteSummary.revokedCount }}</strong>
                </div>
              </div>
            </div>
          </DataPanel>
        </div>

        <DashboardSkeleton v-if="invitesPending" :rows="5" />

        <AppEmptyState
          v-else-if="!filteredInvites.length"
          compact
          icon="search"
          title="No invite records"
          description="No invite records match the current filters."
        />

        <div v-else class="catalog-list">
          <template v-for="invite in filteredInvites" :key="invite.id">
          <Card v-if="inviteDrafts[invite.id]" class="catalog-item">
            <div class="catalog-header">
              <div class="summary-copy">
                <strong>{{ invite.email }}</strong>
                <span class="detail-copy">
                  {{ invite.role === "artist" ? invite.artistName || invite.fullName : invite.fullName }}
                </span>
                <span v-if="invite.role === 'artist'" class="detail-copy">
                  Artist share {{ formatArtistSharePct(invite.artistSharePct) }}
                </span>
                <span class="detail-copy">
                  Invited by {{ invite.invitedByAdminName || "Unknown admin" }} on {{ formatDateTime(invite.createdAt) }}
                </span>
              </div>
              <StatusBadge :tone="statusTone(invite.status)">{{ statusLabel(invite.status) }}</StatusBadge>
            </div>

            <div class="form-grid">
              <div class="field-row">
                <label :for="`invite-email-${invite.id}`">Gmail address</label>
                <Input
                  :id="`invite-email-${invite.id}`"
                  v-model="inviteDrafts[invite.id].email"

                  type="email"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row">
                <label :for="`invite-role-${invite.id}`">Role</label>
                <NativeSelect
                  :id="`invite-role-${invite.id}`"
                  v-model="inviteDrafts[invite.id].role"

                  :disabled="!canEditInvite(invite)"
                >
                  <option value="artist">Artist</option>
                  <option value="admin">Admin</option>
                </NativeSelect>
              </div>

              <div class="field-row">
                <label :for="`invite-full-name-${invite.id}`">Full name</label>
                <Input
                  :id="`invite-full-name-${invite.id}`"
                  v-model="inviteDrafts[invite.id].fullName"

                  type="text"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row" v-if="inviteDrafts[invite.id].role === 'artist'">
                <label :for="`invite-artist-name-${invite.id}`">Artist stage name</label>
                <Input
                  :id="`invite-artist-name-${invite.id}`"
                  v-model="inviteDrafts[invite.id].artistName"

                  type="text"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row" v-if="inviteDrafts[invite.id].role === 'artist'">
                <label :for="`invite-artist-share-${invite.id}`">Artist share %</label>
                <Input
                  :id="`invite-artist-share-${invite.id}`"
                  v-model="inviteDrafts[invite.id].artistSharePct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row">
                <label :for="`invite-country-${invite.id}`">Country</label>
                <Input
                  :id="`invite-country-${invite.id}`"
                  v-model="inviteDrafts[invite.id].country"

                  type="text"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row field-row-full">
                <label :for="`invite-bio-${invite.id}`">Bio</label>
                <Textarea
                  :id="`invite-bio-${invite.id}`"
                  v-model="inviteDrafts[invite.id].bio"

                  rows="3"
                  :disabled="!canEditInvite(invite)"
                />
              </div>
            </div>

            <div class="summary-table">
              <div class="summary-row" v-if="invite.acceptedAt">
                <span class="detail-copy">Accepted</span>
                <strong>{{ `${formatDateTime(invite.acceptedAt)} / ${invite.acceptedByName || "Unknown user"}` }}</strong>
              </div>
              <div class="summary-row" v-if="invite.revokedAt">
                <span class="detail-copy">Revoked</span>
                <strong>{{ `${formatDateTime(invite.revokedAt)} / ${invite.revokedByAdminName || "Unknown admin"}` }}</strong>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button

                :disabled="savingInviteId === invite.id || !canEditInvite(invite) || !accessDraftChanged(invite, inviteDrafts[invite.id])"
                @click="saveInvite(invite)"
              >
                {{ savingInviteId === invite.id ? "Saving..." : "Save invite" }}
              </Button>
              <Button
                variant="secondary"
                :disabled="savingInviteId === invite.id || !canEditInvite(invite)"
                @click="inviteDrafts[invite.id] = buildAccessDraft(invite)"
              >
                Reset
              </Button>
              <Button
                v-if="invite.status === 'pending'"
                variant="secondary"
                :disabled="savingInviteId === invite.id"
                @click="resendInviteEmail(invite)"
              >
                {{ savingInviteId === invite.id ? "Sending..." : "Resend email" }}
              </Button>
              <Button
                v-if="invite.status === 'pending'"
                variant="secondary"
                :disabled="savingInviteId === invite.id"
                @click="deleteInvite(invite)"
              >
                {{ savingInviteId === invite.id ? "Deleting..." : "Delete invite" }}
              </Button>
              <Button
                v-if="invite.status === 'revoked'"
                variant="secondary"
                :disabled="savingInviteId === invite.id"
                @click="changeInviteStatus(invite, 'pending')"
              >
                Reopen
              </Button>
              <Button
                v-if="invite.status === 'revoked'"
                variant="secondary"
                :disabled="savingInviteId === invite.id"
                @click="deleteInvite(invite)"
              >
                {{ savingInviteId === invite.id ? "Deleting..." : "Delete invite" }}
              </Button>
            </div>
          </Card>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.artist-directory-toolbar {
  position: relative;
  isolation: isolate;
  display: grid;
  gap: 12px;
  max-width: 920px;
  overflow: hidden;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 86%, var(--muted) 14%);
  box-shadow: var(--surface-control-shadow, none);
  padding: 12px;
}

.artist-directory-toolbar::before {
  position: absolute;
  inset: 0 0 auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--priority) 22%, transparent), transparent);
  content: "";
  pointer-events: none;
}

.artist-bulk-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  padding-top: 10px;
}

/* ── Bulk action dock: the ink slab that rises while rows are selected ── */
.artist-bulk-dock {
  position: fixed;
  bottom: 18px;
  left: 50%;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 18px;
  max-width: calc(100vw - 28px);
  border: 1px solid rgb(254 249 231 / 14%);
  border-radius: 14px;
  background: var(--topbar, #0a0a0a);
  color: var(--topbar-foreground, #fef9e7);
  padding: 9px 10px 9px 18px;
  box-shadow: 0 18px 40px -18px rgb(0 0 0 / 55%);
  transform: translateX(-50%);
}

.bulk-dock-count {
  margin: 0;
  font-size: 13px;
  white-space: nowrap;
}

.bulk-dock-count strong {
  font-variant-numeric: tabular-nums;
  font-weight: 720;
}

.bulk-dock-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bulk-dock-enter-active,
.bulk-dock-leave-active {
  transition:
    opacity var(--duration-standard, 200ms) var(--ease-out, ease),
    transform var(--duration-standard, 200ms) var(--ease-out, ease);
}

.bulk-dock-enter-from,
.bulk-dock-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(14px);
}

.artist-bulk-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.artist-directory-checkbox {
  margin-inline: auto;
}

.artist-directory-table :deep(.dashboard-data-table-desktop),
.artist-directory-table :deep(.dashboard-data-table-mobile) {
  max-height: min(58vh, 620px);
  overflow: auto;
}

.artist-directory-row {
  cursor: pointer;
}

.artist-directory-row:hover,
.artist-directory-row-selected {
  background: color-mix(in srgb, var(--priority) 5%, var(--muted) 22%);
}

.artist-directory-row-selected-for-delete {
  background: color-mix(in srgb, var(--destructive) 8%, transparent);
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--destructive) 46%, transparent);
}

.artist-directory-primary {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 220px;
}

.artist-directory-primary > div strong,
.artist-directory-primary > div span {
  display: block;
}

.artist-directory-primary > div span {
  margin-top: 2px;
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
}

.artist-directory-avatar {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: var(--surface-radius-compact, 10px);
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, var(--priority));
  background: color-mix(in srgb, var(--muted) 86%, var(--priority));
  color: var(--foreground);
  font-size: 13px;
  font-weight: 700;
  box-shadow: none;
}

.artist-directory-avatar-fallback {
  border-radius: inherit;
  background: transparent;
  color: inherit;
}

.catalog-media-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.artist-detail-avatar {
  width: clamp(96px, 18vw, 132px);
  height: clamp(96px, 18vw, 132px);
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--border) 74%, var(--primary));
  background: color-mix(in srgb, var(--muted) 82%, var(--primary));
  box-shadow: none;
}

.artist-detail-avatar :deep([data-slot="avatar-image"]) {
  border-radius: inherit;
}

.artist-detail-avatar-fallback {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 4px;
  border-radius: inherit;
  background: transparent;
  color: var(--foreground);
}

.artist-detail-avatar-fallback strong {
  font-size: 36px;
  line-height: 1;
}

@media (max-width: 720px) {
  .catalog-media-row {
    grid-template-columns: 1fr;
  }
}

.artist-directory-mobile-row {
  display: grid;
  gap: 10px;
  min-height: 72px;
  padding: 16px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.artist-directory-mobile-row:last-child {
  border-bottom: 0;
}

.artist-directory-mobile-row:hover,
.artist-directory-mobile-row-selected {
  background: color-mix(in srgb, var(--priority) 5%, var(--muted) 22%);
}

.artist-directory-mobile-row strong,
.artist-directory-mobile-row small {
  display: block;
}

.artist-directory-mobile-row small {
  margin-top: 3px;
  color: var(--muted-foreground);
  font-size: 12px;
}

.artist-selection-note {
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
}

.field-row-full {
  grid-column: 1 / -1;
}
</style>
