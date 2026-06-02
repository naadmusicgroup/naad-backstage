import { computed, reactive } from "vue"
import type { ButtonVariants } from "@/components/ui/button"

export interface ConfirmActionOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ButtonVariants["variant"]
  requiredText?: string
  adminVerification?: {
    action: string
    label?: string
  }
}

type ConfirmResolver = (value: boolean) => void

const defaultOptions = {
  title: "Confirm action",
  description: "",
  confirmLabel: "Continue",
  cancelLabel: "Cancel",
  variant: "default" as ButtonVariants["variant"],
  requiredText: "",
  requiredTextValue: "",
  adminVerification: null as ConfirmActionOptions["adminVerification"] | null,
  adminVerificationPassword: "",
  validationError: "",
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
      requiredTextValue: "",
      adminVerificationPassword: "",
      validationError: "",
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

  async function handleConfirmActionConfirm() {
    state.validationError = ""

    if (state.requiredText && state.requiredTextValue.trim() !== state.requiredText) {
      state.validationError = `Type ${state.requiredText} to continue.`
      return
    }

    if (state.adminVerification) {
      if (!state.adminVerificationPassword) {
        state.validationError = "Enter your admin password to continue."
        return
      }

      state.pending = true

      try {
        await $fetch("/api/admin/security/verify", {
          method: "POST",
          body: {
            action: state.adminVerification.action,
            password: state.adminVerificationPassword,
          },
        })
      } catch (error: any) {
        state.validationError = error?.data?.statusMessage || error?.message || "Admin password verification failed."
        return
      } finally {
        state.pending = false
      }
    }

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
    requiredText: state.requiredText,
    requiredTextValue: state.requiredTextValue,
    adminVerification: state.adminVerification,
    adminVerificationPassword: state.adminVerificationPassword,
    validationError: state.validationError,
  }))

  return {
    confirmAction,
    runConfirmedAction,
    confirmActionDialogProps,
    handleConfirmActionOpenChange,
    handleConfirmActionConfirm,
    handleConfirmActionCancel,
    setConfirmActionRequiredTextValue: (value: string) => {
      state.requiredTextValue = value
      state.validationError = ""
    },
    setConfirmActionAdminVerificationPassword: (value: string) => {
      state.adminVerificationPassword = value
      state.validationError = ""
    },
  }
}
