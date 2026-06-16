<script setup lang="ts">
import { Ban, Eye, Pencil, RotateCcw } from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import AppTooltip from "~/components/AppTooltip.vue"
import type { RowAction } from "~/components/RowActions.vue"
import type {
  AdminActivityLogRecord,
  AdminChannelRegistryRecord,
  AdminArtistActionResponse,
  AdminReconciliationResponse,
  AdminReconciliationStatus,
  AdminSettingsResponse,
  ArtistAccessMethod,
  AdminStatementPeriodRecord,
  OrphanedArtistRecord,
  TransactionalEmailDelivery,
} from "~~/types/settings"
import {
  emptyArtistCreateDraft,
  nullableText,
  type ArtistCreateDraft,
} from "~/utils/admin-access"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

interface ChannelDraft {
  displayName: string
  iconUrl: string
  color: string
}

type OrphanedArtistRestoreDraft = ArtistCreateDraft
type AdminSettingsSection = "account" | "statements" | "channels" | "reconciliation" | "audit" | "archive"

const adminSettingsSectionValues: AdminSettingsSection[] = [
  "account",
  "statements",
  "channels",
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
const restoringArtistId = ref("")
const savingChannelId = ref("")
const reconciliation = ref<AdminReconciliationResponse | null>(null)
const reconciliationPending = ref(false)
const reconciliationError = ref("")
const channelDrafts = reactive<Record<string, ChannelDraft>>({})
const orphanRestoreDrafts = reactive<Record<string, OrphanedArtistRestoreDraft>>({})
const { confirmAction } = useConfirmAction()

// Dialog state
const statementDetailsOpen = ref(false)
const activeStatementId = ref<string | null>(null)
const channelEditOpen = ref(false)
const activeChannelId = ref<string | null>(null)
const reconDetailsOpen = ref(false)
const activeReconId = ref<string | null>(null)
const auditDetailsOpen = ref(false)
const activeAuditId = ref<string | null>(null)
const restoreOpen = ref(false)
const activeOrphanId = ref<string | null>(null)

const { data, error, pending, refresh } = useLazyFetch<AdminSettingsResponse>("/api/admin/settings")

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

const summary = computed(() => data.value?.summary ?? {
  openStatementCount: 0,
  closedStatementCount: 0,
  orphanedArtistCount: 0,
  archivedReleaseCount: 0,
  archivedTrackCount: 0,
  activityLogCount: 0,
  channelCount: 0,
})

const statementPeriods = computed(() => data.value?.statementPeriods ?? [])
const activityLog = computed(() => data.value?.activityLog ?? [])
const orphanedArtists = computed(() => data.value?.orphanedArtists ?? [])
const archivedReleases = computed(() => data.value?.archived.releases ?? [])
const archivedTracks = computed(() => data.value?.archived.tracks ?? [])
const channels = computed(() => data.value?.channels ?? [])

const activeStatement = computed(() => statementPeriods.value.find((p) => p.id === activeStatementId.value) ?? null)
const activeChannel = computed(() => channels.value.find((c) => c.id === activeChannelId.value) ?? null)
const activeRecon = computed(() => reconciliation.value?.artists.find((a) => a.artistId === activeReconId.value) ?? null)
const activeAudit = computed(() => activityLog.value.find((e) => e.id === activeAuditId.value) ?? null)
const activeOrphan = computed(() => orphanedArtists.value.find((a) => a.id === activeOrphanId.value) ?? null)

watch(
  orphanedArtists,
  (value) => {
    const activeArtistIds = new Set(value.map((artist) => artist.id))

    for (const artist of value) {
      orphanRestoreDrafts[artist.id] = buildOrphanRestoreDraft(artist)
    }

    for (const artistId of Object.keys(orphanRestoreDrafts)) {
      if (!activeArtistIds.has(artistId)) {
        delete orphanRestoreDrafts[artistId]
      }
    }
  },
  { immediate: true },
)

watch(
  channels,
  (value) => {
    for (const channel of value) {
      channelDrafts[channel.id] = {
        displayName: channel.displayName ?? "",
        iconUrl: channel.iconUrl ?? "",
        color: channel.color ?? "",
      }
    }
  },
  { immediate: true },
)

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
      summary.value.orphanedArtistCount + summary.value.archivedReleaseCount + summary.value.archivedTrackCount,
    ),
    footnote: "Orphaned artists plus deleted releases and tracks visible for audit and history.",
    tone: "default" as const,
  },
  {
    label: "Channels tracked",
    value: String(summary.value.channelCount),
    footnote: "Auto-created during import preview and editable here.",
    tone: "alt" as const,
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
    label: "Channels",
    value: "channels",
    badge: summary.value.channelCount,
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
    badge: summary.value.orphanedArtistCount + summary.value.archivedReleaseCount + summary.value.archivedTrackCount,
  },
])

const adminSettingsFolders = computed(() => adminSettingsSections.value.map((section) => ({
  ...section,
  icon: section.label.slice(0, 1),
  meta: section.value === "account"
    ? "Email, password, and Google"
    : section.value === "statements"
      ? "Period locks and finance control"
      : section.value === "channels"
        ? "Platform naming and badges"
        : section.value === "reconciliation"
          ? "Wallet, statement, upload, and ledger checks"
          : section.value === "audit"
            ? "Recent admin actions"
            : "Deleted and orphaned records",
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
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "month", label: "Month", accessor: (row: any) => row.periodMonth },
  { key: "earnings", label: "Earnings", align: "right" as const, accessor: (row: any) => Number(row.earnings || 0) },
  { key: "publishing", label: "Publishing", align: "right" as const, accessor: (row: any) => Number(row.publishing || 0) },
  { key: "uploads", label: "Uploads", align: "right" as const, accessor: (row: any) => row.uploadCount },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  actionsColumn,
]

const channelRegistryColumns = [
  { key: "name", label: "Channel", accessor: (row: any) => row.displayName || row.rawName },
  { key: "raw", label: "Raw name", accessor: (row: any) => row.rawName },
  { key: "color", label: "Color", accessor: (row: any) => row.color || "" },
  { key: "updated", label: "Updated", accessor: (row: any) => row.updatedAt },
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

const orphanedArtistColumns = [
  { key: "name", label: "Artist", accessor: (row: any) => row.name },
  { key: "email", label: "Email", accessor: (row: any) => row.email || "" },
  { key: "fullName", label: "Full name", accessor: (row: any) => row.fullName || "" },
  { key: "orphanedAt", label: "Orphaned", accessor: (row: any) => row.deactivatedAt || "" },
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

const filteredOrphanedArtists = computed(() => {
  const query = archiveSearch.value.trim().toLowerCase()

  if (!query) {
    return orphanedArtists.value
  }

  return orphanedArtists.value.filter((artist) =>
    [artist.name, artist.fullName ?? "", artist.email ?? "", artist.country ?? "", artist.bio ?? ""].some((value) =>
      value.toLowerCase().includes(query),
    ),
  )
})

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

function buildOrphanRestoreDraft(artist: OrphanedArtistRecord): OrphanedArtistRestoreDraft {
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

function restoreActionLabel(accessMethod: ArtistAccessMethod) {
  return accessMethod === "gmailInvite" ? "Create Gmail restore invite" : "Restore artist"
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
    await $fetch(`/api/admin/settings/statement-periods/${period.id}`, {
      method: "PATCH",
      body: {
        status: nextStatus,
      },
    })

    await refresh()
    statementDetailsOpen.value = false
    setSuccess(`${period.artistName} ${formatMonth(period.periodMonth)} is now ${nextStatus}.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to update the statement period.")
  } finally {
    savingStatementPeriodId.value = ""
  }
}

async function restoreArtistAccess(artist: OrphanedArtistRecord) {
  const draft = orphanRestoreDrafts[artist.id]

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
        ? `Created a Gmail restore invite for ${artist.name}. The artist stays orphaned until first Google sign-in.${emailDeliverySentence(result.emailDelivery)}`
        : `Restored dashboard access for ${artist.name}.${emailDeliverySentence(result.emailDelivery)}`,
    )
  } catch (fetchError: any) {
    setError(fetchError, `Unable to ${actionLabel.toLowerCase()} for this artist.`)
  } finally {
    restoringArtistId.value = ""
  }
}

async function saveChannel(channel: AdminChannelRegistryRecord) {
  savingChannelId.value = channel.id
  resetMessages()

  try {
    await $fetch(`/api/admin/settings/channels/${channel.id}`, {
      method: "PATCH",
      body: {
        displayName: channelDrafts[channel.id]?.displayName || null,
        iconUrl: channelDrafts[channel.id]?.iconUrl || null,
        color: channelDrafts[channel.id]?.color || null,
      },
    })

    await refresh()
    channelEditOpen.value = false
    setSuccess(`Saved channel settings for ${channel.displayName || channel.rawName}.`)
  } catch (fetchError: any) {
    setError(fetchError, "Unable to save the channel settings.")
  } finally {
    savingChannelId.value = ""
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

function onChannelAction(_key: string, channel: AdminChannelRegistryRecord) {
  resetMessages()
  activeChannelId.value = channel.id
  channelEditOpen.value = true
}

function onReconAction(_key: string, artist: AdminReconciliationResponse["artists"][number]) {
  activeReconId.value = artist.artistId
  reconDetailsOpen.value = true
}

function onAuditAction(_key: string, entry: AdminActivityLogRecord) {
  activeAuditId.value = entry.id
  auditDetailsOpen.value = true
}

function onOrphanAction(_key: string, artist: OrphanedArtistRecord) {
  resetMessages()
  activeOrphanId.value = artist.id
  if (!orphanRestoreDrafts[artist.id]) {
    orphanRestoreDrafts[artist.id] = buildOrphanRestoreDraft(artist)
  }
  restoreOpen.value = true
}

const orphanActions: RowAction[] = [{ key: "restore", label: "Restore access", icon: RotateCcw }]
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

        <DashboardSkeleton v-if="pending" :rows="5" />

        <DataTable
          v-else
          :columns="statementSettingsColumns"
          :data="filteredStatementPeriods"
          empty-title="No statement periods"
          empty-description="No statement periods match this filter yet."
          row-key="id"
        >
          <template #cell-artist="{ row: period }">
            <strong>{{ period.artistName }}</strong>
            <div v-if="!period.artistIsActive" class="detail-copy">Artist is orphaned</div>
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
      </div>
    </DataPanel>

    <DataPanel
      v-if="activeAdminSettingsSection === 'channels'"
      title="Channel registry"
      eyebrow="Platform labels"
      description="Channels auto-create from import preview. Use this registry to clean display names, icon URLs, and color tags without touching artist-visible financial data."
    >
      <DashboardSkeleton v-if="pending" :rows="5" />

      <DataTable
        v-else
        :columns="channelRegistryColumns"
        :data="channels"
        empty-title="No channels"
        empty-description="No channels have been registered yet. They will appear here after imports introduce them."
        row-key="id"
      >
        <template #cell-name="{ row: channel }">
          <DspLogo :name="channel.displayName || channel.rawName" :label="channel.displayName || channel.rawName" size="sm" />
        </template>
        <template #cell-raw="{ row: channel }">
          <span class="mono">{{ channel.rawName }}</span>
        </template>
        <template #cell-color="{ row: channel }">
          <span class="detail-copy">
            <strong
              class="channel-color-preview"
              :style="{ backgroundColor: channelDrafts[channel.id]?.color || channel.color || '#0a0a0a' }"
            />
            {{ channelDrafts[channel.id]?.color || channel.color || "Not set" }}
          </span>
        </template>
        <template #cell-updated="{ row: channel }">{{ formatDateTime(channel.updatedAt) }}</template>
        <template #cell-actions="{ row: channel }">
          <RowActions :actions="[{ key: 'edit', label: 'Edit channel', icon: Pencil }]" @select="() => onChannelAction('edit', channel)" />
        </template>
      </DataTable>
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

        <DashboardSkeleton v-if="reconciliationPending" :rows="5" />

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
            <div v-if="!artist.artistIsActive" class="detail-copy">Artist is orphaned</div>
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

        <DashboardSkeleton v-if="pending" :rows="5" />

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
      title="Orphaned and deleted records"
      eyebrow="History workspace"
      description="Orphaned artists can be restored. Deleted releases and tracks stay visible here for audit and financial history only."
    >
      <div class="form-grid">
        <div class="field-row">
          <label for="archive-search">Search archived items</label>
          <Input
            id="archive-search"
            v-model="archiveSearch"

            type="search"
            placeholder="Search orphaned artists, deleted releases, or tracks"
          />
        </div>
      </div>

      <ClientOnly>
        <div class="archive-stack">
          <section class="archive-group">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Orphaned artists</strong>
                <span class="detail-copy">{{ summary.orphanedArtistCount }} total — restore returns dashboard access to an archived record.</span>
              </div>
            </div>
            <DataTable
              :columns="orphanedArtistColumns"
              :data="filteredOrphanedArtists"
              empty-title="No orphaned artists"
              empty-description="No orphaned artists match this search."
              row-key="id"
            >
              <template #cell-name="{ row: artist }"><strong>{{ artist.name }}</strong></template>
              <template #cell-email="{ row: artist }">{{ artist.email || "No email saved" }}</template>
              <template #cell-fullName="{ row: artist }">{{ artist.fullName || "Not recorded" }}</template>
              <template #cell-orphanedAt="{ row: artist }">{{ formatDateTime(artist.deactivatedAt) }}</template>
              <template #cell-actions="{ row: artist }">
                <RowActions :actions="orphanActions" @select="() => onOrphanAction('restore', artist)" />
              </template>
            </DataTable>
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
          <DashboardSkeleton label="Loading archived records" :rows="3" />
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

    <!-- Channel edit -->
    <FormDialog
      v-model:open="channelEditOpen"
      :title="activeChannel ? `Edit ${activeChannel.displayName || activeChannel.rawName}` : 'Edit channel'"
      description="Clean the display name, icon, and color tag. This never touches artist-visible financial data."
      submit-label="Save channel"
      :pending="!!activeChannel && savingChannelId === activeChannel.id"
      :error="channelEditOpen ? errorMessage : ''"
      @submit="activeChannel && saveChannel(activeChannel)"
    >
      <div v-if="activeChannel && channelDrafts[activeChannel.id]" class="dialog-grid">
        <div class="field-row dialog-col-2">
          <label for="channel-display">Display name</label>
          <Input id="channel-display" v-model="channelDrafts[activeChannel.id].displayName" type="text" :placeholder="activeChannel.rawName" />
        </div>
        <div class="field-row dialog-col-2">
          <label for="channel-icon">Icon URL</label>
          <Input id="channel-icon" v-model="channelDrafts[activeChannel.id].iconUrl" type="url" placeholder="https://..." />
        </div>
        <div class="field-row">
          <label for="channel-color">Color</label>
          <Input id="channel-color" v-model="channelDrafts[activeChannel.id].color" class="font-mono" type="text" placeholder="#FF6B3D" />
        </div>
        <div class="field-row">
          <label>Raw name</label>
          <div class="detail-static mono">{{ activeChannel.rawName }}</div>
        </div>
      </div>
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

    <!-- Restore orphaned artist -->
    <FormDialog
      v-model:open="restoreOpen"
      :title="activeOrphan ? `Restore ${activeOrphan.name}` : 'Restore artist'"
      description="Return dashboard access to an archived artist record via a new password account or a Gmail invite."
      :submit-label="activeOrphan && orphanRestoreDrafts[activeOrphan.id] ? restoreActionLabel(orphanRestoreDrafts[activeOrphan.id].accessMethod) : 'Restore artist'"
      :pending="!!activeOrphan && restoringArtistId === activeOrphan.id"
      :error="restoreOpen ? errorMessage : ''"
      @submit="activeOrphan && restoreArtistAccess(activeOrphan)"
    >
      <div v-if="activeOrphan && orphanRestoreDrafts[activeOrphan.id]" class="dialog-grid">
        <div class="field-row">
          <label for="restore-method">Access method</label>
          <NativeSelect id="restore-method" v-model="orphanRestoreDrafts[activeOrphan.id].accessMethod">
            <option value="password">Password account now</option>
            <option value="gmailInvite">Gmail invite</option>
          </NativeSelect>
        </div>
        <div class="field-row">
          <label for="restore-email">Login email</label>
          <Input id="restore-email" v-model="orphanRestoreDrafts[activeOrphan.id].email" type="email" />
        </div>
        <div class="field-row">
          <label for="restore-full-name">Full name</label>
          <Input id="restore-full-name" v-model="orphanRestoreDrafts[activeOrphan.id].fullName" type="text" />
        </div>
        <div v-if="orphanRestoreDrafts[activeOrphan.id].accessMethod === 'password'" class="field-row">
          <label for="restore-password">Temporary password</label>
          <Input id="restore-password" v-model="orphanRestoreDrafts[activeOrphan.id].password" type="password" />
        </div>
        <div class="field-row">
          <label for="restore-country">Country</label>
          <Input id="restore-country" v-model="orphanRestoreDrafts[activeOrphan.id].country" type="text" />
        </div>
        <div class="field-row dialog-col-2">
          <label for="restore-bio">Bio</label>
          <Textarea id="restore-bio" v-model="orphanRestoreDrafts[activeOrphan.id].bio" rows="3" />
        </div>
      </div>
    </FormDialog>
  </div>
</template>

<style scoped>
.channel-color-preview {
  display: inline-flex;
  width: 1rem;
  height: 1rem;
  border-radius: 999px;
  border: 1px solid rgba(254, 249, 231, 0.12);
  margin-left: 0.5rem;
  vertical-align: middle;
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
  .dialog-grid,
  .detail-list {
    grid-template-columns: 1fr;
  }
}
</style>
