<script setup lang="ts">
import type { Component } from "vue"
import { ArrowRight, CircleDot } from "lucide-vue-next"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

defineProps<{
  label: string
  to: string
  icon?: Component
  meta?: string
  badge?: string | number
  tone?: "default" | "accent" | "alt" | "danger"
}>()
</script>

<template>
  <NuxtLink
    :to="to"
    class="spotlight-action-link"
  >
    <Card
      size="sm"
      glint="quiet"
      :class="['spotlight-action-card', `spotlight-${tone || 'default'}`]"
    >
      <span class="spotlight-icon">
        <component :is="icon || CircleDot" class="size-5" />
      </span>
      <span class="spotlight-copy">
        <span class="spotlight-label">{{ label }}</span>
        <span v-if="meta" class="spotlight-meta">{{ meta }}</span>
      </span>
      <Badge v-if="badge !== undefined && badge !== ''" variant="secondary" class="spotlight-badge">
        {{ badge }}
      </Badge>
      <span class="spotlight-arrow" aria-hidden="true">
        <ArrowRight class="size-4" />
      </span>
    </Card>
  </NuxtLink>
</template>

<style scoped>
.spotlight-action-link {
  display: block;
  height: 100%;
  color: inherit;
  text-decoration: none;
}

.spotlight-action-card {
  --spotlight-color: var(--primary);
  --spotlight-x: 50%;
  --spotlight-y: 50%;
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto 32px;
  gap: 14px;
  align-items: center;
  min-height: 88px;
  padding: 18px 20px;
  overflow: hidden;
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card) 94%, white 5%),
      var(--card) 58%,
      color-mix(in srgb, var(--card) 92%, black 8%)
    );
  color: inherit;
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
  text-decoration: none;
  transition:
    transform var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    border-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.spotlight-action-card:hover {
  border-color: color-mix(in srgb, var(--spotlight-color) 44%, var(--border));
  background:
    radial-gradient(
      ellipse at 18% 50%,
      color-mix(in srgb, var(--spotlight-color) 7%, var(--card)) 0%,
      var(--card) 65%
    );
  box-shadow: var(--surface-card-shadow-current-hover, var(--shadow-card-hover));
  transform: translateY(-1px);
}

:global(.dark .spotlight-action-card) {
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card) 92%, white 5%),
      var(--card) 58%,
      color-mix(in srgb, var(--card) 88%, black 12%)
    );
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
}

.spotlight-action-card:active {
  transform: translateY(0) scale(0.995);
}

.spotlight-accent {
  --spotlight-color: var(--primary);
}

.spotlight-alt {
  --spotlight-color: var(--priority);
}

.spotlight-danger {
  --spotlight-color: var(--destructive);
}

.spotlight-icon,
.spotlight-arrow {
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: color-mix(in srgb, var(--spotlight-color) 12%, transparent);
  color: var(--spotlight-color);
  overflow: hidden;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    border-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.spotlight-icon {
  width: 44px;
  height: 44px;
}

.spotlight-arrow {
  width: 32px;
  height: 32px;
  border: 1px solid color-mix(in srgb, var(--spotlight-color) 24%, var(--border));
  grid-column: 4;
}

.spotlight-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.spotlight-label {
  color: var(--foreground);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.35;
  text-transform: uppercase;
}

.spotlight-meta {
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotlight-badge {
  grid-column: 3;
  justify-self: end;
  max-width: 110px;
  text-overflow: ellipsis;
}

@media (max-width: 640px) {
  .spotlight-action-card {
    grid-template-columns: 44px minmax(0, 1fr) 32px;
  }

  .spotlight-badge {
    grid-column: 2 / 3;
    justify-self: start;
  }

  .spotlight-arrow {
    grid-column: 3;
  }
}

@media (hover: none), (prefers-reduced-motion: reduce) {
  .spotlight-action-card {
    transition: none;
  }

  .spotlight-action-card:hover,
  .spotlight-action-card:active {
    transform: none;
  }
}
</style>
