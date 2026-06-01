<script setup lang="ts">
import { KeyRound } from "lucide-vue-next"
import { destinationForViewer } from "~/utils/auth-routing"

definePageMeta({
  layout: "default",
})

useAuthLightTheme()

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
const recoveryStatusText = computed(() => {
  if (errorMessage.value) {
    if (/password|characters|confirmation|match|email first/i.test(errorMessage.value)) {
      return errorMessage.value
    }

    if (/expired|invalid|token|otp|link|session|access_token|refresh_token/i.test(errorMessage.value)) {
      return "This reset link is expired or invalid. Request a new password reset email."
    }

    return "We could not update your password. Please try again."
  }

  if (infoMessage.value) {
    return "Recovery verified"
  }

  if (verifyingRecoveryToken.value) {
    return "Verifying link"
  }

  return "Open your email reset link"
})
const canSubmit = computed(() => isHydrated.value && !isSubmitting.value && hasRecoverySession.value)

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
  <div class="recovery-page">
    <section class="recovery-shell" aria-labelledby="reset-password-title">
      <header class="recovery-header">
        <p class="recovery-eyebrow">Recovery</p>
        <h1 id="reset-password-title" class="recovery-title">Reset password</h1>
        <p class="recovery-copy">Choose a new password once the secure recovery link is verified.</p>
      </header>

      <form class="recovery-form" @submit.prevent="resetPassword">
        <div
          class="recovery-status"
          :class="{
            'is-error': errorMessage,
            'is-ready': hasRecoverySession && !errorMessage,
          }"
        >
          <span class="recovery-status-dot" aria-hidden="true" />
          <span>{{ recoveryStatusText }}</span>
        </div>

        <div class="recovery-fields">
          <label class="recovery-field" for="new-password">
            <span>New password</span>
            <Input
              id="new-password"
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              :disabled="!hasRecoverySession || isSubmitting"
            />
          </label>

          <label class="recovery-field" for="confirm-password">
            <span>Confirm password</span>
            <Input
              id="confirm-password"
              v-model="confirmPassword"
              type="password"
              autocomplete="new-password"
              :disabled="!hasRecoverySession || isSubmitting"
            />
          </label>
        </div>

        <Button class="recovery-submit" type="submit" :disabled="!canSubmit">
          <KeyRound class="size-4" aria-hidden="true" />
          <span>{{ isSubmitting ? "Saving..." : "Save password" }}</span>
        </Button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.recovery-page {
  --auth-bg: #f4efe4;
  --auth-cream: #fffaf0;
  --auth-cream-soft: #fbf4e8;
  --auth-ink: #0b0a08;
  --auth-muted: #675d4c;
  --auth-line: #ded1ba;
  --auth-obsidian: #050504;
  --auth-obsidian-2: #11100d;
  --auth-gold: #caa11f;

  display: grid;
  min-height: calc(100vh - 72px);
  place-items: start center;
  padding: clamp(32px, 6vh, 72px) 0 56px;
  background: var(--auth-bg);
  color-scheme: only light;
  font-family: var(--font-app-sans);
  forced-color-adjust: none;
}

.recovery-shell {
  width: min(100%, 560px);
  overflow: hidden;
  border: 1px solid var(--auth-line);
  border-radius: 8px;
  background: var(--auth-cream);
  color-scheme: only light;
  forced-color-adjust: none;
  box-shadow: 0 30px 80px -62px rgb(11 10 8 / 72%);
}

.recovery-header {
  padding: 30px 28px;
  border-top: 3px solid var(--auth-gold);
  border-bottom: 1px solid color-mix(in srgb, var(--auth-gold) 22%, transparent);
  background:
    radial-gradient(circle at 94% 6%, rgb(255 214 74 / 12%), transparent 24%),
    linear-gradient(135deg, var(--auth-obsidian) 0%, #080808 54%, var(--auth-obsidian-2) 100%);
}

.recovery-eyebrow {
  margin: 0;
  color: #f0c836;
  font-size: 11px;
  font-weight: 780;
  letter-spacing: 0.16em;
  line-height: 1;
  text-transform: uppercase;
}

.recovery-title {
  margin: 12px 0 0;
  color: #fff8e6;
  font-size: clamp(32px, 5vw, 44px);
  font-weight: 820;
  letter-spacing: 0;
  line-height: 1.02;
}

.recovery-copy {
  max-width: 420px;
  margin: 14px 0 0;
  color: #c8bdab;
  font-size: 14px;
  line-height: 1.55;
}

.recovery-form {
  display: grid;
  gap: 18px;
  background: var(--auth-cream);
  padding: 24px 28px 28px;
  color: var(--auth-ink);
}

.recovery-status {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--auth-line);
  border-radius: 999px;
  background: var(--auth-cream-soft);
  color: var(--auth-muted);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
  padding: 9px 12px;
}

.recovery-status.is-ready {
  border-color: rgb(16 185 129 / 28%);
  color: #087a55;
}

.recovery-status.is-error {
  border-color: rgb(239 68 68 / 28%);
  color: #b42318;
}

.recovery-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: currentColor;
  flex: 0 0 auto;
}

.recovery-fields {
  display: grid;
  gap: 14px;
}

.recovery-field {
  display: grid;
  gap: 8px;
  color: var(--auth-ink);
  font-size: 13px;
  font-weight: 680;
}

.recovery-field :deep(input) {
  height: 48px;
  border-color: var(--auth-line);
  border-radius: 8px;
  background: #fffdf7;
  color: var(--auth-ink) !important;
  -webkit-text-fill-color: var(--auth-ink);
}

.recovery-field :deep(input:disabled) {
  background: #f8f1e6;
  color: #8f8472;
  -webkit-text-fill-color: #8f8472;
  opacity: 1;
}

.recovery-submit {
  --premium-button-foreground: #fff8e6;
  --premium-button-gold-start: #bd9226;
  --premium-button-gold-end: #967017;

  width: 100%;
  height: 48px;
  gap: 9px;
  border: 1px solid #8a650f !important;
  border-radius: 8px;
  background: linear-gradient(#bd9226, #967017) !important;
  color: #fff8e6 !important;
  font-weight: 600;
  box-shadow:
    inset 0 1px 0 rgb(255 240 168 / 68%),
    0 2px 0 #6d4d08;
}

.recovery-submit:disabled {
  opacity: 0.68 !important;
}

.recovery-submit :deep(*) {
  color: inherit !important;
  -webkit-text-fill-color: currentColor;
}

@media (max-width: 640px) {
  .recovery-page {
    padding-top: 22px;
  }

  .recovery-header,
  .recovery-form {
    padding-inline: 22px;
  }
}
</style>
