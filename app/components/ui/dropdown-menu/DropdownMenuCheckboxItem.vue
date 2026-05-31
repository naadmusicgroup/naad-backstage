<script setup lang="ts">
import { Check } from "lucide-vue-next"
import type { DropdownMenuCheckboxItemEmits, DropdownMenuCheckboxItemProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import {
  DropdownMenuCheckboxItem as DropdownMenuCheckboxItemPrimitive,
  DropdownMenuItemIndicator,
  useForwardPropsEmits,
} from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuCheckboxItemProps & {
  class?: HTMLAttributes["class"]
}>()
const emits = defineEmits<DropdownMenuCheckboxItemEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuCheckboxItemPrimitive
    v-bind="forwarded"
    :class="cn(
      'app-dropdown-menu-checkbox-item relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-2.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class,
    )"
  >
    <span class="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownMenuItemIndicator>
        <Check class="size-4" />
      </DropdownMenuItemIndicator>
    </span>
    <slot />
  </DropdownMenuCheckboxItemPrimitive>
</template>

<style scoped>
.app-dropdown-menu-checkbox-item {
  min-height: 36px;
  color: var(--popover-foreground);
}

.app-dropdown-menu-checkbox-item[data-highlighted],
.app-dropdown-menu-checkbox-item:focus {
  background: color-mix(in srgb, var(--primary) 13%, var(--accent));
  color: var(--foreground);
}

.app-dropdown-menu-checkbox-item[data-state="checked"] {
  background: color-mix(in srgb, var(--primary) 9%, transparent);
  color: var(--foreground);
}

.app-dropdown-menu-checkbox-item span:first-child {
  color: var(--primary);
}
</style>
