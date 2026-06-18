<script setup lang="ts">
import { Ban, Eye, Pencil, RotateCcw, Trash2, X } from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import AppTooltip from "~/components/AppTooltip.vue"
import type { RowAction } from "~/components/RowActions.vue"
import type {
  AdminActivityLogRecord,
  AdminArtistMutationResponse,
  AdminBulkArtistDeleteResponse,
  AdminArtistActionResponse,
  AdminReconciliationResponse,
  AdminReconciliationStatus,
  AdminSettingsResponse,
  ArtistAccessMethod,
  AdminStatementPeriodRecord,
  ArchivedArtistRecord,
  ArtistDspProfileDraft,
  ArtistSocialLinkDraft,
  UpdateAdminArtistInput,
  TransactionalEmailDelivery,
} from "~~/types/settings"
import {
  ARTIST_AVATAR_PRESET_LABELS,
  ARTIST_AVATAR_PRESETS,
  ARTIST_DSP_PROFILE_PLATFORM_LABELS,
  ARTIST_DSP_PROFILE_PLATFORMS,
  ARTIST_SOCIAL_LINK_PLATFORM_LABELS,
  ARTIST_SOCIAL_LINK_PLATFORMS,
  DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS,
} from "~~/types/settings"
import {
  emptyArtistCreateDraft,
  nullableText,
  normalizedEmail,
  normalizedOptionalText,
  normalizedText,
  type ArtistCreateDraft,
} from "~/utils/admin-access"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

interface ArchivedArtistEditDraft {
  name: string
  email: string
  artistSharePct: string
  avatarMode: "mesh" | "uploaded"
  avatarPreset: ArchivedArtistRecord["avatarPreset"]
  avatarCustomColors: string[]
  avatarUrl: string
  country: string
  bio: string
  legalName: string
  ipiNumber: string
  proName: string
  bankAccountName: string
  bankName: string
  bankAccountNumber: string
  bankAddress: string
  dspProfiles: ArtistDspProfileDraft[]
  socialLinks: ArtistSocialLinkDraft[]
}

type ArchivedArtistRestoreDraft = ArtistCreateDraft
type AdminSettingsSection = "account" | "statements" | "reconciliation" | "audit" | "archive"

const adminSettingsSectionValues: AdminSettingsSection[] = [
  "account",
  "statements",
  "reconciliation",
  "audit",
  "archive",
]

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
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

const route = useRoute()
const router = useRouter()
const statementStatusFilter = ref<"all" | "open" | "closed">("all")
const statementSearch = ref("")
const activityAdminFilter = ref("all")
const activityEntityFilter = ref("all")
const activitySearch = ref("")
const archiveSearch = ref("")
const successMessage = ref("")
const errorMessage = ref("")
const savingStatementPeriodId = ref("")
const isBulkClosingStatementPeriods = ref(false)
const selectedStatementPeriodIds = ref<string[]>([])
const restoringArtistId = ref("")
const savingArchivedArtistId = ref("")
const deletingArchivedArtistId = ref("")
const isBulkDeletingArchivedArtists = ref(false)
const selectedArchivedArtistIds = ref<string[]>([])
const reconciliation = ref<AdminReconciliationResponse | null>(null)
const reconciliationPending = ref(false)
const reconciliationError = ref("")
const archivedArtistRestoreDrafts = reactive<Record<string, ArchivedArtistRestoreDraft>>({})
const archivedArtistEditDrafts = reactive<Record<string, ArchivedArtistEditDraft>>({})
const { confirmAction } = useConfirmAction()

// Dialog state
const statementDetailsOpen = ref(false)
const activeStatementId = ref<string | null>(null)
const reconDetailsOpen = ref(false)
const activeReconId = ref<string | null>(null)
const auditDetailsOpen = ref(false)
const activeAuditId = ref<string | null>(null)
const restoreOpen = ref(false)
const archivedArtistEditOpen = ref(false)
const activeArchivedArtistId = ref<string | null>(null)

const { data, error, pending, refresh } = useLazyFetch<AdminSettingsResponse>("/api/admin/settings")

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

const summary = computed(() => data.value?.summary ?? {
  openStatementCount: 0,
  closedStatementCount: 0,
  archivedArtistCount: 0,
  archivedReleaseCount: 0,
  archivedTrackCount: 0,
  activityLogCount: 0,
  channelCount: 0,
})

const statementPeriods = computed(() => data.value?.statementPeriods ?? [])
const activityLog = computed(() => data.value?.activityLog ?? [])
const archivedArtists = computed(() => data.value?.archivedArtists ?? [])
const archivedReleases = computed(() => data.value?.archived.releases ?? [])
const archivedTracks = computed(() => data.value?.archived.tracks ?? [])
const selectedStatementPeriodIdSet = computed(() => new Set(selectedStatementPeriodIds.value))
const selectedStatementPeriods = computed(() =>
  statementPeriods.value.filter((period) => selectedStatementPeriodIdSet.value.has(period.id)),
)
const selectedStatementPeriodCount = computed(() => selectedStatementPeriodIds.value.length)
const hasSelectedStatementPeriods = computed(() => selectedStatementPeriodCount.value > 0)
const selectedOpenStatementPeriods = computed(() =>
  selectedStatementPeriods.value.filter((period) => period.status === "open"),
)
const activeStatement = computed(() => statementPeriods.value.find((p) => p.id === activeStatementId.value) ?? null)
const activeRecon = computed(() => reconciliation.value?.artists.find((a) => a.artistId === activeReconId.value) ?? null)
const activeAudit = computed(() => activityLog.value.find((e) => e.id === activeAuditId.value) ?? null)
const activeArchivedArtist = computed(() => archivedArtists.value.find((a) => a.id === activeArchivedArtistId.value) ?? null)
const selectedArchivedArtistIdSet = computed(() => new Set(selectedArchivedArtistIds.value))
const selectedArchivedArtists = computed(() =>
  archivedArtists.value.filter((artist) => selectedArchivedArtistIdSet.value.has(artist.id)),
)
const selectedArchivedArtistCount = computed(() => selectedArchivedArtistIds.value.length)
const hasSelectedArchivedArtists = computed(() => selectedArchivedArtistCount.value > 0)
const selectedArchivedArtistPreviewNames = computed(() => {
  const names = selectedArchivedArtists.value.map((artist) => artist.name)
  const preview = names.slice(0, 5).join(", ")
  const remaining = names.length - 5

  return remaining > 0 ? `${preview}, and ${remaining} more` : preview
})

watch(
  statementPeriods,
  (value) => {
    const activePeriodIds = new Set(value.map((period) => period.id))
    selectedStatementPeriodIds.value = selectedStatementPeriodIds.value.filter((periodId) => activePeriodIds.has(periodId))
  },
  { immediate: true },
)

watch(
  archivedArtists,
  (value) => {
    const activeArtistIds = new Set(value.map((artist) => artist.id))

    for (const artist of value) {
      archivedArtistRestoreDrafts[artist.id] = buildArchivedArtistRestoreDraft(artist)
      archivedArtistEditDrafts[artist.id] = buildArchivedArtistEditDraft(artist)
    }

    for (const artistId of Object.keys(archivedArtistRestoreDrafts)) {
      if (!activeArtistIds.has(artistId)) {
        delete archivedArtistRestoreDrafts[artistId]
      }
    }

    for (const artistId of Object.keys(archivedArtistEditDrafts)) {
      if (!activeArtistIds.has(artistId)) {
        delete archivedArtistEditDrafts[artistId]
      }
    }

    selectedArchivedArtistIds.value = selectedArchivedArtistIds.value.filter((artistId) => activeArtistIds.has(artistId))
  },
  { immediate: true },
)

watch(activeArchivedArtist, (value) => {
  if (!value) {
    archivedArtistEditOpen.value = false
    restoreOpen.value = false
  }
})

const summaryMetrics = computed(() => [
  {
    label: "Open statements",
    value: String(summary.value.openStatementCount),
    footnote: "Still eligible for additional imports.",
    tone: "accent" as const,
  },
  {
    label: "Closed statements",
    value: String(summary.value.closedStatementCount),
    footnote: "Locked until an admin reopens them.",
    tone: "default" as const,
  },
  {
    label: "Deleted catalog",
    value: String(
      summary.value.archivedArtistCount + summary.value.archivedReleaseCount + summary.value.archivedTrackCount,
    ),
    footnote: "Archived artists plus deleted releases and tracks visible for audit and history.",
    tone: "default" as const,
  },
  {
    label: "Audit entries",
    value: String(summary.value.activityLogCount),
    footnote: "Append-only admin activity log.",
    tone: "default" as const,
  },
])

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeAdminSettingsSection(value: unknown): AdminSettingsSection {
  const normalized = String(firstQueryValue(value) ?? "").trim().toLowerCase()

  return adminSettingsSectionValues.includes(normalized as AdminSettingsSection)
    ? normalized as AdminSettingsSection
    : "archive"
}

const activeAdminSettingsSection = computed<AdminSettingsSection>({
  get: () => normalizeAdminSettingsSection(route.query.section),
  set: (value) => {
    const query = { ...route.query }

    if (value === "archive") {
      delete query.section
    } else {
      query.section = value
    }

    void router.replace({ query })
  },
})

const adminSettingsSections = computed(() => [
  {
    label: "Account",
    value: "account",
  },
  {
    label: "Statements",
    value: "statements",
    badge: summary.value.openStatementCount,
  },
  {
    label: "Reconcile",
    value: "reconciliation",
    badge: reconciliation.value?.summary.issueCount ?? 0,
  },
  {
    label: "Audit",
    value: "audit",
    badge: filteredActivityLog.value.length,
  },
  {
    label: "Archive",
    value: "archive",
    badge: summary.value.archivedArtistCount + summary.value.archivedReleaseCount + summary.value.archivedTrackCount,
  },
])

const adminSettingsFolders = computed(() => adminSettingsSections.value.map((section) => ({
  ...section,
  icon: section.label.slice(0, 1),
  meta: section.value === "account"
    ? "Email, password, and Google"
    : section.value === "statements"
      ? "Period locks and finance control"
      : section.value === "reconciliation"
        ? "Wallet, statement, upload, and ledger checks"
        : section.value === "audit"
          ? "Recent admin actions"
          : "Archived and deleted records",
  tone: section.value === "account" || section.value === "statements" || section.value === "reconciliation"
    ? "accent" as const
    : section.value === "archive"
      ? "danger" as const
      : "default" as const,
})))

const filteredStatementPeriods = computed(() => {
  const query = statementSearch.value.trim().toLowerCase()

  return statementPeriods.value.filter((period) => {
    if (statementStatusFilter.value !== "all" && period.status !== statementStatusFilter.value) {
      return false
    }

    if (!query) {
      return true
    }

    return [period.artistName, formatMonth(period.periodMonth), period.periodMonth].some((value) =>
      value.toLowerCase().includes(query),
    )
  })
})

const filteredStatementPeriodIds = computed(() => filteredStatementPeriods.value.map((period) => period.id))
const hasFilteredStatementPeriods = computed(() => filteredStatementPeriodIds.value.length > 0)
const filteredOpenStatementPeriods = computed(() =>
  filteredStatementPeriods.value.filter((period) => period.status === "open"),
)
const selectedFilteredStatementPeriodCount = computed(() =>
  filteredStatementPeriodIds.value.filter((periodId) => selectedStatementPeriodIdSet.value.has(periodId)).length,
)
const areAllFilteredStatementPeriodsSelected = computed(() =>
  hasFilteredStatementPeriods.value && selectedFilteredStatementPeriodCount.value === filteredStatementPeriodIds.value.length,
)
const statementSelectAllLabel = computed(() =>
  areAllFilteredStatementPeriodsSelected.value
    ? "Clear visible statement period selection"
    : "Select all visible statement periods",
)

const adminOptions = computed(() => {
  return [...new Set(activityLog.value.map((entry) => entry.adminName).filter(Boolean) as string[])].sort((a, b) =>
    a.localeCompare(b),
  )
})

const entityOptions = computed(() => {
  return [...new Set(activityLog.value.map((entry) => entry.entityType))].sort((a, b) => a.localeCompare(b))
})

const filteredActivityLog = computed(() => {
  const query = activitySearch.value.trim().toLowerCase()

  return activityLog.value.filter((entry) => {
    if (activityAdminFilter.value !== "all" && (entry.adminName ?? "Unknown admin") !== activityAdminFilter.value) {
      return false
    }

    if (activityEntityFilter.value !== "all" && entry.entityType !== activityEntityFilter.value) {
      return false
    }

    if (!query) {
      return true
    }

    return [
      entry.adminName ?? "",
      entry.action,
      entry.entityType,
      entry.entityId ?? "",
      JSON.stringify(entry.details),
    ].some((value) => value.toLowerCase().includes(query))
  })
})

const reconciliationMetrics = computed(() => {
  const reconciliationSummary = reconciliation.value?.summary

  return [
    {
      label: "Passed",
      value: String(reconciliationSummary?.passCount ?? 0),
      footnote: "Artists with every money view in agreement.",
      tone: "default" as const,
    },
    {
      label: "Warnings",
      value: String(reconciliationSummary?.warningCount ?? 0),
      footnote: "Legacy or cleanup items that should be reviewed.",
      tone: "alt" as const,
    },
    {
      label: "Failures",
      value: String(reconciliationSummary?.failCount ?? 0),
      footnote: "Money totals disagree and need correction before launch.",
      tone: "accent" as const,
    },
    {
      label: "Issues",
      value: String(reconciliationSummary?.issueCount ?? 0),
      footnote: "Total warnings and errors found in the latest run.",
      tone: "accent" as const,
    },
  ]
})

const actionsColumn = { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false }

const statementSettingsColumns = [
  {
    key: "select",
    label: "",
    accessor: (row: any) => row.artistName,
    sortable: false,
    searchable: false,
    hideable: false,
    class: "w-10",
  },
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "month", label: "Month", accessor: (row: any) => row.periodMonth },
  { key: "earnings", label: "Earnings", align: "right" as const, accessor: (row: any) => Number(row.earnings || 0) },
  { key: "publishing", label: "Publishing", align: "right" as const, accessor: (row: any) => Number(row.publishing || 0) },
  { key: "uploads", label: "Uploads", align: "right" as const, accessor: (row: any) => row.uploadCount },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  actionsColumn,
]

const activityLogColumns = [
  { key: "action", label: "Action", accessor: (row: any) => row.action },
  { key: "admin", label: "Admin", accessor: (row: any) => row.adminName || "Unknown admin" },
  { key: "entity", label: "Entity", accessor: (row: any) => row.entityType },
  { key: "entityId", label: "Entity id", accessor: (row: any) => row.entityId || "" },
  { key: "created", label: "Created", accessor: (row: any) => row.createdAt },
  actionsColumn,
]

const reconciliationColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "walletEarned", label: "Wallet earned", align: "right" as const, accessor: (row: any) => Number(row.walletEarned || 0) },
  { key: "statementEarned", label: "Statement earned", align: "right" as const, accessor: (row: any) => Number(row.statementEarned || 0) },
  { key: "walletAvailable", label: "Wallet available", align: "right" as const, accessor: (row: any) => Number(row.walletAvailableBalance || 0) },
  { key: "expectedAvailable", label: "Expected available", align: "right" as const, accessor: (row: any) => Number(row.expectedAvailableBalance || 0) },
  { key: "issues", label: "Issues", align: "right" as const, accessor: (row: any) => row.issueCount },
  actionsColumn,
]

const archivedArtistColumns = [
  {
    key: "select",
    label: "",
    accessor: (row: any) => row.name,
    sortable: false,
    searchable: false,
    hideable: false,
    class: "w-10",
  },
  { key: "name", label: "Artist", accessor: (row: any) => row.name },
  { key: "email", label: "Email", accessor: (row: any) => row.email || "" },
  { key: "share", label: "Share", accessor: (row: any) => row.artistSharePct || "" },
  { key: "bank", label: "Bank", accessor: (row: any) => row.bankDetails ? "Saved" : "Missing" },
  { key: "profiles", label: "Profiles", accessor: (row: ArchivedArtistRecord) => existingDspProfileCount(row) },
  { key: "archivedAt", label: "Archived", accessor: (row: any) => row.deactivatedAt || "" },
  actionsColumn,
]

const archivedReleaseColumns = [
  { key: "title", label: "Release", accessor: (row: any) => row.title },
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "type", label: "Type", accessor: (row: any) => row.type },
  { key: "upc", label: "UPC", accessor: (row: any) => row.upc || "" },
]

const archivedTrackColumns = [
  { key: "title", label: "Track", accessor: (row: any) => row.title },
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "release", label: "Release", accessor: (row: any) => row.releaseTitle },
  { key: "isrc", label: "ISRC", accessor: (row: any) => row.isrc },
]

const filteredArchivedArtists = computed(() => {
  const query = archiveSearch.value.trim().toLowerCase()

  if (!query) {
    return archivedArtists.value
  }

  return archivedArtists.value.filter((artist) =>
    [artist.name, artist.fullName ?? "", artist.email ?? "", artist.country ?? "", artist.bio ?? ""].some((value) =>
      value.toLowerCase().includes(query),
    ),
  )
})

const filteredArchivedArtistIds = computed(() => filteredArchivedArtists.value.map((artist) => artist.id))
const hasFilteredArchivedArtists = computed(() => filteredArchivedArtistIds.value.length > 0)
const selectedFilteredArchivedArtistCount = computed(() =>
  filteredArchivedArtistIds.value.filter((artistId) => selectedArchivedArtistIdSet.value.has(artistId)).length,
)
const areAllFilteredArchivedArtistsSelected = computed(() =>
  hasFilteredArchivedArtists.value && selectedFilteredArchivedArtistCount.value === filteredArchivedArtistIds.value.length,
)
const archiveSelectAllLabel = computed(() =>
  areAllFilteredArchivedArtistsSelected.value
    ? "Clear visible archived artist selection"
    : "Select all visible archived artists",
)

const filteredArchivedReleases = computed(() => {
  const query = archiveSearch.value.trim().toLowerCase()

  if (!query) {
    return archivedReleases.value
  }

  return archivedReleases.value.filter((release) =>
    [release.title, release.artistName, release.upc ?? "", release.type].some((value) =>
      value.toLowerCase().includes(query),
    ),
  )
})

const filteredArchivedTracks = computed(() => {
  const query = archiveSearch.value.trim().toLowerCase()

  if (!query) {
    return archivedTracks.value
  }

  return archivedTracks.value.filter((track) =>
    [track.title, track.artistName, track.releaseTitle, track.isrc].some((value) =>
      value.toLowerCase().includes(query),
    ),
  )
})

function resetMessages() {
  successMessage.value = ""
  errorMessage.value = ""
}

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function setError(error: any, fallback: string) {
  errorMessage.value = error?.data?.statusMessage || error?.message || fallback
  successMessage.value = ""
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

function formatMonth(value: string) {
  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return value
  }

  return monthFormatter.format(parsedDate)
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

function formatMoney(value: string) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function formatActionLabel(action: string) {
  return action
    .split(".")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" / ")
}

function existingDspProfileCount(artist: ArchivedArtistRecord) {
  return (artist.dspProfiles ?? []).filter((profile) => profile.profileExists).length
}

function dspProfileExistsSelectValue(profile: ArtistDspProfileDraft) {
  return profile.profileExists === null ? "unset" : String(profile.profileExists)
}

function updateDspProfileExists(profile: ArtistDspProfileDraft, value: string | number | null) {
  const nextValue = String(value ?? "unset")
  profile.profileExists = nextValue === "true" ? true : nextValue === "false" ? false : null
}

function statementStatusTone(status: AdminStatementPeriodRecord["status"]) {
  return status === "closed" ? "success" : "warning"
}

function reconciliationStatusTone(status: AdminReconciliationStatus) {
  if (status === "fail") {
    return "danger"
  }

  if (status === "warning") {
    return "warning"
  }

  return "success"
}

function detailEntries(details: Record<string, unknown>) {
  return Object.entries(details)
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 5)
}

function buildArchivedArtistRestoreDraft(artist: ArchivedArtistRecord): ArchivedArtistRestoreDraft {
  const draft = emptyArtistCreateDraft()
  draft.accessMethod = "password"
  draft.artistName = artist.name
  draft.email = artist.email ?? ""
  draft.fullName = artist.fullName ?? artist.name
  draft.country = artist.country ?? ""
  draft.bio = artist.bio ?? ""
  draft.password = ""
  return draft
}

function blankDspProfileDrafts(artistName: string): ArtistDspProfileDraft[] {
  return ARTIST_DSP_PROFILE_PLATFORMS.map((platform) => ({
    platform,
    profileExists: null,
    profileUrl: "",
    displayName: artistName,
    avatarUrl: "",
  }))
}

function buildDspProfileDraftsFromArchivedArtist(artist: ArchivedArtistRecord): ArtistDspProfileDraft[] {
  const fallbackDrafts = blankDspProfileDrafts(artist.name)
  const profiles = artist.dspProfiles ?? []

  return fallbackDrafts.map((draft) => {
    const record = profiles.find((profile) => profile.platform === draft.platform)

    return {
      platform: draft.platform,
      profileExists: record?.profileExists ?? null,
      profileUrl: record?.profileUrl ?? "",
      displayName: record?.displayName ?? artist.name,
      avatarUrl: record?.avatarUrl ?? "",
    }
  })
}

function buildSocialLinkDraftsFromArchivedArtist(artist: ArchivedArtistRecord): ArtistSocialLinkDraft[] {
  const links = artist.socialLinks ?? []

  return ARTIST_SOCIAL_LINK_PLATFORMS.map((platform) => {
    const record = links.find((link) => link.platform === platform)

    return {
      platform,
      url: record?.url ?? "",
    }
  })
}

function buildArchivedArtistEditDraft(artist: ArchivedArtistRecord): ArchivedArtistEditDraft {
  return {
    name: artist.name,
    email: artist.email ?? "",
    artistSharePct: artist.artistSharePct ?? "",
    avatarMode: artist.avatarMode ?? "mesh",
    avatarPreset: artist.avatarPreset ?? "aurora",
    avatarCustomColors: [...(artist.avatarCustomColors ?? DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS)],
    avatarUrl: artist.avatarUrl ?? "",
    country: artist.country ?? "",
    bio: artist.bio ?? "",
    legalName: artist.publishingInfo?.legalName ?? "",
    ipiNumber: artist.publishingInfo?.ipiNumber ?? "",
    proName: artist.publishingInfo?.proName ?? "",
    bankAccountName: artist.bankDetails?.accountName ?? "",
    bankName: artist.bankDetails?.bankName ?? "",
    bankAccountNumber: artist.bankDetails?.accountNumber ?? "",
    bankAddress: artist.bankDetails?.bankAddress ?? "",
    dspProfiles: buildDspProfileDraftsFromArchivedArtist(artist),
    socialLinks: buildSocialLinkDraftsFromArchivedArtist(artist),
  }
}

function dspProfileSignature(profiles: ArtistDspProfileDraft[]) {
  return profiles
    .map((profile) => [
      profile.platform,
      profile.profileExists === null ? "unset" : String(profile.profileExists),
      normalizedOptionalText(profile.profileUrl),
      normalizedOptionalText(profile.displayName),
      normalizedOptionalText(profile.avatarUrl),
    ].join(":"))
    .join("|")
}

function socialLinkSignature(links: ArtistSocialLinkDraft[]) {
  return links
    .map((link) => `${link.platform}:${normalizedOptionalText(link.url)}`)
    .join("|")
}

function archivedArtistHasEditChanges(artist: ArchivedArtistRecord) {
  const draft = archivedArtistEditDrafts[artist.id]

  if (!draft) {
    return false
  }

  const original = buildArchivedArtistEditDraft(artist)

  return (
    normalizedText(draft.name) !== normalizedText(original.name)
    || normalizedEmail(draft.email) !== normalizedEmail(original.email)
    || normalizedOptionalText(draft.artistSharePct) !== normalizedOptionalText(original.artistSharePct)
    || draft.avatarMode !== original.avatarMode
    || draft.avatarPreset !== original.avatarPreset
    || JSON.stringify(draft.avatarCustomColors) !== JSON.stringify(original.avatarCustomColors)
    || normalizedText(draft.avatarUrl) !== normalizedText(original.avatarUrl)
    || normalizedOptionalText(draft.country) !== normalizedOptionalText(original.country)
    || normalizedOptionalText(draft.bio) !== normalizedOptionalText(original.bio)
    || normalizedOptionalText(draft.legalName) !== normalizedOptionalText(original.legalName)
    || normalizedOptionalText(draft.ipiNumber) !== normalizedOptionalText(original.ipiNumber)
    || normalizedOptionalText(draft.proName) !== normalizedOptionalText(original.proName)
    || normalizedOptionalText(draft.bankAccountName) !== normalizedOptionalText(original.bankAccountName)
    || normalizedOptionalText(draft.bankName) !== normalizedOptionalText(original.bankName)
    || normalizedOptionalText(draft.bankAccountNumber) !== normalizedOptionalText(original.bankAccountNumber)
    || normalizedOptionalText(draft.bankAddress) !== normalizedOptionalText(original.bankAddress)
    || dspProfileSignature(draft.dspProfiles) !== dspProfileSignature(original.dspProfiles)
    || socialLinkSignature(draft.socialLinks) !== socialLinkSignature(original.socialLinks)
  )
}

function resetArchivedArtistEditDraft(artist: ArchivedArtistRecord) {
  archivedArtistEditDrafts[artist.id] = buildArchivedArtistEditDraft(artist)
}

function archivedArtistEditPayload(draft: ArchivedArtistEditDraft): UpdateAdminArtistInput {
  const bankDetails = [draft.bankAccountName, draft.bankName, draft.bankAccountNumber, draft.bankAddress].some((value) => value.trim())
    ? {
        accountName: draft.bankAccountName,
        bankName: draft.bankName,
        accountNumber: draft.bankAccountNumber,
        bankAddress: nullableText(draft.bankAddress),
      }
    : null

  return {
    name: draft.name,
    email: draft.email,
    artistSharePct: draft.artistSharePct,
    avatarMode: draft.avatarMode,
    avatarPreset: draft.avatarPreset,
    avatarCustomColors: draft.avatarPreset === "custom" ? draft.avatarCustomColors : null,
    avatarUrl: nullableText(draft.avatarUrl),
    country: nullableText(draft.country),
    bio: nullableText(draft.bio),
    publishingInfo: {
      legalName: nullableText(draft.legalName),
      ipiNumber: nullableText(draft.ipiNumber),
      proName: nullableText(draft.proName),
    },
    bankDetails,
    dspProfiles: draft.dspProfiles,
    socialLinks: draft.socialLinks,
  }
}

function saveArchivedArtistMessage(sections: AdminArtistMutationResponse["updatedSections"]) {
  if (!sections.length) {
    return "No changes were detected."
  }

  return `Saved archived artist ${sections.length === 1 ? "setting" : "settings"}.`
}

function restoreActionLabel(accessMethod: ArtistAccessMethod) {
  return accessMethod === "gmailInvite" ? "Create Gmail restore invite" : "Restore artist"
}

function statementPeriodLabel(period: AdminStatementPeriodRecord) {
  return `${period.artistName} ${formatMonth(period.periodMonth)}`
}

function isStatementPeriodSelected(periodId: string) {
  return selectedStatementPeriodIdSet.value.has(periodId)
}

function toggleStatementPeriodSelection(periodId: string, checked: boolean) {
  const next = new Set(selectedStatementPeriodIds.value)

  if (checked) {
    next.add(periodId)
  } else {
    next.delete(periodId)
  }

  selectedStatementPeriodIds.value = [...next]
}

function toggleFilteredStatementPeriodSelection(checked: boolean) {
  const next = new Set(selectedStatementPeriodIds.value)

  for (const periodId of filteredStatementPeriodIds.value) {
    if (checked) {
      next.add(periodId)
    } else {
      next.delete(periodId)
    }
  }

  selectedStatementPeriodIds.value = [...next]
}

function clearSelectedStatementPeriods() {
  selectedStatementPeriodIds.value = []
  resetMessages()
}

async function saveStatementPeriodStatus(period: AdminStatementPeriodRecord, nextStatus: "open" | "closed") {
  return await $fetch(`/api/admin/settings/statement-periods/${period.id}`, {
    method: "PATCH",
    body: {
      status: nextStatus,
    },
  })
}

async function updateStatementPeriod(period: AdminStatementPeriodRecord, nextStatus: "open" | "closed") {
  const actionLabel = nextStatus === "closed" ? "close" : "re-open"

  const confirmed = await confirmAction({
    title: `${nextStatus === "closed" ? "Close" : "Re-open"} statement period`,
    description: `${actionLabel} ${period.artistName}'s ${formatMonth(period.periodMonth)} statement period?`,
    confirmLabel: nextStatus === "closed" ? "Close period" : "Re-open period",
    variant: nextStatus === "closed" ? "destructive" : "default",
    adminVerification: { action: "statement_period.updated" },
  })

  if (!confirmed) {
    return
  }

  savingStatementPeriodId.value = period.id
  resetMessages()

  try {
    await saveStatementPeriodStatus(period, nextStatus)

    await refresh()
    statementDetailsOpen.value = false
    setSuccess(`${period.artistName} ${formatMonth(period.periodMonth)} is now ${nextStatus}.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to update the statement period.")
  } finally {
    savingStatementPeriodId.value = ""
  }
}

async function closeStatementPeriods(periods: AdminStatementPeriodRecord[], source: "selected" | "filtered") {
  const openPeriods = periods.filter((period) => period.status === "open")
  const skippedCount = periods.length - openPeriods.length

  if (!periods.length) {
    return
  }

  if (!openPeriods.length) {
    setError({ message: "There are no open statement periods to close." }, "Unable to close statement periods.")
    return
  }

  const preview = openPeriods.map((period) => statementPeriodLabel(period)).slice(0, 5).join(", ")
  const remaining = openPeriods.length - 5
  const confirmed = await confirmAction({
    title: `Close ${openPeriods.length} open statement ${openPeriods.length === 1 ? "period" : "periods"}?`,
    description: `${skippedCount ? `${skippedCount} already-closed ${skippedCount === 1 ? "period will" : "periods will"} be skipped. ` : ""}Close ${preview}${remaining > 0 ? `, and ${remaining} more` : ""}? Closed periods block additional CSV commits.`,
    confirmLabel: openPeriods.length === 1 ? "Close period" : "Close periods",
    variant: "destructive",
    adminVerification: { action: "statement_period.updated" },
  })

  if (!confirmed) {
    return
  }

  isBulkClosingStatementPeriods.value = true
  resetMessages()

  const closedIds = new Set<string>()

  try {
    for (const period of openPeriods) {
      savingStatementPeriodId.value = period.id
      await saveStatementPeriodStatus(period, "closed")
      closedIds.add(period.id)
    }

    await refresh()
    selectedStatementPeriodIds.value = selectedStatementPeriodIds.value.filter((periodId) => !closedIds.has(periodId))
    statementDetailsOpen.value = false
    setSuccess(`Closed ${closedIds.size} ${source === "filtered" ? "open" : "selected open"} statement ${closedIds.size === 1 ? "period" : "periods"}.`)
  } catch (fetchError: any) {
    selectedStatementPeriodIds.value = selectedStatementPeriodIds.value.filter((periodId) => !closedIds.has(periodId))
    setError(fetchError, source === "filtered" ? "Unable to close every open statement period." : "Unable to close every selected statement period.")
  } finally {
    savingStatementPeriodId.value = ""
    isBulkClosingStatementPeriods.value = false
  }
}

async function closeSelectedStatementPeriods() {
  await closeStatementPeriods(selectedStatementPeriods.value, "selected")
}

async function closeFilteredOpenStatementPeriods() {
  await closeStatementPeriods(filteredOpenStatementPeriods.value, "filtered")
}

async function restoreArtistAccess(artist: ArchivedArtistRecord) {
  const draft = archivedArtistRestoreDrafts[artist.id]

  if (!draft) {
    return
  }

  const actionLabel = draft.accessMethod === "gmailInvite" ? "Create Gmail restore invite" : "Restore dashboard access"
  const confirmed = await confirmAction({
    title: "Restore artist access",
    description: `${actionLabel} for ${artist.name}? This returns dashboard access to an archived artist record.`,
    confirmLabel: actionLabel,
    variant: "default",
  })

  if (!confirmed) {
    return
  }

  restoringArtistId.value = artist.id
  resetMessages()

  try {
    const result = await $fetch(`/api/admin/artists/${artist.id}/restore-access`, {
      method: "POST",
      body: {
        accessMethod: draft.accessMethod,
        email: draft.email,
        fullName: draft.fullName,
        password: draft.accessMethod === "password" ? draft.password : undefined,
        country: nullableText(draft.country),
        bio: nullableText(draft.bio),
      },
    }) as AdminArtistActionResponse

    await refresh()
    restoreOpen.value = false
    setSuccess(
      draft.accessMethod === "gmailInvite"
        ? `Created a Gmail restore invite for ${artist.name}. The artist stays archived until first Google sign-in.${emailDeliverySentence(result.emailDelivery)}`
        : `Restored dashboard access for ${artist.name}.${emailDeliverySentence(result.emailDelivery)}`,
    )
  } catch (fetchError: any) {
    setError(fetchError, `Unable to ${actionLabel.toLowerCase()} for this artist.`)
  } finally {
    restoringArtistId.value = ""
  }
}

async function saveArchivedArtist(artist: ArchivedArtistRecord) {
  const draft = archivedArtistEditDrafts[artist.id]

  if (!draft) {
    return
  }

  savingArchivedArtistId.value = artist.id
  resetMessages()

  try {
    const result = await $fetch(`/api/admin/artists/${artist.id}`, {
      method: "PATCH",
      body: archivedArtistEditPayload(draft),
    }) as AdminArtistMutationResponse

    await refresh()
    setSuccess(saveArchivedArtistMessage(result.updatedSections))
  } catch (fetchError: any) {
    setError(fetchError, "Unable to save this archived artist.")
  } finally {
    savingArchivedArtistId.value = ""
  }
}

async function permanentlyDeleteArchivedArtist(artist: ArchivedArtistRecord) {
  const confirmed = await confirmAction({
    title: `Permanent delete ${artist.name}?`,
    description: "This destroys the archived artist record, catalog, finance, analytics, payout history, CSV upload rows, and stored CSV/release/avatar files. This cannot be undone.",
    confirmLabel: "Delete forever",
    cancelLabel: "No, keep artist",
    variant: "destructive",
    requiredText: "DELETE",
    adminVerification: { action: "artist.permanently_deleted" },
  })

  if (!confirmed) {
    return
  }

  deletingArchivedArtistId.value = artist.id
  resetMessages()

  try {
    await $fetch(`/api/admin/artists/${artist.id}/permanent-delete`, {
      method: "POST",
    }) as AdminArtistActionResponse

    selectedArchivedArtistIds.value = selectedArchivedArtistIds.value.filter((artistId) => artistId !== artist.id)
    await refresh()
    archivedArtistEditOpen.value = false
    restoreOpen.value = false
    setSuccess(`Permanently deleted ${artist.name}.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to permanently delete this archived artist.")
  } finally {
    deletingArchivedArtistId.value = ""
  }
}

function isArchivedArtistSelected(artistId: string) {
  return selectedArchivedArtistIdSet.value.has(artistId)
}

function toggleArchivedArtistSelection(artistId: string, checked: boolean) {
  const next = new Set(selectedArchivedArtistIds.value)

  if (checked) {
    next.add(artistId)
  } else {
    next.delete(artistId)
  }

  selectedArchivedArtistIds.value = [...next]
}

function toggleFilteredArchivedArtistSelection(checked: boolean) {
  const next = new Set(selectedArchivedArtistIds.value)

  for (const artistId of filteredArchivedArtistIds.value) {
    if (checked) {
      next.add(artistId)
    } else {
      next.delete(artistId)
    }
  }

  selectedArchivedArtistIds.value = [...next]
}

function clearSelectedArchivedArtists() {
  selectedArchivedArtistIds.value = []
  resetMessages()
}

function bulkArchivedDeleteFailureMessage(response: AdminBulkArtistDeleteResponse) {
  if (!response.failure) {
    return "Permanent delete stopped before every selected archived artist was deleted."
  }

  const fallbackArtist = selectedArchivedArtists.value.find((artist) => artist.id === response.failure?.artistId)
  const artistName = response.failure.artistName || fallbackArtist?.name || response.failure.artistId || "the selected archived artist"
  const deletedCount = response.failure.deletedBeforeFailure
  const deletedText = deletedCount === 1 ? "1 artist was deleted before the error." : `${deletedCount} artists were deleted before the error.`

  return `Permanent delete stopped at ${artistName}. ${deletedText} ${response.failure.statusMessage}`
}

async function permanentlyDeleteSelectedArchivedArtists() {
  const artistIds = [...selectedArchivedArtistIds.value]

  if (!artistIds.length) {
    return
  }

  const count = artistIds.length
  const confirmed = await confirmAction({
    title: `Permanent delete ${count} archived ${count === 1 ? "artist" : "artists"}?`,
    description: `This destroys archived artist records, catalog, finance, analytics, payout history, CSV upload rows, and stored CSV/release/avatar files for ${selectedArchivedArtistPreviewNames.value || "the selected archived artists"}. This cannot be undone.`,
    confirmLabel: "Delete forever",
    cancelLabel: "No, keep artists",
    variant: "destructive",
    requiredText: "DELETE",
    adminVerification: { action: "artist.bulk_permanently_deleted" },
  })

  if (!confirmed) {
    return
  }

  isBulkDeletingArchivedArtists.value = true
  resetMessages()

  try {
    const response = await $fetch("/api/admin/artists/bulk-permanent-delete", {
      method: "POST",
      body: {
        artistIds,
      },
    }) as AdminBulkArtistDeleteResponse

    if (response.deletedArtistIds.length) {
      await refresh()
    }

    const deletedIds = new Set(response.deletedArtistIds)
    selectedArchivedArtistIds.value = selectedArchivedArtistIds.value.filter((artistId) => !deletedIds.has(artistId))

    if (response.ok) {
      selectedArchivedArtistIds.value = []
      setSuccess(`Permanently deleted ${response.deletedArtistIds.length} archived ${response.deletedArtistIds.length === 1 ? "artist" : "artists"}.`)
      return
    }

    errorMessage.value = bulkArchivedDeleteFailureMessage(response)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to permanently delete the selected archived artists.")
  } finally {
    isBulkDeletingArchivedArtists.value = false
  }
}

async function runFinancialReconciliation() {
  reconciliationPending.value = true
  reconciliationError.value = ""
  resetMessages()

  try {
    const response = await $fetch("/api/admin/reconciliation") as AdminReconciliationResponse
    reconciliation.value = response
    setSuccess(`Reconciliation checked ${response.summary.artistCount} artists and found ${response.summary.issueCount} issues.`)
  } catch (fetchError: any) {
    reconciliationError.value = fetchError?.data?.statusMessage || fetchError?.message || "Unable to run reconciliation."
    setError(fetchError, "Unable to run reconciliation.")
  } finally {
    reconciliationPending.value = false
  }
}

// ── Row kebabs ──
function statementActions(period: AdminStatementPeriodRecord): RowAction[] {
  const actions: RowAction[] = [{ key: "details", label: "View details", icon: Eye }]
  if (period.status === "open") {
    actions.push({ key: "close", label: "Close period", icon: Ban, variant: "destructive", separatorBefore: true })
  } else {
    actions.push({ key: "reopen", label: "Re-open period", icon: RotateCcw, separatorBefore: true })
  }
  return actions
}

function onStatementAction(key: string, period: AdminStatementPeriodRecord) {
  if (key === "details") {
    activeStatementId.value = period.id
    statementDetailsOpen.value = true
  } else if (key === "close") {
    void updateStatementPeriod(period, "closed")
  } else if (key === "reopen") {
    void updateStatementPeriod(period, "open")
  }
}

function onReconAction(_key: string, artist: AdminReconciliationResponse["artists"][number]) {
  activeReconId.value = artist.artistId
  reconDetailsOpen.value = true
}

function onAuditAction(_key: string, entry: AdminActivityLogRecord) {
  activeAuditId.value = entry.id
  auditDetailsOpen.value = true
}

function onArchivedArtistAction(key: string, artist: ArchivedArtistRecord) {
  resetMessages()
  activeArchivedArtistId.value = artist.id
  if (!archivedArtistRestoreDrafts[artist.id]) {
    archivedArtistRestoreDrafts[artist.id] = buildArchivedArtistRestoreDraft(artist)
  }
  if (!archivedArtistEditDrafts[artist.id]) {
    archivedArtistEditDrafts[artist.id] = buildArchivedArtistEditDraft(artist)
  }

  if (key === "edit") {
    archivedArtistEditOpen.value = true
  } else if (key === "restore") {
    restoreOpen.value = true
  } else if (key === "delete") {
    void permanentlyDeleteArchivedArtist(artist)
  }
}

const archivedArtistActions: RowAction[] = [
  { key: "edit", label: "Edit profile", icon: Pencil },
  { key: "restore", label: "Restore access", icon: RotateCcw },
  { key: "delete", label: "Permanent delete", icon: Trash2, variant: "destructive", separatorBefore: true },
]
const detailsOnlyActions: RowAction[] = [{ key: "details", label: "View details", icon: Eye }]
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

    <div v-if="errorMessage || successMessage || error" class="form-grid">
      <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
      <AppAlert v-if="successMessage" variant="success">{{ successMessage }}</AppAlert>
      <AppAlert v-if="error" variant="destructive">{{ error.statusMessage || "Unable to load admin settings right now." }}</AppAlert>
    </div>

    <WorkspaceFolderGrid
      v-model="activeAdminSettingsSection"
      :items="adminSettingsFolders"
      label="Admin settings sections"
    />

    <DataPanel
      v-if="activeAdminSettingsSection === 'account'"
      title="Connected login methods"
      eyebrow="Access"
      description="Manage the email, password, and Google sign-in methods for this admin account."
    >
      <AccountLoginMethods return-to="/admin/settings?section=account" />
    </DataPanel>

    <DataPanel
      v-if="activeAdminSettingsSection === 'statements'"
      title="Statement period controls"
      eyebrow="Financial lock"
      description="Closed periods block additional CSV commits. Re-open only when you intentionally need to correct a posted month."
    >
      <div class="stack">
        <div class="catalog-grid">
          <div class="field-row">
            <label for="statement-search">Search periods</label>
            <Input
              id="statement-search"
              v-model="statementSearch"

              type="search"
              placeholder="Search by artist or month"
            />
          </div>

          <div class="field-row">
            <label for="statement-status-filter">Status</label>
            <NativeSelect id="statement-status-filter" v-model="statementStatusFilter">
              <option value="all">All periods</option>
              <option value="open">Open only</option>
              <option value="closed">Closed only</option>
            </NativeSelect>
          </div>
        </div>

        <div class="statement-bulk-strip">
          <div class="summary-copy">
            <strong>{{ filteredOpenStatementPeriods.length }} open in view</strong>
            <span class="detail-copy">{{ filteredStatementPeriods.length }} periods showing</span>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            :disabled="pending || isBulkClosingStatementPeriods || !filteredOpenStatementPeriods.length"
            @click="closeFilteredOpenStatementPeriods"
          >
            <Ban class="size-4" />
            {{ isBulkClosingStatementPeriods ? "Closing..." : "Close all open" }}
          </Button>
        </div>

        <DashboardSkeleton v-if="pending" layout="admin-settings-table" :rows="5" />

        <DataTable
          v-else
          :columns="statementSettingsColumns"
          :data="filteredStatementPeriods"
          empty-title="No statement periods"
          empty-description="No statement periods match this filter yet."
          row-key="id"
          table-class="statement-periods-table"
          :row-class="(period) => isStatementPeriodSelected(period.id) && 'statement-period-row-selected'"
        >
          <template #header-select>
            <Checkbox
              :model-value="areAllFilteredStatementPeriodsSelected"
              :aria-label="statementSelectAllLabel"
              :disabled="isBulkClosingStatementPeriods || !hasFilteredStatementPeriods"
              @click.stop
              @update:model-value="(checked) => toggleFilteredStatementPeriodSelection(checked === true)"
            />
          </template>
          <template #cell-select="{ row: period }">
            <Checkbox
              :model-value="isStatementPeriodSelected(period.id)"
              :aria-label="`Select ${statementPeriodLabel(period)}`"
              :disabled="isBulkClosingStatementPeriods"
              @click.stop
              @update:model-value="(checked) => toggleStatementPeriodSelection(period.id, checked === true)"
            />
          </template>
          <template #cell-artist="{ row: period }">
            <strong>{{ period.artistName }}</strong>
            <div v-if="!period.artistIsActive" class="detail-copy">Artist is archived</div>
          </template>
          <template #cell-month="{ row: period }">{{ formatMonth(period.periodMonth) }}</template>
          <template #cell-earnings="{ row: period }">{{ formatMoney(period.earnings) }}</template>
          <template #cell-publishing="{ row: period }">{{ formatMoney(period.publishing) }}</template>
          <template #cell-uploads="{ row: period }">
            <span class="tabular-nums">{{ period.uploadCount }}</span>
          </template>
          <template #cell-status="{ row: period }">
            <StatusBadge :tone="statementStatusTone(period.status)">
              {{ period.status === "closed" ? "Closed" : "Open" }}
            </StatusBadge>
          </template>
          <template #cell-actions="{ row: period }">
            <RowActions :actions="statementActions(period)" @select="(key) => onStatementAction(key, period)" />
          </template>
        </DataTable>

        <Teleport to="body">
          <Transition name="archive-bulk-dock">
            <div v-if="hasSelectedStatementPeriods" class="archive-bulk-dock" role="toolbar" aria-label="Bulk statement actions">
              <p class="archive-bulk-dock-count" aria-live="polite">
                <strong>{{ selectedStatementPeriodCount }}</strong> selected
              </p>
              <div class="archive-bulk-dock-actions">
                <Button type="button" variant="secondary" size="sm" :disabled="isBulkClosingStatementPeriods" @click="clearSelectedStatementPeriods">
                  <X class="size-4" />
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  :disabled="isBulkClosingStatementPeriods || !selectedOpenStatementPeriods.length"
                  @click="closeSelectedStatementPeriods"
                >
                  <Ban class="size-4" />
                  {{ isBulkClosingStatementPeriods ? "Closing..." : "Close open" }}
                </Button>
              </div>
            </div>
          </Transition>
        </Teleport>
      </div>
    </DataPanel>

    <DataPanel
      v-if="activeAdminSettingsSection === 'reconciliation'"
      title="Financial reconciliation"
      eyebrow="Accuracy check"
      description="Run this before launch or after CSV delete/replace work to compare wallet, statement, upload, analytics, dues, payout, and ledger views per artist."
    >
      <div class="stack">
        <AppAlert v-if="reconciliationError" variant="destructive">{{ reconciliationError }}</AppAlert>

        <div class="catalog-section-header">
          <div class="summary-copy">
            <strong>Money-view agreement</strong>
            <span class="detail-copy">
              Latest run: {{ reconciliation ? formatDateTime(reconciliation.checkedAt) : "Not run yet" }}
            </span>
          </div>
          <Button :disabled="reconciliationPending" @click="runFinancialReconciliation">
            {{ reconciliationPending ? "Checking..." : "Run reconciliation" }}
          </Button>
        </div>

        <div class="metrics">
          <StatCard
            v-for="metric in reconciliationMetrics"
            :key="metric.label"
            :label="metric.label"
            :value="metric.value"
            :footnote="metric.footnote"
            :tone="metric.tone"
          />
        </div>

        <DashboardSkeleton v-if="reconciliationPending" layout="admin-settings-reconciliation" :rows="5" />

        <DataTable
          v-else
          :columns="reconciliationColumns"
          :data="reconciliation?.artists ?? []"
          empty-title="No reconciliation entries"
          empty-description="Run reconciliation to compare artist money views."
          row-key="artistId"
          enable-pagination
          :page-size="10"
        >
          <template #cell-artist="{ row: artist }">
            <strong>{{ artist.artistName }}</strong>
            <div class="detail-copy">{{ artist.artistEmail || "No email saved" }}</div>
            <div v-if="!artist.artistIsActive" class="detail-copy">Artist is archived</div>
          </template>
          <template #cell-status="{ row: artist }">
            <StatusBadge :tone="reconciliationStatusTone(artist.status)">
              {{ artist.status }}
            </StatusBadge>
          </template>
          <template #cell-walletEarned="{ row: artist }">{{ formatMoney(artist.walletEarned) }}</template>
          <template #cell-statementEarned="{ row: artist }">{{ formatMoney(artist.statementEarned) }}</template>
          <template #cell-walletAvailable="{ row: artist }">{{ formatMoney(artist.walletAvailableBalance) }}</template>
          <template #cell-expectedAvailable="{ row: artist }">{{ formatMoney(artist.expectedAvailableBalance) }}</template>
          <template #cell-issues="{ row: artist }">
            <span class="tabular-nums">{{ artist.issueCount }}</span>
          </template>
          <template #cell-actions="{ row: artist }">
            <RowActions :actions="detailsOnlyActions" @select="() => onReconAction('details', artist)" />
          </template>
        </DataTable>
      </div>
    </DataPanel>

    <DataPanel
      v-if="activeAdminSettingsSection === 'audit'"
      title="Admin activity log"
      eyebrow="Audit trail"
      description="Every admin mutation is append-only. Filter the recent trail by admin, entity type, or a search term."
    >
      <div class="stack">
        <div class="catalog-grid catalog-grid-wide">
          <div class="field-row">
            <label for="activity-search">Search activity</label>
            <Input id="activity-search" v-model="activitySearch" type="search" placeholder="Search action, entity id, or detail payload" />
          </div>

          <div class="field-row">
            <label for="activity-admin-filter">Admin</label>
            <NativeSelect id="activity-admin-filter" v-model="activityAdminFilter">
              <option value="all">All admins</option>
              <option v-for="adminName in adminOptions" :key="adminName" :value="adminName">
                {{ adminName }}
              </option>
            </NativeSelect>
          </div>

          <div class="field-row">
            <label for="activity-entity-filter">Entity</label>
            <NativeSelect id="activity-entity-filter" v-model="activityEntityFilter">
              <option value="all">All entities</option>
              <option v-for="entityName in entityOptions" :key="entityName" :value="entityName">
                {{ entityName }}
              </option>
            </NativeSelect>
          </div>
        </div>

        <DashboardSkeleton v-if="pending" layout="admin-settings-table" :rows="5" />

        <DataTable
          v-else
          :columns="activityLogColumns"
          :data="filteredActivityLog"
          empty-title="No admin activity"
          empty-description="No admin activity matches this filter."
          row-key="id"
        >
          <template #cell-action="{ row: entry }">
            <strong>{{ formatActionLabel(entry.action) }}</strong>
          </template>
          <template #cell-admin="{ row: entry }">{{ entry.adminName || "Unknown admin" }}</template>
          <template #cell-entity="{ row: entry }">
            <Badge variant="muted">{{ entry.entityType }}</Badge>
          </template>
          <template #cell-entityId="{ row: entry }">
            <span class="mono">{{ entry.entityId || "Not recorded" }}</span>
          </template>
          <template #cell-created="{ row: entry }">{{ formatDateTime(entry.createdAt) }}</template>
          <template #cell-actions="{ row: entry }">
            <RowActions :actions="detailsOnlyActions" @select="() => onAuditAction('details', entry)" />
          </template>
        </DataTable>
      </div>
    </DataPanel>

    <DataPanel
      v-if="activeAdminSettingsSection === 'archive'"
      title="Archived and deleted records"
      eyebrow="History workspace"
      description="Archived artists can be restored. Deleted releases and tracks stay visible here for audit and financial history only."
    >
      <div class="form-grid">
        <div class="field-row">
          <label for="archive-search">Search archived items</label>
          <Input
            id="archive-search"
            v-model="archiveSearch"

            type="search"
            placeholder="Search archived artists, deleted releases, or tracks"
          />
        </div>
      </div>

      <ClientOnly>
        <div class="archive-stack">
          <section class="archive-group">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Archived artists</strong>
                <span class="detail-copy">{{ summary.archivedArtistCount }} total - restore returns dashboard access to an archived record.</span>
              </div>
            </div>
            <DataTable
              :columns="archivedArtistColumns"
              :data="filteredArchivedArtists"
              empty-title="No archived artists"
              empty-description="No archived artists match this search."
              row-key="id"
              table-class="archive-artists-table"
              :row-class="(artist) => isArchivedArtistSelected(artist.id) && 'archive-row-selected-for-delete'"
            >
              <template #header-select>
                <Checkbox
                  :model-value="areAllFilteredArchivedArtistsSelected"
                  :aria-label="archiveSelectAllLabel"
                  :disabled="isBulkDeletingArchivedArtists || !hasFilteredArchivedArtists"
                  @click.stop
                  @update:model-value="(checked) => toggleFilteredArchivedArtistSelection(checked === true)"
                />
              </template>
              <template #cell-select="{ row: artist }">
                <Checkbox
                  :model-value="isArchivedArtistSelected(artist.id)"
                  :aria-label="`Select ${artist.name}`"
                  :disabled="isBulkDeletingArchivedArtists"
                  @click.stop
                  @update:model-value="(checked) => toggleArchivedArtistSelection(artist.id, checked === true)"
                />
              </template>
              <template #cell-name="{ row: artist }"><strong>{{ artist.name }}</strong></template>
              <template #cell-email="{ row: artist }">{{ artist.email || "No email saved" }}</template>
              <template #cell-share="{ row: artist }">{{ artist.artistSharePct ? `${artist.artistSharePct}%` : "Not set" }}</template>
              <template #cell-bank="{ row: artist }">
                <StatusBadge :tone="artist.bankDetails ? 'success' : 'warning'">
                  {{ artist.bankDetails ? "Saved" : "Missing" }}
                </StatusBadge>
              </template>
              <template #cell-profiles="{ row: artist }">
                <StatusBadge :tone="existingDspProfileCount(artist) ? 'success' : 'muted'">
                  {{ existingDspProfileCount(artist) }}
                </StatusBadge>
              </template>
              <template #cell-archivedAt="{ row: artist }">{{ formatDateTime(artist.deactivatedAt) }}</template>
              <template #cell-actions="{ row: artist }">
                <RowActions :actions="archivedArtistActions" @select="(key) => onArchivedArtistAction(key, artist)" />
              </template>
            </DataTable>

            <Teleport to="body">
              <Transition name="archive-bulk-dock">
                <div v-if="hasSelectedArchivedArtists" class="archive-bulk-dock" role="toolbar" aria-label="Bulk archived artist actions">
                  <p class="archive-bulk-dock-count" aria-live="polite">
                    <strong>{{ selectedArchivedArtistCount }}</strong> selected
                  </p>
                  <div class="archive-bulk-dock-actions">
                    <Button type="button" variant="secondary" size="sm" :disabled="isBulkDeletingArchivedArtists" @click="clearSelectedArchivedArtists">
                      <X class="size-4" />
                      Clear
                    </Button>
                    <Button type="button" variant="destructive" size="sm" :disabled="isBulkDeletingArchivedArtists" @click="permanentlyDeleteSelectedArchivedArtists">
                      <Trash2 class="size-4" />
                      {{ isBulkDeletingArchivedArtists ? "Deleting..." : "Permanent delete" }}
                    </Button>
                  </div>
                </div>
              </Transition>
            </Teleport>
          </section>

          <section class="archive-group">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Deleted releases</strong>
                <span class="detail-copy">{{ summary.archivedReleaseCount }} total — kept out of the artist release page but retained in earnings history.</span>
              </div>
            </div>
            <DataTable
              :columns="archivedReleaseColumns"
              :data="filteredArchivedReleases"
              empty-title="No deleted releases"
              empty-description="No deleted releases match this search."
              row-key="id"
            >
              <template #cell-title="{ row: release }"><strong>{{ release.title }}</strong></template>
              <template #cell-type="{ row: release }">
                <Badge variant="muted">{{ release.type.toUpperCase() }}</Badge>
              </template>
              <template #cell-upc="{ row: release }">
                <span class="mono">{{ release.upc || "No UPC" }}</span>
              </template>
            </DataTable>
          </section>

          <section class="archive-group">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Deleted tracks</strong>
                <span class="detail-copy">{{ summary.archivedTrackCount }} total — historic statements keep the track label even after deletion.</span>
              </div>
            </div>
            <DataTable
              :columns="archivedTrackColumns"
              :data="filteredArchivedTracks"
              empty-title="No deleted tracks"
              empty-description="No deleted tracks match this search."
              row-key="id"
            >
              <template #cell-title="{ row: track }"><strong>{{ track.title }}</strong></template>
              <template #cell-isrc="{ row: track }">
                <AppTooltip :label="track.isrc">
                  <span class="mono" tabindex="0">{{ track.isrc }}</span>
                </AppTooltip>
              </template>
            </DataTable>
          </section>
        </div>
        <template #fallback>
          <DashboardSkeleton layout="admin-settings-archive" label="Loading archived records" :rows="3" />
        </template>
      </ClientOnly>
    </DataPanel>

    <!-- Statement period details -->
    <FormDialog
      v-model:open="statementDetailsOpen"
      :title="activeStatement ? `${activeStatement.artistName} — ${formatMonth(activeStatement.periodMonth)}` : 'Statement period'"
      :description="activeStatement ? (activeStatement.status === 'closed' ? 'Closed — blocks additional CSV commits.' : 'Open — still eligible for imports.') : ''"
      readonly
    >
      <dl v-if="activeStatement" class="detail-list">
        <div class="detail-item">
          <dt>Status</dt>
          <dd><StatusBadge :tone="statementStatusTone(activeStatement.status)">{{ activeStatement.status === "closed" ? "Closed" : "Open" }}</StatusBadge></dd>
        </div>
        <div class="detail-item">
          <dt>Earnings / publishing</dt>
          <dd class="tabular-nums">{{ formatMoney(activeStatement.earnings) }} / {{ formatMoney(activeStatement.publishing) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Uploads</dt>
          <dd class="tabular-nums">{{ activeStatement.uploadCount }}</dd>
        </div>
        <div class="detail-item">
          <dt>Channels / territories / releases</dt>
          <dd class="tabular-nums">{{ activeStatement.channelCount }} / {{ activeStatement.territoryCount }} / {{ activeStatement.releaseCount }}</dd>
        </div>
        <div class="detail-item">
          <dt>Closed at</dt>
          <dd>{{ formatDateTime(activeStatement.closedAt) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Closed by</dt>
          <dd>{{ activeStatement.closedByAdminName || "Not closed yet" }}</dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="statementDetailsOpen = false">Close</Button>
        <Button
          v-if="activeStatement && activeStatement.status === 'open'"
          variant="destructive"
          :disabled="savingStatementPeriodId === activeStatement.id"
          @click="activeStatement && updateStatementPeriod(activeStatement, 'closed')"
        >
          {{ activeStatement && savingStatementPeriodId === activeStatement.id ? "Closing..." : "Close period" }}
        </Button>
        <Button
          v-else-if="activeStatement"
          :disabled="savingStatementPeriodId === activeStatement.id"
          @click="activeStatement && updateStatementPeriod(activeStatement, 'open')"
        >
          {{ activeStatement && savingStatementPeriodId === activeStatement.id ? "Re-opening..." : "Re-open period" }}
        </Button>
      </template>
    </FormDialog>

    <!-- Reconciliation details -->
    <FormDialog
      v-model:open="reconDetailsOpen"
      :title="activeRecon ? activeRecon.artistName : 'Reconciliation'"
      :description="activeRecon?.artistEmail || 'No email saved'"
      readonly
      content-class="max-w-2xl"
    >
      <div v-if="activeRecon" class="form-dialog-stack">
        <dl class="detail-list">
          <div class="detail-item">
            <dt>Status</dt>
            <dd><StatusBadge :tone="reconciliationStatusTone(activeRecon.status)">{{ activeRecon.status }}</StatusBadge></dd>
          </div>
          <div class="detail-item">
            <dt>Wallet / statement earned</dt>
            <dd class="tabular-nums">{{ formatMoney(activeRecon.walletEarned) }} / {{ formatMoney(activeRecon.statementEarned) }}</dd>
          </div>
          <div class="detail-item">
            <dt>Wallet / expected available</dt>
            <dd class="tabular-nums">{{ formatMoney(activeRecon.walletAvailableBalance) }} / {{ formatMoney(activeRecon.expectedAvailableBalance) }}</dd>
          </div>
          <div class="detail-item">
            <dt>Active earnings / publishing</dt>
            <dd class="tabular-nums">{{ formatMoney(activeRecon.activeEarningsSum) }} / {{ formatMoney(activeRecon.publishingSum) }}</dd>
          </div>
          <div class="detail-item">
            <dt>Dues / reserved / paid payouts</dt>
            <dd class="tabular-nums">{{ formatMoney(activeRecon.duesSum) }} / {{ formatMoney(activeRecon.payoutReservedSum) }} / {{ formatMoney(activeRecon.payoutPaidSum) }}</dd>
          </div>
          <div class="detail-item">
            <dt>Ledger sum / latest balance</dt>
            <dd class="tabular-nums">{{ formatMoney(activeRecon.ledgerAmountSum) }} / {{ formatMoney(activeRecon.latestLedgerBalance) }}</dd>
          </div>
          <div class="detail-item">
            <dt>Completed uploads</dt>
            <dd class="tabular-nums">{{ activeRecon.completedUploadCount }}</dd>
          </div>
        </dl>

        <div v-if="activeRecon.issues.length" class="issue-list">
          <div class="dialog-section-title">Issues ({{ activeRecon.issueCount }})</div>
          <div v-for="issue in activeRecon.issues" :key="`${issue.code}-${issue.message}`" class="issue-item">
            <strong>{{ issue.severity.toUpperCase() }} · {{ issue.code }}</strong>
            <span class="detail-copy">{{ issue.message }}</span>
            <span v-if="issue.expected || issue.actual" class="detail-copy">
              Expected {{ issue.expected ? formatMoney(issue.expected) : "-" }} / actual {{ issue.actual ? formatMoney(issue.actual) : "-" }}
            </span>
          </div>
        </div>
        <AppEmptyState
          v-else
          compact
          title="No reconciliation issues"
          description="Every money view agrees for this artist."
          class="border-0 bg-transparent shadow-none"
        />
      </div>
    </FormDialog>

    <!-- Audit entry details -->
    <FormDialog
      v-model:open="auditDetailsOpen"
      :title="activeAudit ? formatActionLabel(activeAudit.action) : 'Activity entry'"
      :description="activeAudit ? `${activeAudit.adminName || 'Unknown admin'} · ${formatDateTime(activeAudit.createdAt)}` : ''"
      readonly
    >
      <dl v-if="activeAudit" class="detail-list">
        <div class="detail-item">
          <dt>Entity</dt>
          <dd><Badge variant="muted">{{ activeAudit.entityType }}</Badge></dd>
        </div>
        <div class="detail-item">
          <dt>Entity id</dt>
          <dd class="mono">{{ activeAudit.entityId || "Not recorded" }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Details</dt>
          <dd>
            <div v-if="detailEntries(activeAudit.details).length" class="summary-table">
              <div
                v-for="[detailKey, detailValue] in detailEntries(activeAudit.details)"
                :key="detailKey"
                class="summary-row"
              >
                <span class="detail-copy">{{ detailKey }}</span>
                <strong>{{ String(detailValue) }}</strong>
              </div>
            </div>
            <span v-else class="detail-copy">No detail payload</span>
          </dd>
        </div>
      </dl>
    </FormDialog>

    <!-- Edit archived artist -->
    <FormDialog
      v-model:open="archivedArtistEditOpen"
      :title="activeArchivedArtist ? `Edit ${activeArchivedArtist.name}` : 'Edit archived artist'"
      description="Update the saved profile and artist settings without restoring dashboard access."
      submit-label="Save archived profile"
      :pending="!!activeArchivedArtist && savingArchivedArtistId === activeArchivedArtist.id"
      :submit-disabled="!activeArchivedArtist || !archivedArtistHasEditChanges(activeArchivedArtist)"
      :error="archivedArtistEditOpen ? errorMessage : ''"
      content-class="max-w-4xl"
      @submit="activeArchivedArtist && saveArchivedArtist(activeArchivedArtist)"
    >
      <div v-if="activeArchivedArtist && archivedArtistEditDrafts[activeArchivedArtist.id]" class="form-dialog-stack">
        <div class="dialog-section">
          <p class="dialog-section-title">Profile</p>
          <div class="dialog-grid">
            <div class="field-row">
              <label :for="`archived-name-${activeArchivedArtist.id}`">Stage name</label>
              <Input :id="`archived-name-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].name" type="text" />
            </div>
            <div class="field-row">
              <label :for="`archived-email-${activeArchivedArtist.id}`">Saved email</label>
              <Input :id="`archived-email-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].email" type="email" />
            </div>
            <div class="field-row">
              <label :for="`archived-share-${activeArchivedArtist.id}`">Artist share %</label>
              <Input :id="`archived-share-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].artistSharePct" type="number" min="0" max="100" step="0.01" />
            </div>
            <div class="field-row">
              <label :for="`archived-country-${activeArchivedArtist.id}`">Country</label>
              <Input :id="`archived-country-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].country" type="text" />
            </div>
            <div class="field-row">
              <label :for="`archived-avatar-mode-${activeArchivedArtist.id}`">Avatar mode</label>
              <NativeSelect :id="`archived-avatar-mode-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].avatarMode">
                <option value="mesh">Generated mesh</option>
                <option value="uploaded">Uploaded image</option>
              </NativeSelect>
            </div>
            <div class="field-row">
              <label :for="`archived-avatar-preset-${activeArchivedArtist.id}`">Avatar preset</label>
              <NativeSelect :id="`archived-avatar-preset-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].avatarPreset">
                <option v-for="preset in ARTIST_AVATAR_PRESETS" :key="preset" :value="preset">
                  {{ ARTIST_AVATAR_PRESET_LABELS[preset] }}
                </option>
              </NativeSelect>
            </div>
            <div class="field-row dialog-col-2">
              <label :for="`archived-avatar-url-${activeArchivedArtist.id}`">Avatar URL</label>
              <Input :id="`archived-avatar-url-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].avatarUrl" type="url" />
            </div>
            <div v-if="archivedArtistEditDrafts[activeArchivedArtist.id].avatarPreset === 'custom'" class="field-row dialog-col-2">
              <label>Custom avatar colors</label>
              <div class="color-grid">
                <Input
                  v-for="(_color, index) in archivedArtistEditDrafts[activeArchivedArtist.id].avatarCustomColors"
                  :key="`${activeArchivedArtist.id}-color-${index}`"
                  v-model="archivedArtistEditDrafts[activeArchivedArtist.id].avatarCustomColors[index]"
                  type="color"
                />
              </div>
            </div>
            <div class="field-row dialog-col-2">
              <label :for="`archived-bio-${activeArchivedArtist.id}`">Bio</label>
              <Textarea :id="`archived-bio-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].bio" rows="3" />
            </div>
          </div>
        </div>

        <div class="dialog-section">
          <p class="dialog-section-title">Publishing info</p>
          <div class="dialog-grid">
            <div class="field-row">
              <label :for="`archived-legal-${activeArchivedArtist.id}`">Legal name</label>
              <Input :id="`archived-legal-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].legalName" type="text" />
            </div>
            <div class="field-row">
              <label :for="`archived-ipi-${activeArchivedArtist.id}`">IPI / CAE</label>
              <Input :id="`archived-ipi-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].ipiNumber" type="text" />
            </div>
            <div class="field-row">
              <label :for="`archived-pro-${activeArchivedArtist.id}`">PRO</label>
              <Input :id="`archived-pro-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].proName" type="text" />
            </div>
          </div>
        </div>

        <div class="dialog-section">
          <p class="dialog-section-title">Bank details</p>
          <div class="dialog-grid">
            <div class="field-row">
              <label :for="`archived-bank-account-name-${activeArchivedArtist.id}`">Account name</label>
              <Input :id="`archived-bank-account-name-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].bankAccountName" type="text" />
            </div>
            <div class="field-row">
              <label :for="`archived-bank-name-${activeArchivedArtist.id}`">Bank name</label>
              <Input :id="`archived-bank-name-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].bankName" type="text" />
            </div>
            <div class="field-row">
              <label :for="`archived-bank-account-number-${activeArchivedArtist.id}`">Account number</label>
              <Input :id="`archived-bank-account-number-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].bankAccountNumber" type="text" />
            </div>
            <div class="field-row">
              <label :for="`archived-bank-address-${activeArchivedArtist.id}`">Bank address</label>
              <Input :id="`archived-bank-address-${activeArchivedArtist.id}`" v-model="archivedArtistEditDrafts[activeArchivedArtist.id].bankAddress" type="text" />
            </div>
          </div>
        </div>

        <div class="dialog-section">
          <p class="dialog-section-title">DSP profiles</p>
          <div class="settings-repeat-grid">
            <div
              v-for="profile in archivedArtistEditDrafts[activeArchivedArtist.id].dspProfiles"
              :key="profile.platform"
              class="settings-repeat-row"
            >
              <div class="field-row">
                <label :for="`archived-dsp-${activeArchivedArtist.id}-${profile.platform}-exists`">{{ ARTIST_DSP_PROFILE_PLATFORM_LABELS[profile.platform] }}</label>
                <NativeSelect
                  :id="`archived-dsp-${activeArchivedArtist.id}-${profile.platform}-exists`"
                  :model-value="dspProfileExistsSelectValue(profile)"
                  @update:model-value="(value) => updateDspProfileExists(profile, value)"
                >
                  <option value="unset">Not set</option>
                  <option value="true">Profile exists</option>
                  <option value="false">No profile</option>
                </NativeSelect>
              </div>
              <div class="field-row">
                <label :for="`archived-dsp-${activeArchivedArtist.id}-${profile.platform}-url`">Profile URL</label>
                <Input :id="`archived-dsp-${activeArchivedArtist.id}-${profile.platform}-url`" v-model="profile.profileUrl" type="url" />
              </div>
              <div class="field-row">
                <label :for="`archived-dsp-${activeArchivedArtist.id}-${profile.platform}-display`">Display name</label>
                <Input :id="`archived-dsp-${activeArchivedArtist.id}-${profile.platform}-display`" v-model="profile.displayName" type="text" />
              </div>
              <div class="field-row">
                <label :for="`archived-dsp-${activeArchivedArtist.id}-${profile.platform}-avatar`">Avatar URL</label>
                <Input :id="`archived-dsp-${activeArchivedArtist.id}-${profile.platform}-avatar`" v-model="profile.avatarUrl" type="url" />
              </div>
            </div>
          </div>
        </div>

        <div class="dialog-section">
          <p class="dialog-section-title">Social links</p>
          <div class="dialog-grid">
            <div
              v-for="link in archivedArtistEditDrafts[activeArchivedArtist.id].socialLinks"
              :key="link.platform"
              class="field-row"
            >
              <label :for="`archived-social-${activeArchivedArtist.id}-${link.platform}`">{{ ARTIST_SOCIAL_LINK_PLATFORM_LABELS[link.platform] }}</label>
              <Input :id="`archived-social-${activeArchivedArtist.id}-${link.platform}`" v-model="link.url" type="url" />
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" type="button" @click="archivedArtistEditOpen = false">Close</Button>
        <Button
          v-if="activeArchivedArtist"
          variant="secondary"
          type="button"
          :disabled="savingArchivedArtistId === activeArchivedArtist.id || !archivedArtistHasEditChanges(activeArchivedArtist)"
          @click="resetArchivedArtistEditDraft(activeArchivedArtist)"
        >
          Reset
        </Button>
        <Button
          v-if="activeArchivedArtist"
          type="button"
          :disabled="savingArchivedArtistId === activeArchivedArtist.id || !archivedArtistHasEditChanges(activeArchivedArtist)"
          @click="saveArchivedArtist(activeArchivedArtist)"
        >
          {{ savingArchivedArtistId === activeArchivedArtist.id ? "Saving..." : "Save archived profile" }}
        </Button>
      </template>
    </FormDialog>

    <!-- Restore archived artist -->
    <FormDialog
      v-model:open="restoreOpen"
      :title="activeArchivedArtist ? `Restore ${activeArchivedArtist.name}` : 'Restore artist'"
      description="Return dashboard access to an archived artist record via a new password account or a Gmail invite."
      :submit-label="activeArchivedArtist && archivedArtistRestoreDrafts[activeArchivedArtist.id] ? restoreActionLabel(archivedArtistRestoreDrafts[activeArchivedArtist.id].accessMethod) : 'Restore artist'"
      :pending="!!activeArchivedArtist && restoringArtistId === activeArchivedArtist.id"
      :error="restoreOpen ? errorMessage : ''"
      @submit="activeArchivedArtist && restoreArtistAccess(activeArchivedArtist)"
    >
      <div v-if="activeArchivedArtist && archivedArtistRestoreDrafts[activeArchivedArtist.id]" class="dialog-grid">
        <div class="field-row">
          <label for="restore-method">Access method</label>
          <NativeSelect id="restore-method" v-model="archivedArtistRestoreDrafts[activeArchivedArtist.id].accessMethod">
            <option value="password">Password account now</option>
            <option value="gmailInvite">Gmail invite</option>
          </NativeSelect>
        </div>
        <div class="field-row">
          <label for="restore-email">Login email</label>
          <Input id="restore-email" v-model="archivedArtistRestoreDrafts[activeArchivedArtist.id].email" type="email" />
        </div>
        <div class="field-row">
          <label for="restore-full-name">Full name</label>
          <Input id="restore-full-name" v-model="archivedArtistRestoreDrafts[activeArchivedArtist.id].fullName" type="text" />
        </div>
        <div v-if="archivedArtistRestoreDrafts[activeArchivedArtist.id].accessMethod === 'password'" class="field-row">
          <label for="restore-password">Temporary password</label>
          <Input id="restore-password" v-model="archivedArtistRestoreDrafts[activeArchivedArtist.id].password" type="password" />
        </div>
        <div class="field-row">
          <label for="restore-country">Country</label>
          <Input id="restore-country" v-model="archivedArtistRestoreDrafts[activeArchivedArtist.id].country" type="text" />
        </div>
        <div class="field-row dialog-col-2">
          <label for="restore-bio">Bio</label>
          <Textarea id="restore-bio" v-model="archivedArtistRestoreDrafts[activeArchivedArtist.id].bio" rows="3" />
        </div>
      </div>
    </FormDialog>
  </div>
</template>

<style scoped>
.statement-bulk-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 22%, transparent);
}

:deep(.statement-period-row-selected) {
  background: color-mix(in srgb, var(--primary) 10%, transparent);
}

:deep(.statement-periods-table) {
  min-width: 980px;
}

.archive-stack {
  display: grid;
  gap: 24px;
}

.archive-group {
  display: grid;
  gap: 12px;
}

.dialog-grid {
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr 1fr;
}

.dialog-col-2 {
  grid-column: 1 / -1;
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

.detail-static {
  font-size: 14px;
  font-weight: 560;
  padding: 8px 0;
}

.form-dialog-stack {
  display: grid;
  gap: 18px;
}

.dialog-section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
  margin-bottom: 8px;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(44px, 1fr));
  gap: 10px;
}

.settings-repeat-grid {
  display: grid;
  gap: 12px;
}

.settings-repeat-row {
  display: grid;
  grid-template-columns: minmax(140px, 0.8fr) repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--muted) 24%, transparent);
}

:deep(.archive-row-selected-for-delete) {
  background: color-mix(in srgb, var(--destructive) 18%, transparent);
}

:deep(.archive-artists-table) {
  min-width: 1240px;
}

.archive-bulk-dock {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 70;
  display: flex;
  align-items: center;
  gap: 16px;
  transform: translateX(-50%);
  padding: 10px 14px;
  border: 1px solid var(--surface-border);
  border-radius: 8px;
  background: var(--background);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
}

.archive-bulk-dock-count {
  margin: 0;
  font-size: 13px;
  color: var(--muted-foreground);
}

.archive-bulk-dock-actions {
  display: inline-flex;
  gap: 8px;
}

.archive-bulk-dock-enter-active,
.archive-bulk-dock-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.archive-bulk-dock-enter-from,
.archive-bulk-dock-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}

.issue-list {
  display: grid;
  gap: 10px;
}

.issue-item {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--muted) 35%, transparent);
}

@media (max-width: 560px) {
  .statement-bulk-strip {
    align-items: stretch;
    flex-direction: column;
  }

  .dialog-grid,
  .detail-list,
  .settings-repeat-row {
    grid-template-columns: 1fr;
  }

  .archive-bulk-dock {
    left: 12px;
    right: 12px;
    transform: none;
    justify-content: space-between;
  }

  .archive-bulk-dock-enter-from,
  .archive-bulk-dock-leave-to {
    transform: translateY(8px);
  }
}
</style>
