<script setup lang="ts">
import { ChartSpline, Maximize2, Table2 } from "lucide-vue-next"

const props = withDefaults(defineProps<{
  modelValue: "chart" | "table"
  canExpand?: boolean
  expandLabel?: string
}>(), {
  canExpand: true,
  expandLabel: "Open data detail",
})

const emit = defineEmits<{
  "update:modelValue": [value: "chart" | "table"]
  expand: []
}>()
</script>

<template>
  <div class="analytics-view-controls" aria-label="Analytics view controls">
    <div class="analytics-view-toggle" role="group" aria-label="View mode">
      <button
        type="button"
        class="analytics-view-button"
        :class="{ active: props.modelValue === 'chart' }"
        aria-label="Chart view"
        title="Chart view"
        @click="emit('update:modelValue', 'chart')"
      >
        <ChartSpline aria-hidden="true" />
      </button>
      <button
        type="button"
        class="analytics-view-button"
        :class="{ active: props.modelValue === 'table' }"
        aria-label="Table view"
        title="Table view"
        @click="emit('update:modelValue', 'table')"
      >
        <Table2 aria-hidden="true" />
      </button>
    </div>
    <button
      v-if="props.canExpand"
      type="button"
      class="analytics-view-expand"
      :aria-label="props.expandLabel"
      :title="props.expandLabel"
      @click="emit('expand')"
    >
      <Maximize2 aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.analytics-view-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.analytics-view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 90%, var(--foreground) 6%);
  border-radius: 999px;
  background: color-mix(in srgb, var(--card) 88%, var(--muted) 12%);
  padding: 2px;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 42%, transparent),
    0 8px 18px -17px rgb(0 0 0 / 46%);
}

.analytics-view-button,
.analytics-view-expand {
  display: inline-grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, var(--foreground) 58%, var(--muted-foreground));
  transition:
    background var(--duration-fast, 150ms) var(--ease-out),
    border-color var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-view-button svg,
.analytics-view-expand svg {
  width: 14px;
  height: 14px;
  stroke-width: 2;
}

.analytics-view-button:hover,
.analytics-view-expand:hover {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, var(--foreground) 12%);
  background: color-mix(in srgb, var(--foreground) 5%, var(--card));
  color: var(--foreground);
}

.analytics-view-button.active {
  border-color: color-mix(in srgb, var(--priority) 28%, var(--surface-border, var(--border)) 72%);
  background: color-mix(in srgb, var(--priority) 9%, var(--card));
  color: color-mix(in srgb, var(--priority) 34%, var(--foreground) 66%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--priority) 10%, transparent);
}

.analytics-view-expand {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent);
  background: color-mix(in srgb, var(--card) 92%, var(--muted) 8%);
}

:global(.dark .analytics-view-toggle) {
  border-color: color-mix(in srgb, var(--surface-border, var(--border)) 86%, #fef9e7 5%);
  background: color-mix(in srgb, #0a0a0a 62%, var(--card) 38%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, #fef9e7 7%, transparent),
    0 12px 24px -22px rgb(0 0 0 / 80%);
}

:global(.dark .analytics-view-button),
:global(.dark .analytics-view-expand) {
  color: color-mix(in srgb, #fef9e7 68%, var(--muted-foreground));
}

:global(.dark .analytics-view-button:hover),
:global(.dark .analytics-view-expand:hover) {
  border-color: color-mix(in srgb, #fef9e7 11%, var(--surface-border, var(--border)));
  background: color-mix(in srgb, #fef9e7 6%, var(--card));
  color: #fef9e7;
}

:global(.dark .analytics-view-button.active) {
  border-color: color-mix(in srgb, var(--priority) 32%, #fef9e7 8%);
  background: color-mix(in srgb, var(--priority) 12%, #0a0a0a 88%);
  color: color-mix(in srgb, var(--priority) 34%, #fef9e7 66%);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--priority) 12%, transparent);
}
</style>
