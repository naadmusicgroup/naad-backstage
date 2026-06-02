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
        <ChartSpline aria-hidden="true" />
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
  gap: 9px;
}

.analytics-view-toggle {
  --view-thumb-x: 0px;
  position: relative;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  width: 82px;
  height: 42px;
  gap: 4px;
  border: 1px solid color-mix(in srgb, #a7732d 26%, var(--surface-border, var(--border)));
  border-radius: 999px;
  background:
    linear-gradient(145deg, #d6aa5d 0%, #ad762f 52%, #7c4d19 100%);
  padding: 4px;
  box-shadow:
    inset 0 2px 3px rgb(255 240 201 / 28%),
    inset 0 -3px 6px rgb(66 39 11 / 28%),
    inset 0 0 0 1px rgb(81 48 13 / 12%),
    0 4px 8px -7px rgb(73 43 11 / 60%);
  transition:
    background var(--duration-fast, 150ms) var(--ease-out),
    border-color var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-view-toggle.is-table {
  --view-thumb-x: 38px;
  background:
    linear-gradient(145deg, #c2a16e 0%, #8f6930 52%, #5e4118 100%);
}

.analytics-view-toggle::before {
  position: absolute;
  top: 4px;
  left: 4px;
  z-index: 0;
  width: 34px;
  height: 34px;
  border: 1px solid rgb(255 255 255 / 78%);
  border-radius: 999px;
  background:
    linear-gradient(145deg, #fff6dc 0%, #e4c273 58%, #bc8b34 100%);
  box-shadow:
    inset 1px 1px 1px rgb(255 255 255 / 72%),
    inset -1px -2px 4px rgb(89 55 13 / 18%),
    0 2px 4px rgb(74 47 15 / 22%);
  content: "";
  transform: translateX(var(--view-thumb-x));
  transition:
    transform 210ms cubic-bezier(.2, .9, .24, 1),
    box-shadow var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-view-button,
.analytics-view-expand {
  position: relative;
  display: inline-grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: color-mix(in srgb, #fff9e8 82%, #5e3a10);
  overflow: hidden;
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out),
    opacity var(--duration-fast, 150ms) var(--ease-out),
    transform var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-view-button svg,
.analytics-view-expand svg {
  position: relative;
  z-index: 1;
  width: 14.5px;
  height: 14.5px;
  stroke-width: 2;
}

.analytics-view-button:not(.active):hover {
  color: #fffdf2;
  opacity: 0.96;
}

.analytics-view-button.active {
  color: #3f290b;
}

.analytics-view-toggle:hover::before {
  box-shadow:
    inset 1px 1px 1px rgb(255 255 255 / 74%),
    inset -1px -2px 4px rgb(89 55 13 / 18%),
    0 3px 5px rgb(74 47 15 / 26%);
}

.analytics-view-expand {
  width: 38px;
  height: 38px;
  border-color: color-mix(in srgb, #b98942 24%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, #fff5dc 0%, #e3c173 56%, #b78432 100%);
  color: #4b310e;
  box-shadow:
    inset 1px 1px 1px rgb(255 255 255 / 70%),
    inset -1px -2px 4px rgb(89 55 13 / 18%),
    0 3px 6px -3px rgb(75 46 13 / 46%);
}

.analytics-view-expand::after {
  position: absolute;
  inset: 3px 6px auto;
  height: 28%;
  border-radius: inherit;
  background: linear-gradient(180deg, rgb(255 255 255 / 28%), transparent);
  content: "";
  pointer-events: none;
}

.analytics-view-expand:hover {
  border-color: color-mix(in srgb, #a7732d 42%, var(--surface-border, var(--border)));
  color: #2f1d06;
  transform: translateY(-1px);
  box-shadow:
    inset 1px 1px 1px rgb(255 255 255 / 74%),
    inset -1px -2px 4px rgb(89 55 13 / 18%),
    0 4px 7px -4px rgb(75 46 13 / 50%);
}

.analytics-view-button:focus-visible,
.analytics-view-expand:focus-visible {
  outline: 2px solid color-mix(in srgb, #d49b34 56%, var(--ring));
  outline-offset: 2px;
}

.analytics-view-button:active,
.analytics-view-expand:active {
  transform: translateY(0);
}

:global(.dark .analytics-view-toggle) {
  border-color: color-mix(in srgb, #d7ae66 20%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, #312009 0%, #94651f 52%, #c99b43 100%);
  box-shadow:
    inset 0 2px 3px rgb(255 235 188 / 13%),
    inset 0 -3px 6px rgb(0 0 0 / 36%),
    inset 0 0 0 1px rgb(255 225 165 / 7%),
    0 4px 8px -7px rgb(0 0 0 / 88%);
}

:global(.dark .analytics-view-toggle.is-table) {
  background:
    linear-gradient(145deg, #1d1407 0%, #704b1b 52%, #a67b34 100%);
}

:global(.dark .analytics-view-toggle::before) {
  border-color: color-mix(in srgb, #ffe9ba 70%, transparent);
  background:
    linear-gradient(145deg, #ffeec5 0%, #c99436 58%, #7d5014 100%);
  box-shadow:
    inset 1px 1px 1px rgb(255 244 214 / 34%),
    inset -1px -2px 4px rgb(0 0 0 / 24%),
    0 3px 5px rgb(0 0 0 / 38%);
}

:global(.dark .analytics-view-button) {
  color: color-mix(in srgb, #fff4d4 76%, #8b6b39);
}

:global(.dark .analytics-view-button.active) {
  color: #1e1203;
}

:global(.dark .analytics-view-button:not(.active):hover) {
  color: #fff9e8;
}

:global(.dark .analytics-view-expand) {
  border-color: color-mix(in srgb, #d7ae66 20%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, #ffe9b8 0%, #c28a2e 56%, #583708 100%);
  color: #1d1103;
  box-shadow:
    inset 1px 1px 1px rgb(255 244 214 / 30%),
    inset -1px -2px 4px rgb(0 0 0 / 24%),
    0 3px 6px -3px rgb(0 0 0 / 86%);
}

:global(.dark .analytics-view-expand:hover) {
  border-color: color-mix(in srgb, #ffe0a0 34%, var(--surface-border, var(--border)));
  color: #0f0902;
  box-shadow:
    inset 1px 1px 1px rgb(255 244 214 / 34%),
    inset -1px -2px 4px rgb(0 0 0 / 22%),
    0 4px 7px -4px rgb(0 0 0 / 88%);
}
</style>
