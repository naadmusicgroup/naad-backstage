<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <div :class="cn('mt-3 flex flex-wrap items-center gap-2 sm:ml-auto sm:mt-0', props.class)">
    <slot />
  </div>
</template>
