import { createError, readBody } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeOptionalText, normalizeRequiredText } from "~~/server/utils/catalog"
import {
  findAuthUserByEmail,
  normalizeGmailInviteEmail,
  normalizeInviteRole,
} from "~~/server/utils/invites"
import type {
  AdminLoginInviteMutationResponse,
  AdminLoginInviteRecord,
  CreateAdminLoginInviteInput,
  LoginInviteProvider,
  LoginInviteRole,
  LoginInviteStatus,
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

function mapInviteRow(row: LoginInviteRow, invitedByName: string | null): AdminLoginInviteRecord {
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
    invitedByAdminName: invitedByName,
    acceptedByUserId: row.accepted_by,
    acceptedByName: null,
    acceptedAt: row.accepted_at,
    revokedByAdminId: row.revoked_by,
    revokedByAdminName: null,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const body = await readBody<CreateAdminLoginInviteInput>(event)
  const supabase = serverSupabaseServiceRole(event)

  const email = normalizeGmailInviteEmail(body.email)
  const role = normalizeInviteRole(body.role)
  const fullName = normalizeRequiredText(body.fullName, "Full name")
  const artistName = role === "artist"
    ? normalizeRequiredText(body.artistName, "Artist stage name")
    : null
  const country = normalizeOptionalText(body.country)
  const bio = normalizeOptionalText(body.bio)

  const [existingInviteResult, existingAuthUser] = await Promise.all([
    supabase
      .from("login_invites")
      .select("id, status")
      .eq("email", email)
      .maybeSingle<{ id: string; status: LoginInviteStatus }>(),
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
      role,
      full_name: fullName,
      artist_name: artistName,
      country,
      bio,
      invited_by: profile.id,
      provider: "google",
      status: "pending",
    })
    .select("id, email, role, full_name, artist_name, country, bio, provider, status, invited_by, accepted_by, accepted_at, revoked_by, revoked_at, created_at, updated_at")
    .single<LoginInviteRow>()

  if (inviteError || !invite) {
    throw createError({
      statusCode: 500,
      statusMessage: inviteError?.message || "Unable to create the login invite.",
    })
  }

  await logAdminActivity(
    supabase,
    profile.id,
    "login_invite.created",
    "login_invite",
    invite.id,
    {
      email,
      role,
      full_name: fullName,
      artist_name: artistName,
      provider: "google",
    },
  )

  const { data: invitedByProfile } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", profile.id)
    .maybeSingle<ProfileLookupRow>()

  return {
    ok: true,
    invite: mapInviteRow(invite, invitedByProfile?.full_name ?? profile.full_name ?? null),
  } satisfies AdminLoginInviteMutationResponse
})

