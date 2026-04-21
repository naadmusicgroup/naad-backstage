import type { ViewerContext } from "~~/types/auth"

export function destinationForViewer(context: ViewerContext | null | undefined) {
  if (context?.profile?.role === "admin") {
    return "/admin"
  }

  if (context?.profile?.role === "artist") {
    return "/dashboard"
  }

  return "/login"
}
