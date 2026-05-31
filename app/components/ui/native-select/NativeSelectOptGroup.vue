<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  label: string
  disabled?: boolean
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <optgroup
    data-slot="native-select-optgroup"
    :label="label"
    :disabled="disabled"
    :class="cn(props.class)"
  >
    <slot />
  </optgroup>
</template>
