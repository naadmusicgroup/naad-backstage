<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/lib/utils'
import { useDialogMotionOrigin } from '@/composables/useDialogMotionOrigin'
import UiDialogClose from './DialogClose.vue'
import { X } from 'lucide-vue-next'
import {
  DialogContent,

  DialogOverlay,
  DialogPortal,
  useForwardPropsEmits,
} from 'radix-vue'
import { computed } from 'vue'

interface DialogContentWrapperProps extends DialogContentProps {
  class?: HTMLAttributes['class']
  showCloseButton?: boolean
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<DialogContentWrapperProps>(), {
  showCloseButton: true,
})
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = computed(() => {
  const { class: _, showCloseButton: __, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)

useDialogMotionOrigin()
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="dialog-morph-overlay fixed inset-0 z-50 bg-[#0a0a0a]/80 data-[state=open]:animate-in data-[state=closed]:animate-out"
    />
    <DialogContent
      :class="
        cn(
          'dialog-morph-content glass-modal fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg gap-4 border p-6 text-popover-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out sm:rounded-lg',
          props.class,
        )"
      v-bind="{ ...forwarded, ...$attrs }"
    >
      <slot />

      <UiDialogClose
        v-if="showCloseButton"
        aria-label="Close"
        class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
      >
        <X class="w-4 h-4" />
        <span class="sr-only">Close</span>
      </UiDialogClose>
    </DialogContent>
  </DialogPortal>
</template>
