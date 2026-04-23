import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  countLinkedArtists,
  deleteAuthUserOrFail,
  loadAdminArtistLifecycleTarget,
  normalizeLoginEmail,
  setAccountBanState,
} from "~~/server/utils/admin-artist-lifecycle"
import { normalizeOptionalText, normalizeRequiredText, normalizeRequiredUuid } from "~~/server/utils/catalog"
import { findAuthUserByEmail, normalizeGmailInviteEmail } from "~~/server/utils/invites"
import type {
  AdminArtistActionResponse,
  RestoreAdminArtistAccessInput,
} from "~~/types/settings"

function normalizeAccessMethod(value: unknown) {
  if (value === "password" || value === "gmailInvite") {
    return value
  }

  throw createError({
    statusCode: 400,
    statusMessage: "Access method must be password or gmailInvite.",
  })
}

function normalizePassword(value: unknown) {
  const normalized = String(value ?? "").trim()

  if (normalized.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage: "Temporary password must be at least 8 characters.",
    })
  }

  return normalized
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const artistId = normalizeRequiredUuid(event.context.params?.id, "Artist id")
  const body = await readBody<RestoreAdminArtistAccessInput>(event)
  const supabase = serverSupabaseServiceRole(event)
  const artist = await loadAdminArtistLifecycleTarget(supabase, artistId)

  if (artist.is_active) {
    throw createError({
      statusCode: 409,
      statusMessage: "This artist already has active dashboard access.",
    })
  }

  const accessMethod = normalizeAccessMethod(body.accessMethod)
  const email = accessMethod === "gmailInvite"
    ? normalizeGmailInviteEmail(body.email, "Restore Gmail")
    : normalizeLoginEmail(body.email)
  const fullName = normalizeRequiredText(body.fullName, "Full name")
  const country = normalizeOptionalText(body.country)
  const bio = normalizeOptionalText(body.bio)

  let retiredOldUserId: string | null = null

  if (artist.user_id && await countLinkedArtists(supabase, artist.user_id, artist.id) === 0) {
    await setAccountBanState(supabase, artist.user_id, true)

    const { error: detachArtistError } = await supabase
      .from("artists")
      .update({
        user_id: null,
      })
      .eq("id", artistId)

    if (detachArtistError) {
      throw createError({
        statusCode: 500,
        statusMessage: detachArtistError.message,
      })
    }

    await deleteAuthUserOrFail(
      supabase,
      artist.user_id,
      "The old login account could not be removed before restoring access. It remains banned. Retry the cleanup.",
    )
    retiredOldUserId = artist.user_id
    artist.user_id = null
  }

  if (accessMethod === "password") {
    const password = normalizePassword(body.password)
    const { data: createdUserResult, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
      },
    })

    if (createUserError || !createdUserResult.user) {
      throw createError({
        statusCode: 500,
        statusMessage: createUserError?.message || "Unable to create the replacement login account.",
      })
    }

    const createdUser = createdUserResult.user

    const { error: profileError } = await supabase.from("profiles").insert({
      id: createdUser.id,
      full_name: fullName,
      role: "artist",
      country,
      bio,
      login_frozen_at: null,
      login_frozen_by: null,
    })

    if (profileError) {
      await supabase.auth.admin.deleteUser(createdUser.id)

      throw createError({
        statusCode: 500,
        statusMessage: profileError.message,
      })
    }

    const { error: artistUpdateError } = await supabase
      .from("artists")
      .update({
        user_id: createdUser.id,
        email,
        country,
        bio,
        is_active: true,
        deactivated_at: null,
        deactivated_by: null,
      })
      .eq("id", artistId)

    if (artistUpdateError) {
      await supabase.from("profiles").delete().eq("id", createdUser.id)
      await supabase.auth.admin.deleteUser(createdUser.id)

      throw createError({
        statusCode: 500,
        statusMessage: artistUpdateError.message,
      })
    }

    await logAdminActivity(supabase, profile.id, "artist.restored_access_password", "artist", artistId, {
      artist_name: artist.name,
      email,
      full_name: fullName,
      retired_login_user_id: retiredOldUserId,
    })

    return {
      ok: true,
      action: "restoreAccess",
      artistId,
      affectedUserId: createdUser.id,
      profileDeleted: Boolean(retiredOldUserId),
    } satisfies AdminArtistActionResponse
  }

  const [existingInviteResult, existingAuthUser] = await Promise.all([
    supabase
      .from("login_invites")
      .select("id, status")
      .eq("email", email)
      .maybeSingle<{ id: string; status: string }>(),
    findAuthUserByEmail(supabase, email),
  ])

  if (existingInviteResult.error) {
    throw createError({
      statusCode: 500,
      statusMessage: existingInviteResult.error.message,
    })
  }

  if (existingInviteResult.data) {
    throw createError({
      statusCode: 409,
      statusMessage: `An invite for ${email} already exists with status ${existingInviteResult.data.status}.`,
    })
  }

  if (existingAuthUser) {
    throw createError({
      statusCode: 409,
      statusMessage: "That Gmail already belongs to an existing Naad Backstage auth account.",
    })
  }

  const { data: invite, error: inviteError } = await supabase
    .from("login_invites")
    .insert({
      email,
      role: "artist",
      full_name: fullName,
      artist_name: artist.name,
      country,
      bio,
      provider: "google",
      status: "pending",
      invited_by: profile.id,
      target_artist_id: artistId,
    })
    .select("id")
    .single<{ id: string }>()

  if (inviteError || !invite) {
    throw createError({
      statusCode: 500,
      statusMessage: inviteError?.message || "Unable to create the restore Gmail invite.",
    })
  }

  await logAdminActivity(supabase, profile.id, "artist.restored_access_invite", "artist", artistId, {
    artist_name: artist.name,
    email,
    invite_id: invite.id,
    retired_login_user_id: retiredOldUserId,
  })

  return {
    ok: true,
    action: "restoreAccess",
    artistId,
    affectedUserId: null,
    profileDeleted: Boolean(retiredOldUserId),
    inviteId: invite.id,
  } satisfies AdminArtistActionResponse
})
