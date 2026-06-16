<script setup lang="ts">
import { adminNav } from "~/utils/navigation"
import { adminNotificationDestination } from "~/utils/admin-notification-destinations"
import type { AdminNotificationsResponse, ShellNotificationPreviewItem } from "~~/types/dashboard"

const { unreadNotificationCount, setUnreadNotificationCount } = useAdminNotificationState()
const isMarkingNotificationsSeen = ref(false)

const {
  data: notificationData,
  refresh: refreshNotificationPreview,
} = useLazyFetch<AdminNotificationsResponse>("/api/admin/notifications", {
  query: { limit: 5 },
})

const notificationPreviewItems = computed<ShellNotificationPreviewItem[]>(() =>
  (notificationData.value?.notifications ?? []).map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
    to: adminNotificationDestination(notification),
  })),
)

watchEffect(() => {
  setUnreadNotificationCount(notificationData.value?.unreadCount ?? 0)
})

// Read state is shared across admins — opening the menu clears the queue for all.
async function markNotificationsSeen() {
  if (isMarkingNotificationsSeen.value || !unreadNotificationCount.value) {
    return
  }

  isMarkingNotificationsSeen.value = true

  try {
    await $fetch("/api/admin/notifications/mark-read", { method: "POST" })
    setUnreadNotificationCount(0)
    await refreshNotificationPreview()
  } catch {
    await refreshNotificationPreview()
  } finally {
    isMarkingNotificationsSeen.value = false
  }
}
</script>

<template>
  <AppShell
    class="app-density-compact"
    title="Admin Panel"
    subtitle="Catalog writes, royalty ingestion, payouts, and audit controls."
    panel-label="Admin"
    :nav-items="adminNav"
    notification-to="/admin/notifications"
    :notification-count="unreadNotificationCount"
    :notification-preview-items="notificationPreviewItems"
    @notification-menu-opened="markNotificationsSeen"
  >
    <slot />
  </AppShell>
</template>
