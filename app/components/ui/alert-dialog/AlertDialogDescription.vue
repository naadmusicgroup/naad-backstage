<script setup lang="ts">
import type { AlertDialogDescriptionProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { AlertDialogDescription, useForwardProps } from 'radix-vue'

const props = defineProps<AlertDialogDescriptionProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <AlertDialogDescription
    v-bind="forwardedProps"
    :class="cn('mt-2 max-w-[34ch] text-sm leading-6 text-muted-foreground', props.class)"
  >
    <slot />
  </AlertDialogDescription>
</template>
