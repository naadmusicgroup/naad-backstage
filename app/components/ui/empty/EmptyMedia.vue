<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div
    data-slot="empty-media"
    :class="cn(
      'grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground',
      '[&_svg]:size-5',
      props.class,
    )"
  >
    <slot />
  </div>
</template>
