<script setup lang="ts">
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface WorkspaceFolderItem {
  label: string
  value: string
  icon?: string
  meta?: string
  badge?: string | number
  imageUrl?: string | null
  tone?: "default" | "accent" | "alt" | "danger"
}

const props = defineProps<{
  items: WorkspaceFolderItem[]
  modelValue: string
  label?: string
}>()

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

function selectFolder(value: string) {
  emit("update:modelValue", value)
}
</script>

<template>
  <div class="folder-tabs" :aria-label="props.label || 'Workspace sections'" role="tablist">
    <Button
      v-for="item in props.items"
      :key="item.value"
      type="button"
      variant="ghost"
      size="sm"
      :class="['folder-tab h-auto px-0 py-0', { active: item.value === props.modelValue }]"
      role="tab"
      :aria-selected="item.value === props.modelValue"
      @click="selectFolder(item.value)"
    >
      <span class="folder-tab-label">{{ item.label }}</span>
      <Badge
        v-if="item.badge !== undefined && item.badge !== ''"
        variant="secondary"
        class="folder-tab-badge h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
      >
        {{ item.badge }}
      </Badge>
    </Button>
  </div>
</template>

<style scoped>
.folder-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
}

.folder-tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: color 0.15s;
  white-space: nowrap;
}

.folder-tab:hover {
  color: var(--foreground);
}

.folder-tab.active {
  color: var(--primary);
}

.folder-tab::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 50%;
  right: 50%;
  height: 2px;
  background: var(--primary);
  border-radius: 2px 2px 0 0;
  transition: left 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
              right 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.folder-tab.active::after {
  left: 0;
  right: 0;
}

.folder-tab-label {
  pointer-events: none;
}

.folder-tab-badge {
  font-weight: 600;
}

.folder-tab.active .folder-tab-badge {
  color: var(--primary);
}
</style>
