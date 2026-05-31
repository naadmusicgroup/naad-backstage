<script setup lang="ts">
import { X } from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface ReleaseDialogTab {
  label: string
  value: string
  badge?: string | number
}

const props = defineProps<{
  open: boolean
  title: string
  eyebrow?: string
  subtitle?: string
  imageUrl?: string | null
  imageAlt?: string
  fallback?: string
  tabs: ReleaseDialogTab[]
  activeTab: string
}>()

const emit = defineEmits<{
  close: []
  "update:activeTab": [value: string]
}>()

function onOpenChange(value: boolean) {
  if (!value) {
    emit("close")
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="onOpenChange">
    <DialogScrollContent class="release-detail-dialog" :show-close-button="false">
      <div class="release-detail-shell">
        <div class="release-detail-header">
          <div class="release-detail-art" @contextmenu.prevent>
            <img
              v-if="props.imageUrl"
              :src="props.imageUrl"
              :alt="props.imageAlt || `${props.title} cover art`"
              draggable="false"
              @dragstart.prevent
            />
            <div v-else class="release-detail-art-fallback">
              {{ props.fallback || props.title.slice(0, 1).toUpperCase() }}
            </div>
            <div v-if="$slots.artActions" class="release-detail-art-actions">
              <slot name="artActions" />
            </div>
          </div>

          <div class="release-detail-heading">
            <p v-if="props.eyebrow" class="eyebrow">{{ props.eyebrow }}</p>
            <DialogTitle class="release-detail-title">{{ props.title }}</DialogTitle>
            <DialogDescription v-if="props.subtitle" class="release-detail-description">
              {{ props.subtitle }}
            </DialogDescription>
            <div v-if="$slots.badges" class="release-detail-badges">
              <slot name="badges" />
            </div>
          </div>

          <div v-if="$slots.actions" class="release-detail-actions">
            <slot name="actions" />
          </div>

          <DialogClose as-child>
            <Button variant="ghost" size="icon-sm" class="release-detail-close" type="button" aria-label="Close release details">
              <X class="size-4" />
            </Button>
          </DialogClose>
        </div>

        <div class="release-detail-tabs" role="tablist" aria-label="Release detail sections">
          <Button
            v-for="tab in props.tabs"
            :key="tab.value"
            variant="ghost"
            size="sm"
            class="release-detail-tab h-auto px-0 py-0"
            :class="{ active: tab.value === props.activeTab }"
            type="button"
            role="tab"
            :aria-selected="tab.value === props.activeTab"
            @click="emit('update:activeTab', tab.value)"
          >
            <span>{{ tab.label }}</span>
            <Badge
              v-if="tab.badge !== undefined && tab.badge !== ''"
              variant="secondary"
              class="release-detail-tab-badge h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
            >
              {{ tab.badge }}
            </Badge>
          </Button>
        </div>

        <div class="release-detail-body">
          <slot />
        </div>
      </div>
    </DialogScrollContent>
  </Dialog>
</template>

<style scoped>
:global(.release-detail-dialog) {
  width: min(1120px, calc(100vw - 32px)) !important;
  max-width: min(1120px, calc(100vw - 32px)) !important;
  padding: 0 !important;
  overflow: hidden !important;
  border: 1px solid color-mix(in srgb, var(--border) 82%, transparent) !important;
  border-radius: 12px !important;
  background: var(--popover) !important;
  box-shadow: var(--shadow-lg) !important;
}

:global(.dark .release-detail-dialog) {
  background: var(--popover) !important;
}

.release-detail-shell {
  display: grid;
  max-height: min(86vh, 900px);
  grid-template-rows: auto auto minmax(0, 1fr);
}

.release-detail-header {
  position: relative;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) auto 36px;
  gap: 18px;
  align-items: center;
  padding: 22px 24px;
  border-bottom: 1px solid var(--border);
}

.release-detail-art {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--muted);
}

.release-detail-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}

.release-detail-art-fallback {
  display: grid;
  height: 100%;
  place-items: center;
  color: var(--muted-foreground);
  font-size: 32px;
  font-weight: 750;
}

.release-detail-art-actions {
  position: absolute;
  bottom: 8px;
  left: 8px;
  display: flex;
  gap: 6px;
  z-index: 1;
}

.release-detail-art-actions :deep(.release-detail-art-action-button) {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 22%);
  border-radius: 9px;
  background: rgb(10 10 10 / 34%);
  color: #ffffff;
  box-shadow: none;
  backdrop-filter: blur(8px);
}

.release-detail-art-actions :deep(.release-detail-art-action-button:hover) {
  border-color: rgb(255 255 255 / 34%);
  background: rgb(10 10 10 / 48%);
  color: #ffffff;
  box-shadow: none;
  transform: translateY(-1px);
}

.release-detail-art-actions :deep(.release-detail-art-action-button:active) {
  background: rgb(10 10 10 / 56%);
  transform: translateY(0);
}

.release-detail-heading {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.release-detail-title {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--foreground);
  font-size: clamp(24px, 3vw, 36px);
  font-weight: 720;
  line-height: 1.05;
  letter-spacing: 0;
}

.release-detail-description {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
}

.release-detail-badges,
.release-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.release-detail-close {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--card) 78%, transparent);
  color: var(--muted-foreground);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out),
    background var(--duration-fast, 150ms) var(--ease-out);
}

.release-detail-close:hover {
  border-color: color-mix(in srgb, var(--primary) 40%, var(--border));
  background: color-mix(in srgb, var(--primary) 8%, var(--card));
  color: var(--primary);
}

.release-detail-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  padding: 10px 14px 0;
}

.release-detail-tab {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 14px 10px;
  border: 0;
  background: none;
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.release-detail-tab.active {
  color: var(--primary);
}

.release-detail-tab::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 50%;
  right: 50%;
  height: 2px;
  border-radius: 999px 999px 0 0;
  background: var(--primary);
  transition: left 200ms var(--ease-out), right 200ms var(--ease-out);
}

.release-detail-tab.active::after {
  left: 8px;
  right: 8px;
}

.release-detail-tab-badge {
  color: var(--primary);
}

.release-detail-body {
  min-height: 0;
  overflow: auto;
  padding: 24px;
}

@media (max-width: 720px) {
  :global(.release-detail-dialog) {
    width: calc(100vw - 16px) !important;
    max-width: calc(100vw - 16px) !important;
  }

  .release-detail-shell {
    max-height: calc(100dvh - 24px);
  }

  .release-detail-header {
    grid-template-columns: 78px minmax(0, 1fr) 36px;
    gap: 14px;
    padding: 18px;
  }

  .release-detail-actions {
    grid-column: 1 / -1;
  }

  .release-detail-body {
    padding: 18px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .release-detail-close {
    transition: none;
  }
}
</style>
