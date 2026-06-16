<script setup lang="ts">
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

/**
 * Canonical form/detail modal shell used across the admin panel.
 * - calm: header, scrollable grouped body, sticky footer
 * - `readonly` turns it into a details viewer (Close only)
 * - errors render inside the dialog, above the fields
 *   <FormDialog v-model:open="open" title="Edit" :pending="saving" :error="err" @submit="save">…</FormDialog>
 */
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  submitLabel?: string
  cancelLabel?: string
  pending?: boolean
  error?: string
  readonly?: boolean
  submitDisabled?: boolean
  submitVariant?: "default" | "destructive"
  contentClass?: string
}>(), {
  submitLabel: "Save",
  cancelLabel: "Cancel",
  pending: false,
  readonly: false,
  submitVariant: "default",
})

const emit = defineEmits<{ "update:open": [value: boolean]; submit: []; cancel: [] }>()

function close() {
  emit("update:open", false)
  emit("cancel")
}

function onOpenChange(value: boolean) {
  if (!value) {
    close()
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent :class="cn('form-dialog max-w-xl', contentClass)">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">{{ description }}</DialogDescription>
      </DialogHeader>

      <div class="form-dialog-body">
        <AppAlert v-if="error" variant="destructive">{{ error }}</AppAlert>
        <slot />
      </div>

      <DialogFooter>
        <slot name="footer">
          <Button variant="ghost" type="button" @click="close">
            {{ readonly ? "Close" : cancelLabel }}
          </Button>
          <Button
            v-if="!readonly"
            type="button"
            :variant="submitVariant"
            :disabled="pending || submitDisabled"
            @click="emit('submit')"
          >
            {{ pending ? "Saving…" : submitLabel }}
          </Button>
        </slot>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.form-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: min(64vh, 560px);
  overflow-y: auto;
  margin: 0 -2px;
  padding: 2px;
}
</style>
