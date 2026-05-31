<script setup lang="ts">
import type { AvatarFallbackProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { AvatarFallback as AvatarFallbackPrimitive, useForwardProps } from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<AvatarFallbackProps & {
  class?: HTMLAttributes["class"]
}>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <AvatarFallbackPrimitive
    data-slot="avatar-fallback"
    v-bind="forwardedProps"
    :class="cn('flex size-full items-center justify-center rounded-full bg-muted', props.class)"
  >
    <slot />
  </AvatarFallbackPrimitive>
</template>
