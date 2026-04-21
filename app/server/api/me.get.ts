import { serverSupabaseClient, serverSupabaseUser } from "#supabase/server"
import {
  buildGuestSecurityContext,
  loadViewerSecurityContext,
  resolveSupabaseAuthUserId,
} from "~~/server/utils/auth"
import type { AppRole, ViewerArtistMembership, ViewerContext } from "~~/types/auth"

function guestContext(): ViewerContext {
  return {
    authenticated: false,
    userId: null,
    profile: null,
    artistMemberships: [],
    schemaReady: true,
    security: buildGuestSecurityContext(),
  }
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)

  if (!user) {
    return guestContext()
  }

  const userId = resolveSupabaseAuthUserId(user)

  if (!userId) {
    return guestContext()
  }

  const supabase = await serverSupabaseClient(event)

  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", userId)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    const role = (profile?.role as AppRole | null | undefined) ?? null
    const artistMemberships: ViewerArtistMembership[] = []

    if (role === "artist") {
      const { data: artists, error: artistsError } = await supabase
        .from("artists")
        .select("id, name")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("name", { ascending: true })

      if (artistsError) {
        throw artistsError
      }

      artistMemberships.push(
        ...(artists ?? []).map((artist: { id: string; name: string }) => ({
          id: artist.id,
          name: artist.name,
        })),
      )
    }

    return {
      authenticated: true,
      userId,
      profile: profile
        ? {
            id: profile.id,
            fullName: profile.full_name,
            role: profile.role as AppRole,
          }
        : null,
      artistMemberships,
      schemaReady: true,
      security: await loadViewerSecurityContext(event, role),
    } satisfies ViewerContext
  } catch (error: any) {
    if (error?.code === "42P01" || error?.code === "42703") {
      return {
        authenticated: true,
        userId,
        profile: null,
        artistMemberships: [],
        schemaReady: false,
        security: await loadViewerSecurityContext(event),
      } satisfies ViewerContext
    }

    throw createError({
      statusCode: 500,
      statusMessage: error?.message || "Unable to load viewer context.",
    })
  }
})
