import type { ViewerContext } from "~~/types/auth"

function guestContext(): ViewerContext {
  return {
    authenticated: false,
    userId: null,
    profile: null,
    artistMemberships: [],
    schemaReady: true,
    security: {
      adminMfaRequired: false,
    },
  }
}

export const useViewerContext = () => {
  const viewer = useState<ViewerContext>("viewer-context", guestContext)
  const loading = useState<boolean>("viewer-context-loading", () => false)
  const user = useSupabaseUser()
  const supabase = useSupabaseClient()

  async function waitFor(delayMs: number) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
  }

  async function resolveAuthUserId(userIdOverride?: string | null) {
    if (userIdOverride) {
      return userIdOverride
    }

    if (user.value?.id) {
      return user.value.id
    }

    if (!process.client) {
      return null
    }

    const { data, error } = await supabase.auth.getUser()

    if (error) {
      throw new Error(error.message)
    }

    return data.user?.id ?? null
  }

  async function fetchViewerContext() {
    if (!process.client) {
      const requestFetch = useRequestFetch()
      return await requestFetch<ViewerContext>("/api/me")
    }

    return await $fetch<ViewerContext>("/api/me")
  }

  async function refreshViewerContext(force = false, userIdOverride?: string | null) {
    let activeUserId: string | null = null

    if (process.client) {
      activeUserId = await resolveAuthUserId(userIdOverride)

      if (!activeUserId) {
        viewer.value = guestContext()
        return viewer.value
      }

      if (!force && viewer.value.authenticated && viewer.value.userId === activeUserId) {
        return viewer.value
      }
    }

    loading.value = true

    try {
      viewer.value = await fetchViewerContext()

      if (process.client && activeUserId && (!viewer.value.authenticated || viewer.value.userId !== activeUserId)) {
        for (const delayMs of [150, 300, 600]) {
          await waitFor(delayMs)
          const nextViewer = await fetchViewerContext()

          viewer.value = nextViewer

          if (nextViewer.authenticated && nextViewer.userId === activeUserId) {
            break
          }
        }
      }
    } finally {
      loading.value = false
    }

    return viewer.value
  }

  function clearViewerContext() {
    viewer.value = guestContext()
  }

  return {
    viewer,
    loading,
    refreshViewerContext,
    clearViewerContext,
    resolveAuthUserId,
  }
}
