<script setup lang="ts">
/**
 * Engraved empty-state illustrations — single-color line art in the ink color,
 * with one bronze detail per plate. Drawn in-house: no stock, no 3D, no mascots.
 * Plates: sleeve (no releases) · tonearm (no plays) · drawer (no money) ·
 * envelope (no mail) · rolodex (empty queue) · compass (lost/404).
 */
withDefaults(defineProps<{
  name: "sleeve" | "tonearm" | "drawer" | "envelope" | "rolodex" | "compass"
}>(), {
  name: "envelope",
})
</script>

<template>
  <svg
    class="engraving"
    viewBox="0 0 96 96"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    data-no-icon-depth
  >
    <!-- Record sleeve, disc half-drawn out -->
    <g v-if="name === 'sleeve'">
      <circle cx="66" cy="46" r="21" opacity="0.5" />
      <circle cx="66" cy="46" r="14" opacity="0.3" />
      <circle cx="66" cy="46" r="6" opacity="0.55" />
      <circle cx="66" cy="46" r="1.6" class="engraving-accent" />
      <rect x="11" y="19" width="54" height="54" rx="3" opacity="0.6" fill="var(--background)" />
      <rect x="17" y="25" width="42" height="42" rx="2" opacity="0.28" />
      <path d="M16 68 L23 61 M16 62 L20 58 M16 56 L18 54" opacity="0.3" />
      <path d="M30 19 L30 13 M42 19 L42 11 M36 19 L36 12" opacity="0.25" />
    </g>

    <!-- Tonearm resting on a still platter -->
    <g v-else-if="name === 'tonearm'">
      <circle cx="40" cy="53" r="27" opacity="0.6" />
      <circle cx="40" cy="53" r="20" opacity="0.35" />
      <circle cx="40" cy="53" r="13" opacity="0.25" />
      <circle cx="40" cy="53" r="6" opacity="0.55" />
      <circle cx="40" cy="53" r="1.5" opacity="0.55" />
      <circle cx="81" cy="19" r="5.5" opacity="0.6" />
      <path d="M81 13.5 L81 9.5" opacity="0.4" />
      <path d="M79 24 L62 44" opacity="0.6" />
      <path d="M62 44 L57 49.5" class="engraving-accent" />
      <path d="M56 50.5 a2 2 0 1 0 2 2" opacity="0.5" />
    </g>

    <!-- Open cash drawer, two idle coins -->
    <g v-else-if="name === 'drawer'">
      <path d="M22 42 L28 24 L68 24 L74 42" opacity="0.55" />
      <path d="M34 24 L31 42 M48 24 L48 42 M62 24 L65 42" opacity="0.25" />
      <rect x="14" y="42" width="68" height="32" rx="3" opacity="0.6" />
      <path d="M42 58 L54 58" opacity="0.5" />
      <circle cx="29" cy="60" r="6" opacity="0.45" />
      <path d="M26 60 a3 3 0 0 0 6 0" opacity="0.3" />
      <circle cx="67" cy="61" r="6" class="engraving-accent" />
      <path d="M14 50 L82 50" opacity="0.18" />
    </g>

    <!-- Sealed envelope, wax seal -->
    <g v-else-if="name === 'envelope'">
      <rect x="14" y="25" width="68" height="46" rx="3" opacity="0.6" />
      <path d="M14 29 L48 54 L82 29" opacity="0.55" />
      <path d="M14 67 L38 49 M82 67 L58 49" opacity="0.28" />
      <circle cx="48" cy="54" r="7" class="engraving-accent" fill="var(--background)" />
      <circle cx="48" cy="54" r="2.8" class="engraving-accent" />
      <path d="M20 31 L26 35 M76 31 L70 35" opacity="0.2" />
    </g>

    <!-- Rolodex card on its ring -->
    <g v-else-if="name === 'rolodex'">
      <path d="M33 30 a6 6 0 1 1 6 6" opacity="0.5" />
      <path d="M57 30 a6 6 0 1 1 6 6" opacity="0.5" />
      <rect x="18" y="36" width="60" height="40" rx="4" opacity="0.6" fill="var(--background)" />
      <path d="M34 36 L34 31 M62 36 L62 31" opacity="0.4" />
      <circle cx="32" cy="52" r="6" opacity="0.4" />
      <path d="M44 48 L66 48" opacity="0.35" />
      <path d="M44 55 L62 55" opacity="0.25" />
      <path d="M26 66 L70 66" class="engraving-accent" />
    </g>

    <!-- Compass rose -->
    <g v-else>
      <circle cx="48" cy="48" r="30" opacity="0.6" />
      <circle cx="48" cy="48" r="24" opacity="0.22" />
      <path d="M48 14 L48 20 M48 76 L48 82 M14 48 L20 48 M76 48 L82 48" opacity="0.45" />
      <path d="M24 24 L28 28 M72 24 L68 28 M24 72 L28 68 M72 72 L68 68" opacity="0.25" />
      <path d="M48 48 L42 56 L48 70 L54 56 Z" opacity="0.5" />
      <path d="M48 48 L54 40 L48 26 L42 40 Z" class="engraving-accent" />
      <circle cx="48" cy="48" r="2.2" opacity="0.7" fill="var(--background)" />
    </g>
  </svg>
</template>

<style scoped>
.engraving {
  width: 100%;
  height: 100%;
  color: var(--muted-foreground);
}

.engraving-accent {
  stroke: var(--priority);
  opacity: 0.62;
}
</style>
