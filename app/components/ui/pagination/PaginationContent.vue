<script setup lang="ts">
import type { PaginationListProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { computed } from "vue"
import { PaginationList } from "reka-ui"
import { cn } from "@/lib/utils"

interface Props extends PaginationListProps {
  class?: HTMLAttributes["class"]
}

const props = defineProps<Props>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <PaginationList
    v-bind="delegatedProps"
    :class="cn('flex flex-row items-center gap-1', props.class)"
  >
    <template #default="slotProps">
      <slot v-bind="slotProps" />
    </template>
  </PaginationList>
</template>
