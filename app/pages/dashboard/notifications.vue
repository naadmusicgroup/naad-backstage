<script setup lang="ts">
import { Bell } from "lucide-vue-next"
import { notificationDestination } from "~/utils/notification-destinations"
import type { ArtistNotificationRecord, ArtistNotificationsResponse } from "~~/types/dashboard"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
  keepalive: true,
})

const NOTIFICATIONS_PER_PAGE = 10

const { activeArtistId } = useActiveArtist()
const { viewer } = useViewerContext()
const { setUnreadNotificationCount } = useArtistNotificationState()
const isViewingAsArtist = computed(() => Boolean(viewer.value.impersonation?.active))
const page = ref(1)
const autoMarkPending = ref(false)
const mutationError = ref("")
const currentTime = ref(Date.now())
let relativeTimeTimer: ReturnType<typeof setInterval> | undefined
const notificationQuery = computed(() => ({
  ...(activeArtistId.value ? { artistId: activeArtistId.value } : {}),
  limit: NOTIFICATIONS_PER_PAGE,
  page: page.value,
}))

const { data, error, pending, refresh } = useLazyFetch<ArtistNotificationsResponse>("/api/dashboard/notifications", {
  query: notificationQuery,
})

useRevealPage({
  ready: computed(() => !pending.value || !!data.value),
})

const response = computed<ArtistNotificationsResponse>(() => (
  data.value ?? {
    notifications: [],
    unreadCount: 0,
    totalCount: 0,
    pagination: {
      page: page.value,
      pageSize: NOTIFICATIONS_PER_PAGE,
      totalCount: 0,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    },
  }
))
const notifications = computed(() => response.value.notifications)
const unreadCount = computed(() => response.value.unreadCount)
const totalCount = computed(() => response.value.totalCount)
const pagination = computed(() => response.value.pagination)
const paginationSummary = computed(() => {
  const filteredCount = pagination.value.totalCount

  if (!filteredCount) {
    return "No notifications"
  }

  const from = (pagination.value.page - 1) * pagination.value.pageSize + 1
  const to = Math.min(pagination.value.page * pagination.value.pageSize, filteredCount)

  return `Showing ${from.toLocaleString()}-${to.toLocaleString()} of ${filteredCount.toLocaleString()} notifications. ${NOTIFICATIONS_PER_PAGE} per page.`
})

watchEffect(() => {
  setUnreadNotificationCount(unreadCount.value)
})

watch(
  () => activeArtistId.value,
  () => {
    page.value = 1
  },
)

watch(
  () => data.value?.pagination?.page,
  (value) => {
    if (typeof value === "number" && value !== page.value) {
      page.value = value
    }
  },
)

onMounted(() => {
  relativeTimeTimer = setInterval(() => {
    currentTime.value = Date.now()
  }, 60_000)
})

onBeforeUnmount(() => {
  if (relativeTimeTimer) {
    clearInterval(relativeTimeTimer)
  }
})

function pluralizeTimeUnit(value: number, singular: string, plural: string) {
  return `${value.toLocaleString()} ${value === 1 ? singular : plural} ago`
}

function formatRelativeTime(value: string) {
  const createdAt = new Date(value).getTime()

  if (!Number.isFinite(createdAt)) {
    return "just now"
  }

  const elapsedSeconds = Math.max(0, Math.floor((currentTime.value - createdAt) / 1000))
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)

  if (elapsedMinutes < 1) {
    return "just now"
  }

  if (elapsedMinutes < 60) {
    return pluralizeTimeUnit(elapsedMinutes, "min", "mins")
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60)

  if (elapsedHours < 24) {
    return pluralizeTimeUnit(elapsedHours, "hr", "hrs")
  }

  const elapsedDays = Math.floor(elapsedHours / 24)

  return pluralizeTimeUnit(elapsedDays, "day", "days")
}

function notificationTypeTone(notification: ArtistNotificationRecord) {
  switch (notification.type) {
    case "payout_rejected":
      return "danger"
    case "payout_paid":
    case "payout_approved":
    case "earnings_posted":
      return "success"
    case "due_added":
      return "warning"
  }
}

async function refreshNotifications() {
  mutationError.value = ""
  await refresh()
}

async function markNotificationsSeen() {
  if (isViewingAsArtist.value) {
    mutationError.value = "View-as mode is read-only. Sign in as the artist to change notification read state."
    return
  }

  if (!unreadCount.value || autoMarkPending.value) {
    return
  }

  mutationError.value = ""
  autoMarkPending.value = true

  try {
    await $fetch("/api/dashboard/notifications/mark-read", {
      method: "POST",
      body: activeArtistId.value ? { artistId: activeArtistId.value } : {},
    })
    setUnreadNotificationCount(0)
    await refresh()
  } catch (error: any) {
    mutationError.value = error?.data?.statusMessage || error?.message || "Unable to mark notifications as read."
  } finally {
    autoMarkPending.value = false
  }
}

watch(
  () => [pending.value, unreadCount.value, data.value, isViewingAsArtist.value],
  () => {
    if (!pending.value && data.value && unreadCount.value && !isViewingAsArtist.value) {
      void markNotificationsSeen()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="page">
    <DataPanel title="Notifications" title-level="h1">
      <template #actions>
        <Button variant="secondary" type="button" :disabled="pending" @click="refreshNotifications">
          {{ pending ? "Refreshing..." : "Refresh" }}
        </Button>
      </template>

      <AppAlert v-if="mutationError" variant="destructive">{{ mutationError }}</AppAlert>
      <AppAlert v-if="isViewingAsArtist" variant="warning">
        View-as mode is read-only. Notification read-state changes are disabled for admins.
      </AppAlert>
      <AppAlert v-if="error" variant="destructive">
        {{ error.statusMessage || "Unable to load notifications right now." }}
      </AppAlert>

      <DashboardSkeleton v-else-if="pending && !data" :rows="5" />

      <template v-else>
        <div class="notification-toolbar">
          <span class="detail-copy">
            {{ paginationSummary }}
          </span>
        </div>

        <AppEmptyState
          v-if="!totalCount"
          title="No notifications yet"
          description="Earnings commits, payout decisions, and dues will appear here once they happen."
        />

        <AppEmptyState
          v-else-if="!notifications.length"
          compact
          icon="search"
          title="No notifications on this page"
        />

        <template v-else>
          <div class="notification-timeline" v-reveal-group="{ stagger: 0.08, y: 18 }">
            <div
              v-for="notification in notifications"
              :key="notification.id"
              class="notification-timeline-item"
            >
              <span
                class="notification-timeline-marker"
                :class="{ 'notification-timeline-marker-unread': !notification.isRead }"
                aria-hidden="true"
              >
                <Bell class="notification-timeline-icon" />
              </span>

              <NuxtLink
                :to="notificationDestination(notification)"
                class="catalog-item notification-card"
                :class="{ 'notification-card-unread': !notification.isRead }"
              >
                <div class="catalog-header">
                  <div class="summary-copy">
                    <strong>{{ notification.title }}</strong>
                    <span class="detail-copy notification-time">
                      {{ formatRelativeTime(notification.createdAt) }}
                    </span>
                  </div>
                  <div class="table-actions">
                    <StatusBadge :tone="notificationTypeTone(notification)" class="notification-type-badge">
                      {{ notification.typeLabel }}
                    </StatusBadge>
                  </div>
                </div>

                <p v-if="notification.message" class="detail-copy notification-message">
                  {{ notification.message }}
                </p>
              </NuxtLink>
            </div>
          </div>

          <AppPagination
            v-if="pagination.totalPages > 1"
            :page="pagination.page"
            :page-size="pagination.pageSize"
            :total-count="pagination.totalCount"
            :total-pages="pagination.totalPages"
            :pending="pending"
            :summary="paginationSummary"
            aria-label="Notifications pagination"
            class="mt-5"
            @update:page="page = $event"
          />
        </template>
      </template>
    </DataPanel>
  </div>
</template>

<style scoped>
.notification-toolbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin: 0;
}

.notification-timeline {
  --notification-marker-size: 24px;
  --notification-marker-lane: 36px;
  position: relative;
  display: grid;
  gap: 16px;
}

.notification-timeline::before {
  position: absolute;
  top: calc(var(--notification-marker-size) / 2);
  bottom: calc(var(--notification-marker-size) / 2);
  left: calc(var(--notification-marker-lane) / 2);
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    transparent 0,
    color-mix(in srgb, var(--border) 72%, var(--priority) 28%) 24px,
    color-mix(in srgb, var(--border) 84%, var(--priority) 16%) calc(100% - 24px),
    transparent 100%
  );
  content: "";
  transform: translateX(-1px);
}

.notification-timeline-item {
  position: relative;
  display: grid;
  grid-template-columns: var(--notification-marker-lane) minmax(0, 1fr);
  align-items: start;
  gap: 12px;
}

.notification-timeline-marker {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: var(--notification-marker-size);
  height: var(--notification-marker-size);
  align-items: center;
  justify-content: center;
  justify-self: center;
  margin-top: 18px;
  border: 2px solid color-mix(in srgb, var(--priority) 64%, var(--background));
  border-radius: 999px;
  background: var(--card);
  color: color-mix(in srgb, var(--priority) 92%, #6f4f09);
  box-shadow:
    0 0 0 4px var(--card),
    0 10px 18px -14px color-mix(in srgb, var(--priority) 48%, transparent);
}

.notification-timeline-marker-unread {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--priority-hover) 90%, #fff6d3 10%),
    color-mix(in srgb, var(--priority) 84%, #7a5411 16%)
  );
  color: var(--dashboard-ivory, #fef9e7);
  box-shadow:
    0 0 0 4px var(--card),
    0 12px 24px -16px color-mix(in srgb, var(--priority) 72%, transparent);
}

/* Unread markers pulse a soft gold halo — "this one's still warm" */
.notification-timeline-marker-unread::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 999px;
  border: 2px solid color-mix(in srgb, var(--priority) 60%, transparent);
  animation: notification-unread-pulse 2.4s var(--ease-out, ease-out) infinite;
  pointer-events: none;
}

@keyframes notification-unread-pulse {
  0% { opacity: 0.7; transform: scale(1); }
  70%, 100% { opacity: 0; transform: scale(2.1); }
}

@media (prefers-reduced-motion: reduce) {
  .notification-timeline-marker-unread::after {
    animation: none;
    opacity: 0;
  }
}

.notification-timeline-icon {
  width: 14px;
  height: 14px;
  stroke-width: 2.4;
}

.notification-card {
  position: relative;
  color: var(--card-foreground);
  text-decoration: none;
  transition: border-color 200ms var(--ease-out), background 200ms var(--ease-out), box-shadow 200ms var(--ease-out);
}

.notification-card:hover {
  border-color: color-mix(in srgb, var(--priority) 32%, var(--border));
  background: color-mix(in srgb, var(--muted) 18%, var(--card));
  box-shadow: var(--surface-card-shadow-current-hover, var(--surface-depth-edge-hover, var(--shadow-card-hover)));
}

.notification-card:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 3px;
}

.notification-card-unread {
  border-color: color-mix(in srgb, var(--priority) 26%, var(--border));
  background: color-mix(in srgb, var(--priority) 3%, var(--card));
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--priority) 72%, transparent);
}

.notification-card-unread:hover {
  border-color: color-mix(in srgb, var(--priority) 42%, var(--border));
  background: color-mix(in srgb, var(--priority) 6%, var(--card));
  box-shadow:
    inset 3px 0 0 color-mix(in srgb, var(--priority) 78%, transparent),
    var(--surface-card-shadow-current-hover, var(--surface-depth-edge-hover, var(--shadow-card-hover)));
}

.notification-message {
  margin: 0;
}

:global(.dark) .notification-timeline::before {
  background: linear-gradient(
    180deg,
    transparent 0,
    color-mix(in srgb, var(--border) 70%, var(--priority) 30%) 24px,
    color-mix(in srgb, var(--border) 88%, var(--priority) 12%) calc(100% - 24px),
    transparent 100%
  );
}

:global(.dark) .notification-timeline-marker {
  border-color: color-mix(in srgb, var(--priority) 54%, var(--border));
  background: var(--card);
  color: color-mix(in srgb, var(--priority-hover) 86%, #fff1bc);
  box-shadow:
    0 0 0 4px var(--card),
    0 12px 24px -18px rgb(0 0 0 / 86%);
}

:global(.dark) .notification-timeline-marker-unread {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--priority-hover) 76%, var(--priority) 24%),
    color-mix(in srgb, var(--priority) 88%, #6e5610 12%)
  );
  color: #0a0a0a;
}

@media (max-width: 640px) {
  .notification-timeline {
    --notification-marker-size: 22px;
    --notification-marker-lane: 26px;
    gap: 12px;
  }

  .notification-timeline-item {
    gap: 8px;
  }

  .notification-timeline-marker {
    margin-top: 18px;
  }
}
</style>
