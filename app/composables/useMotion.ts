let reducedMotionQuery: MediaQueryList | null = null

/** True when the user asks for reduced motion (or during SSR, where nothing
 *  should animate). Reveal directives and signature moments all gate on this. */
export function prefersReducedMotion(): boolean {
  if (import.meta.server) {
    return true
  }

  if (!reducedMotionQuery) {
    reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
  }

  return reducedMotionQuery.matches
}

export function motionOK(): boolean {
  return !prefersReducedMotion()
}
