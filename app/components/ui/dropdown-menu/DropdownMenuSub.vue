<script setup lang="ts">
import type { DropdownMenuSubEmits, DropdownMenuSubProps } from "radix-vue"
import { DropdownMenuSub as DropdownMenuSubPrimitive, useForwardPropsEmits } from "radix-vue"

const props = defineProps<DropdownMenuSubProps>()
const emits = defineEmits<DropdownMenuSubEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DropdownMenuSubPrimitive v-bind="forwarded">
    <slot />
  </DropdownMenuSubPrimitive>
</template>
