<script setup lang="ts">
import { Activity, AlertTriangle, CheckCircle2, FileClock, LockKeyhole, MoreHorizontal, UploadCloud, Users } from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import PremiumPayoutIcon from "~/components/icons/PremiumPayoutIcon.vue"
import PremiumReleaseIcon from "~/components/icons/PremiumReleaseIcon.vue"
import PremiumSettingsIcon from "~/components/icons/PremiumSettingsIcon.vue"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { AdminDashboardResponse } from "~~/types/admin"
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
]

const payoutQueueColumns = [
  { key: "artist", label: "Artist", accessor: (row: any) => row.artistName },
  { key: "amount", label: "Amount", align: "right" as const, accessor: (row: any) => Number(row.amount || 0) },
  { key: "bank", label: "Bank destination", accessor: (row: any) => row.bankDetails?.bankName || "" },
  { key: "note", label: "Artist note", accessor: (row: any) => row.artistNotes || "" },
  { key: "status", label: "Status", accessor: (row: any) => row.status },
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
  <div class="page">
    <DashboardBento class="admin-control-bento">
      <div class="bento-cell bento-span-7">
        <Card class="operations-monitor">
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

          <div class="operations-signal-grid stagger-enter">
            <Card
              v-for="signal in operationsSignals"
              :key="signal.label"
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
        <Card class="command-dock">
          <div class="command-dock-header">
            <div>
              <p class="eyebrow">Command dock</p>
              <h3>Move through the work</h3>
              <p>Fast routes into the queues that usually decide whether statements and payouts stay clean.</p>
            </div>
            <Activity class="command-dock-mark" />
          </div>

          <div class="command-action-grid stagger-enter">
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
        <p class="eyebrow">Operations overview</p>
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

      <DashboardSkeleton v-else-if="pending && !data" :rows="4" />

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
            </LazyDataTable>
          </DataPanel>

          <DataPanel
            title="Payout queue"
            eyebrow="Cash movement"
            description="Pending requests need review. Approved requests are waiting for external payment and confirmation."
          >
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
            </LazyDataTable>
          </DataPanel>
        </div>

        <div v-if="activeHomeSection === 'pending-releases'" class="panel-grid panel-grid-single">
          <DataPanel
            title="Pending Releases"
            eyebrow="Artist submissions"
            description="Review artist-submitted release packages before adding final delivery links and scheduling them."
          >
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
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" aria-label="Release actions">
                      <MoreHorizontal class="size-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-40">
                    <DropdownMenuItem v-if="release.sourceCoverArtUrl" as-child>
                      <a :href="release.sourceCoverArtUrl" target="_blank" rel="noopener noreferrer">Open cover</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem as-child>
                      <NuxtLink :to="`/admin/releases?release=${release.releaseId}`">Review</NuxtLink>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
  </div>
</template>

<style scoped>
.admin-control-bento {
  align-items: stretch;
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
  height: 100%;
  border-color: var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

:global(.dark .operations-monitor),
:global(.dark .command-dock) {
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

.operations-monitor {
  display: grid;
  gap: 24px;
  min-height: 340px;
  padding: 24px;
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
  font-size: 20px;
  font-weight: 700;
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
  gap: 14px;
}

.operations-signal {
  --signal-color: var(--primary);
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) 74px;
  gap: 14px;
  align-items: center;
  min-height: 112px;
  border-color: color-mix(in srgb, var(--signal-color) 18%, var(--border));
  padding: 16px;
  background: color-mix(in srgb, var(--signal-color) 4%, var(--card));
  box-shadow: none;
}

:global(.dark .operations-signal) {
  background: color-mix(in srgb, var(--signal-color) 4%, var(--card));
  box-shadow: none;
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
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--signal-color) 13%, transparent);
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
  letter-spacing: 0.08em;
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
  gap: 4px;
  height: 48px;
}

.operations-sparkline span {
  width: 8px;
  min-height: 8px;
  border-radius: 999px;
  background: var(--signal-color);
  opacity: 0.72;
  transform-origin: bottom;
  animation: bar-grow 480ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.operations-sparkline span:nth-child(1) { animation-delay: 100ms; }
.operations-sparkline span:nth-child(2) { animation-delay: 180ms; }
.operations-sparkline span:nth-child(3) { animation-delay: 260ms; }
.operations-sparkline span:nth-child(4) { animation-delay: 340ms; }

.command-dock {
  display: grid;
  gap: 18px;
  min-height: 300px;
  padding: 24px;
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
  gap: 12px;
}

.admin-workspace {
  display: grid;
  gap: 20px;
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
