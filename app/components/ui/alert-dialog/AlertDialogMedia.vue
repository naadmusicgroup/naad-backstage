<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ class?: HTMLAttributes['class'] }>()
</script>

<template>
  <div
    data-slot="alert-dialog-media"
    :class="cn(
      'flex size-10 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-secondary text-foreground shadow-sm',
      props.class,
    )"
  >
    <slot />
  </div>
</template>
