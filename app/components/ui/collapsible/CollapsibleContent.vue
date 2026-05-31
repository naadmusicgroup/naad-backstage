<script setup lang="ts">
import type { CollapsibleContentProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { CollapsibleContent, useForwardProps } from 'radix-vue'

const props = defineProps<CollapsibleContentProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <CollapsibleContent
    v-bind="forwardedProps"
    :class="cn('overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down', props.class)"
  >
    <slot />
  </CollapsibleContent>
</template>
