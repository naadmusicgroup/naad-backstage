<script setup lang="ts">
// Pointer-tracked 3D tilt with an optional moving glare highlight.
// Used by the wallet balance card, release covers, and the login card (2°).
// Inert on touch and under prefers-reduced-motion.
const props = withDefaults(
  defineProps<{
    maxTilt?: number
    scale?: number
    glare?: boolean
    disabled?: boolean
  }>(),
  {
    maxTilt: 7,
    scale: 1.01,
    glare: true,
    disabled: false,
  },
)

const cardEl = ref<HTMLElement | null>(null)
const isTiltCapable = ref(false)
let rafId = 0
let pendingEvent: PointerEvent | null = null

function applyTilt() {
  rafId = 0

  const el = cardEl.value
  const event = pendingEvent

  if (!el || !event) {
    return
  }

  const rect = el.getBoundingClientRect()
  const px = (event.clientX - rect.left) / rect.width
  const py = (event.clientY - rect.top) / rect.height
  const tiltX = (0.5 - py) * props.maxTilt * 2
  const tiltY = (px - 0.5) * props.maxTilt * 2

  el.style.transform = `perspective(900px) rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg) scale(${props.scale})`
  el.style.setProperty("--tilt-glare-x", `${(px * 100).toFixed(1)}%`)
  el.style.setProperty("--tilt-glare-y", `${(py * 100).toFixed(1)}%`)
  el.style.setProperty("--tilt-glare-opacity", "1")
}

function onPointerMove(event: PointerEvent) {
  if (props.disabled || !isTiltCapable.value) {
    return
  }

  pendingEvent = event

  if (!rafId) {
    rafId = requestAnimationFrame(applyTilt)
  }
}

function onPointerLeave() {
  pendingEvent = null

  const el = cardEl.value

  if (el) {
    el.style.transform = ""
    el.style.setProperty("--tilt-glare-opacity", "0")
  }
}

onMounted(() => {
  isTiltCapable.value = motionOK() && window.matchMedia("(hover: hover)").matches
})

onBeforeUnmount(() => {
  if (rafId) {
    cancelAnimationFrame(rafId)
  }
})
</script>

<template>
  <div
    ref="cardEl"
    class="tilt-card"
    @pointermove="onPointerMove"
    @pointerleave="onPointerLeave"
  >
    <slot />
    <span v-if="glare" class="tilt-card-glare" aria-hidden="true" />
  </div>
</template>

<style scoped>
.tilt-card {
  position: relative;
  transform-style: preserve-3d;
  transition: transform 260ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
  will-change: transform;
}

.tilt-card-glare {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  background: radial-gradient(
    420px circle at var(--tilt-glare-x, 50%) var(--tilt-glare-y, 50%),
    color-mix(in srgb, var(--gold-100, #ffe9a3) 9%, transparent) 0%,
    transparent 58%
  );
  opacity: var(--tilt-glare-opacity, 0);
  transition: opacity 320ms var(--ease-out, ease-out);
  pointer-events: none;
}
</style>
