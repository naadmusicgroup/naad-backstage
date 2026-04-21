import { createError } from "h3"
import { serverSupabaseServiceRole } from "#supabase/server"
import { requireAdminProfile } from "~~/server/utils/auth"
import type {
  AdminInvitesResponse,
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

function throwIfError(error: { message?: string | null } | null, fallback: string) {
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message || fallback,
    })
  }
}

export default defineEventHandler(async (event) => {
  await requireAdminProfile(event)
  const supabase = serverSupabaseServiceRole(event)

  const { data: inviteRows, error: inviteError } = await supabase
    .from("login_invites")
    .select("id, email, role, full_name, artist_name, country, bio, provider, status, invited_by, accepted_by, accepted_at, revoked_by, revoked_at, created_at, updated_at")
    .order("created_at", { ascending: false })

  throwIfError(inviteError, "Unable to load login invites.")

  const rows = (inviteRows ?? []) as LoginInviteRow[]
  const profileIds = [...new Set(
    rows.flatMap((row) => [row.invited_by, row.accepted_by, row.revoked_by].filter(Boolean) as string[]),
  )]

  let profileRows: ProfileLookupRow[] = []

  if (profileIds.length) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds)

    throwIfError(error, "Unable to load invite admin names.")
    profileRows = (data ?? []) as ProfileLookupRow[]
  }

  const profileById = new Map(profileRows.map((row) => [row.id, row]))
  const invites = rows.map((row) => ({
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
  })) satisfies AdminLoginInviteRecord[]

  return {
    summary: {
      pendingCount: invites.filter((invite) => invite.status === "pending").length,
      acceptedCount: invites.filter((invite) => invite.status === "accepted").length,
      revokedCount: invites.filter((invite) => invite.status === "revoked").length,
      artistInviteCount: invites.filter((invite) => invite.role === "artist").length,
      adminInviteCount: invites.filter((invite) => invite.role === "admin").length,
    },
    invites,
  } satisfies AdminInvitesResponse
})
