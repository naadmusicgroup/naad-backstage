<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { cn } from "@/lib/utils"
import type { ChartConfig } from "./types"

const props = defineProps<{
  config: ChartConfig
  class?: HTMLAttributes["class"]
}>()

const chartVars = computed(() => {
  const styles: Record<string, string> = {}

  for (const [key, item] of Object.entries(props.config)) {
    const color = item.color ?? item.theme?.light

    if (color) {
      styles[`--color-${key}`] = color
    }
  }

  return styles
})
</script>

<template>
  <div
    data-chart
    :class="cn('chart-container min-h-[200px] w-full text-xs text-muted-foreground', props.class)"
    :style="chartVars"
  >
    <slot />
  </div>
</template>

<style scoped>
.chart-container {
  position: relative;
}

.chart-container :deep(.unovis-xy-container),
.chart-container :deep(.unovis-xy-container > div),
.chart-container :deep(svg) {
  width: 100%;
}

.chart-container :deep(text) {
  fill: currentColor;
  font-family: var(--font-mono);
  letter-spacing: 0;
}
</style>
