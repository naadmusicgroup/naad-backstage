<script setup lang="ts">
import type { PrimitiveProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { Primitive } from 'radix-vue'

interface BreadcrumbProps extends PrimitiveProps {
  class?: HTMLAttributes['class']
}

const props = withDefaults(defineProps<BreadcrumbProps>(), {
  as: 'nav',
})
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    aria-label="breadcrumb"
    :class="cn(props.class)"
  >
    <slot />
  </Primitive>
</template>
