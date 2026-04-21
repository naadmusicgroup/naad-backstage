const WINDOW_ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "focus"] as const
const LAST_ACTIVITY_KEY = "naad-last-activity-at"

export const useInactivityTimeout = () => {
  if (!import.meta.client) {
    return
  }

  const { viewer } = useViewerContext()
  const { inactivityTimeoutMs, lastActivityAt, recordActivity, signOutAndClear } = useAuthSecurity()
  let intervalId: number | null = null

  function syncLastActivity(timestamp: number) {
    lastActivityAt.value = timestamp
  }

  function handleActivity() {
    if (!viewer.value.authenticated) {
      return
    }

    if (document.visibilityState === "hidden") {
      return
    }

    recordActivity()
  }

  function handleStorage(event: StorageEvent) {
    if (event.key !== LAST_ACTIVITY_KEY || !event.newValue) {
      return
    }

    const timestamp = Number(event.newValue)
    if (Number.isFinite(timestamp) && timestamp > 0) {
      syncLastActivity(timestamp)
    }
  }

  async function checkInactivity() {
    if (!viewer.value.authenticated) {
      return
    }

    if (Date.now() - lastActivityAt.value <= inactivityTimeoutMs.value) {
      return
    }

    await signOutAndClear()
  }

  onMounted(() => {
    const storedTimestamp = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY))
    if (Number.isFinite(storedTimestamp) && storedTimestamp > 0) {
      syncLastActivity(storedTimestamp)
    } else if (viewer.value.authenticated) {
      recordActivity()
    }

    for (const eventName of WINDOW_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true })
    }

    document.addEventListener("visibilitychange", handleActivity)
    window.addEventListener("storage", handleStorage)
    intervalId = window.setInterval(checkInactivity, Math.min(30_000, inactivityTimeoutMs.value))
  })

  onBeforeUnmount(() => {
    for (const eventName of WINDOW_ACTIVITY_EVENTS) {
      window.removeEventListener(eventName, handleActivity)
    }

    document.removeEventListener("visibilitychange", handleActivity)
    window.removeEventListener("storage", handleStorage)

    if (intervalId) {
      window.clearInterval(intervalId)
      intervalId = null
    }
  })
}
