<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { BarChart3, FileText, Inbox, SearchX } from "lucide-vue-next"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

const props = withDefaults(defineProps<{
  title: string
  description?: string
  icon?: "inbox" | "search" | "chart" | "file"
  compact?: boolean
  class?: HTMLAttributes["class"]
}>(), {
  description: "",
  icon: "inbox",
  compact: false,
})

const icon = computed(() => {
  if (props.icon === "search") return SearchX
  if (props.icon === "chart") return BarChart3
  if (props.icon === "file") return FileText
  return Inbox
})
</script>

<template>
  <Empty :class="cn(compact ? 'gap-4 p-5' : 'min-h-[260px] border-dashed border-[color-mix(in_srgb,var(--priority)_15%,var(--border))] bg-[color-mix(in_srgb,var(--priority)_2%,transparent)] rounded-2xl p-12', props.class)">
    <EmptyMedia :class="compact ? 'size-10 rounded-lg' : 'size-20 rounded-2xl border-dashed border-[color-mix(in_srgb,var(--priority)_20%,var(--border))] bg-[color-mix(in_srgb,var(--priority)_4%,var(--muted))] text-muted-foreground/55 [&_svg]:size-12'">
      <component :is="icon" />
    </EmptyMedia>
    <EmptyHeader>
      <EmptyTitle :class="!compact && 'text-lg font-bold text-foreground/90'">{{ title }}</EmptyTitle>
      <EmptyDescription v-if="description" :class="!compact && 'text-muted-foreground/80 max-w-[280px] mx-auto'">{{ description }}</EmptyDescription>
    </EmptyHeader>
    <EmptyContent v-if="$slots.default">
      <slot />
    </EmptyContent>
  </Empty>
</template>
