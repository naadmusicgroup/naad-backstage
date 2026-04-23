import type {
  ReleaseChangeRequestStatus,
  ReleaseChangeRequestType,
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

export type ArtistDueStatus = "unpaid" | "paid" | "cancelled"

export interface ArtistDueItem {
  id: string
  artistId: string
  artistName: string
  title: string
  amount: string
  status: ArtistDueStatus
  dueDate: string | null
  paidAt: string | null
  cancelledAt: string | null
  createdAt: string
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
  streamingLink: string | null
  releaseDate: string | null
  viewerRelation: "owner" | "collaborator"
  viewerRoles: string[]
  takedownReason: string | null
  takedownProofUrls: string[]
  canSubmitDraftEdit: boolean
  pendingRequest: ArtistReleaseRequestState | null
  releaseCollaborators: ArtistReleaseContributor[]
  viewerSplitHistory: ArtistVisibleSplitHistoryItem[]
  events: ArtistReleaseEventItem[]
  tracks: ArtistReleaseTrack[]
}

export interface ArtistReleasesResponse {
  releaseCount: number
  trackCount: number
  ownerReleaseCount: number
  collaboratorReleaseCount: number
  releases: ArtistReleaseItem[]
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

export interface ArtistAnalyticsResponse {
  earningsRows: ArtistAnalyticsEarningsRow[]
  publishingRows: ArtistAnalyticsPublishingRow[]
  audienceSnapshots: ArtistAnalyticsSnapshotRow[]
}

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
