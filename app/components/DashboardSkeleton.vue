<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

const props = withDefaults(defineProps<{
  layout?: 'generic' | 'analytics' | 'wallet' | 'releases' | 'ingestion' | 'statements' | 'dashboard-home' | 'release-pulse' | 'top-performers'
  rows?: number
  metrics?: number
  table?: boolean
  label?: string
  class?: HTMLAttributes['class']
}>(), {
  layout: 'generic',
  rows: 4,
  metrics: 0,
  table: false,
  label: "Loading content",
})
</script>

<template>
  <div
    class="dashboard-skeleton"
    :class="[layout !== 'generic' ? `skeleton-layout-${layout}` : '', props.class]"
    role="status"
    aria-live="polite"
    :aria-label="props.label"
  >
    <span class="sr-only">{{ props.label }}</span>

    <!-- 1. HIGH-FIDELITY ANALYTICS SKELETON -->
    <template v-if="layout === 'analytics'">
      <div class="analytics-toolbar">
        <div class="flex items-center justify-between gap-4">
          <Skeleton class="h-3 w-16" />
          <Skeleton class="h-3 w-48" />
        </div>
        <div class="flex flex-wrap gap-2.5 mt-4">
          <Skeleton class="h-10 w-44" />
          <Skeleton class="h-10 w-36" />
          <Skeleton class="h-10 w-16" />
        </div>
      </div>

      <div class="analytics-kpi-grid">
        <div v-for="i in 4" :key="`analytics-kpi-${i}`" class="loading-card">
          <Skeleton class="h-3.5 w-24" />
          <Skeleton class="h-8 w-28 mt-2" />
          <Skeleton class="h-3 w-40 mt-2" />
        </div>
      </div>

      <div class="analytics-bento">
        <!-- World Revenue Map (span 8) -->
        <div class="analytics-bento-map loading-bento-card">
          <div class="flex justify-between items-start mb-4">
            <div>
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-6 w-44 mt-1" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <Skeleton class="h-3.5 w-64 mb-6" />
          <div class="relative w-full h-[280px] bg-muted/40 rounded-lg flex items-center justify-center overflow-hidden border border-border/20">
            <div class="absolute inset-0 grid grid-cols-6 grid-rows-4 opacity-20 pointer-events-none">
              <div v-for="n in 24" :key="n" class="border-[0.5px] border-border" />
            </div>
            <Skeleton class="h-20 w-36 rounded-full opacity-30" />
            <Skeleton class="h-12 w-20 rounded-full opacity-20 ml-4" />
            <Skeleton class="h-8 w-16 rounded-full opacity-15 ml-8 mt-12" />
          </div>
        </div>

        <!-- Monthly Trend Line Chart (span 4) -->
        <div class="loading-bento-card bento-span-4">
          <div class="flex justify-between items-start mb-4">
            <div>
              <Skeleton class="h-3 w-12" />
              <Skeleton class="h-6 w-36 mt-1" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <Skeleton class="h-3.5 w-48 mb-6" />
          <div class="h-[280px] flex items-end justify-between px-2 pt-8">
            <Skeleton v-for="(h, idx) in [40, 60, 45, 90, 80, 110, 70, 85, 120, 100, 130, 150]" :key="`bar-${idx}`" :style="{ height: `${h}px` }" class="w-2.5 rounded-t-sm" />
          </div>
        </div>

        <!-- Platform Mix Stacked (span 6) -->
        <div class="loading-bento-card col-span-6">
          <div class="flex justify-between items-start mb-4">
            <div>
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-6 w-40 mt-1" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <Skeleton class="h-3.5 w-56 mb-6" />
          <div class="h-[220px] flex items-end justify-between px-1">
            <Skeleton v-for="(h, idx) in [80, 120, 95, 150, 130, 180]" :key="`stack-${idx}`" :style="{ height: `${h}px` }" class="w-10 rounded-t-md opacity-70" />
          </div>
        </div>

        <!-- Catalog Momentum Rank List (span 6) -->
        <div class="loading-bento-card col-span-6">
          <div class="flex justify-between items-start mb-4">
            <div>
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-6 w-36 mt-1" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <Skeleton class="h-3.5 w-48 mb-6" />
          <div class="space-y-4">
            <div v-for="i in 4" :key="`rank-${i}`" class="flex items-center justify-between py-2 border-b border-border/20">
              <div class="flex items-center gap-3">
                <Skeleton class="h-10 w-10 rounded" />
                <div class="flex flex-col gap-1.5">
                  <Skeleton class="h-3.5 w-32" />
                  <Skeleton class="h-2.5 w-20" />
                </div>
              </div>
              <Skeleton class="h-4 w-12 tabular-nums" />
            </div>
          </div>
        </div>

        <!-- Audience Pulse Snapshot (span 12) -->
        <div class="loading-bento-card col-span-12">
          <div class="flex justify-between items-start mb-4">
            <div>
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-6 w-32 mt-1" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <Skeleton class="h-3.5 w-72 mb-6" />
          <div class="grid grid-cols-4 gap-4 max-sm:grid-cols-1">
            <div v-for="i in 4" :key="`pulse-${i}`" class="p-4 border border-border/40 rounded-lg bg-muted/10">
              <Skeleton class="h-3 w-20" />
              <Skeleton class="h-6 w-24 mt-2" />
              <Skeleton class="h-3 w-32 mt-2" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 2. HIGH-FIDELITY WALLET SKELETON -->
    <template v-else-if="layout === 'wallet'">
      <div class="wallet-balance-card loading-wallet-card">
        <div class="balance-primary flex items-start gap-4">
          <Skeleton class="h-[52px] w-[52px] rounded-lg" />
          <div class="flex flex-col gap-2">
            <Skeleton class="h-3 w-24" />
            <Skeleton class="h-10 w-48" />
          </div>
        </div>
        <div class="balance-stat-grid grid grid-cols-4 gap-4 mt-6 border-t border-border/40 pt-6 max-sm:grid-cols-2">
          <div v-for="i in 4" :key="`wallet-stat-${i}`" class="balance-stat flex flex-col gap-2">
            <Skeleton class="h-3 w-28" />
            <Skeleton class="h-6 w-20" />
          </div>
        </div>
      </div>

      <!-- Workspace Folder Grid tabs -->
      <div class="grid grid-cols-4 gap-2 border-b border-border/40 pb-px mt-6">
        <div v-for="i in 4" :key="`tab-${i}`" class="h-10 flex items-center justify-center border border-border/40 border-b-0 rounded-t-lg bg-muted/10">
          <Skeleton class="h-4 w-20" />
        </div>
      </div>

      <!-- Recent Movement Panel -->
      <div class="loading-panel mt-6">
        <div class="flex justify-between items-start mb-6">
          <div>
            <Skeleton class="h-3 w-16" />
            <Skeleton class="h-6 w-48 mt-1" />
          </div>
          <Skeleton class="h-5 w-5" />
        </div>
        <div class="space-y-4">
          <div v-for="i in 4" :key="`activity-${i}`" class="flex items-center justify-between py-3 border-b border-border/10">
            <div class="flex items-center gap-3">
              <Skeleton class="h-2 w-2 rounded-full" />
              <div class="flex flex-col gap-1.5">
                <Skeleton class="h-3.5 w-40" />
                <Skeleton class="h-3 w-48" />
                <Skeleton class="h-2.5 w-28" />
              </div>
            </div>
            <Skeleton class="h-4 w-16 tabular-nums" />
          </div>
        </div>
      </div>
    </template>

    <!-- 3. HIGH-FIDELITY RELEASES SKELETON -->
    <template v-else-if="layout === 'releases'">
      <div class="grid grid-cols-4 gap-4 mb-6 max-sm:grid-cols-2">
        <div v-for="i in 4" :key="`release-kpi-${i}`" class="loading-card !min-h-[90px] py-4 flex flex-col justify-center">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-7 w-12 mt-2" />
        </div>
      </div>

      <div class="tl-release-grid grid grid-cols-4 gap-4 max-md:grid-cols-2 max-sm:grid-cols-1">
        <div v-for="i in 8" :key="`release-grid-${i}`" class="flex flex-col border border-border/40 rounded-lg overflow-hidden bg-card">
          <div class="relative aspect-square w-full bg-muted/20">
            <Skeleton class="h-full w-full" />
          </div>
          <div class="p-4 flex flex-col gap-2 flex-grow">
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-3.5 w-24" />
            <div class="flex items-center justify-between mt-2 pt-2 border-t border-border/20">
              <Skeleton class="h-3.5 w-16" />
              <Skeleton class="h-3.5 w-12" />
            </div>
          </div>
          <div class="px-4 pb-4">
            <Skeleton class="h-6 w-24 rounded-full" />
          </div>
        </div>
      </div>
    </template>

    <!-- 4. HIGH-FIDELITY STATEMENTS SKELETON -->
    <template v-else-if="layout === 'statements'">
      <div class="grid grid-cols-4 gap-4 mb-6 max-sm:grid-cols-2">
        <div v-for="i in 4" :key="`statement-kpi-${i}`" class="loading-card">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-8 w-28 mt-2" />
          <Skeleton class="h-3 w-36 mt-2" />
        </div>
      </div>

      <div class="loading-panel">
        <div class="flex justify-between items-start mb-6">
          <div class="flex flex-col gap-1.5">
            <Skeleton class="h-3 w-20" />
            <Skeleton class="h-6 w-44" />
          </div>
          <Skeleton class="h-3 w-40" />
        </div>
        <div class="grid grid-cols-4 gap-4 mb-6 p-4 border border-border/40 rounded-lg bg-muted/10 max-sm:grid-cols-2">
          <div v-for="i in 4" :key="`filter-${i}`" class="flex flex-col gap-2">
            <Skeleton class="h-3 w-16" />
            <Skeleton class="h-9 w-full" />
          </div>
        </div>
        <div class="flex gap-2 border-b border-border/40 pb-px mb-6">
          <div v-for="i in 3" :key="`tab-${i}`" class="h-9 w-24 border border-border/40 border-b-0 rounded-t bg-muted/20" />
        </div>
        <div class="space-y-3">
          <div class="flex items-center justify-between border-b border-border/40 pb-2">
            <Skeleton class="h-4 w-32" />
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-4 w-16" />
            <Skeleton class="h-4 w-20" />
            <Skeleton class="h-4 w-24 text-right" />
          </div>
          <div v-for="i in 6" :key="`row-${i}`" class="flex items-center justify-between py-2 border-b border-border/10">
            <Skeleton class="h-4 w-44" />
            <Skeleton class="h-4 w-20" />
            <Skeleton class="h-4 w-12" />
            <Skeleton class="h-4 w-16" />
            <Skeleton class="h-4 w-20 text-right tabular-nums" />
          </div>
        </div>
      </div>
    </template>

    <!-- 5. HIGH-FIDELITY INGESTION SKELETON -->
    <template v-else-if="layout === 'ingestion'">
      <div class="grid grid-cols-12 gap-6 max-md:grid-cols-1">
        <div class="col-span-5 flex flex-col gap-6 max-md:col-span-1">
          <div class="loading-panel">
            <Skeleton class="h-5 w-44 mb-4" />
            <div class="space-y-3">
              <Skeleton v-for="i in 4" :key="`inst-${i}`" class="h-3 w-full" />
            </div>
          </div>
          <div class="loading-panel">
            <Skeleton class="h-5 w-36 mb-4" />
            <div class="space-y-4">
              <div v-for="i in 2" :key="`param-${i}`" class="flex flex-col gap-2">
                <Skeleton class="h-3 w-20" />
                <Skeleton class="h-10 w-full" />
              </div>
              <Skeleton class="h-32 w-full rounded-lg" />
            </div>
          </div>
          <div class="loading-panel">
            <Skeleton class="h-5 w-48 mb-4" />
            <div class="space-y-4">
              <div v-for="i in 3" :key="`metrics-${i}`" class="flex flex-col gap-2">
                <Skeleton class="h-3 w-32" />
                <Skeleton class="h-10 w-full" />
              </div>
            </div>
          </div>
        </div>
        <div class="col-span-7 loading-panel h-full max-md:col-span-1">
          <div class="flex justify-between items-start mb-6">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="h-6 w-40 mt-1" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <div class="space-y-4">
            <div class="flex items-center justify-between border-b border-border/40 pb-2">
              <Skeleton class="h-4 w-44" />
              <Skeleton class="h-4 w-16" />
              <Skeleton class="h-4 w-12" />
              <Skeleton class="h-4 w-20 text-right" />
            </div>
            <div v-for="i in 8" :key="`hist-row-${i}`" class="flex items-center justify-between py-3 border-b border-border/10">
              <Skeleton class="h-4 w-60" />
              <Skeleton class="h-4 w-12" />
              <Skeleton class="h-4 w-8" />
              <Skeleton class="h-4 w-16 text-right tabular-nums" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 6. HIGH-FIDELITY HOME PAGE RELEASE PULSE SKELETON -->
    <template v-else-if="layout === 'release-pulse'">
      <div class="flex flex-col gap-4">
        <div class="relative w-full aspect-video bg-muted/20 border border-border/40 rounded-lg overflow-hidden">
          <Skeleton class="h-full w-full" />
        </div>
        <div class="flex flex-col gap-2">
          <Skeleton class="h-5 w-3/4" />
          <Skeleton class="h-3.5 w-1/2" />
          <div class="flex gap-4 mt-2">
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-4 w-16" />
          </div>
          <Skeleton class="h-10 w-full mt-4" />
        </div>
      </div>
    </template>

    <!-- 7. HIGH-FIDELITY HOME PAGE TOP PERFORMERS SKELETON -->
    <template v-else-if="layout === 'top-performers'">
      <div class="space-y-4">
        <div v-for="i in 4" :key="`perf-row-${i}`" class="flex items-center justify-between py-2 border-b border-border/10">
          <div class="flex items-center gap-3">
            <Skeleton class="h-[36px] w-[36px] rounded bg-muted/30" />
            <div class="flex flex-col gap-1.5">
              <Skeleton class="h-2.5 w-20 rounded-full" />
              <Skeleton class="h-3.5 w-32" />
              <Skeleton class="h-2.5 w-24" />
            </div>
          </div>
          <div class="flex flex-col items-end gap-1.5">
            <Skeleton class="h-4 w-16 tabular-nums" />
            <Skeleton class="h-2.5 w-10" />
          </div>
        </div>
      </div>
    </template>

    <!-- 8. HIGH-FIDELITY FULL DASHBOARD HOME SKELETON -->
    <template v-else-if="layout === 'dashboard-home'">
      <div class="grid grid-cols-12 gap-6 max-md:grid-cols-1">
        <div class="col-span-8 flex flex-col gap-6 max-md:col-span-1">
          <div class="loading-panel">
            <Skeleton class="h-[120px] w-full" />
            <Skeleton class="h-[250px] w-full mt-4" />
          </div>
          <div class="loading-panel">
            <Skeleton class="h-[150px] w-full" />
          </div>
        </div>
        <div class="col-span-4 flex flex-col gap-6 max-md:col-span-1">
          <div class="loading-panel">
            <Skeleton class="h-[100px] w-full" />
          </div>
          <div class="loading-panel">
            <Skeleton class="h-[320px] w-full" />
          </div>
        </div>
      </div>
    </template>

    <!-- 9. BACKWARD-COMPATIBLE FALLBACK (GENERIC) -->
    <template v-else>
      <div v-if="props.metrics" class="metrics">
        <div v-for="index in props.metrics" :key="`metric-${index}`" class="loading-card">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-8 w-20 mt-2" />
          <Skeleton class="h-3 w-40 mt-2" />
        </div>
      </div>

      <div v-if="props.table" class="loading-table">
        <Skeleton class="h-9 w-full" />
        <Skeleton v-for="index in props.rows" :key="`table-${index}`" class="h-12 w-full mt-2" />
      </div>

      <div v-else class="loading-list">
        <Skeleton v-for="index in props.rows" :key="`row-${index}`" class="h-16 w-full mt-2" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard-skeleton {
  display: grid;
  gap: 16px;
  width: 100%;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.loading-card {
  display: grid;
  align-content: start;
  min-height: 128px;
  padding: 20px 24px;
  border-radius: 16px;
  border: 1px solid var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

.loading-bento-card,
.loading-panel,
.loading-wallet-card {
  display: grid;
  align-content: start;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid var(--surface-border, var(--border));
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

/* Specific component visual mappings to prevent visual page jumps */
.analytics-toolbar {
  display: grid;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--shadow-sm);
}

.analytics-kpi-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.analytics-bento {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: stretch;
}

.analytics-bento > * {
  grid-column: span 6;
}

.analytics-bento-map {
  grid-column: span 8;
}

.bento-span-4 {
  grid-column: span 4;
}

.col-span-12 {
  grid-column: 1 / -1;
}

/* Responsive constraints match design guidelines */
@media (max-width: 1180px) {
  .analytics-kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-bento,
  .analytics-bento > *,
  .analytics-bento-map,
  .bento-span-4 {
    grid-column: auto;
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .analytics-kpi-grid {
    grid-template-columns: 1fr;
  }
  .analytics-toolbar {
    padding: 16px;
  }
}
</style>
