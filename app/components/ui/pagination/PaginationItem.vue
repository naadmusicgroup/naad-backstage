<script setup lang="ts">
import type { PaginationListItemProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { ButtonVariants } from "@/components/ui/button"
import { computed } from "vue"
import { PaginationListItem } from "reka-ui"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface Props extends PaginationListItemProps {
  class?: HTMLAttributes["class"]
  isActive?: boolean
  variant?: ButtonVariants["variant"]
  size?: ButtonVariants["size"]
}

const props = withDefaults(defineProps<Props>(), {
  isActive: false,
  variant: "ghost",
  size: "icon-sm",
})

const delegatedProps = computed(() => {
  const { class: _, isActive: __, variant: ___, size: ____, ...delegated } = props
  return delegated
})
</script>

<template>
  <PaginationListItem
    v-bind="delegatedProps"
    :class="
      cn(
        buttonVariants({ variant: 'ghost', size: props.size }),
        'min-w-8 tabular-nums transition-[background-color,color,border-color,box-shadow] duration-150',
        props.isActive
          ? 'bg-priority text-priority-foreground hover:bg-priority-hover border border-priority font-semibold shadow-sm'
          : 'hover:bg-priority/10 hover:text-foreground hover:border-priority/30 border border-transparent',
        props.class,
      )
    "
  >
    <slot />
  </PaginationListItem>
</template>
