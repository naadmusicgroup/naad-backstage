<script setup lang="ts">
import type { PaginationRootEmits, PaginationRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { PaginationRoot } from "reka-ui"
import { cn } from "@/lib/utils"

interface Props extends PaginationRootProps {
  class?: HTMLAttributes["class"]
}

const props = withDefaults(defineProps<Props>(), {
  as: "nav",
  total: 0,
  siblingCount: 1,
  defaultPage: 1,
  showEdges: true,
})

const emit = defineEmits<PaginationRootEmits>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <PaginationRoot
    v-bind="delegatedProps"
    :class="cn('mx-auto flex w-full justify-center', props.class)"
    @update:page="emit('update:page', $event)"
  >
    <slot />
  </PaginationRoot>
</template>
