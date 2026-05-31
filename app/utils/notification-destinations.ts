import type { RouteLocationRaw } from "vue-router"
import type { ArtistNotificationRecord, ArtistNotificationType } from "~~/types/dashboard"

const NOTIFICATION_DESTINATIONS: Record<ArtistNotificationType, RouteLocationRaw> = {
  due_added: {
    path: "/dashboard/wallet",
    query: { section: "dues" },
  },
  earnings_posted: {
    path: "/dashboard/statements",
  },
  payout_approved: {
    path: "/dashboard/wallet",
    query: { section: "history" },
  },
  payout_paid: {
    path: "/dashboard/wallet",
    query: { section: "history" },
  },
  payout_rejected: {
    path: "/dashboard/wallet",
    query: { section: "history" },
  },
}

export function notificationDestination(notification: ArtistNotificationRecord): RouteLocationRaw {
  return NOTIFICATION_DESTINATIONS[notification.type] ?? "/dashboard/notifications"
}
