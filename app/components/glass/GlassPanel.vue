<script setup lang="ts">
// Obsidian & Gold surface primitive. Defaults to SIMULATED glass (.glass-0,
// no backdrop-filter) per the blur budget in obsidian-glass.css — pass a
// blur tier only for fixed chrome ('chrome'), overlays ('heavy'), or the
// login hero ('hero').
const props = withDefaults(
  defineProps<{
    as?: string
    blur?: "none" | "chrome" | "heavy" | "hero"
    glow?: "none" | "soft" | "edge" | "hover"
    /** adds the slow gold sheen sweep — hero moments only */
    sheen?: boolean
  }>(),
  {
    as: "div",
    blur: "none",
    glow: "none",
    sheen: false,
  },
)

const surfaceClass = computed(() => {
  const blurClass = {
    none: "glass-0",
    chrome: "glass-chrome",
    heavy: "glass-heavy",
    hero: "glass-hero",
  }[props.blur]

  const glowClass = {
    none: "",
    soft: "glow-soft",
    edge: "glow-edge",
    hover: "glow-hover",
  }[props.glow]

  return [blurClass, glowClass, props.sheen ? "gold-sheen" : ""].filter(Boolean)
})
</script>

<template>
  <component :is="props.as" class="glass-panel-host" :class="surfaceClass">
    <slot />
  </component>
</template>

<style scoped>
.glass-panel-host {
  border-radius: var(--radius-xl, 16px);
}
</style>
