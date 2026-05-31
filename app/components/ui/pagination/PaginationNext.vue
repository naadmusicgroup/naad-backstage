<script setup lang="ts">
import type { PaginationNextProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { ButtonVariants } from "@/components/ui/button"
import { ChevronRight } from "lucide-vue-next"
import { computed } from "vue"
import { PaginationNext } from "reka-ui"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface Props extends PaginationNextProps {
  class?: HTMLAttributes["class"]
  text?: string
  variant?: ButtonVariants["variant"]
  size?: ButtonVariants["size"]
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
  text: "Next",
  variant: "ghost",
  size: "sm",
})

const delegatedProps = computed(() => {
  const { class: _, text: __, variant: ___, size: ____, ...delegated } = props
  return delegated
})
</script>

<template>
  <PaginationNext
    v-bind="delegatedProps"
    :class="cn(buttonVariants({ variant: props.variant, size: props.size }), 'gap-1.5 px-2.5 sm:px-3', props.class)"
  >
    <span class="hidden sm:inline">{{ props.text }}</span>
    <ChevronRight class="size-4" aria-hidden="true" />
  </PaginationNext>
</template>
