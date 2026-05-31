<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type TooltipSide = "top" | "right" | "bottom" | "left"
type TooltipAlign = "start" | "center" | "end"

const props = withDefaults(defineProps<{
  label?: string
  side?: TooltipSide
  align?: TooltipAlign
  disabled?: boolean
  contentClass?: HTMLAttributes["class"]
}>(), {
  label: "",
  side: "top",
  align: "center",
  disabled: false,
})

const hasTooltip = computed(() => Boolean(props.label.trim()) && !props.disabled)
</script>

<template>
  <slot v-if="!hasTooltip" />

  <Tooltip v-else>
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipContent :side="side" :align="align" :class="contentClass">
      <slot name="content">{{ label }}</slot>
    </TooltipContent>
  </Tooltip>
</template>
