<script setup lang="ts">
import { ChartLine, Expand, TableProperties } from "lucide-vue-next"

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
    <div class="analytics-view-toggle" :class="`is-${props.modelValue}`" role="group" aria-label="View mode">
      <button
        type="button"
        class="analytics-view-button"
        :class="{ active: props.modelValue === 'chart' }"
        aria-label="Chart view"
        :aria-pressed="props.modelValue === 'chart'"
        title="Chart view"
        @click="emit('update:modelValue', 'chart')"
      >
        <ChartLine aria-hidden="true" />
      </button>
      <button
        type="button"
        class="analytics-view-button"
        :class="{ active: props.modelValue === 'table' }"
        aria-label="Table view"
        :aria-pressed="props.modelValue === 'table'"
        title="Table view"
        @click="emit('update:modelValue', 'table')"
      >
        <TableProperties aria-hidden="true" />
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
      <Expand aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.analytics-view-controls {
  --analytics-control-base: #f0eadf;
  --analytics-control-base-strong: #faf6eb;
  --analytics-control-border: rgb(97 76 42 / 22%);
  --analytics-control-shadow-dark: rgb(82 61 31 / 20%);
  --analytics-control-shadow-soft: rgb(255 255 255 / 82%);
  --analytics-control-icon: rgb(105 86 55 / 82%);
  --analytics-control-icon-active: #221806;
  --analytics-control-accent: #c99a3d;
  --analytics-control-accent-soft: #f2dc9b;
  --analytics-control-ring: color-mix(in srgb, #c99a3d 58%, var(--ring));
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.analytics-view-toggle {
  --view-thumb-x: 0;
  position: relative;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  width: 78px;
  height: 38px;
  gap: 3px;
  isolation: isolate;
  border: 1px solid var(--analytics-control-border);
  border-radius: 14px;
  background:
    linear-gradient(145deg, var(--analytics-control-base-strong), var(--analytics-control-base));
  padding: 3px;
  box-shadow:
    -3px -3px 8px -5px var(--analytics-control-shadow-soft),
    5px 7px 14px -9px var(--analytics-control-shadow-dark),
    inset 1px 1px 1px rgb(255 255 255 / 58%),
    inset -1px -1px 2px rgb(96 72 35 / 8%);
  transition:
    background var(--duration-fast, 150ms) var(--ease-out),
    border-color var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-view-toggle.is-table {
  --view-thumb-x: 35px;
}

.analytics-view-toggle::before {
  position: absolute;
  top: 3px;
  left: 3px;
  z-index: 0;
  width: 32px;
  height: 32px;
  border: 1px solid rgb(255 244 203 / 42%);
  border-radius: 11px;
  background:
    linear-gradient(145deg, var(--analytics-control-accent-soft), var(--analytics-control-accent));
  box-shadow:
    -2px -2px 5px -4px rgb(255 242 193 / 72%),
    5px 7px 14px -8px rgb(93 61 14 / 48%),
    inset 1px 1px 1px rgb(255 255 255 / 42%),
    inset -2px -2px 5px rgb(86 53 9 / 20%);
  content: "";
  transform: translateX(var(--view-thumb-x));
  transition:
    transform 230ms cubic-bezier(.2, .9, .22, 1),
    box-shadow var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-view-button,
.analytics-view-expand {
  position: relative;
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: var(--analytics-control-icon);
  overflow: hidden;
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out),
    opacity var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-view-button svg,
.analytics-view-expand svg {
  position: relative;
  z-index: 2;
  width: 14.5px;
  height: 14.5px;
  stroke-width: 2.05;
}

.analytics-view-button:not(.active):hover {
  color: color-mix(in srgb, var(--analytics-control-icon) 68%, var(--analytics-control-accent));
}

.analytics-view-button.active {
  color: var(--analytics-control-icon-active);
}

.analytics-view-toggle:hover {
  border-color: color-mix(in srgb, var(--analytics-control-accent) 34%, var(--analytics-control-border));
  box-shadow:
    -5px -5px 13px -8px var(--analytics-control-shadow-soft),
    8px 10px 20px -12px var(--analytics-control-shadow-dark),
    inset 1px 1px 1px rgb(255 255 255 / 66%),
    inset -2px -2px 4px rgb(96 72 35 / 10%);
}

.analytics-view-toggle:hover::before {
  box-shadow:
    -2px -2px 5px -4px rgb(255 242 193 / 78%),
    6px 8px 15px -8px rgb(93 61 14 / 54%),
    inset 1px 1px 1px rgb(255 255 255 / 46%),
    inset -2px -2px 5px rgb(86 53 9 / 22%);
}

.analytics-view-expand {
  width: 38px;
  height: 38px;
  border-color: var(--analytics-control-border);
  border-radius: 14px;
  background:
    linear-gradient(145deg, var(--analytics-control-base-strong), var(--analytics-control-base));
  color: color-mix(in srgb, var(--analytics-control-accent) 64%, var(--analytics-control-icon));
  box-shadow:
    -4px -4px 11px -7px var(--analytics-control-shadow-soft),
    7px 9px 18px -11px var(--analytics-control-shadow-dark),
    inset 1px 1px 1px rgb(255 255 255 / 58%),
    inset -2px -2px 4px rgb(96 72 35 / 10%);
}

.analytics-view-expand:hover {
  border-color: color-mix(in srgb, var(--analytics-control-accent) 34%, var(--analytics-control-border));
  color: var(--analytics-control-accent);
  box-shadow:
    -5px -5px 13px -8px var(--analytics-control-shadow-soft),
    8px 10px 20px -12px var(--analytics-control-shadow-dark),
    inset 1px 1px 1px rgb(255 255 255 / 66%),
    inset -2px -2px 4px rgb(96 72 35 / 10%);
}

.analytics-view-button:focus-visible,
.analytics-view-expand:focus-visible {
  outline: 2px solid var(--analytics-neo-ring);
  outline-offset: 3px;
}

.analytics-view-expand:active {
  box-shadow:
    inset 3px 3px 7px rgb(82 61 31 / 20%),
    inset -2px -2px 5px rgb(255 255 255 / 74%);
}

.analytics-view-button:active {
  color: var(--analytics-control-icon-active);
}

:global(.dark .analytics-view-controls) {
  --analytics-control-base: #171512;
  --analytics-control-base-strong: #22201b;
  --analytics-control-border: rgb(244 238 223 / 12%);
  --analytics-control-shadow-dark: rgb(0 0 0 / 74%);
  --analytics-control-shadow-soft: rgb(255 237 184 / 9%);
  --analytics-control-icon: rgb(244 238 223 / 62%);
  --analytics-control-icon-active: #191103;
  --analytics-control-accent: #c99b43;
  --analytics-control-accent-soft: #e6c36d;
  --analytics-control-ring: color-mix(in srgb, #d6aa51 60%, var(--ring));
}

:global(.dark .analytics-view-toggle) {
  border-color: var(--analytics-control-border);
  background: linear-gradient(145deg, var(--analytics-control-base-strong), var(--analytics-control-base));
  box-shadow:
    -4px -4px 12px -8px var(--analytics-control-shadow-soft),
    9px 12px 22px -12px var(--analytics-control-shadow-dark),
    inset 1px 1px 1px rgb(255 255 255 / 7%),
    inset -2px -2px 4px rgb(0 0 0 / 28%);
}

:global(.dark .analytics-view-toggle:hover) {
  border-color: color-mix(in srgb, var(--analytics-control-accent) 30%, var(--analytics-control-border));
  box-shadow:
    -5px -5px 14px -8px var(--analytics-control-shadow-soft),
    10px 13px 24px -13px var(--analytics-control-shadow-dark),
    inset 1px 1px 1px rgb(255 255 255 / 8%),
    inset -2px -2px 4px rgb(0 0 0 / 28%);
}

:global(.dark .analytics-view-toggle::before) {
  border-color: rgb(255 231 172 / 20%);
  background: linear-gradient(145deg, var(--analytics-control-accent-soft), var(--analytics-control-accent));
  box-shadow:
    -2px -2px 6px -5px rgb(255 233 168 / 24%),
    7px 9px 17px -9px rgb(0 0 0 / 72%),
    inset 1px 1px 1px rgb(255 255 255 / 22%),
    inset -2px -2px 5px rgb(55 34 6 / 26%);
}

:global(.dark .analytics-view-button:not(.active):hover) {
  color: color-mix(in srgb, #f4eedf 76%, var(--analytics-control-accent));
}

:global(.dark .analytics-view-expand) {
  border-color: var(--analytics-control-border);
  background: linear-gradient(145deg, var(--analytics-control-base-strong), var(--analytics-control-base));
  color: color-mix(in srgb, var(--analytics-control-accent) 62%, #f4eedf);
  box-shadow:
    -4px -4px 12px -8px var(--analytics-control-shadow-soft),
    9px 12px 22px -12px var(--analytics-control-shadow-dark),
    inset 1px 1px 1px rgb(255 255 255 / 6%),
    inset -2px -2px 4px rgb(0 0 0 / 28%);
}

:global(.dark .analytics-view-expand:hover) {
  border-color: color-mix(in srgb, var(--analytics-control-accent) 30%, var(--analytics-control-border));
  color: #f1d68a;
  box-shadow:
    -5px -5px 14px -8px var(--analytics-control-shadow-soft),
    10px 13px 24px -13px var(--analytics-control-shadow-dark),
    inset 1px 1px 1px rgb(255 255 255 / 8%),
    inset -2px -2px 4px rgb(0 0 0 / 28%);
}

:global(.dark .analytics-view-expand:active) {
  box-shadow:
    inset 4px 4px 9px rgb(0 0 0 / 42%),
    inset -2px -2px 5px rgb(255 235 188 / 8%);
}
</style>
