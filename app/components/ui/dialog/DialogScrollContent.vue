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

interface DialogScrollContentProps extends DialogContentProps {
  class?: HTMLAttributes['class']
  showCloseButton?: boolean
}

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<DialogScrollContentProps>(), {
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
      class="dialog-morph-overlay fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#0a0a0a]/80 data-[state=open]:animate-in data-[state=closed]:animate-out"
    >
      <DialogContent
        :class="
          cn(
            'dialog-morph-scroll-content glass-modal relative z-50 my-8 grid w-[calc(100%-2rem)] max-w-lg gap-4 border p-6 text-popover-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out sm:rounded-lg md:w-full',
            props.class,
          )
        "
        v-bind="{ ...forwarded, ...$attrs }"
        @pointer-down-outside="(event) => {
          const originalEvent = event.detail.originalEvent;
          const target = originalEvent.target as HTMLElement;
          if (originalEvent.offsetX > target.clientWidth || originalEvent.offsetY > target.clientHeight) {
            event.preventDefault();
          }
        }"
      >
        <slot />

        <UiDialogClose
          v-if="showCloseButton"
          aria-label="Close"
          class="absolute top-3 right-3 p-0.5 transition-colors rounded-md hover:bg-secondary"
        >
          <X class="w-4 h-4" />
          <span class="sr-only">Close</span>
        </UiDialogClose>
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
