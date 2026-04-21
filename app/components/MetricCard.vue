<script setup lang="ts">
defineProps<{
  label: string
  value: string
  footnote?: string
  tone?: "default" | "accent" | "alt"
}>()
</script>

<template>
  <article class="metric-card" :class="tone">
    <p class="metric-label">{{ label }}</p>
    <p class="metric-value">{{ value }}</p>
    <p v-if="footnote" class="metric-footnote">{{ footnote }}</p>
  </article>
</template>
