<script setup lang="ts">
defineProps<{
  class?: string
}>()
</script>

<template>
  <div :class="['page-scaffold mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 py-6 sm:px-6 lg:px-8', $props.class]">
    <slot />
  </div>
</template>

<style scoped>
.page-scaffold {
  flex: 1 0 auto;
  min-height: calc(100svh - var(--topbar-height, 64px));
  background: var(--background);
}
</style>
