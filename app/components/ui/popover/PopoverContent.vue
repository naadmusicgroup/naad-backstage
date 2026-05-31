<script setup lang="ts">
import type { PopoverContentEmits, PopoverContentProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"
import {
  PopoverContent as PopoverContentPrimitive,
  PopoverPortal,
  useForwardPropsEmits,
} from "radix-vue"
import { computed, useAttrs } from "vue"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(
  defineProps<PopoverContentProps & { class?: HTMLAttributes["class"] }>(),
  {
    align: "center",
    sideOffset: 8,
  },
)
const emits = defineEmits<PopoverContentEmits>()
const attrs = useAttrs()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
const contentBindings = computed(() => ({
  ...attrs,
  ...forwarded.value,
}))
</script>

<template>
  <PopoverPortal>
    <PopoverContentPrimitive
      v-bind="contentBindings"
      :class="cn(
        'glass-menu z-[70] rounded-xl border text-popover-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        props.class,
      )"
    >
      <slot />
    </PopoverContentPrimitive>
  </PopoverPortal>
</template>
