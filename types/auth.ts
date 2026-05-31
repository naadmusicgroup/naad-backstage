export type AppRole = "admin" | "artist"

export type ViewerArtistAvatarMode = "mesh" | "uploaded"
export type ViewerArtistAvatarPreset = "aurora" | "champagne" | "opal" | "lagoon" | "ember" | "violet" | "rose" | "mint" | "solar" | "frost" | "peacock" | "coral" | "graphite" | "citrus" | "lilac" | "cobalt" | "sand" | "blush" | "jade" | "midnight" | "prism" | "velvet" | "orbit" | "flame" | "glacier" | "copper" | "pearl" | "marine" | "moss" | "ruby" | "topaz" | "amethyst" | "onyx" | "saffron" | "cerulean" | "orchid" | "seafoam" | "sunset" | "nebula" | "mercury" | "emerald" | "ink" | "dune" | "bloom" | "arctic" | "bronze" | "sapphire" | "papaya" | "pistachio" | "quartz" | "lava" | "skyline" | "meadow" | "twilight" | "honey" | "smoke" | "ocean" | "magma" | "alpine" | "noir" | "custom"

export interface ViewerProfile {
  id: string
  fullName: string | null
  role: AppRole
}

export interface ViewerArtistMembership {
  id: string
  name: string
  avatarMode: ViewerArtistAvatarMode
  avatarPreset: ViewerArtistAvatarPreset
  avatarCustomColors: string[] | null
  avatarUrl: string | null
}

export interface ViewerImpersonationContext {
  active: true
  artistId: string
  artistName: string
}

export interface ViewerSecurityContext {
  adminMfaRequired: boolean
}

export interface ViewerContext {
  authenticated: boolean
  userId: string | null
  profile: ViewerProfile | null
  artistMemberships: ViewerArtistMembership[]
  impersonation: ViewerImpersonationContext | null
  schemaReady: boolean
  security: ViewerSecurityContext
}

export interface StartArtistImpersonationInput {
  artistId: string
}

export interface ArtistImpersonationMutationResponse {
  ok: true
  artistId: string | null
  artistName: string | null
}
