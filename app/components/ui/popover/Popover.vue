<script setup lang="ts">
import type { PopoverRootEmits, PopoverRootProps } from "radix-vue"
import { PopoverRoot } from "radix-vue"

const props = withDefaults(defineProps<PopoverRootProps>(), {
  defaultOpen: false,
})
const emits = defineEmits<PopoverRootEmits>()
defineSlots<{
  default(props: { open: boolean, close: () => void }): any
}>()

const internalOpen = ref(props.open ?? props.defaultOpen)

const delegatedProps = computed(() => ({
  ...props,
  open: internalOpen.value,
}))

watch(
  () => props.open,
  (value) => {
    if (value !== undefined) {
      internalOpen.value = value
    }
  },
)

function updateOpen(value: boolean) {
  internalOpen.value = value
  emits("update:open", value)
}

function close() {
  updateOpen(false)
}
</script>

<template>
  <PopoverRoot v-slot="{ open }" v-bind="delegatedProps" @update:open="updateOpen">
    <slot :open="open" :close="close" />
  </PopoverRoot>
</template>
