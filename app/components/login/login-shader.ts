/**
 * "Liquid Gold" login scene shaders.
 *
 * Fullscreen ortho quad (reference: 21st.dev aliimam shader-animation):
 * iterative sin/cos domain distortion produces flowing luminous filaments,
 * ramped obsidian → bronze → gold → pale-gold. u_mouse is a stage light:
 * it brightens filaments radially AND warps the field toward the cursor so
 * the lines visibly bend around the light.
 */

export const loginVertexShader = /* glsl */ `
void main() {
  gl_Position = vec4(position, 1.0);
}
`

export const loginFragmentShader = /* glsl */ `
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;      /* 0..1, y-up */
uniform float u_intensity; /* entrance ramp + auth pulses */
uniform vec3 u_gold;
uniform vec3 u_bronze;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution) / minSide;
  vec2 mouse = (u_mouse * 2.0 - 1.0) * (u_resolution / minSide);

  float t = u_time * 0.45;

  /* stage light proximity */
  float md = length(uv - mouse);
  float light = exp(-md * 2.6);

  /* the field bends toward the light */
  vec2 p = uv;
  p += normalize(mouse - p + vec2(1e-4)) * exp(-md * 3.0) * 0.14;

  /* flowing filaments: iterative domain distortion */
  for (float i = 1.0; i < 5.0; i += 1.0) {
    p.x += (1.4 / i) * sin(i * 1.4 * p.y + t + i * 0.6) * 0.32;
    p.y += (1.4 / i) * cos(i * 1.2 * p.x + t * 1.1 + i * 1.3) * 0.32;
  }

  /* luminous lines from the warped field */
  float wave = sin(p.x * 1.6 + t) + sin(p.y * 1.9 - t * 0.8);
  float lines = abs(sin(length(p) * 2.4 - t * 0.9) + wave * 0.35);
  float fil = pow(clamp(1.0 - lines * 0.62, 0.0, 1.0), 3.0);

  float lum = fil * (0.55 + 0.85 * light) * u_intensity;
  lum += light * 0.1 * u_intensity;

  /* obsidian -> bronze -> gold -> pale gold (capped, never white) */
  vec3 col = vec3(0.043, 0.039, 0.035);
  col = mix(col, u_bronze, smoothstep(0.04, 0.45, lum));
  col = mix(col, u_gold, smoothstep(0.35, 0.85, lum));
  col = mix(col, vec3(1.0, 0.914, 0.639), smoothstep(0.8, 1.25, lum));

  /* vignette */
  float vig = smoothstep(1.65, 0.45, length(uv));
  col *= 0.35 + 0.65 * vig;

  /* dither kills banding on OLED-dark gradients */
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`

function cssColorToRgb(variable: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof window === "undefined") {
    return fallback
  }

  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
  const hex = raw.match(/^#([0-9a-f]{6})$/i)?.[1]

  if (!hex) {
    return fallback
  }

  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ]
}

/** Brand colors come from the live CSS tokens so the shader stays themed. */
export function readBrandShaderColors() {
  return {
    gold: cssColorToRgb("--gold-500", [0.847, 0.678, 0.145]),
    bronze: cssColorToRgb("--gold-700", [0.604, 0.478, 0.184]),
  }
}
