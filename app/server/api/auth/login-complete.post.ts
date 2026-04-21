import { createError } from "h3"
import { serverSupabaseClient, serverSupabaseServiceRole, serverSupabaseUser } from "#supabase/server"
import { resolveSupabaseAuthUserId } from "~~/server/utils/auth"
import { normalizeOptionalText } from "~~/server/utils/catalog"
import {
  isCurrentGoogleAuthSession,
  isGmailAddress,
  normalizeStoredEmail,
} from "~~/server/utils/invites"
import type { AppRole } from "~~/types/auth"
import type { LoginInviteRole, LoginInviteStatus } from "~~/types/settings"

interface ProfileRow {
  id: string
  role: AppRole
}

interface LoginInviteRow {
  id: string
  email: string
  role: LoginInviteRole
  full_name: string
  artist_name: string | null
  country: string | null
  bio: string | null
  target_artist_id: string | null
  status: LoginInviteStatus
}

function inviteRejection(message: string): never {
  throw createError({
    statusCode: 403,
    statusMessage: message,
  })
}

async function deleteUnauthorizedOAuthUser(supabase: any, userId: string) {
  try {
    await supabase.auth.admin.deleteUser(userId)
  } catch {
    // If deletion fails, still reject the session. The user will remain blocked by the missing app profile.
  }
}

async function provisionInviteProfile(
  supabase: any,
  userId: string,
  email: string,
  invite: LoginInviteRow,
) {
  const country = normalizeOptionalText(invite.country)
  const bio = normalizeOptionalText(invite.bio)

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        full_name: invite.full_name,
        role: invite.role,
        country,
        bio,
      },
      {
        onConflict: "id",
      },
    )

  if (profileError) {
    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  if (invite.role === "artist") {
    if (invite.target_artist_id) {
      const { data: targetArtist, error: targetArtistError } = await supabase
        .from("artists")
        .select("id, is_active")
        .eq("id", invite.target_artist_id)
        .maybeSingle()

      if (targetArtistError) {
        throw createError({
          statusCode: 500,
          statusMessage: targetArtistError.message,
        })
      }

      if (!targetArtist || targetArtist.is_active) {
        await deleteUnauthorizedOAuthUser(supabase, userId)
        inviteRejection("This restore invite is no longer valid. Ask an admin to issue a new access restore.")
      }

      const { error: updateArtistError } = await supabase
        .from("artists")
        .update({
          user_id: userId,
          name: invite.artist_name,
          email,
          country,
          bio,
          is_active: true,
          deactivated_at: null,
          deactivated_by: null,
        })
        .eq("id", invite.target_artist_id)

      if (updateArtistError) {
        throw createError({
          statusCode: 500,
          statusMessage: updateArtistError.message,
        })
      }
    } else {
      const { data: existingArtist, error: existingArtistError } = await supabase
        .from("artists")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (existingArtistError) {
        throw createError({
          statusCode: 500,
          statusMessage: existingArtistError.message,
        })
      }

      if (existingArtist) {
        const { error: updateArtistError } = await supabase
          .from("artists")
          .update({
            name: invite.artist_name,
            email,
            country,
            bio,
            is_active: true,
            deactivated_at: null,
            deactivated_by: null,
          })
          .eq("id", existingArtist.id)

        if (updateArtistError) {
          throw createError({
            statusCode: 500,
            statusMessage: updateArtistError.message,
          })
        }
      } else {
        const { error: createArtistError } = await supabase
          .from("artists")
          .insert({
            user_id: userId,
            name: invite.artist_name,
            email,
            country,
            bio,
            is_active: true,
          })

        if (createArtistError) {
          throw createError({
            statusCode: 500,
            statusMessage: createArtistError.message,
          })
        }
      }
    }
  }

  const { error: inviteError } = await supabase
    .from("login_invites")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_by: userId,
      revoked_at: null,
      revoked_by: null,
    })
    .eq("id", invite.id)

  if (inviteError) {
    throw createError({
      statusCode: 500,
      statusMessage: inviteError.message,
    })
  }
}

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event)

  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: "You must be signed in to complete login.",
    })
  }

  const userId = resolveSupabaseAuthUserId(user)

  if (!userId) {
    throw createError({
      statusCode: 401,
      statusMessage: "Your session is missing a valid user id.",
    })
  }

  const normalizedEmail = normalizeStoredEmail(user.email)
  const client = await serverSupabaseClient(event)
  const service = serverSupabaseServiceRole(event)
  const isGoogleSession = isCurrentGoogleAuthSession(user)

  const { data: existingProfile, error: profileError } = await client
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle<ProfileRow>()

  if (profileError) {
    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  if (isGoogleSession) {
    if (!normalizedEmail || !isGmailAddress(normalizedEmail)) {
      if (!existingProfile) {
        await deleteUnauthorizedOAuthUser(service, userId)
      }

      inviteRejection("Only invited Gmail accounts can use Google sign-in for Naad Backstage.")
    }
  }

  if (!existingProfile) {
    if (!normalizedEmail) {
      if (isGoogleSession) {
        await deleteUnauthorizedOAuthUser(service, userId)
      }

      inviteRejection("This account does not have a valid login email yet.")
    }

    const { data: invite, error: inviteError } = await service
      .from("login_invites")
      .select("id, email, role, full_name, artist_name, country, bio, target_artist_id, status")
      .eq("email", normalizedEmail)
      .in("status", ["pending", "accepted"])
      .maybeSingle<LoginInviteRow>()

    if (inviteError) {
      throw createError({
        statusCode: 500,
        statusMessage: inviteError.message,
      })
    }

    if (!invite) {
      if (isGoogleSession) {
        await deleteUnauthorizedOAuthUser(service, userId)
      }

      inviteRejection("This Google account is not invited for Naad Backstage yet. Ask an admin to add it from the invite list first.")
    }

    const provisioningInvite = invite
    await provisionInviteProfile(service, userId, normalizedEmail as string, provisioningInvite)
  }

  const { error: profileUpdateError } = await service
    .from("profiles")
    .update({
      last_login_at: new Date().toISOString(),
    })
    .eq("id", userId)

  if (profileUpdateError) {
    throw createError({
      statusCode: 500,
      statusMessage: profileUpdateError.message,
    })
  }

  if (normalizedEmail) {
    const { error: artistEmailError } = await service
      .from("artists")
      .update({
        email: normalizedEmail,
      })
      .eq("user_id", userId)

    if (artistEmailError) {
      throw createError({
        statusCode: 500,
        statusMessage: artistEmailError.message,
      })
    }
  }

  return {
    ok: true,
  }
})
