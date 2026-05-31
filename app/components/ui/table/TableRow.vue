<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <tr :class="cn('border-b transition-[background-color,border-color,box-shadow] duration-150 hover:bg-muted/50 data-[state=selected]:bg-muted', props.class)">
    <slot />
  </tr>
</template>

<style scoped>
tr {
  box-shadow: inset 0 0 0 transparent;
}
tr:hover {
  box-shadow: inset 3px 0 0 color-mix(in srgb, var(--priority) 72%, transparent);
}
</style>
