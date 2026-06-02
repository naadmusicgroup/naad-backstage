<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const props = withDefaults(defineProps<{
  title?: string
  titleLevel?: "h1" | "h2" | "h3"
  eyebrow?: string
  description?: string
  class?: HTMLAttributes["class"]
  tone?: "default" | "accent" | "danger" | "success" | "info"
}>(), {
  titleLevel: "h3",
  tone: "default",
})

const dotClass = computed(() => {
  switch (props.tone) {
    case "accent":
      return "bg-primary"
    case "danger":
      return "bg-[var(--status-danger,var(--destructive))]"
    case "success":
      return "bg-[var(--status-success,#10b981)]"
    case "info":
      return "bg-[var(--status-info,#3b82f6)]"
    default:
      return "bg-muted-foreground/60"
  }
})
</script>

<template>
  <Card :class="cn('data-panel overflow-hidden', props.class)">
    <CardHeader v-if="title || eyebrow || description || $slots.actions">
      <div class="grid min-w-0 gap-1">
        <p v-if="eyebrow" class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span :class="cn('size-1.5 rounded-full shrink-0', dotClass)" aria-hidden="true" />
          {{ eyebrow }}
        </p>
        <CardTitle
          v-if="title"
          :as="props.titleLevel"
          class="text-lg leading-snug tracking-tight"
        >
          {{ title }}
        </CardTitle>
        <CardDescription v-if="description" class="max-w-2xl leading-6">
          {{ description }}
        </CardDescription>
      </div>
      <CardAction v-if="$slots.actions" class="flex flex-wrap items-center justify-end gap-2">
        <slot name="actions" />
      </CardAction>
    </CardHeader>
    <CardContent class="grid gap-4">
      <slot />
    </CardContent>
  </Card>
</template>
