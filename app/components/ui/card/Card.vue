<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  size?: 'default' | 'sm'
}>(), {
  size: 'default',
})
</script>

<template>
  <article
    data-slot="card"
    :data-size="size"
    :class="
      cn(
        'flex flex-col gap-6 rounded-xl border border-[var(--surface-border)] bg-card py-6 text-card-foreground shadow-[var(--shadow-card)] transition-[box-shadow,border-color,transform] duration-200 ease-out hover:shadow-[var(--shadow-card-hover)] data-[size=sm]:gap-4 data-[size=sm]:py-4',
        props.class,
      )
    "
  >
    <slot />
  </article>
</template>
