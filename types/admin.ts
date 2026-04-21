import type { CsvUploadStatus } from "~~/types/imports"
import type { PayoutRequestRecord } from "~~/types/payouts"
import type { AdminActivityLogRecord } from "~~/types/settings"

export interface AdminDashboardSummary {
  activeArtistCount: number
  activeReleaseCount: number
  activeTrackCount: number
  completedUploadCount: number
  awaitingCommitUploadCount: number
  failedUploadCount: number
  pendingPayoutCount: number
  pendingPayoutAmount: string
  approvedPayoutCount: number
  approvedPayoutAmount: string
  openStatementCount: number
  closedStatementCount: number
  artistsMissingBankDetailsCount: number
  artistsMissingPublishingInfoCount: number
}

export interface AdminDashboardUploadItem {
  id: string
  artistId: string
  artistName: string
  filename: string
  status: CsvUploadStatus
  rowCount: number | null
  matchedCount: number | null
  unmatchedCount: number | null
  totalAmount: string | null
  periodMonth: string
  errorMessage: string | null
  createdAt: string
}

export interface AdminDashboardStatementItem {
  id: string
  artistId: string
  artistName: string
  periodMonth: string
  status: "open" | "closed"
  closedAt: string | null
  earnings: string
  uploadCount: number
}

export interface AdminDashboardArtistReadinessItem {
  id: string
  name: string
  email: string | null
  country: string | null
  missingBankDetails: boolean
  missingPublishingInfo: boolean
}

export interface AdminDashboardResponse {
  summary: AdminDashboardSummary
  recentUploads: AdminDashboardUploadItem[]
  payoutQueue: PayoutRequestRecord[]
  recentStatementPeriods: AdminDashboardStatementItem[]
  artistReadiness: AdminDashboardArtistReadinessItem[]
  recentActivity: AdminActivityLogRecord[]
}
