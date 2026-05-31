<script setup lang="ts">
import type { AvatarRootProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { AvatarRoot, useForwardProps } from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<AvatarRootProps & {
  class?: HTMLAttributes["class"]
}>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <AvatarRoot
    data-slot="avatar"
    v-bind="forwardedProps"
    :class="cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', props.class)"
  >
    <slot />
  </AvatarRoot>
</template>
