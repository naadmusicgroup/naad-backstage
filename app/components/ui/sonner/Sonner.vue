<script lang="ts" setup>
import type { ToasterProps } from 'vue-sonner'
import { Toaster as Sonner } from 'vue-sonner'

const props = defineProps<ToasterProps>()
</script>

<template>
  <Sonner
    class="toaster group"
    v-bind="props"
    :toast-options="{
      classes: {
        toast: 'group toast naad-toast',
        description: 'naad-toast-description',
        actionButton:
          'naad-toast-action group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton:
          'naad-toast-cancel group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
      },
    }"
  />
</template>

<style scoped>
:global([data-sonner-toaster].toaster) {
  --normal-bg: var(--popover);
  --normal-border: color-mix(in srgb, var(--surface-border, var(--border)) 88%, var(--foreground) 8%);
  --normal-text: var(--foreground);
  --toast-tone: var(--priority);
  --width: min(440px, calc(100vw - 32px));
  --border-radius: 10px;
}

:global(.dark [data-sonner-toaster].toaster) {
  --normal-bg: var(--surface-elevated-strong, var(--popover));
  --normal-border: color-mix(in srgb, var(--surface-border, var(--border)) 86%, var(--foreground) 8%);
  --normal-text: var(--foreground);
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-styled='true']) {
  --toast-tone: var(--priority);
  min-height: 56px;
  gap: 10px;
  padding: 14px 16px;
  border-color: color-mix(in srgb, var(--toast-tone) 10%, var(--normal-border));
  background: var(--normal-bg);
  color: var(--normal-text);
  box-shadow:
    0 12px 28px -24px rgb(10 10 10 / 36%),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 5%, transparent);
  font-size: 14px;
  letter-spacing: 0;
}

:global(.dark [data-sonner-toaster].toaster [data-sonner-toast][data-styled='true']) {
  border-color: color-mix(in srgb, var(--toast-tone) 12%, var(--normal-border));
  background: var(--normal-bg);
  box-shadow:
    0 18px 38px -30px rgb(0 0 0 / 92%),
    inset 0 1px 0 rgb(254 249 231 / 4%);
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-type='success']) {
  --toast-tone: var(--priority);
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-type='error']) {
  --toast-tone: var(--destructive);
  border-color: color-mix(in srgb, var(--destructive) 22%, var(--normal-border));
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-type='warning']) {
  --toast-tone: var(--priority);
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-type='info']) {
  --toast-tone: var(--status-info);
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-styled='true'] [data-icon]) {
  width: 18px;
  height: 18px;
  color: var(--toast-tone);
  opacity: 0.9;
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-styled='true'] [data-icon] svg) {
  width: 18px;
  height: 18px;
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-styled='true'] [data-title]) {
  font-weight: 540;
  line-height: 1.45;
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-styled='true'] [data-description]),
:global(.naad-toast-description) {
  color: var(--muted-foreground);
}

:global([data-sonner-toaster].toaster [data-sonner-toast][data-styled='true'] [data-button]) {
  border-radius: 7px;
  font-weight: 650;
}

:global(.naad-toast-action) {
  background: var(--priority) !important;
  color: var(--priority-foreground) !important;
}

:global(.naad-toast-cancel) {
  background: color-mix(in srgb, var(--muted) 78%, transparent) !important;
  color: var(--muted-foreground) !important;
}
</style>
