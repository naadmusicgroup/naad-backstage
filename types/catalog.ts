export const RELEASE_TYPES = ["single", "ep", "album"] as const
export type ReleaseType = (typeof RELEASE_TYPES)[number]

export const RELEASE_STATUSES = ["draft", "live", "taken_down", "deleted"] as const
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number]

export const TRACK_STATUSES = ["draft", "live", "deleted"] as const
export type TrackStatus = (typeof TRACK_STATUSES)[number]

export const SPLIT_VERSION_SOURCES = ["migration", "admin", "artist_request"] as const
export type SplitVersionSource = (typeof SPLIT_VERSION_SOURCES)[number]

export const RELEASE_EVENT_TYPES = [
  "release_created",
  "release_edited",
  "genre_changed",
  "credits_changed",
  "split_version_created",
  "draft_edit_requested",
  "request_approved",
  "request_rejected",
  "request_applied",
  "takedown_requested",
  "takedown_completed",
  "release_deleted",
] as const
export type ReleaseEventType = (typeof RELEASE_EVENT_TYPES)[number]

export const RELEASE_CHANGE_REQUEST_TYPES = ["draft_edit", "takedown"] as const
export type ReleaseChangeRequestType = (typeof RELEASE_CHANGE_REQUEST_TYPES)[number]

export const RELEASE_CHANGE_REQUEST_STATUSES = ["pending", "approved", "rejected", "applied"] as const
export type ReleaseChangeRequestStatus = (typeof RELEASE_CHANGE_REQUEST_STATUSES)[number]

export const TRACK_CREDIT_ROLE_GROUPS = [
  {
    group: "Performance",
    roles: [
      "Main Artist",
      "Featured Artist",
      "Background Vocals",
      "Musician",
      "Soloist",
      "DJ",
    ],
  },
  {
    group: "Writing",
    roles: ["Composer", "Lyricist", "Songwriter", "Arranger"],
  },
  {
    group: "Production",
    roles: ["Producer", "Additional Producer", "Vocal Producer", "Executive Producer", "Programmer"],
  },
  {
    group: "Engineering",
    roles: ["Recording Engineer", "Mix Engineer", "Mastering Engineer", "Assistant Engineer"],
  },
  {
    group: "Instrumentalists",
    roles: [
      "Guitar",
      "Bass",
      "Drums",
      "Percussion",
      "Piano",
      "Keyboards",
      "Synthesizer",
      "Violin",
      "Viola",
      "Cello",
      "Brass",
      "Woodwind",
    ],
  },
  {
    group: "Creative",
    roles: ["Creative Director", "Artwork/Design", "Photographer"],
  },
  {
    group: "Business",
    roles: ["A&R", "Manager", "Project Manager"],
  },
] as const

export const RELEASE_GENRE_OPTIONS = [
  "Alternative",
  "Classical",
  "Country",
  "Dance",
  "Electronic",
  "Folk",
  "Gospel",
  "Hip-Hop",
  "Indie",
  "Jazz",
  "Latin",
  "Metal",
  "Pop",
  "R&B",
  "Reggae",
  "Rock",
  "Soul",
  "Soundtrack",
  "World",
  "Other",
] as const

export type CollaboratorInputValue = number | string
export type CatalogImportIssueCode =
  | "missing_release_title"
  | "missing_track_title"
  | "missing_isrc"
  | "invalid_release_date"
  | "release_exists_other_artist"
  | "track_exists_other_release"
  | "track_exists_other_artist"
  | "duplicate_track_in_file"

export interface TrackCreditInput {
  creditedName: string
  linkedArtistId?: string | null
  roleCode: string
  instrument?: string | null
  displayCredit?: string | null
  notes?: string | null
  sortOrder?: number | string | null
}

export interface AdminTrackCreditRecord {
  id: string
  trackId: string
  creditedName: string
  linkedArtistId: string | null
  linkedArtistName: string | null
  roleCode: string
  instrument: string | null
  displayCredit: string | null
  notes: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface SplitVersionContributorRecord {
  artistId: string
  artistName: string
  role: string
  splitPct: number
}

export interface AdminReleaseSplitVersionRecord {
  id: string
  releaseId: string
  effectivePeriodMonth: string
  changeReason: string | null
  source: SplitVersionSource
  createdByProfileId: string | null
  createdAt: string
  contributors: SplitVersionContributorRecord[]
}

export interface AdminTrackSplitVersionRecord {
  id: string
  trackId: string
  releaseId: string
  effectivePeriodMonth: string
  changeReason: string | null
  source: SplitVersionSource
  createdByProfileId: string | null
  createdAt: string
  contributors: SplitVersionContributorRecord[]
}

export interface AdminReleaseEventRecord {
  id: string
  releaseId: string
  eventType: ReleaseEventType
  actorRole: "system" | "admin" | "artist"
  actorProfileId: string | null
  actorArtistId: string | null
  actorName: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export interface ReleaseChangeRequestSnapshot {
  release: Record<string, unknown>
  tracks: Record<string, unknown>[]
  credits: Record<string, unknown>[]
  genre: string | null
}

export interface AdminReleaseChangeRequestRecord {
  id: string
  releaseId: string
  requesterArtistId: string
  requesterArtistName: string
  requestedByProfileId: string
  requestedByName: string | null
  requestType: ReleaseChangeRequestType
  status: ReleaseChangeRequestStatus
  snapshot: ReleaseChangeRequestSnapshot
  takedownReason: string | null
  proofUrls: string[]
  adminNotes: string | null
  reviewedByProfileId: string | null
  reviewedByName: string | null
  reviewedAt: string | null
  appliedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminReleaseCollaboratorRecord {
  id: string
  releaseId: string
  artistId: string
  artistName: string
  role: string
  splitPct: number
  createdAt: string
  updatedAt: string
}

export interface AdminTrackCollaboratorRecord {
  id: string
  trackId: string
  releaseId: string
  trackTitle: string
  artistId: string
  artistName: string
  role: string
  splitPct: number
  createdAt: string
  updatedAt: string
}

export interface AdminTrackRecord {
  id: string
  artistId: string
  releaseId: string
  releaseTitle: string
  title: string
  isrc: string
  trackNumber: number | null
  durationSeconds: number | null
  audioPreviewUrl: string | null
  status: TrackStatus
  credits: AdminTrackCreditRecord[]
  collaborators: AdminTrackCollaboratorRecord[]
  splitHistory: AdminTrackSplitVersionRecord[]
  createdAt: string
  updatedAt: string
}

export interface AdminReleaseRecord {
  id: string
  artistId: string
  artistName: string | null
  title: string
  type: ReleaseType
  genre: string
  upc: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  status: ReleaseStatus
  takedownReason: string | null
  takedownProofUrls: string[]
  takedownRequestedAt: string | null
  takedownCompletedAt: string | null
  tracks: AdminTrackRecord[]
  collaborators: AdminReleaseCollaboratorRecord[]
  splitHistory: AdminReleaseSplitVersionRecord[]
  events: AdminReleaseEventRecord[]
  currentRequest: AdminReleaseChangeRequestRecord | null
  createdAt: string
  updatedAt: string
}

export interface CreateTrackInput {
  releaseId: string
  title: string
  isrc: string
  trackNumber: number | string | null
  audioPreviewUrl: string | null
  status: TrackStatus
  credits?: TrackCreditInput[]
}

export interface UpdateTrackInput {
  releaseId?: string
  title?: string
  isrc?: string
  trackNumber?: number | string | null
  audioPreviewUrl?: string | null
  status?: TrackStatus
}

export interface CreateReleaseInput {
  artistId: string
  title: string
  type: ReleaseType
  genre: string
  upc: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  status: ReleaseStatus
  tracks?: CreateTrackInput[]
}

export interface UpdateReleaseInput {
  artistId?: string
  title?: string
  type?: ReleaseType
  genre?: string
  upc?: string | null
  coverArtUrl?: string | null
  streamingLink?: string | null
  releaseDate?: string | null
  status?: ReleaseStatus
}

export interface CreateReleaseCollaboratorInput {
  releaseId: string
  artistId: string
  role: string
  splitPct: CollaboratorInputValue
  effectivePeriodMonth: string
  changeReason?: string | null
}

export interface UpdateReleaseCollaboratorInput {
  artistId?: string
  role?: string
  splitPct?: CollaboratorInputValue
  effectivePeriodMonth?: string
  changeReason?: string | null
}

export interface CreateTrackCollaboratorInput {
  trackId: string
  artistId: string
  role: string
  splitPct: CollaboratorInputValue
  effectivePeriodMonth: string
  changeReason?: string | null
}

export interface UpdateTrackCollaboratorInput {
  artistId?: string
  role?: string
  splitPct?: CollaboratorInputValue
  effectivePeriodMonth?: string
  changeReason?: string | null
}

export interface ReplaceTrackCreditsInput {
  credits: TrackCreditInput[]
}

export interface CreateReleaseChangeRequestInput {
  releaseId: string
  requestType: ReleaseChangeRequestType
  snapshot?: ReleaseChangeRequestSnapshot
  takedownReason?: string | null
  proofUrls?: string[]
}

export interface ReviewReleaseChangeRequestInput {
  adminNotes?: string | null
}

export interface ReleaseTakedownInput {
  reason: string
  proofUrls?: string[]
  resolutionNotes?: string | null
}

export interface BulkCatalogImportInput {
  artistId: string
  filename: string
  csvText: string
}

export interface CatalogImportIssue {
  scope: "release" | "track" | "row"
  code: CatalogImportIssueCode
  message: string
  releaseTitle: string | null
  trackTitle: string | null
  isrc: string | null
  upc: string | null
}

export interface BulkCatalogImportResponse {
  filename: string
  parsedReleaseCount: number
  parsedTrackCount: number
  createdReleaseCount: number
  reusedReleaseCount: number
  createdTrackCount: number
  skippedTrackCount: number
  issues: CatalogImportIssue[]
}

export interface AdminReleaseWorkspaceResponse {
  releases: AdminReleaseRecord[]
  pendingRequests: AdminReleaseChangeRequestRecord[]
}
