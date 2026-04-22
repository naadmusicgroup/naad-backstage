<script setup lang="ts">
import type { AdminDashboardResponse } from "~~/types/admin"
import type { CsvUploadStatus } from "~~/types/imports"
import type { PayoutRequestStatus } from "~~/types/payouts"

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
})

const recentUploads = computed(() => data.value?.recentUploads ?? [])
const payoutQueue = computed(() => data.value?.payoutQueue ?? [])
const recentStatementPeriods = computed(() => data.value?.recentStatementPeriods ?? [])
const artistReadiness = computed(() => data.value?.artistReadiness ?? [])
const recentActivity = computed(() => data.value?.recentActivity ?? [])

const summaryMetrics = computed(() => [
  {
    label: "Active artists",
    value: String(summary.value.activeArtistCount),
    footnote: `${summary.value.activeReleaseCount} releases / ${summary.value.activeTrackCount} tracks live in catalog.`,
    tone: "accent" as const,
  },
  {
    label: "Uploads completed",
    value: String(summary.value.completedUploadCount),
    footnote: `${summary.value.awaitingCommitUploadCount} awaiting commit, ${summary.value.failedUploadCount} failed or abandoned.`,
    tone: "default" as const,
  },
  {
    label: "Pending payouts",
    value: String(summary.value.pendingPayoutCount),
    footnote: `${formatMoney(summary.value.pendingPayoutAmount)} awaiting review.`,
    tone: "alt" as const,
  },
  {
    label: "Approved to pay",
    value: String(summary.value.approvedPayoutCount),
    footnote: `${formatMoney(summary.value.approvedPayoutAmount)} still needs transfer confirmation.`,
    tone: "default" as const,
  },
  {
    label: "Statement locks",
    value: String(summary.value.closedStatementCount),
    footnote: `${summary.value.openStatementCount} statement periods remain open.`,
    tone: "default" as const,
  },
  {
    label: "Artist readiness gaps",
    value: String(summary.value.artistsMissingBankDetailsCount + summary.value.artistsMissingPublishingInfoCount),
    footnote: `${summary.value.artistsMissingBankDetailsCount} missing bank details, ${summary.value.artistsMissingPublishingInfoCount} missing publishing info.`,
    tone: "default" as const,
  },
])

const quickActions = [
  {
    label: "Run ingestion",
    to: "/admin/ingestion",
    description: "Upload, preview, commit, or reverse royalty CSVs.",
  },
  {
    label: "Manage artists",
    to: "/admin/artists",
    description: "Create artist accounts and review payout readiness.",
  },
  {
    label: "Open access queue",
    to: "/admin/artists?section=access",
    description: "Manage artist and admin Gmail invite history inside the Artists workspace.",
  },
  {
    label: "Manage releases",
    to: "/admin/releases",
    description: "Maintain catalog, media links, and collaborator metadata.",
  },
  {
    label: "Review payouts",
    to: "/admin/payouts",
    description: "Approve, reject, or mark transfers as paid.",
  },
  {
    label: "Open settings",
    to: "/admin/settings",
      description: "Restore orphaned access, archived records, and manage statement locks.",
  },
]

function formatMoney(value: string) {
  return `$${Number(value ?? 0).toFixed(2)}`
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

function uploadStatusClass(status: CsvUploadStatus) {
  switch (status) {
    case "processing":
      return "status-processing"
    case "completed":
      return "status-completed"
    case "failed":
    case "abandoned":
      return "status-failed"
    case "reversed":
      return "status-reversed"
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

function payoutStatusClass(status: PayoutRequestStatus) {
  switch (status) {
    case "pending":
      return "status-processing"
    case "approved":
      return "status-reversed"
    case "rejected":
      return "status-failed"
    case "paid":
      return "status-completed"
  }
}
</script>

<template>
  <div class="page">
    <div class="metrics">
      <MetricCard
        v-for="metric in summaryMetrics"
        :key="metric.label"
        :label="metric.label"
        :value="metric.value"
        :footnote="metric.footnote"
        :tone="metric.tone"
      />
    </div>

    <SectionCard
      title="Admin panel"
      eyebrow="Operations overview"
      description="This home view surfaces the queues that need human action first: ingestion exceptions, payout approvals, statement locks, and artist readiness issues."
    >
      <div v-if="error" class="form-grid">
        <div class="banner error">{{ error.statusMessage || "Unable to load the admin dashboard right now." }}</div>
        <div class="button-row">
          <button class="button button-secondary" @click="() => refresh()">Retry</button>
        </div>
      </div>

      <div v-else-if="pending && !data" class="status-message">Loading admin dashboard...</div>

      <template v-else>
        <div class="panel-grid">
          <SectionCard
            title="Quick actions"
            eyebrow="Workflow"
            description="Jump straight into the operating area that resolves the current queue."
          >
            <div class="catalog-list">
              <article v-for="action in quickActions" :key="action.to" class="catalog-item catalog-item-compact">
                <div class="summary-copy">
                  <strong>{{ action.label }}</strong>
                  <span class="detail-copy">{{ action.description }}</span>
                </div>
                <div class="button-row">
                  <NuxtLink :to="action.to" class="button button-secondary">Open</NuxtLink>
                </div>
              </article>
            </div>
          </SectionCard>

          <SectionCard
            title="Attention now"
            eyebrow="Triage"
            description="These counts are the fastest read on whether today’s back office queue is clean."
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
          </SectionCard>
        </div>

        <div class="panel-grid">
          <SectionCard
            title="Recent upload queue"
            eyebrow="Ingestion"
            description="Recent CSV activity across artists. Failed and in-flight uploads should be resolved before the next statement cycle."
          >
            <div v-if="recentUploads.length" class="catalog-list">
              <article v-for="upload in recentUploads" :key="upload.id" class="catalog-item">
                <div class="catalog-header">
                  <div class="summary-copy">
                    <strong>{{ upload.artistName }}</strong>
                    <span class="detail-copy">{{ upload.filename }}</span>
                    <span class="detail-copy">{{ formatPeriodMonth(upload.periodMonth) }} / {{ formatDateTime(upload.createdAt) }}</span>
                  </div>
                  <span class="status-pill" :class="uploadStatusClass(upload.status)">{{ uploadStatusLabel(upload.status) }}</span>
                </div>

                <div class="summary-table">
                  <div class="summary-row">
                    <span class="detail-copy">Matched rows</span>
                    <strong>{{ upload.matchedCount ?? 0 }}</strong>
                  </div>
                  <div class="summary-row">
                    <span class="detail-copy">Unmatched rows</span>
                    <strong>{{ upload.unmatchedCount ?? 0 }}</strong>
                  </div>
                  <div class="summary-row">
                    <span class="detail-copy">Total amount</span>
                    <strong>{{ upload.totalAmount ? formatMoney(upload.totalAmount) : "Not parsed yet" }}</strong>
                  </div>
                  <div v-if="upload.errorMessage" class="summary-row">
                    <span class="detail-copy">Error</span>
                    <strong>{{ upload.errorMessage }}</strong>
                  </div>
                </div>
              </article>
            </div>

            <p v-else class="muted-copy">
              No uploads have been created yet.
            </p>
          </SectionCard>

          <SectionCard
            title="Payout queue"
            eyebrow="Cash movement"
            description="Pending requests need review. Approved requests are waiting for external payment and confirmation."
          >
            <div v-if="payoutQueue.length" class="catalog-list">
              <article v-for="request in payoutQueue" :key="request.id" class="catalog-item">
                <div class="catalog-header">
                  <div class="summary-copy">
                    <strong>{{ request.artistName }}</strong>
                    <span class="detail-copy">{{ formatMoney(request.amount) }} / requested {{ formatDateTime(request.createdAt) }}</span>
                  </div>
                  <span class="status-pill" :class="payoutStatusClass(request.status)">{{ payoutStatusLabel(request.status) }}</span>
                </div>

                <div class="summary-table">
                  <div class="summary-row">
                    <span class="detail-copy">Bank destination</span>
                    <strong>{{ request.bankDetails ? `${request.bankDetails.bankName} / ${request.bankDetails.accountNumber}` : "Missing bank details" }}</strong>
                  </div>
                  <div class="summary-row">
                    <span class="detail-copy">Artist note</span>
                    <strong>{{ request.artistNotes || "No note" }}</strong>
                  </div>
                  <div class="summary-row" v-if="request.adminNotes">
                    <span class="detail-copy">Admin note</span>
                    <strong>{{ request.adminNotes }}</strong>
                  </div>
                </div>
              </article>
            </div>

            <p v-else class="muted-copy">
              No pending or approved payouts need attention right now.
            </p>
          </SectionCard>
        </div>

        <div class="panel-grid">
          <SectionCard
            title="Recent statement periods"
            eyebrow="Lock status"
            description="Use this to see which months are still open and which ones are already locked against further CSV commits."
          >
            <div v-if="recentStatementPeriods.length" class="summary-table">
              <div v-for="period in recentStatementPeriods" :key="period.id" class="summary-row">
                <div class="summary-copy">
                  <strong>{{ period.artistName }}</strong>
                  <span class="detail-copy">{{ formatPeriodMonth(period.periodMonth) }} / {{ formatMoney(period.earnings) }}</span>
                  <span class="detail-copy">{{ period.uploadCount }} upload{{ period.uploadCount === 1 ? "" : "s" }}</span>
                </div>
                <span class="status-pill" :class="period.status === 'closed' ? 'status-completed' : 'status-processing'">
                  {{ period.status === "closed" ? "Closed" : "Open" }}
                </span>
              </div>
            </div>

            <p v-else class="muted-copy">
              No statement periods have been created yet.
            </p>
          </SectionCard>

          <SectionCard
            title="Artist readiness"
            eyebrow="Payout prep"
            description="These active artists still need setup work before finance operations are clean."
          >
            <div v-if="artistReadiness.length" class="summary-table">
              <div v-for="artist in artistReadiness" :key="artist.id" class="summary-row">
                <div class="summary-copy">
                  <strong>{{ artist.name }}</strong>
                  <span class="detail-copy">{{ artist.email || "No email saved" }}</span>
                  <span class="detail-copy">{{ artist.country || "Country not set" }}</span>
                </div>
                <div class="badge-row">
                  <span v-if="artist.missingBankDetails" class="pill pill-muted">Missing bank</span>
                  <span v-if="artist.missingPublishingInfo" class="pill pill-muted">Missing publishing</span>
                </div>
              </div>
            </div>

            <p v-else class="muted-copy">
              All active artists currently have bank and publishing metadata saved.
            </p>
          </SectionCard>
        </div>

        <SectionCard
          title="Recent admin activity"
          eyebrow="Audit trail"
          description="The most recent append-only actions across ingestion, catalog, payouts, and settings."
        >
          <div v-if="recentActivity.length" class="summary-table">
            <div v-for="entry in recentActivity" :key="entry.id" class="summary-row">
              <div class="summary-copy">
                <strong>{{ formatActionLabel(entry.action) }}</strong>
                <span class="detail-copy">{{ entry.adminName || "Unknown admin" }} / {{ formatDateTime(entry.createdAt) }}</span>
                <span class="detail-copy">{{ entry.entityType }} / {{ entry.entityId || "No entity id" }}</span>
              </div>
              <span class="pill pill-muted">{{ entry.entityType }}</span>
            </div>
          </div>

          <p v-else class="muted-copy">
            No admin activity has been logged yet.
          </p>
        </SectionCard>
      </template>
    </SectionCard>
  </div>
</template>
