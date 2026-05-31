<script setup lang="ts">
import { computed } from "vue"
import {
  CheckCheck,
  Clock3,
  Info,
  Trash2,
} from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"

const props = defineProps<{
  tone?: "default" | "success" | "warning" | "danger" | "info" | "muted"
}>()

const tone = computed(() => props.tone || "default")
const icon = computed(() => {
  if (tone.value === "success") return CheckCheck
  if (tone.value === "warning") return Clock3
  if (tone.value === "danger") return Trash2
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
  --status-badge-bg: #f2f0eb;
  --status-badge-border: rgba(95, 90, 80, 0.12);
  --status-badge-fg: #5f5a50;

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
  stroke-width: 2.4;
}

.status-badge-success {
  --status-badge-bg: #45bb57;
  --status-badge-border: #45bb57;
  --status-badge-fg: #ffffff;
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

.status-badge-muted {
  --status-badge-bg: #eeece7;
  --status-badge-border: rgba(95, 90, 80, 0.12);
  --status-badge-fg: #5f5a50;
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

:global(.dark .status-badge-muted) {
  --status-badge-bg: #17171b;
  --status-badge-border: rgba(255, 255, 255, 0.06);
  --status-badge-fg: #b7b2a5;
}
</style>
