import type { H3Event } from "h3"
import { serverSupabaseServiceRole } from "~~/server/utils/supabase"
import type { AdminNotificationRecord, AdminNotificationType } from "~~/types/dashboard"

interface AdminNotificationArtistJoinRow {
  name: string
}

export interface AdminNotificationRow {
  id: string
  type: AdminNotificationType
  title: string
  message: string | null
  artist_id: string | null
  reference_id: string | null
  action_path: string | null
  is_read: boolean
  created_at: string
  artists: AdminNotificationArtistJoinRow | AdminNotificationArtistJoinRow[] | null
}

export interface CreateAdminNotificationInput {
  type: AdminNotificationType
  title: string
  message?: string | null
  artistId?: string | null
  referenceId?: string | null
  actionPath?: string | null
}

const ADMIN_NOTIFICATION_LABELS: Record<AdminNotificationType, string> = {
  release_submitted: "Release submitted",
  release_change_requested: "Catalog request",
  payout_requested: "Payout request",
  publishing_submitted: "Publishing submitted",
  payout_details_changed: "Payout details changed",
}

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export function adminNotificationTypeLabel(type: AdminNotificationType) {
  return ADMIN_NOTIFICATION_LABELS[type] ?? "Notification"
}

export function mapAdminNotificationRecord(row: AdminNotificationRow): AdminNotificationRecord {
  const artist = unwrapJoinRow(row.artists)

  return {
    id: row.id,
    type: row.type,
    typeLabel: adminNotificationTypeLabel(row.type),
    title: row.title,
    message: row.message,
    artistId: row.artist_id,
    artistName: artist?.name ?? null,
    referenceId: row.reference_id,
    actionPath: row.action_path,
    isRead: row.is_read,
    createdAt: row.created_at,
  }
}

/**
 * Best-effort insert of an admin-facing notification. Mirrors the existing
 * admin email alerts — read state is shared across all admins, so a single row
 * (not one per admin) is created and the first admin to view it clears it for
 * everyone. Failures are swallowed so a notification problem never blocks the
 * underlying artist action.
 */
export async function createAdminNotification(event: H3Event, input: CreateAdminNotificationInput) {
  try {
    const supabase = serverSupabaseServiceRole(event)
    const { error } = await supabase.from("admin_notifications").insert({
      type: input.type,
      title: input.title,
      message: input.message ?? null,
      artist_id: input.artistId ?? null,
      reference_id: input.referenceId ?? null,
      action_path: input.actionPath ?? null,
    })

    if (error) {
      console.error(`[admin-notifications] Unable to create notification: ${error.message}`)
      return { ok: false, errorMessage: error.message }
    }

    return { ok: true }
  } catch (error: any) {
    console.error(`[admin-notifications] Unexpected error creating notification: ${error?.message ?? error}`)
    return { ok: false, errorMessage: String(error?.message ?? error) }
  }
}
