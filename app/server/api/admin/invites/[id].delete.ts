import { createError } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import { requireAdminProfile } from "~~/server/utils/auth"
import { logAdminActivity } from "~~/server/utils/admin-log"
import { normalizeRequiredUuid } from "~~/server/utils/catalog"
import type {
  AdminLoginInviteDeleteResponse,
  LoginInviteRole,
  LoginInviteStatus,
} from "~~/types/settings"

interface LoginInviteDeleteRow {
  id: string
  email: string
  role: LoginInviteRole
  status: LoginInviteStatus
  target_artist_id: string | null
}

export default defineEventHandler(async (event) => {
  const { profile } = await requireAdminProfile(event)
  const inviteId = normalizeRequiredUuid(event.context.params?.id, "Invite id")
  const supabase = serverSupabaseServiceRole(event)

  const { data: invite, error: inviteError } = await supabase
    .from("login_invites")
    .select("id, email, role, status, target_artist_id")
    .eq("id", inviteId)
    .maybeSingle<LoginInviteDeleteRow>()

  if (inviteError) {
    throw createError({
      statusCode: 500,
      statusMessage: inviteError.message,
    })
  }

  if (!invite) {
    throw createError({
      statusCode: 404,
      statusMessage: "The selected invite does not exist.",
    })
  }

  if (invite.status === "accepted") {
    throw createError({
      statusCode: 409,
      statusMessage: "Accepted invites already created dashboard access and cannot be deleted here.",
    })
  }

  const { error: activityCleanupError } = await supabase
    .from("admin_activity_log")
    .delete()
    .eq("entity_type", "login_invite")
    .eq("entity_id", inviteId)

  if (activityCleanupError) {
    throw createError({
      statusCode: 500,
      statusMessage: activityCleanupError.message,
    })
  }

  const { error: deleteError } = await supabase
    .from("login_invites")
    .delete()
    .eq("id", inviteId)
    .neq("status", "accepted")

  if (deleteError) {
    throw createError({
      statusCode: 500,
      statusMessage: deleteError.message,
    })
  }

  await logAdminActivity(
    supabase,
    profile.id,
    "login_invite.deleted",
    "login_invite",
    inviteId,
    {
      role: invite.role,
      status: invite.status,
      target_artist_id: invite.target_artist_id,
    },
  )

  return {
    ok: true,
    inviteId,
    email: invite.email,
  } satisfies AdminLoginInviteDeleteResponse
})
