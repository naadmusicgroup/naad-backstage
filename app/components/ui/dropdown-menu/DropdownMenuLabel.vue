<script setup lang="ts">
import type { DropdownMenuLabelProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { DropdownMenuLabel as DropdownMenuLabelPrimitive, useForwardProps } from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuLabelProps & {
  class?: HTMLAttributes["class"]
  inset?: boolean
}>()

const delegatedProps = computed(() => {
  const { class: _, inset: __, ...delegated } = props
  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <DropdownMenuLabelPrimitive
    v-bind="forwardedProps"
    :class="cn('px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground', inset && 'pl-8', props.class)"
  >
    <slot />
  </DropdownMenuLabelPrimitive>
</template>
