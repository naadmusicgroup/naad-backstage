<script setup lang="ts">
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

defineProps<{
  label: string
  value: string
  footnote?: string
  tone?: "default" | "accent" | "alt"
  interactive?: boolean
  valueLogoKey?: string | null
  valueCountryCode?: string | null
  valueCountryName?: string | null
}>()
</script>

<template>
  <Card
    size="sm"
    :class="
      cn(
      'stat-card',
      tone === 'accent' && 'stat-card-accent',
      tone === 'alt' && 'stat-card-alt',
      interactive && 'stat-card-interactive',
      )
    "
  >
    <CardContent class="stat-card-content">
      <p class="stat-label">{{ label }}</p>
      <p class="stat-value">
        <DspLogo v-if="valueLogoKey" :logo-key="valueLogoKey" :name="value" size="xl" />
        <CountryFlag
          v-else-if="valueCountryCode || valueCountryName"
          :code="valueCountryCode"
          :name="valueCountryName"
          :label="value"
          show-label
          class="stat-country-value"
        />
        <span v-else>{{ value }}</span>
      </p>
      <p v-if="footnote" class="stat-footnote">{{ footnote }}</p>
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
  box-shadow: var(--shadow-card-hover);
  transform: translateY(-1px);
}

.stat-card-interactive:active {
  transform: translateY(0) scale(0.995);
}

.stat-card-accent {
  border-color: color-mix(in srgb, var(--primary) 35%, transparent);
  border-top: 2px solid color-mix(in srgb, var(--priority) 56%, transparent);
  background: color-mix(in srgb, var(--primary) 8%, var(--card));
}

.stat-card-alt {
  border-color: color-mix(in srgb, var(--priority) 20%, transparent);
  background: color-mix(in srgb, var(--priority) 3%, var(--card));
}

.stat-card-content {
  display: grid;
  gap: 8px;
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

.stat-country-value {
  max-width: 100%;
  font-size: 22px;
}

.stat-footnote {
  font-size: 12px;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}
</style>
