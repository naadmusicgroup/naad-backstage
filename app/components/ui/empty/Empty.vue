<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="empty"
    :class="cn(
      'glass-card flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-dashed p-8 text-center text-card-foreground',
      props.class,
    )"
  >
    <slot />
  </div>
</template>
