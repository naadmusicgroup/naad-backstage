<script setup lang="ts">
import { computed } from "vue"
import { countryFlagUrlFor, countryNameFor } from "~~/app/utils/country-flags"

const props = withDefaults(defineProps<{
  code?: string | null
  name?: string | null
  label?: string | null
  showLabel?: boolean
  fallback?: string
}>(), {
  code: null,
  name: null,
  label: null,
  showLabel: false,
  fallback: "Unknown country",
})

const countryValue = computed(() => props.code || props.name || props.label || "")
const displayLabel = computed(() => countryNameFor(countryValue.value, props.label || props.fallback))
const flagSource = computed(() => countryFlagUrlFor(countryValue.value || props.label || ""))
</script>

<template>
  <span class="country-flag" :title="displayLabel">
    <img
      v-if="flagSource"
      class="country-flag-mark"
      :src="flagSource"
      :alt="`${displayLabel} flag`"
      loading="lazy"
      decoding="async"
    >
    <span
      v-else
      class="country-flag-mark country-flag-mark-fallback"
      aria-hidden="true"
    >
      --
    </span>
    <span v-if="showLabel" class="country-flag-label">{{ displayLabel }}</span>
  </span>
</template>

<style scoped>
.country-flag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  vertical-align: middle;
}

.country-flag-mark {
  display: block;
  width: 1.65rem;
  height: 1.24rem;
  flex: 0 0 1.65rem;
  object-fit: contain;
  line-height: 0;
}

.country-flag-mark-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0;
}

.country-flag-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
