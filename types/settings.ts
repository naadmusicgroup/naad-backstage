import type { AppRole } from "./auth"

export interface ArtistBankDetailsRecord {
  accountName: string
  bankName: string
  accountNumber: string
  bankAddress: string | null
  updatedAt: string | null
}

export interface ArtistPublishingInfoRecord {
  legalName: string | null
  ipiNumber: string | null
  proName: string | null
  updatedAt: string | null
}

export interface ArtistSettingsProfile {
  fullName: string
  phone: string | null
  email: string | null
}

export interface ArtistSettingsArtistRecord {
  artistId: string
  artistName: string
  avatarUrl: string | null
  country: string | null
  bio: string | null
  bankDetails: ArtistBankDetailsRecord | null
  publishingInfo: ArtistPublishingInfoRecord | null
}

export interface ArtistSettingsResponse {
  profile: ArtistSettingsProfile
  artists: ArtistSettingsArtistRecord[]
}

export interface UpdateArtistProfileInput {
  fullName?: string
  phone?: string | null
}

export interface UpdateManagedArtistInput {
  artistId: string
  avatarUrl?: string | null
  country?: string | null
  bio?: string | null
}

export interface UpdateArtistBankDetailsInput {
  artistId: string
  accountName: string
  bankName: string
  accountNumber: string
  bankAddress?: string | null
}

export interface UpdateArtistSettingsInput {
  profile?: UpdateArtistProfileInput
  artist?: UpdateManagedArtistInput
  bankDetails?: UpdateArtistBankDetailsInput
}

export interface ArtistSettingsMutationResponse {
  ok: true
  updatedSections: Array<"profile" | "artist" | "bankDetails">
}

export interface AdminArtistOverview {
  id: string
  name: string
  email: string | null
  avatarUrl: string | null
  country: string | null
  bio: string | null
  isActive: boolean
  loginFrozenAt: string | null
  loginFrozenBy: string | null
  loginFrozenByName: string | null
  sharedAccountArtistCount: number
  createdAt: string
  bankDetails: ArtistBankDetailsRecord | null
  publishingInfo: ArtistPublishingInfoRecord | null
}

export interface AdminArtistsResponse {
  artists: AdminArtistOverview[]
}

export interface UpdateAdminArtistPublishingInfoInput {
  legalName?: string | null
  ipiNumber?: string | null
  proName?: string | null
}

export interface UpdateAdminArtistInput {
  name?: string
  email?: string | null
  avatarUrl?: string | null
  country?: string | null
  bio?: string | null
  publishingInfo?: UpdateAdminArtistPublishingInfoInput | null
}

export interface AdminArtistMutationResponse {
  ok: true
  artist: AdminArtistOverview
  updatedSections: Array<"artist" | "publishingInfo">
}

export type StatementPeriodStatus = "open" | "closed"

export interface AdminStatementPeriodRecord {
  id: string
  artistId: string
  artistName: string
  artistIsActive: boolean
  periodMonth: string
  status: StatementPeriodStatus
  closedAt: string | null
  closedByAdminId: string | null
  closedByAdminName: string | null
  earnings: string
  publishing: string
  uploadCount: number
  channelCount: number
  territoryCount: number
  releaseCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminActivityLogRecord {
  id: string
  adminId: string
  adminName: string | null
  action: string
  entityType: string
  entityId: string | null
  details: Record<string, unknown>
  createdAt: string
}

export interface OrphanedArtistRecord {
  id: string
  name: string
  email: string | null
  fullName: string | null
  country: string | null
  bio: string | null
  createdAt: string
  deactivatedAt: string | null
}

export interface ArchivedReleaseRecord {
  id: string
  artistId: string
  artistName: string
  title: string
  type: string
  upc: string | null
  releaseDate: string | null
  updatedAt: string
}

export interface ArchivedTrackRecord {
  id: string
  artistId: string
  artistName: string
  releaseId: string
  releaseTitle: string
  title: string
  isrc: string
  trackNumber: number | null
  updatedAt: string
}

export interface AdminChannelRegistryRecord {
  id: string
  rawName: string
  displayName: string | null
  iconUrl: string | null
  color: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminSettingsSummary {
  openStatementCount: number
  closedStatementCount: number
  orphanedArtistCount: number
  archivedReleaseCount: number
  archivedTrackCount: number
  activityLogCount: number
  channelCount: number
}

export interface AdminSettingsResponse {
  summary: AdminSettingsSummary
  statementPeriods: AdminStatementPeriodRecord[]
  activityLog: AdminActivityLogRecord[]
  orphanedArtists: OrphanedArtistRecord[]
  archived: {
    releases: ArchivedReleaseRecord[]
    tracks: ArchivedTrackRecord[]
  }
  channels: AdminChannelRegistryRecord[]
}

export type ArtistAccessMethod = "password" | "gmailInvite"

export interface RestoreAdminArtistAccessInput {
  accessMethod: ArtistAccessMethod
  email: string
  fullName: string
  password?: string
  country?: string | null
  bio?: string | null
}

export interface AdminArtistActionResponse {
  ok: true
  action: "freeze" | "unfreeze" | "orphan" | "restoreAccess" | "permanentDelete"
  artistId: string
  affectedUserId: string | null
  profileDeleted: boolean
  inviteId?: string | null
}

export interface UpdateStatementPeriodStatusInput {
  status: StatementPeriodStatus
}

export interface UpdateAdminChannelInput {
  displayName?: string | null
  iconUrl?: string | null
  color?: string | null
}

export type LoginInviteRole = AppRole
export type LoginInviteProvider = "google"
export type LoginInviteStatus = "pending" | "accepted" | "revoked"

export interface AdminLoginInviteRecord {
  id: string
  email: string
  role: LoginInviteRole
  fullName: string
  artistName: string | null
  country: string | null
  bio: string | null
  provider: LoginInviteProvider
  status: LoginInviteStatus
  invitedByAdminId: string
  invitedByAdminName: string | null
  acceptedByUserId: string | null
  acceptedByName: string | null
  acceptedAt: string | null
  revokedByAdminId: string | null
  revokedByAdminName: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminInvitesSummary {
  pendingCount: number
  acceptedCount: number
  revokedCount: number
  artistInviteCount: number
  adminInviteCount: number
}

export interface AdminInvitesResponse {
  summary: AdminInvitesSummary
  invites: AdminLoginInviteRecord[]
}

export interface CreateAdminLoginInviteInput {
  email: string
  role: LoginInviteRole
  fullName: string
  artistName?: string | null
  country?: string | null
  bio?: string | null
}

export interface UpdateAdminLoginInviteInput {
  email?: string
  role?: LoginInviteRole
  fullName?: string
  artistName?: string | null
  country?: string | null
  bio?: string | null
  status?: Exclude<LoginInviteStatus, "accepted">
}

export interface AdminLoginInviteMutationResponse {
  ok: true
  invite: AdminLoginInviteRecord
}
