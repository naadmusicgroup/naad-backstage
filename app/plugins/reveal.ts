/**
 * Obsidian & Gold motion system — global GSAP reveal directives.
 *
 *   v-reveal                     rise preset, plays when scrolled into view
 *   v-reveal="{ ... }"           see RevealOptions below
 *   v-reveal-group="{ ... }"     staggers the element's children (capped)
 *
 * Contracts:
 *  - SSR renders content fully visible; hiding happens client-side during
 *    hydration via gsap.set (inline styles). JS dead = page still readable.
 *  - prefers-reduced-motion: directives no-op entirely.
 *  - Reveals are once-only (ScrollTrigger once:true); keepalive returns do
 *    not replay (PageScaffold owns scope lifecycle).
 *  - KPI numerals (NumberFlow/MoneyValue) must never get split/blur presets:
 *    reveal their container with `rise` only.
 */
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { SplitText } from "gsap/SplitText"
import type { DirectiveBinding } from "vue"
import { nextTick } from "vue"
import {
  queueScopeReveal,
  registerScopeCleanup,
  registerScopeTrigger,
  revealScopeFor,
} from "~/composables/useRevealScope"
import { motionOK } from "~/composables/useMotion"

export type RevealPreset = "rise" | "fade" | "blur-rise" | "scale" | "clip" | "draw"

export type RevealOptions = {
  preset?: RevealPreset
  /** px offset the element rises from (default 24 for rise presets) */
  y?: number
  x?: number
  scale?: number
  duration?: number
  delay?: number
  ease?: string
  /** 'scroll' (default): plays on viewport entry (immediately when already
   *  visible). 'mount': plays on mount, queued while the page scope is not
   *  ready so static heroes choreograph with first data. */
  trigger?: "scroll" | "mount"
  /** SplitText heading reveal — masked lines/words/chars. Headings only. */
  split?: "lines" | "words" | "chars"
  /** stagger between split pieces (default 0.09) */
  stagger?: number
  /** ScrollTrigger start (default "top 88%") */
  start?: string
  disabled?: boolean
}

export type RevealGroupOptions = {
  preset?: Exclude<RevealPreset, "draw" | "clip">
  y?: number
  duration?: number
  delay?: number
  ease?: string
  /** seconds between children (default 0.07); capped so long lists never crawl */
  stagger?: number
  /** animate only elements matching this selector (default: direct children) */
  selector?: string
  /** 'scroll' (default) or 'mount' (queued while the page scope is not ready) */
  trigger?: "scroll" | "mount"
  start?: string
  disabled?: boolean
}

type RevealHandle = {
  trigger?: ScrollTrigger
  tween?: gsap.core.Tween | gsap.core.Timeline
  split?: SplitText
  played: boolean
  destroyed?: boolean
}

const handles = new WeakMap<HTMLElement, RevealHandle>()

/** items beyond this index appear together with the cap item */
const GROUP_STAGGER_CAP = 12
const DEFAULT_EASE = "expo.out"
const DEFAULT_DURATION = 0.8

function normalizeOptions(value: unknown): RevealOptions {
  if (!value || typeof value !== "object") {
    return {}
  }

  return value as RevealOptions
}

function presetVars(opts: RevealOptions) {
  const preset = opts.preset ?? (opts.split ? "rise" : "rise")
  const y = opts.y ?? (preset === "fade" ? 0 : 24)
  const x = opts.x ?? 0

  const from: gsap.TweenVars = { autoAlpha: 0 }
  const to: gsap.TweenVars = {
    autoAlpha: 1,
    duration: opts.duration ?? DEFAULT_DURATION,
    ease: opts.ease ?? DEFAULT_EASE,
    delay: opts.delay ?? 0,
  }

  if (preset === "rise" || preset === "blur-rise" || preset === "fade") {
    if (y) {
      from.y = y
      to.y = 0
    }

    if (x) {
      from.x = x
      to.x = 0
    }
  }

  if (preset === "blur-rise" && window.matchMedia("(min-width: 768px)").matches) {
    from.filter = "blur(8px)"
    to.filter = "blur(0px)"
  }

  if (preset === "scale") {
    from.scale = opts.scale ?? 0.96
    to.scale = 1
    from.y = opts.y ?? 12
    to.y = 0
  }

  if (preset === "clip") {
    from.clipPath = "inset(0 0 100% 0)"
    to.clipPath = "inset(0 0 0% 0)"
  }

  return { preset, from, to }
}

function playDraw(el: HTMLElement, opts: RevealOptions, extraDelay: number): gsap.core.Timeline {
  const strokes = el.querySelectorAll<SVGGeometryElement>("path, line, polyline, circle, rect, ellipse")
  const timeline = gsap.timeline({ delay: (opts.delay ?? 0) + extraDelay })

  gsap.set(el, { autoAlpha: 1 })

  strokes.forEach((stroke, index) => {
    let length = 600

    try {
      length = stroke.getTotalLength()
    } catch {
      // non-geometry element (e.g. <rect> in older engines) — keep fallback
    }

    timeline.fromTo(
      stroke,
      { strokeDasharray: length, strokeDashoffset: length },
      {
        strokeDashoffset: 0,
        duration: opts.duration ?? 1.1,
        ease: opts.ease ?? "power2.inOut",
        clearProps: "strokeDasharray,strokeDashoffset",
      },
      index * (opts.stagger ?? 0.08),
    )
  })

  return timeline
}

function createPlay(el: HTMLElement, opts: RevealOptions, handle: RevealHandle) {
  return (extraDelay = 0) => {
    if (handle.played) {
      return
    }

    handle.played = true

    if (opts.preset === "draw") {
      handle.tween = playDraw(el, opts, extraDelay)

      return
    }

    const { from, to } = presetVars(opts)

    if (opts.split) {
      el.classList.add("split-no-balance")

      try {
        handle.split = new SplitText(el, {
          type: opts.split,
          mask: opts.split === "lines" ? "lines" : undefined,
        })
      } catch {
        handle.split = undefined
      }

      const pieces = handle.split
        ? (handle.split as unknown as Record<string, Element[]>)[opts.split]
        : null

      if (pieces && pieces.length) {
        // container un-hides; the pieces carry the animation
        gsap.set(el, { clearProps: "opacity,visibility,transform" })
        gsap.set(pieces, { ...from, yPercent: 60, y: 0 })

        handle.tween = gsap.to(pieces, {
          ...to,
          yPercent: 0,
          delay: (to.delay as number) + extraDelay,
          stagger: opts.stagger ?? 0.09,
          onComplete: () => {
            handle.split?.revert()
            handle.split = undefined
            el.classList.remove("split-no-balance")
          },
        })

        return
      }

      el.classList.remove("split-no-balance")
    }

    handle.tween = gsap.to(el, {
      ...to,
      delay: (to.delay as number) + extraDelay,
      clearProps: opts.preset === "clip" ? "clipPath" : undefined,
    })
  }
}

function mountReveal(el: HTMLElement, binding: DirectiveBinding) {
  const opts = normalizeOptions(binding.value)

  if (opts.disabled || !motionOK()) {
    return
  }

  const handle: RevealHandle = { played: false }

  handles.set(el, handle)

  const { from } = presetVars(opts)

  if (opts.preset !== "draw") {
    gsap.set(el, from)
  } else {
    gsap.set(el, { autoAlpha: 0 })
  }

  const play = createPlay(el, opts, handle)

  // Scope resolution must wait one tick: useRevealPage tags the page root
  // with [data-reveal-scope] in the page's onMounted, which runs AFTER child
  // directive hooks. The element is already hidden, so deferral is unseen.
  void nextTick(() => {
    if (handle.destroyed) {
      return
    }

    const scope = revealScopeFor(el)

    if (opts.trigger === "mount") {
      if (scope && !scope.ready) {
        queueScopeReveal(scope, play)
      } else {
        play()
      }

      return
    }

    // 'scroll': fires immediately when the element is already in view.
    handle.trigger = ScrollTrigger.create({
      trigger: el,
      start: opts.start ?? "top 88%",
      once: true,
      onEnter: () => play(),
    })

    registerScopeTrigger(scope, handle.trigger)
  })
}

function unmountReveal(el: HTMLElement) {
  const handle = handles.get(el)

  if (!handle) {
    return
  }

  handle.destroyed = true
  handle.trigger?.kill()
  handle.tween?.kill()
  handle.split?.revert()
  handles.delete(el)
}

function mountRevealGroup(el: HTMLElement, binding: DirectiveBinding) {
  const opts = (normalizeOptions(binding.value) ?? {}) as RevealGroupOptions

  if (opts.disabled || !motionOK()) {
    return
  }

  const items = opts.selector
    ? Array.from(el.querySelectorAll<HTMLElement>(opts.selector))
    : (Array.from(el.children) as HTMLElement[])

  if (!items.length) {
    return
  }

  const handle: RevealHandle = { played: false }

  handles.set(el, handle)

  const y = opts.y ?? 20
  const each = opts.stagger ?? 0.07

  gsap.set(items, { autoAlpha: 0, y })

  const play = (extraDelay = 0) => {
    if (handle.played) {
      return
    }

    handle.played = true
    handle.tween = gsap.to(items, {
      autoAlpha: 1,
      y: 0,
      duration: opts.duration ?? DEFAULT_DURATION,
      ease: opts.ease ?? DEFAULT_EASE,
      delay: (opts.delay ?? 0) + extraDelay,
      stagger: (index: number) => Math.min(index, GROUP_STAGGER_CAP) * each,
      clearProps: "transform",
    })
  }

  // Deferred for the same reason as mountReveal: the page scope attribute
  // lands in the page's onMounted, after this hook.
  void nextTick(() => {
    if (handle.destroyed) {
      return
    }

    const scope = revealScopeFor(el)

    if (opts.trigger === "mount") {
      if (scope && !scope.ready) {
        queueScopeReveal(scope, play)
      } else {
        play()
      }

      registerScopeCleanup(scope, () => unmountReveal(el))

      return
    }

    handle.trigger = ScrollTrigger.create({
      trigger: el,
      start: opts.start ?? "top 88%",
      once: true,
      onEnter: () => play(),
    })

    registerScopeTrigger(scope, handle.trigger)
    registerScopeCleanup(scope, () => unmountReveal(el))
  })
}

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.client) {
    gsap.registerPlugin(ScrollTrigger, SplitText)
    gsap.defaults({ ease: DEFAULT_EASE, duration: DEFAULT_DURATION })
    ScrollTrigger.defaults({})
  }

  nuxtApp.vueApp.directive("reveal", {
    mounted(el: HTMLElement, binding: DirectiveBinding) {
      if (import.meta.client) {
        mountReveal(el, binding)
      }
    },
    unmounted(el: HTMLElement) {
      if (import.meta.client) {
        unmountReveal(el)
      }
    },
    getSSRProps() {
      return {}
    },
  })

  nuxtApp.vueApp.directive("reveal-group", {
    mounted(el: HTMLElement, binding: DirectiveBinding) {
      if (import.meta.client) {
        mountRevealGroup(el, binding)
      }
    },
    unmounted(el: HTMLElement) {
      if (import.meta.client) {
        unmountReveal(el)
      }
    },
    getSSRProps() {
      return {}
    },
  })

  return {
    provide: {
      gsap,
    },
  }
})
