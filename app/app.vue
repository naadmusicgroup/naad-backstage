<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "vue-sonner/style.css"

const {
  confirmActionDialogProps,
  handleConfirmActionCancel,
  handleConfirmActionConfirm,
  handleConfirmActionOpenChange,
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
      @confirm="handleConfirmActionConfirm"
      @cancel="handleConfirmActionCancel"
    />
  </TooltipProvider>
</template>
