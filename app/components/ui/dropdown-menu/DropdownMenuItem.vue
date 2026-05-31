<script setup lang="ts">
import type { DropdownMenuItemEmits, DropdownMenuItemProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { DropdownMenuItem as DropdownMenuItemPrimitive, useForwardPropsEmits } from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuItemProps & {
  class?: HTMLAttributes["class"]
  inset?: boolean
  variant?: "default" | "destructive"
}>()
const emits = defineEmits<DropdownMenuItemEmits>()

const delegatedProps = computed(() => {
  const { class: _, inset: __, variant: ___, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuItemPrimitive
    v-bind="forwarded"
    :class="cn(
      'app-dropdown-menu-item relative flex cursor-default select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      inset && 'pl-8',
      variant === 'destructive' && 'app-dropdown-menu-item-destructive text-destructive',
      props.class,
    )"
  >
    <slot />
  </DropdownMenuItemPrimitive>
</template>

<style scoped>
.app-dropdown-menu-item {
  min-height: 36px;
  color: var(--popover-foreground);
}

.app-dropdown-menu-item[data-highlighted],
.app-dropdown-menu-item:focus {
  background: color-mix(in srgb, var(--primary) 13%, var(--accent));
  color: var(--foreground);
}

.app-dropdown-menu-item-destructive[data-highlighted],
.app-dropdown-menu-item-destructive:focus {
  background: color-mix(in srgb, var(--destructive) 14%, transparent);
  color: var(--destructive);
}
</style>
