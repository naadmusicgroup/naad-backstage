<script setup lang="ts">
import { computed } from "vue"
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-vue-next"
import type { ButtonVariants } from "@/components/ui/button"

const props = withDefaults(defineProps<{
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ButtonVariants["variant"]
  pending?: boolean
}>(), {
  description: "",
  confirmLabel: "Continue",
  cancelLabel: "Cancel",
  variant: "default",
  pending: false,
})

const emit = defineEmits<{
  "update:open": [value: boolean]
  confirm: []
  cancel: []
}>()

const isDestructive = computed(() => props.variant === "destructive")
const dialogIcon = computed(() => isDestructive.value ? TriangleAlert : CheckCircle2)
const eyebrowLabel = computed(() => isDestructive.value ? "Review impact" : "Confirm action")
const mediaClass = computed(() =>
  isDestructive.value
    ? "border-destructive/20 bg-destructive/10 text-destructive"
    : "border-primary/15 bg-primary/10 text-primary",
)
</script>

<template>
  <AlertDialog :open="props.open" @update:open="emit('update:open', $event)">
    <AlertDialogContent size="sm" class="gap-0 p-0">
      <div class="px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
        <div class="flex items-start gap-3.5">
          <AlertDialogMedia :class="mediaClass">
            <component :is="dialogIcon" class="size-[18px]" aria-hidden="true" />
          </AlertDialogMedia>

          <AlertDialogHeader class="min-w-0 flex-1 gap-0 text-left">
            <p class="mb-1 text-[11px] font-semibold uppercase tracking-normal text-muted-foreground">
              {{ eyebrowLabel }}
            </p>
            <AlertDialogTitle>{{ props.title }}</AlertDialogTitle>
            <AlertDialogDescription v-if="props.description">
              {{ props.description }}
            </AlertDialogDescription>
            <AlertDialogDescription v-else class="sr-only">
              Review this action before continuing.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>
      </div>

      <AlertDialogFooter class="px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
        <Button
          type="button"
          variant="outline"
          size="sm"
          class="min-w-24 rounded-full"
          :disabled="props.pending"
          @click="emit('cancel')"
        >
          {{ props.cancelLabel }}
        </Button>
        <Button
          type="button"
          :variant="props.variant"
          size="sm"
          class="min-w-28 rounded-full"
          :disabled="props.pending"
          @click="emit('confirm')"
        >
          <Loader2 v-if="props.pending" class="size-4 animate-spin" aria-hidden="true" />
          {{ props.pending ? "Working..." : props.confirmLabel }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
