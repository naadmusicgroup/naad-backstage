<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "vue-sonner/style.css"

const {
  confirmActionDialogProps,
  handleConfirmActionCancel,
  handleConfirmActionConfirm,
  handleConfirmActionOpenChange,
  setConfirmActionAdminVerificationPassword,
  setConfirmActionRequiredTextValue,
} = useConfirmAction()
</script>

<template>
  <TooltipProvider>
    <NuxtLayout>
      <NuxtRouteAnnouncer />
      <NuxtPage />
    </NuxtLayout>
    <Toaster class="pointer-events-auto" />
    <ConfirmActionDialog
      v-bind="confirmActionDialogProps"
      @update:open="handleConfirmActionOpenChange"
      @update:required-text-value="setConfirmActionRequiredTextValue"
      @update:admin-verification-password="setConfirmActionAdminVerificationPassword"
      @confirm="handleConfirmActionConfirm"
      @cancel="handleConfirmActionCancel"
    />
  </TooltipProvider>
</template>

<style>
/* Prevent flash of unstyled content - critical for theme */
html {
  background-color: var(--background);
}

/* Theme switching is intentionally instant. */
:root {
  --theme-transition-duration: 0ms;
  --theme-transition-ease: cubic-bezier(0.22, 1, 0.36, 1);
}

.theme-ready .nav-item-active-indicator,
.theme-ready .accent-glow,
.theme-ready .theme-sensitive {
  transition: none !important;
}
</style>
