<script setup lang="ts">
import type { DropdownMenuSubContentEmits, DropdownMenuSubContentProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import { DropdownMenuSubContent as DropdownMenuSubContentPrimitive, useForwardPropsEmits } from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuSubContentProps & {
  class?: HTMLAttributes["class"]
}>()
const emits = defineEmits<DropdownMenuSubContentEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuSubContentPrimitive
    v-bind="forwarded"
    :class="cn(
      'app-dropdown-sub-content z-[70] min-w-36 overflow-x-hidden overflow-y-auto rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none will-change-[opacity,transform] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
      props.class,
    )"
  >
    <slot />
  </DropdownMenuSubContentPrimitive>
</template>

<style scoped>
.app-dropdown-sub-content {
  --scrollbar-size: 10px;
  max-height: min(22rem, var(--radix-dropdown-menu-content-available-height, calc(100vh - 24px)));
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 92%, var(--foreground) 10%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--popover) 98%, var(--foreground) 2%), var(--popover));
  box-shadow: var(--shadow-lg), inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent);
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.app-dropdown-sub-content::-webkit-scrollbar {
  width: var(--scrollbar-size);
  height: var(--scrollbar-size);
}

.app-dropdown-sub-content::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

.app-dropdown-sub-content::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 999px;
  background-color: var(--scrollbar-thumb);
  background-clip: padding-box;
}

.app-dropdown-sub-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover);
}
</style>
