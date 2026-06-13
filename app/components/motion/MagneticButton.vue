<script setup lang="ts">
// Magnetic hover wrapper: the slotted control leans toward the cursor inside
// `radius` px and springs back on leave. Inert on coarse pointers and under
// prefers-reduced-motion. Wrap exactly one interactive element.
const props = withDefaults(
  defineProps<{
    /** fraction of cursor offset applied (0.3 → max ~6px on a 20px offset) */
    strength?: number
    /** px from element center where attraction engages */
    radius?: number
    disabled?: boolean
  }>(),
  {
    strength: 0.3,
    radius: 120,
    disabled: false,
  },
)

const hostEl = ref<HTMLElement | null>(null)
let rafId = 0
let active = false

function applyOffset(x: number, y: number) {
  if (rafId) {
    return
  }

  rafId = requestAnimationFrame(() => {
    rafId = 0

    if (hostEl.value) {
      hostEl.value.style.transform = x || y ? `translate3d(${x}px, ${y}px, 0)` : ""
    }
  })
}

function onPointerMove(event: PointerEvent) {
  if (!hostEl.value || props.disabled) {
    return
  }

  const rect = hostEl.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const dx = event.clientX - centerX
  const dy = event.clientY - centerY
  const distance = Math.hypot(dx, dy)

  if (distance > props.radius) {
    if (active) {
      active = false
      applyOffset(0, 0)
    }

    return
  }

  active = true

  const pull = 1 - distance / props.radius

  applyOffset(dx * props.strength * pull, dy * props.strength * pull)
}

function onPointerLeave() {
  active = false
  applyOffset(0, 0)
}

onMounted(() => {
  if (!motionOK() || !window.matchMedia("(hover: hover)").matches) {
    return
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true })
  window.addEventListener("pointerleave", onPointerLeave, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointerMove)
  window.removeEventListener("pointerleave", onPointerLeave)

  if (rafId) {
    cancelAnimationFrame(rafId)
  }
})
</script>

<template>
  <span ref="hostEl" class="magnetic-host">
    <slot />
  </span>
</template>

<style scoped>
.magnetic-host {
  display: inline-flex;
  transition: transform 320ms var(--ease-spring, cubic-bezier(0.34, 1.56, 0.64, 1));
  will-change: transform;
}
</style>
