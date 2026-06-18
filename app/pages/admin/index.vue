<script setup lang="ts">
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, Eye, FileClock, LockKeyhole, UploadCloud, Users } from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import PremiumPayoutIcon from "~/components/icons/PremiumPayoutIcon.vue"
import PremiumReleaseIcon from "~/components/icons/PremiumReleaseIcon.vue"
import PremiumSettingsIcon from "~/components/icons/PremiumSettingsIcon.vue"
import type { RowAction } from "~/components/RowActions.vue"
import type {
  AdminDashboardPendingReleaseItem,
  AdminDashboardResponse,
  AdminDashboardUploadItem,
} from "~~/types/admin"
import type { PayoutRequestRecord } from "~~/types/payouts"
import type { CsvUploadStatus } from "~~/types/imports"
import type { PayoutRequestStatus } from "~~/types/payouts"
import { countryNameFor } from "~~/app/utils/country-flags"

definePageMeta({
  layout: "admin",
  middleware: ["admin"],
  keepalive: true,
})

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

const { data, pending, error, refresh } = useLazyFetch<AdminDashboardResponse>("/api/admin/dashboard")

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

const summary = computed(() => data.value?.summary ?? {
  activeArtistCount: 0,
  activeReleaseCount: 0,
  activeTrackCount: 0,
  completedUploadCount: 0,
  awaitingCommitUploadCount: 0,
  failedUploadCount: 0,
  pendingPayoutCount: 0,
  pendingPayoutAmount: "0.00000000",
  approvedPayoutCount: 0,
  approvedPayoutAmount: "0.00000000",
  openStatementCount: 0,
  closedStatementCount: 0,
  artistsMissingBankDetailsCount: 0,
  artistsMissingPublishingInfoCount: 0,
  pendingReleaseSubmissionCount: 0,
})

const recentUploads = computed(() => data.value?.recentUploads ?? [])
const pendingReleases = computed(() => data.value?.pendingReleases ?? [])
const payoutQueue = computed(() => data.value?.payoutQueue ?? [])
const recentStatementPeriods = computed(() => data.value?.recentStatementPeriods ?? [])
const artistReadiness = computed(() => data.value?.artistReadiness ?? [])
const recentActivity = computed(() => data.value?.recentActivity ?? [])

/* Queue age: how long the oldest item has been waiting. Amber past 48h. */
function queueAge(timestamps: Array<string | null | undefined>) {
  const oldest = timestamps
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => a - b)[0]

  if (!oldest) {
    return null
  }

  const hours = Math.max(0, (Date.now() - oldest) / 3_600_000)

  if (hours < 1) {
    return { label: "oldest: <1h", stale: false }
  }

  if (hours < 48) {
    return { label: `oldest: ${Math.round(hours)}h`, stale: false }
  }

  return { label: `oldest: ${Math.round(hours / 24)}d`, stale: true }
}

const payoutQueueAge = computed(() => queueAge(
  payoutQueue.value
    .filter((request) => request.status === "pending" || request.status === "approved")
    .map((request) => request.createdAt),
))

const submissionQueueAge = computed(() => queueAge(
  pendingReleases.value.map((release) => release.submittedAt),
))

const activeHomeSection = ref("today")

const homeSections = computed(() => [
  {
    label: "Today",
    value: "today",
    badge: summary.value.awaitingCommitUploadCount + summary.value.pendingPayoutCount + summary.value.pendingReleaseSubmissionCount,
  },
  {
    label: "Pending Releases",
    value: "pending-releases",
    badge: summary.value.pendingReleaseSubmissionCount,
  },
  {
    label: "Readiness",
    value: "readiness",
    badge: summary.value.artistsMissingBankDetailsCount + summary.value.artistsMissingPublishingInfoCount,
  },
  {
    label: "Activity",
    value: "activity",
    badge: recentActivity.value.length,
  },
])

const homeSectionFolders = computed(() => homeSections.value.map((section) => ({
  ...section,
  icon: section.label.slice(0, 1),
  meta: section.value === "today"
    ? "Queues needing action"
    : section.value === "readiness"
      ? "Statement and artist setup"
      : section.value === "pending-releases"
        ? "Artist release review"
      : "Recent audit events",
  tone: section.value === "today" ? "accent" as const : section.value === "pending-releases" ? "alt" as const : section.value === "readiness" ? "alt" as const : "default" as const,
})))

const dashboardFolders = computed(() => [
  {
    label: "Ingestion",
    to: "/admin/ingestion",
    icon: UploadCloud,
    meta: `${summary.value.awaitingCommitUploadCount} awaiting commit`,
    badge: summary.value.failedUploadCount ? `${summary.value.failedUploadCount} failed` : "",
    tone: summary.value.failedUploadCount ? "danger" as const : "default" as const,
  },
  {
    label: "Artists",
    to: "/admin/artists",
    icon: Users,
    meta: `${summary.value.activeArtistCount} active artists`,
    badge: summary.value.artistsMissingBankDetailsCount + summary.value.artistsMissingPublishingInfoCount || "",
    tone: "accent" as const,
  },
  {
    label: "Releases",
    to: "/admin/releases",
    icon: PremiumReleaseIcon,
    meta: `${summary.value.activeReleaseCount} releases / ${summary.value.activeTrackCount} tracks`,
    tone: "default" as const,
  },
  {
    label: "Payouts",
    to: "/admin/payouts",
    icon: PremiumPayoutIcon,
    meta: `${formatMoney(summary.value.pendingPayoutAmount)} pending`,
    badge: summary.value.pendingPayoutCount + summary.value.approvedPayoutCount || "",
    tone: "alt" as const,
  },
  {
    label: "Access Queue",
    to: "/admin/artists?section=access",
    icon: FileClock,
    meta: "Invites and account access",
    tone: "default" as const,
  },
  {
    label: "Settings",
    to: "/admin/settings",
    icon: PremiumSettingsIcon,
    meta: `${summary.value.openStatementCount} open periods`,
    badge: summary.value.closedStatementCount ? `${summary.value.closedStatementCount} locked` : "",
    tone: "default" as const,
  },
])

const readinessGapCount = computed(() => (
  summary.value.artistsMissingBankDetailsCount + summary.value.artistsMissingPublishingInfoCount
))

const activeIssueCount = computed(() => (
  summary.value.awaitingCommitUploadCount
  + summary.value.failedUploadCount
  + summary.value.pendingPayoutCount
  + summary.value.approvedPayoutCount
  + summary.value.pendingReleaseSubmissionCount
  + readinessGapCount.value
))

const operationsSignals = computed(() => [
  {
    label: "Ingestion",
    value: `${summary.value.awaitingCommitUploadCount + summary.value.failedUploadCount} open`,
    detail: `${summary.value.completedUploadCount} completed uploads`,
    tone: summary.value.failedUploadCount ? "danger" : summary.value.awaitingCommitUploadCount ? "warning" : "success",
    icon: UploadCloud,
    bars: [
      summary.value.completedUploadCount,
      summary.value.awaitingCommitUploadCount,
      summary.value.failedUploadCount,
      recentUploads.value.length,
    ],
  },
  {
    label: "Pending releases",
    value: `${summary.value.pendingReleaseSubmissionCount} open`,
    detail: "Artist submissions awaiting admin review",
    tone: summary.value.pendingReleaseSubmissionCount ? "warning" : "success",
    icon: PremiumReleaseIcon,
    bars: [
      summary.value.pendingReleaseSubmissionCount,
      pendingReleases.value.length,
      summary.value.activeReleaseCount,
      summary.value.activeTrackCount,
    ],
  },
  {
    label: "Payouts",
    value: formatMoney(summary.value.pendingPayoutAmount),
    detail: `${summary.value.pendingPayoutCount} pending / ${summary.value.approvedPayoutCount} approved`,
    tone: summary.value.pendingPayoutCount ? "warning" : "success",
    icon: PremiumPayoutIcon,
    bars: [
      summary.value.pendingPayoutCount,
      summary.value.approvedPayoutCount,
      Number(summary.value.pendingPayoutAmount || 0),
      Number(summary.value.approvedPayoutAmount || 0),
    ],
  },
  {
    label: "Statement locks",
    value: `${summary.value.closedStatementCount} locked`,
    detail: `${summary.value.openStatementCount} periods remain open`,
    tone: summary.value.openStatementCount ? "warning" : "success",
    icon: LockKeyhole,
    bars: [
      summary.value.closedStatementCount,
      summary.value.openStatementCount,
      recentStatementPeriods.value.length,
      summary.value.completedUploadCount,
    ],
  },
  {
    label: "Readiness",
    value: `${readinessGapCount.value} gaps`,
    detail: `${summary.value.activeArtistCount} artists in scope`,
    tone: readinessGapCount.value ? "danger" : "success",
    icon: Users,
    bars: [
      summary.value.activeArtistCount,
      summary.value.artistsMissingBankDetailsCount,
      summary.value.artistsMissingPublishingInfoCount,
      artistReadiness.value.length,
    ],
  },
])

const operationRingSegments = computed(() => {
  const uploadTotal = summary.value.completedUploadCount + summary.value.awaitingCommitUploadCount + summary.value.failedUploadCount
  const statementTotal = summary.value.closedStatementCount + summary.value.openStatementCount
  const readinessTotal = summary.value.activeArtistCount * 2
  const payoutIssues = summary.value.pendingPayoutCount + summary.value.approvedPayoutCount

  return [
    {
      label: "Ingestion health",
      value: scoreFromIssues(summary.value.awaitingCommitUploadCount + summary.value.failedUploadCount * 2, uploadTotal),
      detail: `${summary.value.awaitingCommitUploadCount} waiting / ${summary.value.failedUploadCount} failed`,
      tone: summary.value.failedUploadCount ? "danger" as const : "warning" as const,
    },
    {
      label: "Artist readiness",
      value: readinessTotal ? clampPercent(100 - (readinessGapCount.value / readinessTotal) * 100) : 100,
      detail: `${readinessGapCount.value} setup gaps`,
      tone: readinessGapCount.value ? "warning" as const : "success" as const,
    },
    {
      label: "Statement progress",
      value: statementTotal ? clampPercent((summary.value.closedStatementCount / statementTotal) * 100) : 100,
      detail: `${summary.value.openStatementCount} open periods`,
      tone: summary.value.openStatementCount ? "info" as const : "success" as const,
    },
    {
      label: "Payout clearance",
      value: scoreFromIssues(payoutIssues, payoutQueue.value.length + 1),
      detail: `${payoutIssues} requests need movement`,
      tone: payoutIssues ? "warning" as const : "success" as const,
    },
  ]
})

const uploadQueueColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "file", label: "File", accessor: (row: any) => row.filename },
  { key: "period", label: "Period", accessor: (row: any) => row.periodMonth },
  { key: "matched", label: "Matched", align: "right" as const, accessor: (row: any) => row.matchedCount ?? 0 },
  { key: "unmatched", label: "Unmatched", align: "right" as const, accessor: (row: any) => row.unmatchedCount ?? 0 },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.totalAmount || 0) },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
]

const payoutQueueColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0) },
  { key: "bank", label: "Bank destination", accessor: (row: any) => row.bankDetails?.bankName || "" },
  { key: "note", label: "Artist note", accessor: (row: any) => row.artistNotes || "" },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
  { key: "actions", label: "", align: "right" as const, sortable: false, searchable: false, hideable: false },
]

const pendingReleaseColumns = [
  { key: "release", label: "Release", accessor: (row: any) => row.title },
  { key: "submitted", label: "Submitted", accessor: (row: any) => row.submittedAt },
  { key: "stores", label: "Stores", accessor: (row: any) => row.targetStores.length },
  { key: "tracks", label: "Tracks", align: "right" as const, accessor: (row: any) => row.tracks.length },
  { key: "status", label: "Status", accessor: (row: any) => row.displayStatus },
  { key: "actions", label: "Actions", align: "right" as const, sortable: false },
]

const statementPeriodColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "month", label: "Month", accessor: (row: any) => row.periodMonth },
  { key: "earnings", label: "Earnings", align: "right" as const, accessor: (row: any) => Number(row.earnings || 0) },
  { key: "uploads", label: "Uploads", align: "right" as const, accessor: (row: any) => row.uploadCount },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
]

const artistReadinessColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.name },
  { key: "country", label: "Country", accessor: (row: any) => countryNameFor(row.country, "Country not set") },
  { key: "bank", label: "Bank", accessor: (row: any) => row.missingBankDetails ? "Missing" : "Saved" },
  { key: "publishing", label: "Publishing", accessor: (row: any) => row.missingPublishingInfo ? "Missing" : "Saved" },
]

const adminActivityColumns = [
  { key: "action", label: "Action", accessor: (row: any) => formatActionLabel(row.action) },
  { key: "admin", label: "Admin", accessor: (row: any) => row.adminName || "Unknown admin" },
  { key: "entity", label: "Entity", accessor: (row: any) => row.entityType },
  { key: "time", label: "Time", accessor: (row: any) => row.createdAt },
]

// ── Row kebabs + detail dialogs ──
const uploadDetailsOpen = ref(false)
const activeUploadId = ref("")
const activeUpload = computed(() => recentUploads.value.find((upload) => upload.id === activeUploadId.value) ?? null)

const payoutDetailsOpen = ref(false)
const activePayoutId = ref("")
const activePayout = computed(() => payoutQueue.value.find((request) => request.id === activePayoutId.value) ?? null)

const uploadRowActions: RowAction[] = [
  { key: "details", label: "View details", icon: Eye },
  { key: "open", label: "Open in ingestion", icon: ExternalLink, separatorBefore: true },
]

function onUploadAction(key: string, upload: AdminDashboardUploadItem) {
  if (key === "details") {
    activeUploadId.value = upload.id
    uploadDetailsOpen.value = true
  } else if (key === "open") {
    void navigateTo("/admin/ingestion")
  }
}

const payoutRowActions: RowAction[] = [
  { key: "details", label: "View details", icon: Eye },
  { key: "open", label: "Review in payouts", icon: ExternalLink, separatorBefore: true },
]

function onPayoutAction(key: string, request: PayoutRequestRecord) {
  if (key === "details") {
    activePayoutId.value = request.id
    payoutDetailsOpen.value = true
  } else if (key === "open") {
    void navigateTo("/admin/payouts")
  }
}

function pendingReleaseActions(release: AdminDashboardPendingReleaseItem): RowAction[] {
  const actions: RowAction[] = [{ key: "review", label: "Review", icon: Eye }]
  if (release.sourceCoverArtUrl) {
    actions.push({ key: "cover", label: "Open cover", icon: ExternalLink, separatorBefore: true })
  }
  return actions
}

function onPendingReleaseAction(key: string, release: AdminDashboardPendingReleaseItem) {
  if (key === "review") {
    void navigateTo(`/admin/releases?release=${release.releaseId}`)
  } else if (key === "cover" && release.sourceCoverArtUrl) {
    window.open(release.sourceCoverArtUrl, "_blank", "noopener,noreferrer")
  }
}

function formatMoney(value: string) {
  return `$${Number(value ?? 0).toFixed(2)}`
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scoreFromIssues(issueCount: number, baseCount: number) {
  const denominator = Math.max(baseCount + issueCount, 1)
  return clampPercent(100 - (issueCount / denominator) * 100)
}

function barHeight(values: number[], value: number) {
  const max = Math.max(...values.map((item) => Math.abs(item)), 1)
  return `${Math.max(16, (Math.abs(value) / max) * 100)}%`
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available"
  }

  return dateTimeFormatter.format(new Date(value))
}

function formatPeriodMonth(value: string) {
  return monthFormatter.format(new Date(`${value}T00:00:00Z`))
}

function formatActionLabel(action: string) {
  return action
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ")
}

function formatReleaseState(value: string) {
  if (value === "pending_review") return "Pending review"
  if (value === "scheduled") return "Scheduled"
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function releaseStateTone(value: string) {
  if (value === "live" || value === "approved") return "success"
  if (value === "scheduled") return "info"
  if (value === "rejected" || value === "deleted") return "danger"
  return "warning"
}

function submissionAssetDownloadUrl(submissionId: string, kind: "cover" | "audio", trackId?: string) {
  const params = new URLSearchParams({ kind })

  if (trackId) {
    params.set("trackId", trackId)
  }

  return `/api/admin/releases/submissions/${submissionId}/asset?${params.toString()}`
}

function uploadStatusLabel(status: CsvUploadStatus) {
  switch (status) {
    case "processing":
      return "Awaiting commit"
    case "completed":
      return "Completed"
    case "failed":
      return "Failed"
    case "reversed":
      return "Reversed"
    case "abandoned":
      return "Abandoned"
  }
}

function uploadStatusTone(status: CsvUploadStatus) {
  switch (status) {
    case "processing":
      return "warning"
    case "completed":
      return "success"
    case "failed":
    case "abandoned":
      return "danger"
    case "reversed":
      return "info"
  }
}

function payoutStatusLabel(status: PayoutRequestStatus) {
  switch (status) {
    case "pending":
      return "Pending"
    case "approved":
      return "Approved"
    case "rejected":
      return "Rejected"
    case "paid":
      return "Paid"
  }
}

function payoutStatusTone(status: PayoutRequestStatus) {
  switch (status) {
    case "pending":
      return "warning"
    case "approved":
      return "info"
    case "rejected":
      return "danger"
    case "paid":
      return "success"
  }
}
</script>

<template>
  <div class="page admin-home">
    <PageHeader
      eyebrow="Admin command"
      title="Operations home"
      description="A clear read on the queues that keep ingestion, statements, payouts, and artist readiness moving."
    >
      <template #actions>
        <div class="admin-header-actions">
          <Button as-child>
            <NuxtLink to="/admin/ingestion">
              <UploadCloud class="size-4" />
              Ingestion
            </NuxtLink>
          </Button>
          <Button variant="secondary" as-child>
            <NuxtLink to="/admin/payouts">
              <PremiumPayoutIcon class="size-4" />
              Payouts
            </NuxtLink>
          </Button>
        </div>
      </template>
    </PageHeader>

    <DashboardBento class="admin-control-bento">
      <div class="bento-cell bento-span-7">
        <Card glint="hero" class="operations-monitor">
          <div class="operations-monitor-header">
            <div class="operations-monitor-title">
              <p class="eyebrow">Control room</p>
              <h2>Royalty operations</h2>
              <p>
                Live operational signals across ingestion, payouts, statements, and artist readiness.
              </p>
            </div>
            <StatusBadge :tone="activeIssueCount ? 'warning' : 'success'">
              <component :is="activeIssueCount ? AlertTriangle : CheckCircle2" class="size-4" />
              <span>{{ activeIssueCount ? `${activeIssueCount} active signals` : "All queues clean" }}</span>
            </StatusBadge>
          </div>

          <div class="operations-signal-grid" v-reveal-group="{ trigger: 'mount', stagger: 0.07, y: 18 }">
            <Card
              v-for="signal in operationsSignals"
              :key="signal.label"
              glint="slab"
              size="sm"
              :class="['operations-signal', `operations-signal-${signal.tone}`]"
            >
              <div class="operations-signal-icon">
                <component :is="signal.icon" class="size-5" />
              </div>
              <div class="operations-signal-copy">
                <span>{{ signal.label }}</span>
                <strong>{{ signal.value }}</strong>
                <small>{{ signal.detail }}</small>
              </div>
              <div class="operations-sparkline" aria-hidden="true">
                <span
                  v-for="(bar, index) in signal.bars"
                  :key="`${signal.label}-${index}`"
                  :style="{ height: barHeight(signal.bars, bar) }"
                />
              </div>
            </Card>
          </div>
        </Card>
      </div>

      <div class="bento-cell bento-span-5">
        <OperationsRing
          title="Operations ring"
          eyebrow="Readiness score"
          summary="A single calm read on whether today's back office work is ready to move."
          :segments="operationRingSegments"
        />
      </div>

      <div class="bento-cell bento-span-12">
        <Card glint="quiet" class="command-dock">
          <div class="command-dock-header">
            <div>
              <p class="eyebrow">Command dock</p>
              <h3>Move through the work</h3>
              <p>Fast routes into the queues that usually decide whether statements and payouts stay clean.</p>
            </div>
            <Activity class="command-dock-mark" />
          </div>

          <div class="command-action-grid" v-reveal-group="{ stagger: 0.06, y: 18 }">
            <SpotlightActionCard
              v-for="item in dashboardFolders"
              :key="item.to"
              :label="item.label"
              :to="item.to"
              :icon="item.icon"
              :meta="item.meta"
              :badge="item.badge"
              :tone="item.tone"
            />
          </div>
        </Card>
      </div>
    </DashboardBento>

    <section class="admin-workspace">
      <div class="admin-workspace-header">
        <p class="eyebrow">Work queues</p>
        <h1 class="section-title">Admin panel</h1>
        <p class="muted-copy">
          This home view surfaces the queues that need human action first: ingestion exceptions, payout approvals, statement locks, and artist readiness issues.
        </p>
      </div>

      <div v-if="error" class="form-grid">
        <AppAlert variant="destructive">
          {{ error.statusMessage || "Unable to load the admin dashboard right now." }}
          <template #action>
            <Button variant="secondary" @click="() => refresh()">Retry</Button>
          </template>
        </AppAlert>
      </div>

      <DashboardSkeleton v-else-if="pending && !data" layout="admin-home" :rows="4" />

      <template v-else>
        <WorkspaceFolderGrid
          v-model="activeHomeSection"
          :items="homeSectionFolders"
          label="Admin dashboard sections"
        />

        <div v-if="activeHomeSection === 'today'" class="panel-grid panel-grid-single">
          <DataPanel
            title="Attention now"
            eyebrow="Triage"
            description="These counts are the fastest read on whether today's back office queue is clean."
          >
            <div class="summary-table">
              <div class="summary-row">
                <span class="detail-copy">Uploads awaiting commit</span>
                <strong>{{ summary.awaitingCommitUploadCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Failed or abandoned uploads</span>
                <strong>{{ summary.failedUploadCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Pending payouts</span>
                <strong>{{ summary.pendingPayoutCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Approved payouts to transfer</span>
                <strong>{{ summary.approvedPayoutCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Artists missing bank details</span>
                <strong>{{ summary.artistsMissingBankDetailsCount }}</strong>
              </div>
              <div class="summary-row">
                <span class="detail-copy">Artists missing publishing info</span>
                <strong>{{ summary.artistsMissingPublishingInfoCount }}</strong>
              </div>
            </div>
          </DataPanel>
        </div>

        <div v-if="activeHomeSection === 'today'" class="panel-grid">
          <DataPanel
            title="Recent upload queue"
            eyebrow="Ingestion"
            description="Recent CSV activity across artists. Failed and in-flight uploads should be resolved before the next statement cycle."
          >
            <LazyDataTable
              :columns="uploadQueueColumns"
              :data="recentUploads"
              empty-title="No uploads"
              empty-description="No uploads have been created yet."
              row-key="id"
            >
              <template #cell-artist="{ row: upload }">
                <strong>{{ upload.artistName }}</strong>
                <div v-if="upload.errorMessage" class="admin-table-note">{{ upload.errorMessage }}</div>
              </template>
              <template #cell-file="{ row: upload }">{{ upload.filename }}</template>
              <template #cell-period="{ row: upload }">
                {{ formatPeriodMonth(upload.periodMonth) }}
                <div class="admin-table-note">{{ formatDateTime(upload.createdAt) }}</div>
              </template>
              <template #cell-matched="{ row: upload }">
                <span class="tabular-nums">{{ upload.matchedCount ?? 0 }}</span>
              </template>
              <template #cell-unmatched="{ row: upload }">
                <span class="tabular-nums">{{ upload.unmatchedCount ?? 0 }}</span>
              </template>
              <template #cell-amount="{ row: upload }">
                <MoneyValue v-if="upload.totalAmount" :value="upload.totalAmount" size="sm" />
                <span v-else>Not parsed yet</span>
              </template>
              <template #cell-status="{ row: upload }">
                <StatusBadge :tone="uploadStatusTone(upload.status)">
                  {{ uploadStatusLabel(upload.status) }}
                </StatusBadge>
              </template>
              <template #cell-actions="{ row: upload }">
                <RowActions :actions="uploadRowActions" @select="(key) => onUploadAction(key, upload)" />
              </template>
            </LazyDataTable>
          </DataPanel>

          <DataPanel
            title="Payout queue"
            eyebrow="Cash movement"
            description="Pending requests need review. Approved requests are waiting for external payment and confirmation."
          >
            <template v-if="payoutQueueAge" #actions>
              <span class="queue-age-chip" :class="{ 'queue-age-stale': payoutQueueAge.stale }">
                {{ payoutQueueAge.label }}
              </span>
            </template>
            <LazyDataTable
              :columns="payoutQueueColumns"
              :data="payoutQueue"
              empty-title="No payout attention needed"
              empty-description="No pending or approved payouts need attention right now."
              row-key="id"
            >
              <template #cell-artist="{ row: request }">
                <strong>{{ request.artistName }}</strong>
                <div class="detail-copy">Requested {{ formatDateTime(request.createdAt) }}</div>
              </template>
              <template #cell-amount="{ row: request }">
                <strong class="tabular-nums">{{ formatMoney(request.amount) }}</strong>
              </template>
              <template #cell-bank="{ row: request }">
                {{ request.bankDetails ? `${request.bankDetails.bankName} / ${request.bankDetails.accountNumber}` : "Missing bank details" }}
              </template>
              <template #cell-note="{ row: request }">
                <span>{{ request.artistNotes || "No note" }}</span>
                <div v-if="request.adminNotes" class="detail-copy">Admin note: {{ request.adminNotes }}</div>
              </template>
              <template #cell-status="{ row: request }">
                <StatusBadge :tone="payoutStatusTone(request.status)">{{ payoutStatusLabel(request.status) }}</StatusBadge>
              </template>
              <template #cell-actions="{ row: request }">
                <RowActions :actions="payoutRowActions" @select="(key) => onPayoutAction(key, request)" />
              </template>
            </LazyDataTable>
          </DataPanel>
        </div>

        <div v-if="activeHomeSection === 'pending-releases'" class="panel-grid panel-grid-single">
          <DataPanel
            title="Pending Releases"
            eyebrow="Artist submissions"
            description="Review artist-submitted release packages before adding final delivery links and scheduling them."
          >
            <template v-if="submissionQueueAge" #actions>
              <span class="queue-age-chip" :class="{ 'queue-age-stale': submissionQueueAge.stale }">
                {{ submissionQueueAge.label }}
              </span>
            </template>
            <LazyDataTable
              :columns="pendingReleaseColumns"
              :data="pendingReleases"
              empty-title="No release reviews"
              empty-description="No artist releases are pending review right now."
              row-key="id"
            >
              <template #cell-release="{ row: release }">
                <strong>{{ release.title }}</strong>
                <div class="detail-copy">
                  {{ release.artistName }} / {{ release.type.toUpperCase() }} / {{ release.genre }} / {{ release.releaseDate || "No date" }}
                </div>
                <div v-if="release.artistEmail" class="detail-copy">{{ release.artistEmail }}</div>
                <div v-if="release.artistNotes" class="detail-copy">Note: {{ release.artistNotes }}</div>
              </template>
              <template #cell-submitted="{ row: release }">
                {{ formatDateTime(release.submittedAt) }}
              </template>
              <template #cell-stores="{ row: release }">
                <DspLogoList :names="release.targetStores" :max="4" size="xs" />
              </template>
              <template #cell-tracks="{ row: release }">
                <span class="tabular-nums">{{ release.tracks.length }}</span>
              </template>
              <template #cell-status="{ row: release }">
                <StatusBadge :tone="releaseStateTone(release.displayStatus)">
                  {{ formatReleaseState(release.displayStatus) }}
                </StatusBadge>
              </template>
              <template #cell-actions="{ row: release }">
                <RowActions :actions="pendingReleaseActions(release)" @select="(key) => onPendingReleaseAction(key, release)" />
              </template>
            </LazyDataTable>
          </DataPanel>
        </div>

        <div v-if="activeHomeSection === 'readiness'" class="panel-grid">
          <DataPanel
            title="Recent statement periods"
            eyebrow="Lock status"
            description="Use this to see which months are still open and which ones are already locked against further CSV commits."
          >
            <LazyDataTable
              :columns="statementPeriodColumns"
              :data="recentStatementPeriods"
              empty-title="No statement periods"
              empty-description="No statement periods have been created yet."
              row-key="id"
            >
              <template #cell-artist="{ row: period }">
                <strong>{{ period.artistName }}</strong>
              </template>
              <template #cell-month="{ row: period }">{{ formatPeriodMonth(period.periodMonth) }}</template>
              <template #cell-earnings="{ row: period }">{{ formatMoney(period.earnings) }}</template>
              <template #cell-uploads="{ row: period }">
                <span class="tabular-nums">{{ period.uploadCount }}</span>
              </template>
              <template #cell-status="{ row: period }">
                <StatusBadge :tone="period.status === 'closed' ? 'success' : 'warning'">
                  {{ period.status === "closed" ? "Closed" : "Open" }}
                </StatusBadge>
              </template>
            </LazyDataTable>
          </DataPanel>

          <DataPanel
            title="Artist readiness"
            eyebrow="Payout prep"
            description="These active artists still need setup work before finance operations are clean."
          >
            <LazyDataTable
              :columns="artistReadinessColumns"
              :data="artistReadiness"
              empty-title="All artists are ready"
              empty-description="All active artists currently have bank and publishing metadata saved."
              row-key="id"
            >
              <template #cell-artist="{ row: artist }">
                <strong>{{ artist.name }}</strong>
                <div class="detail-copy">{{ artist.email || "No email saved" }}</div>
              </template>
              <template #cell-country="{ row: artist }">
                <CountryFlag :name="artist.country" :label="artist.country || 'Country not set'" show-label />
              </template>
              <template #cell-bank="{ row: artist }">
                <StatusBadge :tone="artist.missingBankDetails ? 'warning' : 'success'">
                  {{ artist.missingBankDetails ? "Missing bank" : "Saved" }}
                </StatusBadge>
              </template>
              <template #cell-publishing="{ row: artist }">
                <StatusBadge :tone="artist.missingPublishingInfo ? 'warning' : 'success'">
                  {{ artist.missingPublishingInfo ? "Missing publishing" : "Saved" }}
                </StatusBadge>
              </template>
            </LazyDataTable>
          </DataPanel>
        </div>

        <DataPanel
          v-if="activeHomeSection === 'activity'"
          title="Recent admin activity"
          eyebrow="Audit trail"
          description="The most recent append-only actions across ingestion, catalog, payouts, and settings."
        >
          <LazyDataTable
            :columns="adminActivityColumns"
            :data="recentActivity"
            empty-title="No admin activity"
            empty-description="No admin activity has been logged yet."
            row-key="id"
          >
            <template #cell-action="{ row: entry }">
              <strong>{{ formatActionLabel(entry.action) }}</strong>
              <div class="detail-copy">{{ entry.entityId || "No entity id" }}</div>
            </template>
            <template #cell-admin="{ row: entry }">{{ entry.adminName || "Unknown admin" }}</template>
            <template #cell-entity="{ row: entry }">
              <Badge variant="muted">{{ entry.entityType }}</Badge>
            </template>
            <template #cell-time="{ row: entry }">{{ formatDateTime(entry.createdAt) }}</template>
          </LazyDataTable>
        </DataPanel>
      </template>
    </section>

    <!-- Upload details -->
    <FormDialog
      v-model:open="uploadDetailsOpen"
      :title="activeUpload ? activeUpload.filename : 'Upload'"
      :description="activeUpload ? activeUpload.artistName : ''"
      readonly
      content-class="max-w-xl"
    >
      <dl v-if="activeUpload" class="detail-list">
        <div class="detail-item">
          <dt>Status</dt>
          <dd><StatusBadge :tone="uploadStatusTone(activeUpload.status)">{{ uploadStatusLabel(activeUpload.status) }}</StatusBadge></dd>
        </div>
        <div class="detail-item">
          <dt>Period</dt>
          <dd>{{ formatPeriodMonth(activeUpload.periodMonth) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Rows / matched / unmatched</dt>
          <dd class="tabular-nums">{{ activeUpload.rowCount ?? 0 }} / {{ activeUpload.matchedCount ?? 0 }} / {{ activeUpload.unmatchedCount ?? 0 }}</dd>
        </div>
        <div class="detail-item">
          <dt>Amount</dt>
          <dd class="tabular-nums">{{ activeUpload.totalAmount ? formatMoney(activeUpload.totalAmount) : "Not parsed yet" }}</dd>
        </div>
        <div class="detail-item">
          <dt>Created</dt>
          <dd>{{ formatDateTime(activeUpload.createdAt) }}</dd>
        </div>
        <div v-if="activeUpload.errorMessage" class="detail-item detail-col-2">
          <dt>Error</dt>
          <dd>{{ activeUpload.errorMessage }}</dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="uploadDetailsOpen = false">Close</Button>
        <Button as-child>
          <NuxtLink to="/admin/ingestion">Open in ingestion</NuxtLink>
        </Button>
      </template>
    </FormDialog>

    <!-- Payout details -->
    <FormDialog
      v-model:open="payoutDetailsOpen"
      :title="activePayout ? `${activePayout.artistName} — ${formatMoney(activePayout.amount)}` : 'Payout request'"
      :description="activePayout ? `Requested ${formatDateTime(activePayout.createdAt)}` : ''"
      readonly
      content-class="max-w-xl"
    >
      <dl v-if="activePayout" class="detail-list">
        <div class="detail-item">
          <dt>Status</dt>
          <dd><StatusBadge :tone="payoutStatusTone(activePayout.status)">{{ payoutStatusLabel(activePayout.status) }}</StatusBadge></dd>
        </div>
        <div class="detail-item">
          <dt>Amount</dt>
          <dd class="tabular-nums">{{ formatMoney(activePayout.amount) }}</dd>
        </div>
        <div class="detail-item detail-col-2">
          <dt>Bank destination</dt>
          <dd>{{ activePayout.bankDetails ? `${activePayout.bankDetails.bankName} / ${activePayout.bankDetails.accountNumber}` : "Missing bank details" }}</dd>
        </div>
        <div class="detail-item">
          <dt>Payment method</dt>
          <dd>{{ activePayout.paymentMethod || "Not set" }}</dd>
        </div>
        <div class="detail-item">
          <dt>Payment reference</dt>
          <dd class="mono">{{ activePayout.paymentReference || "Not set" }}</dd>
        </div>
        <div class="detail-item">
          <dt>Reviewed</dt>
          <dd>{{ formatDateTime(activePayout.reviewedAt) }}</dd>
        </div>
        <div class="detail-item">
          <dt>Paid</dt>
          <dd>{{ formatDateTime(activePayout.paidAt) }}</dd>
        </div>
        <div v-if="activePayout.artistNotes" class="detail-item detail-col-2">
          <dt>Artist note</dt>
          <dd>{{ activePayout.artistNotes }}</dd>
        </div>
        <div v-if="activePayout.adminNotes" class="detail-item detail-col-2">
          <dt>Admin note</dt>
          <dd>{{ activePayout.adminNotes }}</dd>
        </div>
      </dl>

      <template #footer>
        <Button variant="ghost" @click="payoutDetailsOpen = false">Close</Button>
        <Button as-child>
          <NuxtLink to="/admin/payouts">Review in payouts</NuxtLink>
        </Button>
      </template>
    </FormDialog>
  </div>
</template>

<style scoped>
.admin-home {
  gap: 24px;
}

.admin-home :deep(.page-header) {
  padding-bottom: 8px;
}

.admin-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.admin-header-actions :deep(a) {
  min-width: 0;
}

.admin-control-bento {
  align-items: stretch;
  gap: 14px;
}

.asset-action-group {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.operations-monitor,
.command-dock {
  --admin-panel-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 99%, white 1%), color-mix(in srgb, var(--card) 94%, var(--muted) 6%)),
    var(--card);
  --admin-panel-border: color-mix(in srgb, var(--surface-border, var(--border)) 96%, var(--foreground) 6%);
  --admin-panel-shadow: var(--surface-card-shadow-current, var(--surface-card-shadow, var(--shadow-card)));
  position: relative;
  overflow: hidden;
  height: 100%;
  border-color: var(--admin-panel-border);
  background: var(--admin-panel-bg);
  box-shadow: var(--admin-panel-shadow);
}

:global(.dark .operations-monitor),
:global(.dark .command-dock) {
  --admin-panel-bg:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--foreground) 3%), var(--card)),
    var(--card);
  --admin-panel-border: color-mix(in srgb, var(--surface-border, var(--border)) 92%, var(--foreground) 8%);
  background: var(--admin-panel-bg);
  box-shadow: var(--admin-panel-shadow);
}

.operations-monitor::before,
.command-dock::before {
  position: absolute;
  inset: 0 var(--surface-glint-inset, 22px) auto;
  z-index: 0;
  height: 1px;
  background: var(--surface-glint-line);
  content: "";
  opacity: var(--surface-glint-opacity, 0.46);
  pointer-events: none;
}

.operations-monitor {
  display: grid;
  gap: 20px;
  min-height: 340px;
  padding: 22px;
}

.operations-monitor-header,
.command-dock-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.operations-monitor-title,
.command-dock-header > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.operations-monitor-title h2,
.command-dock-header h3 {
  margin: 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: 19px;
  font-weight: 720;
  line-height: 1.2;
  letter-spacing: 0;
}

.operations-monitor-title p,
.command-dock-header p {
  margin: 0;
  max-width: 640px;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}

.operations-signal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.operations-signal {
  --signal-color: var(--primary);
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 68px;
  gap: 12px;
  align-items: center;
  min-height: 104px;
  border-color: color-mix(in srgb, var(--signal-color) 14%, var(--surface-border, var(--border)));
  border-radius: var(--surface-radius-control, 12px);
  padding: 14px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, white 2%), color-mix(in srgb, var(--muted) 17%, var(--card))),
    var(--card);
  box-shadow: var(--surface-depth-edge, var(--surface-control-shadow, none));
}

:global(.dark .operations-signal) {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--card) 94%, var(--foreground) 3%), color-mix(in srgb, var(--muted) 18%, var(--card))),
    var(--card);
  box-shadow: var(--surface-depth-edge, var(--surface-control-shadow, none));
}

.operations-signal[data-glint="slab"] {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 84%, var(--foreground) 6%);
  background:
    radial-gradient(120% 120% at 16% 0%, color-mix(in srgb, white 54%, transparent), transparent 44%),
    linear-gradient(145deg, color-mix(in srgb, var(--card) 96%, white 4%), color-mix(in srgb, var(--surface-muted, var(--muted)) 42%, var(--card)));
  box-shadow: var(--surface-depth-slab);
}

:global(.dark .operations-signal[data-glint="slab"]) {
  border-color: rgb(244 238 223 / 16%);
  background:
    radial-gradient(120% 120% at 16% 0%, rgb(254 249 231 / 7%), transparent 44%),
    linear-gradient(145deg, rgb(40 37 32 / 92%), rgb(18 17 15 / 94%));
  box-shadow: var(--surface-depth-slab);
}

.operations-signal-success {
  --signal-color: var(--status-success);
}

.operations-signal-warning {
  --signal-color: var(--status-warning);
}

.operations-signal-danger {
  --signal-color: var(--destructive);
}

.operations-signal-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: var(--surface-radius-compact, 10px);
  border: 1px solid color-mix(in srgb, var(--signal-color) 20%, transparent);
  background: color-mix(in srgb, var(--signal-color) 10%, transparent);
  color: var(--signal-color);
}

.operations-signal-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.operations-signal-copy span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0;
  line-height: 1.3;
  text-transform: uppercase;
}

.operations-signal-copy strong {
  overflow: visible;
  color: var(--foreground);
  font-size: 22px;
  font-weight: 750;
  line-height: 1.1;
  overflow-wrap: normal;
  text-overflow: clip;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.operations-signal-copy small {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: normal;
}

.operations-sparkline {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 3px;
  height: 42px;
}

.operations-sparkline span {
  width: 6px;
  min-height: 7px;
  border-radius: 999px;
  background: var(--signal-color);
  opacity: 0.72;
  transform-origin: bottom;
  animation: bar-grow 360ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.operations-sparkline span:nth-child(1) { animation-delay: 100ms; }
.operations-sparkline span:nth-child(2) { animation-delay: 180ms; }
.operations-sparkline span:nth-child(3) { animation-delay: 260ms; }
.operations-sparkline span:nth-child(4) { animation-delay: 340ms; }

.command-dock {
  display: grid;
  gap: 16px;
  min-height: 284px;
  padding: 22px;
}

.command-dock-mark {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  color: var(--muted-foreground);
  opacity: 0.7;
}

.command-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.admin-workspace {
  display: grid;
  gap: 18px;
  padding-top: 2px;
}

.admin-workspace-header {
  display: grid;
  gap: 4px;
  max-width: 720px;
}

.admin-table-note {
  margin-top: 3px;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.5;
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

@media (max-width: 560px) {
  .detail-list {
    grid-template-columns: 1fr;
  }
}

.admin-mobile-row {
  display: grid;
  gap: 14px;
  padding: 18px;
  border-bottom: 1px solid var(--border);
}

.admin-mobile-row:last-child {
  border-bottom: 0;
}

@media (max-width: 760px) {
  .admin-header-actions {
    justify-content: stretch;
    width: 100%;
  }

  .admin-header-actions :deep(a) {
    flex: 1 1 136px;
  }

  .operations-monitor,
  .command-dock {
    padding: 20px;
  }

  .operations-monitor-header,
  .command-dock-header {
    flex-direction: column;
  }

  .operations-signal-grid,
  .command-action-grid {
    grid-template-columns: 1fr;
  }

  .operations-signal {
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: flex-start;
    row-gap: 12px;
  }

  .operations-signal-copy strong,
  .operations-signal-copy small {
    white-space: normal;
  }

  .operations-sparkline {
    grid-column: 1 / -1;
    justify-content: flex-start;
    height: 30px;
  }
}
</style>
