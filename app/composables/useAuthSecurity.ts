const LAST_ACTIVITY_KEY = "naad-last-activity-at"

export const useAuthSecurity = () => {
  const runtimeConfig = useRuntimeConfig()
  const supabase = useSupabaseClient()
  const { clearViewerContext, viewer } = useViewerContext()
  const { clearActiveArtist } = useActiveArtist()
  const lastActivityAt = useState<number>("auth-last-activity-at", () => Date.now())
  const isSigningOut = useState<boolean>("auth-security-signing-out", () => false)

  const inactivityTimeoutMs = computed(() => {
    const configured = Number(runtimeConfig.public.inactivityTimeoutMs)
    return Number.isFinite(configured) && configured > 0 ? configured : 30 * 60 * 1000
  })

  function clearSecurityState() {
    lastActivityAt.value = Date.now()

    if (!import.meta.client) {
      return
    }

    window.localStorage.removeItem(LAST_ACTIVITY_KEY)
  }

  function recordActivity() {
    const timestamp = Date.now()
    lastActivityAt.value = timestamp

    if (!import.meta.client || !viewer.value.authenticated) {
      return
    }

    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp))
  }

  async function signOutAndClear() {
    if (isSigningOut.value) {
      return
    }

    isSigningOut.value = true

    try {
      await supabase.auth.signOut()
    } finally {
      clearActiveArtist()
      clearViewerContext()
      clearSecurityState()
      isSigningOut.value = false
      await navigateTo("/login", { replace: true })
    }
  }

  return {
    inactivityTimeoutMs,
    isSigningOut,
    lastActivityAt,
    clearSecurityState,
    recordActivity,
    signOutAndClear,
  }
}
