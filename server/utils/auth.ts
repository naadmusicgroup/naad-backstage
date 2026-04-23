import { createError, type H3Event } from "h3"
import { serverSupabaseClient, serverSupabaseUser } from "~~/server/utils/supabase"
import type { AppRole, ViewerSecurityContext } from "~~/types/auth"

export interface AuthenticatedProfile {
  id: string
  full_name: string | null
  role: AppRole
}

export interface AuthenticatedProfileContext {
  user: any
  userId: string
  profile: AuthenticatedProfile
}

function guestSecurityContext(): ViewerSecurityContext {
  return {
    adminMfaRequired: false,
  }
}

export function buildGuestSecurityContext(role?: AppRole | null) {
  void role
  return guestSecurityContext()
}

export function resolveSupabaseAuthUserId(user: any) {
  if (typeof user?.id === "string" && user.id) {
    return user.id
  }

  if (typeof user?.sub === "string" && user.sub) {
    return user.sub
  }

  return ""
}

export async function loadViewerSecurityContext(event: H3Event, role?: AppRole | null) {
  void event
  return buildGuestSecurityContext(role)
}

export async function requireAuthenticatedProfile(event: H3Event): Promise<AuthenticatedProfileContext> {
  const user = await serverSupabaseUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "You must be signed in to perform this action.",
    })
  }

  const userId = resolveSupabaseAuthUserId(user)

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Your session is missing a valid user id.",
    })
  }

  const client = await serverSupabaseClient(event)
  const { data: profile, error } = await client
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", userId)
    .maybeSingle<AuthenticatedProfile>()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!profile) {
    throw createError({
      statusCode: 403,
      statusMessage: "No application profile exists for this account yet.",
    })
  }

  return { user, userId, profile }
}

export async function requireAdminProfile(event: H3Event) {
  const context = await requireAuthenticatedProfile(event)

  if (context.profile.role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Admin access is required for this action.",
    })
  }

  return {
    ...context,
    security: await loadViewerSecurityContext(event, "admin"),
  }
}

export async function requireFreshAdminVerification(event: H3Event, action: string) {
  void action
  return await requireAdminProfile(event)
}

export async function requireArtistProfile(event: H3Event) {
  const context = await requireAuthenticatedProfile(event)

  if (context.profile.role !== "artist") {
    throw createError({
      statusCode: 403,
      statusMessage: "Artist access is required for this action.",
    })
  }

  return context
}

