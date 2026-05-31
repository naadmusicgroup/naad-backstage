<script setup lang="ts">
import type { PaginationEllipsisProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { MoreHorizontal } from "lucide-vue-next"
import { computed } from "vue"
import { PaginationEllipsis } from "reka-ui"
import { cn } from "@/lib/utils"

interface Props extends PaginationEllipsisProps {
  class?: HTMLAttributes["class"]
}

const props = defineProps<Props>()

const delegatedProps = computed(() => {
  const { class: _, ...delegated } = props
  return delegated
})
</script>

<template>
  <PaginationEllipsis
    v-bind="delegatedProps"
    :class="cn('flex size-8 items-center justify-center rounded-lg text-muted-foreground', props.class)"
  >
    <slot>
      <MoreHorizontal class="size-4" />
      <span class="sr-only">More pages</span>
    </slot>
  </PaginationEllipsis>
</template>
