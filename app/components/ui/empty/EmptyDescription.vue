<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <p data-slot="empty-description" :class="cn('text-sm leading-6 text-muted-foreground', props.class)">
    <slot />
  </p>
</template>
