import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import {
  normalizeOptionalText,
  normalizeRequiredText,
  normalizeRequiredUuid,
} from "~~/server/utils/catalog"
import {
  findAuthUserByEmail,
  normalizeEditableInviteStatus,
  normalizeGmailInviteEmail,
  normalizeInviteRole,
} from "~~/server/utils/invites"
import type {
  AdminLoginInviteMutationResponse,
  AdminLoginInviteRecord,
  LoginInviteProvider,
  LoginInviteRole,
  LoginInviteStatus,
  UpdateAdminLoginInviteInput,
} from "~~/types/settings"

interface LoginInviteRow {
  id: string
  email: string
  role: LoginInviteRole
  full_name: string
  artist_name: string | null
  country: string | null
  bio: string | null
  provider: LoginInviteProvider
  status: LoginInviteStatus
  invited_by: string
  accepted_by: string | null
  accepted_at: string | null
  revoked_by: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

interface ProfileLookupRow {
  id: string
  full_name: string | null
}

function mapInviteRow(row: LoginInviteRow, profileById: Map<string, ProfileLookupRow>): AdminLoginInviteRecord {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.full_name,
    artistName: row.artist_name,
    country: row.country,
    bio: row.bio,
    provider: row.provider,
    status: row.status,
    invitedByAdminId: row.invited_by,
    invitedByAdminName: profileById.get(row.invited_by)?.full_name ?? null,
    acceptedByUserId: row.accepted_by,
    acceptedByName: row.accepted_by ? profileById.get(row.accepted_by)?.full_name ?? null : null,
    acceptedAt: row.accepted_at,
    revokedByAdminId: row.revoked_by,
    revokedByAdminName: row.revoked_by ? profileById.get(row.revoked_by)?.full_name ?? null : null,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const inviteId = normalizeRequiredUuid(event.context.params?.id, "Invite id")
  const body = await readBody<UpdateAdminLoginInviteInput>(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data: existingInvite, error: existingInviteError } = await supabase
    .from("login_invites")
    .select("id, email, role, full_name, artist_name, country, bio, provider, status, invited_by, accepted_by, accepted_at, revoked_by, revoked_at, created_at, updated_at")
    .eq("id", inviteId)
    .maybeSingle<LoginInviteRow>()

  if (existingInviteError) {
    throw createError({
      statusCode: 500,
      statusMessage: existingInviteError.message,
    })
  }

  if (!existingInvite) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected invite does not exist.",
    })
  }

  if (existingInvite.status === "accepted") {
    throw createError({
      statusCode: 400,
      statusMessage: "Accepted invites are already provisioned and can no longer be edited here.",
    })
  }

  const nextEmail = typeof body.email === "undefined"
    ? existingInvite.email
    : normalizeGmailInviteEmail(body.email)
  const nextRole = typeof body.role === "undefined"
    ? existingInvite.role
    : normalizeInviteRole(body.role)
  const nextFullName = typeof body.fullName === "undefined"
    ? existingInvite.full_name
    : normalizeRequiredText(body.fullName, "Full name")
  const nextArtistName = nextRole === "artist"
    ? (typeof body.artistName === "undefined"
        ? normalizeRequiredText(existingInvite.artist_name, "Artist stage name")
        : normalizeRequiredText(body.artistName, "Artist stage name"))
    : null
  const nextCountry = typeof body.country === "undefined"
    ? existingInvite.country
    : normalizeOptionalText(body.country)
  const nextBio = typeof body.bio === "undefined"
    ? existingInvite.bio
    : normalizeOptionalText(body.bio)
  const nextStatus = typeof body.status === "undefined"
    ? existingInvite.status
    : normalizeEditableInviteStatus(body.status)

  if (nextEmail !== existingInvite.email) {
    const [duplicateInviteResult, existingAuthUser] = await Promise.all([
      supabase
        .from("login_invites")
        .select("id")
        .eq("email", nextEmail)
        .neq("id", inviteId)
        .maybeSingle<{ id: string }>(),
      findAuthUserByEmail(supabase, nextEmail),
    ])

    if (duplicateInviteResult.error) {
      throw createError({
        statusCode: 500,
        statusMessage: duplicateInviteResult.error.message,
      })
    }

    if (duplicateInviteResult.data) {
      throw createError({
        statusCode: 409,
        statusMessage: `Another invite already exists for ${nextEmail}.`,
      })
    }

    if (existingAuthUser) {
      throw createError({
        statusCode: 409,
        statusMessage: "That Gmail already belongs to an existing Naad Backstage auth account.",
      })
    }
  }

  const updatePayload: Record<string, string | null> = {}
  const changedFields: string[] = []
  let action = "login_invite.updated"

  if (nextEmail !== existingInvite.email) {
    updatePayload.email = nextEmail
    changedFields.push("email")
  }

  if (nextRole !== existingInvite.role) {
    updatePayload.role = nextRole
    changedFields.push("role")
  }

  if (nextFullName !== existingInvite.full_name) {
    updatePayload.full_name = nextFullName
    changedFields.push("full_name")
  }

  if (nextArtistName !== existingInvite.artist_name) {
    updatePayload.artist_name = nextArtistName
    changedFields.push("artist_name")
  }

  if (nextCountry !== existingInvite.country) {
    updatePayload.country = nextCountry
    changedFields.push("country")
  }

  if (nextBio !== existingInvite.bio) {
    updatePayload.bio = nextBio
    changedFields.push("bio")
  }

  if (nextStatus !== existingInvite.status) {
    updatePayload.status = nextStatus
    changedFields.push("status")

    if (nextStatus === "revoked") {
      updatePayload.revoked_at = new Date().toISOString()
      updatePayload.revoked_by = profile.id
      action = "login_invite.revoked"
    } else {
      updatePayload.revoked_at = null
      updatePayload.revoked_by = null
      action = "login_invite.reopened"
    }
  }

  if (!changedFields.length) {
    const profileById = new Map<string, ProfileLookupRow>([
      [profile.id, { id: profile.id, full_name: profile.full_name }],
    ])

    return {
      ok: true,
      invite: mapInviteRow(existingInvite, profileById),
    } satisfies AdminLoginInviteMutationResponse
  }

  const { data: updatedInvite, error: updateError } = await supabase
    .from("login_invites")
    .update(updatePayload)
    .eq("id", inviteId)
    .select("id, email, role, full_name, artist_name, country, bio, provider, status, invited_by, accepted_by, accepted_at, revoked_by, revoked_at, created_at, updated_at")
    .single<LoginInviteRow>()

  if (updateError || !updatedInvite) {
    throw createError({
      statusCode: 500,
      statusMessage: updateError?.message || "Unable to update the login invite.",
    })
  }

  await logAdminActivity(
    supabase,
    profile.id,
    action,
    "login_invite",
    inviteId,
    {
      email: updatedInvite.email,
      role: updatedInvite.role,
      changed_fields: changedFields,
      status: updatedInvite.status,
    },
  )

  const profileIds = [...new Set(
    [updatedInvite.invited_by, updatedInvite.accepted_by, updatedInvite.revoked_by].filter(Boolean) as string[],
  )]

  let profileRows: ProfileLookupRow[] = []

  if (profileIds.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: error.message,
      })
    }

    profileRows = (data ?? []) as ProfileLookupRow[]
  }

  return {
    ok: true,
    invite: mapInviteRow(updatedInvite, new Map(profileRows.map((row) => [row.id, row]))),
  } satisfies AdminLoginInviteMutationResponse
})
