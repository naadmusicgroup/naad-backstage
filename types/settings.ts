import type { AppRole } from "./auth"

export const ARTIST_AVATAR_MODES = ["mesh", "uploaded"] as const
export type ArtistAvatarMode = (typeof ARTIST_AVATAR_MODES)[number]

export const ARTIST_AVATAR_PRESETS = [
  "aurora",
  "champagne",
  "opal",
  "lagoon",
  "ember",
  "violet",
  "rose",
  "mint",
  "solar",
  "frost",
  "peacock",
  "coral",
  "graphite",
  "citrus",
  "lilac",
  "cobalt",
  "sand",
  "blush",
  "jade",
  "midnight",
  "prism",
  "velvet",
  "orbit",
  "flame",
  "glacier",
  "copper",
  "pearl",
  "marine",
  "moss",
  "ruby",
  "topaz",
  "amethyst",
  "onyx",
  "saffron",
  "cerulean",
  "orchid",
  "seafoam",
  "sunset",
  "nebula",
  "mercury",
  "emerald",
  "ink",
  "dune",
  "bloom",
  "arctic",
  "bronze",
  "sapphire",
  "papaya",
  "pistachio",
  "quartz",
  "lava",
  "skyline",
  "meadow",
  "twilight",
  "honey",
  "smoke",
  "ocean",
  "magma",
  "alpine",
  "noir",
  "custom",
] as const
export type ArtistAvatarPreset = (typeof ARTIST_AVATAR_PRESETS)[number]

export const DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS = [
  "#5c451f",
  "#d7b65d",
  "#fff4d5",
  "#b58a35",
  "#f6dfba",
] as const

export interface ArtistAvatarMeshPresetStyle {
  c1: string
  c2: string
  c3: string
  c4: string
  c5: string
  angle: string
}

export const ARTIST_AVATAR_MESH_PRESET_STYLES: Record<ArtistAvatarPreset, ArtistAvatarMeshPresetStyle> = {
  aurora: {
    c1: "#102f55",
    c2: "#19c6b6",
    c3: "#f3d36b",
    c4: "#6f4ed8",
    c5: "#f7efe0",
    angle: "-10deg",
  },
  champagne: {
    c1: "#5c451f",
    c2: "#d7b65d",
    c3: "#fff4d5",
    c4: "#b58a35",
    c5: "#f6dfba",
    angle: "12deg",
  },
  opal: {
    c1: "#dfeef5",
    c2: "#8bd8d2",
    c3: "#f3cadf",
    c4: "#f8f7ed",
    c5: "#9db6ff",
    angle: "-20deg",
  },
  lagoon: {
    c1: "#072f3d",
    c2: "#0b8ea0",
    c3: "#85f2d4",
    c4: "#235f9f",
    c5: "#e6f8d6",
    angle: "18deg",
  },
  ember: {
    c1: "#441f27",
    c2: "#ef6a3c",
    c3: "#ffd36a",
    c4: "#b12b5f",
    c5: "#fff1d6",
    angle: "-16deg",
  },
  violet: {
    c1: "#261f54",
    c2: "#7057e5",
    c3: "#e686d8",
    c4: "#2fb6c4",
    c5: "#f4e7ff",
    angle: "24deg",
  },
  rose: {
    c1: "#462430",
    c2: "#d95273",
    c3: "#f6b0a0",
    c4: "#36547e",
    c5: "#fff1ea",
    angle: "-26deg",
  },
  mint: {
    c1: "#12392f",
    c2: "#5bd5a8",
    c3: "#ddf6c7",
    c4: "#6ca5db",
    c5: "#f5fff1",
    angle: "8deg",
  },
  solar: {
    c1: "#241710",
    c2: "#ffb703",
    c3: "#fff3b0",
    c4: "#fb8500",
    c5: "#3a2f16",
    angle: "14deg",
  },
  frost: {
    c1: "#f8fbff",
    c2: "#b8e7ff",
    c3: "#d8d2ff",
    c4: "#7ba7d9",
    c5: "#ffffff",
    angle: "-14deg",
  },
  peacock: {
    c1: "#052f3c",
    c2: "#008c8c",
    c3: "#51d0b5",
    c4: "#c9a84d",
    c5: "#11214d",
    angle: "20deg",
  },
  coral: {
    c1: "#502339",
    c2: "#ff6f61",
    c3: "#ffd0bf",
    c4: "#2f7f89",
    c5: "#fff3e9",
    angle: "-18deg",
  },
  graphite: {
    c1: "#0d0e10",
    c2: "#3a3d42",
    c3: "#9da3ad",
    c4: "#1f242b",
    c5: "#e7e9ed",
    angle: "10deg",
  },
  citrus: {
    c1: "#20321b",
    c2: "#d7ff4f",
    c3: "#fff4a8",
    c4: "#3eb489",
    c5: "#f8ffe8",
    angle: "-10deg",
  },
  lilac: {
    c1: "#352454",
    c2: "#b48cff",
    c3: "#f0d6ff",
    c4: "#7ed0e6",
    c5: "#fff7fb",
    angle: "26deg",
  },
  cobalt: {
    c1: "#061b4d",
    c2: "#1769e0",
    c3: "#7bdff2",
    c4: "#1a2a6c",
    c5: "#eef7ff",
    angle: "-24deg",
  },
  sand: {
    c1: "#4e3820",
    c2: "#c69c5d",
    c3: "#f2dfb7",
    c4: "#8c6f45",
    c5: "#fff7e6",
    angle: "18deg",
  },
  blush: {
    c1: "#5b263b",
    c2: "#ee8fa7",
    c3: "#ffdbe7",
    c4: "#a65873",
    c5: "#fff7f3",
    angle: "-22deg",
  },
  jade: {
    c1: "#103a31",
    c2: "#00a878",
    c3: "#9ff3d0",
    c4: "#2d6f73",
    c5: "#f3fff8",
    angle: "16deg",
  },
  midnight: {
    c1: "#070817",
    c2: "#1b2a6b",
    c3: "#9b8cff",
    c4: "#00b4d8",
    c5: "#e6e7ff",
    angle: "-12deg",
  },
  prism: {
    c1: "#121a33",
    c2: "#3ae0d4",
    c3: "#ffe48a",
    c4: "#ff5f8f",
    c5: "#f5f9ff",
    angle: "22deg",
  },
  velvet: {
    c1: "#240d1f",
    c2: "#7a214f",
    c3: "#e55c8a",
    c4: "#3d2f78",
    c5: "#f8d8e8",
    angle: "-18deg",
  },
  orbit: {
    c1: "#07111f",
    c2: "#2454d8",
    c3: "#7df3ff",
    c4: "#f7c948",
    c5: "#f8fbff",
    angle: "28deg",
  },
  flame: {
    c1: "#2f120c",
    c2: "#ff4e33",
    c3: "#ffcc5c",
    c4: "#8f1d4b",
    c5: "#fff0d3",
    angle: "-24deg",
  },
  glacier: {
    c1: "#ecf9ff",
    c2: "#8edcff",
    c3: "#b7f5e8",
    c4: "#7b8ee8",
    c5: "#ffffff",
    angle: "14deg",
  },
  copper: {
    c1: "#321a0f",
    c2: "#b76a37",
    c3: "#f5be7e",
    c4: "#6d3b23",
    c5: "#ffe8c9",
    angle: "-12deg",
  },
  pearl: {
    c1: "#fffaf0",
    c2: "#d8e6ee",
    c3: "#f3cfe0",
    c4: "#b8c2d9",
    c5: "#ffffff",
    angle: "18deg",
  },
  marine: {
    c1: "#031b2f",
    c2: "#087ea4",
    c3: "#58d8c9",
    c4: "#0d3f6a",
    c5: "#e6fff8",
    angle: "-20deg",
  },
  moss: {
    c1: "#152412",
    c2: "#6e8f3f",
    c3: "#d7e8a1",
    c4: "#3f6f5a",
    c5: "#f7ffe1",
    angle: "12deg",
  },
  ruby: {
    c1: "#330817",
    c2: "#c81d4f",
    c3: "#ff9db7",
    c4: "#6e143a",
    c5: "#fff0f3",
    angle: "-28deg",
  },
  topaz: {
    c1: "#34230b",
    c2: "#e0a21a",
    c3: "#ffe79a",
    c4: "#c95b2e",
    c5: "#fff6dc",
    angle: "24deg",
  },
  amethyst: {
    c1: "#24123f",
    c2: "#8d5cf6",
    c3: "#d6b6ff",
    c4: "#3ec4d8",
    c5: "#fbf0ff",
    angle: "-14deg",
  },
  onyx: {
    c1: "#050607",
    c2: "#23262b",
    c3: "#6f7785",
    c4: "#12151a",
    c5: "#cfd4dc",
    angle: "16deg",
  },
  saffron: {
    c1: "#2d1a05",
    c2: "#f4a91f",
    c3: "#fff0a6",
    c4: "#cc6b22",
    c5: "#fff8dd",
    angle: "-16deg",
  },
  cerulean: {
    c1: "#061f38",
    c2: "#168bd8",
    c3: "#82e9ff",
    c4: "#344ec7",
    c5: "#effbff",
    angle: "20deg",
  },
  orchid: {
    c1: "#321333",
    c2: "#c45bdd",
    c3: "#ffd3ef",
    c4: "#5765d8",
    c5: "#fff3fb",
    angle: "-24deg",
  },
  seafoam: {
    c1: "#0d332d",
    c2: "#59d9c5",
    c3: "#c9ffeb",
    c4: "#6da0e0",
    c5: "#f3fff8",
    angle: "10deg",
  },
  sunset: {
    c1: "#3a1a24",
    c2: "#ff795d",
    c3: "#ffd071",
    c4: "#8b4bd8",
    c5: "#fff0df",
    angle: "-20deg",
  },
  nebula: {
    c1: "#09081f",
    c2: "#4930c9",
    c3: "#f06dcc",
    c4: "#26c6da",
    c5: "#e8e4ff",
    angle: "30deg",
  },
  mercury: {
    c1: "#17191d",
    c2: "#6f7780",
    c3: "#dce1e8",
    c4: "#2d343b",
    c5: "#ffffff",
    angle: "-8deg",
  },
  emerald: {
    c1: "#082c21",
    c2: "#00a86b",
    c3: "#8ff0c3",
    c4: "#1b5e52",
    c5: "#f0fff5",
    angle: "22deg",
  },
  ink: {
    c1: "#050b16",
    c2: "#16315f",
    c3: "#7b93c9",
    c4: "#0a1326",
    c5: "#e7edf8",
    angle: "-18deg",
  },
  dune: {
    c1: "#4b351d",
    c2: "#c28c47",
    c3: "#f3d7a2",
    c4: "#8a7048",
    c5: "#fff2d5",
    angle: "16deg",
  },
  bloom: {
    c1: "#3f1d32",
    c2: "#ef7fb0",
    c3: "#ffe1f0",
    c4: "#7ac7a4",
    c5: "#fff8ee",
    angle: "-30deg",
  },
  arctic: {
    c1: "#f4fbff",
    c2: "#a7ddff",
    c3: "#e1f5ff",
    c4: "#83a6d8",
    c5: "#ffffff",
    angle: "26deg",
  },
  bronze: {
    c1: "#291a0d",
    c2: "#9a6b2f",
    c3: "#dfbd78",
    c4: "#5f4021",
    c5: "#ffe9bc",
    angle: "-12deg",
  },
  sapphire: {
    c1: "#06173a",
    c2: "#1959d1",
    c3: "#7fb9ff",
    c4: "#0b2c77",
    c5: "#eef6ff",
    angle: "18deg",
  },
  papaya: {
    c1: "#42180d",
    c2: "#ff8b4a",
    c3: "#ffd9a1",
    c4: "#df4775",
    c5: "#fff1db",
    angle: "-22deg",
  },
  pistachio: {
    c1: "#1f2f14",
    c2: "#a6d85d",
    c3: "#efffb9",
    c4: "#4aa78c",
    c5: "#fbffe9",
    angle: "12deg",
  },
  quartz: {
    c1: "#f8f2f4",
    c2: "#e7c1d8",
    c3: "#c8d9ff",
    c4: "#f6dfb5",
    c5: "#ffffff",
    angle: "-18deg",
  },
  lava: {
    c1: "#1f0d0a",
    c2: "#e03616",
    c3: "#ffb347",
    c4: "#75122c",
    c5: "#fff0d2",
    angle: "24deg",
  },
  skyline: {
    c1: "#0b2140",
    c2: "#3f8cff",
    c3: "#bfeaff",
    c4: "#f4c66d",
    c5: "#f7fbff",
    angle: "-10deg",
  },
  meadow: {
    c1: "#17311d",
    c2: "#65b96a",
    c3: "#dbf5a7",
    c4: "#58b7b0",
    c5: "#f6fff1",
    angle: "20deg",
  },
  twilight: {
    c1: "#100a2d",
    c2: "#5c4bd9",
    c3: "#d68aff",
    c4: "#f0a14a",
    c5: "#f7ebff",
    angle: "-26deg",
  },
  honey: {
    c1: "#3a2608",
    c2: "#d29b25",
    c3: "#ffe58a",
    c4: "#a96b2c",
    c5: "#fff5cf",
    angle: "14deg",
  },
  smoke: {
    c1: "#111214",
    c2: "#555b63",
    c3: "#b5bbc3",
    c4: "#2c3037",
    c5: "#f1f2f3",
    angle: "-16deg",
  },
  ocean: {
    c1: "#031d2a",
    c2: "#006f9f",
    c3: "#4fd5ee",
    c4: "#095a63",
    c5: "#e9fff9",
    angle: "18deg",
  },
  magma: {
    c1: "#24100e",
    c2: "#c93422",
    c3: "#ffb24d",
    c4: "#5c1430",
    c5: "#fff1d8",
    angle: "-20deg",
  },
  alpine: {
    c1: "#0f302e",
    c2: "#3d8f7a",
    c3: "#bcebd9",
    c4: "#6fa2d6",
    c5: "#f4fff9",
    angle: "24deg",
  },
  noir: {
    c1: "#030303",
    c2: "#181818",
    c3: "#9b8550",
    c4: "#2d2b26",
    c5: "#f1e4bd",
    angle: "-12deg",
  },
  custom: {
    c1: DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS[0],
    c2: DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS[1],
    c3: DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS[2],
    c4: DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS[3],
    c5: DEFAULT_ARTIST_AVATAR_CUSTOM_COLORS[4],
    angle: "12deg",
  },
}

export const ARTIST_AVATAR_PRESET_LABELS: Record<ArtistAvatarPreset, string> = {
  aurora: "Aurora",
  champagne: "Champagne",
  opal: "Opal",
  lagoon: "Lagoon",
  ember: "Ember",
  violet: "Violet",
  rose: "Rose",
  mint: "Mint",
  solar: "Solar",
  frost: "Frost",
  peacock: "Peacock",
  coral: "Coral",
  graphite: "Graphite",
  citrus: "Citrus",
  lilac: "Lilac",
  cobalt: "Cobalt",
  sand: "Sand",
  blush: "Blush",
  jade: "Jade",
  midnight: "Midnight",
  prism: "Prism",
  velvet: "Velvet",
  orbit: "Orbit",
  flame: "Flame",
  glacier: "Glacier",
  copper: "Copper",
  pearl: "Pearl",
  marine: "Marine",
  moss: "Moss",
  ruby: "Ruby",
  topaz: "Topaz",
  amethyst: "Amethyst",
  onyx: "Onyx",
  saffron: "Saffron",
  cerulean: "Cerulean",
  orchid: "Orchid",
  seafoam: "Seafoam",
  sunset: "Sunset",
  nebula: "Nebula",
  mercury: "Mercury",
  emerald: "Emerald",
  ink: "Ink",
  dune: "Dune",
  bloom: "Bloom",
  arctic: "Arctic",
  bronze: "Bronze",
  sapphire: "Sapphire",
  papaya: "Papaya",
  pistachio: "Pistachio",
  quartz: "Quartz",
  lava: "Lava",
  skyline: "Skyline",
  meadow: "Meadow",
  twilight: "Twilight",
  honey: "Honey",
  smoke: "Smoke",
  ocean: "Ocean",
  magma: "Magma",
  alpine: "Alpine",
  noir: "Noir",
  custom: "Custom",
}

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

export const ARTIST_DSP_PROFILE_PLATFORMS = ["spotify", "apple_music", "amazon_music"] as const
export type ArtistDspProfilePlatform = (typeof ARTIST_DSP_PROFILE_PLATFORMS)[number]

export const ARTIST_DSP_PROFILE_PLATFORM_LABELS: Record<ArtistDspProfilePlatform, string> = {
  spotify: "Spotify",
  apple_music: "Apple Music",
  amazon_music: "Amazon Music",
}

export interface ArtistDspProfileRecord {
  platform: ArtistDspProfilePlatform
  profileExists: boolean
  profileUrl: string | null
  displayName: string | null
  avatarUrl: string | null
  updatedAt: string | null
}

export interface ArtistDspProfileDraft {
  platform: ArtistDspProfilePlatform
  profileExists: boolean | null
  profileUrl: string
  displayName: string
  avatarUrl: string
}

export interface ArtistSettingsProfile {
  fullName: string
  phone: string | null
  email: string | null
}

export interface ArtistSettingsArtistRecord {
  artistId: string
  artistName: string
  avatarMode: ArtistAvatarMode
  avatarPreset: ArtistAvatarPreset
  avatarCustomColors: string[] | null
  avatarUrl: string | null
  country: string | null
  bio: string | null
  bankDetails: ArtistBankDetailsRecord | null
  publishingInfo: ArtistPublishingInfoRecord | null
  dspProfiles: ArtistDspProfileRecord[]
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
  avatarMode?: ArtistAvatarMode | null
  avatarPreset?: ArtistAvatarPreset | null
  avatarCustomColors?: string[] | null
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

export interface UpdateArtistDspProfileInput {
  platform: ArtistDspProfilePlatform
  profileExists: boolean | null
  profileUrl?: string | null
  displayName?: string | null
  avatarUrl?: string | null
}

export interface UpdateArtistDspProfilesInput {
  artistId: string
  profiles: UpdateArtistDspProfileInput[]
}

export interface UpdateArtistSettingsInput {
  profile?: UpdateArtistProfileInput
  artist?: UpdateManagedArtistInput
  bankDetails?: UpdateArtistBankDetailsInput
  dspProfiles?: UpdateArtistDspProfilesInput
}

export interface ArtistSettingsMutationResponse {
  ok: true
  updatedSections: Array<"profile" | "artist" | "bankDetails" | "dspProfiles">
  dspProfiles?: ArtistDspProfileRecord[]
}

export interface ArtistAvatarUploadResponse {
  ok: true
  avatarMode: "uploaded"
  avatarPreset: ArtistAvatarPreset
  avatarCustomColors: string[] | null
  avatarUrl: string
  avatarImageId?: string
}

export interface ArtistAvatarLibraryItem {
  id: string
  avatarUrl: string
  storagePath: string
  createdAt: string
  isCurrent: boolean
}

export interface ArtistAvatarLibraryResponse {
  avatars: ArtistAvatarLibraryItem[]
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

export type AdminReconciliationIssueSeverity = "warning" | "error"
export type AdminReconciliationStatus = "pass" | "warning" | "fail"

export interface AdminReconciliationIssue {
  code: string
  severity: AdminReconciliationIssueSeverity
  message: string
  expected?: string
  actual?: string
}

export interface AdminReconciliationArtistResult {
  artistId: string
  artistName: string
  artistEmail: string | null
  artistIsActive: boolean
  status: AdminReconciliationStatus
  walletEarned: string
  statementEarned: string
  activeEarningsSum: string
  publishingSum: string
  duesSum: string
  payoutReservedSum: string
  payoutPaidSum: string
  walletAvailableBalance: string
  expectedAvailableBalance: string
  ledgerAmountSum: string
  latestLedgerBalance: string
  completedUploadCount: number
  issueCount: number
  issues: AdminReconciliationIssue[]
}

export interface AdminReconciliationResponse {
  checkedAt: string
  summary: {
    artistCount: number
    passCount: number
    warningCount: number
    failCount: number
    issueCount: number
  }
  artists: AdminReconciliationArtistResult[]
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
