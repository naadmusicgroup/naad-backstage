import { gsap } from "gsap"

/**
 * Page-side contract for the reveal system. Call once in a page's setup:
 *
 *   useRevealPage()                                        // static page
 *   useRevealPage({ ready: computed(() => !pending.value) }) // data-gated
 *
 * Owns the page's reveal scope on the page component's root element, so
 * keepalive activation/deactivation (which fires on the page component, not
 * the persistent AppShell scaffold) disables/re-arms ScrollTriggers and
 * plays the 300ms re-entry micro-enter instead of replaying reveals.
 */
export function useRevealPage(options?: { ready?: Ref<boolean> }) {
  const rootEl = ref<HTMLElement | null>(null)
  const hasActivatedOnce = ref(false)
  const instance = getCurrentInstance()

  function resolveRootEl(): HTMLElement | null {
    let el = instance?.proxy?.$el as Node | null | undefined

    // Fragment roots hydrate to a text node — walk to the first element.
    while (el && el.nodeType !== Node.ELEMENT_NODE) {
      el = el.nextSibling
    }

    return (el as HTMLElement | null) ?? null
  }

  onMounted(() => {
    const el = resolveRootEl()

    if (!el) {
      return
    }

    rootEl.value = el
    createRevealScope(el, options?.ready ? options.ready.value : true)

    if (!options?.ready || options.ready.value) {
      setRevealScopeReady(el)
    }
  })

  if (options?.ready) {
    watch(options.ready, (ready) => {
      if (ready && rootEl.value) {
        setRevealScopeReady(rootEl.value)
      }
    })
  }

  onActivated(() => {
    if (!hasActivatedOnce.value) {
      hasActivatedOnce.value = true

      return
    }

    if (!rootEl.value) {
      return
    }

    activateRevealScope(rootEl.value)

    if (motionOK() && isRevealScopeRevealed(rootEl.value)) {
      gsap.fromTo(
        rootEl.value,
        { autoAlpha: 0.94, y: 6 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.3,
          ease: "power2.out",
          clearProps: "opacity,visibility,transform",
        },
      )
    }
  })

  onDeactivated(() => {
    if (rootEl.value) {
      deactivateRevealScope(rootEl.value)
    }
  })

  onBeforeUnmount(() => {
    if (rootEl.value) {
      destroyRevealScope(rootEl.value)
    }
  })

  return { rootEl }
}
