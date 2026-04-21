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

export interface ViewerSecurityContext {
  adminMfaRequired: boolean
}

export interface ViewerContext {
  authenticated: boolean
  userId: string | null
  profile: ViewerProfile | null
  artistMemberships: ViewerArtistMembership[]
  schemaReady: boolean
  security: ViewerSecurityContext
}
