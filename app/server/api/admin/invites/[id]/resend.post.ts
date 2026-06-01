import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { sendLoginInviteEmail } from "~~/server/utils/email"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type {
  AdminLoginInviteMutationResponse,
  AdminLoginInviteRecord,
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
  const supabase = serverSupabaseServiceRole(event)

  const { data: invite, error } = await supabase
    .from("login_invites")
    .select("id, email, role, full_name, artist_name, country, bio, provider, status, invited_by, accepted_by, accepted_at, revoked_by, revoked_at, created_at, updated_at")
    .eq("id", inviteId)
    .maybeSingle<LoginInviteRow>()

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  if (!invite) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected invite does not exist.",
    })
  }

  if (invite.status !== "pending") {
    throw createError({
      statusCode: 409,
      statusMessage: "Only pending invites can be resent.",
    })
  }

  const profileIds = [...new Set([invite.invited_by, invite.accepted_by, invite.revoked_by, profile.id].filter(Boolean) as string[])]
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", profileIds)

  if (profileError) {
    throw createError({
      statusCode: 500,
      statusMessage: profileError.message,
    })
  }

  const profileById = new Map((profileRows ?? []).map((row: ProfileLookupRow) => [row.id, row]))
  const invitedByName = profileById.get(invite.invited_by)?.full_name ?? profile.full_name ?? null
  const emailDelivery = await sendLoginInviteEmail(event, {
    email: invite.email,
    role: invite.role,
    fullName: invite.full_name,
    artistName: invite.artist_name,
    invitedByName,
  })

  await logAdminActivity(supabase, profile.id, "login_invite.email_resent", "login_invite", invite.id, {
    email: invite.email,
    role: invite.role,
    email_delivery: emailDelivery,
  })

  return {
    ok: true,
    invite: mapInviteRow(invite, profileById),
    emailDelivery,
  } satisfies AdminLoginInviteMutationResponse
})
