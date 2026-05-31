<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  value?: string | number | null
  disabled?: boolean
  label?: string
  visual?: Record<string, unknown> | null
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <option
    data-slot="native-select-option"
    :value="value === null || value === undefined ? '' : String(value)"
    :disabled="disabled"
    :label="label"
    :class="cn(props.class)"
  >
    <slot />
  </option>
</template>
