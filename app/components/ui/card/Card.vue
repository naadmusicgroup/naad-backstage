<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  glint?: 'none' | 'quiet' | 'standard' | 'hero' | 'data' | 'edge' | 'slab' | 'flat'
  size?: 'default' | 'sm'
}>(), {
  glint: 'standard',
  size: 'default',
})
</script>

<template>
  <article
    data-slot="card"
    :data-glint="glint"
    :data-size="size"
    :class="
      cn(
        'surface-card surface-glint flex flex-col gap-6 rounded-xl border border-[var(--surface-border)] py-6 text-card-foreground shadow-[var(--surface-card-shadow-current)] transition-[box-shadow,border-color,background-color,transform] duration-200 ease-out hover:shadow-[var(--surface-card-shadow-current-hover)] data-[size=sm]:gap-4 data-[size=sm]:py-4',
        props.class,
      )
    "
  >
    <slot />
  </article>
</template>
