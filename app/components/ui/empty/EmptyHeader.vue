<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div data-slot="empty-header" :class="cn('grid max-w-sm gap-2 text-center', props.class)">
    <slot />
  </div>
</template>
