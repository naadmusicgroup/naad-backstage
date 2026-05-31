<script setup lang="ts">
import { computed, type HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"
import AppTooltip from "~/components/AppTooltip.vue"
import { resolveDspLogo } from "~~/app/utils/dsp-logos"

const props = withDefaults(defineProps<{
  logoKey?: string | null
  name?: string | null
  label?: string | null
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  interactive?: boolean
  class?: HTMLAttributes["class"]
}>(), {
  logoKey: null,
  name: null,
  label: null,
  size: "md",
  interactive: true,
})

const resolved = computed(() => resolveDspLogo(props.logoKey || props.name || props.label))
const resolvedAssets = computed(() => resolved.value?.assets ?? null)
const displayLabel = computed(() => props.label || resolved.value?.label || props.name || props.logoKey || "Platform")
const logoFallbackLabel = computed(() => resolved.value?.label || displayLabel.value)
const sizeClass = computed(() => `dsp-logo-${props.size}`)
const kindClass = computed(() => resolved.value?.kind ? `dsp-logo-kind-${resolved.value.kind}` : null)
const logoStyle = computed(() => resolvedAssets.value
  ? { "--dsp-logo-scale": String(resolved.value?.scale ?? 1) }
  : undefined)
</script>

<template>
  <AppTooltip v-if="interactive" :label="displayLabel">
    <span
      :class="cn('dsp-logo', sizeClass, kindClass, !resolvedAssets && 'dsp-logo-text-only', props.class)"
      :style="logoStyle"
      role="img"
      :aria-label="displayLabel"
      tabindex="0"
    >
      <template v-if="resolvedAssets">
        <img
          class="dsp-logo-image dsp-logo-image-light"
          :src="resolvedAssets.onLight"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        >
        <img
          v-if="resolvedAssets.onDark"
          class="dsp-logo-image dsp-logo-image-dark"
          :src="resolvedAssets.onDark"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
        >
        <span v-else class="dsp-logo-text dsp-logo-text-dark-fallback">{{ logoFallbackLabel }}</span>
      </template>
      <span v-else class="dsp-logo-text">{{ displayLabel }}</span>
    </span>
  </AppTooltip>
  <span
    v-else
    :class="cn('dsp-logo', sizeClass, kindClass, !resolvedAssets && 'dsp-logo-text-only', props.class)"
    :style="logoStyle"
    role="img"
    :aria-label="displayLabel"
  >
    <template v-if="resolvedAssets">
      <img
        class="dsp-logo-image dsp-logo-image-light"
        :src="resolvedAssets.onLight"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      >
      <img
        v-if="resolvedAssets.onDark"
        class="dsp-logo-image dsp-logo-image-dark"
        :src="resolvedAssets.onDark"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
      >
      <span v-else class="dsp-logo-text dsp-logo-text-dark-fallback">{{ logoFallbackLabel }}</span>
    </template>
    <span v-else class="dsp-logo-text">{{ displayLabel }}</span>
  </span>
</template>

<style scoped>
.dsp-logo {
  --dsp-logo-box-width: 104px;
  --dsp-logo-box-height: 21px;
  --dsp-logo-scale: 1;
  display: inline-flex;
  width: var(--dsp-logo-box-width);
  height: var(--dsp-logo-box-height);
  min-width: 0;
  max-width: 100%;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
  vertical-align: middle;
}

.dsp-logo-image {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: left center;
  transform: scale(var(--dsp-logo-scale));
  transform-origin: left center;
}

.dsp-logo-image-dark {
  display: none;
}

.dsp-logo-text-dark-fallback {
  display: none;
}

:global(.dark .dsp-logo .dsp-logo-image-light) {
  display: none;
}

:global(.dark .dsp-logo .dsp-logo-image-dark) {
  display: block;
}

:global(.dark .dsp-logo .dsp-logo-text-dark-fallback) {
  display: inline-flex;
}

.dsp-logo-kind-icon {
  width: var(--dsp-logo-box-height);
}

.dsp-logo-xs {
  --dsp-logo-box-width: 78px;
  --dsp-logo-box-height: 18px;
}

.dsp-logo-sm {
  --dsp-logo-box-width: 118px;
  --dsp-logo-box-height: 24px;
}

.dsp-logo-md {
  --dsp-logo-box-width: 136px;
  --dsp-logo-box-height: 28px;
}

.dsp-logo-lg {
  --dsp-logo-box-width: 156px;
  --dsp-logo-box-height: 32px;
}

.dsp-logo-xl {
  --dsp-logo-box-width: 180px;
  --dsp-logo-box-height: 38px;
}

.dsp-logo-text-only {
  width: auto;
  overflow: visible;
}

.dsp-logo-text {
  display: inline-flex;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  align-items: center;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 680;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsp-logo .dsp-logo-text-dark-fallback {
  display: none;
}

.dsp-logo-xs .dsp-logo-text,
.dsp-logo-sm .dsp-logo-text {
  font-size: 12px;
}

.dsp-logo-lg .dsp-logo-text,
.dsp-logo-xl .dsp-logo-text {
  font-size: 14px;
}
</style>
