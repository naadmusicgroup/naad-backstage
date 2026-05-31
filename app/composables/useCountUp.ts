import { type ComputedRef, type Ref, onBeforeUnmount, onMounted, ref, watch } from "vue"

interface CountUpOptions {
  duration?: number
  delay?: number
  easing?: (t: number) => number
}

function defaultEasing(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function useCountUp(
  target: Ref<number> | ComputedRef<number>,
  options: CountUpOptions = {},
) {
  const { duration = 900, delay = 0, easing = defaultEasing } = options
  const display = ref(0)
  let frameId: number | null = null
  let prefersReduced = false

  function cancelFrame() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
  }

  function animate(from: number, to: number) {
    cancelFrame()

    if (prefersReduced || !import.meta.client) {
      display.value = to
      return
    }

    const startTime = performance.now() + delay

    function step(now: number) {
      const elapsed = now - startTime

      if (elapsed < 0) {
        frameId = requestAnimationFrame(step)
        return
      }

      const progress = Math.min(elapsed / duration, 1)
      display.value = from + (to - from) * easing(progress)

      if (progress < 1) {
        frameId = requestAnimationFrame(step)
      } else {
        display.value = to
        frameId = null
      }
    }

    frameId = requestAnimationFrame(step)
  }

  onMounted(() => {
    prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    animate(0, target.value)
  })

  watch(target, (newValue, oldValue) => {
    animate(oldValue ?? 0, newValue)
  })

  onBeforeUnmount(() => {
    cancelFrame()
  })

  return display
}
