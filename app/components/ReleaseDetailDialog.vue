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
  --release-detail-radius: 16px;
  --release-detail-surface: color-mix(in srgb, var(--popover) 88%, var(--background));
  --release-detail-surface-raised: color-mix(in srgb, var(--card) 88%, var(--background));
  --release-detail-surface-muted: color-mix(in srgb, var(--muted) 28%, var(--card));
  --release-detail-border: color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  --release-detail-highlight: color-mix(in srgb, white 58%, transparent);
  --release-detail-lowlight: color-mix(in srgb, var(--foreground) 8%, transparent);

  position: relative;
  isolation: isolate;
  place-self: center !important;
  width: min(1120px, calc(100vw - 32px)) !important;
  max-width: min(1120px, calc(100vw - 32px)) !important;
  margin-inline: auto !important;
  padding: 0 !important;
  overflow: hidden !important;
  border: 1px solid var(--release-detail-border) !important;
  border-radius: var(--release-detail-radius) !important;
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--release-detail-surface) 96%, white 4%),
      color-mix(in srgb, var(--release-detail-surface) 92%, var(--foreground) 4%)
    ) !important;
  box-shadow:
    var(--surface-depth-hero, var(--shadow-lg)),
    0 28px 80px -54px color-mix(in srgb, var(--foreground) 40%, transparent) !important;
}

:global(.dialog-morph-overlay:has(.release-detail-dialog)) {
  align-items: center !important;
  justify-items: center !important;
}

:global(.dark .release-detail-dialog) {
  --release-detail-surface: color-mix(in srgb, var(--popover) 88%, black);
  --release-detail-surface-raised: color-mix(in srgb, var(--card) 84%, white 3%);
  --release-detail-surface-muted: color-mix(in srgb, var(--muted) 20%, black);
  --release-detail-border: color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  --release-detail-highlight: color-mix(in srgb, white 11%, transparent);
  --release-detail-lowlight: rgb(0 0 0 / 38%);

  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--release-detail-surface) 92%, white 3%),
      color-mix(in srgb, var(--release-detail-surface) 90%, black 10%)
    ) !important;
  box-shadow:
    var(--surface-depth-hero, var(--shadow-lg)),
    0 30px 90px -48px rgb(0 0 0 / 84%) !important;
}

:global(.release-detail-dialog)::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 1px;
  pointer-events: none;
  border-radius: calc(var(--release-detail-radius) - 1px);
  background:
    linear-gradient(135deg, var(--release-detail-highlight), transparent 28%),
    radial-gradient(
      circle at 84% 18%,
      color-mix(in srgb, var(--primary) 12%, transparent),
      transparent 34%
    );
  opacity: 0.8;
}

.release-detail-shell {
  position: relative;
  z-index: 1;
  display: grid;
  max-height: min(86vh, 900px);
  grid-template-rows: auto auto minmax(0, 1fr);
  background: transparent;
}

.release-detail-header {
  position: relative;
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) auto 36px;
  gap: 18px;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--release-detail-border) 86%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--release-detail-surface-raised) 82%, transparent),
      color-mix(in srgb, var(--release-detail-surface) 70%, transparent)
    );
}

.release-detail-art {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--release-detail-border) 92%, transparent);
  border-radius: 14px;
  background: var(--release-detail-surface-muted);
  box-shadow:
    var(--surface-depth-slab, var(--surface-depth-standard)),
    inset 0 0 0 1px color-mix(in srgb, white 10%, transparent);
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
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--primary));
  font-size: 32px;
  font-weight: 750;
  background:
    linear-gradient(145deg, transparent, color-mix(in srgb, var(--primary) 8%, transparent)),
    var(--release-detail-surface-muted);
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
  border: 1px solid color-mix(in srgb, var(--release-detail-border) 92%, transparent);
  border-radius: 10px;
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--release-detail-surface-raised) 94%, white 5%),
      color-mix(in srgb, var(--release-detail-surface-raised) 92%, var(--foreground) 3%)
    );
  color: var(--muted-foreground);
  box-shadow: var(--surface-control-raised-shadow, var(--surface-depth-edge));
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out),
    color var(--duration-fast, 150ms) var(--ease-out),
    background var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out),
    transform var(--duration-fast, 150ms) var(--ease-out);
}

.release-detail-close:hover {
  border-color: color-mix(in srgb, var(--primary) 38%, var(--release-detail-border));
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--primary) 10%, var(--release-detail-surface-raised)),
      color-mix(in srgb, var(--release-detail-surface-raised) 90%, var(--primary) 6%)
    );
  color: var(--primary);
  box-shadow: var(--surface-depth-edge-hover);
  transform: translateY(-1px);
}

.release-detail-close:active {
  box-shadow: var(--surface-depth-pressed);
  transform: translateY(0);
}

.release-detail-tabs {
  display: flex;
  gap: 24px;
  overflow-x: auto;
  border-bottom: 1px solid color-mix(in srgb, var(--release-detail-border) 84%, transparent);
  padding: 0 24px;
  background: color-mix(in srgb, var(--release-detail-surface) 70%, transparent);
  box-shadow: none;
}

.release-detail-tab {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  min-height: 50px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 760;
  white-space: nowrap;
  box-shadow: none;
  transition:
    color var(--duration-fast, 150ms) var(--ease-out);
}

.release-detail-tab:hover {
  background: transparent;
  color: var(--foreground);
  box-shadow: none;
}

.release-detail-tab.active {
  background: transparent;
  color: var(--foreground);
  box-shadow: none;
}

.release-detail-tab::after {
  content: "";
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  border-radius: 999px 999px 0 0;
  background: transparent;
  transition: background-color var(--duration-fast, 150ms) var(--ease-out);
}

.release-detail-tab.active::after {
  background: color-mix(in srgb, var(--primary) 82%, var(--foreground));
}

.release-detail-tab-badge {
  min-width: 18px;
  height: 18px;
  border-color: color-mix(in srgb, var(--release-detail-border) 82%, transparent);
  background: color-mix(in srgb, var(--muted) 24%, transparent);
  color: var(--muted-foreground);
  font-size: 10px;
  font-weight: 800;
}

:global(.dark) .release-detail-tabs {
  border-bottom-color: color-mix(in srgb, white 8%, transparent);
  background: color-mix(in srgb, var(--release-detail-surface) 78%, transparent);
}

:global(.dark) .release-detail-tab {
  color: color-mix(in srgb, var(--muted-foreground) 88%, white 4%);
}

:global(.dark) .release-detail-tab:hover {
  background: transparent;
  color: var(--foreground);
}

:global(.dark) .release-detail-tab.active {
  background: transparent;
  color: var(--foreground);
}

:global(.dark) .release-detail-tab.active::after {
  background: color-mix(in srgb, var(--primary) 72%, white 12%);
}

:global(.dark) .release-detail-tab-badge {
  border-color: color-mix(in srgb, white 8%, transparent);
  background: color-mix(in srgb, white 4%, transparent);
  color: color-mix(in srgb, var(--foreground) 72%, var(--muted-foreground));
}

.release-detail-body {
  min-height: 0;
  overflow: auto;
  padding: 24px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--release-detail-surface-muted) 40%, transparent),
      transparent 26%
    );
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

  .release-detail-tabs {
    padding: 10px 12px;
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
