<script setup lang="ts">
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-vue-next"
import { destinationForViewer } from "~/utils/auth-routing"

definePageMeta({
  layout: "default",
})

useAuthLightTheme()

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const session = useSupabaseSession()
const { clearViewerContext, refreshViewerContext, resolveAuthUserId } = useViewerContext()
const runtimeError = ref("")
const isHandlingCallback = ref(false)
const hasCompletedRedirect = ref(false)
const callbackAttempts = ref(0)

const callbackError = computed(() => {
  if (typeof route.query.error_description === "string") {
    return route.query.error_description
  }

  if (typeof route.query.error === "string") {
    return route.query.error
  }

  return ""
})
const authCallbackMessage = computed(() => callbackError.value || runtimeError.value)
const isSignupDisabled = computed(() => /signups? not allowed/i.test(authCallbackMessage.value))
const isInviteRejection = computed(() => /invited|invite|gmail accounts/i.test(authCallbackMessage.value))
const isMissingSession = computed(() => /auth session missing|no sign-in session/i.test(authCallbackMessage.value))
const callbackView = computed(() => {
  if (!authCallbackMessage.value) {
    return {
      eyebrow: "Sign-in",
      title: "Completing sign-in",
      description: "Confirming access before opening the dashboard.",
      statusTitle: "Checking access",
      statusText: callbackAttempts.value > 1 ? "Still checking this sign-in." : "This usually takes a moment.",
      tone: "pending",
    }
  }

  if (isSignupDisabled.value) {
    return {
      eyebrow: "Invite access",
      title: "Invite setup needed",
      description: "This invite cannot be completed right now.",
      statusTitle: "Access is not ready",
      statusText: "Please contact Naad Backstage support.",
      tone: "error",
    }
  }

  if (isInviteRejection.value) {
    return {
      eyebrow: "Invite required",
      title: "Access not found",
      description: "This Google account is not connected to an active Naad Backstage invite.",
      statusTitle: "Use the invited Gmail",
      statusText: "Return to login and choose the Gmail address that received the invite.",
      tone: "error",
    }
  }

  if (isMissingSession.value) {
    return {
      eyebrow: "Sign-in",
      title: "Link expired",
      description: "This sign-in link is no longer active.",
      statusTitle: "Start again",
      statusText: "Return to login and choose the invited Gmail account.",
      tone: "error",
    }
  }

  return {
    eyebrow: "Sign-in",
    title: "Unable to continue",
    description: "The sign-in request could not be completed.",
    statusTitle: "Sign-in stopped",
    statusText: "Return to login and try again with the invited Gmail address.",
    tone: "error",
  }
})

function hasCallbackCode() {
  return typeof route.query.code === "string" && !!route.query.code
}

async function waitFor(delayMs: number) {
  await new Promise((resolve) => window.setTimeout(resolve, delayMs))
}

async function completeRedirect(userId: string) {
  if (hasCompletedRedirect.value) {
    return
  }

  await $fetch("/api/auth/login-complete", { method: "POST" })
  const context = await refreshViewerContext(true, userId)

  if (!context.profile) {
    throw new Error("This account does not have an application profile yet.")
  }

  hasCompletedRedirect.value = true
  await navigateTo(destinationForViewer(context), { replace: true })
}

async function handleCallbackFlow() {
  if (isHandlingCallback.value || callbackError.value || runtimeError.value || hasCompletedRedirect.value) {
    return
  }

  isHandlingCallback.value = true

  try {
    let activeUserId = await resolveAuthUserId()

    if (!activeUserId && hasCallbackCode()) {
      for (const delayMs of [150, 300, 600, 1000, 1500]) {
        callbackAttempts.value += 1
        await waitFor(delayMs)
        activeUserId = await resolveAuthUserId()

        if (activeUserId) {
          break
        }
      }
    }

    if (!activeUserId) {
      if (hasCallbackCode()) {
        throw new Error(
          "The sign-in could not be completed. Try again in the same browser window.",
        )
      }

      throw new Error("No sign-in was found. Return to login and start again.")
    }

    await completeRedirect(activeUserId)
  } catch (error: any) {
    if (error?.data?.statusCode === 403) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Even if sign-out fails, keep the rejection visible on the callback page.
      }

      clearViewerContext()
    }

    runtimeError.value =
      error?.data?.statusMessage || error?.message || "Unable to complete sign-in."
  } finally {
    isHandlingCallback.value = false
  }
}

onMounted(() => {
  void handleCallbackFlow()
})

watch(
  () => [session.value?.access_token, user.value?.sub, user.value?.id],
  ([accessToken, userSub, userId]) => {
    if (!accessToken && !userSub && !userId) {
      return
    }

    void handleCallbackFlow()
  },
  { immediate: true },
)
</script>

<template>
  <div class="callback-page">
    <section
      class="callback-shell"
      :class="{ 'is-error': callbackView.tone === 'error' }"
      aria-labelledby="callback-title"
    >
      <header class="callback-header">
        <p class="callback-eyebrow">{{ callbackView.eyebrow }}</p>
        <h1 id="callback-title" class="callback-title">{{ callbackView.title }}</h1>
        <p class="callback-copy">{{ callbackView.description }}</p>
      </header>

      <div class="callback-body">
        <div class="callback-status" :class="{ 'is-error': callbackView.tone === 'error' }">
          <ShieldAlert v-if="callbackView.tone === 'error'" class="size-5" aria-hidden="true" />
          <Loader2 v-else class="size-5 callback-spinner" aria-hidden="true" />
          <div>
            <strong>{{ callbackView.statusTitle }}</strong>
            <span>{{ callbackView.statusText }}</span>
          </div>
        </div>

        <Button v-if="callbackView.tone === 'error'" variant="secondary" as-child class="callback-action">
          <NuxtLink to="/login">
            <ArrowLeft class="size-4" aria-hidden="true" />
            <span>Back to login</span>
          </NuxtLink>
        </Button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.callback-page {
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

.callback-shell {
  width: min(100%, 560px);
  overflow: hidden;
  border: 1px solid var(--auth-line);
  border-radius: 8px;
  background: var(--auth-cream);
  color-scheme: only light;
  forced-color-adjust: none;
  box-shadow: 0 30px 80px -62px rgb(11 10 8 / 72%);
}

.callback-header {
  padding: 30px 28px;
  border-top: 3px solid var(--auth-gold);
  border-bottom: 1px solid color-mix(in srgb, var(--auth-gold) 22%, transparent);
  background:
    radial-gradient(circle at 94% 6%, rgb(255 214 74 / 12%), transparent 24%),
    linear-gradient(135deg, var(--auth-obsidian) 0%, #080808 54%, var(--auth-obsidian-2) 100%);
}

.callback-shell.is-error .callback-header {
  border-top-color: #0a0a0a;
}

.callback-eyebrow {
  margin: 0;
  color: #f0c836;
  font-size: 11px;
  font-weight: 780;
  letter-spacing: 0.16em;
  line-height: 1;
  text-transform: uppercase;
}

.callback-title {
  margin: 12px 0 0;
  color: #fff8e6;
  font-size: clamp(32px, 5vw, 44px);
  font-weight: 820;
  letter-spacing: 0;
  line-height: 1.02;
}

.callback-copy {
  max-width: 430px;
  margin: 14px 0 0;
  color: #c8bdab;
  font-size: 14px;
  line-height: 1.55;
}

.callback-body {
  display: grid;
  gap: 18px;
  background: var(--auth-cream);
  padding: 26px 28px 28px;
  color: var(--auth-ink);
}

.callback-status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--auth-line);
  border-radius: 8px;
  background: var(--auth-cream-soft);
  color: var(--auth-muted);
  padding: 15px;
}

.callback-status.is-error {
  border-color: rgb(239 68 68 / 28%);
  color: #b42318;
}

.callback-status strong,
.callback-status span {
  display: block;
}

.callback-status strong {
  color: var(--auth-ink);
  font-size: 14px;
  line-height: 1.35;
}

.callback-status span {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
}

.callback-spinner {
  animation: callback-spin 900ms linear infinite;
}

.callback-action {
  --premium-button-foreground: #fff8e6;
  --premium-button-gold-start: #bd9226;
  --premium-button-gold-end: #967017;

  width: fit-content;
  gap: 8px;
  border-color: #8a650f !important;
  border-radius: 8px;
  background: linear-gradient(#bd9226, #967017) !important;
  color: #fff8e6 !important;
  box-shadow:
    inset 0 1px 0 rgb(255 240 168 / 68%),
    0 2px 0 #6d4d08;
}

.callback-action :deep(*) {
  color: inherit !important;
  -webkit-text-fill-color: currentColor;
}

@keyframes callback-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .callback-page {
    padding-top: 22px;
  }

  .callback-header,
  .callback-body {
    padding-inline: 22px;
  }

  .callback-action {
    width: 100%;
  }
}
</style>
