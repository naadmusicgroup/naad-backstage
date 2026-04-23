<script setup lang="ts">
import type {
  AdminArtistActionResponse,
  AdminArtistMutationResponse,
  AdminArtistOverview,
  AdminArtistsResponse,
  AdminInvitesResponse,
  AdminLoginInviteMutationResponse,
  AdminLoginInviteRecord,
  LoginInviteStatus,
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

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

interface ArtistDraft {
  name: string
  email: string
  avatarUrl: string
  country: string
  bio: string
  legalName: string
  ipiNumber: string
  proName: string
}

interface ArtistActionState {
  isSaving: boolean
  activeAction: "" | "freeze" | "unfreeze" | "orphan" | "permanentDelete"
  successMessage: string
  errorMessage: string
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
const startingViewAsArtistId = ref("")
const savingInviteId = ref("")
const artistDrafts = reactive<Record<string, ArtistDraft>>({})
const artistStates = reactive<Record<string, ArtistActionState>>({})
const inviteDrafts = reactive<Record<string, AccessDraft>>({})

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

const artists = computed(() => artistData.value?.artists ?? [])
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

watch(
  artists,
  (value) => {
    const activeArtistIds = new Set(value.map((artist) => artist.id))

    for (const artist of value) {
      if (!artistDrafts[artist.id]) {
        artistDrafts[artist.id] = buildArtistDraft(artist)
      }

      ensureArtistState(artist.id)
    }

    for (const artistId of Object.keys(artistDrafts)) {
      if (!activeArtistIds.has(artistId)) {
        delete artistDrafts[artistId]
      }
    }

    for (const artistId of Object.keys(artistStates)) {
      if (!activeArtistIds.has(artistId)) {
        delete artistStates[artistId]
      }
    }
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

function statusClass(status: LoginInviteStatus) {
  switch (status) {
    case "pending":
      return "status-processing"
    case "accepted":
      return "status-completed"
    case "revoked":
      return "status-failed"
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
      return "Deleting dashboard..."
    case "permanentDelete":
      return "Deleting forever..."
    default:
      return ""
  }
}

function isArtistBusy(artistId: string) {
  const state = ensureArtistState(artistId)
  return state.isSaving || Boolean(state.activeAction)
}

function sharedAccountWarning(artist: AdminArtistOverview) {
  if (artist.sharedAccountArtistCount <= 1) {
    return ""
  }

  return `This login is shared by ${artist.sharedAccountArtistCount} artists. Freezing it blocks sign-in for all of them.`
}

async function runArtistLifecycleAction(
  artist: AdminArtistOverview,
  action: ArtistActionState["activeAction"],
  path: string,
  confirmMessage: string,
  successMessage: string,
) {
  const state = ensureArtistState(artist.id)

  if (import.meta.client && !window.confirm(confirmMessage)) {
    return
  }

  state.activeAction = action
  state.errorMessage = ""
  state.successMessage = ""
  resetDirectoryMessage()

  try {
    await $fetch<AdminArtistActionResponse>(`/api/admin/artists/${artist.id}/${path}`, {
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
      const result = await $fetch<{ artist: { name: string; email: string } }>("/api/admin/artists", {
        method: "POST",
        body: {
          stageName: createArtistForm.artistName,
          fullName: createArtistForm.fullName,
          email: createArtistForm.email,
          password: createArtistForm.password,
          country: createArtistForm.country,
          bio: createArtistForm.bio,
        },
      })

      createSuccessMessage.value = `Created ${result.artist.name} (${result.artist.email}).`
      resetArtistCreateForm()
      await refreshArtists()
      return
    }

    const result = await $fetch<AdminLoginInviteMutationResponse>("/api/admin/invites", {
      method: "POST",
      body: buildInvitePayload({
        ...createArtistForm,
        role: "artist",
      }),
    })

    createSuccessMessage.value = `Created Gmail invite for ${result.invite.email}.`
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
    const result = await $fetch<AdminLoginInviteMutationResponse>("/api/admin/invites", {
      method: "POST",
      body: buildInvitePayload({
        ...adminInviteForm,
        role: "admin",
      }),
    })

    resetAdminInviteForm()
    await refreshInvites()
    setAccessSuccess(`Created admin Gmail invite for ${result.invite.email}.`)
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
    const result = await $fetch<AdminArtistMutationResponse>(`/api/admin/artists/${artist.id}`, {
      method: "PATCH",
      body: {
        name: draft.name,
        email: draft.email,
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

async function freezeArtistLogin(artist: AdminArtistOverview) {
  await runArtistLifecycleAction(
    artist,
    "freeze",
    "freeze",
    `${artist.sharedAccountArtistCount > 1
      ? `Freeze login for ${artist.name}? This will block sign-in for all ${artist.sharedAccountArtistCount} artists on this shared login.`
      : `Freeze login for ${artist.name}? The account will stay in the directory but nobody on this login can sign in until it is unfrozen.`}`,
    artist.sharedAccountArtistCount > 1
      ? `Froze the shared login for ${artist.name}. All sibling artists on that login are blocked until unfreezed.`
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
    `Delete dashboard for ${artist.name}? This removes dashboard access but keeps catalog, finance, and history in Orphaned artists for later restore.`,
    `Removed ${artist.name} from dashboard access. Restore the artist later from Orphaned artists in Settings.`,
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
    })
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
    const result = await $fetch<AdminLoginInviteMutationResponse>(`/api/admin/invites/${invite.id}`, {
      method: "PATCH",
      body: buildInvitePayload(draft),
    })

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
    const result = await $fetch<AdminLoginInviteMutationResponse>(`/api/admin/invites/${invite.id}`, {
      method: "PATCH",
      body: {
        status: nextStatus,
      },
    })

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
</script>

<template>
  <div class="page">
    <div class="metrics">
      <MetricCard
        v-for="metric in metrics"
        :key="metric.label"
        :label="metric.label"
        :value="metric.value"
        :footnote="metric.footnote"
        :tone="metric.tone"
      />
    </div>

    <div class="panel-grid">
      <SectionCard
        title="Create artist account"
        eyebrow="Onboarding"
        :description="isArtistInviteMode
          ? 'Create a Gmail invite that provisions the artist record on first Google sign-in.'
          : 'Create the auth user, application profile, and artist record in one server-side action.'"
      >
        <div class="form-grid">
          <div v-if="createErrorMessage" class="banner error">{{ createErrorMessage }}</div>
          <div v-if="createSuccessMessage" class="banner">{{ createSuccessMessage }}</div>

          <div class="field-row">
            <label for="artist-access-method">Access method</label>
            <select id="artist-access-method" v-model="createArtistForm.accessMethod" class="input">
              <option value="password">Password account now</option>
              <option value="gmailInvite">Gmail invite</option>
            </select>
          </div>

          <div class="field-row">
            <label for="artist-stage-name">Stage name</label>
            <input id="artist-stage-name" v-model="createArtistForm.artistName" class="input" type="text" />
          </div>

          <div class="field-row">
            <label for="artist-full-name">Legal/full name</label>
            <input id="artist-full-name" v-model="createArtistForm.fullName" class="input" type="text" />
          </div>

          <div class="field-row">
            <label for="artist-email">Email</label>
            <input id="artist-email" v-model="createArtistForm.email" class="input" type="email" />
          </div>

          <div v-if="!isArtistInviteMode" class="field-row">
            <label for="artist-password">Temporary password</label>
            <input id="artist-password" v-model="createArtistForm.password" class="input" type="password" />
          </div>

          <div class="field-row">
            <label for="artist-country">Country</label>
            <input id="artist-country" v-model="createArtistForm.country" class="input" type="text" />
          </div>

          <div class="field-row">
            <label for="artist-bio">Bio</label>
            <textarea id="artist-bio" v-model="createArtistForm.bio" class="input" rows="3" />
          </div>

          <div class="button-row">
            <button class="button" :disabled="isSubmittingArtistCreate" @click="createArtistAccess">
              {{
                isSubmittingArtistCreate
                  ? (isArtistInviteMode ? "Creating invite..." : "Creating artist...")
                  : (isArtistInviteMode ? "Create Gmail invite" : "Create artist")
              }}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Artist operations"
        eyebrow="Admin view"
        description="Edit active artist records here, and use the access queue below for Gmail invite history across artists and admins."
      >
        <div class="form-grid">
          <div v-if="artistsError" class="banner error">
            {{ artistsError.statusMessage || "Unable to load artist records right now." }}
          </div>

          <div v-if="directorySuccessMessage" class="banner">{{ directorySuccessMessage }}</div>

          <div class="field-row">
            <label for="artist-search">Search artists</label>
            <input
              id="artist-search"
              v-model="searchQuery"
              class="input"
              type="search"
              placeholder="Search by name, email, country, bio, or publishing info"
            />
          </div>

          <p class="field-note">
            Bank details remain artist-managed and read-only here. Publishing info is admin-owned and saved from each artist card.
          </p>
          <p class="field-note">
            Need Gmail invite history or admin access provisioning? Open the access queue below.
          </p>
        </div>
      </SectionCard>
    </div>

    <SectionCard
      title="Artist directory"
      eyebrow="Active records"
      description="Each card is the live admin edit surface for the active artist account while keeping payout bank details visible."
    >
      <div v-if="artistsPending" class="status-message">Loading artists...</div>

      <div v-else-if="!filteredArtists.length" class="muted-copy">
        No active artists match this search.
      </div>

      <div v-else class="catalog-list">
        <article v-for="artist in filteredArtists" :key="artist.id" class="catalog-item">
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ artist.name }}</strong>
              <span class="detail-copy">{{ artist.email || "No email saved" }}</span>
              <span class="detail-copy">Created {{ formatDate(artist.createdAt) }}</span>
              <span v-if="artist.sharedAccountArtistCount > 1" class="detail-copy">
                Shared login with {{ artist.sharedAccountArtistCount }} artists
              </span>
              <span v-if="artist.loginFrozenAt" class="detail-copy">
                Frozen {{ formatDateTime(artist.loginFrozenAt) }}{{ artist.loginFrozenByName ? ` by ${artist.loginFrozenByName}` : "" }}
              </span>
            </div>
            <div class="button-row">
              <span class="status-pill" :class="artist.isActive ? 'status-completed' : 'status-abandoned'">
                {{ artist.isActive ? "Active" : "Inactive" }}
              </span>
              <span v-if="artist.loginFrozenAt" class="status-pill status-failed">Frozen login</span>
            </div>
          </div>

          <div v-if="artistStates[artist.id]?.errorMessage" class="banner error">
            {{ artistStates[artist.id].errorMessage }}
          </div>
          <div v-if="artistStates[artist.id]?.successMessage" class="banner">
            {{ artistStates[artist.id].successMessage }}
          </div>
          <div v-if="sharedAccountWarning(artist)" class="banner">
            {{ sharedAccountWarning(artist) }}
          </div>

          <div class="catalog-media-row">
            <div class="catalog-cover-frame">
              <img
                v-if="artistDrafts[artist.id]?.avatarUrl"
                :src="artistDrafts[artist.id].avatarUrl"
                :alt="`${artistDrafts[artist.id].name || artist.name} avatar`"
                class="catalog-cover-image"
                draggable="false"
              />
              <div v-else class="catalog-cover-placeholder">
                <strong>{{ artistDrafts[artist.id]?.name?.slice(0, 1).toUpperCase() || artist.name.slice(0, 1).toUpperCase() }}</strong>
                <span class="detail-copy">No avatar</span>
              </div>
            </div>

            <div class="catalog-grid catalog-grid-wide">
              <div class="field-row">
                <label :for="`artist-name-${artist.id}`">Stage name</label>
                <input :id="`artist-name-${artist.id}`" v-model="artistDrafts[artist.id].name" class="input" type="text" />
              </div>

              <div class="field-row">
                <label :for="`artist-email-draft-${artist.id}`">Login email</label>
                <input :id="`artist-email-draft-${artist.id}`" v-model="artistDrafts[artist.id].email" class="input" type="email" />
              </div>

              <div class="field-row">
                <label :for="`artist-avatar-${artist.id}`">Avatar URL</label>
                <input :id="`artist-avatar-${artist.id}`" v-model="artistDrafts[artist.id].avatarUrl" class="input" type="url" />
              </div>

              <div class="field-row">
                <label :for="`artist-country-draft-${artist.id}`">Country</label>
                <input :id="`artist-country-draft-${artist.id}`" v-model="artistDrafts[artist.id].country" class="input" type="text" />
              </div>

              <div class="field-row field-row-full">
                <label :for="`artist-bio-draft-${artist.id}`">Bio</label>
                <textarea :id="`artist-bio-draft-${artist.id}`" v-model="artistDrafts[artist.id].bio" class="input" rows="3" />
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
                  <input :id="`artist-legal-name-${artist.id}`" v-model="artistDrafts[artist.id].legalName" class="input" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`artist-ipi-${artist.id}`">IPI / CAE</label>
                  <input :id="`artist-ipi-${artist.id}`" v-model="artistDrafts[artist.id].ipiNumber" class="input" type="text" />
                </div>

                <div class="field-row">
                  <label :for="`artist-pro-${artist.id}`">PRO</label>
                  <input :id="`artist-pro-${artist.id}`" v-model="artistDrafts[artist.id].proName" class="input" type="text" />
                </div>
              </div>
            </div>
          </div>

          <div class="button-row">
            <button
              class="button button-secondary"
              :disabled="isArtistBusy(artist.id) || startingViewAsArtistId === artist.id"
              @click="viewAsArtist(artist)"
            >
              {{ startingViewAsArtistId === artist.id ? "Opening..." : "View as artist" }}
            </button>
            <button
              class="button"
              :disabled="isArtistBusy(artist.id) || !hasArtistChanges(artist)"
              @click="saveArtist(artist)"
            >
              {{ artistStates[artist.id]?.isSaving ? "Saving..." : "Save artist" }}
            </button>
            <button
              class="button button-secondary"
              :disabled="isArtistBusy(artist.id) || !hasArtistChanges(artist)"
              @click="resetArtistDraft(artist)"
            >
              Reset
            </button>
          </div>

          <div class="catalog-subitem catalog-subitem-muted">
            <div class="summary-copy">
              <strong>Danger actions</strong>
              <span class="detail-copy">Freeze affects the whole login. Delete dashboard and permanent delete only affect this artist record.</span>
            </div>

            <div class="button-row">
              <button
                v-if="!artist.loginFrozenAt"
                class="button button-secondary button-danger"
                :disabled="isArtistBusy(artist.id)"
                @click="freezeArtistLogin(artist)"
              >
                {{ artistStates[artist.id]?.activeAction === "freeze" ? artistActionLabel("freeze") : "Freeze login" }}
              </button>
              <button
                v-else
                class="button button-secondary"
                :disabled="isArtistBusy(artist.id)"
                @click="unfreezeArtistLogin(artist)"
              >
                {{ artistStates[artist.id]?.activeAction === "unfreeze" ? artistActionLabel("unfreeze") : "Unfreeze login" }}
              </button>

              <button
                class="button button-secondary button-danger"
                :disabled="isArtistBusy(artist.id)"
                @click="orphanArtist(artist)"
              >
                {{ artistStates[artist.id]?.activeAction === "orphan" ? artistActionLabel("orphan") : "Delete dashboard" }}
              </button>

              <button
                class="button button-secondary button-danger"
                :disabled="isArtistBusy(artist.id)"
                @click="permanentlyDeleteArtist(artist)"
              >
                {{ artistStates[artist.id]?.activeAction === "permanentDelete" ? artistActionLabel("permanentDelete") : "Permanent delete" }}
              </button>
            </div>

            <p class="field-note" v-if="artist.loginFrozenAt">
              Sign-in is blocked for this login until an admin unfreezes it.
            </p>
            <p class="field-note" v-if="artist.sharedAccountArtistCount > 1">
              Freezing this login affects every sibling artist on the same auth account.
            </p>
          </div>
        </article>
      </div>
    </SectionCard>

    <div ref="accessQueueAnchor">
      <SectionCard
        title="Access queue"
        eyebrow="Gmail invites"
        description="Review artist and admin Gmail invite history here. Accepted artist invites stay in this audit queue and surface in the directory once provisioned."
      >
        <div v-if="invitesError" class="banner error">
          {{ invitesError.statusMessage || "Unable to load the access queue right now." }}
        </div>
        <div v-if="accessErrorMessage" class="banner error">{{ accessErrorMessage }}</div>
        <div v-if="accessSuccessMessage" class="banner">{{ accessSuccessMessage }}</div>

        <div class="panel-grid">
          <SectionCard
            title="Admin Gmail invite"
            eyebrow="Access-only"
            description="Admins stay out of the artist directory. Use this compact form to allow a Gmail admin to provision on first Google sign-in."
          >
            <div class="form-grid">
              <div class="field-row">
                <label for="admin-invite-email">Gmail address</label>
                <input id="admin-invite-email" v-model="adminInviteForm.email" class="input" type="email" />
              </div>

              <div class="field-row">
                <label for="admin-invite-full-name">Full name</label>
                <input id="admin-invite-full-name" v-model="adminInviteForm.fullName" class="input" type="text" />
              </div>

              <div class="field-row">
                <label for="admin-invite-country">Country</label>
                <input id="admin-invite-country" v-model="adminInviteForm.country" class="input" type="text" />
              </div>

              <div class="field-row">
                <label for="admin-invite-bio">Bio</label>
                <textarea id="admin-invite-bio" v-model="adminInviteForm.bio" class="input" rows="3" />
              </div>

              <div class="button-row">
                <button class="button" :disabled="isSubmittingAdminInvite" @click="createAdminInvite">
                  {{ isSubmittingAdminInvite ? "Creating invite..." : "Create admin invite" }}
                </button>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Queue filters"
            eyebrow="Review"
            description="Filter all invite history without leaving the Artists workspace."
          >
            <div class="form-grid">
              <div class="field-row">
                <label for="access-search">Search access queue</label>
                <input
                  id="access-search"
                  v-model="accessSearchQuery"
                  class="input"
                  type="search"
                  placeholder="Search by email, name, role, or reviewer"
                />
              </div>

              <div class="field-row">
                <label for="access-status-filter">Status</label>
                <select id="access-status-filter" v-model="accessStatusFilter" class="input">
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="revoked">Revoked</option>
                </select>
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
          </SectionCard>
        </div>

        <div v-if="invitesPending" class="status-message">Loading access queue...</div>

        <div v-else-if="!filteredInvites.length" class="muted-copy">
          No invite records match the current filters.
        </div>

        <div v-else class="catalog-list">
          <template v-for="invite in filteredInvites" :key="invite.id">
          <article v-if="inviteDrafts[invite.id]" class="catalog-item">
            <div class="catalog-header">
              <div class="summary-copy">
                <strong>{{ invite.email }}</strong>
                <span class="detail-copy">
                  {{ invite.role === "artist" ? invite.artistName || invite.fullName : invite.fullName }}
                </span>
                <span class="detail-copy">
                  Invited by {{ invite.invitedByAdminName || "Unknown admin" }} on {{ formatDateTime(invite.createdAt) }}
                </span>
              </div>
              <span class="status-pill" :class="statusClass(invite.status)">{{ statusLabel(invite.status) }}</span>
            </div>

            <div class="form-grid">
              <div class="field-row">
                <label :for="`invite-email-${invite.id}`">Gmail address</label>
                <input
                  :id="`invite-email-${invite.id}`"
                  v-model="inviteDrafts[invite.id].email"
                  class="input"
                  type="email"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row">
                <label :for="`invite-role-${invite.id}`">Role</label>
                <select
                  :id="`invite-role-${invite.id}`"
                  v-model="inviteDrafts[invite.id].role"
                  class="input"
                  :disabled="!canEditInvite(invite)"
                >
                  <option value="artist">Artist</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div class="field-row">
                <label :for="`invite-full-name-${invite.id}`">Full name</label>
                <input
                  :id="`invite-full-name-${invite.id}`"
                  v-model="inviteDrafts[invite.id].fullName"
                  class="input"
                  type="text"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row" v-if="inviteDrafts[invite.id].role === 'artist'">
                <label :for="`invite-artist-name-${invite.id}`">Artist stage name</label>
                <input
                  :id="`invite-artist-name-${invite.id}`"
                  v-model="inviteDrafts[invite.id].artistName"
                  class="input"
                  type="text"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row">
                <label :for="`invite-country-${invite.id}`">Country</label>
                <input
                  :id="`invite-country-${invite.id}`"
                  v-model="inviteDrafts[invite.id].country"
                  class="input"
                  type="text"
                  :disabled="!canEditInvite(invite)"
                />
              </div>

              <div class="field-row field-row-full">
                <label :for="`invite-bio-${invite.id}`">Bio</label>
                <textarea
                  :id="`invite-bio-${invite.id}`"
                  v-model="inviteDrafts[invite.id].bio"
                  class="input"
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

            <div class="button-row">
              <button
                class="button"
                :disabled="savingInviteId === invite.id || !canEditInvite(invite) || !accessDraftChanged(invite, inviteDrafts[invite.id])"
                @click="saveInvite(invite)"
              >
                {{ savingInviteId === invite.id ? "Saving..." : "Save invite" }}
              </button>
              <button
                class="button button-secondary"
                :disabled="savingInviteId === invite.id || !canEditInvite(invite)"
                @click="inviteDrafts[invite.id] = buildAccessDraft(invite)"
              >
                Reset
              </button>
              <button
                v-if="invite.status === 'pending'"
                class="button button-secondary"
                :disabled="savingInviteId === invite.id"
                @click="changeInviteStatus(invite, 'revoked')"
              >
                Revoke
              </button>
              <button
                v-if="invite.status === 'revoked'"
                class="button button-secondary"
                :disabled="savingInviteId === invite.id"
                @click="changeInviteStatus(invite, 'pending')"
              >
                Reopen
              </button>
            </div>
          </article>
          </template>
        </div>
      </SectionCard>
    </div>
  </div>
</template>

<style scoped>
.field-row-full {
  grid-column: 1 / -1;
}
</style>
