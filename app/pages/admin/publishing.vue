<script setup lang="ts">
import {
  Check,
  Eye,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-vue-next"
import { Checkbox } from "@/components/ui/checkbox"
import type { RowAction } from "~/components/RowActions.vue"
import type {
  AdminPublishingMutationInput,
  AdminPublishingRecord,
  AdminPublishingResponse,
  AdminPublishingUpdateInput,
} from "~~/types/admin"
import type {
  AdminPublishingDirectBatchInput,
  AdminPublishingRegistrationResponse,
  AdminPublishingWriterMutationResponse,
  AdminPublishingWriterRecord,
  AdminPublishingWriterStatusFilter,
  AdminPublishingWritersResponse,
  AdminPublishingWriterUpdateInput,
  AdminPublishingReviewInput,
  PublishingCatalogTrackOption,
  PublishingDefaultWriter,
  PublishingRegistrationStatus,
  PublishingRegistrationTrackRecord,
  PublishingRegistrationTrackSource,
  PublishingWriterOption,
} from "~~/types/publishing"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const NO_RELEASE = "none"
const ALL_FILTER = "all"
const ARTIST_PUBLISHING_INFO_WRITER_ID = "__artist_publishing_info__"
const writerRoleOptions = ["Lyrics", "Composition"] as const
const defaultWriterRole = "Composition"
type WriterRoleOption = (typeof writerRoleOptions)[number]

type AdminPublishingTab = "requests" | "history" | "direct" | "writers" | "credits"

interface PublishingDraft {
  releaseId: string
  amount: string
  periodMonth: string
  notes: string
}

interface WriterDraft {
  mode: "existing" | "new"
  writerId: string
  fullName: string
  ipiNumber: string
  proName: string
  role: string
  sharePct: string
  collectRoyalties: boolean
}

interface RegistrationTrackDraft {
  key: string
  source: PublishingRegistrationTrackSource
  trackId: string
  songTitle: string
  performerName: string
  spotifyUrl: string
  writers: WriterDraft[]
}

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const activeTab = ref<AdminPublishingTab>("requests")
const successMessage = ref("")
const errorMessage = ref("")
const registrationSearch = ref("")
const historyStatusFilter = ref<typeof ALL_FILTER | PublishingRegistrationStatus>(ALL_FILTER)
const historyArtistFilter = ref(ALL_FILTER)
const historyWriterFilter = ref(ALL_FILTER)
const historySourceFilter = ref(ALL_FILTER)
const writerStatusFilter = ref<AdminPublishingWriterStatusFilter>("active")
const selectedReviewTrackIds = ref<string[]>([])
const reviewingKey = ref("")
const directCreating = ref(false)
const writerEditorOpen = ref(false)
const selectedWriter = ref<AdminPublishingWriterRecord | null>(null)
const savingWriterId = ref("")
const deletingWriterId = ref("")
const restoringWriterId = ref("")
let draftKeyCounter = 0

const createForm = reactive({
  artistId: "",
  releaseId: NO_RELEASE,
  amount: "",
  periodMonth: new Date().toISOString().slice(0, 7),
  notes: "",
})
const creating = ref(false)
const updatingEntryId = ref("")
const deletingEntryId = ref("")
const editDrafts = reactive<Record<string, PublishingDraft>>({})
const { confirmAction } = useConfirmAction()

const directForm = reactive({
  artistId: "",
  adminNotes: "",
})
const directSelectedCatalogTrackIds = ref<string[]>([])
const directDraftTracks = ref<RegistrationTrackDraft[]>([])
const writerEditForm = reactive({
  fullName: "",
  firstName: "",
  middleName: "",
  lastName: "",
  ipiNumber: "",
  proName: "",
})

const { data: creditData, pending: creditPending, error: creditError, refresh: refreshCredits } = useLazyFetch<AdminPublishingResponse>("/api/admin/publishing")

useRevealPage({
  ready: computed(() => !creditPending.value || !!creditData.value),
})
const { data: registrationData, pending: registrationPending, error: registrationError, refresh: refreshRegistrations } = useLazyFetch<AdminPublishingRegistrationResponse>("/api/admin/publishing/registrations")
const {
  data: writerDirectoryData,
  pending: writerDirectoryPending,
  error: writerDirectoryError,
  refresh: refreshWriterDirectory,
} = useLazyFetch<AdminPublishingWritersResponse>("/api/admin/publishing/writers", {
  query: computed(() => ({
    status: writerStatusFilter.value,
  })),
})

const entries = computed(() => creditData.value?.entries ?? [])
const creditArtistOptions = computed(() => creditData.value?.artistOptions ?? [])
const releaseOptions = computed(() => creditData.value?.releaseOptions ?? [])
const publishingTableExpandedRowIds = computed(() => entries.value.map((entry) => entry.id))
const creditSummary = computed(() => creditData.value?.summary ?? {
  entryCount: 0,
  totalAmount: "0.00000000",
  artistCount: 0,
  releaseCount: 0,
  periodCount: 0,
})

const registrationTracks = computed(() => registrationData.value?.tracks ?? [])
const artistOptions = computed(() => registrationData.value?.artistOptions ?? [])
const writerOptions = computed(() => registrationData.value?.writerOptions ?? [])
const writerRecords = computed(() => writerDirectoryData.value?.writers ?? [])
const writerDirectorySummary = computed(() => writerDirectoryData.value?.summary ?? {
  writerCount: 0,
  activeCount: 0,
  archivedCount: 0,
  linkedArtistCount: 0,
  registrationCount: 0,
})
const catalogTrackOptions = computed(() => registrationData.value?.catalogTrackOptions ?? [])
const directDefaultWriter = computed(() => {
  return artistOptions.value.find((option) => option.value === directForm.artistId)?.defaultWriter ?? null
})
const directDefaultWriterOption = computed(() => {
  return directDefaultWriter.value ? findDefaultWriterOption(directDefaultWriter.value) : null
})
const directWriterOptions = computed<PublishingWriterOption[]>(() => {
  const defaultWriter = directDefaultWriter.value

  if (!defaultWriter?.fullName) {
    return writerOptions.value
  }

  const matchedOption = directDefaultWriterOption.value

  if (matchedOption) {
    return [
      {
        ...matchedOption,
        label: `${matchedOption.label} (Artist publishing info)`,
        meta: matchedOption.linkedArtistNames?.length
          ? `Linked: ${matchedOption.linkedArtistNames.join(", ")}`
          : "Artist publishing info",
      },
      ...writerOptions.value.filter((option) => option.value !== matchedOption.value),
    ]
  }

  return [
    {
      value: ARTIST_PUBLISHING_INFO_WRITER_ID,
      label: `${defaultWriter.fullName} (Artist publishing info)`,
      ipiNumber: defaultWriter.ipiNumber,
      proName: defaultWriter.proName,
      meta: "Will be saved as global writer",
      linkedArtistNames: [],
    },
    ...writerOptions.value,
  ]
})
const registrationSummary = computed(() => registrationData.value?.summary ?? {
  trackCount: 0,
  pendingCount: 0,
  acceptedCount: 0,
  rejectedCount: 0,
  artistCount: 0,
  writerCount: 0,
})

const createReleaseOptions = computed(() => {
  if (!createForm.artistId) {
    return []
  }

  return releaseOptions.value.filter((option) => option.meta === createForm.artistId)
})

const directCatalogOptions = computed(() => {
  if (!directForm.artistId) {
    return []
  }

  return catalogTrackOptions.value.filter((option) => option.artistId === directForm.artistId)
})
const canSubmitDirectPublishingBatch = computed(() => (
  !directCreating.value
  && Boolean(directForm.artistId)
  && directDraftTracks.value.length > 0
  && directDraftTracks.value.every((track) => track.writers.every(writerIsComplete))
))

const requestTracks = computed(() => filterRegistrationTracks(
  registrationTracks.value.filter((track) => track.status === "pending_review"),
  registrationSearch.value,
))

const historyTracks = computed(() => filterRegistrationTracks(
  registrationTracks.value.filter((track) => track.status !== "pending_review")
    .filter((track) => historyStatusFilter.value === ALL_FILTER || track.status === historyStatusFilter.value)
    .filter((track) => historyArtistFilter.value === ALL_FILTER || track.artistId === historyArtistFilter.value)
    .filter((track) => historySourceFilter.value === ALL_FILTER || track.batchSource === historySourceFilter.value)
    .filter((track) => historyWriterFilter.value === ALL_FILTER || track.writers.some((writer) => writer.writerId === historyWriterFilter.value)),
  registrationSearch.value,
))

const selectedPendingReviewIds = computed(() => selectedReviewTrackIds.value.filter((trackId) => {
  const track = registrationTracks.value.find((entry) => entry.id === trackId)
  return track?.status === "pending_review"
}))

const summaryMetrics = computed(() => [
  {
    label: "Pending requests",
    value: registrationSummary.value.pendingCount.toLocaleString(),
    footnote: "Publishing rows awaiting review",
    tone: "alt" as const,
  },
  {
    label: "Accepted registrations",
    value: registrationSummary.value.acceptedCount.toLocaleString(),
    footnote: "Metadata only, no wallet credit",
    tone: "accent" as const,
  },
  {
    label: "Global writers",
    value: writerOptions.value.length.toLocaleString(),
    footnote: "Available to admin across accounts",
    tone: "default" as const,
  },
  {
    label: "Revenue credits",
    value: formatMoney(creditSummary.value.totalAmount),
    footnote: `${creditSummary.value.entryCount.toLocaleString()} ledger-backed credits`,
    tone: "default" as const,
  },
])

const requestColumns = [
  { key: "select", label: "", accessor: (row: any) => row.id, searchable: false, sortable: false },
  { key: "track", label: "Track", accessor: (row: any) => row.trackTitle },
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "writers", label: "Writers", accessor: (row: any) => row.writers.map((writer: any) => writer.fullName).join(", ") },
  { key: "source", label: "Source", accessor: (row: any) => row.batchSource },
  { key: "created", label: "Created", accessor: (row: any) => row.createdAt },
  { key: "actions", label: "Actions", accessor: (row: any) => row.id, searchable: false, sortable: false },
]
const historyColumns = [
  { key: "track", label: "Track", accessor: (row: any) => row.trackTitle },
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "writers", label: "Writers", accessor: (row: any) => row.writers.map((writer: any) => writer.fullName).join(", ") },
  { key: "source", label: "Source", accessor: (row: any) => row.batchSource },
  { key: "reviewed", label: "Reviewed", accessor: (row: any) => row.reviewedAt || row.updatedAt },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
]
const writerColumns = [
  { key: "name", label: "Writer", accessor: (row: any) => row.fullName },
  { key: "ipi", label: "IPI", accessor: (row: any) => row.ipiNumber || "" },
  { key: "pro", label: "PRO", accessor: (row: any) => row.proName || "" },
  { key: "artists", label: "Linked artists", accessor: (row: any) => row.linkedArtistNames.join(", ") },
  { key: "registrations", label: "Registrations", accessor: (row: any) => row.registrationCount },
  { key: "status", label: "Status", accessor: (row: any) => row.isActive ? "Active" : "Archived" },
  { key: "updated", label: "Updated", accessor: (row: any) => row.updatedAt },
  { key: "actions", label: "Actions", accessor: (row: any) => row.id, searchable: false, sortable: false },
]
const publishingEntryColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "release", label: "Release", accessor: (row: any) => row.releaseTitle || "Catalog-level credit" },
  { key: "period", label: "Period", accessor: (row: any) => row.periodMonth },
  { key: "entered", label: "Entered by", accessor: (row: any) => row.enteredByName || "Unknown admin" },
  { key: "ledger", label: "Ledger entry", accessor: (row: any) => row.ledgerEntryId || "" },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0) },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
]

watch(
  entries,
  (value) => {
    for (const entry of value) {
      editDrafts[entry.id] = {
        releaseId: entry.releaseId ?? NO_RELEASE,
        amount: decimalInputValue(entry.amount),
        periodMonth: inputMonthValue(entry.periodMonth),
        notes: entry.notes ?? "",
      }
    }
  },
  { immediate: true },
)

watch(
  () => createForm.artistId,
  () => {
    if (createForm.releaseId !== NO_RELEASE && !createReleaseOptions.value.some((option) => option.value === createForm.releaseId)) {
      createForm.releaseId = NO_RELEASE
    }
  },
)

watch(
  artistOptions,
  (value) => {
    if (!directForm.artistId && value.length) {
      directForm.artistId = value[0].value
    }
  },
  { immediate: true },
)

watch(
  () => directForm.artistId,
  () => {
    directSelectedCatalogTrackIds.value = []
    directDraftTracks.value = []
  },
)

watch([directDefaultWriter, writerOptions], () => {
  applyArtistDefaultToEmptyFirstWriters()
})

watch(activeTab, (tab) => {
  if (tab === "writers") {
    refreshWriterDirectory()
  }
})

watch(writerStatusFilter, () => {
  if (activeTab.value === "writers") {
    refreshWriterDirectory()
  }
})

function filterRegistrationTracks(tracks: PublishingRegistrationTrackRecord[], search: string) {
  const query = search.trim().toLowerCase()

  if (!query) {
    return tracks
  }

  return tracks.filter((track) => [
    track.trackTitle,
    track.performerName,
    track.artistName,
    track.releaseTitle,
    track.spotifyUrl,
    track.adminNotes,
    track.artistNotes,
    track.writers.map((writer) => `${writer.fullName} ${writer.ipiNumber ?? ""} ${writer.proName ?? ""}`).join(" "),
  ].filter(Boolean).join(" ").toLowerCase().includes(query))
}

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function setError(error: any, fallback: string) {
  errorMessage.value = error?.data?.statusMessage || error?.message || fallback
  successMessage.value = ""
}

function resetMessages() {
  successMessage.value = ""
  errorMessage.value = ""
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

function formatMoney(value: string) {
  return `$${Number(value || 0).toFixed(2)}`
}

function formatMonth(value: string) {
  return monthFormatter.format(new Date(value))
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not recorded"
  }

  return dateFormatter.format(new Date(value))
}

function inputMonthValue(value: string) {
  return value.slice(0, 7)
}

function decimalInputValue(value: string) {
  return Number(value || 0).toFixed(2)
}

function releaseOptionsForEntry(entry: AdminPublishingRecord) {
  return releaseOptions.value.filter((option) => option.meta === entry.artistId)
}

function releaseIdForApi(value: string) {
  return value === NO_RELEASE ? null : value
}

function periodMonthForApi(value: string) {
  return value.length === 7 ? `${value}-01` : value
}

function resetCreateForm() {
  createForm.releaseId = NO_RELEASE
  createForm.amount = ""
  createForm.notes = ""
}

function statusLabel(status: PublishingRegistrationStatus) {
  if (status === "pending_review") return "Pending"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusTone(status: PublishingRegistrationStatus) {
  if (status === "accepted") return "success" as const
  if (status === "rejected") return "danger" as const
  return "warning" as const
}

function writerStatusTone(writer: AdminPublishingWriterRecord) {
  return writer.isActive ? "success" as const : "warning" as const
}

function sourceLabel(source: string) {
  return source === "admin_direct" ? "Admin added" : "Artist request"
}

function nextDraftKey() {
  draftKeyCounter += 1
  return `admin-publishing-draft-${Date.now()}-${draftKeyCounter}`
}

function normalizedWriterMatchValue(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase()
}

function findDefaultWriterOption(defaultWriter: PublishingDefaultWriter) {
  const defaultName = normalizedWriterMatchValue(defaultWriter.fullName)
  const defaultIpi = normalizedWriterMatchValue(defaultWriter.ipiNumber)
  const defaultPro = normalizedWriterMatchValue(defaultWriter.proName)

  return writerOptions.value.find((option) => {
    return Boolean(defaultName)
      && normalizedWriterMatchValue(option.label) === defaultName
      && normalizedWriterMatchValue(option.ipiNumber) === defaultIpi
      && normalizedWriterMatchValue(option.proName) === defaultPro
  }) ?? null
}

function blankWriterDraft(sharePct = "100.00", options: { useArtistDefault?: boolean } = {}): WriterDraft {
  const defaultWriter = options.useArtistDefault === false ? null : directDefaultWriter.value

  if (defaultWriter) {
    return {
      mode: "new",
      writerId: "",
      fullName: defaultWriter.fullName,
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
    ipiNumber: "",
    proName: "",
    role: defaultWriterRole,
    sharePct,
    collectRoyalties: true,
  }
}

function writerCanReceiveArtistDefault(writer: WriterDraft) {
  return writer.mode === "new"
    && !writer.writerId
    && !writer.fullName.trim()
    && !writer.ipiNumber.trim()
    && !writer.proName.trim()
}

function applyArtistDefaultToEmptyFirstWriters() {
  if (!directDefaultWriter.value) {
    return
  }

  for (const track of directDraftTracks.value) {
    const firstWriter = track.writers[0]

    if (firstWriter && writerCanReceiveArtistDefault(firstWriter)) {
      track.writers[0] = blankWriterDraft(firstWriter.sharePct || "100.00")
    }
  }
}

function blankManualTrack(): RegistrationTrackDraft {
  const artist = artistOptions.value.find((option) => option.value === directForm.artistId)

  return {
    key: nextDraftKey(),
    source: "manual",
    trackId: "",
    songTitle: "",
    performerName: artist?.label ?? "",
    spotifyUrl: "",
    writers: [blankWriterDraft()],
  }
}

function catalogTrackDraft(trackId: string): RegistrationTrackDraft | null {
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

function catalogTrackIsRegistered(option: PublishingCatalogTrackOption | null | undefined) {
  return Boolean(option?.registrationStatus)
}

function catalogTrackActionLabel(option: PublishingCatalogTrackOption) {
  if (catalogTrackIsRegistered(option)) {
    return "Track already registered"
  }

  return directSelectedCatalogTrackIds.value.includes(option.value) ? "Selected" : "Available"
}

function addDirectCatalogTracks() {
  const existingIds = new Set(directDraftTracks.value.map((track) => track.trackId).filter(Boolean))
  const nextTracks = directCatalogOptions.value
    .filter((option) => directSelectedCatalogTrackIds.value.includes(option.value))
    .filter((option) => !catalogTrackIsRegistered(option) && !existingIds.has(option.value))
    .map((option) => catalogTrackDraft(option.value))
    .filter(Boolean) as RegistrationTrackDraft[]

  directDraftTracks.value = [...directDraftTracks.value, ...nextTracks]
  directSelectedCatalogTrackIds.value = []
}

function addDirectManualTrack() {
  directDraftTracks.value = [...directDraftTracks.value, blankManualTrack()]
}

function removeDirectTrack(index: number) {
  directDraftTracks.value.splice(index, 1)
}

function addWriter(track: RegistrationTrackDraft) {
  track.writers.push(blankWriterDraft("0.00", { useArtistDefault: false }))
}

function removeWriter(track: RegistrationTrackDraft, writerIndex: number) {
  if (track.writers.length <= 1) {
    return
  }

  track.writers.splice(writerIndex, 1)
}

function writerIsComplete(writer: WriterDraft) {
  if (writer.mode === "existing") {
    return Boolean(writer.writerId)
  }

  return Boolean(writer.fullName.trim())
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

function applyArtistPublishingInfoWriter(writer: WriterDraft) {
  const defaultWriter = directDefaultWriter.value

  writer.mode = "new"
  writer.writerId = ""
  writer.fullName = defaultWriter?.fullName ?? ""
  writer.ipiNumber = defaultWriter?.ipiNumber ?? ""
  writer.proName = defaultWriter?.proName ?? ""
}

function setGlobalWriter(writer: WriterDraft, writerId: unknown) {
  const nextWriterId = String(writerId ?? "")

  if (nextWriterId === ARTIST_PUBLISHING_INFO_WRITER_ID) {
    applyArtistPublishingInfoWriter(writer)
    return
  }

  writer.writerId = nextWriterId
  const option = writerOptions.value.find((entry) => entry.value === writer.writerId)

  if (option) {
    writer.fullName = option.label
    writer.ipiNumber = option.ipiNumber ?? ""
    writer.proName = option.proName ?? ""
  }
}

function writerPayload(writer: WriterDraft) {
  if (writer.mode === "existing" && writer.writerId !== ARTIST_PUBLISHING_INFO_WRITER_ID) {
    return {
      writerId: writer.writerId,
      role: writer.role,
      sharePct: writer.sharePct,
      collectRoyalties: true,
    }
  }

  return {
    fullName: writer.fullName,
    ipiNumber: writer.ipiNumber || null,
    proName: writer.proName || null,
    role: writer.role,
    sharePct: writer.sharePct,
    collectRoyalties: true,
  }
}

function openWriterEditor(writer: AdminPublishingWriterRecord) {
  selectedWriter.value = writer
  writerEditForm.fullName = writer.fullName
  writerEditForm.firstName = writer.firstName ?? ""
  writerEditForm.middleName = writer.middleName ?? ""
  writerEditForm.lastName = writer.lastName ?? ""
  writerEditForm.ipiNumber = writer.ipiNumber ?? ""
  writerEditForm.proName = writer.proName ?? ""
  writerEditorOpen.value = true
}

function writerEditPayload(): AdminPublishingWriterUpdateInput {
  return {
    fullName: writerEditForm.fullName,
    firstName: writerEditForm.firstName || null,
    middleName: writerEditForm.middleName || null,
    lastName: writerEditForm.lastName || null,
    ipiNumber: writerEditForm.ipiNumber || null,
    proName: writerEditForm.proName || null,
  }
}

async function refreshPublishingWriterViews() {
  await Promise.all([
    refreshWriterDirectory(),
    refreshRegistrations(),
  ])
}

async function saveWriter() {
  const writer = selectedWriter.value

  if (!writer) {
    return
  }

  savingWriterId.value = writer.id
  resetMessages()

  try {
    const result = await $fetch(`/api/admin/publishing/writers/${writer.id}`, {
      method: "PATCH",
      body: writerEditPayload(),
    }) as AdminPublishingWriterMutationResponse

    await refreshPublishingWriterViews()

    if (result.writer) {
      selectedWriter.value = result.writer
      openWriterEditor(result.writer)
    }

    setSuccess(result.mergedIntoWriterId
      ? "Writer updated and merged into the existing global writer profile."
      : "Writer profile updated.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to update this publishing writer.")
  } finally {
    savingWriterId.value = ""
  }
}

async function deleteOrArchiveWriter() {
  const writer = selectedWriter.value

  if (!writer) {
    return
  }

  const willArchive = writer.registrationCount > 0
  const confirmed = await confirmAction({
    title: willArchive ? "Archive writer" : "Delete writer",
    description: willArchive
      ? `${writer.fullName} has ${writer.registrationCount.toLocaleString()} registration reference${writer.registrationCount === 1 ? "" : "s"}. Archive this writer and keep history intact?`
      : `Delete ${writer.fullName}? This writer has no registration history.`,
    confirmLabel: willArchive ? "Archive writer" : "Delete writer",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  deletingWriterId.value = writer.id
  resetMessages()

  try {
    const result = await $fetch(`/api/admin/publishing/writers/${writer.id}`, {
      method: "DELETE",
    }) as AdminPublishingWriterMutationResponse

    await refreshPublishingWriterViews()

    if (result.writer) {
      selectedWriter.value = result.writer
      openWriterEditor(result.writer)
    } else {
      writerEditorOpen.value = false
      selectedWriter.value = null
    }

    setSuccess(result.archived ? "Writer archived. Registration history still points to this profile." : "Writer deleted.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to delete this publishing writer.")
  } finally {
    deletingWriterId.value = ""
  }
}

async function restoreWriter() {
  const writer = selectedWriter.value

  if (!writer) {
    return
  }

  restoringWriterId.value = writer.id
  resetMessages()

  try {
    const result = await $fetch(`/api/admin/publishing/writers/${writer.id}/restore`, {
      method: "POST",
    }) as AdminPublishingWriterMutationResponse

    await refreshPublishingWriterViews()

    if (result.writer) {
      selectedWriter.value = result.writer
      openWriterEditor(result.writer)
    }

    setSuccess(result.mergedIntoWriterId
      ? "Archived writer merged into the active global writer profile."
      : "Writer restored and available for selection again.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to restore this publishing writer.")
  } finally {
    restoringWriterId.value = ""
  }
}

async function reviewRegistrationTracks(trackIds: string[], action: "accept" | "reject", label: string) {
  if (!trackIds.length) {
    return
  }

  reviewingKey.value = `${action}:${label}`
  resetMessages()

  try {
    const body: AdminPublishingReviewInput = {
      trackIds,
      action,
      adminNotes: "",
    }

    await $fetch("/api/admin/publishing/registrations/review", {
      method: "POST",
      body,
    })

    selectedReviewTrackIds.value = selectedReviewTrackIds.value.filter((trackId) => !trackIds.includes(trackId))
    await refreshRegistrations()
    setSuccess(`${trackIds.length} publishing registration track${trackIds.length === 1 ? "" : "s"} ${action === "accept" ? "accepted" : "rejected"}.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to review publishing registrations.")
  } finally {
    reviewingKey.value = ""
  }
}

function reviewBatch(batchId: string, action: "accept" | "reject") {
  const ids = requestTracks.value.filter((track) => track.batchId === batchId).map((track) => track.id)
  return reviewRegistrationTracks(ids, action, `batch-${batchId}`)
}

async function submitDirectPublishingBatch() {
  directCreating.value = true
  resetMessages()

  try {
    const body: AdminPublishingDirectBatchInput = {
      artistId: directForm.artistId,
      adminNotes: directForm.adminNotes || null,
      tracks: directDraftTracks.value.map((track) => ({
        source: track.source,
        trackId: track.source === "catalog" ? track.trackId : null,
        songTitle: track.source === "manual" ? track.songTitle : null,
        performerName: track.source === "manual" ? track.performerName : null,
        spotifyUrl: track.source === "manual" ? track.spotifyUrl : null,
        writers: track.writers.map(writerPayload),
      })),
    }

    await $fetch("/api/admin/publishing/registrations", {
      method: "POST",
      body,
    })

    directDraftTracks.value = []
    directForm.adminNotes = ""
    await refreshRegistrations()
    setSuccess("Publishing tracks added directly to the artist dashboard.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to add publishing tracks.")
  } finally {
    directCreating.value = false
  }
}

async function createPublishingCredit() {
  creating.value = true
  resetMessages()

  try {
    const body: AdminPublishingMutationInput = {
      artistId: createForm.artistId,
      releaseId: releaseIdForApi(createForm.releaseId),
      amount: createForm.amount,
      periodMonth: periodMonthForApi(createForm.periodMonth),
      notes: createForm.notes || null,
    }

    await $fetch("/api/admin/publishing", {
      method: "POST",
      body,
    })

    await refreshCredits()
    resetCreateForm()
    setSuccess("Publishing credit created and posted to the wallet ledger.")
  } catch (fetchError: any) {
    setError(fetchError, "Unable to create this publishing credit.")
  } finally {
    creating.value = false
  }
}

async function updatePublishingCredit(entry: AdminPublishingRecord) {
  const draft = editDrafts[entry.id]

  if (!draft) {
    return
  }

  updatingEntryId.value = entry.id
  resetMessages()

  try {
    const body: AdminPublishingUpdateInput = {
      releaseId: releaseIdForApi(draft.releaseId),
      amount: draft.amount,
      periodMonth: periodMonthForApi(draft.periodMonth),
      notes: draft.notes || null,
    }

    await $fetch(`/api/admin/publishing/${entry.id}`, {
      method: "PATCH",
      body,
    })

    await refreshCredits()
    setSuccess(`Publishing credit for ${entry.artistName} updated.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to update this publishing credit.")
  } finally {
    updatingEntryId.value = ""
  }
}

async function deletePublishingCredit(entry: AdminPublishingRecord) {
  const confirmed = await confirmAction({
    title: "Delete publishing credit",
    description: `Delete this ${formatMoney(entry.amount)} publishing credit for ${entry.artistName}?`,
    confirmLabel: "Delete credit",
    variant: "destructive",
  })

  if (!confirmed) {
    return
  }

  deletingEntryId.value = entry.id
  resetMessages()

  try {
    await $fetch(`/api/admin/publishing/${entry.id}`, {
      method: "DELETE",
    })

    await refreshCredits()
    setSuccess(`Publishing credit for ${entry.artistName} deleted and reversed in the wallet ledger.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to delete this publishing credit.")
  } finally {
    deletingEntryId.value = ""
  }
}

// ── Row kebab + dialogs ──
const trackDetailsOpen = ref(false)
const activeTrackId = ref("")
const activeTrack = computed(() => registrationTracks.value.find((track) => track.id === activeTrackId.value) ?? null)

const creditCreateOpen = ref(false)
const creditEditOpen = ref(false)
const creditDetailsOpen = ref(false)
const activeCreditId = ref("")
const activeCredit = computed(() => entries.value.find((entry) => entry.id === activeCreditId.value) ?? null)

function openTrackDetails(track: PublishingRegistrationTrackRecord) {
  activeTrackId.value = track.id
  trackDetailsOpen.value = true
}

function requestRowActions(): RowAction[] {
  return [
    { key: "details", label: "View details", icon: Eye },
    { key: "accept", label: "Accept", icon: Check, separatorBefore: true },
    { key: "reject", label: "Reject", icon: X, variant: "destructive" },
    { key: "acceptBatch", label: "Accept batch", separatorBefore: true },
    { key: "rejectBatch", label: "Reject batch", variant: "destructive" },
  ]
}

function onRequestAction(key: string, track: PublishingRegistrationTrackRecord) {
  if (key === "details") {
    openTrackDetails(track)
  } else if (key === "accept") {
    void reviewRegistrationTracks([track.id], "accept", track.id)
  } else if (key === "reject") {
    void reviewRegistrationTracks([track.id], "reject", track.id)
  } else if (key === "acceptBatch") {
    void reviewBatch(track.batchId, "accept")
  } else if (key === "rejectBatch") {
    void reviewBatch(track.batchId, "reject")
  }
}

function historyRowActions(): RowAction[] {
  return [{ key: "details", label: "View details", icon: Eye }]
}

function onHistoryAction(key: string, track: PublishingRegistrationTrackRecord) {
  if (key === "details") {
    openTrackDetails(track)
  }
}

function writerRowActions(): RowAction[] {
  return [{ key: "manage", label: "Manage writer", icon: Pencil }]
}

function onWriterAction(key: string, writer: AdminPublishingWriterRecord) {
  if (key === "manage") {
    openWriterEditor(writer)
  }
}

function openCreditCreate() {
  resetMessages()
  resetCreateForm()
  createForm.artistId = ""
  creditCreateOpen.value = true
}

function openCreditDetails(entry: AdminPublishingRecord) {
  activeCreditId.value = entry.id
  creditDetailsOpen.value = true
}

function openCreditEdit(entry: AdminPublishingRecord) {
  resetMessages()
  activeCreditId.value = entry.id
  if (!editDrafts[entry.id]) {
    editDrafts[entry.id] = {
      releaseId: entry.releaseId ?? NO_RELEASE,
      amount: decimalInputValue(entry.amount),
      periodMonth: inputMonthValue(entry.periodMonth),
      notes: entry.notes ?? "",
    }
  }
  creditEditOpen.value = true
}

function creditRowActions(): RowAction[] {
  return [
    { key: "details", label: "View details", icon: Eye },
    { key: "edit", label: "Edit", icon: Pencil },
    { key: "delete", label: "Delete credit", icon: Trash2, variant: "destructive", separatorBefore: true },
  ]
}

function onCreditAction(key: string, entry: AdminPublishingRecord) {
  if (key === "details") {
    openCreditDetails(entry)
  } else if (key === "edit") {
    openCreditEdit(entry)
  } else if (key === "delete") {
    void deletePublishingCredit(entry)
  }
}

async function submitCreateCredit() {
  await createPublishingCredit()
  if (!errorMessage.value) {
    creditCreateOpen.value = false
  }
}

async function submitEditCredit() {
  const entry = activeCredit.value
  if (!entry) {
    return
  }
  await updatePublishingCredit(entry)
  if (!errorMessage.value) {
    creditEditOpen.value = false
  }
}

function editFromCreditDetails() {
  if (activeCredit.value) {
    creditDetailsOpen.value = false
    openCreditEdit(activeCredit.value)
  }
}
</script>

<template>
  <div class="page admin-publishing-page">
    <DataPanel
      title="Publishing"
      title-level="h1"
      eyebrow="Registrations and credits"
      description="Review publishing registration requests, manage accepted history, and keep revenue credits separate from metadata registration."
    >
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

      <AppAlert v-if="creditError" variant="destructive">
        {{ creditError.statusMessage || "Unable to load publishing credits right now." }}
      </AppAlert>
      <AppAlert v-if="registrationError" variant="destructive">
        {{ registrationError.statusMessage || "Unable to load publishing registrations right now." }}
      </AppAlert>
      <AppAlert v-if="writerDirectoryError" variant="destructive">
        {{ writerDirectoryError.statusMessage || "Unable to load publishing writers right now." }}
      </AppAlert>
      <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
      <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>
    </DataPanel>

    <div class="admin-publishing-tabs" role="tablist" aria-label="Admin publishing sections">
      <button type="button" :class="{ active: activeTab === 'requests' }" @click="activeTab = 'requests'">Registration Requests</button>
      <button type="button" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">Accepted History</button>
      <button type="button" :class="{ active: activeTab === 'direct' }" @click="activeTab = 'direct'">Direct Add</button>
      <button type="button" :class="{ active: activeTab === 'writers' }" @click="activeTab = 'writers'">Writers</button>
      <button type="button" :class="{ active: activeTab === 'credits' }" @click="activeTab = 'credits'">Revenue Credits</button>
    </div>

    <DataPanel
      v-if="activeTab === 'requests'"
      title="Registration requests"
      eyebrow="Artist submitted"
      description="Review track rows individually or act on selected rows together."
    >
      <template #actions>
        <Button type="button" variant="secondary" class="gap-2" :disabled="!selectedPendingReviewIds.length || Boolean(reviewingKey)" @click="reviewRegistrationTracks(selectedPendingReviewIds, 'reject', 'selected')">
          <X class="size-4" />
          Reject Selected
        </Button>
        <Button type="button" class="gap-2" :disabled="!selectedPendingReviewIds.length || Boolean(reviewingKey)" @click="reviewRegistrationTracks(selectedPendingReviewIds, 'accept', 'selected')">
          <Check class="size-4" />
          Accept Selected
        </Button>
      </template>

      <div class="publishing-filterbar">
        <div class="publishing-search">
          <Search class="size-4" aria-hidden="true" />
          <Input v-model="registrationSearch" type="search" placeholder="Search requests, artists, or writers..." />
        </div>
      </div>

      <DashboardSkeleton v-if="registrationPending && !registrationData" layout="admin-publishing-requests" :rows="5" />
      <DataTable
        v-else
        :columns="requestColumns"
        :data="requestTracks"
        row-key="id"
        empty-title="No publishing requests"
        empty-description="No pending publishing registration requests are waiting for review."
      >
        <template #cell-select="{ row: track }">
          <input v-model="selectedReviewTrackIds" type="checkbox" :value="track.id" :aria-label="`Select ${track.trackTitle}`" />
        </template>
        <template #cell-track="{ row: track }">
          <strong>{{ track.trackTitle }}</strong>
          <div class="detail-copy">{{ track.releaseTitle || track.spotifyUrl || "Outside song registration" }}</div>
        </template>
        <template #cell-source="{ row: track }">{{ sourceLabel(track.batchSource) }}</template>
        <template #cell-created="{ row: track }">{{ formatDate(track.createdAt) }}</template>
        <template #cell-actions="{ row: track }">
          <RowActions :actions="requestRowActions()" @select="(key) => onRequestAction(key, track)" />
        </template>
      </DataTable>
    </DataPanel>

    <DataPanel
      v-else-if="activeTab === 'history'"
      title="Accepted history"
      eyebrow="Reviewed registrations"
      description="Accepted and rejected registration rows are searchable by artist, writer, source, and song."
    >
      <div class="publishing-filterbar publishing-filterbar-wide">
        <div class="publishing-search">
          <Search class="size-4" aria-hidden="true" />
          <Input v-model="registrationSearch" type="search" placeholder="Search history..." />
        </div>
        <NativeSelect v-model="historyStatusFilter">
          <option :value="ALL_FILTER">All statuses</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </NativeSelect>
        <NativeSelect v-model="historyArtistFilter">
          <option :value="ALL_FILTER">All artists</option>
          <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">{{ artist.label }}</option>
        </NativeSelect>
        <NativeSelect v-model="historyWriterFilter">
          <option :value="ALL_FILTER">All writers</option>
          <option v-for="writer in writerOptions" :key="writer.value" :value="writer.value">{{ writer.label }}</option>
        </NativeSelect>
        <NativeSelect v-model="historySourceFilter">
          <option :value="ALL_FILTER">All sources</option>
          <option value="artist_request">Artist requests</option>
          <option value="admin_direct">Admin added</option>
        </NativeSelect>
      </div>

      <DataTable
        :columns="historyColumns"
        :data="historyTracks"
        row-key="id"
        empty-title="No publishing history"
        empty-description="No reviewed publishing registrations match these filters."
      >
        <template #cell-track="{ row: track }">
          <strong>{{ track.trackTitle }}</strong>
          <div class="detail-copy">{{ track.releaseTitle || track.spotifyUrl || "Outside song registration" }}</div>
        </template>
        <template #cell-source="{ row: track }">{{ sourceLabel(track.batchSource) }}</template>
        <template #cell-reviewed="{ row: track }">{{ formatDate(track.reviewedAt || track.updatedAt) }}</template>
        <template #cell-status="{ row: track }">
          <StatusBadge :tone="statusTone(track.status)">{{ statusLabel(track.status) }}</StatusBadge>
        </template>
        <template #cell-actions="{ row: track }">
          <RowActions :actions="historyRowActions()" @select="(key) => onHistoryAction(key, track)" />
        </template>
      </DataTable>
    </DataPanel>

    <DataPanel
      v-else-if="activeTab === 'direct'"
      title="Direct add publishing tracks"
      eyebrow="Admin direct"
      description="Add accepted publishing registrations to one artist dashboard without creating wallet credits."
    >
      <div class="direct-add-grid">
        <div class="field-row">
          <label for="direct-artist">Artist</label>
          <NativeSelect id="direct-artist" v-model="directForm.artistId">
            <option value="" disabled>Select artist</option>
            <option v-for="artist in artistOptions" :key="artist.value" :value="artist.value">{{ artist.label }}</option>
          </NativeSelect>
        </div>
        <div class="field-row">
          <label for="direct-notes">Admin note</label>
          <Input id="direct-notes" v-model="directForm.adminNotes" type="text" />
        </div>
      </div>

      <div class="registration-source-grid">
        <div class="registration-source-panel surface-glint surface-glint-quiet">
          <div class="section-heading">
            <FileText class="size-4" aria-hidden="true" />
            <strong>Catalog tracks</strong>
          </div>
          <div class="catalog-select-list">
            <label
              v-for="option in directCatalogOptions"
              :key="option.value"
              class="catalog-select-row"
              :class="{ registered: catalogTrackIsRegistered(option) }"
            >
              <input
                v-model="directSelectedCatalogTrackIds"
                type="checkbox"
                :value="option.value"
                :disabled="catalogTrackIsRegistered(option)"
              />
              <span>
                <strong>{{ option.trackTitle }}</strong>
                <em>{{ option.releaseTitle }} / {{ option.isrc }}</em>
              </span>
              <small>{{ catalogTrackActionLabel(option) }}</small>
            </label>
          </div>
          <Button type="button" variant="secondary" :disabled="!directSelectedCatalogTrackIds.length" @click="addDirectCatalogTracks">Add Selected Tracks</Button>
        </div>
        <div class="registration-source-panel surface-glint surface-glint-quiet">
          <div class="section-heading">
            <Plus class="size-4" aria-hidden="true" />
            <strong>Song outside dashboard</strong>
          </div>
          <p class="detail-copy">Use this when the artist is part of a song that is not in their dashboard. Spotify URL is required for verification.</p>
          <Button type="button" variant="secondary" :disabled="!directForm.artistId" @click="addDirectManualTrack">Add Outside Song</Button>
        </div>
      </div>

      <div v-if="directDraftTracks.length" class="registration-track-stack">
        <div v-for="(track, trackIndex) in directDraftTracks" :key="track.key" class="registration-track surface-glint surface-glint-quiet">
          <div class="registration-track-header">
            <div class="summary-copy">
              <strong>{{ track.source === "catalog" ? track.songTitle : (track.songTitle || `Outside song ${trackIndex + 1}`) }}</strong>
              <span class="detail-copy">{{ track.source === "catalog" ? "Catalog registration" : "Outside dashboard song" }}</span>
            </div>
            <Button type="button" variant="ghost" size="icon" :aria-label="`Remove track ${trackIndex + 1}`" @click="removeDirectTrack(trackIndex)">
              <Trash2 class="size-4" />
            </Button>
          </div>

          <div v-if="track.source === 'manual'" class="registration-grid">
            <div class="field-row">
              <label :for="`direct-song-${track.key}`">Song name</label>
              <Input :id="`direct-song-${track.key}`" v-model="track.songTitle" type="text" />
            </div>
            <div class="field-row">
              <label :for="`direct-performer-${track.key}`">Performer name</label>
              <Input :id="`direct-performer-${track.key}`" v-model="track.performerName" type="text" />
            </div>
            <div class="field-row field-row-full">
              <label :for="`direct-spotify-${track.key}`">Spotify URL</label>
              <Input :id="`direct-spotify-${track.key}`" v-model="track.spotifyUrl" type="url" placeholder="https://open.spotify.com/track/..." />
            </div>
          </div>

          <div class="writer-editor">
            <div class="section-heading">
              <strong>Writers</strong>
              <span class="detail-copy">Shares must total 100%.</span>
            </div>
            <div v-for="(writer, writerIndex) in track.writers" :key="`${track.key}-writer-${writerIndex}`" class="writer-editor-row">
              <div class="field-row">
                <label :for="`direct-writer-mode-${track.key}-${writerIndex}`">Writer</label>
                <NativeSelect
                  :id="`direct-writer-mode-${track.key}-${writerIndex}`"
                  :model-value="writer.mode"
                  @update:model-value="setWriterMode(writer, $event)"
                >
                  <option value="existing" :disabled="!directWriterOptions.length">Global writer</option>
                  <option value="new">New writer</option>
                </NativeSelect>
              </div>
              <div v-if="writer.mode === 'existing'" class="field-row">
                <label :for="`direct-writer-existing-${track.key}-${writerIndex}`">Global writer</label>
                <NativeSelect
                  :id="`direct-writer-existing-${track.key}-${writerIndex}`"
                  :model-value="writer.writerId"
                  @update:model-value="setGlobalWriter(writer, $event)"
                >
                  <option value="" disabled>Select writer</option>
                  <option v-for="writerOption in directWriterOptions" :key="writerOption.value" :value="writerOption.value">{{ writerOption.label }}</option>
                </NativeSelect>
              </div>
              <div v-else class="field-row">
                <label :for="`direct-writer-name-${track.key}-${writerIndex}`">Full name</label>
                <Input :id="`direct-writer-name-${track.key}-${writerIndex}`" v-model="writer.fullName" type="text" />
              </div>
              <div class="field-row">
                <label :for="`direct-writer-share-${track.key}-${writerIndex}`">Share %</label>
                <Input :id="`direct-writer-share-${track.key}-${writerIndex}`" v-model="writer.sharePct" type="number" min="0" max="100" step="0.01" />
              </div>
              <div class="field-row">
                <label :for="`direct-writer-role-${track.key}-${writerIndex}`">Role</label>
                <div :id="`direct-writer-role-${track.key}-${writerIndex}`" class="publishing-role-checks" role="group">
                  <label
                    v-for="roleOption in writerRoleOptions"
                    :key="roleOption"
                    class="publishing-role-check"
                  >
                    <Checkbox
                      :model-value="writerHasRole(writer, roleOption)"
                      @update:model-value="setWriterRole(writer, roleOption, $event)"
                    />
                    <span>{{ roleOption }}</span>
                  </label>
                </div>
              </div>
              <div v-if="writer.mode === 'new'" class="field-row">
                <label :for="`direct-writer-ipi-${track.key}-${writerIndex}`">IPI</label>
                <Input :id="`direct-writer-ipi-${track.key}-${writerIndex}`" v-model="writer.ipiNumber" type="text" />
              </div>
              <div v-if="writer.mode === 'new'" class="field-row">
                <label :for="`direct-writer-pro-${track.key}-${writerIndex}`">PRO</label>
                <Input :id="`direct-writer-pro-${track.key}-${writerIndex}`" v-model="writer.proName" type="text" />
              </div>
              <div class="writer-editor-row-action">
                <Button
                  v-if="track.writers.length > 1"
                  type="button"
                  variant="ghost"
                  size="icon"
                  :aria-label="`Remove writer ${writerIndex + 1}`"
                  @click="removeWriter(track, writerIndex)"
                >
                  <Trash2 class="size-4" />
                </Button>
              </div>
            </div>
            <Button type="button" variant="secondary" @click="addWriter(track)">Add Writer</Button>
          </div>
        </div>
      </div>

      <AppEmptyState
        v-else
        compact
        icon="file"
        title="No direct-add tracks"
        description="Choose catalog tracks or add outside songs with Spotify links for this artist."
      />

      <div class="registration-actions">
        <Button type="button" :disabled="!canSubmitDirectPublishingBatch" @click="submitDirectPublishingBatch">
          {{ directCreating ? "Adding..." : `Add ${directDraftTracks.length || ""} Track${directDraftTracks.length === 1 ? "" : "s"}` }}
        </Button>
      </div>
    </DataPanel>

    <DataPanel
      v-else-if="activeTab === 'writers'"
      title="Global publishing writers"
      eyebrow="Directory"
      description="Manage the one global writer profile reused across artist dashboards."
    >
      <div class="publishing-filterbar publishing-writer-toolbar">
        <NativeSelect v-model="writerStatusFilter" aria-label="Writer status filter">
          <option value="active">Active writers</option>
          <option value="archived">Archived writers</option>
          <option value="all">All writers</option>
        </NativeSelect>
        <div class="writer-directory-counts">
          <span>{{ writerDirectorySummary.activeCount.toLocaleString() }} active</span>
          <span>{{ writerDirectorySummary.archivedCount.toLocaleString() }} archived</span>
          <span>{{ writerDirectorySummary.registrationCount.toLocaleString() }} registrations</span>
        </div>
      </div>

      <DashboardSkeleton v-if="writerDirectoryPending && !writerDirectoryData" layout="admin-publishing-writers" :rows="5" />
      <DataTable
        v-else
        :columns="writerColumns"
        :data="writerRecords"
        row-key="id"
        search-placeholder="Search writer, IPI, PRO, or artist..."
        empty-title="No publishing writers"
        empty-description="Writers appear here after artist submissions or admin direct-adds."
      >
        <template #cell-name="{ row: writer }">
          <strong>{{ writer.fullName }}</strong>
          <div class="detail-copy">
            {{ [writer.firstName, writer.middleName, writer.lastName].filter(Boolean).join(" ") || "Global writer profile" }}
          </div>
        </template>
        <template #cell-ipi="{ row: writer }">
          <span class="mono">{{ writer.ipiNumber || "No IPI" }}</span>
        </template>
        <template #cell-pro="{ row: writer }">
          {{ writer.proName || "No PRO" }}
        </template>
        <template #cell-artists="{ row: writer }">
          <span v-if="writer.linkedArtistNames.length">{{ writer.linkedArtistNames.slice(0, 2).join(", ") }}</span>
          <span v-else class="detail-copy">Not linked</span>
          <span v-if="writer.linkedArtistNames.length > 2" class="detail-copy"> +{{ writer.linkedArtistNames.length - 2 }} more</span>
        </template>
        <template #cell-registrations="{ row: writer }">
          <strong>{{ writer.registrationCount.toLocaleString() }}</strong>
          <div class="detail-copy">{{ writer.acceptedRegistrationCount.toLocaleString() }} accepted</div>
        </template>
        <template #cell-status="{ row: writer }">
          <StatusBadge :tone="writerStatusTone(writer)">{{ writer.isActive ? "Active" : "Archived" }}</StatusBadge>
        </template>
        <template #cell-updated="{ row: writer }">{{ formatDate(writer.updatedAt) }}</template>
        <template #cell-actions="{ row: writer }">
          <RowActions :actions="writerRowActions()" @select="(key) => onWriterAction(key, writer)" />
        </template>
      </DataTable>

      <Sheet v-model:open="writerEditorOpen">
        <SheetContent side="right" class="writer-management-sheet">
          <SheetHeader>
            <SheetTitle>{{ selectedWriter?.fullName || "Writer profile" }}</SheetTitle>
            <SheetDescription>
              Edit the global writer identity. Matching IPI values reuse one writer profile across artists.
            </SheetDescription>
          </SheetHeader>

          <div v-if="selectedWriter" class="writer-management-body">
            <div class="writer-management-status">
              <StatusBadge :tone="writerStatusTone(selectedWriter)">{{ selectedWriter.isActive ? "Active" : "Archived" }}</StatusBadge>
              <span>{{ selectedWriter.registrationCount.toLocaleString() }} registration reference{{ selectedWriter.registrationCount === 1 ? "" : "s" }}</span>
            </div>

            <div class="writer-management-form">
              <div class="field-row field-row-full">
                <label for="writer-edit-full-name">Full name</label>
                <Input id="writer-edit-full-name" v-model="writerEditForm.fullName" type="text" />
              </div>
              <div class="field-row">
                <label for="writer-edit-first-name">First name</label>
                <Input id="writer-edit-first-name" v-model="writerEditForm.firstName" type="text" />
              </div>
              <div class="field-row">
                <label for="writer-edit-middle-name">Middle name</label>
                <Input id="writer-edit-middle-name" v-model="writerEditForm.middleName" type="text" />
              </div>
              <div class="field-row">
                <label for="writer-edit-last-name">Last name</label>
                <Input id="writer-edit-last-name" v-model="writerEditForm.lastName" type="text" />
              </div>
              <div class="field-row">
                <label for="writer-edit-ipi">IPI</label>
                <Input id="writer-edit-ipi" v-model="writerEditForm.ipiNumber" type="text" />
              </div>
              <div class="field-row">
                <label for="writer-edit-pro">PRO</label>
                <Input id="writer-edit-pro" v-model="writerEditForm.proName" type="text" />
              </div>
            </div>

            <div class="writer-management-section">
              <strong>Linked artist dashboards</strong>
              <div v-if="selectedWriter.linkedArtists.length" class="writer-linked-artists">
                <span v-for="artist in selectedWriter.linkedArtists" :key="artist.artistId">{{ artist.artistName }}</span>
              </div>
              <p v-else class="detail-copy">This writer is not linked to an artist dashboard yet.</p>
            </div>

            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Pending registrations</span>
                <strong>{{ selectedWriter.pendingRegistrationCount.toLocaleString() }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Accepted registrations</span>
                <strong>{{ selectedWriter.acceptedRegistrationCount.toLocaleString() }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Rejected registrations</span>
                <strong>{{ selectedWriter.rejectedRegistrationCount.toLocaleString() }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Last updated</span>
                <strong>{{ formatDate(selectedWriter.updatedAt) }}</strong>
              </div>
            </div>
          </div>

          <SheetFooter class="writer-management-actions">
            <Button
              v-if="selectedWriter && !selectedWriter.isActive"
              type="button"
              variant="secondary"
              class="gap-2"
              :disabled="restoringWriterId === selectedWriter.id"
              @click="restoreWriter"
            >
              <RotateCcw class="size-4" />
              {{ restoringWriterId === selectedWriter.id ? "Restoring..." : "Restore" }}
            </Button>
            <Button
              v-if="selectedWriter"
              type="button"
              :disabled="savingWriterId === selectedWriter.id"
              @click="saveWriter"
            >
              {{ savingWriterId === selectedWriter.id ? "Saving..." : "Save changes" }}
            </Button>
            <Button
              v-if="selectedWriter"
              type="button"
              variant="destructive"
              class="gap-2"
              :disabled="deletingWriterId === selectedWriter.id"
              @click="deleteOrArchiveWriter"
            >
              <Trash2 class="size-4" />
              {{ deletingWriterId === selectedWriter.id ? "Working..." : selectedWriter.registrationCount > 0 ? "Archive" : "Delete" }}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </DataPanel>

    <template v-else>
      <DataPanel
        title="Publishing entries"
        eyebrow="Ledger-backed"
        description="Editing an amount posts only the delta to the wallet ledger. Deleting posts a negative publishing adjustment."
      >
        <template #actions>
          <Button @click="openCreditCreate">
            <Plus class="size-4" />
            New credit
          </Button>
        </template>

        <DashboardSkeleton v-if="creditPending && !creditData" layout="admin-publishing-credits" :rows="5" />

        <DataTable
          v-else
          :columns="publishingEntryColumns"
          :data="entries"
          empty-title="No publishing credits"
          empty-description="No publishing credits have been entered yet."
          row-key="id"
        >
          <template #cell-artist="{ row: entry }">
            <strong>{{ entry.artistName }}</strong>
            <div v-if="entry.notes" class="detail-copy">{{ entry.notes }}</div>
          </template>
          <template #cell-release="{ row: entry }">{{ entry.releaseTitle || "Catalog-level credit" }}</template>
          <template #cell-period="{ row: entry }">{{ formatMonth(entry.periodMonth) }}</template>
          <template #cell-entered="{ row: entry }">{{ entry.enteredByName || "Unknown admin" }}</template>
          <template #cell-ledger="{ row: entry }">
            <span class="mono">{{ entry.ledgerEntryId || "No amount change" }}</span>
          </template>
          <template #cell-amount="{ row: entry }">
            <strong class="tabular-nums">{{ formatMoney(entry.amount) }}</strong>
          </template>
          <template #cell-actions="{ row: entry }">
            <RowActions :actions="creditRowActions()" @select="(key) => onCreditAction(key, entry)" />
          </template>
        </DataTable>
      </DataPanel>
    </template>

    <!-- Registration track details (requests + history) -->
    <FormDialog
      v-model:open="trackDetailsOpen"
      :title="activeTrack ? activeTrack.trackTitle : 'Registration'"
      :description="activeTrack?.artistName"
      readonly
      content-class="max-w-2xl"
    >
      <template v-if="activeTrack">
        <dl class="detail-list">
          <div class="detail-item">
            <dt>Status</dt>
            <dd><StatusBadge :tone="statusTone(activeTrack.status)">{{ statusLabel(activeTrack.status) }}</StatusBadge></dd>
          </div>
          <div class="detail-item">
            <dt>Source</dt>
            <dd>{{ sourceLabel(activeTrack.batchSource) }}</dd>
          </div>
          <div class="detail-item">
            <dt>Release</dt>
            <dd>{{ activeTrack.releaseTitle || "Outside song registration" }}</dd>
          </div>
          <div class="detail-item">
            <dt>Created</dt>
            <dd>{{ formatDate(activeTrack.createdAt) }}</dd>
          </div>
          <div v-if="activeTrack.spotifyUrl" class="detail-item detail-col-2">
            <dt>Spotify</dt>
            <dd class="break-all">{{ activeTrack.spotifyUrl }}</dd>
          </div>
        </dl>
        <div>
          <p class="dialog-section-title">Writers</p>
          <div class="writer-grid">
            <div v-for="writer in activeTrack.writers" :key="writer.id" class="writer-chip">
              <strong>{{ writer.fullName }}</strong>
              <span>{{ writer.role }} / {{ writer.sharePct }}%</span>
              <span v-if="writer.ipiNumber || writer.proName">{{ writer.ipiNumber || "No IPI" }} / {{ writer.proName || "No PRO" }}</span>
            </div>
          </div>
        </div>
      </template>

      <template #footer>
        <Button variant="ghost" @click="trackDetailsOpen = false">Close</Button>
        <template v-if="activeTrack && activeTrack.status === 'pending_review'">
          <Button variant="destructive" :disabled="Boolean(reviewingKey)" @click="reviewRegistrationTracks([activeTrack.id], 'reject', activeTrack.id)">Reject</Button>
          <Button :disabled="Boolean(reviewingKey)" @click="reviewRegistrationTracks([activeTrack.id], 'accept', activeTrack.id)">Accept</Button>
        </template>
      </template>
    </FormDialog>

    <!-- Create credit -->
    <FormDialog
      v-model:open="creditCreateOpen"
      title="New publishing credit"
      description="Posts to the wallet ledger. Closed statement months cannot be changed."
      submit-label="Create credit"
      :pending="creating"
      :error="creditCreateOpen ? errorMessage : ''"
      :submit-disabled="!createForm.artistId || !createForm.amount"
      content-class="max-w-2xl"
      @submit="submitCreateCredit"
    >
      <div class="dialog-grid">
        <div class="field-row">
          <label for="cc-artist">Artist</label>
          <NativeSelect id="cc-artist" v-model="createForm.artistId">
            <option value="" disabled>Select artist</option>
            <option v-for="artist in creditArtistOptions" :key="artist.value" :value="artist.value">{{ artist.label }}</option>
          </NativeSelect>
        </div>
        <div class="field-row">
          <label for="cc-release">Release</label>
          <NativeSelect id="cc-release" v-model="createForm.releaseId" :disabled="!createForm.artistId">
            <option :value="NO_RELEASE">Catalog-level credit</option>
            <option v-for="release in createReleaseOptions" :key="release.value" :value="release.value">{{ release.label }}</option>
          </NativeSelect>
        </div>
        <div class="field-row">
          <label for="cc-amount">Amount</label>
          <Input id="cc-amount" v-model="createForm.amount" type="number" min="0.00000001" step="0.00000001" placeholder="0.00" />
        </div>
        <div class="field-row">
          <label for="cc-period">Period month</label>
          <AppMonthPicker id="cc-period" v-model="createForm.periodMonth" />
        </div>
        <div class="field-row dialog-col-2">
          <label for="cc-notes">Notes</label>
          <Textarea id="cc-notes" v-model="createForm.notes" placeholder="Optional admin note" />
        </div>
      </div>
    </FormDialog>

    <!-- Edit credit -->
    <FormDialog
      v-model:open="creditEditOpen"
      :title="activeCredit ? `Edit credit — ${activeCredit.artistName}` : 'Edit credit'"
      submit-label="Save changes"
      :pending="!!activeCredit && updatingEntryId === activeCredit.id"
      :error="creditEditOpen ? errorMessage : ''"
      content-class="max-w-2xl"
      @submit="submitEditCredit"
    >
      <div v-if="activeCredit && editDrafts[activeCredit.id]" class="dialog-grid">
        <div class="field-row">
          <label for="ce-release">Release</label>
          <NativeSelect id="ce-release" v-model="editDrafts[activeCredit.id].releaseId">
            <option :value="NO_RELEASE">Catalog-level credit</option>
            <option v-for="release in releaseOptionsForEntry(activeCredit)" :key="release.value" :value="release.value">{{ release.label }}</option>
          </NativeSelect>
        </div>
        <div class="field-row">
          <label for="ce-amount">Amount</label>
          <Input id="ce-amount" v-model="editDrafts[activeCredit.id].amount" type="number" min="0.00000001" step="0.00000001" />
        </div>
        <div class="field-row">
          <label for="ce-period">Period month</label>
          <AppMonthPicker id="ce-period" v-model="editDrafts[activeCredit.id].periodMonth" />
        </div>
        <div class="field-row dialog-col-2">
          <label for="ce-notes">Notes</label>
          <Textarea id="ce-notes" v-model="editDrafts[activeCredit.id].notes" />
        </div>
      </div>
    </FormDialog>

    <!-- Credit details -->
    <FormDialog
      v-model:open="creditDetailsOpen"
      :title="activeCredit ? activeCredit.artistName : 'Publishing credit'"
      :description="activeCredit ? formatMoney(activeCredit.amount) : undefined"
      readonly
      content-class="max-w-xl"
    >
      <dl v-if="activeCredit" class="detail-list">
        <div class="detail-item">
          <dt>Release</dt>
          <dd>{{ activeCredit.releaseTitle || "Catalog-level credit" }}</dd>
        </div>
        <div class="detail-item">
          <dt>Period</dt>
          <dd>{{ formatMonth(activeCredit.periodMonth) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Amount</dt>
          <dd class="tabular-nums">{{ formatMoney(activeCredit.amount) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Entered by</dt>
          <dd>{{ activeCredit.enteredByName || "Unknown admin" }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Ledger entry</dt>
          <dd class="mono">{{ activeCredit.ledgerEntryId || "No amount change" }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Created / updated</dt>
          <dd>{{ formatDate(activeCredit.createdAt) }} / {{ formatDate(activeCredit.updatedAt) }}</dd>
        </div>
        <div v-if="activeCredit.notes" class="detail-item detail-col-2">
          <dt>Notes</dt>
          <dd>{{ activeCredit.notes }}</dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="creditDetailsOpen = false">Close</Button>
        <Button v-if="activeCredit" @click="editFromCreditDetails">
          <Pencil class="size-4" />
          Edit
        </Button>
      </template>
    </FormDialog>
  </div>
</template>

<style scoped>
.admin-publishing-page {
  display: grid;
  gap: 18px;
}

.admin-publishing-tabs {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  overflow: hidden;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 86%, var(--muted) 14%);
  box-shadow: var(--surface-control-shadow, none);
  padding: 8px;
}

.admin-publishing-tabs button {
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: var(--surface-radius-compact, 10px);
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--text-button-size);
  font-weight: var(--text-button-weight);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background-color var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out);
}

.admin-publishing-tabs button:hover {
  border-color: color-mix(in srgb, var(--foreground) 10%, transparent);
  background: color-mix(in srgb, var(--foreground) 5%, transparent);
  color: var(--foreground);
}

.admin-publishing-tabs button.active {
  border-color: color-mix(in srgb, var(--priority) 28%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--priority) 10%, var(--card));
  color: var(--foreground);
}

.publishing-filterbar,
.direct-add-grid,
.registration-source-grid,
.registration-grid,
.writer-editor-row,
.publishing-form-grid,
.publishing-edit-grid {
  display: grid;
  gap: 12px;
}

.publishing-filterbar {
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 84%, var(--muted) 16%);
  box-shadow: var(--surface-control-shadow, none);
  padding: 10px;
}

.publishing-writer-toolbar {
  grid-template-columns: minmax(180px, 240px) minmax(0, 1fr);
}

.writer-directory-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
  font-weight: 700;
}

.writer-directory-counts span {
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--foreground) 10%, var(--surface-border, var(--border)));
  border-radius: 999px;
  background: color-mix(in srgb, var(--card) 88%, var(--foreground) 4%);
}

.publishing-filterbar-wide {
  grid-template-columns: minmax(240px, 1fr) repeat(4, minmax(150px, 190px));
}

.publishing-role-checks {
  display: flex;
  min-height: 40px;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.publishing-role-check {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-compact, 10px);
  background: color-mix(in srgb, var(--card) 88%, var(--muted) 12%);
  color: var(--foreground);
  font-size: 12px;
  font-weight: 650;
}

.direct-add-grid,
.registration-source-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.registration-expanded,
.registration-track-stack,
.writer-editor,
.catalog-select-list {
  display: grid;
  gap: 10px;
}

.writer-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
}

.writer-chip {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  gap: 3px;
  padding: 10px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 92%, var(--muted) 8%);
  box-shadow: var(--surface-control-shadow, none);
}

.writer-chip span {
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
}

.table-actions,
.section-heading,
.registration-track-header,
.registration-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.table-actions {
  flex-wrap: wrap;
}

.section-heading {
  color: var(--foreground);
}

.registration-source-panel,
.registration-track {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 3%), var(--card)),
    var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
}

.registration-source-panel::before,
.registration-track::before {
  position: absolute;
  inset: 0 var(--surface-glint-inset, 24px) auto;
  z-index: 0;
  height: 1px;
  background: var(--surface-glint-line);
  content: "";
  opacity: var(--surface-glint-opacity, 0.46);
  pointer-events: none;
}

.catalog-select-list {
  max-height: 260px;
  overflow: auto;
}

.catalog-select-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-card, calc(var(--radius) + 4px));
  background: color-mix(in srgb, var(--card) 92%, var(--muted) 8%);
  box-shadow: var(--surface-control-shadow, none);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    background-color var(--duration-fast, 150ms) var(--ease-out);
}

.catalog-select-row:hover {
  border-color: color-mix(in srgb, var(--foreground) 10%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, var(--foreground) 4%, var(--card));
}

.catalog-select-row.registered {
  cursor: not-allowed;
  opacity: 0.72;
}

.catalog-select-row span {
  display: grid;
  min-width: 0;
}

.catalog-select-row em {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-select-row small {
  color: var(--muted-foreground);
  font-size: var(--text-caption-size);
  font-weight: 700;
  white-space: nowrap;
}

.registration-track-header {
  justify-content: space-between;
}

.registration-grid,
.writer-editor-row,
.publishing-form-grid,
.publishing-edit-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  align-items: end;
}

.writer-editor-row-action {
  display: flex;
  min-height: 40px;
  align-items: center;
  justify-content: flex-end;
}

.publishing-notes-field,
.field-row-full {
  grid-column: 1 / -1;
}

.registration-actions,
.publishing-form-actions {
  display: flex;
  justify-content: flex-end;
}

.publishing-textarea {
  min-height: 96px;
  resize: vertical;
}

:deep(.writer-management-sheet) {
  width: min(560px, 100vw);
  overflow-y: auto;
}

.writer-management-body,
.writer-management-form,
.writer-management-section,
.writer-linked-artists {
  display: grid;
  gap: 12px;
}

.writer-management-body {
  padding-block: 18px;
}

.writer-management-status {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 700;
}

.writer-management-form {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.writer-management-section {
  padding-top: 4px;
}

.writer-linked-artists {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.writer-linked-artists span {
  min-width: 0;
  overflow: hidden;
  padding: 8px 10px;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: var(--surface-radius-compact, 10px);
  background: color-mix(in srgb, var(--card) 90%, var(--muted) 10%);
  color: var(--foreground);
  font-size: var(--text-caption-size);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.writer-management-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 980px) {
  .publishing-filterbar-wide,
  .publishing-writer-toolbar,
  .direct-add-grid,
  .registration-source-grid,
  .writer-management-form {
    grid-template-columns: 1fr;
  }

  .writer-directory-counts {
    justify-content: flex-start;
  }
}

/* Shared dialog layout */
.dialog-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr 1fr;
}

.dialog-col-2 {
  grid-column: 1 / -1;
}

.dialog-section-title {
  margin: 0 0 10px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
}

.detail-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 16px;
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

@media (max-width: 560px) {
  .dialog-grid,
  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
