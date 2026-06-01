import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { sendArtistAccessEmail } from "~~/server/utils/email"
import {
  countLinkedArtists,
  loadAdminArtistLifecycleTarget,
} from "~~/server/utils/admin-artist-lifecycle"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type {
  AdminArtistPasswordMutationResponse,
  UpdateAdminArtistPasswordInput,
} from "~~/types/settings"

function normalizePassword(value: unknown) {
  const normalized = String(value ?? "").trim()

  if (normalized.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: "Artist dashboard password must be at least 8 characters.",
    })
  }

  return normalized
}

function mapPasswordUpdateError(error: { message?: string | null; status?: number | null }) {
  const message = error.message || "Unable to change the artist dashboard password."

  if (error.status === 400 || error.status === 422) {
    return {
      statusCode: 400,
      statusMessage: message,
    }
  }

  if (error.status === 404) {
    return {
      statusCode: 404,
      statusMessage: "The artist login account could not be found.",
    }
  }

  return {
    statusCode: 502,
    statusMessage: message,
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const artistId = normalizeRequiredUuid(event.context.params?.id, "Artist id")
  const body = await readBody<UpdateAdminArtistPasswordInput>(event)
  const password = normalizePassword(body?.password)
  const supabase = serverSupabaseServiceRole(event)
  const artist = await loadAdminArtistLifecycleTarget(supabase, artistId)

  if (!artist.is_active) {
    throw createError({
      statusCode: 409,
      statusMessage: "Restore dashboard access before changing this artist password.",
    })
  }

  if (!artist.user_id) {
    throw createError({
      statusCode: 409,
      statusMessage: "This artist does not have a live login account to update.",
    })
  }

  const { data: loginProfile, error: loginProfileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", artist.user_id)
    .maybeSingle<{ role: string | null }>()

  if (loginProfileError) {
    throw createError({
      statusCode: 500,
      statusMessage: loginProfileError.message,
    })
  }

  if (loginProfile?.role !== "artist") {
    throw createError({
      statusCode: 409,
      statusMessage: "This login is not an artist dashboard account.",
    })
  }

  const { error: passwordUpdateError } = await supabase.auth.admin.updateUserById(artist.user_id, {
    password,
  })

  if (passwordUpdateError) {
    throw createError(mapPasswordUpdateError(passwordUpdateError))
  }

  const sharedAccountArtistCount = await countLinkedArtists(supabase, artist.user_id)

  await logAdminActivity(supabase, profile.id, "artist.password_changed", "artist", artistId, {
    artist_name: artist.name,
    login_user_id: artist.user_id,
    shared_account_artist_count: sharedAccountArtistCount,
  })

  await sendArtistAccessEmail(event, {
    email: artist.email,
    fullName: artist.name,
    subject: "Your Naad Backstage password was updated",
    title: "Dashboard password updated",
    lines: [
      "An admin updated the password for your Naad Backstage artist dashboard account.",
      "If you did not expect this change, contact Naad Music Group.",
    ],
  })

  return {
    ok: true,
    artistId,
    affectedUserId: artist.user_id,
    sharedAccountArtistCount,
  } satisfies AdminArtistPasswordMutationResponse
})
