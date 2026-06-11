<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface OperationsRingSegment {
  label: string
  value: number
  detail?: string
  tone?: "success" | "warning" | "danger" | "info" | "accent"
}

import { ref, onMounted, computed } from "vue"

const props = defineProps<{
  title: string
  eyebrow?: string
  summary?: string
  centerLabel?: string
  segments: OperationsRingSegment[]
}>()

const animatedValues = ref<number[]>([])

onMounted(() => {
  // Wait a brief frame, then animate progress values
  setTimeout(() => {
    animatedValues.value = props.segments.map(s => s.value)
  }, 100)
})

const normalizedSegments = computed(() => props.segments.map((segment, index) => {
  const targetValue = Number.isFinite(segment.value) ? Math.max(0, Math.min(100, segment.value)) : 0
  const value = animatedValues.value.length > index ? animatedValues.value[index] : 0

  return {
    ...segment,
    value,
    rank: index + 1,
  }
}))

const average = computed(() => {
  if (!normalizedSegments.value.length) {
    return 0
  }

  const total = normalizedSegments.value.reduce((sum, segment) => sum + segment.value, 0)
  return Math.round(total / normalizedSegments.value.length)
})

function segmentValueText(segment: OperationsRingSegment & { value: number }) {
  const valueText = `${Math.round(segment.value)} percent`

  return segment.detail ? `${valueText}, ${segment.detail}` : valueText
}
</script>

<template>
  <Card class="operations-ring-panel">
    <CardHeader class="operations-ring-header">
      <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
      <CardTitle>{{ title }}</CardTitle>
      <CardDescription v-if="summary">{{ summary }}</CardDescription>
    </CardHeader>

    <CardContent class="operations-ring-body">
      <div class="operations-progress-overview">
        <div class="operations-score-shell">
          <span>{{ props.centerLabel || "Ops health" }}</span>
          <strong>{{ average }}%</strong>
        </div>
        <p>{{ normalizedSegments.length }} signals weighted into one readiness read.</p>
      </div>

      <div class="operations-progress-list stagger-enter">
        <div
          v-for="segment in normalizedSegments"
          :key="segment.label"
          class="operations-progress-row"
          :data-tone="segment.tone || 'accent'"
        >
          <div class="operations-progress-meta">
            <span class="operations-progress-label">
              <span class="operations-progress-dot" aria-hidden="true" />
              <strong>{{ segment.label }}</strong>
            </span>
            <span class="operations-progress-value">{{ Math.round(segment.value) }}%</span>
          </div>
          <Progress
            :model-value="segment.value"
            class="operations-progress-bar"
            :aria-label="`${segment.label} progress`"
            :aria-valuetext="segmentValueText(segment)"
          />
          <small v-if="segment.detail" class="operations-progress-detail">{{ segment.detail }}</small>
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<style scoped>
.operations-ring-panel {
  height: 100%;
  min-height: 340px;
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
}

:global(.dark .operations-ring-panel) {
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
}

.operations-ring-header {
  gap: 4px;
}

.operations-ring-header :deep([data-slot="card-title"]) {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: 0;
}

.operations-ring-header :deep([data-slot="card-description"]) {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
}

.operations-ring-body {
  display: grid;
  grid-template-columns: minmax(150px, 190px) minmax(0, 1fr);
  gap: 20px;
  align-items: center;
}

.operations-progress-overview {
  display: grid;
  gap: 10px;
  align-content: center;
}

.operations-score-shell {
  display: grid;
  place-items: center;
  gap: 3px;
  aspect-ratio: 1;
  width: min(100%, 154px);
  margin-inline: auto;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, var(--primary));
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-muted, var(--muted)) 58%, var(--background));
  box-shadow: none;
}

.operations-score-shell span {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0;
}

.operations-score-shell strong {
  color: var(--foreground);
  font-size: 34px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.operations-progress-overview p {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.operations-progress-list {
  display: grid;
  gap: 12px;
}

.operations-progress-row {
  --operations-progress-tone: var(--primary);
  display: grid;
  gap: 7px;
  padding: 11px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
}

.operations-progress-row:last-child {
  border-bottom: 0;
}

.operations-progress-row[data-tone="success"] {
  --operations-progress-tone: var(--status-success);
}

.operations-progress-row[data-tone="warning"] {
  --operations-progress-tone: var(--status-warning);
}

.operations-progress-row[data-tone="danger"] {
  --operations-progress-tone: var(--destructive);
}

.operations-progress-row[data-tone="info"] {
  --operations-progress-tone: var(--status-info);
}

.operations-progress-row[data-tone="accent"] {
  --operations-progress-tone: var(--primary);
}

.operations-progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.operations-progress-label {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.operations-progress-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--operations-progress-tone);
  box-shadow: none;
}

.operations-progress-label strong {
  min-width: 0;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operations-progress-detail {
  color: var(--muted-foreground);
  font-size: 12px;
  line-height: 1.45;
}

.operations-progress-value {
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.operations-progress-bar {
  height: 8px;
  background: color-mix(in srgb, var(--operations-progress-tone) 16%, var(--muted));
  box-shadow: none;
}

.operations-progress-bar :deep([data-slot="progress-indicator"]) {
  background: var(--operations-progress-tone);
  box-shadow: none;
}

@media (max-width: 640px) {
  .operations-ring-panel {
    padding: 20px;
  }

  .operations-ring-body {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .operations-progress-bar :deep([data-slot="progress-indicator"]) {
    transition: none;
  }
}
</style>
