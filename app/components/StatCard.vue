<script setup lang="ts">
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const props = withDefaults(defineProps<{
  label: string
  value: string
  footnote?: string
  tone?: "default" | "accent" | "alt"
  surface?: "default" | "slab"
  interactive?: boolean
  valueLogoKey?: string | null
  valueCountryCode?: string | null
  valueCountryName?: string | null
}>(), {
  surface: "default",
})
</script>

<template>
  <Card
    size="sm"
    :glint="props.surface === 'slab' ? 'slab' : props.tone === 'accent' ? 'hero' : props.tone === 'alt' ? 'quiet' : 'data'"
    :class="
      cn(
      'stat-card',
      props.surface === 'slab' && 'stat-card-slab',
      props.surface !== 'slab' && props.tone === 'accent' && 'stat-card-accent',
      props.surface !== 'slab' && props.tone === 'alt' && 'stat-card-alt',
      props.interactive && 'stat-card-interactive',
      )
    "
  >
    <CardContent class="stat-card-content">
      <p class="stat-label">{{ props.label }}</p>
      <p class="stat-value">
        <DspLogo v-if="props.valueLogoKey" :logo-key="props.valueLogoKey" :name="props.value" size="xl" />
        <CountryFlag
          v-else-if="props.valueCountryCode || props.valueCountryName"
          :code="props.valueCountryCode"
          :name="props.valueCountryName"
          :label="props.value"
          show-label
          class="stat-country-value"
        />
        <span v-else>{{ props.value }}</span>
      </p>
      <p v-if="props.footnote" class="stat-footnote">{{ props.footnote }}</p>
    </CardContent>
  </Card>
</template>

<style scoped>
.stat-card {
  cursor: default;
  transition:
    transform var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    border-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.stat-card-interactive {
  cursor: pointer;
}

.stat-card-interactive:hover {
  border-color: color-mix(in srgb, var(--primary) 30%, transparent);
  box-shadow: var(--surface-card-shadow-current-hover, var(--shadow-card-hover));
  transform: translateY(-1px);
}

.stat-card-interactive:active {
  transform: translateY(0) scale(0.995);
}

.stat-card-accent {
  border-color: color-mix(in srgb, var(--primary) 35%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--foreground) 14%, var(--border));
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--primary) 9%, var(--card)),
      var(--card) 58%,
      color-mix(in srgb, var(--card) 90%, black 10%)
    );
}

.stat-card-alt {
  border-color: color-mix(in srgb, var(--foreground) 12%, var(--border));
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--muted) 22%, var(--card)),
      var(--card) 62%,
      color-mix(in srgb, var(--card) 94%, black 6%)
    );
}

.stat-card-content {
  display: grid;
  gap: 8px;
}

:global(.app-density-compact) .stat-card {
  border-radius: 10px;
  padding-block: 10px;
}

:global(.app-density-compact) .stat-card-content {
  gap: 5px;
  padding-inline: 16px;
}

.stat-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

:global(.app-density-compact) .stat-label {
  font-size: 10.5px;
  line-height: 1.25;
}

.stat-value {
  display: flex;
  min-width: 0;
  min-height: 38px;
  align-items: center;
  font-size: 28px;
  font-weight: 700;
  color: var(--foreground);
  letter-spacing: 0;
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum";
  line-height: 1.2;
}

:global(.app-density-compact) .stat-value {
  min-height: 28px;
  font-size: clamp(20px, 1.8vw, 24px);
  line-height: 1.05;
}

.stat-country-value {
  max-width: 100%;
  font-size: 22px;
}

:global(.app-density-compact) .stat-country-value {
  font-size: 20px;
}

.stat-footnote {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

:global(.app-density-compact) .stat-footnote {
  font-size: 11px;
  line-height: 1.3;
}
</style>
