import { createError } from "h3"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface AdminArtistLifecycleTarget {
  id: string
  user_id: string | null
  name: string
  email: string | null
  is_active: boolean
  country: string | null
  bio: string | null
}

export interface AdminArtistLifecycleRpcResult {
  artist_id: string
  linked_user_id: string | null
  profile_became_unused: boolean
  remaining_linked_artist_count: number
}

export function normalizeLoginEmail(value: unknown, label = "Login email") {
  const normalized = String(value ?? "").trim().toLowerCase()

  if (!normalized || !normalized.includes("@")) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid email address.`,
    })
  }

  return normalized
}

export async function loadAdminArtistLifecycleTarget(
  supabase: SupabaseClient<any>,
  artistId: string,
) {
  const { data, error } = await supabase
    .from("artists")
    .select("id, user_id, name, email, is_active, country, bio")
    .eq("id", artistId)
    .maybeSingle<AdminArtistLifecycleTarget>()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!data) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected artist does not exist.",
    })
  }

  return data
}

export async function countLinkedArtists(
  supabase: SupabaseClient<any>,
  userId: string,
  excludeArtistId?: string,
) {
  let query = supabase
    .from("artists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)

  if (excludeArtistId) {
    query = query.neq("id", excludeArtistId)
  }

  const { count, error } = await query

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  return count ?? 0
}

export async function setAccountBanState(
  supabase: SupabaseClient<any>,
  userId: string,
  frozen: boolean,
) {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: frozen ? "876000h" : "none",
  })

  if (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error.message || "Unable to update the login freeze state.",
    })
  }
}

export async function deleteAuthUserOrFail(
  supabase: SupabaseClient<any>,
  userId: string,
  fallback: string,
) {
  const { error } = await supabase.auth.admin.deleteUser(userId)

  if (error) {
    throw createError({
      statusCode: 502,
      statusMessage: error.message || fallback,
    })
  }
}
