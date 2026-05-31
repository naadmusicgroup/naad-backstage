<script setup lang="ts">
import type { AvatarImageEmits, AvatarImageProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { AvatarImage as AvatarImagePrimitive, useForwardPropsEmits } from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<AvatarImageProps & {
  class?: HTMLAttributes["class"]
}>()
const emits = defineEmits<AvatarImageEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <AvatarImagePrimitive
    data-slot="avatar-image"
    v-bind="forwarded"
    :class="cn('aspect-square size-full object-cover', props.class)"
  />
</template>
