import type { RouteLocationRaw } from "vue-router"
import type {
  ReleaseChangeRequestStatus,
  ReleaseChangeRequestType,
  ReleaseDisplayStatus,
  ReleaseEventType,
  ReleaseStatus,
  ReleaseType,
  TrackStatus,
} from "~~/types/catalog"

export interface ArtistActivityItem {
  id: string
  label: string
  description: string
  amount: string
  createdAt: string
}

export type ArtistWalletStatementCategory = "balance" | "dues" | "payouts" | "adjustments"

export interface ArtistWalletStatementSummary {
  year: number | null
  openingBalance: string
  closingBalance: string
  from: string
  to: string
  transactionCount: number
}

export interface ArtistWalletStatementTransaction {
  id: string
  artistId: string
  artistName: string
  category: ArtistWalletStatementCategory
  ledgerType: string
  label: string
  description: string
  amount: string
  balanceAfter: string
  status: string | null
  referenceId: string
  createdAt: string
}

export type ArtistDueStatus = "pending_acceptance" | "unpaid" | "paid" | "cancelled"

export interface ArtistDueItem {
  id: string
  artistId: string
  artistName: string
  title: string
  amount: string
  status: ArtistDueStatus
  dueDate: string | null
  acceptedAt: string | null
  acceptedBy: string | null
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
}

export interface ArtistDueMutationResponse {
  dueId: string
  status: ArtistDueStatus
  ledgerEntryId: string | null
  resultingBalance: string | null
}

export interface ArtistWalletResponse {
  totalEarned: string
  availableBalance: string
  visibleBalance: string
  totalDues: string
  reservedPayouts: string
  pendingPayouts: string
  approvedPayouts: string
  totalWithdrawn: string
  balanceSettling: boolean
  recentTransactions: ArtistActivityItem[]
  statementYears?: number[]
  statementSummary?: ArtistWalletStatementSummary
  statementTransactions?: ArtistWalletStatementTransaction[]
  dues: ArtistDueItem[]
}

export interface ArtistStatementSummary {
  periodMonth: string
  status: "open" | "closed"
  closedAt: string | null
  earnings: string
  publishing: string
  streams: number
  rowCount: number
  channelCount: number
  territoryCount: number
  releaseCount: number
}

export interface ArtistStatementFilterOption {
  value: string
  label: string
  logoKey?: string | null
}

export interface ArtistStatementEarningsBreakdownRow {
  id: string
  periodMonth: string
  artistId: string
  artistName: string
  releaseId: string | null
  releaseTitle: string | null
  trackId: string | null
  trackTitle: string | null
  trackIsrc: string | null
  channelId: string | null
  channelName: string
  logoKey?: string | null
  territory: string | null
  earnings: string
  units: number
  rowCount: number
}

export interface ArtistStatementPublishingBreakdownRow {
  id: string
  periodMonth: string
  artistId: string
  artistName: string
  releaseId: string | null
  releaseTitle: string | null
  amount: string
  notes: string | null
}

export interface ArtistStatementsResponse {
  defaultPeriodMonth: string | null
  statements: ArtistStatementSummary[]
  earningsBreakdownRows: ArtistStatementEarningsBreakdownRow[]
  publishingBreakdownRows: ArtistStatementPublishingBreakdownRow[]
  filterOptions: {
    periodMonths: ArtistStatementFilterOption[]
    releases: ArtistStatementFilterOption[]
    territories: ArtistStatementFilterOption[]
    channels: ArtistStatementFilterOption[]
  }
}

export interface ArtistStatementEarningsSummary {
  totalRevenue: string
  totalUnits: number
  processedRowCount: number
  groupedRowCount: number
}

export interface ArtistStatementEarningsPagination {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasPreviousPage: boolean
  hasNextPage: boolean
}

export interface ArtistStatementEarningsResponse {
  rows: ArtistStatementEarningsBreakdownRow[]
  summary: ArtistStatementEarningsSummary
  filterOptions: {
    releases: ArtistStatementFilterOption[]
    territories: ArtistStatementFilterOption[]
    channels: ArtistStatementFilterOption[]
  }
  pagination: ArtistStatementEarningsPagination
}

export interface ArtistReleaseContributor {
  artistId: string
  name: string
  role: string
  visibleSplitPct: string | null
}

export interface ArtistVisibleSplitHistoryItem {
  scope: "release" | "track"
  role: string
  splitPct: string
  effectivePeriodMonth: string
  changedAt: string
  changeReason: string | null
}

export interface ArtistTrackCreditRecord {
  creditedName: string
  linkedArtistName: string | null
  roleCode: string
  instrument: string | null
  displayCredit: string | null
  notes: string | null
  sortOrder: number
}

export interface ArtistReleaseEventItem {
  id: string
  eventType: ReleaseEventType
  actorRole: "system" | "admin" | "artist"
  actorName: string | null
  createdAt: string
  summary: string
}

export interface ArtistReleaseRequestState {
  id: string
  requestType: ReleaseChangeRequestType
  status: ReleaseChangeRequestStatus
  takedownReason: string | null
  proofUrls: string[]
  adminNotes: string | null
  createdAt: string
  reviewedAt: string | null
}

export type ArtistTrackCollaborationSource = "none" | "release" | "track"

export interface ArtistReleaseTrack {
  id: string
  title: string
  isrc: string
  trackNumber: number | null
  durationSeconds: number | null
  audioPreviewUrl: string | null
  lyrics: string | null
  tiktokPreviewStartSeconds: number | null
  versionLine: string | null
  containsAiGeneratedElements: boolean
  sourceAudioUrl: string | null
  finalAudioUrl: string | null
  status: TrackStatus
  collaborationSource: ArtistTrackCollaborationSource
  collaborators: ArtistReleaseContributor[]
  viewerSplitHistory: ArtistVisibleSplitHistoryItem[]
  credits: ArtistTrackCreditRecord[]
}

export interface ArtistReleaseItem {
  id: string
  artistId: string
  artistName: string
  title: string
  type: ReleaseType
  status: ReleaseStatus
  genre: string
  upc: string | null
  coverArtUrl: string | null
  coverThumbUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  displayStatus: ReleaseDisplayStatus
  submissionStatus: "pending_review" | "approved" | "rejected" | null
  submissionAdminNotes: string | null
  viewerRelation: "owner" | "collaborator"
  viewerRoles: string[]
  takedownReason: string | null
  takedownProofUrls: string[]
  canSubmitDraftEdit: boolean
  canDeletePendingReview: boolean
  pendingRequest: ArtistReleaseRequestState | null
  releaseCollaborators: ArtistReleaseContributor[]
  viewerSplitHistory: ArtistVisibleSplitHistoryItem[]
  events: ArtistReleaseEventItem[]
  tracks: ArtistReleaseTrack[]
  trackCount?: number
}

export interface ArtistReleasesResponse {
  releaseCount: number
  trackCount: number
  ownerReleaseCount: number
  collaboratorReleaseCount: number
  releases: ArtistReleaseItem[]
  pagination?: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasPreviousPage: boolean
    hasNextPage: boolean
  }
}

export interface ArtistDashboardHomeRelease {
  id: string
  artistId: string
  artistName: string
  title: string
  type: ReleaseType
  displayStatus: ReleaseDisplayStatus
  coverArtUrl: string | null
  coverThumbUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  trackCount: number
}

export interface ArtistDashboardHomeSetupArtist {
  artistId: string
  country: string | null
  bankDetails: {
    accountName: string
    bankName: string
    accountNumber: string
  } | null
  dspProfiles: Array<{
    profileExists: boolean
    profileUrl: string | null
  }>
}

export interface ArtistDashboardHomeResponse {
  latestRelease: ArtistDashboardHomeRelease | null
  releaseLookup: ArtistDashboardHomeRelease[]
  setup: {
    profileFullName: string
    artist: ArtistDashboardHomeSetupArtist | null
  }
}

export interface ArtistDashboardHomeSummaryResponse {
  wallet: ArtistWalletResponse
  home: ArtistDashboardHomeResponse
}

export interface ArtistAnalyticsEarningsRow {
  periodMonth: string
  channelId: string | null
  channelName: string
  territory: string | null
  releaseId: string | null
  releaseTitle: string | null
  trackId: string | null
  trackTitle: string | null
  revenue: string
  streams: number
}

export interface ArtistAnalyticsPublishingRow {
  periodMonth: string
  amount: string
}

export interface ArtistAnalyticsSnapshotRow {
  periodMonth: string
  releaseId: string | null
  releaseTitle: string | null
  platform: "spotify" | "apple_music" | "tiktok" | "meta" | "youtube"
  metricType: "monthly_listeners" | "streams" | "views" | "impressions" | "video_creations"
  label: string
  value: number
}

export interface ArtistAnalyticsFilterOption {
  value: string
  label: string
  logoKey?: string | null
  imageUrl?: string | null
}

export interface ArtistAnalyticsFilterOptions {
  periodMonths: ArtistAnalyticsFilterOption[]
  channels: ArtistAnalyticsFilterOption[]
  territories: ArtistAnalyticsFilterOption[]
  releases: ArtistAnalyticsFilterOption[]
  tracks: ArtistAnalyticsFilterOption[]
}

export interface ArtistAnalyticsMetric {
  label: string
  value: string
  footnote: string
  tone: "default" | "accent" | "alt"
  valueLogoKey?: string | null
}

export interface ArtistAnalyticsSummary {
  totalRoyaltyRevenue: string
  totalPublishingRevenue: string
  totalStreams: number
  royaltyRowCount: number
}

export interface ArtistAnalyticsTrendPoint {
  key: string
  periodMonth: string
  label: string
  value: number
  revenue: number
  streams: number
}

export interface ArtistAnalyticsCountryRow {
  countryCode: string | null
  countryName: string
  revenue: number
  streams: number
  share: number
}

export interface ArtistAnalyticsPlatformRow {
  id: string
  label: string
  logoKey: string | null
  revenue: number
  streams: number
  share: number
}

export interface ArtistAnalyticsPlatformSeriesPoint {
  key: string
  label: string
  value: number
}

export interface ArtistAnalyticsPlatformSeries {
  key: string
  label: string
  points: ArtistAnalyticsPlatformSeriesPoint[]
}

export interface ArtistAnalyticsReleaseRow {
  id: string
  label: string
  meta: string
  value: number
  count: number
  coverArtUrl: string | null
  coverThumbUrl: string | null
}

export interface ArtistAnalyticsAudiencePoint {
  label: string
  value: number
}

export interface ArtistAnalyticsAudienceCard {
  key: string
  label: string
  value: number | null
  delta: number | null
  periodLabel: string | null
  topCountry: {
    countryCode: string | null
    countryName: string
    streams: number
  } | null
  points: ArtistAnalyticsAudiencePoint[]
}

export interface ArtistAnalyticsOverviewResponse {
  summary: ArtistAnalyticsSummary
  metrics: ArtistAnalyticsMetric[]
  monthlyRevenue: ArtistAnalyticsTrendPoint[]
  countries: ArtistAnalyticsCountryRow[]
  platformRows: ArtistAnalyticsPlatformRow[]
  platformSeries: ArtistAnalyticsPlatformSeries[]
  releaseRows: ArtistAnalyticsReleaseRow[]
  filterOptions: ArtistAnalyticsFilterOptions
  earningsRows: ArtistAnalyticsEarningsRow[]
  publishingRows: ArtistAnalyticsPublishingRow[]
  audienceSnapshots: ArtistAnalyticsSnapshotRow[]
}

export interface ArtistAnalyticsAudienceResponse {
  cards: ArtistAnalyticsAudienceCard[]
  audienceSnapshots: ArtistAnalyticsSnapshotRow[]
}

export type ArtistAnalyticsResponse = ArtistAnalyticsOverviewResponse

export type ArtistNotificationType =
  | "earnings_posted"
  | "payout_approved"
  | "payout_rejected"
  | "payout_paid"
  | "due_added"

export interface ArtistNotificationRecord {
  id: string
  artistId: string
  artistName: string
  title: string
  message: string | null
  type: ArtistNotificationType
  typeLabel: string
  referenceId: string | null
  isRead: boolean
  createdAt: string
  updatedAt: string
}

export interface ArtistNotificationsResponse {
  notifications: ArtistNotificationRecord[]
  unreadCount: number
  totalCount: number
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasPreviousPage: boolean
    hasNextPage: boolean
  }
}

export interface ArtistNotificationReadInput {
  isRead?: boolean
}

export interface ArtistNotificationsMarkReadInput {
  artistId?: string | null
}

export interface ArtistNotificationMutationResponse {
  notificationId?: string
  updatedCount: number
}

/**
 * Minimal shape the AppShell notification dropdown renders. Both artist and
 * admin notification feeds map their records into this so the shell stays
 * panel-agnostic — each side resolves its own click destination via `to`.
 */
export interface ShellNotificationPreviewItem {
  id: string
  title: string
  message: string | null
  isRead: boolean
  createdAt: string
  to: RouteLocationRaw
}

/**
 * Important platform events admins should see in-panel. These mirror the
 * existing admin email alerts, so any artist action that pings admins by mail
 * also lands in the shared admin notification feed.
 */
export type AdminNotificationType =
  | "release_submitted"
  | "release_change_requested"
  | "payout_requested"
  | "publishing_submitted"
  | "payout_details_changed"

export interface AdminNotificationRecord {
  id: string
  type: AdminNotificationType
  typeLabel: string
  title: string
  message: string | null
  artistId: string | null
  artistName: string | null
  referenceId: string | null
  actionPath: string | null
  isRead: boolean
  createdAt: string
}

export interface AdminNotificationsResponse {
  notifications: AdminNotificationRecord[]
  unreadCount: number
  totalCount: number
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
    hasPreviousPage: boolean
    hasNextPage: boolean
  }
}

export interface AdminNotificationMutationResponse {
  updatedCount: number
}
