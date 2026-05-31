<script setup lang="ts">
import type { PaginationPrevProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { ButtonVariants } from "@/components/ui/button"
import { ChevronLeft } from "lucide-vue-next"
import { computed } from "vue"
import { PaginationPrev } from "reka-ui"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface Props extends PaginationPrevProps {
  class?: HTMLAttributes["class"]
  text?: string
  variant?: ButtonVariants["variant"]
  size?: ButtonVariants["size"]
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
  text: "Previous",
  variant: "ghost",
  size: "sm",
})

const delegatedProps = computed(() => {
  const { class: _, text: __, variant: ___, size: ____, ...delegated } = props
  return delegated
})
</script>

<template>
  <PaginationPrev
    v-bind="delegatedProps"
    :class="cn(buttonVariants({ variant: props.variant, size: props.size }), 'gap-1.5 px-2.5 sm:px-3', props.class)"
  >
    <ChevronLeft class="size-4" aria-hidden="true" />
    <span class="hidden sm:inline">{{ props.text }}</span>
  </PaginationPrev>
</template>
