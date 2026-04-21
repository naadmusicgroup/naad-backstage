<script setup lang="ts">
import { artistNav } from "~/utils/navigation"
</script>

<template>
  <AppShell
    title="Artist Dashboard"
    subtitle="Wallet, statements, analytics, and account settings."
    panel-label="Artist"
    :nav-items="artistNav"
  >
    <slot />
  </AppShell>
</template>
