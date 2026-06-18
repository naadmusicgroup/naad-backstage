<script setup lang="ts">
import * as THREE from "three"

// Calm aurora backdrop: soft, slow, heavily-blurred gold + faint violet light
// drifting over deep obsidian, in two depth layers so it flows rather than sits
// flat. The centre stays calm so the card is the hero. A gated flow-warp lets the
// light stream gently around the cursor (off entirely at rest).
const container = ref<HTMLDivElement | null>(null)
let cleanup: (() => void) | null = null

// Start the clock already advanced so the aurora opens at a full, evolved phase
// (majority of the light already present + spread evenly across the width)
// instead of drifting in from frame zero. Chosen by sampling GPU frames for the
// most balanced + full composition; nudge to re-slide it.
const AURORA_SEED_TIME = 908

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4( position, 1.0 );
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  uniform vec2 resolution;
  uniform float time;
  uniform vec2 mouse;    // eased cursor, normalised [0,1]
  uniform float pointer; // 0..1 interaction gate (eased; 0 at rest)

  float hash(vec2 p){
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float noise(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ v += a * noise(p); p = ROT * p * 2.0; a *= 0.5; }
    return v;
  }

  void main(void) {
    // Aspect-correct, centred coordinates.
    vec2 p = (gl_FragCoord.xy - 0.5 * resolution.xy) / resolution.y;
    float aspect = resolution.x / resolution.y;

    // Gentle cursor flow-warp: the light parts and streams around the pointer.
    // Gated by the pointer uniform, so it is exactly 0 at rest (no distortion).
    vec2 mc = vec2((mouse.x - 0.5) * aspect, mouse.y - 0.5);
    vec2 toM = p - mc;
    float md = length(toM);
    p += normalize(toM + 1e-4) * (0.05 * pointer * exp(-md * md * 3.0));

    float tt = time * 0.048; // a touch faster -> it flows

    // Main drifting wisps.
    vec2 q = vec2(fbm(p * 1.1 + vec2(0.0, tt)),
                  fbm(p * 1.1 + vec2(3.7, -tt)));
    float n  = fbm(p * 1.3 + q * 1.5 + vec2(tt * 0.4, 0.0));
    // Slower, larger background layer -> depth so it isn't flat/cluttered.
    vec2 qb = vec2(fbm(p * 0.6 + vec2(2.3, tt * 0.5)),
                   fbm(p * 0.6 + vec2(9.1, -tt * 0.5)));
    float nb = fbm(p * 0.7 + qb * 1.2 + vec2(0.0, tt * 0.3) + 4.0);
    float n2 = fbm(p * 1.0 + q * 1.2 - vec2(0.0, tt * 0.6) + 7.3);

    // Palette: deep obsidian, brand gold, faint violet.
    vec3 obsidian = vec3(0.020, 0.020, 0.028);
    vec3 gold     = vec3(0.96, 0.70, 0.22);
    vec3 violet   = vec3(0.34, 0.20, 0.58);

    float goldMask   = smoothstep(0.44, 0.88, n);   // crisp foreground wisps
    float goldHaze   = smoothstep(0.42, 0.96, nb);  // soft depth behind
    float violetMask = smoothstep(0.50, 0.92, n2);

    // Keep the centre (behind the card) calmer so the form stays the hero.
    float calm = mix(0.42, 1.0, smoothstep(0.0, 0.55, length(p)));

    vec3 col = obsidian;
    col += gold   * goldMask * 0.36 * calm;  // main wisps
    col += gold   * goldHaze * 0.14 * calm;  // depth haze behind
    col += violet * violetMask * 0.22 * calm;

    // Gentle filmic curve so the light stays soft and never clips harshly.
    col = vec3(1.0) - exp(-col * 1.6);

    // Subtle film grain for a premium, non-banded finish.
    float grain = hash(gl_FragCoord.xy + fract(time) * 137.0) - 0.5;
    col += grain * 0.016;

    gl_FragColor = vec4(col, 1.0);
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
    time: { value: AURORA_SEED_TIME },
    resolution: { value: new THREE.Vector2() },
    mouse: { value: new THREE.Vector2(0.5, 0.5) },
    pointer: { value: 0.0 },
  }
  const mouseTarget = new THREE.Vector2(0.5, 0.5)
  let pointerTarget = 0.0

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
  })

  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
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

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  // Cursor tracking for the gated flow-warp. Eased so the streaming is smooth.
  const onPointerMove = (event: PointerEvent | MouseEvent) => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return
    }
    mouseTarget.x = (event.clientX - rect.left) / rect.width
    mouseTarget.y = 1 - (event.clientY - rect.top) / rect.height
    pointerTarget = 1.0
  }
  const onPointerLeave = () => {
    pointerTarget = 0.0
  }

  if (!reducedMotion) {
    window.addEventListener("pointermove", onPointerMove, { passive: true })
    window.addEventListener("blur", onPointerLeave)
    document.addEventListener("pointerleave", onPointerLeave, { passive: true })
  }

  let animationId = 0
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    uniforms.time.value += 0.02
    uniforms.mouse.value.x += (mouseTarget.x - uniforms.mouse.value.x) * 0.05
    uniforms.mouse.value.y += (mouseTarget.y - uniforms.mouse.value.y) * 0.05
    uniforms.pointer.value += (pointerTarget - uniforms.pointer.value) * 0.04
    renderer.render(scene, camera)
  }

  if (reducedMotion) {
    // Reduced-motion: a single calm, still aurora frame at the seed phase.
    uniforms.time.value = AURORA_SEED_TIME
    renderer.render(scene, camera)
  } else {
    animate()
  }

  cleanup = () => {
    window.removeEventListener("resize", onResize)
    window.removeEventListener("pointermove", onPointerMove)
    window.removeEventListener("blur", onPointerLeave)
    document.removeEventListener("pointerleave", onPointerLeave)
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
  background: #050506;
  overflow: hidden;
}

.shader-animation :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
