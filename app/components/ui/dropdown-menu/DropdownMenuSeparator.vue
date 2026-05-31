<script setup lang="ts">
import type { DropdownMenuSeparatorProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import {
  DropdownMenuSeparator as DropdownMenuSeparatorPrimitive,
} from 'radix-vue'
import { computed } from 'vue'

const props = defineProps<DropdownMenuSeparatorProps & {
  class?: HTMLAttributes['class']
}>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})
</script>

<template>
  <DropdownMenuSeparatorPrimitive
    v-bind="delegatedProps"
    :class="cn('-mx-1.5 my-1.5 h-px bg-border/70', props.class)"
  />
</template>
