<script setup lang="ts">
import { artistNav } from "~/utils/navigation"
import { notificationDestination } from "~/utils/notification-destinations"
import type { ArtistNotificationsResponse, ShellNotificationPreviewItem } from "~~/types/dashboard"

const { activeArtistId } = useActiveArtist()

const MOBILE_TAB_ROUTES = ["/dashboard", "/dashboard/releases", "/dashboard/analytics", "/dashboard/wallet"]
const artistMobileTabs = computed(() =>
  MOBILE_TAB_ROUTES
    .map((to) => artistNav.find((item) => item.to === to))
    .filter((item) => item !== undefined),
)
const { viewer, refreshViewerContext } = useViewerContext()
const { unreadNotificationCount, setUnreadNotificationCount } = useArtistNotificationState()
const isExitingViewAs = ref(false)
const isMarkingNotificationsSeen = ref(false)
const notificationQuery = computed(() => {
  return activeArtistId.value
    ? { artistId: activeArtistId.value, limit: 5 }
    : { limit: 5 }
})
const {
  data: notificationData,
  error: notificationError,
  refresh: refreshNotificationPreview,
} = useLazyFetch<ArtistNotificationsResponse>("/api/dashboard/notifications", {
  query: notificationQuery,
})
const notificationPreviewItems = computed<ShellNotificationPreviewItem[]>(() =>
  (notificationData.value?.notifications ?? []).map((notification) => ({
    id: notification.id,
    title: notification.title,
    message: notification.message,
    isRead: notification.isRead,
    createdAt: notification.createdAt,
    to: notificationDestination(notification),
  })),
)

provideArtistNotificationPreview({
  data: notificationData,
  error: notificationError,
  refresh: refreshNotificationPreview,
})

watchEffect(() => {
  setUnreadNotificationCount(notificationData.value?.unreadCount ?? 0)
})

watch(
  unreadNotificationCount,
  (count, previousCount) => {
    if (!isMarkingNotificationsSeen.value && count === 0 && Number(previousCount ?? 0) > 0) {
      void refreshNotificationPreview()
    }
  },
)

async function markNotificationsSeen() {
  if (viewer.value.impersonation?.active || isMarkingNotificationsSeen.value || !unreadNotificationCount.value) {
    return
  }

  isMarkingNotificationsSeen.value = true

  try {
    await $fetch("/api/dashboard/notifications/mark-read", {
      method: "POST",
      body: activeArtistId.value ? { artistId: activeArtistId.value } : {},
    })
    setUnreadNotificationCount(0)
    await refreshNotificationPreview()
  } catch {
    await refreshNotificationPreview()
  } finally {
    isMarkingNotificationsSeen.value = false
  }
}

async function exitViewAsArtist() {
  isExitingViewAs.value = true

  try {
    await $fetch("/api/admin/impersonation", {
      method: "DELETE",
    })
    await refreshViewerContext(true)
    await navigateTo("/admin/artists")
  } finally {
    isExitingViewAs.value = false
  }
}
</script>

<template>
  <AppShell
    title="Artist Dashboard"
    subtitle="Dashboard, wallet, statements, analytics, and account settings."
    panel-label="Artist"
    :nav-items="artistNav"
    :mobile-tabs="artistMobileTabs"
    notification-to="/dashboard/notifications"
    :notification-count="unreadNotificationCount"
    :notification-preview-items="notificationPreviewItems"
    @notification-menu-opened="markNotificationsSeen"
  >
    <AppAlert v-if="viewer.impersonation?.active" variant="warning" title="View-as mode is active." class="mb-4">
      You are inspecting {{ viewer.impersonation.artistName }} as an admin. Artist-owned actions are read-only.
      <template #action>
        <Button variant="secondary" type="button" :disabled="isExitingViewAs" @click="exitViewAsArtist">
          {{ isExitingViewAs ? "Exiting..." : "Exit view-as" }}
        </Button>
      </template>
    </AppAlert>
    <slot />
  </AppShell>
</template>
