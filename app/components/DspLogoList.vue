<script setup lang="ts">
import { computed } from "vue"

const props = withDefaults(defineProps<{
  names: string[]
  max?: number
  size?: "xs" | "sm" | "md"
  emptyText?: string
}>(), {
  max: 6,
  size: "sm",
  emptyText: "No stores selected",
})

const visibleNames = computed(() => props.names.slice(0, props.max))
const remainingCount = computed(() => Math.max(0, props.names.length - props.max))
</script>

<template>
  <span v-if="names.length" class="dsp-logo-list">
    <DspLogo
      v-for="name in visibleNames"
      :key="name"
      :name="name"
      :size="size"
      class="dsp-logo-list-item"
    />
    <span v-if="remainingCount" class="dsp-logo-list-more">+{{ remainingCount }}</span>
  </span>
  <span v-else class="dsp-logo-list-empty">{{ emptyText }}</span>
</template>

<style scoped>
.dsp-logo-list {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}

.dsp-logo-list-item {
  flex: 0 1 auto;
}

.dsp-logo-list-more,
.dsp-logo-list-empty {
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 680;
  line-height: 1.35;
}

.dsp-logo-list-more {
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent);
  border-radius: 999px;
  padding: 2px 7px;
}
</style>
