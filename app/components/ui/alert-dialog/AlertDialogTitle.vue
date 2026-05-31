<script setup lang="ts">
import type { AlertDialogTitleProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { AlertDialogTitle, useForwardProps } from 'radix-vue'

const props = defineProps<AlertDialogTitleProps & { class?: HTMLAttributes['class'] }>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <AlertDialogTitle
    v-bind="forwardedProps"
    :class="cn('text-[1.1875rem] font-semibold leading-6 tracking-normal text-foreground', props.class)"
  >
    <slot />
  </AlertDialogTitle>
</template>
