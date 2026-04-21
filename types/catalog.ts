export type ReleaseType = "single" | "ep" | "album"
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

export interface AdminReleaseRecord {
  id: string
  artistId: string
  title: string
  type: ReleaseType
  upc: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  isActive: boolean
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
  isActive: boolean
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

export interface CreateReleaseInput {
  artistId: string
  title: string
  type: ReleaseType
  upc: string | null
  coverArtUrl: string | null
  streamingLink: string | null
  releaseDate: string | null
  isActive: boolean
}

export interface UpdateReleaseInput {
  artistId?: string
  title?: string
  type?: ReleaseType
  upc?: string | null
  coverArtUrl?: string | null
  streamingLink?: string | null
  releaseDate?: string | null
  isActive?: boolean
}

export interface CreateTrackInput {
  releaseId: string
  title: string
  isrc: string
  trackNumber: number | null
  audioPreviewUrl: string | null
  isActive: boolean
}

export interface UpdateTrackInput {
  releaseId?: string
  title?: string
  isrc?: string
  trackNumber?: number | null
  audioPreviewUrl?: string | null
  isActive?: boolean
}

export interface CreateReleaseCollaboratorInput {
  releaseId: string
  artistId: string
  role: string
  splitPct: CollaboratorInputValue
}

export interface UpdateReleaseCollaboratorInput {
  artistId?: string
  role?: string
  splitPct?: CollaboratorInputValue
}

export interface CreateTrackCollaboratorInput {
  trackId: string
  artistId: string
  role: string
  splitPct: CollaboratorInputValue
}

export interface UpdateTrackCollaboratorInput {
  artistId?: string
  role?: string
  splitPct?: CollaboratorInputValue
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
