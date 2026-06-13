<script setup lang="ts">
import { adminNav } from "~/utils/navigation"
</script>

<template>
  <AppShell
    class="app-density-compact"
    title="Admin Panel"
    subtitle="Catalog writes, royalty ingestion, payouts, and audit controls."
    panel-label="Admin"
    :nav-items="adminNav"
  >
    <slot />
  </AppShell>
</template>
