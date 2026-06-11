<script setup lang="ts">
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-vue-next"
import { useAuthLightTheme } from "~/composables/useAuthLightTheme"
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

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value
}

function normalizeReturnPath(value: unknown) {
  const normalized = String(firstQueryValue(value) ?? "").trim()

  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//") || normalized.includes("\\")) {
    return ""
  }

  if (normalized.startsWith("/auth/") || normalized === "/login") {
    return ""
  }

  return normalized
}

function callbackDestination(context: Awaited<ReturnType<typeof refreshViewerContext>>) {
  const requestedPath = normalizeReturnPath(route.query.next)
  const role = context.profile?.role

  if (role === "admin" && requestedPath.startsWith("/admin")) {
    return requestedPath
  }

  if (role === "artist" && requestedPath.startsWith("/dashboard")) {
    return requestedPath
  }

  return destinationForViewer(context)
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
  await navigateTo(callbackDestination(context), { replace: true })
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
  --auth-bg: var(--platinum-canvas, #f1ede4);
  --auth-cream: var(--platinum-card, #faf6ee);
  --auth-cream-soft: var(--platinum-accent, #eadfcd);
  --auth-field: var(--surface-glass, #f7f1e6);
  --auth-ink: #181713;
  --auth-muted: #625d52;
  --auth-line: rgba(75, 60, 39, 0.18);
  --auth-gold: var(--priority, #8a6a28);
  --auth-gold-hover: var(--priority-hover, #b08d3a);
  --auth-shadow: var(--surface-card-shadow, 0 22px 54px -42px rgb(75 60 39 / 42%));

  display: grid;
  min-height: 100svh;
  place-items: center;
  padding: clamp(22px, 5vh, 56px) clamp(16px, 4vw, 28px);
  background:
    linear-gradient(180deg, var(--surface-glass-strong, #fbf6ee) 0%, var(--auth-bg) 54%, var(--surface-muted, #e5dccd) 100%);
  color-scheme: only light;
  font-family: var(--font-app-sans);
  forced-color-adjust: none;
}

.callback-shell {
  width: min(100%, 560px);
  overflow: hidden;
  border: 1px solid var(--auth-line);
  border-radius: var(--surface-radius-card, 16px);
  background:
    linear-gradient(180deg, var(--auth-cream) 0%, var(--auth-cream-soft) 100%),
    var(--auth-cream);
  color-scheme: only light;
  forced-color-adjust: none;
  box-shadow: var(--auth-shadow);
}

.callback-header {
  position: relative;
  padding: 28px 28px 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--auth-line) 82%, transparent);
  background: transparent;
}

.callback-header::before {
  position: absolute;
  inset: 0 24px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, white 78%, transparent), color-mix(in srgb, var(--auth-gold) 18%, transparent), transparent);
  content: "";
}

.callback-shell.is-error .callback-header {
  border-bottom-color: color-mix(in srgb, var(--destructive) 22%, var(--auth-line));
}

.callback-eyebrow {
  margin: 0;
  color: color-mix(in srgb, var(--auth-muted) 82%, var(--auth-gold));
  font-size: var(--text-caption-size, 12px);
  font-weight: var(--text-caption-weight, 600);
  letter-spacing: 0;
  line-height: var(--text-caption-line-height, 1.35);
  text-transform: uppercase;
}

.callback-title {
  margin: 10px 0 0;
  color: var(--auth-ink);
  font-family: var(--font-app-display);
  font-size: clamp(30px, 5vw, 36px);
  font-weight: var(--text-page-title-weight, 760);
  letter-spacing: 0;
  line-height: 1.02;
}

.callback-copy {
  max-width: 430px;
  margin: 12px 0 0;
  color: var(--auth-muted);
  font-size: var(--text-body-size, 15px);
  line-height: 1.55;
}

.callback-body {
  display: grid;
  gap: 18px;
  background: transparent;
  padding: 26px 28px 28px;
  color: var(--auth-ink);
}

.callback-status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--auth-line);
  border-radius: var(--surface-radius-control, 12px);
  background: var(--auth-field);
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
  --premium-button-gold-start: var(--auth-gold-hover);
  --premium-button-gold-end: var(--auth-gold);

  width: fit-content;
  gap: 8px;
  min-height: 44px;
  border-color: color-mix(in srgb, var(--auth-gold) 76%, var(--auth-ink) 12%) !important;
  border-radius: var(--surface-radius-control, 12px);
  background: linear-gradient(180deg, var(--auth-gold-hover), var(--auth-gold)) !important;
  color: var(--priority-foreground, #fff8e6) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 38%),
    0 18px 30px -24px color-mix(in srgb, var(--auth-gold) 42%, transparent);
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
