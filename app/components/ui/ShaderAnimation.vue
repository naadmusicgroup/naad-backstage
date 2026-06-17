<script setup lang="ts">
import * as THREE from "three"

// Vue/Nuxt adaptation of the 21st.dev "shader-animation" component.
// Renders animated RGB light streaks radiating from the centre on a black field.
const container = ref<HTMLDivElement | null>(null)
let cleanup: (() => void) | null = null

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4( position, 1.0 );
  }
`

const fragmentShader = /* glsl */ `
  #define TWO_PI 6.2831853072
  #define PI 3.14159265359

  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform vec2 mouse; // cursor in normalised [0,1] coords (origin bottom-left)

  void main(void) {
    vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
    // Re-centre the radial burst on the cursor (same projection as uv).
    vec2 m = (mouse * resolution.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
    vec2 p = uv - m;
    float t = time * 0.05;
    float lineWidth = 0.002;

    vec3 color = vec3(0.0);
    for(int j = 0; j < 3; j++){
      for(int i = 0; i < 5; i++){
        color[j] += lineWidth * float(i * i) / abs(fract(t - 0.01 * float(j) + float(i) * 0.01) * 5.0 - length(p) + mod(p.x + p.y, 0.2));
      }
    }

    gl_FragColor = vec4(color[0], color[1], color[2], 1.0);
  }
`

onMounted(() => {
  if (!container.value) {
    return
  }

  const el = container.value

  const camera = new THREE.Camera()
  camera.position.z = 1

  const scene = new THREE.Scene()
  const geometry = new THREE.PlaneGeometry(2, 2)

  const uniforms = {
    time: { value: 1.0 },
    resolution: { value: new THREE.Vector2() },
    // Start the burst dead-centre; eases toward the cursor as it moves.
    mouse: { value: new THREE.Vector2(0.5, 0.5) },
  }
  // Target the smoothed `mouse` uniform chases each frame.
  const mouseTarget = new THREE.Vector2(0.5, 0.5)

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  })

  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  // Cap pixel ratio so a full-bleed canvas stays cheap on hi-DPI displays.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  el.appendChild(renderer.domElement)

  const onResize = () => {
    const width = el.clientWidth
    const height = el.clientHeight
    renderer.setSize(width, height)
    uniforms.resolution.value.x = renderer.domElement.width
    uniforms.resolution.value.y = renderer.domElement.height
  }

  onResize()
  window.addEventListener("resize", onResize, false)

  // Track the cursor across the whole viewport (it works even over the card,
  // which sits above the canvas). Coords are normalised with a bottom-left
  // origin to match gl_FragCoord.
  const onPointerMove = (event: PointerEvent | MouseEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }
    mouseTarget.x = (event.clientX - rect.left) / rect.width
    mouseTarget.y = 1 - (event.clientY - rect.top) / rect.height
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true })

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  let animationId = 0
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    uniforms.time.value += 0.05
    // Ease the burst origin toward the cursor for a gliding trail.
    uniforms.mouse.value.x += (mouseTarget.x - uniforms.mouse.value.x) * 0.06
    uniforms.mouse.value.y += (mouseTarget.y - uniforms.mouse.value.y) * 0.06
    renderer.render(scene, camera)
  }

  if (reducedMotion) {
    // Honour reduced-motion: paint a single static frame instead of looping.
    renderer.render(scene, camera)
  } else {
    animate()
  }

  cleanup = () => {
    window.removeEventListener("resize", onResize)
    window.removeEventListener("pointermove", onPointerMove)
    cancelAnimationFrame(animationId)
    if (renderer.domElement.parentNode === el) {
      el.removeChild(renderer.domElement)
    }
    renderer.dispose()
    geometry.dispose()
    material.dispose()
  }
})

onBeforeUnmount(() => {
  cleanup?.()
  cleanup = null
})
</script>

<template>
  <div ref="container" class="shader-animation" aria-hidden="true" />
</template>

<style scoped>
.shader-animation {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000;
  overflow: hidden;
}

.shader-animation :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
