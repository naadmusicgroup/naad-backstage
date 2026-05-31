<script setup lang="ts">
defineProps<{
  class?: string
}>()
</script>

<template>
  <section :class="['dashboard-bento', $props.class]">
    <slot />
  </section>
</template>

<style scoped>
.dashboard-bento {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 16px;
}

:deep(.bento-cell) {
  min-width: 0;
}

:deep(.bento-span-4) {
  grid-column: span 4;
}

:deep(.bento-span-3) {
  grid-column: span 3;
}

:deep(.bento-span-5) {
  grid-column: span 5;
}

:deep(.bento-span-6) {
  grid-column: span 6;
}

:deep(.bento-span-7) {
  grid-column: span 7;
}

:deep(.bento-span-8) {
  grid-column: span 8;
}

:deep(.bento-span-12) {
  grid-column: 1 / -1;
}

@media (max-width: 1180px) {
  :deep(.bento-span-3),
  :deep(.bento-span-4),
  :deep(.bento-span-5),
  :deep(.bento-span-6),
  :deep(.bento-span-7),
  :deep(.bento-span-8) {
    grid-column: 1 / -1;
  }
}
</style>
