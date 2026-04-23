import { destinationForViewer } from "~/utils/auth-routing"

export default defineNuxtRouteMiddleware(async () => {
  const { refreshViewerContext, resolveAuthUserId, viewer } = useViewerContext()

  if (import.meta.server) {
    const context = await refreshViewerContext(true)

    if (!context.authenticated) {
      return navigateTo("/login")
    }

    if (context.profile?.role === "admin" && !context.impersonation?.active) {
      return navigateTo(destinationForViewer(context))
    }

    if (
      context.profile?.role !== "artist"
      && !(context.profile?.role === "admin" && context.impersonation?.active)
    ) {
      return navigateTo("/login")
    }

    if (context.artistMemberships.length === 0) {
      return navigateTo("/login")
    }

    return
  }

  const activeUserId = await resolveAuthUserId()

  if (!activeUserId) {
    return navigateTo("/login")
  }

  const context =
    viewer.value.authenticated && viewer.value.userId === activeUserId
      ? viewer.value
      : await refreshViewerContext(true, activeUserId)

  if (context.profile?.role === "admin" && !context.impersonation?.active) {
    return navigateTo(destinationForViewer(context), { replace: true })
  }

  if (
    context.profile?.role !== "artist"
    && !(context.profile?.role === "admin" && context.impersonation?.active)
  ) {
    return navigateTo("/login")
  }

  if (context.artistMemberships.length === 0) {
    return navigateTo("/login")
  }
})
