import type { SupabaseClient } from "@supabase/supabase-js"
import { createError } from "h3"
import type { ArtistNotificationRecord, ArtistNotificationType } from "~~/types/dashboard"

interface NotificationArtistJoinRow {
  id: string
  name: string
}

export interface NotificationRow {
  id: string
  artist_id: string
  title: string
  message: string | null
  type: ArtistNotificationType
  reference_id: string | null
  is_read: boolean
  created_at: string
  updated_at: string
  artists: NotificationArtistJoinRow | NotificationArtistJoinRow[] | null
}

export interface NotificationScopeArtist {
  id: string
  name: string
}

const NOTIFICATION_LABELS: Record<ArtistNotificationType, string> = {
  earnings_posted: "Earnings posted",
  payout_approved: "Payout approved",
  payout_rejected: "Payout rejected",
  payout_paid: "Payout paid",
  due_added: "Due added",
}

function unwrapJoinRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export async function resolveNotificationScopeArtists(
  supabase: SupabaseClient<any>,
  profileId: string,
  requestedArtistId = "",
) {
  const { data, error } = await supabase
    .from("artists")
    .select("id, name")
    .eq("user_id", profileId)
    .eq("is_active", true)
    .order("name", { ascending: true })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: error.message,
    })
  }

  const ownedArtists = (data ?? []) as NotificationScopeArtist[]

  if (requestedArtistId && !ownedArtists.some((artist) => artist.id === requestedArtistId)) {
    throw createError({
      statusCode: 403,
      statusMessage: "You can only manage notifications for artist profiles on your own account.",
    })
  }

  return requestedArtistId
    ? ownedArtists.filter((artist) => artist.id === requestedArtistId)
    : ownedArtists
}

export function mapArtistNotificationRecord(row: NotificationRow): ArtistNotificationRecord {
  const artist = unwrapJoinRow(row.artists)

  return {
    id: row.id,
    artistId: row.artist_id,
    artistName: artist?.name ?? "Unknown artist",
    title: row.title,
    message: row.message,
    type: row.type,
    typeLabel: NOTIFICATION_LABELS[row.type] ?? "Notification",
    referenceId: row.reference_id,
    isRead: row.is_read,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
