<script setup lang="ts">
import type { PrimitiveProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { Primitive } from 'radix-vue'

interface BreadcrumbListProps extends PrimitiveProps {
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<BreadcrumbListProps>(), {
  as: 'ol',
})
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn('flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5', props.class)"
  >
    <slot />
  </Primitive>
</template>
