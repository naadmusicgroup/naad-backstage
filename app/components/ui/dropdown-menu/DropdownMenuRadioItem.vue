<script setup lang="ts">
import { Circle } from "lucide-vue-next"
import type { DropdownMenuRadioItemEmits, DropdownMenuRadioItemProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import {
  DropdownMenuItemIndicator,
  DropdownMenuRadioItem as DropdownMenuRadioItemPrimitive,
  useForwardPropsEmits,
} from "radix-vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<DropdownMenuRadioItemProps & {
  class?: HTMLAttributes["class"]
}>()
const emits = defineEmits<DropdownMenuRadioItemEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DropdownMenuRadioItemPrimitive
    v-bind="forwarded"
    :class="cn(
      'app-dropdown-menu-radio-item relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-2.5 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class,
    )"
  >
    <span class="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownMenuItemIndicator>
        <Circle class="size-2 fill-current" />
      </DropdownMenuItemIndicator>
    </span>
    <slot />
  </DropdownMenuRadioItemPrimitive>
</template>

<style scoped>
.app-dropdown-menu-radio-item {
  min-height: 36px;
  color: var(--popover-foreground);
}

.app-dropdown-menu-radio-item[data-highlighted],
.app-dropdown-menu-radio-item:focus {
  background: color-mix(in srgb, var(--primary) 13%, var(--accent));
  color: var(--foreground);
}

.app-dropdown-menu-radio-item[data-state="checked"] {
  background: color-mix(in srgb, var(--primary) 9%, transparent);
  color: var(--foreground);
}

.app-dropdown-menu-radio-item span:first-child {
  color: var(--primary);
}
</style>
