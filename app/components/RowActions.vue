<script lang="ts">
import type { Component } from "vue"

export interface RowAction {
  key: string
  label: string
  icon?: Component
  variant?: "default" | "destructive"
  disabled?: boolean
  /** draw a divider above this item */
  separatorBefore?: boolean
}
</script>

<script setup lang="ts">
import { MoreHorizontal } from "lucide-vue-next"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * The canonical table row-action kebab. Drop into a trailing "actions" column:
 *   <RowActions :actions="rowActions(row)" @select="(k) => onAction(k, row)" />
 * Every admin table uses this so the pattern is identical everywhere.
 */
const props = withDefaults(defineProps<{
  actions: RowAction[]
  align?: "start" | "end"
  label?: string
}>(), {
  align: "end",
  label: "Row actions",
})

const emit = defineEmits<{ select: [key: string] }>()

const visibleActions = computed(() => props.actions.filter(Boolean))
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        :aria-label="label"
        :disabled="!visibleActions.length"
        @click.stop
      >
        <MoreHorizontal class="size-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent :align="align" class="w-48">
      <template v-for="(action, index) in visibleActions" :key="action.key">
        <DropdownMenuSeparator v-if="action.separatorBefore && index > 0" />
        <DropdownMenuItem
          :variant="action.variant"
          :disabled="action.disabled"
          class="gap-2"
          @select="emit('select', action.key)"
        >
          <component :is="action.icon" v-if="action.icon" class="size-4" />
          {{ action.label }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
