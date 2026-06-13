<script setup lang="ts">
// "The Follow Spot" — a faint gold stage light that trails the cursor through
// the dashboard, continuing the login shader's mouse-light into the app.
// One fixed pre-blurred radial gradient div; transform-only updates on a
// rAF loop that idles (cancels itself) once the light settles. Hidden on
// touch devices and under prefers-reduced-motion via CSS (.follow-spot).
const spotEl = ref<HTMLElement | null>(null)

let targetX = -9999
let targetY = -9999
let currentX = -9999
let currentY = -9999
let rafId = 0
let settled = true

const LERP = 0.085

function tick() {
  rafId = 0

  const dx = targetX - currentX
  const dy = targetY - currentY

  if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) {
    currentX = targetX
    currentY = targetY
    settled = true
  } else {
    currentX += dx * LERP
    currentY += dy * LERP
  }

  if (spotEl.value) {
    spotEl.value.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`
  }

  if (!settled) {
    rafId = requestAnimationFrame(tick)
  }
}

function onPointerMove(event: PointerEvent) {
  if (event.pointerType && event.pointerType !== "mouse") {
    return
  }

  targetX = event.clientX
  targetY = event.clientY

  // First sighting: snap to the cursor instead of flying across the screen.
  if (currentX < -999) {
    currentX = targetX
    currentY = targetY
  }

  if (settled) {
    settled = false

    if (!rafId) {
      rafId = requestAnimationFrame(tick)
    }
  }
}

onMounted(() => {
  if (!motionOK() || !window.matchMedia("(hover: hover)").matches) {
    return
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointerMove)

  if (rafId) {
    cancelAnimationFrame(rafId)
  }
})
</script>

<template>
  <div ref="spotEl" class="follow-spot" aria-hidden="true" />
</template>
