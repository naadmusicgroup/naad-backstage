<script setup lang="ts">
import type { DropdownMenuGroupProps } from "radix-vue"
import { DropdownMenuGroup as DropdownMenuGroupPrimitive, useForwardProps } from "radix-vue"

const props = defineProps<DropdownMenuGroupProps>()
const forwardedProps = useForwardProps(props)
</script>

<template>
  <DropdownMenuGroupPrimitive v-bind="forwardedProps">
    <slot />
  </DropdownMenuGroupPrimitive>
</template>
