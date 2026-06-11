export const PUBLISHING_REGISTRATION_SOURCES = ["artist_request", "admin_direct"] as const
export type PublishingRegistrationSource = (typeof PUBLISHING_REGISTRATION_SOURCES)[number]

export const PUBLISHING_REGISTRATION_TRACK_SOURCES = ["catalog", "manual"] as const
export type PublishingRegistrationTrackSource = (typeof PUBLISHING_REGISTRATION_TRACK_SOURCES)[number]

export const PUBLISHING_REGISTRATION_STATUSES = ["pending_review", "accepted", "rejected"] as const
export type PublishingRegistrationStatus = (typeof PUBLISHING_REGISTRATION_STATUSES)[number]

export interface PublishingWriterRecord {
  id: string
  fullName: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  ipiNumber: string | null
  proName: string | null
  isActive: boolean
  archivedAt: string | null
  archivedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface PublishingWriterOption {
  value: string
  label: string
  ipiNumber: string | null
  proName: string | null
  meta?: string | null
  linkedArtistNames?: string[]
}

export interface PublishingArtistOption {
  value: string
  label: string
  meta?: string | null
  defaultWriter?: PublishingDefaultWriter | null
}

export interface PublishingCatalogTrackOption {
  value: string
  label: string
  artistId: string
  releaseId: string
  releaseTitle: string
  trackTitle: string
  isrc: string
  performerName: string
  registrationStatus?: Exclude<PublishingRegistrationStatus, "rejected"> | null
}

export interface PublishingDefaultWriter {
  writerId?: string | null
  fullName: string
  ipiNumber: string | null
  proName: string | null
  linkedArtistNames?: string[]
}

export interface PublishingRegistrationWriterRecord {
  id: string
  writerId: string
  fullName: string
  ipiNumber: string | null
  proName: string | null
  role: string
  sharePct: string
  collectRoyalties: boolean
  sortOrder: number
}

export interface PublishingRegistrationTrackRecord {
  id: string
  batchId: string
  artistId: string
  artistName: string
  batchSource: PublishingRegistrationSource
  trackSource: PublishingRegistrationTrackSource
  status: PublishingRegistrationStatus
  trackId: string | null
  releaseId: string | null
  releaseTitle: string | null
  trackTitle: string
  performerName: string
  spotifyUrl: string | null
  submittedBy: string
  submittedByName: string | null
  reviewedBy: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  adminNotes: string | null
  artistNotes: string | null
  writers: PublishingRegistrationWriterRecord[]
  createdAt: string
  updatedAt: string
}

export interface PublishingRegistrationSummary {
  trackCount: number
  pendingCount: number
  acceptedCount: number
  rejectedCount: number
  artistCount: number
  writerCount: number
}

export interface ArtistPublishingResponse {
  tracks: PublishingRegistrationTrackRecord[]
  summary: PublishingRegistrationSummary
  writerOptions: PublishingWriterOption[]
  catalogTrackOptions: PublishingCatalogTrackOption[]
  defaultWriter: PublishingDefaultWriter | null
}

export interface AdminPublishingRegistrationResponse {
  tracks: PublishingRegistrationTrackRecord[]
  summary: PublishingRegistrationSummary
  artistOptions: PublishingArtistOption[]
  writerOptions: PublishingWriterOption[]
  catalogTrackOptions: PublishingCatalogTrackOption[]
}

export type AdminPublishingWriterStatusFilter = "active" | "archived" | "all"

export interface AdminPublishingWriterArtistLink {
  artistId: string
  artistName: string
}

export interface AdminPublishingWriterRecord extends PublishingWriterRecord {
  linkedArtists: AdminPublishingWriterArtistLink[]
  linkedArtistNames: string[]
  linkedArtistCount: number
  registrationCount: number
  pendingRegistrationCount: number
  acceptedRegistrationCount: number
  rejectedRegistrationCount: number
}

export interface AdminPublishingWritersResponse {
  writers: AdminPublishingWriterRecord[]
  summary: {
    writerCount: number
    activeCount: number
    archivedCount: number
    linkedArtistCount: number
    registrationCount: number
  }
}

export interface AdminPublishingWriterUpdateInput {
  fullName?: string | null
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  ipiNumber?: string | null
  proName?: string | null
}

export interface AdminPublishingWriterMutationResponse {
  writer: AdminPublishingWriterRecord | null
  mergedIntoWriterId?: string | null
  deleted: boolean
  archived: boolean
  restored: boolean
}

export interface PublishingRegistrationWriterInput {
  writerId?: string | null
  fullName?: string | null
  firstName?: string | null
  middleName?: string | null
  lastName?: string | null
  ipiNumber?: string | null
  proName?: string | null
  role?: string | null
  sharePct: string | number
  collectRoyalties?: boolean | null
}

export interface PublishingRegistrationTrackInput {
  source: PublishingRegistrationTrackSource
  trackId?: string | null
  songTitle?: string | null
  performerName?: string | null
  spotifyUrl?: string | null
  writers: PublishingRegistrationWriterInput[]
}

export interface ArtistPublishingBatchInput {
  artistId: string
  artistNotes?: string | null
  tracks: PublishingRegistrationTrackInput[]
}

export interface AdminPublishingDirectBatchInput {
  artistId: string
  adminNotes?: string | null
  tracks: PublishingRegistrationTrackInput[]
}

export interface AdminPublishingReviewInput {
  trackIds: string[]
  action: "accept" | "reject"
  adminNotes?: string | null
}

export interface PublishingRegistrationMutationResponse {
  batchId?: string
  trackIds: string[]
  updatedCount: number
}
