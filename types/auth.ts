export type AppRole = "admin" | "artist"

export interface ViewerProfile {
  id: string
  fullName: string | null
  role: AppRole
}

export interface ViewerArtistMembership {
  id: string
  name: string
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
