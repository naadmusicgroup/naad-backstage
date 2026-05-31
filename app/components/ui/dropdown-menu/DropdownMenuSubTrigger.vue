<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next"
import type { DropdownMenuSubTriggerProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { DropdownMenuSubTrigger as DropdownMenuSubTriggerPrimitive, useForwardProps } from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuSubTriggerProps & {
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
  <DropdownMenuSubTriggerPrimitive
    v-bind="forwardedProps"
    :class="cn(
      'app-dropdown-menu-sub-trigger flex cursor-default select-none items-center rounded-md px-2.5 py-2 text-sm outline-none transition-colors',
      inset && 'pl-8',
      props.class,
    )"
  >
    <slot />
    <ChevronRight class="ml-auto size-4 text-muted-foreground" />
  </DropdownMenuSubTriggerPrimitive>
</template>

<style scoped>
.app-dropdown-menu-sub-trigger {
  min-height: 36px;
  color: var(--popover-foreground);
}

.app-dropdown-menu-sub-trigger[data-highlighted],
.app-dropdown-menu-sub-trigger[data-state="open"],
.app-dropdown-menu-sub-trigger:focus {
  background: color-mix(in srgb, var(--primary) 13%, var(--accent));
  color: var(--foreground);
}
</style>
