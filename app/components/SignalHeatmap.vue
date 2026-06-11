<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import AppTooltip from "~/components/AppTooltip.vue"

interface SignalHeatmapCell {
  label: string
  value: number
  tone?: "success" | "warning" | "danger" | "info" | "accent" | "muted"
}

const props = defineProps<{
  title: string
  eyebrow?: string
  summary?: string
  ariaLabel?: string
  cells: SignalHeatmapCell[]
  columns?: number
}>()

const columnCount = computed(() => Math.max(4, Math.min(10, props.columns ?? 7)))
const maxValue = computed(() => Math.max(...props.cells.map((cell) => Math.max(0, cell.value)), 1))
const normalizedCells = computed(() => props.cells.map((cell) => {
  const ratio = Math.max(0.12, Math.min(1, Math.max(0, cell.value) / maxValue.value))

  return {
    ...cell,
    ratio,
  }
}))
</script>

<template>
  <Card class="signal-heatmap-panel">
    <CardHeader class="signal-heatmap-header">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription v-if="summary">{{ summary }}</CardDescription>
    </CardHeader>

    <CardContent
      class="signal-heatmap-content"
    >
      <div
      class="signal-heatmap-grid"
      :style="{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }"
      :aria-label="props.ariaLabel || 'Operational intensity heatmap'"
      >
        <AppTooltip
          v-for="cell in normalizedCells"
          :key="cell.label"
          :label="`${cell.label}: ${cell.value}`"
        >
          <span
            :class="['signal-cell', `signal-${cell.tone || 'muted'}`]"
            :style="{ opacity: String(cell.ratio) }"
            tabindex="0"
          />
        </AppTooltip>
      </div>

      <div class="signal-heatmap-legend">
        <div v-for="cell in props.cells.slice(0, 4)" :key="cell.label" class="signal-legend-item">
          <span :class="['signal-legend-dot', `signal-${cell.tone || 'muted'}`]" />
          <span>{{ cell.label }}</span>
          <strong>{{ cell.value }}</strong>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<style scoped>
.signal-heatmap-panel {
  height: 100%;
  min-height: 300px;
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
}

:global(.dark .signal-heatmap-panel) {
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
}

.signal-heatmap-header {
  gap: 4px;
}

.signal-heatmap-header :deep([data-slot="card-title"]) {
  margin: 0;
  color: var(--foreground);
  font-size: 18px;
  font-weight: 650;
  letter-spacing: 0;
}

.signal-heatmap-header :deep([data-slot="card-description"]) {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}

.signal-heatmap-content {
  display: grid;
  gap: 18px;
}

.signal-heatmap-grid {
  display: grid;
  gap: 7px;
  align-content: center;
  min-height: 124px;
}

.signal-cell {
  aspect-ratio: 1;
  min-width: 0;
  border-radius: 5px;
  background: var(--muted);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--background) 40%, transparent);
  transition:
    opacity var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.signal-cell:hover {
  transform: scale(1.08);
}

.signal-success,
.signal-legend-dot.signal-success {
  background: var(--status-success);
}

.signal-warning,
.signal-legend-dot.signal-warning {
  background: var(--status-warning);
}

.signal-danger,
.signal-legend-dot.signal-danger {
  background: var(--destructive);
}

.signal-info,
.signal-legend-dot.signal-info {
  background: var(--status-info);
}

.signal-accent,
.signal-legend-dot.signal-accent {
  background: var(--primary);
}

.signal-muted,
.signal-legend-dot.signal-muted {
  background: var(--muted-foreground);
}

.signal-heatmap-legend {
  display: grid;
  gap: 8px;
}

.signal-legend-item {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  color: var(--muted-foreground);
  font-size: 12px;
}

.signal-legend-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
}

.signal-legend-item strong {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 640px) {
  .signal-heatmap-panel {
    padding: 20px;
  }
}

@media (hover: none), (prefers-reduced-motion: reduce) {
  .signal-cell {
    transition: none;
  }

  .signal-cell:hover {
    transform: none;
  }
}
</style>
