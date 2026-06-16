import type { RouteLocationRaw } from "vue-router"
import type { AdminNotificationRecord, AdminNotificationType } from "~~/types/dashboard"

const ADMIN_NOTIFICATION_DESTINATIONS: Record<AdminNotificationType, string> = {
  release_submitted: "/admin/releases",
  release_change_requested: "/admin/releases",
  payout_requested: "/admin/payouts",
  publishing_submitted: "/admin/publishing",
  payout_details_changed: "/admin/payouts",
}

export function adminNotificationDestination(notification: AdminNotificationRecord): RouteLocationRaw {
  return notification.actionPath
    ?? ADMIN_NOTIFICATION_DESTINATIONS[notification.type]
    ?? "/admin/notifications"
}
