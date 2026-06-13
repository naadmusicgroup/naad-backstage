<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { ChevronDown } from "lucide-vue-next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const props = withDefaults(defineProps<{
  title: string
  eyebrow?: string
  description?: string
  badge?: string | number
  defaultOpen?: boolean
  class?: HTMLAttributes["class"]
  triggerClass?: HTMLAttributes["class"]
  contentClass?: HTMLAttributes["class"]
}>(), {
  description: "",
  defaultOpen: false,
})

const isOpen = ref(props.defaultOpen)
</script>

<template>
  <Collapsible v-model:open="isOpen" :class="cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm', props.class)">
    <CollapsibleTrigger as-child>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        :class="
          cn(
            'h-auto w-full items-center justify-between gap-4 rounded-lg px-4 py-3 text-left transition-colors hover:bg-muted/35',
            props.triggerClass,
          )
        "
      >
        <span class="grid min-w-0 gap-1">
          <span v-if="props.eyebrow" class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {{ props.eyebrow }}
          </span>
          <span class="text-sm font-semibold text-foreground">{{ props.title }}</span>
          <span v-if="props.description" class="text-xs leading-5 text-muted-foreground">
            {{ props.description }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-2">
          <Badge v-if="props.badge !== undefined && props.badge !== ''" variant="secondary">
            {{ props.badge }}
          </Badge>
          <ChevronDown
            class="size-4 text-muted-foreground transition-transform duration-200"
            :class="{ 'rotate-180': isOpen }"
            aria-hidden="true"
          />
        </span>
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div :class="cn('border-t border-border p-4', props.contentClass)">
        <slot />
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
