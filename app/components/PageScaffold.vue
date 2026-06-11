<script setup lang="ts">
defineProps<{
  class?: string
}>()
</script>

<template>
  <div :class="['page-scaffold mx-auto flex w-full min-w-0 max-w-full flex-col gap-6 px-5 py-6 sm:px-6 lg:max-w-[1440px] lg:px-8', $props.class]">
    <slot />
  </div>
</template>

<style scoped>
.page-scaffold {
  flex: 1 0 auto;
  min-width: 0;
  max-width: 100%;
  min-height: calc(100svh - var(--topbar-height, 64px));
  overflow-x: hidden;
  overflow-x: clip;
  background: var(--background);
}
</style>
