<script setup lang="ts">
defineProps<{
  eyebrow?: string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="page-header">
    <div class="page-header-text">
      <p v-if="eyebrow" class="page-header-eyebrow">{{ eyebrow }}</p>
      <h1 class="page-header-title">{{ title }}</h1>
      <p v-if="description" class="page-header-description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 24px;
}

@media (min-width: 768px) {
  .page-header {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
  }
}

.page-header-text {
  display: grid;
  gap: 4px;
}

.page-header-eyebrow {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted-foreground);
  margin: 0;
  line-height: 1.5;
}

.page-header-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--foreground);
  letter-spacing: -0.02em;
  margin: 0;
  /* Design Engineering: balanced wrapping for headings */
  text-wrap: balance;
  line-height: 1.2;
}

@media (min-width: 768px) {
  .page-header-title {
    font-size: 32px;
  }
}

.page-header-description {
  font-size: 14px;
  color: var(--muted-foreground);
  line-height: 1.6;
  margin: 0;
  max-width: 640px;
  /* Design Engineering: pretty wrapping for body text */
  text-wrap: pretty;
}

.page-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  /* Design Engineering: prevent actions from being crushed on narrow viewports */
  flex-shrink: 0;
}
</style>
