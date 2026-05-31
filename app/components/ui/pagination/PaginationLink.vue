<script setup lang="ts">
import type { PrimitiveProps } from "radix-vue"
import type { HTMLAttributes } from "vue"
import type { ButtonVariants } from "@/components/ui/button"
import { Primitive } from "radix-vue"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

interface Props extends PrimitiveProps {
  class?: HTMLAttributes["class"]
  href?: string
  isActive?: boolean
  variant?: ButtonVariants["variant"]
  size?: ButtonVariants["size"]
}

const props = withDefaults(defineProps<Props>(), {
  as: "a",
  href: "#",
  isActive: false,
  variant: "ghost",
  size: "icon-sm",
})
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :href="href"
    :aria-current="props.isActive ? 'page' : undefined"
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
  </Primitive>
</template>
