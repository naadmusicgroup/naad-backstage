import type { ReleaseType } from "~~/types/catalog"

export interface ArtistActivityItem {
  id: string
  label: string
  description: string
  amount: string
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

export interface ArtistReleaseContributor {
  artistId: string
  name: string
  role: string
  visibleSplitPct: string | null
}

export type ArtistTrackCollaborationSource = "none" | "release" | "track"

export interface ArtistReleaseTrack {
  id: string
  title: string
  isrc: string
  trackNumber: number | null
  durationSeconds: number | null
  audioPreviewUrl: string | null
  collaborationSource: ArtistTrackCollaborationSource
  collaborators: ArtistReleaseContributor[]
}

export interface ArtistReleaseItem {
  id: string
  artistId: string
  artistName: string
  title: string
  type: ReleaseType
  upc: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  viewerRelation: "owner" | "collaborator"
  viewerRoles: string[]
  releaseCollaborators: ArtistReleaseContributor[]
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
