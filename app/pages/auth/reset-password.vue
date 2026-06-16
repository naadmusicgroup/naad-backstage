<script setup lang="ts">
import { KeyRound } from "lucide-vue-next"
import { useAuthDarkTheme } from "~/composables/useAuthLightTheme"
import { destinationForViewer } from "~/utils/auth-routing"

definePageMeta({
  layout: "default",
})

useAuthDarkTheme()

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
  --background: #0a0a0a;
  --foreground: #f2f3ea;
  --card: #161615;
  --muted: #1e1e1c;
  --muted-foreground: #9a9b92;
  --rcv-gold: var(--priority, #e8c028);
  --rcv-gold-hover: var(--priority-hover, #f0d028);
  --rcv-stroke: color-mix(in srgb, rgb(242 243 234 / 10%) 84%, var(--foreground) 10%);
  --rcv-field:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 86%, black 14%), color-mix(in srgb, var(--muted) 24%, var(--card))),
    var(--card);

  display: grid;
  min-height: 100svh;
  place-items: center;
  padding: clamp(22px, 5vh, 56px) clamp(16px, 4vw, 28px);
  background:
    radial-gradient(72% 48% at 50% 0%, color-mix(in srgb, var(--card) 42%, transparent), transparent 68%),
    linear-gradient(180deg, color-mix(in srgb, var(--background) 94%, var(--card) 6%) 0%, var(--background) 100%);
  color-scheme: only dark;
  font-family: var(--font-app-sans);
  forced-color-adjust: none;
}

.recovery-shell {
  width: min(100%, 480px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--rcv-stroke) 88%, transparent);
  border-radius: var(--surface-radius-card, 16px);
  background: linear-gradient(
    155deg,
    color-mix(in srgb, var(--card) 94%, var(--foreground) 4%) 0%,
    var(--card) 60%,
    color-mix(in srgb, var(--card) 88%, black 12%) 100%
  );
  forced-color-adjust: none;
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent),
    0 28px 64px -42px rgb(0 0 0 / 90%),
    0 0 44px -10px rgb(216 173 37 / 12%);
}

.recovery-header {
  position: relative;
  padding: 28px 28px 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--rcv-stroke) 82%, transparent);
  background: transparent;
}

.recovery-header::before {
  position: absolute;
  inset: 0 24px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, white 14%, transparent), color-mix(in srgb, var(--rcv-gold) 22%, transparent), transparent);
  content: "";
}

.recovery-eyebrow {
  margin: 0;
  color: color-mix(in srgb, var(--rcv-gold) 86%, var(--foreground));
  font-size: var(--text-caption-size, 12px);
  font-weight: var(--text-caption-weight, 600);
  letter-spacing: 0.04em;
  line-height: var(--text-caption-line-height, 1.35);
  text-transform: uppercase;
}

.recovery-title {
  margin: 10px 0 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: clamp(28px, 5vw, 34px);
  font-weight: var(--text-page-title-weight, 760);
  letter-spacing: 0;
  line-height: 1.04;
}

.recovery-copy {
  max-width: 420px;
  margin: 12px 0 0;
  color: var(--muted-foreground);
  font-size: var(--text-body-size, 15px);
  line-height: 1.55;
}

.recovery-form {
  display: grid;
  gap: 18px;
  background: transparent;
  padding: 24px 28px 28px;
  color: var(--foreground);
}

.recovery-status {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  gap: 9px;
  border: 1px solid var(--rcv-stroke);
  border-radius: 999px;
  background: var(--rcv-field);
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.3;
  padding: 9px 13px;
}

.recovery-status.is-ready {
  border-color: rgb(52 211 153 / 32%);
  background: color-mix(in srgb, #34d399 10%, var(--card));
  color: #4ade9c;
}

.recovery-status.is-error {
  border-color: rgb(248 113 113 / 34%);
  background: color-mix(in srgb, #f87171 10%, var(--card));
  color: #fca5a5;
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
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
}

.recovery-field :deep(input) {
  height: 48px;
  width: 100%;
  border: 1px solid var(--rcv-stroke);
  border-radius: var(--surface-radius-control, 12px);
  background: var(--rcv-field);
  color: var(--foreground) !important;
  -webkit-text-fill-color: var(--foreground);
  padding: 0 14px;
  caret-color: var(--rcv-gold);
  box-shadow:
    inset 3px 3px 8px rgb(0 0 0 / 42%),
    inset -3px -3px 8px rgb(244 238 223 / 3%);
  transition:
    border-color 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.recovery-field :deep(input::placeholder) {
  color: color-mix(in srgb, var(--muted-foreground) 80%, transparent);
}

.recovery-field :deep(input:focus-visible) {
  outline: none;
  border-color: color-mix(in srgb, var(--rcv-gold) 74%, var(--foreground) 10%);
  box-shadow:
    inset 3px 3px 8px rgb(0 0 0 / 42%),
    0 0 0 3px color-mix(in srgb, var(--rcv-gold) 14%, transparent);
}

.recovery-field :deep(input:disabled) {
  opacity: 0.55;
}

.recovery-submit {
  width: 100%;
  height: 48px;
  gap: 9px;
  border: 1px solid color-mix(in srgb, var(--rcv-gold) 76%, var(--foreground) 12%) !important;
  border-radius: var(--surface-radius-control, 12px);
  background: linear-gradient(180deg, var(--rcv-gold-hover), var(--rcv-gold)) !important;
  color: #181713 !important;
  font-weight: var(--text-button-weight, 650);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 36%),
    0 18px 36px -30px color-mix(in srgb, var(--rcv-gold) 52%, transparent);
}

.recovery-submit:hover:not(:disabled),
.recovery-submit:focus-visible:not(:disabled) {
  border-color: color-mix(in srgb, var(--rcv-gold-hover) 84%, var(--foreground) 10%) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 42%),
    0 0 0 3px color-mix(in srgb, var(--rcv-gold) 16%, transparent),
    0 22px 44px -34px color-mix(in srgb, var(--rcv-gold) 58%, transparent);
}

.recovery-submit:disabled {
  opacity: 0.6 !important;
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
