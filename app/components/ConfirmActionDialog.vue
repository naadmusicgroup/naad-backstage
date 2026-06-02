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
  requiredText?: string
  requiredTextValue?: string
  adminVerification?: {
    action: string
    label?: string
  } | null
  adminVerificationPassword?: string
  validationError?: string
}>(), {
  description: "",
  confirmLabel: "Continue",
  cancelLabel: "Cancel",
  variant: "default",
  pending: false,
  requiredText: "",
  requiredTextValue: "",
  adminVerification: null,
  adminVerificationPassword: "",
  validationError: "",
})

const emit = defineEmits<{
  "update:open": [value: boolean]
  "update:requiredTextValue": [value: string]
  "update:adminVerificationPassword": [value: string]
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

        <div v-if="props.requiredText || props.adminVerification" class="mt-5 grid gap-4">
          <div v-if="props.requiredText" class="grid gap-2">
            <label class="text-sm font-medium" for="confirm-required-text">
              Type {{ props.requiredText }} to confirm
            </label>
            <Input
              id="confirm-required-text"
              :model-value="props.requiredTextValue"
              autocomplete="off"
              :disabled="props.pending"
              @update:model-value="emit('update:requiredTextValue', String($event))"
            />
          </div>

          <div v-if="props.adminVerification" class="grid gap-2">
            <label class="text-sm font-medium" for="confirm-admin-password">
              {{ props.adminVerification.label || "Admin password" }}
            </label>
            <Input
              id="confirm-admin-password"
              :model-value="props.adminVerificationPassword"
              type="password"
              autocomplete="current-password"
              :disabled="props.pending"
              @update:model-value="emit('update:adminVerificationPassword', String($event))"
            />
          </div>

          <AppAlert v-if="props.validationError" variant="destructive">
            {{ props.validationError }}
          </AppAlert>
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
