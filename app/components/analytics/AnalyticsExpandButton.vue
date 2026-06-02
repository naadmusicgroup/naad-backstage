<script setup lang="ts">
import { Maximize2 } from "lucide-vue-next"

const props = withDefaults(defineProps<{
  label?: string
}>(), {
  label: "Open analytics detail",
})

const emit = defineEmits<{
  expand: []
}>()
</script>

<template>
  <button
    type="button"
    class="analytics-expand-button"
    :aria-label="props.label"
    :title="props.label"
    @click="emit('expand')"
  >
    <Maximize2 aria-hidden="true" />
  </button>
</template>

<style scoped>
.analytics-expand-button {
  position: relative;
  display: inline-grid;
  width: 38px;
  height: 38px;
  place-items: center;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 70%, white 18%);
  border-radius: 999px;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 58%), rgb(255 255 255 / 22%)),
    color-mix(in srgb, var(--card) 68%, transparent);
  color: color-mix(in srgb, var(--foreground) 68%, var(--muted-foreground));
  backdrop-filter: blur(14px) saturate(1.08);
  box-shadow:
    inset 1px 1px 0 rgb(255 255 255 / 72%),
    inset -1px -2px 4px rgb(0 0 0 / 5%),
    0 7px 18px -15px rgb(0 0 0 / 30%);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out),
    transform var(--duration-fast, 150ms) var(--ease-out);
}

.analytics-expand-button::after {
  position: absolute;
  inset: 3px 6px auto;
  height: 32%;
  border-radius: inherit;
  background: linear-gradient(180deg, rgb(255 255 255 / 34%), transparent);
  content: "";
  pointer-events: none;
}

.analytics-expand-button svg {
  position: relative;
  z-index: 1;
  width: 14.5px;
  height: 14.5px;
  stroke-width: 2;
}

.analytics-expand-button:hover {
  border-color: color-mix(in srgb, var(--foreground) 14%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, rgb(255 255 255 / 68%), rgb(255 255 255 / 28%)),
    color-mix(in srgb, var(--card) 74%, transparent);
  color: var(--foreground);
  box-shadow:
    inset 1px 1px 0 rgb(255 255 255 / 78%),
    inset -1px -2px 4px rgb(0 0 0 / 6%),
    0 9px 20px -16px rgb(0 0 0 / 36%);
  transform: translateY(-1px);
}

.analytics-expand-button:active {
  transform: translateY(0);
}

.analytics-expand-button:focus-visible {
  outline: 2px solid color-mix(in srgb, #d49b34 56%, var(--ring));
  outline-offset: 2px;
}

:global(.dark) .analytics-expand-button {
  border-color: color-mix(in srgb, #f5f2e8 8%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, rgb(255 255 255 / 9%), rgb(255 255 255 / 3%)),
    color-mix(in srgb, #0a0a0a 34%, var(--card) 66%);
  color: color-mix(in srgb, #f5f2e8 74%, var(--muted-foreground));
  box-shadow:
    inset 1px 1px 0 rgb(255 255 255 / 8%),
    inset -1px -2px 4px rgb(0 0 0 / 24%),
    0 7px 18px -15px rgb(0 0 0 / 86%);
}

:global(.dark) .analytics-expand-button:hover {
  border-color: color-mix(in srgb, #f5f2e8 14%, var(--surface-border, var(--border)));
  background:
    linear-gradient(145deg, rgb(255 255 255 / 12%), rgb(255 255 255 / 4%)),
    color-mix(in srgb, #0a0a0a 28%, var(--card) 72%);
  color: #f5f2e8;
  box-shadow:
    inset 1px 1px 0 rgb(255 255 255 / 10%),
    inset -1px -2px 4px rgb(0 0 0 / 22%),
    0 9px 20px -16px rgb(0 0 0 / 88%);
}
</style>
