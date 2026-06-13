<script setup lang="ts">
import { Badge } from "@/components/ui/badge"
import AppTooltip from "~/components/AppTooltip.vue"
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

const statementSettingsExpandedRowIds = computed(() => filteredStatementPeriods.value.map((period) => period.id))
const channelRegistryExpandedRowIds = computed(() => channels.value.map((channel) => channel.id))
const activityLogExpandedRowIds = computed(() => filteredActivityLog.value.map((entry) => entry.id))
const reconciliationExpandedRowIds = computed(() =>
  reconciliation.value?.artists.filter((artist) => artist.issueCount > 0).map((artist) => artist.artistId) ?? [],
)

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

const statementSettingsColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "month", label: "Month", accessor: (row: any) => row.periodMonth },
  { key: "earnings", label: "Earnings", align: "right" as const, accessor: (row: any) => Number(row.earnings || 0) },
  { key: "publishing", label: "Publishing", align: "right" as const, accessor: (row: any) => Number(row.publishing || 0) },
  { key: "uploads", label: "Uploads", align: "right" as const, accessor: (row: any) => row.uploadCount },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
]

const channelRegistryColumns = [
  { key: "name", label: "Channel", accessor: (row: any) => row.displayName || row.rawName },
  { key: "raw", label: "Raw name", accessor: (row: any) => row.rawName },
  { key: "color", label: "Color", accessor: (row: any) => row.color || "" },
  { key: "updated", label: "Updated", accessor: (row: any) => row.updatedAt },
]

const activityLogColumns = [
  { key: "action", label: "Action", accessor: (row: any) => row.action },
  { key: "admin", label: "Admin", accessor: (row: any) => row.adminName || "Unknown admin" },
  { key: "entity", label: "Entity", accessor: (row: any) => row.entityType },
  { key: "entityId", label: "Entity id", accessor: (row: any) => row.entityId || "" },
  { key: "created", label: "Created", accessor: (row: any) => row.createdAt },
]

const reconciliationColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "walletEarned", label: "Wallet earned", align: "right" as const, accessor: (row: any) => Number(row.walletEarned || 0) },
  { key: "statementEarned", label: "Statement earned", align: "right" as const, accessor: (row: any) => Number(row.statementEarned || 0) },
  { key: "walletAvailable", label: "Wallet available", align: "right" as const, accessor: (row: any) => Number(row.walletAvailableBalance || 0) },
  { key: "expectedAvailable", label: "Expected available", align: "right" as const, accessor: (row: any) => Number(row.expectedAvailableBalance || 0) },
  { key: "issues", label: "Issues", align: "right" as const, accessor: (row: any) => row.issueCount },
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
      <div class="form-grid">
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
          :expanded-row-ids="statementSettingsExpandedRowIds"
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
          <template #expandedRow="{ row: period }">
            <div class="form-grid">
              <div class="summary-table">
                <div class="summary-row">
                  <span class="detail-copy">Channel / territory / release count</span>
                  <strong>{{ period.channelCount }} / {{ period.territoryCount }} / {{ period.releaseCount }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Closed at</span>
                  <strong>{{ formatDateTime(period.closedAt) }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Closed by</span>
                  <strong>{{ period.closedByAdminName || "Not closed yet" }}</strong>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Button
                  v-if="period.status === 'open'"
                  variant="secondary"
                  :disabled="savingStatementPeriodId === period.id"
                  @click="updateStatementPeriod(period, 'closed')"
                >
                  {{ savingStatementPeriodId === period.id ? "Closing..." : "Close period" }}
                </Button>
                <Button
                  v-else
                  variant="secondary"
                  :disabled="savingStatementPeriodId === period.id"
                  @click="updateStatementPeriod(period, 'open')"
                >
                  {{ savingStatementPeriodId === period.id ? "Re-opening..." : "Re-open period" }}
                </Button>
              </div>
            </div>
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
        :expanded-row-ids="channelRegistryExpandedRowIds"
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
        <template #expandedRow="{ row: channel }">
          <div v-if="channelDrafts[channel.id]" class="form-grid">
            <div class="catalog-grid catalog-grid-wide">
              <div class="field-row">
                <label :for="`channel-display-${channel.id}`">Display name</label>
                <Input :id="`channel-display-${channel.id}`" v-model="channelDrafts[channel.id].displayName" type="text" />
              </div>

              <div class="field-row">
                <label :for="`channel-icon-${channel.id}`">Icon URL</label>
                <Input :id="`channel-icon-${channel.id}`" v-model="channelDrafts[channel.id].iconUrl" type="url" />
              </div>

              <div class="field-row">
                <label :for="`channel-color-${channel.id}`">Color</label>
                <Input :id="`channel-color-${channel.id}`" v-model="channelDrafts[channel.id].color" class="font-mono" type="text" placeholder="#FF6B3D" />
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button v-if="channelDrafts[channel.id].iconUrl" variant="secondary" as-child>
                <a
                  :href="channelDrafts[channel.id].iconUrl"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open icon
                </a>
              </Button>
              <Button
                variant="secondary"
                :disabled="savingChannelId === channel.id"
                @click="saveChannel(channel)"
              >
                {{ savingChannelId === channel.id ? "Saving..." : "Save channel" }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </DataPanel>

    <DataPanel
      v-if="activeAdminSettingsSection === 'reconciliation'"
      title="Financial reconciliation"
      eyebrow="Accuracy check"
      description="Run this before launch or after CSV delete/replace work to compare wallet, statement, upload, analytics, dues, payout, and ledger views per artist."
    >
      <div class="form-grid">
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
          :expanded-row-ids="reconciliationExpandedRowIds"
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
          <template #expandedRow="{ row: artist }">
            <div class="form-grid">
              <div class="summary-table">
                <div class="summary-row">
                  <span class="detail-copy">Active earnings / publishing</span>
                  <strong>{{ formatMoney(artist.activeEarningsSum) }} / {{ formatMoney(artist.publishingSum) }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Dues / reserved payouts / paid payouts</span>
                  <strong>{{ formatMoney(artist.duesSum) }} / {{ formatMoney(artist.payoutReservedSum) }} / {{ formatMoney(artist.payoutPaidSum) }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Ledger sum / latest balance_after</span>
                  <strong>{{ formatMoney(artist.ledgerAmountSum) }} / {{ formatMoney(artist.latestLedgerBalance) }}</strong>
                </div>
                <div class="summary-row">
                  <span class="detail-copy">Completed uploads</span>
                  <strong>{{ artist.completedUploadCount }}</strong>
                </div>
              </div>

              <div v-if="artist.issues.length" class="catalog-subitems">
                <div v-for="issue in artist.issues" :key="`${artist.artistId}-${issue.code}-${issue.message}`" class="catalog-subitem catalog-subitem-compact">
                  <div class="summary-copy">
                    <strong>{{ issue.severity.toUpperCase() }} / {{ issue.code }}</strong>
                    <span class="detail-copy">{{ issue.message }}</span>
                    <span v-if="issue.expected || issue.actual" class="detail-copy">
                      Expected {{ issue.expected ? formatMoney(issue.expected) : "-" }} / actual {{ issue.actual ? formatMoney(issue.actual) : "-" }}
                    </span>
                  </div>
                </div>
              </div>
              <AppEmptyState
                v-else
                compact
                title="No reconciliation issues"
                description="No reconciliation issues for this artist."
                class="border-0 bg-transparent shadow-none"
              />
            </div>
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
      <div class="form-grid">
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
          :expanded-row-ids="activityLogExpandedRowIds"
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
          <template #expandedRow="{ row: entry }">
            <div class="summary-table">
              <div
                v-for="[detailKey, detailValue] in detailEntries(entry.details)"
                :key="`${entry.id}-${detailKey}`"
                class="summary-row"
              >
                <span class="detail-copy">{{ detailKey }}</span>
                <strong>{{ String(detailValue) }}</strong>
              </div>
              <div v-if="!detailEntries(entry.details).length" class="summary-row">
                <span class="detail-copy">Details</span>
                <strong>No detail payload</strong>
              </div>
            </div>
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
        <div class="panel-grid">
          <div class="catalog-subitem catalog-subitem-muted">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Orphaned artists</strong>
                <span class="detail-copy">{{ summary.orphanedArtistCount }} total orphaned artist records.</span>
              </div>
            </div>

            <AppEmptyState
              v-if="!filteredOrphanedArtists.length"
              compact
              icon="search"
              title="No orphaned artists"
              description="No orphaned artists match this search."
              class="border-0 bg-transparent shadow-none"
            />

            <div v-else class="catalog-subitems">
              <template v-for="artist in filteredOrphanedArtists" :key="artist.id">
              <div v-if="orphanRestoreDrafts[artist.id]" class="catalog-subitem catalog-subitem-compact">
                <div class="summary-copy">
                  <strong>{{ artist.name }}</strong>
                  <span class="detail-copy">{{ artist.email || "No email saved" }}</span>
                  <span class="detail-copy">{{ artist.fullName || "No last-known full name" }}</span>
                  <span class="detail-copy">Orphaned {{ formatDateTime(artist.deactivatedAt) }}</span>
                </div>

                <div class="form-grid">
                  <div class="field-row">
                    <label :for="`orphan-method-${artist.id}`">Access method</label>
                    <NativeSelect :id="`orphan-method-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].accessMethod">
                      <option value="password">Password account now</option>
                      <option value="gmailInvite">Gmail invite</option>
                    </NativeSelect>
                  </div>

                  <div class="field-row">
                    <label :for="`orphan-email-${artist.id}`">Login email</label>
                    <Input :id="`orphan-email-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].email" type="email" />
                  </div>

                  <div class="field-row">
                    <label :for="`orphan-full-name-${artist.id}`">Full name</label>
                    <Input :id="`orphan-full-name-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].fullName" type="text" />
                  </div>

                  <div class="field-row" v-if="orphanRestoreDrafts[artist.id].accessMethod === 'password'">
                    <label :for="`orphan-password-${artist.id}`">Temporary password</label>
                    <Input :id="`orphan-password-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].password" type="password" />
                  </div>

                  <div class="field-row">
                    <label :for="`orphan-country-${artist.id}`">Country</label>
                    <Input :id="`orphan-country-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].country" type="text" />
                  </div>

                  <div class="field-row field-row-full">
                    <label :for="`orphan-bio-${artist.id}`">Bio</label>
                    <Textarea :id="`orphan-bio-${artist.id}`" v-model="orphanRestoreDrafts[artist.id].bio" rows="3" />
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <Button variant="secondary" :disabled="restoringArtistId === artist.id" @click="restoreArtistAccess(artist)">
                    {{ restoringArtistId === artist.id ? "Saving..." : restoreActionLabel(orphanRestoreDrafts[artist.id].accessMethod) }}
                  </Button>
                </div>
              </div>
              </template>
            </div>
          </div>

          <div class="catalog-subitem catalog-subitem-muted">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Deleted releases</strong>
                <span class="detail-copy">{{ summary.archivedReleaseCount }} total deleted release records.</span>
              </div>
            </div>

            <AppEmptyState
              v-if="!filteredArchivedReleases.length"
              compact
              icon="search"
              title="No deleted releases"
              description="No deleted releases match this search."
              class="border-0 bg-transparent shadow-none"
            />

            <div v-else class="catalog-subitems">
              <div v-for="release in filteredArchivedReleases" :key="release.id" class="catalog-subitem catalog-subitem-compact">
                <div class="summary-copy">
                  <strong>{{ release.title }}</strong>
                  <span class="detail-copy">{{ release.artistName }} / {{ release.type.toUpperCase() }}</span>
                  <span class="detail-copy">{{ release.upc || "No UPC" }}</span>
                  <span class="detail-copy">Deleted catalog entries stay out of the artist release page but remain in earnings history.</span>
                </div>
              </div>
            </div>
          </div>

          <div class="catalog-subitem catalog-subitem-muted">
            <div class="catalog-section-header">
              <div class="summary-copy">
                <strong>Deleted tracks</strong>
                <span class="detail-copy">{{ summary.archivedTrackCount }} total deleted track records.</span>
              </div>
            </div>

            <AppEmptyState
              v-if="!filteredArchivedTracks.length"
              compact
              icon="search"
              title="No deleted tracks"
              description="No deleted tracks match this search."
              class="border-0 bg-transparent shadow-none"
            />

            <div v-else class="catalog-subitems">
              <div v-for="track in filteredArchivedTracks" :key="track.id" class="catalog-subitem catalog-subitem-compact">
                <div class="summary-copy">
                  <strong>{{ track.title }}</strong>
                  <span class="detail-copy">{{ track.artistName }} / {{ track.releaseTitle }}</span>
                  <AppTooltip :label="track.isrc">
                    <span class="detail-copy" tabindex="0">{{ track.isrc }}</span>
                  </AppTooltip>
                  <span class="detail-copy">Historic statements keep the track label even after deletion.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <template #fallback>
          <DashboardSkeleton label="Loading archived records" :rows="3" />
        </template>
      </ClientOnly>
    </DataPanel>
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
</style>
