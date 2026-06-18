<script setup lang="ts">
import type { HTMLAttributes } from "vue"

type DashboardSkeletonLayout =
  | "generic"
  | "analytics"
  | "artist-analytics"
  | "admin-analytics"
  | "wallet"
  | "payout-form"
  | "releases"
  | "artist-releases"
  | "ingestion"
  | "statements"
  | "dashboard-home"
  | "artist-home"
  | "release-pulse"
  | "top-performers"
  | "settings"
  | "artist-settings"
  | "publishing"
  | "artist-publishing"
  | "notifications"
  | "artist-notifications"
  | "uploader"
  | "admin-home"
  | "admin-artists-directory"
  | "admin-artists-access"
  | "admin-releases-requests"
  | "admin-releases-workspace"
  | "admin-earnings"
  | "admin-dues"
  | "admin-payouts"
  | "admin-company-ledger"
  | "admin-company-analytics"
  | "admin-publishing-requests"
  | "admin-publishing-writers"
  | "admin-publishing-credits"
  | "admin-settings-table"
  | "admin-settings-reconciliation"
  | "admin-settings-archive"
  | "admin-notifications"
  | "admin-naadlinks-manage"
  | "table-panel"
  | "form-panel"
  | "timeline"

const props = withDefaults(defineProps<{
  layout?: DashboardSkeletonLayout
  rows?: number
  metrics?: number
  table?: boolean
  label?: string
  class?: HTMLAttributes["class"]
}>(), {
  layout: "generic",
  rows: 4,
  metrics: 0,
  table: false,
  label: "Loading content",
})

const normalizedLayout = computed(() => {
  if (props.layout === "dashboard-home") return "artist-home"
  if (props.layout === "artist-analytics") return "analytics"
  if (props.layout === "artist-releases") return "releases"
  if (props.layout === "artist-settings") return "settings"
  if (props.layout === "artist-publishing") return "publishing"
  if (props.layout === "artist-notifications") return "notifications"
  return props.layout
})

const rowCount = computed(() => Math.max(1, props.rows))
const metricCount = computed(() => Math.max(1, props.metrics || 4))
const tableRowCount = computed(() => Math.max(2, props.rows))
const chartBars = [38, 66, 48, 92, 78, 122, 86, 104, 134, 116, 150, 168]
const compactBars = [42, 78, 56, 112, 88, 132]
</script>

<template>
  <div
    class="dashboard-skeleton"
    :class="[normalizedLayout !== 'generic' ? `skeleton-layout-${normalizedLayout}` : '', props.class]"
    role="status"
    aria-live="polite"
    :aria-label="props.label"
  >
    <span class="sr-only">{{ props.label }}</span>

    <!-- Artist dashboard home -->
    <template v-if="normalizedLayout === 'artist-home'">
      <div class="sk-metrics sk-metrics-4">
        <div v-for="index in 4" :key="`artist-home-stat-${index}`" class="sk-stat sk-stat-slab">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-8 w-28" />
          <Skeleton class="h-3 w-36" />
        </div>
      </div>

      <div class="sk-bento">
        <div class="sk-panel sk-span-8 sk-chart-panel sk-panel-tall">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-44" />
            </div>
            <Skeleton class="h-9 w-36 rounded-xl" />
          </div>
          <div class="sk-chart-bars">
            <Skeleton
              v-for="(height, index) in chartBars"
              :key="`home-chart-${index}`"
              class="w-3 rounded-t-md"
              :style="{ height: `${height}px` }"
            />
          </div>
        </div>

        <div class="sk-panel sk-span-4 sk-next-card">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-32" />
            </div>
            <Skeleton class="h-10 w-10 rounded-xl" />
          </div>
          <div class="sk-route-list">
            <div v-for="index in 2" :key="`home-next-${index}`" class="sk-route-row">
              <Skeleton class="h-11 w-11 rounded-xl" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-3 w-16" />
                <Skeleton class="mt-2 h-4 w-40 max-w-full" />
                <Skeleton class="mt-2 h-3 w-56 max-w-full" />
              </div>
            </div>
          </div>
        </div>

        <div class="sk-panel sk-span-8">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-40" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <div class="sk-list">
            <div v-for="index in 4" :key="`activity-row-${index}`" class="sk-ledger-row">
              <Skeleton class="h-2.5 w-2.5 rounded-full" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-44 max-w-full" />
                <Skeleton class="mt-2 h-3 w-64 max-w-full" />
                <Skeleton class="mt-2 h-3 w-28" />
              </div>
              <Skeleton class="h-4 w-20" />
            </div>
          </div>
        </div>

        <div class="sk-panel sk-span-4">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-36" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <div class="sk-cover-card">
            <Skeleton class="aspect-video w-full rounded-xl" />
            <Skeleton class="h-5 w-3/4" />
            <Skeleton class="h-3 w-1/2" />
            <Skeleton class="h-10 w-full rounded-xl" />
          </div>
        </div>

        <div class="sk-panel sk-span-8">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-28" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <div class="sk-action-grid">
            <div v-for="index in 4" :key="`home-action-${index}`" class="sk-action-tile">
              <Skeleton class="h-10 w-10 rounded-xl" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-28" />
                <Skeleton class="mt-2 h-3 w-36 max-w-full" />
              </div>
              <Skeleton class="h-5 w-5" />
            </div>
          </div>
        </div>

        <div class="sk-panel sk-span-4">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-36" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <div class="sk-list">
            <div v-for="index in 4" :key="`home-performer-${index}`" class="sk-media-row">
              <Skeleton class="h-10 w-10 rounded-lg" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-2.5 w-20 rounded-full" />
                <Skeleton class="mt-2 h-4 w-32 max-w-full" />
                <Skeleton class="mt-2 h-3 w-24" />
              </div>
              <div class="grid justify-items-end gap-2">
                <Skeleton class="h-4 w-16" />
                <Skeleton class="h-3 w-10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Artist dashboard compact release pulse -->
    <template v-else-if="normalizedLayout === 'release-pulse'">
      <div class="sk-release-pulse-grid">
        <div v-for="index in 3" :key="`release-pulse-${index}`" class="sk-release-pulse-card">
          <Skeleton class="aspect-square w-24 rounded-xl" />
          <div class="min-w-0 flex-1">
            <Skeleton class="h-5 w-44 max-w-full" />
            <Skeleton class="mt-2 h-3 w-28" />
            <div class="mt-4 grid gap-2">
              <Skeleton class="h-2 w-full rounded-full" />
              <Skeleton class="h-2 w-3/4 rounded-full" />
            </div>
          </div>
          <div class="grid justify-items-end gap-2">
            <Skeleton class="h-6 w-20 rounded-full" />
            <Skeleton class="h-4 w-16" />
          </div>
        </div>
      </div>
    </template>

    <!-- Artist dashboard compact top performers -->
    <template v-else-if="normalizedLayout === 'top-performers'">
      <div class="sk-list">
        <div v-for="index in 4" :key="`top-performer-${index}`" class="sk-media-row">
          <Skeleton class="h-11 w-11 rounded-xl" />
          <div class="min-w-0 flex-1">
            <Skeleton class="h-3 w-20" />
            <Skeleton class="mt-2 h-5 w-40 max-w-full" />
            <Skeleton class="mt-2 h-3 w-56 max-w-full" />
          </div>
          <div class="grid justify-items-end gap-2">
            <Skeleton class="h-5 w-20" />
            <Skeleton class="h-3 w-14" />
          </div>
        </div>
      </div>
    </template>

    <!-- Artist analytics -->
    <template v-else-if="normalizedLayout === 'analytics'">
      <div class="sk-filter-dock">
        <div class="sk-filter-heading">
          <Skeleton class="h-3 w-16" />
          <Skeleton class="h-3 w-48" />
        </div>
        <div class="sk-filter-strip">
          <div v-for="index in 6" :key="`artist-filter-${index}`" class="sk-filter-control">
            <Skeleton class="h-4 w-4 rounded" />
            <Skeleton class="h-3 w-16" />
            <Skeleton class="h-4 w-20" />
          </div>
          <Skeleton class="h-10 w-24 rounded-xl" />
        </div>
      </div>

      <div class="sk-metrics sk-metrics-4">
        <div v-for="index in 4" :key="`analytics-kpi-${index}`" class="sk-stat sk-stat-slab">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-8 w-28" />
          <Skeleton class="h-3 w-40" />
        </div>
      </div>

      <div class="sk-bento">
        <div class="sk-panel sk-span-8 sk-map-panel">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-44" />
              <Skeleton class="mt-2 h-3 w-64 max-w-full" />
            </div>
            <Skeleton class="h-8 w-8 rounded-lg" />
          </div>
          <div class="sk-map-shape">
            <Skeleton class="h-24 w-44 rounded-full opacity-40" />
            <Skeleton class="ml-6 h-16 w-28 rounded-full opacity-30" />
            <Skeleton class="ml-12 mt-14 h-10 w-20 rounded-full opacity-25" />
          </div>
        </div>

        <div class="sk-panel sk-span-4 sk-panel-tall">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-36" />
            </div>
            <Skeleton class="h-8 w-20 rounded-xl" />
          </div>
          <div class="sk-chart-bars">
            <Skeleton
              v-for="(height, index) in chartBars"
              :key="`monthly-bar-${index}`"
              class="w-2.5 rounded-t"
              :style="{ height: `${height}px` }"
            />
          </div>
        </div>

        <div class="sk-panel sk-span-6">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-44" />
            </div>
            <Skeleton class="h-8 w-8 rounded-lg" />
          </div>
          <div class="sk-chart-bars sk-chart-bars-wide">
            <Skeleton
              v-for="(height, index) in compactBars"
              :key="`platform-stack-${index}`"
              class="w-12 rounded-t-lg"
              :style="{ height: `${height}px` }"
            />
          </div>
        </div>

        <div class="sk-panel sk-span-6">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-40" />
            </div>
            <Skeleton class="h-8 w-8 rounded-lg" />
          </div>
          <div class="sk-list">
            <div v-for="index in 5" :key="`catalog-rank-${index}`" class="sk-media-row">
              <Skeleton class="h-10 w-10 rounded-lg" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-36 max-w-full" />
                <Skeleton class="mt-2 h-3 w-24" />
              </div>
              <Skeleton class="h-4 w-14" />
            </div>
          </div>
        </div>

        <div class="sk-panel sk-span-12">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-36" />
            </div>
            <Skeleton class="h-8 w-8 rounded-lg" />
          </div>
          <div class="sk-metrics sk-metrics-5">
            <div v-for="index in 5" :key="`audience-card-${index}`" class="sk-mini-card">
              <Skeleton class="h-4 w-20" />
              <Skeleton class="h-7 w-24" />
              <Skeleton class="h-3 w-28" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Admin analytics -->
    <template v-else-if="normalizedLayout === 'admin-analytics'">
      <div class="sk-filter-dock sk-filter-dock-admin">
        <div class="sk-filter-heading">
          <div>
            <Skeleton class="h-3 w-20" />
            <Skeleton class="mt-2 h-5 w-40" />
          </div>
          <Skeleton class="h-9 w-28 rounded-xl" />
        </div>
        <div class="sk-filter-strip">
          <div v-for="index in 7" :key="`admin-analytics-filter-${index}`" class="sk-filter-control">
            <Skeleton class="h-4 w-4 rounded" />
            <Skeleton class="h-3 w-16" />
            <Skeleton class="h-4 w-20" />
          </div>
          <Skeleton class="h-10 w-24 rounded-xl" />
        </div>
      </div>

      <div class="sk-metrics sk-metrics-4">
        <div v-for="index in 4" :key="`admin-analytics-kpi-${index}`" class="sk-stat sk-stat-slab">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-8 w-28" />
          <Skeleton class="h-3 w-40" />
        </div>
      </div>

      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-24" />
            <Skeleton class="mt-2 h-6 w-56" />
            <Skeleton class="mt-2 h-3 w-72 max-w-full" />
          </div>
          <Skeleton class="h-9 w-32 rounded-xl" />
        </div>
      </div>

      <div class="sk-metrics sk-metrics-4">
        <div v-for="index in 4" :key="`admin-reco-${index}`" class="sk-mini-card sk-reco-card">
          <Skeleton class="h-3 w-20" />
          <Skeleton class="h-5 w-36" />
          <Skeleton class="h-3 w-full" />
          <Skeleton class="h-3 w-24" />
        </div>
      </div>

      <div class="sk-bento">
        <div class="sk-panel sk-span-8">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-28" />
              <Skeleton class="mt-2 h-6 w-52" />
            </div>
            <Skeleton class="h-10 w-28 rounded-xl" />
          </div>
          <div class="sk-metrics sk-metrics-5">
            <div v-for="index in 5" :key="`financial-control-${index}`" class="sk-mini-card">
              <Skeleton class="h-3 w-20" />
              <Skeleton class="h-5 w-24" />
              <Skeleton class="h-3 w-28" />
            </div>
          </div>
          <div class="sk-table">
            <div class="sk-table-header sk-table-cols-5">
              <Skeleton v-for="index in 5" :key="`financial-th-${index}`" class="h-4 w-full" />
            </div>
            <div v-for="row in 5" :key="`financial-row-${row}`" class="sk-table-row sk-table-cols-5">
              <Skeleton v-for="col in 5" :key="`financial-cell-${row}-${col}`" class="h-4 w-full" />
            </div>
          </div>
        </div>

        <div class="sk-panel sk-span-4">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-36" />
            </div>
          </div>
          <div class="sk-list">
            <div v-for="index in 5" :key="`admin-action-row-${index}`" class="sk-summary-row">
              <div class="min-w-0 flex-1">
                <Skeleton class="h-3 w-20" />
                <Skeleton class="mt-2 h-4 w-36 max-w-full" />
                <Skeleton class="mt-2 h-3 w-full" />
              </div>
              <Skeleton class="h-5 w-16 rounded-full" />
            </div>
          </div>
        </div>

        <div class="sk-panel sk-span-12">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-40" />
            </div>
          </div>
          <div class="sk-metrics sk-metrics-4">
            <div v-for="index in 4" :key="`admin-chart-${index}`" class="sk-chart-card">
              <div class="sk-panel-head">
                <div>
                  <Skeleton class="h-3 w-20" />
                  <Skeleton class="mt-2 h-5 w-32" />
                </div>
                <Skeleton class="h-5 w-5" />
              </div>
              <div class="sk-rank-list">
                <div v-for="row in 4" :key="`admin-chart-row-${index}-${row}`" class="sk-rank-row">
                  <Skeleton class="h-4 w-24" />
                  <Skeleton class="h-2 flex-1 rounded-full" />
                  <Skeleton class="h-4 w-16" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Wallet -->
    <template v-else-if="normalizedLayout === 'wallet'">
      <div class="sk-wallet-hero">
        <div class="sk-credit-card">
          <div class="sk-credit-chip-row">
            <Skeleton class="h-9 w-12 rounded-lg" />
            <Skeleton class="h-7 w-7 rounded-full" />
          </div>
          <div class="mt-auto">
            <Skeleton class="h-3 w-28" />
            <Skeleton class="mt-3 h-10 w-56 max-w-full" />
          </div>
          <Skeleton class="h-5 w-64 max-w-full" />
          <div class="sk-credit-bottom">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-4 w-36" />
            </div>
            <Skeleton class="h-9 w-20 rounded-lg" />
          </div>
        </div>
        <div class="sk-balance-stats">
          <div v-for="index in 4" :key="`wallet-stat-${index}`" class="sk-balance-stat">
            <Skeleton class="h-3 w-28" />
            <Skeleton class="h-7 w-24" />
            <Skeleton v-if="index === 4" class="h-3 w-20" />
          </div>
        </div>
      </div>

      <div class="sk-tabs">
        <Skeleton v-for="index in 4" :key="`wallet-tab-${index}`" class="h-10 w-28 rounded-t-xl" />
      </div>

      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-24" />
            <Skeleton class="mt-2 h-6 w-32" />
            <Skeleton class="mt-2 h-3 w-44" />
          </div>
          <Skeleton class="h-5 w-5" />
        </div>
        <div class="sk-filter-strip sk-filter-strip-compact">
          <Skeleton class="h-10 w-40 rounded-xl" />
          <Skeleton class="h-10 w-32 rounded-xl" />
          <Skeleton class="h-10 w-28 rounded-xl" />
        </div>
        <div class="sk-list">
          <div v-for="index in 5" :key="`wallet-statement-row-${index}`" class="sk-ledger-row">
            <Skeleton class="h-11 w-11 rounded-xl" />
            <div class="min-w-0 flex-1">
              <Skeleton class="h-4 w-44 max-w-full" />
              <Skeleton class="mt-2 h-3 w-64 max-w-full" />
            </div>
            <div class="grid justify-items-end gap-2">
              <Skeleton class="h-4 w-20" />
              <Skeleton class="h-3 w-24" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Payout form nested loader -->
    <template v-else-if="normalizedLayout === 'payout-form'">
      <div class="sk-form-grid sk-form-grid-2">
        <div v-for="index in 2" :key="`payout-field-${index}`" class="sk-field">
          <Skeleton class="h-3 w-20" />
          <Skeleton class="h-11 w-full rounded-xl" />
        </div>
      </div>
      <div class="sk-field">
        <Skeleton class="h-3 w-24" />
        <Skeleton class="h-24 w-full rounded-xl" />
      </div>
      <div class="sk-mini-card">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-16" />
            <Skeleton class="mt-2 h-5 w-32" />
          </div>
          <Skeleton class="h-9 w-9 rounded-xl" />
        </div>
        <div class="sk-list">
          <div v-for="index in 3" :key="`payout-fee-${index}`" class="sk-summary-row">
            <Skeleton class="h-4 w-32" />
            <Skeleton class="h-4 w-48 max-w-full" />
          </div>
        </div>
      </div>
    </template>

    <!-- Artist releases -->
    <template v-else-if="normalizedLayout === 'releases'">
      <div class="sk-search-panel">
        <div class="min-w-0 flex-1">
          <Skeleton class="h-3 w-28" />
          <Skeleton class="mt-2 h-10 w-full rounded-xl" />
        </div>
        <div class="sk-count-chip">
          <Skeleton class="h-7 w-12" />
          <Skeleton class="h-3 w-16" />
        </div>
      </div>
      <div class="sk-pagination-strip">
        <Skeleton class="h-9 w-44 rounded-xl" />
        <Skeleton class="h-9 w-28 rounded-xl" />
      </div>
      <div class="sk-release-grid">
        <div v-for="index in 8" :key="`release-card-${index}`" class="sk-release-card">
          <Skeleton class="aspect-square w-full rounded-t-xl" />
          <div class="sk-release-card-body">
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-3 w-28" />
            <div class="flex flex-wrap gap-2">
              <Skeleton class="h-6 w-24 rounded-full" />
              <Skeleton class="h-6 w-20 rounded-full" />
            </div>
            <Skeleton class="h-3 w-20" />
          </div>
        </div>
      </div>
    </template>

    <!-- Statements -->
    <template v-else-if="normalizedLayout === 'statements'">
      <div class="sk-metrics sk-metrics-4">
        <div v-for="index in 4" :key="`statement-kpi-${index}`" class="sk-stat sk-stat-slab">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-8 w-28" />
          <Skeleton class="h-3 w-36" />
        </div>
      </div>

      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-24" />
            <Skeleton class="mt-2 h-6 w-48" />
            <Skeleton class="mt-2 h-3 w-72 max-w-full" />
          </div>
          <Skeleton class="h-9 w-36 rounded-xl" />
        </div>
        <div class="sk-filter-shell">
          <div class="sk-filter-heading">
            <Skeleton class="h-4 w-20" />
            <Skeleton class="h-4 w-56 max-w-full" />
          </div>
          <div class="sk-form-grid sk-form-grid-4">
            <div v-for="index in 4" :key="`statement-filter-${index}`" class="sk-field">
              <Skeleton class="h-3 w-20" />
              <Skeleton class="h-10 w-full rounded-xl" />
            </div>
          </div>
          <div class="sk-filter-actions">
            <Skeleton class="h-9 w-32 rounded-xl" />
            <Skeleton class="h-9 w-36 rounded-xl" />
          </div>
        </div>
        <div class="sk-tabs">
          <Skeleton v-for="index in 3" :key="`statement-tab-${index}`" class="h-10 w-32 rounded-t-xl" />
        </div>
        <div class="sk-table">
          <div class="sk-table-toolbar">
            <Skeleton class="h-10 w-72 max-w-full rounded-xl" />
            <Skeleton class="h-9 w-36 rounded-xl" />
          </div>
          <div class="sk-table-header sk-table-cols-5">
            <Skeleton v-for="index in 5" :key="`statement-th-${index}`" class="h-4 w-full" />
          </div>
          <div v-for="row in 6" :key="`statement-row-${row}`" class="sk-table-row sk-table-cols-5">
            <Skeleton v-for="col in 5" :key="`statement-cell-${row}-${col}`" class="h-4 w-full" />
          </div>
        </div>
        <div class="sk-mobile-card-list">
          <div v-for="index in 3" :key="`statement-mobile-${index}`" class="sk-mini-card">
            <div class="sk-panel-head">
              <Skeleton class="h-5 w-32" />
              <Skeleton class="h-6 w-20 rounded-full" />
            </div>
            <div class="sk-metrics sk-metrics-2">
              <Skeleton v-for="cell in 4" :key="`statement-mobile-cell-${index}-${cell}`" class="h-10 w-full" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Admin ingestion -->
    <template v-else-if="normalizedLayout === 'ingestion'">
      <div class="sk-bento">
        <div class="sk-panel sk-span-5">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-36" />
              <Skeleton class="mt-2 h-3 w-48" />
            </div>
          </div>
          <div class="sk-alert-line">
            <Skeleton class="h-4 w-4 rounded" />
            <Skeleton class="h-4 w-64 max-w-full" />
          </div>
          <div class="sk-form-grid">
            <div v-for="index in 3" :key="`ingestion-field-${index}`" class="sk-field">
              <Skeleton class="h-3 w-28" />
              <Skeleton class="h-11 w-full rounded-xl" />
            </div>
            <Skeleton class="h-7 w-40 rounded-full" />
            <Skeleton class="h-10 w-36 rounded-xl" />
          </div>
        </div>
        <div class="sk-panel sk-span-7">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-40" />
            </div>
          </div>
          <div class="sk-table">
            <div class="sk-table-header sk-table-cols-4">
              <Skeleton v-for="index in 4" :key="`ingestion-th-${index}`" class="h-4 w-full" />
            </div>
            <div v-for="row in 6" :key="`ingestion-row-${row}`" class="sk-table-row sk-table-cols-4">
              <Skeleton v-for="col in 4" :key="`ingestion-cell-${row}-${col}`" class="h-4 w-full" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Artist settings -->
    <template v-else-if="normalizedLayout === 'settings'">
      <div class="sk-setup-card">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-28" />
            <Skeleton class="mt-2 h-6 w-32" />
            <Skeleton class="mt-2 h-3 w-24" />
          </div>
          <div class="grid justify-items-end gap-2">
            <Skeleton class="h-7 w-12" />
            <Skeleton class="h-2 w-40 rounded-full" />
          </div>
        </div>
        <div class="sk-list">
          <div v-for="index in 4" :key="`settings-check-${index}`" class="sk-route-row">
            <Skeleton class="h-8 w-8 rounded-full" />
            <div class="min-w-0 flex-1">
              <Skeleton class="h-4 w-40 max-w-full" />
              <Skeleton class="mt-2 h-3 w-64 max-w-full" />
            </div>
            <Skeleton class="h-4 w-20" />
          </div>
        </div>
      </div>
      <div class="sk-tabs">
        <Skeleton v-for="index in 5" :key="`settings-tab-${index}`" class="h-10 w-28 rounded-t-xl" />
      </div>
      <div class="sk-panel-grid">
        <div class="sk-panel">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-24" />
              <Skeleton class="mt-2 h-3 w-56 max-w-full" />
            </div>
          </div>
          <div class="sk-avatar-row">
            <Skeleton class="h-20 w-20 rounded-full" />
            <div class="min-w-0 flex-1">
              <Skeleton class="h-5 w-40" />
              <Skeleton class="mt-2 h-3 w-32" />
            </div>
          </div>
          <div class="sk-form-grid sk-form-grid-3">
            <Skeleton v-for="index in 6" :key="`avatar-option-${index}`" class="aspect-square w-full rounded-xl" />
          </div>
        </div>
        <div class="sk-panel">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-40" />
            </div>
          </div>
          <div class="sk-form-grid sk-form-grid-2">
            <div v-for="index in 5" :key="`settings-field-${index}`" class="sk-field" :class="{ 'sk-field-wide': index === 5 }">
              <Skeleton class="h-3 w-24" />
              <Skeleton class="h-11 w-full rounded-xl" />
            </div>
          </div>
          <Skeleton class="h-10 w-32 rounded-xl" />
        </div>
      </div>
    </template>

    <!-- Artist publishing -->
    <template v-else-if="normalizedLayout === 'publishing'">
      <div class="sk-tabs">
        <Skeleton v-for="index in 2" :key="`publishing-main-tab-${index}`" class="h-10 w-36 rounded-t-xl" />
      </div>
      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-7 w-20" />
            <Skeleton class="mt-2 h-3 w-36" />
          </div>
        </div>
        <div class="sk-filter-strip sk-filter-strip-compact">
          <Skeleton class="h-10 w-80 max-w-full rounded-xl" />
          <Skeleton class="h-10 w-44 rounded-xl" />
        </div>
        <div class="sk-card-list">
          <div v-for="index in rowCount" :key="`artist-publishing-card-${index}`" class="sk-panel sk-panel-tight">
            <div class="sk-panel-head">
              <div>
                <Skeleton class="h-6 w-24 rounded-full" />
                <Skeleton class="mt-3 h-5 w-44" />
                <Skeleton class="mt-2 h-3 w-60 max-w-full" />
              </div>
            </div>
            <div class="sk-metrics sk-metrics-3">
              <Skeleton v-for="writer in 3" :key="`writer-chip-${index}-${writer}`" class="h-14 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Notifications -->
    <template v-else-if="normalizedLayout === 'notifications' || normalizedLayout === 'admin-notifications'">
      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-7 w-44" />
            <Skeleton class="mt-2 h-3 w-48" />
          </div>
          <Skeleton class="h-10 w-24 rounded-xl" />
        </div>
        <div class="sk-timeline">
          <div v-for="index in rowCount" :key="`notification-${index}`" class="sk-timeline-item">
            <Skeleton class="sk-timeline-dot h-10 w-10 rounded-full" />
            <div class="sk-panel sk-panel-tight sk-timeline-card">
              <div class="sk-panel-head">
                <div class="min-w-0 flex-1">
                  <Skeleton class="h-4 w-52 max-w-full" />
                  <Skeleton class="mt-2 h-3 w-28" />
                </div>
                <Skeleton class="h-6 w-24 rounded-full" />
              </div>
              <Skeleton class="h-3 w-full" />
              <Skeleton class="h-3 w-2/3" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Artist uploader -->
    <template v-else-if="normalizedLayout === 'uploader'">
      <div class="sk-uploader-layout">
        <main class="sk-uploader-main">
          <div class="sk-panel sk-release-summary">
            <div class="sk-panel-head">
              <div class="min-w-0 flex-1">
                <Skeleton class="h-3 w-28" />
                <Skeleton class="mt-3 h-9 w-72 max-w-full" />
                <Skeleton class="mt-3 h-4 w-64 max-w-full" />
              </div>
              <Skeleton class="h-7 w-24 rounded-full" />
            </div>
            <div class="sk-form-grid sk-form-grid-3">
              <div v-for="index in 3" :key="`upload-summary-${index}`" class="sk-field">
                <Skeleton class="h-3 w-20" />
                <Skeleton class="h-11 w-full rounded-xl" />
              </div>
            </div>
          </div>
          <div class="sk-panel">
            <Skeleton class="h-6 w-36" />
            <div class="sk-artwork-row">
              <Skeleton class="aspect-square w-44 rounded-2xl" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-3 w-24" />
                <Skeleton class="mt-2 h-5 w-48 max-w-full" />
                <Skeleton class="mt-3 h-3 w-64 max-w-full" />
                <Skeleton class="mt-4 h-10 w-36 rounded-xl" />
              </div>
            </div>
          </div>
          <div class="sk-panel">
            <div class="sk-panel-head">
              <Skeleton class="h-6 w-36" />
              <Skeleton class="h-10 w-28 rounded-xl" />
            </div>
            <div class="sk-table">
              <div class="sk-table-header sk-table-cols-4">
                <Skeleton v-for="index in 4" :key="`upload-th-${index}`" class="h-4 w-full" />
              </div>
              <div v-for="row in 3" :key="`upload-track-${row}`" class="sk-table-row sk-table-cols-4">
                <Skeleton v-for="col in 4" :key="`upload-cell-${row}-${col}`" class="h-4 w-full" />
              </div>
            </div>
          </div>
          <div class="sk-panel">
            <Skeleton class="h-6 w-28" />
            <div class="sk-logo-strip">
              <Skeleton v-for="index in 12" :key="`platform-logo-${index}`" class="h-9 w-20 rounded-xl" />
            </div>
          </div>
        </main>
        <aside class="sk-panel sk-readiness">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-20" />
              <Skeleton class="mt-2 h-6 w-28" />
            </div>
            <Skeleton class="h-16 w-16 rounded-full" />
          </div>
          <Skeleton class="h-2 w-full rounded-full" />
          <div class="sk-list">
            <div v-for="index in 5" :key="`readiness-row-${index}`" class="sk-summary-row">
              <Skeleton class="h-8 w-8 rounded-full" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-32" />
                <Skeleton class="mt-2 h-3 w-28" />
              </div>
            </div>
          </div>
          <Skeleton class="h-11 w-full rounded-xl" />
          <Skeleton class="h-10 w-full rounded-xl" />
        </aside>
      </div>
    </template>

    <!-- Admin home -->
    <template v-else-if="normalizedLayout === 'admin-home'">
      <div class="sk-bento">
        <div class="sk-panel sk-span-7">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-28" />
              <Skeleton class="mt-2 h-7 w-48" />
              <Skeleton class="mt-2 h-3 w-72 max-w-full" />
            </div>
            <Skeleton class="h-7 w-36 rounded-full" />
          </div>
          <div class="sk-metrics sk-metrics-2">
            <div v-for="index in 4" :key="`ops-signal-${index}`" class="sk-action-tile">
              <Skeleton class="h-11 w-11 rounded-xl" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-3 w-24" />
                <Skeleton class="mt-2 h-7 w-20" />
                <Skeleton class="mt-2 h-3 w-36" />
              </div>
              <div class="sk-mini-bars">
                <Skeleton v-for="bar in 5" :key="`ops-spark-${index}-${bar}`" class="w-1.5 rounded-t" :style="{ height: `${18 + bar * 6}px` }" />
              </div>
            </div>
          </div>
        </div>
        <div class="sk-panel sk-span-5">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-28" />
              <Skeleton class="mt-2 h-6 w-40" />
              <Skeleton class="mt-2 h-3 w-64 max-w-full" />
            </div>
          </div>
          <div class="sk-ring-layout">
            <Skeleton class="h-40 w-40 rounded-full" />
            <div class="sk-list flex-1">
              <div v-for="index in 4" :key="`ring-seg-${index}`" class="sk-summary-row">
                <Skeleton class="h-3 w-28" />
                <Skeleton class="h-4 w-12" />
              </div>
            </div>
          </div>
        </div>
        <div class="sk-panel sk-span-12">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-28" />
              <Skeleton class="mt-2 h-6 w-44" />
              <Skeleton class="mt-2 h-3 w-72 max-w-full" />
            </div>
            <Skeleton class="h-7 w-7 rounded" />
          </div>
          <div class="sk-action-grid sk-action-grid-3">
            <div v-for="index in 6" :key="`command-card-${index}`" class="sk-action-tile">
              <Skeleton class="h-11 w-11 rounded-xl" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-28" />
                <Skeleton class="mt-2 h-3 w-40 max-w-full" />
              </div>
              <Skeleton class="h-8 w-8 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-24" />
            <Skeleton class="mt-2 h-7 w-32" />
            <Skeleton class="mt-2 h-3 w-96 max-w-full" />
          </div>
        </div>
        <div class="sk-tabs">
          <Skeleton v-for="index in 5" :key="`admin-home-tab-${index}`" class="h-10 w-32 rounded-t-xl" />
        </div>
        <div class="sk-panel-grid">
          <div class="sk-panel sk-panel-tight">
            <Skeleton class="h-5 w-36" />
            <div class="sk-list">
              <div v-for="index in 6" :key="`attention-row-${index}`" class="sk-summary-row">
                <Skeleton class="h-4 w-44" />
                <Skeleton class="h-5 w-10" />
              </div>
            </div>
          </div>
          <div class="sk-panel sk-panel-tight">
            <Skeleton class="h-5 w-36" />
            <div class="sk-table">
              <div class="sk-table-header sk-table-cols-4">
                <Skeleton v-for="index in 4" :key="`home-table-th-${index}`" class="h-4 w-full" />
              </div>
              <div v-for="row in 4" :key="`home-table-row-${row}`" class="sk-table-row sk-table-cols-4">
                <Skeleton v-for="col in 4" :key="`home-table-cell-${row}-${col}`" class="h-4 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Admin company ledger -->
    <template v-else-if="normalizedLayout === 'admin-company-ledger'">
      <div class="sk-tabs">
        <Skeleton v-for="index in 3" :key="`company-tab-${index}`" class="h-10 w-24 rounded-t-xl" />
      </div>
      <div class="sk-company-hero-grid">
        <div class="sk-panel sk-company-balance">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-32" />
              <Skeleton class="mt-3 h-10 w-56 max-w-full" />
              <Skeleton class="mt-2 h-3 w-44" />
            </div>
          </div>
          <div class="sk-mini-card">
            <Skeleton class="h-4 w-32" />
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-4/5" />
          </div>
        </div>
        <div v-for="index in 3" :key="`ledger-metric-${index}`" class="sk-stat">
          <Skeleton class="h-4 w-28" />
          <Skeleton class="h-8 w-24" />
          <Skeleton class="h-3 w-32" />
        </div>
      </div>
      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-24" />
            <Skeleton class="mt-2 h-7 w-36" />
            <Skeleton class="mt-2 h-3 w-44" />
          </div>
          <div class="sk-toolbar-actions">
            <Skeleton v-for="index in 5" :key="`ledger-action-${index}`" class="h-9 w-28 rounded-xl" />
          </div>
        </div>
        <div class="sk-form-grid sk-form-grid-5">
          <div v-for="index in 5" :key="`ledger-filter-${index}`" class="sk-field">
            <Skeleton class="h-3 w-20" />
            <Skeleton class="h-10 w-full rounded-xl" />
          </div>
        </div>
        <div class="sk-table">
          <div class="sk-table-header sk-table-cols-7">
            <Skeleton v-for="index in 7" :key="`ledger-th-${index}`" class="h-4 w-full" />
          </div>
          <div v-for="row in tableRowCount" :key="`ledger-row-${row}`" class="sk-table-row sk-table-cols-7">
            <Skeleton v-for="col in 7" :key="`ledger-cell-${row}-${col}`" class="h-4 w-full" />
          </div>
        </div>
      </div>
    </template>

    <!-- Admin company analytics -->
    <template v-else-if="normalizedLayout === 'admin-company-analytics'">
      <div class="sk-company-hero-grid sk-company-analytics-grid">
        <div v-for="index in 2" :key="`company-analytics-balance-${index}`" class="sk-panel sk-company-balance">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-32" />
              <Skeleton class="mt-3 h-10 w-56 max-w-full" />
              <Skeleton class="mt-2 h-3 w-44" />
            </div>
            <Skeleton class="h-7 w-16 rounded-full" />
          </div>
          <div class="sk-rank-list">
            <Skeleton v-for="bar in 3" :key="`balance-bar-${index}-${bar}`" class="h-2 w-full rounded-full" />
          </div>
        </div>
      </div>
      <div class="sk-chart-grid">
        <div v-for="index in 6" :key="`company-chart-${index}`" class="sk-chart-card" :class="{ 'sk-chart-card-wide': index <= 2 }">
          <div class="sk-panel-head">
            <div>
              <Skeleton class="h-3 w-24" />
              <Skeleton class="mt-2 h-6 w-44" />
            </div>
            <Skeleton class="h-5 w-5" />
          </div>
          <div class="sk-rank-list">
            <div v-for="row in 5" :key="`company-chart-row-${index}-${row}`" class="sk-rank-row">
              <Skeleton class="h-4 w-28" />
              <Skeleton class="h-2 flex-1 rounded-full" />
              <Skeleton class="h-4 w-20" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Dense table families -->
    <template
      v-else-if="[
        'admin-artists-directory',
        'admin-artists-access',
        'admin-releases-requests',
        'admin-releases-workspace',
        'admin-earnings',
        'admin-dues',
        'admin-payouts',
        'admin-publishing-requests',
        'admin-publishing-writers',
        'admin-publishing-credits',
        'admin-settings-table',
        'admin-settings-reconciliation',
        'table-panel',
      ].includes(normalizedLayout)"
    >
      <div v-if="!['admin-earnings', 'table-panel'].includes(normalizedLayout)" class="sk-metrics sk-metrics-4">
        <div v-for="index in metricCount" :key="`dense-metric-${index}`" class="sk-stat sk-stat-slab">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-8 w-24" />
          <Skeleton class="h-3 w-36" />
        </div>
      </div>
      <div v-if="normalizedLayout.includes('releases') || normalizedLayout.includes('artists') || normalizedLayout.includes('settings')" class="sk-tabs">
        <Skeleton v-for="index in normalizedLayout.includes('settings') ? 6 : 2" :key="`dense-tab-${index}`" class="h-10 w-32 rounded-t-xl" />
      </div>
      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-24" />
            <Skeleton class="mt-2 h-7 w-48" />
            <Skeleton class="mt-2 h-3 w-80 max-w-full" />
          </div>
          <div class="sk-toolbar-actions">
            <Skeleton
              v-for="index in normalizedLayout === 'admin-publishing-requests' ? 2 : 1"
              :key="`dense-action-${index}`"
              class="h-10 w-32 rounded-xl"
            />
          </div>
        </div>
        <div class="sk-form-grid" :class="normalizedLayout === 'admin-earnings' || normalizedLayout === 'admin-releases-workspace' ? 'sk-form-grid-4' : 'sk-form-grid-2'">
          <div
            v-for="index in normalizedLayout === 'admin-earnings' || normalizedLayout === 'admin-releases-workspace' ? 8 : normalizedLayout === 'admin-dues' ? 2 : 3"
            :key="`dense-filter-${index}`"
            class="sk-field"
          >
            <Skeleton class="h-3 w-20" />
            <Skeleton class="h-10 w-full rounded-xl" />
          </div>
        </div>
        <div class="sk-table">
          <div class="sk-table-toolbar">
            <Skeleton class="h-10 w-72 max-w-full rounded-xl" />
            <Skeleton class="h-9 w-36 rounded-xl" />
          </div>
          <div class="sk-table-header" :class="normalizedLayout === 'admin-earnings' || normalizedLayout === 'admin-releases-workspace' ? 'sk-table-cols-7' : 'sk-table-cols-5'">
            <Skeleton v-for="index in normalizedLayout === 'admin-earnings' || normalizedLayout === 'admin-releases-workspace' ? 7 : 5" :key="`dense-th-${index}`" class="h-4 w-full" />
          </div>
          <div
            v-for="row in tableRowCount"
            :key="`dense-row-${row}`"
            class="sk-table-row"
            :class="normalizedLayout === 'admin-earnings' || normalizedLayout === 'admin-releases-workspace' ? 'sk-table-cols-7' : 'sk-table-cols-5'"
          >
            <Skeleton v-for="col in normalizedLayout === 'admin-earnings' || normalizedLayout === 'admin-releases-workspace' ? 7 : 5" :key="`dense-cell-${row}-${col}`" class="h-4 w-full" />
          </div>
          <div v-if="normalizedLayout === 'admin-releases-requests'" class="sk-expanded-row">
            <Skeleton class="h-20 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </template>

    <!-- Admin archive -->
    <template v-else-if="normalizedLayout === 'admin-settings-archive'">
      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-24" />
            <Skeleton class="mt-2 h-7 w-56" />
            <Skeleton class="mt-2 h-3 w-80 max-w-full" />
          </div>
        </div>
        <div class="sk-field">
          <Skeleton class="h-3 w-32" />
          <Skeleton class="h-10 w-full rounded-xl" />
        </div>
        <div class="sk-archive-stack">
          <div v-for="group in 3" :key="`archive-group-${group}`" class="sk-panel sk-panel-tight">
            <div class="sk-panel-head">
              <div>
                <Skeleton class="h-5 w-40" />
                <Skeleton class="mt-2 h-3 w-72 max-w-full" />
              </div>
            </div>
            <div class="sk-table">
              <div class="sk-table-header sk-table-cols-4">
                <Skeleton v-for="index in 4" :key="`archive-th-${group}-${index}`" class="h-4 w-full" />
              </div>
              <div v-for="row in 3" :key="`archive-row-${group}-${row}`" class="sk-table-row sk-table-cols-4">
                <Skeleton v-for="col in 4" :key="`archive-cell-${group}-${row}-${col}`" class="h-4 w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Admin NaadLinks manage -->
    <template v-else-if="normalizedLayout === 'admin-naadlinks-manage'">
      <div class="sk-panel">
        <div class="sk-panel-head">
          <div>
            <Skeleton class="h-3 w-20" />
            <Skeleton class="mt-2 h-7 w-40" />
            <Skeleton class="mt-2 h-3 w-36" />
          </div>
          <Skeleton class="h-10 w-36 rounded-xl" />
        </div>
        <div class="sk-list">
          <div v-for="index in rowCount" :key="`naadlink-row-${index}`" class="sk-naadlink-row">
            <div class="sk-media-row min-w-0 flex-1">
              <Skeleton class="h-9 w-9 rounded-xl" />
              <div class="min-w-0 flex-1">
                <Skeleton class="h-4 w-44 max-w-full" />
                <Skeleton class="mt-2 h-3 w-72 max-w-full" />
              </div>
            </div>
            <Skeleton class="h-6 w-16 rounded-full" />
            <Skeleton class="h-4 w-24" />
            <div class="sk-toolbar-actions">
              <Skeleton class="h-9 w-16 rounded-xl" />
              <Skeleton class="h-9 w-16 rounded-xl" />
              <Skeleton class="h-9 w-9 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Backward-compatible generic fallback -->
    <template v-else>
      <div v-if="props.metrics" class="sk-metrics">
        <div v-for="index in metricCount" :key="`metric-${index}`" class="sk-stat">
          <Skeleton class="h-3 w-24" />
          <Skeleton class="h-8 w-20" />
          <Skeleton class="h-3 w-40 max-w-full" />
        </div>
      </div>

      <div v-if="props.table" class="sk-table">
        <div class="sk-table-header sk-table-cols-4">
          <Skeleton v-for="index in 4" :key="`fallback-th-${index}`" class="h-4 w-full" />
        </div>
        <div v-for="row in tableRowCount" :key="`fallback-row-${row}`" class="sk-table-row sk-table-cols-4">
          <Skeleton v-for="col in 4" :key="`fallback-cell-${row}-${col}`" class="h-4 w-full" />
        </div>
      </div>

      <div v-else class="sk-list">
        <Skeleton v-for="index in rowCount" :key="`row-${index}`" class="h-16 w-full rounded-xl" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.dashboard-skeleton {
  display: grid;
  gap: 16px;
  width: 100%;
  min-width: 0;
}

.sk-panel,
.sk-stat,
.sk-mini-card,
.sk-chart-card,
.sk-search-panel,
.sk-setup-card {
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 86%, transparent);
  border-radius: 16px;
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card) 96%, white 4%),
      var(--card) 62%,
      color-mix(in srgb, var(--card) 94%, var(--background) 6%)
    );
  box-shadow: var(--surface-card-shadow-current, var(--shadow-sm));
}

:global(.dark) .sk-panel,
:global(.dark) .sk-stat,
:global(.dark) .sk-mini-card,
:global(.dark) .sk-chart-card,
:global(.dark) .sk-search-panel,
:global(.dark) .sk-setup-card {
  background:
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--card) 92%, white 5%),
      var(--card) 58%,
      color-mix(in srgb, var(--card) 88%, black 12%)
    );
}

.sk-panel,
.sk-search-panel,
.sk-setup-card {
  display: grid;
  align-content: start;
  gap: 18px;
  padding: 22px;
}

.sk-panel-tight {
  gap: 14px;
  padding: 16px;
}

.sk-stat {
  display: grid;
  align-content: center;
  gap: 9px;
  min-height: 118px;
  padding: 18px 20px;
}

.sk-stat-slab {
  min-height: 104px;
}

.sk-mini-card,
.sk-chart-card {
  display: grid;
  gap: 12px;
  padding: 16px;
}

.sk-panel-head {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.sk-panel-head > div {
  min-width: 0;
}

.sk-metrics,
.sk-panel-grid,
.sk-form-grid,
.sk-action-grid,
.sk-release-grid,
.sk-chart-grid,
.sk-company-hero-grid {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.sk-metrics {
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
}

.sk-metrics-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sk-metrics-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sk-metrics-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.sk-metrics-5 {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.sk-bento {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}

.sk-span-4 {
  grid-column: span 4;
}

.sk-span-5 {
  grid-column: span 5;
}

.sk-span-6 {
  grid-column: span 6;
}

.sk-span-7 {
  grid-column: span 7;
}

.sk-span-8 {
  grid-column: span 8;
}

.sk-span-12 {
  grid-column: 1 / -1;
}

.sk-panel-tall {
  min-height: 360px;
}

.sk-filter-dock {
  display: grid;
  gap: 16px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 82%, transparent);
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--shadow-sm));
}

.sk-filter-dock-admin {
  border-radius: 20px;
}

.sk-filter-heading,
.sk-filter-strip,
.sk-filter-actions,
.sk-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sk-filter-heading {
  justify-content: space-between;
}

.sk-filter-strip {
  align-items: stretch;
}

.sk-filter-strip-compact {
  justify-content: flex-start;
}

.sk-filter-control {
  display: grid;
  grid-template-columns: auto auto minmax(48px, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 40px;
  min-width: 132px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--muted) 18%, transparent);
}

.sk-filter-shell {
  display: grid;
  gap: 16px;
  padding: 16px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 76%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--muted) 14%, transparent);
}

.sk-form-grid {
  grid-template-columns: 1fr;
}

.sk-form-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sk-form-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sk-form-grid-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.sk-form-grid-5 {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.sk-field {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.sk-field-wide {
  grid-column: 1 / -1;
}

.sk-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  min-width: 0;
  padding-bottom: 0;
  border-bottom: 1px solid var(--border);
}

.sk-table {
  display: grid;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--surface-border, var(--border));
  border-radius: 14px;
  background: color-mix(in srgb, var(--card) 92%, transparent);
}

.sk-table-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 70%, transparent);
}

.sk-table-header,
.sk-table-row {
  display: grid;
  gap: 16px;
  align-items: center;
  min-width: 760px;
  padding: 12px 16px;
}

.sk-table-header {
  background: color-mix(in srgb, var(--muted) 28%, transparent);
}

.sk-table-row {
  border-top: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 48%, transparent);
}

.sk-table-cols-4 {
  grid-template-columns: 2fr 1fr 1fr 1fr;
}

.sk-table-cols-5 {
  grid-template-columns: 2fr 1.1fr 1fr 1fr 0.8fr;
}

.sk-table-cols-7 {
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr 0.6fr;
}

.sk-expanded-row {
  padding: 16px;
  border-top: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 48%, transparent);
  background: color-mix(in srgb, var(--muted) 16%, transparent);
}

.sk-list,
.sk-card-list,
.sk-rank-list,
.sk-route-list,
.sk-archive-stack {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.sk-ledger-row,
.sk-media-row,
.sk-route-row,
.sk-summary-row,
.sk-rank-row,
.sk-naadlink-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding-block: 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 38%, transparent);
}

.sk-summary-row,
.sk-rank-row {
  justify-content: space-between;
}

.sk-naadlink-row {
  flex-wrap: wrap;
}

.sk-action-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sk-action-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.sk-action-tile {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  min-height: 76px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--muted) 12%, transparent);
}

.sk-chart-bars {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 8px;
  min-height: 230px;
  padding: 24px 8px 0;
}

.sk-chart-bars-wide {
  justify-content: space-evenly;
}

.sk-map-shape {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 52%, transparent);
  border-radius: 14px;
  background:
    linear-gradient(color-mix(in srgb, var(--border) 35%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--border) 35%, transparent) 1px, transparent 1px),
    color-mix(in srgb, var(--muted) 16%, transparent);
  background-size: 64px 64px;
}

.sk-wallet-hero,
.sk-company-hero-grid {
  display: grid;
  grid-template-columns: minmax(280px, 1.25fr) minmax(220px, 0.75fr);
  gap: 16px;
}

.sk-credit-card {
  display: grid;
  min-height: 320px;
  gap: 22px;
  padding: 26px;
  border: 1px solid color-mix(in srgb, var(--foreground) 16%, var(--surface-border, var(--border)));
  border-radius: 24px;
  background:
    radial-gradient(circle at 18% 18%, color-mix(in srgb, var(--foreground) 10%, transparent), transparent 34%),
    linear-gradient(145deg, color-mix(in srgb, var(--card) 78%, var(--foreground) 10%), var(--card));
  box-shadow: var(--surface-card-shadow-current, var(--shadow-card));
}

.sk-credit-chip-row,
.sk-credit-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.sk-balance-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.sk-balance-stat {
  display: grid;
  align-content: center;
  gap: 9px;
  min-height: 144px;
  padding: 18px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 72%, transparent);
  border-radius: 16px;
  background: var(--card);
}

.sk-search-panel {
  display: flex;
  align-items: end;
  gap: 16px;
}

.sk-count-chip {
  display: grid;
  justify-items: center;
  gap: 6px;
  min-width: 112px;
}

.sk-pagination-strip {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 48%, transparent);
}

.sk-release-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.sk-release-pulse-grid {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.sk-release-pulse-card {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 74%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--muted) 12%, transparent);
}

.sk-release-card {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 78%, transparent);
  border-radius: 16px;
  background: var(--card);
  box-shadow: var(--surface-card-shadow-current, var(--shadow-sm));
}

.sk-release-card-body,
.sk-cover-card {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.sk-mobile-card-list {
  display: none;
  gap: 12px;
}

.sk-alert-line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--surface-border, var(--border)) 68%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--muted) 14%, transparent);
}

.sk-avatar-row,
.sk-artwork-row,
.sk-ring-layout {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.sk-uploader-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
  gap: 18px;
}

.sk-uploader-main {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.sk-readiness {
  align-self: start;
  position: sticky;
  top: calc(var(--topbar-height, 64px) + 16px);
}

.sk-logo-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sk-mini-bars {
  display: flex;
  align-items: end;
  gap: 3px;
  height: 48px;
}

.sk-company-hero-grid {
  grid-template-columns: minmax(320px, 1.4fr) repeat(3, minmax(160px, 0.65fr));
}

.sk-company-analytics-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sk-company-balance {
  min-height: 178px;
}

.sk-chart-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.sk-chart-card-wide {
  grid-column: 1 / -1;
}

.sk-timeline {
  display: grid;
  gap: 12px;
}

.sk-timeline-item {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
}

.sk-timeline-dot {
  margin-top: 4px;
}

.sk-timeline-card {
  min-width: 0;
}

.sk-archive-stack .sk-panel {
  box-shadow: none;
}

@media (max-width: 1180px) {
  .sk-bento {
    grid-template-columns: 1fr;
  }

  .sk-span-4,
  .sk-span-5,
  .sk-span-6,
  .sk-span-7,
  .sk-span-8,
  .sk-span-12 {
    grid-column: 1 / -1;
  }

  .sk-metrics-4,
  .sk-metrics-5,
  .sk-form-grid-4,
  .sk-form-grid-5,
  .sk-release-grid,
  .sk-company-hero-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sk-uploader-layout,
  .sk-wallet-hero {
    grid-template-columns: 1fr;
  }

  .sk-readiness {
    position: static;
  }
}

@media (max-width: 760px) {
  .dashboard-skeleton {
    gap: 14px;
  }

  .sk-panel,
  .sk-search-panel,
  .sk-setup-card {
    padding: 16px;
    border-radius: 14px;
  }

  .sk-panel-head,
  .sk-search-panel,
  .sk-avatar-row,
  .sk-artwork-row,
  .sk-ring-layout,
  .sk-release-pulse-card {
    flex-direction: column;
    align-items: stretch;
  }

  .sk-metrics,
  .sk-metrics-2,
  .sk-metrics-3,
  .sk-metrics-4,
  .sk-metrics-5,
  .sk-form-grid-2,
  .sk-form-grid-3,
  .sk-form-grid-4,
  .sk-form-grid-5,
  .sk-action-grid,
  .sk-action-grid-3,
  .sk-release-grid,
  .sk-chart-grid,
  .sk-company-hero-grid,
  .sk-company-analytics-grid,
  .sk-panel-grid {
    grid-template-columns: 1fr;
  }

  .sk-table {
    overflow-x: auto;
  }

  .sk-mobile-card-list {
    display: grid;
  }

  .sk-chart-bars {
    min-height: 180px;
  }
}
</style>
