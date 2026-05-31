import type { ViewerContext } from "~~/types/auth"

interface PendingViewerContextRequest {
  userId: string | null
  promise: Promise<ViewerContext>
}

interface CachedClientAuthUserId {
  userId: string
  expiresAt: number
}

const CLIENT_AUTH_USER_ID_CACHE_MS = 5 * 60 * 1000

let pendingClientViewerContextRequest: PendingViewerContextRequest | null = null
let cachedClientAuthUserId: CachedClientAuthUserId | null = null

function cacheClientAuthUserId(userId: string, sessionExpiresAtMs = 0) {
  if (!process.client) {
    return
  }

  const ttlExpiresAt = Date.now() + CLIENT_AUTH_USER_ID_CACHE_MS
  const boundedExpiresAt = sessionExpiresAtMs > 0
    ? Math.min(ttlExpiresAt, Math.max(Date.now(), sessionExpiresAtMs - 30_000))
    : ttlExpiresAt

  cachedClientAuthUserId = {
    userId,
    expiresAt: boundedExpiresAt,
  }
}

function clearClientAuthUserIdCache() {
  cachedClientAuthUserId = null
}

function decodeJwtSubject(accessToken: string | null | undefined) {
  if (!accessToken) {
    return null
  }

  const [, payload] = accessToken.split(".")

  if (!payload) {
    return null
  }

  try {
    const normalizedPayload = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=")
    const claims = JSON.parse(globalThis.atob(normalizedPayload)) as { sub?: unknown }
    return typeof claims.sub === "string" ? claims.sub : null
  } catch {
    return null
  }
}

function guestContext(): ViewerContext {
  return {
    authenticated: false,
    userId: null,
    profile: null,
    artistMemberships: [],
    impersonation: null,
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
  const session = useSupabaseSession()
  const supabase = useSupabaseClient()

  async function waitFor(delayMs: number) {
    await new Promise((resolve) => window.setTimeout(resolve, delayMs))
  }

  async function resolveAuthUserId(userIdOverride?: string | null) {
    if (userIdOverride) {
      const sessionExpiresAtMs = session.value?.expires_at ? session.value.expires_at * 1000 : 0
      cacheClientAuthUserId(userIdOverride, sessionExpiresAtMs)
      return userIdOverride
    }

    if (user.value?.id) {
      const sessionExpiresAtMs = session.value?.expires_at ? session.value.expires_at * 1000 : 0
      cacheClientAuthUserId(user.value.id, sessionExpiresAtMs)
      return user.value.id
    }

    if (!process.client) {
      return null
    }

    const sessionUserId = decodeJwtSubject(session.value?.access_token)
    const sessionExpiresAtMs = session.value?.expires_at ? session.value.expires_at * 1000 : 0

    if (sessionUserId) {
      cacheClientAuthUserId(sessionUserId, sessionExpiresAtMs)
      return sessionUserId
    }

    if (
      cachedClientAuthUserId
      && cachedClientAuthUserId.expiresAt > Date.now()
      && (!viewer.value.authenticated || viewer.value.userId === cachedClientAuthUserId.userId)
    ) {
      return cachedClientAuthUserId.userId
    }

    const { data, error } = await supabase.auth.getUser()

    if (error) {
      clearClientAuthUserIdCache()
      throw new Error(error.message)
    }

    if (data.user?.id) {
      cacheClientAuthUserId(data.user.id, sessionExpiresAtMs)
      return data.user.id
    }

    clearClientAuthUserIdCache()
    return null
  }

  async function fetchViewerContext(activeUserId: string | null = null) {
    if (!process.client) {
      const requestFetch = useRequestFetch()
      return await requestFetch<ViewerContext>("/api/me")
    }

    if (pendingClientViewerContextRequest?.userId === activeUserId) {
      return await pendingClientViewerContextRequest.promise
    }

    const request = ($fetch("/api/me") as Promise<ViewerContext>).finally(() => {
      if (pendingClientViewerContextRequest?.promise === request) {
        pendingClientViewerContextRequest = null
      }
    })

    pendingClientViewerContextRequest = {
      userId: activeUserId,
      promise: request,
    }

    return await request
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
      viewer.value = await fetchViewerContext(activeUserId)

      if (process.client && activeUserId && (!viewer.value.authenticated || viewer.value.userId !== activeUserId)) {
        for (const delayMs of [150, 300, 600]) {
          await waitFor(delayMs)
          const nextViewer = await fetchViewerContext(activeUserId)

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
    clearClientAuthUserIdCache()
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
