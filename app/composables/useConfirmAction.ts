import { computed, reactive } from "vue"
import type { ButtonVariants } from "@/components/ui/button"

export interface ConfirmActionOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ButtonVariants["variant"]
}

type ConfirmResolver = (value: boolean) => void

const defaultOptions = {
  title: "Confirm action",
  description: "",
  confirmLabel: "Continue",
  cancelLabel: "Cancel",
  variant: "default" as ButtonVariants["variant"],
}

const state = reactive({
  open: false,
  pending: false,
  ...defaultOptions,
})
let resolver: ConfirmResolver | null = null

function finish(value: boolean) {
  const activeResolver = resolver
  resolver = null
  state.open = false

  activeResolver?.(value)
}

export function useConfirmAction() {
  function confirmAction(options: ConfirmActionOptions) {
    if (resolver) {
      finish(false)
    }

    Object.assign(state, defaultOptions, options, {
      open: true,
      pending: false,
    })

    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  }

  async function runConfirmedAction(options: ConfirmActionOptions, action: () => Promise<void> | void) {
    const confirmed = await confirmAction(options)

    if (!confirmed) {
      return false
    }

    state.pending = true

    try {
      await action()
      return true
    } finally {
      state.pending = false
    }
  }

  function handleConfirmActionOpenChange(value: boolean) {
    state.open = value

    if (!value && resolver) {
      finish(false)
    }
  }

  function handleConfirmActionConfirm() {
    finish(true)
  }

  function handleConfirmActionCancel() {
    finish(false)
  }

  const confirmActionDialogProps = computed(() => ({
    open: state.open,
    pending: state.pending,
    title: state.title,
    description: state.description,
    confirmLabel: state.confirmLabel,
    cancelLabel: state.cancelLabel,
    variant: state.variant,
  }))

  return {
    confirmAction,
    runConfirmedAction,
    confirmActionDialogProps,
    handleConfirmActionOpenChange,
    handleConfirmActionConfirm,
    handleConfirmActionCancel,
  }
}
