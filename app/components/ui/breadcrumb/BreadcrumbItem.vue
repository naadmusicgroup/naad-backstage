<script setup lang="ts">
import type { PrimitiveProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { Primitive } from 'radix-vue'

interface BreadcrumbItemProps extends PrimitiveProps {
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<BreadcrumbItemProps>(), {
  as: 'li',
})
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn('inline-flex items-center gap-1.5', props.class)"
  >
    <slot />
  </Primitive>
</template>
