<script setup lang="ts">
import { destinationForViewer } from "~/utils/auth-routing"

definePageMeta({
  layout: "default",
})

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const newPassword = ref("")
const confirmPassword = ref("")
const errorMessage = ref("")
const infoMessage = ref("")
const isSubmitting = ref(false)
const isHydrated = ref(false)
const verifyingRecoveryToken = ref(false)
const recoveryAttempted = ref(false)
const recoveryReady = ref(false)
const { refreshViewerContext, resolveAuthUserId } = useViewerContext()

const recoveryTokenHash = computed(() =>
  typeof route.query.token_hash === "string" ? route.query.token_hash : "",
)
const hasRecoverySession = computed(() => recoveryReady.value || Boolean(user.value?.id))

function buildUrlWithoutHash() {
  const search = typeof window.location.search === "string" ? window.location.search : ""
  return `${route.path}${search}`
}

async function claimRecoverySessionFromHash() {
  if (!import.meta.client) {
    return false
  }

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash

  if (!hash) {
    return false
  }

  const params = new URLSearchParams(hash)
  const accessToken = params.get("access_token")
  const refreshToken = params.get("refresh_token")
  const tokenType = params.get("type")

  if (!accessToken || !refreshToken || tokenType !== "recovery") {
    return false
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    throw new Error(error.message)
  }

  window.history.replaceState(window.history.state, "", buildUrlWithoutHash())
  return true
}

async function waitForRecoverySession() {
  const retryDelays = [0, 150, 300, 600, 1000]

  for (const delayMs of retryDelays) {
    if (delayMs) {
      await new Promise((resolve) => window.setTimeout(resolve, delayMs))
    }

    let resolvedUserId: string | null = null

    try {
      resolvedUserId = await resolveAuthUserId()
    } catch {
      resolvedUserId = null
    }

    if (resolvedUserId) {
      return resolvedUserId
    }
  }

  return null
}

async function ensureRecoverySession() {
  if (hasRecoverySession.value) {
    recoveryReady.value = true
    infoMessage.value = "Recovery session confirmed. Choose a new password."
    return
  }

  if (import.meta.client && window.location.hash.includes("access_token")) {
    try {
      const claimedSession = await claimRecoverySessionFromHash()

      if (claimedSession) {
        const claimedUserId = await waitForRecoverySession()

        if (claimedUserId) {
          recoveryReady.value = true
          infoMessage.value = "Recovery session confirmed. Choose a new password."
          return
        }
      }
    } catch (error: any) {
      errorMessage.value = error?.message || "Unable to confirm the recovery session from this link."
      return
    }
  }

  const resolvedUserId = import.meta.client
    ? await waitForRecoverySession()
    : await resolveAuthUserId()

  if (resolvedUserId) {
    recoveryReady.value = true
    infoMessage.value = "Recovery session confirmed. Choose a new password."
    return
  }

  if (!import.meta.client) {
    return
  }

  if (!recoveryTokenHash.value || recoveryAttempted.value || verifyingRecoveryToken.value) {
    return
  }

  verifyingRecoveryToken.value = true
  recoveryAttempted.value = true
  errorMessage.value = ""

  try {
    const { error } = await supabase.auth.verifyOtp({
      type: "recovery",
      token_hash: recoveryTokenHash.value,
    })

    if (error) {
      throw new Error(error.message)
    }

    recoveryReady.value = true
    infoMessage.value = "Recovery session confirmed. Choose a new password."
  } catch (error: any) {
    errorMessage.value = error?.message || "Unable to verify the recovery link."
  } finally {
    verifyingRecoveryToken.value = false
  }
}

watch(
  () => [user.value?.id, recoveryTokenHash.value],
  async () => {
    await ensureRecoverySession()
  },
  { immediate: true },
)

onMounted(() => {
  isHydrated.value = true
  ensureRecoverySession()
})

async function resetPassword() {
  errorMessage.value = ""

  await ensureRecoverySession()

  if (!hasRecoverySession.value) {
    errorMessage.value = "Open the password recovery link from your email first."
    return
  }

  if (!newPassword.value || newPassword.value.length < 8) {
    errorMessage.value = "Choose a password with at least 8 characters."
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = "The password confirmation does not match."
    return
  }

  isSubmitting.value = true

  try {
    const { error } = await supabase.auth.updateUser({
      password: newPassword.value,
    })

    if (error) {
      throw new Error(error.message)
    }

    await $fetch("/api/auth/login-complete", { method: "POST" })
    const context = await refreshViewerContext(true, user.value?.id ?? undefined)
    await navigateTo(destinationForViewer(context), { replace: true })
  } catch (error: any) {
    errorMessage.value = error?.message || "Unable to update the password."
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <DataPanel
      title="Reset password"
      eyebrow="Recovery"
      description="Open the recovery email link first. Once the recovery session is active, you can choose a new password here."
    >
      <div class="form-grid">
        <AppAlert v-if="errorMessage" variant="destructive">{{ errorMessage }}</AppAlert>
        <AppAlert v-else-if="infoMessage" variant="info">{{ infoMessage }}</AppAlert>

        <div class="field-row">
          <label for="new-password">New password</label>
          <Input
            id="new-password"
            v-model="newPassword"

            type="password"
            autocomplete="new-password"
          />
        </div>

        <div class="field-row">
          <label for="confirm-password">Confirm password</label>
          <Input
            id="confirm-password"
            v-model="confirmPassword"

            type="password"
            autocomplete="new-password"
          />
        </div>

        <div class="flex flex-wrap gap-2">
          <Button :disabled="!isHydrated || isSubmitting || !hasRecoverySession" @click="resetPassword">
            {{ isSubmitting ? "Updating password..." : "Save new password" }}
          </Button>
        </div>
      </div>
    </DataPanel>
  </div>
</template>
