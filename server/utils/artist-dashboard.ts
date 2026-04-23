import { createError, type H3Event } from "h3"
import { requireAuthenticatedProfile, type AuthenticatedProfileContext } from "~~/server/utils/auth"
import { normalizeOptionalUuidQueryParam } from "~~/server/utils/catalog"
import { clearViewAsArtistCookie, getViewAsArtistId } from "~~/server/utils/impersonation"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"

export interface DashboardArtistScopeRow {
  id: string
  name: string
  email: string | null
  user_id: string
}

export interface ArtistDashboardScope extends AuthenticatedProfileContext {
  artistRows: DashboardArtistScopeRow[]
  artistIds: string[]
  artistOwnerUserId: string
  isImpersonating: boolean
}

function forbiddenForScope(resourceLabel: string) {
  return createError({
    statusCode: 403,
    statusMessage: `You can only load ${resourceLabel} for artist profiles in your current dashboard scope.`,
  })
}

export async function resolveArtistDashboardScope(
  event: H3Event,
  requestedArtistId: string,
  resourceLabel: string,
): Promise<ArtistDashboardScope> {
  const context = await requireAuthenticatedProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  if (context.profile.role === "artist") {
    const { data, error } = await supabase
      .from("artists")
      .select("id, name, email, user_id")
      .eq("user_id", context.profile.id)
      .eq("is_active", true)
      .order("name", { ascending: true })

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    const ownedArtists = (data ?? []) as DashboardArtistScopeRow[]

    if (requestedArtistId && !ownedArtists.some((artist) => artist.id === requestedArtistId)) {
      throw forbiddenForScope(resourceLabel)
    }

    const artistRows = requestedArtistId
      ? ownedArtists.filter((artist) => artist.id === requestedArtistId)
      : ownedArtists

    return {
      ...context,
      artistRows,
      artistIds: artistRows.map((artist) => artist.id),
      artistOwnerUserId: context.profile.id,
      isImpersonating: false,
    }
  }

  if (context.profile.role !== "admin") {
    throw createError({
      statusCode: 403,
      statusMessage: "Artist dashboard access is required for this action.",
    })
  }

  const viewAsArtistId = getViewAsArtistId(event)

  if (!viewAsArtistId) {
    throw createError({
      statusCode: 403,
      statusMessage: "Select an artist from the admin directory before opening the artist dashboard.",
    })
  }

  if (requestedArtistId && requestedArtistId !== viewAsArtistId) {
    throw forbiddenForScope(resourceLabel)
  }

  const { data: artist, error } = await supabase
    .from("artists")
    .select("id, name, email, user_id")
    .eq("id", viewAsArtistId)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!artist) {
    clearViewAsArtistCookie(event)
    throw createError({
      statusCode: 404,
      statusMessage: "The selected artist is no longer available for view-as mode.",
    })
  }

  const artistRow = artist as DashboardArtistScopeRow

  return {
    ...context,
    artistRows: [artistRow],
    artistIds: [artistRow.id],
    artistOwnerUserId: artistRow.user_id,
    isImpersonating: true,
  }
}

export function normalizeDashboardArtistQuery(value: unknown) {
  return normalizeOptionalUuidQueryParam(value, "Artist id")
}
