<script setup lang="ts">
import type { AlertDialogContentEmits, AlertDialogContentProps } from 'radix-vue'
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import {
  AlertDialogContent,
  AlertDialogOverlay,
  AlertDialogPortal,
  useForwardPropsEmits,
} from 'radix-vue'

type AlertDialogContentSize = 'default' | 'sm'

interface AlertDialogContentWrapperProps extends AlertDialogContentProps {
  class?: HTMLAttributes['class']
  size?: AlertDialogContentSize
}

const props = withDefaults(defineProps<AlertDialogContentWrapperProps>(), {
  size: 'default',
})
const emits = defineEmits<AlertDialogContentEmits>()

defineOptions({
  inheritAttrs: false,
})

const delegatedProps = computed(() => {
  const { class: _, size: __, ...delegated } = props

  return delegated
})

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <AlertDialogPortal>
    <AlertDialogOverlay
      class="fixed inset-0 z-[80] bg-[#0a0a0a]/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 dark:bg-[#0a0a0a]/70"
    />
    <AlertDialogContent
      v-bind="{ ...forwarded, ...$attrs }"
      :class="
        cn(
          'glass-modal fixed left-1/2 top-1/2 z-[80] grid w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-hidden rounded-lg border p-6 text-popover-foreground outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
          props.size === 'sm' ? 'max-w-[26rem]' : 'max-w-lg',
          props.class,
        )
      "
    >
      <slot />
    </AlertDialogContent>
  </AlertDialogPortal>
</template>
