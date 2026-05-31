import { serverSupabaseClient, serverSupabaseUser } from "~~/server/utils/supabase"
import {
  buildGuestSecurityContext,
  loadViewerSecurityContext,
  resolveSupabaseAuthUserId,
} from "~~/server/utils/auth"
import {
  clearViewAsArtistCookie,
  getViewAsArtistId,
} from "~~/server/utils/impersonation"
import type { AppRole, ViewerArtistMembership, ViewerContext } from "~~/types/auth"
import {
  normalizeArtistAvatarMode,
  normalizeArtistAvatarPreset,
  resolveArtistAvatarCustomColors,
} from "~~/server/utils/artist-avatars"

interface ViewerArtistRow {
  id: string
  name: string
  avatar_mode: string | null
  avatar_preset: string | null
  avatar_custom_colors: string[] | null
  avatar_url: string | null
}

function guestContext(): ViewerContext {
  return {
    authenticated: false,
    userId: null,
    profile: null,
    artistMemberships: [],
    impersonation: null,
    schemaReady: true,
    security: buildGuestSecurityContext(),
  }
}

function mapViewerArtistMembership(row: ViewerArtistRow): ViewerArtistMembership {
  return {
    id: row.id,
    name: row.name,
    avatarMode: normalizeArtistAvatarMode(row.avatar_mode),
    avatarPreset: normalizeArtistAvatarPreset(row.avatar_preset),
    avatarCustomColors: resolveArtistAvatarCustomColors(row.avatar_custom_colors),
    avatarUrl: row.avatar_url,
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
    let impersonation: ViewerContext["impersonation"] = null

    if (role === "artist") {
      const { data: artists, error: artistsError } = await supabase
        .from("artists")
        .select("id, name, avatar_mode, avatar_preset, avatar_custom_colors, avatar_url")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("name", { ascending: true })

      if (artistsError) {
        throw artistsError
      }

      const primaryArtist = (artists ?? [])[0] as ViewerArtistRow | undefined

      if (primaryArtist) {
        artistMemberships.push(mapViewerArtistMembership(primaryArtist))
      }
    } else if (role === "admin") {
      const viewAsArtistId = getViewAsArtistId(event)

      if (viewAsArtistId) {
        const { data: artist, error: artistError } = await supabase
          .from("artists")
          .select("id, name, avatar_mode, avatar_preset, avatar_custom_colors, avatar_url")
          .eq("id", viewAsArtistId)
          .eq("is_active", true)
          .maybeSingle<ViewerArtistRow>()

        if (artistError) {
          throw artistError
        }

        if (artist) {
          artistMemberships.push(mapViewerArtistMembership(artist))
          impersonation = {
            active: true,
            artistId: artist.id,
            artistName: artist.name,
          }
        } else {
          clearViewAsArtistCookie(event)
        }
      }
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
      impersonation,
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
        impersonation: null,
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

