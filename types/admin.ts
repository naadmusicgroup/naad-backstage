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

export type EarningType = "original" | "adjustment" | "reversal"

export interface AdminEarningsLedgerRow {
  id: string
  artistId: string
  artistName: string
  releaseId: string
  releaseTitle: string
  trackId: string
  trackTitle: string
  trackIsrc: string | null
  channelId: string
  channelName: string
  uploadId: string
  uploadFilename: string | null
  saleDate: string
  accountingDate: string
  reportingDate: string | null
  periodMonth: string | null
  territory: string | null
  units: number
  unitPrice: string
  originalCurrency: string | null
  totalAmount: string
  earningType: EarningType
  createdAt: string
}

export interface AdminEarningsLedgerSummary {
  rowCount: number
  totalRevenue: string
  totalUnits: number
  artistCount: number
  releaseCount: number
  trackCount: number
  channelCount: number
  territoryCount: number
}

export interface AdminEarningsLedgerFilterOption {
  value: string
  label: string
  meta?: string | null
}

export interface AdminEarningsLedgerFilterOptions {
  artists: AdminEarningsLedgerFilterOption[]
  releases: AdminEarningsLedgerFilterOption[]
  tracks: AdminEarningsLedgerFilterOption[]
  channels: AdminEarningsLedgerFilterOption[]
  territories: AdminEarningsLedgerFilterOption[]
  periodMonths: AdminEarningsLedgerFilterOption[]
  earningTypes: AdminEarningsLedgerFilterOption[]
}

export interface AdminEarningsLedgerPagination {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export interface AdminEarningsLedgerResponse {
  rows: AdminEarningsLedgerRow[]
  summary: AdminEarningsLedgerSummary
  filterOptions: AdminEarningsLedgerFilterOptions
  pagination: AdminEarningsLedgerPagination
}

export interface AdminPublishingOption {
  value: string
  label: string
  meta?: string | null
}

export interface AdminPublishingRecord {
  id: string
  artistId: string
  artistName: string
  releaseId: string | null
  releaseTitle: string | null
  amount: string
  periodMonth: string
  notes: string | null
  enteredBy: string
  enteredByName: string | null
  ledgerEntryId: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminPublishingSummary {
  entryCount: number
  totalAmount: string
  artistCount: number
  releaseCount: number
  periodCount: number
}

export interface AdminPublishingResponse {
  entries: AdminPublishingRecord[]
  summary: AdminPublishingSummary
  artistOptions: AdminPublishingOption[]
  releaseOptions: AdminPublishingOption[]
}

export interface AdminPublishingMutationInput {
  artistId: string
  releaseId: string | null
  amount: string | number
  periodMonth: string
  notes: string | null
}

export interface AdminPublishingUpdateInput {
  releaseId: string | null
  amount: string | number
  periodMonth: string
  notes: string | null
}

export interface AdminPublishingMutationResponse {
  entryId: string
  ledgerEntryId: string | null
  resultingBalance: string | null
}

export type AdminAnalyticsPlatform = "spotify" | "apple_music" | "tiktok" | "meta" | "youtube"
export type AdminAnalyticsMetricType = "monthly_listeners" | "streams" | "views" | "impressions" | "video_creations"

export interface AdminAnalyticsOption {
  value: string
  label: string
  meta?: string | null
}

export interface AdminAnalyticsMetricOption {
  platform: AdminAnalyticsPlatform
  metricType: AdminAnalyticsMetricType
  label: string
}

export interface AdminAnalyticsRecord {
  id: string
  artistId: string
  artistName: string
  releaseId: string | null
  releaseTitle: string | null
  platform: AdminAnalyticsPlatform
  metricType: AdminAnalyticsMetricType
  label: string
  value: string
  periodMonth: string
  enteredBy: string
  enteredByName: string | null
  uploadId: string | null
  uploadFilename: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminAnalyticsSummary {
  entryCount: number
  manualEntryCount: number
  uploadLinkedEntryCount: number
  totalValue: string
  artistCount: number
  releaseCount: number
  periodCount: number
}

export interface AdminAnalyticsResponse {
  entries: AdminAnalyticsRecord[]
  summary: AdminAnalyticsSummary
  artistOptions: AdminAnalyticsOption[]
  releaseOptions: AdminAnalyticsOption[]
  metricOptions: AdminAnalyticsMetricOption[]
}

export interface AdminAnalyticsMutationInput {
  artistId: string
  releaseId: string | null
  platform: AdminAnalyticsPlatform
  metricType: AdminAnalyticsMetricType
  value: string | number
  periodMonth: string
}

export interface AdminAnalyticsUpdateInput {
  releaseId: string | null
  platform: AdminAnalyticsPlatform
  metricType: AdminAnalyticsMetricType
  value: string | number
  periodMonth: string
}

export interface AdminAnalyticsMutationResponse {
  entryId: string
}

export type AdminDueStatus = "unpaid" | "paid" | "cancelled"

export interface AdminDueOption {
  value: string
  label: string
}

export interface AdminDueRecord {
  id: string
  artistId: string
  artistName: string
  title: string
  amount: string
  frequency: "one_time"
  status: AdminDueStatus
  dueDate: string | null
  paidAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  cancelledByName: string | null
  ledgerEntryId: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminDuesSummary {
  dueCount: number
  unpaidCount: number
  paidCount: number
  cancelledCount: number
  activeAmount: string
  unpaidAmount: string
  paidAmount: string
  cancelledAmount: string
  artistCount: number
}

export interface AdminDuesResponse {
  dues: AdminDueRecord[]
  summary: AdminDuesSummary
  artistOptions: AdminDueOption[]
}

export interface AdminDueMutationInput {
  artistId: string
  title: string
  amount: string | number
  dueDate: string | null
}

export interface AdminDueUpdateInput {
  title: string
  amount: string | number
  dueDate: string | null
}

export interface AdminDueMutationResponse {
  dueId: string
  status: AdminDueStatus
  ledgerEntryId: string | null
  resultingBalance: string | null
}
