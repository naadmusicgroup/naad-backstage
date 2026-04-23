<script setup lang="ts">
import { artistNav } from "~/utils/navigation"
import type { ArtistNotificationsResponse } from "~~/types/dashboard"

const { activeArtistId } = useActiveArtist()
const { viewer, refreshViewerContext } = useViewerContext()
const { unreadNotificationCount, setUnreadNotificationCount } = useArtistNotificationState()
const isExitingViewAs = ref(false)
const notificationQuery = computed(() => {
  return activeArtistId.value
    ? { artistId: activeArtistId.value, limit: 5 }
    : { limit: 5 }
})
const { data: notificationData } = useLazyFetch<ArtistNotificationsResponse>("/api/dashboard/notifications", {
  query: notificationQuery,
})

watchEffect(() => {
  setUnreadNotificationCount(notificationData.value?.unreadCount ?? 0)
})

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
    subtitle="Wallet, statements, analytics, and account settings."
    panel-label="Artist"
    :nav-items="artistNav"
    notification-to="/dashboard/notifications"
    :notification-count="unreadNotificationCount"
  >
    <div v-if="viewer.impersonation?.active" class="banner impersonation-banner">
      <div>
        <strong>View-as mode is active.</strong>
        You are inspecting {{ viewer.impersonation.artistName }} as an admin. Artist-owned actions are read-only.
      </div>
      <button class="button button-secondary" type="button" :disabled="isExitingViewAs" @click="exitViewAsArtist">
        {{ isExitingViewAs ? "Exiting..." : "Exit view-as" }}
      </button>
    </div>
    <slot />
  </AppShell>
</template>

<style scoped>
.impersonation-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 24px;
}

@media (max-width: 640px) {
  .impersonation-banner {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
