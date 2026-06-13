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
  icon?: "inbox" | "search" | "chart" | "file" | "money" | "queue"
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
  if (props.icon === "file" || props.icon === "money") return FileText
  return Inbox
})

/* Full-size states use the engraved plates; compact states keep small icons. */
const engraving = computed(() => {
  if (props.icon === "search") return "compass" as const
  if (props.icon === "chart") return "tonearm" as const
  if (props.icon === "file") return "sleeve" as const
  if (props.icon === "money") return "drawer" as const
  if (props.icon === "queue") return "rolodex" as const
  return "envelope" as const
})
</script>

<template>
  <Empty :class="cn(compact ? 'gap-4 p-5' : 'min-h-[260px] border-dashed border-[color-mix(in_srgb,var(--priority)_15%,var(--border))] bg-[color-mix(in_srgb,var(--priority)_2%,transparent)] rounded-2xl p-12', props.class)">
    <EmptyMedia :class="compact ? 'size-10 rounded-lg' : 'size-28 border-0 bg-transparent shadow-none [&_svg]:size-full'">
      <component :is="icon" v-if="compact" />
      <EmptyEngraving v-else :name="engraving" />
    </EmptyMedia>
    <EmptyHeader>
      <EmptyTitle :class="!compact && 'text-xl text-foreground/90'">{{ title }}</EmptyTitle>
      <EmptyDescription v-if="description" :class="!compact && 'text-muted-foreground/80 max-w-[300px] mx-auto'">{{ description }}</EmptyDescription>
    </EmptyHeader>
    <EmptyContent v-if="$slots.default">
      <slot />
    </EmptyContent>
  </Empty>
</template>
