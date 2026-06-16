export const useAdminNotificationState = () => {
  const unreadNotificationCount = useState<number>("admin-notification-unread-count", () => 0)

  function setUnreadNotificationCount(count: number) {
    unreadNotificationCount.value = Math.max(0, Number(count || 0))
  }

  return {
    unreadNotificationCount,
    setUnreadNotificationCount,
  }
}
