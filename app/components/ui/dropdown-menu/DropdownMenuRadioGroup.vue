<script setup lang="ts">
import type { DropdownMenuRadioGroupEmits, DropdownMenuRadioGroupProps } from "radix-vue"
import { DropdownMenuRadioGroup as DropdownMenuRadioGroupPrimitive, useForwardPropsEmits } from "radix-vue"

const props = defineProps<DropdownMenuRadioGroupProps>()
const emits = defineEmits<DropdownMenuRadioGroupEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuRadioGroupPrimitive v-bind="forwarded">
    <slot />
  </DropdownMenuRadioGroupPrimitive>
</template>
