<script setup lang="ts">
import type { ReleaseDisplayStatus } from "~~/types/catalog"

/**
 * Release journey as package-tracking dots:
 * Draft → In review → Delivering → Live.
 * Off-path states (rejected, taken down) mark the stage they stopped at.
 */
const props = defineProps<{
  status: ReleaseDisplayStatus
}>()

const STAGES = ["Draft", "In review", "Delivering", "Live"] as const

const stageIndex = computed(() => {
  switch (props.status) {
    case "draft": return 0
    case "pending_review": return 1
    case "rejected": return 1
    case "scheduled": return 2
    case "live": return 3
    case "taken_down": return 3
    default: return 0
  }
})

const isHalted = computed(() => props.status === "rejected" || props.status === "taken_down" || props.status === "deleted")

const currentLabel = computed(() => {
  if (props.status === "rejected") return "Rejected"
  if (props.status === "taken_down") return "Taken down"
  if (props.status === "deleted") return "Removed"
  return STAGES[stageIndex.value]
})
</script>

<template>
  <span class="pipeline" :class="{ 'pipeline-halted': isHalted }" role="img" :aria-label="`Release status: ${currentLabel}`">
    <span class="pipeline-track" aria-hidden="true">
      <template v-for="(stage, index) in STAGES" :key="stage">
        <span
          class="pipeline-dot"
          :class="{
            'pipeline-dot-done': index < stageIndex,
            'pipeline-dot-current': index === stageIndex,
          }"
        ></span>
        <span
          v-if="index < STAGES.length - 1"
          class="pipeline-line"
          :class="{ 'pipeline-line-done': index < stageIndex }"
        ></span>
      </template>
    </span>
    <span class="pipeline-label">{{ currentLabel }}</span>
  </span>
</template>

<style scoped>
.pipeline {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.pipeline-track {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
}

.pipeline-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  border: 1.5px solid color-mix(in srgb, var(--foreground) 26%, transparent);
  background: transparent;
  transition:
    background-color var(--duration-fast, 150ms) var(--ease-out),
    border-color var(--duration-fast, 150ms) var(--ease-out);
}

.pipeline-dot-done {
  border-color: var(--priority);
  background: var(--priority);
}

.pipeline-dot-current {
  border-color: var(--priority);
  background: var(--priority);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--priority) 18%, transparent);
  /* Tour-stop marquee bulb: flickers on once when the stage lights up */
  animation: marquee-bulb-on 900ms var(--ease-out, ease-out) 1 both;
}

@keyframes marquee-bulb-on {
  0% { opacity: 0.25; }
  18% { opacity: 1; }
  30% { opacity: 0.4; }
  46% { opacity: 1; }
  58% { opacity: 0.65; }
  72%, 100% { opacity: 1; }
}

.pipeline-line {
  width: 14px;
  height: 1.5px;
  background: color-mix(in srgb, var(--foreground) 18%, transparent);
}

.pipeline-line-done {
  background: color-mix(in srgb, var(--priority) 70%, transparent);
  box-shadow: 0 0 5px color-mix(in srgb, var(--priority) 30%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .pipeline-dot-current {
    animation: none;
  }
}

.pipeline-label {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Halted journeys (rejected / taken down): the stopped stage turns ink-red */
.pipeline-halted .pipeline-dot-current {
  border-color: var(--destructive);
  background: var(--destructive);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--destructive) 16%, transparent);
}

.pipeline-halted .pipeline-label {
  color: color-mix(in srgb, var(--destructive) 78%, var(--foreground));
}
</style>
