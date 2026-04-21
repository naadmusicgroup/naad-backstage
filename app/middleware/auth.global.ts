const PUBLIC_PATHS = new Set(["/", "/login", "/setup", "/auth/callback", "/auth/reset-password"])

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC_PATHS.has(to.path)) {
    return
  }

  const session = useSupabaseSession()
  const { clearViewerContext, refreshViewerContext, resolveAuthUserId, viewer } = useViewerContext()
  const { signOutAndClear } = useAuthSecurity()

  if (import.meta.server) {
    const context = await refreshViewerContext(true)

    if (!context.authenticated) {
      clearViewerContext()
      return navigateTo("/login")
    }

    return
  }

  const expiresAt = session.value?.expires_at ? session.value.expires_at * 1000 : 0

  if (expiresAt && expiresAt <= Date.now()) {
    await signOutAndClear()
    return
  }

  const activeUserId = await resolveAuthUserId()

  if (!activeUserId) {
    clearViewerContext()
    return navigateTo("/login", { replace: true })
  }

  if (!viewer.value.authenticated || viewer.value.userId !== activeUserId) {
    await refreshViewerContext(true, activeUserId)
  }
})
