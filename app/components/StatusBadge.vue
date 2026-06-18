<script setup lang="ts">
import { computed } from "vue"
import {
  CheckCircle2,
  Clock3,
  Info,
  TriangleAlert,
} from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"

const props = defineProps<{
  tone?: "default" | "success" | "warning" | "danger" | "info" | "purple" | "muted"
}>()

const tone = computed(() => props.tone || "default")
const icon = computed(() => {
  if (tone.value === "success") return CheckCircle2
  if (tone.value === "warning") return Clock3
  if (tone.value === "danger") return TriangleAlert
  if (tone.value === "purple") return Clock3
  if (tone.value === "info") return Info
  return null
})
</script>

<template>
  <Badge variant="outline" class="status-badge cursor-default select-none" :class="`status-badge-${tone}`">
    <component :is="icon" v-if="icon" class="status-badge-icon" aria-hidden="true" />
    <slot />
  </Badge>
</template>

<style scoped>
.status-badge {
  --status-badge-bg: color-mix(in srgb, var(--surface-muted, #e5dccd) 48%, var(--card, #faf6ee));
  --status-badge-border: var(--surface-border, rgba(45, 39, 31, 0.16));
  --status-badge-fg: var(--muted-foreground, #5f5548);

  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 28px;
  border-color: var(--status-badge-border);
  border-radius: 999px;
  background: var(--status-badge-bg);
  color: var(--status-badge-fg);
  padding: 5px 12px;
  font-family: var(--font-app-sans);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1;
  text-transform: capitalize;
  box-shadow: none;
}

.status-badge-icon {
  width: 14px;
  height: 14px;
  stroke-width: 2.7;
}

.status-badge-success {
  --status-badge-bg: #45bb57;
  --status-badge-border: #45bb57;
  --status-badge-fg: #ffffff;
  gap: 6px;
  min-height: 28px;
  padding: 5px 13px;
  box-shadow:
    inset 1px 1px 0 color-mix(in srgb, white 24%, transparent),
    0 8px 16px -14px color-mix(in srgb, var(--foreground) 28%, transparent);
}

.status-badge-warning {
  --status-badge-bg: #d98216;
  --status-badge-border: transparent;
  --status-badge-fg: #ffffff;
}

.status-badge-danger {
  --status-badge-bg: #f0525a;
  --status-badge-border: #f0525a;
  --status-badge-fg: #ffffff;
}

.status-badge-info {
  --status-badge-bg: color-mix(in srgb, var(--priority) 62%, #6f5416 38%);
  --status-badge-border: color-mix(in srgb, var(--priority) 48%, transparent);
  --status-badge-fg: var(--dashboard-ivory, #fef9e7);
}

.status-badge-purple {
  --status-badge-bg: #7c3aed;
  --status-badge-border: #7c3aed;
  --status-badge-fg: #ffffff;
}

.status-badge-muted {
  --status-badge-bg: color-mix(in srgb, var(--surface-muted, #e5dccd) 62%, var(--card, #faf6ee));
  --status-badge-border: var(--surface-border, rgba(45, 39, 31, 0.16));
  --status-badge-fg: var(--muted-foreground, #5f5548);
}

:global(.dark .status-badge) {
  --status-badge-bg: #17171b;
  --status-badge-border: rgba(255, 255, 255, 0.06);
  --status-badge-fg: #f4f4f2;
}

:global(.dark .status-badge-success) {
  --status-badge-bg: #45bb57;
  --status-badge-border: #45bb57;
  --status-badge-fg: #ffffff;
  box-shadow: none;
}

:global(.dark .status-badge-warning) {
  --status-badge-bg: #d98216;
  --status-badge-border: transparent;
  --status-badge-fg: #ffffff;
}

:global(.dark .status-badge-danger) {
  --status-badge-bg: #f0525a;
  --status-badge-border: #f0525a;
  --status-badge-fg: #ffffff;
}

:global(.dark .status-badge-info) {
  --status-badge-bg: color-mix(in srgb, var(--priority) 62%, #6f5416 38%);
  --status-badge-border: color-mix(in srgb, var(--priority) 48%, transparent);
  --status-badge-fg: var(--dashboard-ivory, #fef9e7);
}

:global(.dark .status-badge-purple) {
  --status-badge-bg: #8b5cf6;
  --status-badge-border: #8b5cf6;
  --status-badge-fg: #ffffff;
}

:global(.dark .status-badge-muted) {
  --status-badge-bg: #17171b;
  --status-badge-border: rgba(255, 255, 255, 0.06);
  --status-badge-fg: #b7b2a5;
}
</style>
