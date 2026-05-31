<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-vue-next"
import type { AlertVariants } from "@/components/ui/alert"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

const props = withDefaults(defineProps<{
  title?: string
  variant?: AlertVariants["variant"]
  class?: HTMLAttributes["class"]
  showIcon?: boolean
}>(), {
  variant: "default",
  showIcon: true,
})

const icon = computed(() => {
  if (props.variant === "destructive") return AlertCircle
  if (props.variant === "success") return CheckCircle2
  if (props.variant === "warning") return TriangleAlert
  if (props.variant === "info") return Info
  return Info
})
</script>

<template>
  <Alert :variant="variant" :class="cn($slots.action && 'items-start gap-4 sm:flex', props.class)">
    <component :is="icon" v-if="showIcon" class="size-4" />
    <div class="min-w-0 flex-1">
      <AlertTitle v-if="title">{{ title }}</AlertTitle>
      <AlertDescription>
        <slot />
      </AlertDescription>
    </div>
    <AlertAction v-if="$slots.action">
      <slot name="action" />
    </AlertAction>
  </Alert>
</template>
