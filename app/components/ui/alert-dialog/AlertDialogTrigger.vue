<script setup lang="ts">
import type { AlertDialogTriggerProps } from 'radix-vue'
import { AlertDialogTrigger, useForwardProps } from 'radix-vue'

const props = defineProps<AlertDialogTriggerProps>()
const forwardedProps = useForwardProps(props)
</script>

<template>
  <AlertDialogTrigger v-bind="forwardedProps">
    <slot />
  </AlertDialogTrigger>
</template>
