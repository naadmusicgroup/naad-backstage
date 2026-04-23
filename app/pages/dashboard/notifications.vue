<script setup lang="ts">
import type { ArtistNotificationRecord, ArtistNotificationsResponse } from "~~/types/dashboard"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

const FILTER_ALL = "all"
const FILTER_UNREAD = "unread"

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
})

const { activeArtistId } = useActiveArtist()
const { viewer } = useViewerContext()
const { setUnreadNotificationCount } = useArtistNotificationState()
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))
const filter = ref<typeof FILTER_ALL | typeof FILTER_UNREAD>(FILTER_ALL)
const markAllPending = ref(false)
const markingNotificationIds = ref(new Set<string>())
const mutationError = ref("")

const { data, error, pending, refresh } = useLazyFetch<ArtistNotificationsResponse>("/api/dashboard/notifications", {
  query: computed(() => (activeArtistId.value ? { artistId: activeArtistId.value } : undefined)),
})

const response = computed<ArtistNotificationsResponse>(() => (
  data.value ?? {
    notifications: [],
    unreadCount: 0,
  }
))
const notifications = computed(() => response.value.notifications)
const unreadCount = computed(() => response.value.unreadCount)
const visibleNotifications = computed(() => {
  if (filter.value === FILTER_UNREAD) {
    return notifications.value.filter((notification) => !notification.isRead)
  }

  return notifications.value
})
const latestNotification = computed(() => notifications.value[0] ?? null)
const notificationMetrics = computed(() => [
  {
    label: "Unread",
    value: unreadCount.value.toLocaleString(),
    footnote: unreadCount.value === 1 ? "1 item needs review." : `${unreadCount.value.toLocaleString()} items need review.`,
    tone: "accent" as const,
  },
  {
    label: "Total loaded",
    value: notifications.value.length.toLocaleString(),
    footnote: "Most recent notifications for the selected artist scope.",
    tone: "default" as const,
  },
  {
    label: "Latest event",
    value: latestNotification.value ? latestNotification.value.typeLabel : "No events",
    footnote: latestNotification.value ? formatDateTime(latestNotification.value.createdAt) : "Notifications will appear after account activity.",
    tone: "alt" as const,
  },
])

watchEffect(() => {
  setUnreadNotificationCount(unreadCount.value)
})

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

function notificationStatusClass(notification: ArtistNotificationRecord) {
  return notification.isRead ? "status-closed" : "status-processing"
}

function notificationTypeClass(notification: ArtistNotificationRecord) {
  switch (notification.type) {
    case "payout_rejected":
      return "status-failed"
    case "payout_paid":
    case "payout_approved":
      return "status-completed"
    case "due_added":
      return "status-processing"
    case "earnings_posted":
      return "status-reversed"
  }
}

function setNotificationBusy(notificationId: string, isBusy: boolean) {
  const next = new Set(markingNotificationIds.value)

  if (isBusy) {
    next.add(notificationId)
  } else {
    next.delete(notificationId)
  }

  markingNotificationIds.value = next
}

function isNotificationBusy(notificationId: string) {
  return markingNotificationIds.value.has(notificationId)
}

async function refreshNotifications() {
  mutationError.value = ""
  await refresh()
}

async function markNotificationRead(notification: ArtistNotificationRecord) {
  if (isViewingAsArtist.value) {
    mutationError.value = "View-as mode is read-only. Sign in as the artist to change notification read state."
    return
  }

  if (notification.isRead) {
    return
  }

  mutationError.value = ""
  setNotificationBusy(notification.id, true)

  try {
    await $fetch(`/api/dashboard/notifications/${notification.id}/read`, {
      method: "POST",
    })
    await refresh()
  } catch (error: any) {
    mutationError.value = error?.data?.statusMessage || error?.message || "Unable to mark this notification as read."
  } finally {
    setNotificationBusy(notification.id, false)
  }
}

async function markAllRead() {
  if (isViewingAsArtist.value) {
    mutationError.value = "View-as mode is read-only. Sign in as the artist to change notification read state."
    return
  }

  if (!unreadCount.value) {
    return
  }

  mutationError.value = ""
  markAllPending.value = true

  try {
    await $fetch("/api/dashboard/notifications/mark-read", {
      method: "POST",
      body: activeArtistId.value ? { artistId: activeArtistId.value } : {},
    })
    await refresh()
  } catch (error: any) {
    mutationError.value = error?.data?.statusMessage || error?.message || "Unable to mark notifications as read."
  } finally {
    markAllPending.value = false
  }
}
</script>

<template>
  <div class="page">
    <SectionCard
      title="Notifications"
      eyebrow="Artist inbox"
      description="Review earnings, payout, and due events generated by admin workflows. Marking items read only changes your inbox state."
    >
      <div class="button-row">
        <button class="button" type="button" :disabled="isViewingAsArtist || markAllPending || !unreadCount" @click="markAllRead">
          {{ markAllPending ? "Marking..." : "Mark all read" }}
        </button>
        <button class="button button-secondary" type="button" :disabled="pending" @click="refreshNotifications">
          {{ pending ? "Refreshing..." : "Refresh" }}
        </button>
      </div>

      <div v-if="mutationError" class="banner error">{{ mutationError }}</div>
      <div v-if="isViewingAsArtist" class="banner">
        View-as mode is read-only. Notification read-state changes are disabled for admins.
      </div>
      <div v-if="error" class="banner error">
        {{ error.statusMessage || "Unable to load notifications right now." }}
      </div>

      <div v-else-if="pending && !data" class="status-message">Loading notifications...</div>

      <template v-else>
        <div class="metrics">
          <MetricCard
            v-for="metric in notificationMetrics"
            :key="metric.label"
            :label="metric.label"
            :value="metric.value"
            :footnote="metric.footnote"
            :tone="metric.tone"
          />
        </div>

        <div class="notification-toolbar">
          <div class="field-row">
            <label for="notification-filter">Filter</label>
            <select id="notification-filter" v-model="filter" class="input">
              <option :value="FILTER_ALL">All notifications</option>
              <option :value="FILTER_UNREAD">Unread only</option>
            </select>
          </div>
          <span class="detail-copy">
            Showing {{ visibleNotifications.length.toLocaleString() }} of {{ notifications.length.toLocaleString() }} loaded notifications.
          </span>
        </div>
      </template>
    </SectionCard>

    <SectionCard
      title="Inbox"
      eyebrow="Timeline"
      description="The newest events appear first. Notifications stay visible after they are read for audit context."
    >
      <div v-if="pending && !data" class="status-message">Loading inbox...</div>

      <div v-else-if="!notifications.length" class="muted-copy">
        No notifications exist yet. Earnings commits, payout decisions, and dues will appear here once they happen.
      </div>

      <div v-else-if="!visibleNotifications.length" class="muted-copy">
        No unread notifications remain for this artist scope.
      </div>

      <div v-else class="catalog-list">
        <article
          v-for="notification in visibleNotifications"
          :key="notification.id"
          class="catalog-item notification-card"
          :class="{ 'notification-card-unread': !notification.isRead }"
        >
          <div class="catalog-header">
            <div class="summary-copy">
              <strong>{{ notification.title }}</strong>
              <span class="detail-copy">
                {{ notification.artistName }} / {{ formatDateTime(notification.createdAt) }}
              </span>
            </div>
            <div class="table-actions">
              <span class="status-pill" :class="notificationTypeClass(notification)">
                {{ notification.typeLabel }}
              </span>
              <span class="status-pill" :class="notificationStatusClass(notification)">
                {{ notification.isRead ? "Read" : "Unread" }}
              </span>
            </div>
          </div>

          <p v-if="notification.message" class="detail-copy notification-message">
            {{ notification.message }}
          </p>

          <div v-if="!notification.isRead" class="button-row">
            <button
              class="button button-secondary"
              type="button"
              :disabled="isViewingAsArtist || isNotificationBusy(notification.id)"
              @click="markNotificationRead(notification)"
            >
              {{ isNotificationBusy(notification.id) ? "Marking..." : "Mark read" }}
            </button>
          </div>
        </article>
      </div>
    </SectionCard>
  </div>
</template>

<style scoped>
.notification-toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 18px;
}

.notification-toolbar .field-row {
  min-width: min(100%, 260px);
}

.notification-card {
  transition: border-color 160ms ease, background 160ms ease;
}

.notification-card-unread {
  border-color: rgba(198, 86, 47, 0.34);
  background:
    radial-gradient(circle at top right, rgba(198, 86, 47, 0.12), transparent 32%),
    var(--surface-muted);
}

.notification-message {
  margin: 0;
}
</style>
