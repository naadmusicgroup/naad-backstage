import type { CsvUploadStatus } from "~~/types/imports"
import type { PayoutRequestRecord } from "~~/types/payouts"
import type { AdminActivityLogRecord } from "~~/types/settings"
import type { ArtistReleaseSubmissionStatus, ReleaseDisplayStatus, ReleaseType } from "~~/types/catalog"

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
  pendingReleaseSubmissionCount: number
}

export interface AdminDashboardPendingReleaseTrack {
  id: string
  trackId: string
  title: string
  isrc: string
  trackNumber: number | null
  sourceAudioUrl: string
  finalAudioUrl: string | null
  credits: string[]
}

export interface AdminDashboardPendingReleaseItem {
  id: string
  releaseId: string
  artistId: string
  artistName: string
  artistEmail: string | null
  title: string
  type: ReleaseType
  genre: string
  releaseDate: string | null
  status: ArtistReleaseSubmissionStatus
  displayStatus: ReleaseDisplayStatus
  sourceCoverArtUrl: string
  finalCoverArtUrl: string | null
  targetStores: string[]
  artistNotes: string | null
  adminNotes: string | null
  submittedAt: string
  tracks: AdminDashboardPendingReleaseTrack[]
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
  pendingReleases: AdminDashboardPendingReleaseItem[]
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
  logoKey?: string | null
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
  logoKey?: string | null
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

export interface AdminAnalyticsGeoCountry {
  countryCode: string | null
  countryName: string
  revenue: string
  streams: number
  share: number
}

export interface AdminAnalyticsPlatformBreakdownRow {
  channelId: string | null
  channelName: string
  logoKey: string | null
  revenue: string
  streams: number
  share: number
}

export interface AdminAnalyticsMonthlyRevenueRow {
  periodMonth: string
  revenue: string
  streams: number
}

export interface AdminAnalyticsPlatformTimelineRow {
  periodMonth: string
  channelId: string | null
  channelName: string
  logoKey: string | null
  revenue: string
  streams: number
}

export interface AdminAnalyticsRevenueRow {
  artistId: string
  artistName: string
  periodMonth: string
  channelId: string | null
  channelName: string
  logoKey: string | null
  countryCode: string | null
  countryName: string
  releaseId: string | null
  releaseTitle: string | null
  releaseCoverArtUrl: string | null
  releaseCoverThumbUrl: string | null
  trackId: string | null
  trackTitle: string | null
  trackIsrc: string | null
  uploadId: string | null
  uploadFilename: string | null
  revenue: string
  streams: number
  rowCount: number
}

export interface AdminAnalyticsArtistLeaderboardRow {
  artistId: string
  artistName: string
  revenue: string
  streams: number
  countryCount: number
}

export interface AdminAnalyticsFinancialArtistRow {
  artistId: string
  artistName: string
  totalEarned: string
  totalDues: string
  artistDues: string
  payoutServiceFees: string
  pendingPayouts: string
  approvedPayouts: string
  totalWithdrawn: string
  availableBalance: string
}

export interface AdminAnalyticsFinancialSummary {
  lifetimeEarnings: string
  totalDues: string
  artistDues: string
  payoutServiceFees: string
  pendingPayouts: string
  approvedPayouts: string
  totalPayouts: string
  availableBalance: string
  artistCount: number
  payableArtistCount: number
}

export interface AdminAnalyticsResponse {
  geoCountries: AdminAnalyticsGeoCountry[]
  platformBreakdown: AdminAnalyticsPlatformBreakdownRow[]
  platformTimeline: AdminAnalyticsPlatformTimelineRow[]
  monthlyRevenue: AdminAnalyticsMonthlyRevenueRow[]
  artistLeaderboard: AdminAnalyticsArtistLeaderboardRow[]
  revenueRows: AdminAnalyticsRevenueRow[]
  financialSummary: AdminAnalyticsFinancialSummary
  financialArtists: AdminAnalyticsFinancialArtistRow[]
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

export type AdminDueStatus = "pending_acceptance" | "unpaid" | "paid" | "cancelled"

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
  acceptedAt: string | null
  acceptedBy: string | null
  acceptedByName: string | null
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
  pendingAcceptanceCount: number
  unpaidCount: number
  paidCount: number
  cancelledCount: number
  pendingAcceptanceAmount: string
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
