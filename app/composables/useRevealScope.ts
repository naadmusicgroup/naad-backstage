/**
 * Reveal scope registry.
 *
 * PageScaffold owns one scope per page ([data-reveal-scope]). v-reveal
 * directives resolve their scope via el.closest() and use it to:
 *  - queue mount-triggered reveals until the page's data is `ready`
 *  - register ScrollTriggers so keepalive deactivation can disable them
 *  - skip full replays when a keepalive page re-activates
 */
import { ScrollTrigger } from "gsap/ScrollTrigger"

export type RevealScopeState = {
  el: HTMLElement
  ready: boolean
  revealed: boolean
  active: boolean
  queued: Array<(extraDelay: number) => void>
  triggers: Set<ScrollTrigger>
  cleanups: Set<() => void>
}

const scopes = new WeakMap<HTMLElement, RevealScopeState>()

const QUEUE_STAGGER_SECONDS = 0.08
const QUEUE_STAGGER_CAP = 8

export function createRevealScope(el: HTMLElement, ready: boolean): RevealScopeState {
  const existing = scopes.get(el)

  if (existing) {
    return existing
  }

  const scope: RevealScopeState = {
    el,
    ready,
    revealed: false,
    active: true,
    queued: [],
    triggers: new Set(),
    cleanups: new Set(),
  }

  el.dataset.revealScope = ""
  scopes.set(el, scope)

  return scope
}

export function revealScopeFor(el: Element | null): RevealScopeState | null {
  const host = el?.closest?.("[data-reveal-scope]") as HTMLElement | null

  return host ? (scopes.get(host) ?? null) : null
}

export function queueScopeReveal(scope: RevealScopeState, play: (extraDelay: number) => void) {
  scope.queued.push(play)
}

export function registerScopeTrigger(scope: RevealScopeState | null, trigger: ScrollTrigger) {
  scope?.triggers.add(trigger)
}

export function registerScopeCleanup(scope: RevealScopeState | null, cleanup: () => void) {
  scope?.cleanups.add(cleanup)
}

/** Flush queued reveals (sequential stagger, capped) once page data lands. */
export function setRevealScopeReady(el: HTMLElement) {
  const scope = scopes.get(el)

  if (!scope || scope.ready) {
    return
  }

  scope.ready = true

  const queued = scope.queued.splice(0)

  queued.forEach((play, index) => {
    play(Math.min(index, QUEUE_STAGGER_CAP) * QUEUE_STAGGER_SECONDS)
  })

  scope.revealed = true

  if (import.meta.client) {
    requestAnimationFrame(() => ScrollTrigger.refresh())
  }
}

export function markRevealScopeRevealed(el: HTMLElement) {
  const scope = scopes.get(el)

  if (scope) {
    scope.revealed = true
  }
}

export function isRevealScopeRevealed(el: HTMLElement): boolean {
  return scopes.get(el)?.revealed ?? false
}

/** Keepalive deactivation: freeze triggers, keep element state. */
export function deactivateRevealScope(el: HTMLElement) {
  const scope = scopes.get(el)

  if (!scope) {
    return
  }

  scope.active = false

  for (const trigger of scope.triggers) {
    trigger.disable(false)
  }
}

/** Keepalive re-activation: re-arm pending triggers, re-measure. */
export function activateRevealScope(el: HTMLElement) {
  const scope = scopes.get(el)

  if (!scope || scope.active) {
    return
  }

  scope.active = true

  for (const trigger of scope.triggers) {
    trigger.enable(false, false)
  }

  requestAnimationFrame(() => ScrollTrigger.refresh())
}

/** Real unmount: release everything. */
export function destroyRevealScope(el: HTMLElement) {
  const scope = scopes.get(el)

  if (!scope) {
    return
  }

  for (const trigger of scope.triggers) {
    trigger.kill()
  }

  for (const cleanup of scope.cleanups) {
    cleanup()
  }

  scope.triggers.clear()
  scope.cleanups.clear()
  scope.queued.length = 0
  scopes.delete(el)
}
