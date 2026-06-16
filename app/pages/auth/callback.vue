<script setup lang="ts">
import { ArrowLeft, Loader2, ShieldAlert } from "lucide-vue-next"
import { useAuthDarkTheme } from "~/composables/useAuthLightTheme"
import { destinationForViewer } from "~/utils/auth-routing"

definePageMeta({
  layout: "default",
})

useAuthDarkTheme()

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
  --background: #0a0a0a;
  --foreground: #f2f3ea;
  --card: #161615;
  --muted: #1e1e1c;
  --muted-foreground: #9a9b92;
  --cb-gold: var(--priority, #e8c028);
  --cb-gold-hover: var(--priority-hover, #f0d028);
  --cb-stroke: color-mix(in srgb, rgb(242 243 234 / 10%) 84%, var(--foreground) 10%);
  --cb-field:
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

.callback-shell {
  width: min(100%, 480px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--cb-stroke) 88%, transparent);
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

.callback-header {
  position: relative;
  padding: 28px 28px 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--cb-stroke) 82%, transparent);
  background: transparent;
}

.callback-header::before {
  position: absolute;
  inset: 0 24px auto;
  height: 1px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, white 14%, transparent), color-mix(in srgb, var(--cb-gold) 22%, transparent), transparent);
  content: "";
}

.callback-shell.is-error .callback-header::before {
  background: linear-gradient(90deg, transparent, color-mix(in srgb, #f87171 30%, transparent), transparent);
}

.callback-eyebrow {
  margin: 0;
  color: color-mix(in srgb, var(--cb-gold) 86%, var(--foreground));
  font-size: var(--text-caption-size, 12px);
  font-weight: var(--text-caption-weight, 600);
  letter-spacing: 0.04em;
  line-height: var(--text-caption-line-height, 1.35);
  text-transform: uppercase;
}

.callback-title {
  margin: 10px 0 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: clamp(28px, 5vw, 34px);
  font-weight: var(--text-page-title-weight, 760);
  letter-spacing: 0;
  line-height: 1.04;
}

.callback-copy {
  max-width: 430px;
  margin: 12px 0 0;
  color: var(--muted-foreground);
  font-size: var(--text-body-size, 15px);
  line-height: 1.55;
}

.callback-body {
  display: grid;
  gap: 18px;
  background: transparent;
  padding: 26px 28px 28px;
  color: var(--foreground);
}

.callback-status {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border: 1px solid var(--cb-stroke);
  border-radius: var(--surface-radius-control, 12px);
  background: var(--cb-field);
  color: var(--muted-foreground);
  padding: 15px;
}

.callback-status.is-error {
  border-color: rgb(248 113 113 / 34%);
  background: color-mix(in srgb, #f87171 9%, var(--card));
  color: #fca5a5;
}

.callback-status strong,
.callback-status span {
  display: block;
}

.callback-status strong {
  color: var(--foreground);
  font-size: 14px;
  line-height: 1.35;
}

.callback-status.is-error strong {
  color: #fca5a5;
}

.callback-status span {
  margin-top: 3px;
  font-size: 13px;
  line-height: 1.5;
}

.callback-spinner {
  animation: callback-spin 900ms linear infinite;
  color: var(--cb-gold);
}

.callback-action {
  width: fit-content;
  gap: 8px;
  min-height: 46px;
  border: 1px solid color-mix(in srgb, var(--cb-gold) 76%, var(--foreground) 12%) !important;
  border-radius: var(--surface-radius-control, 12px);
  background: linear-gradient(180deg, var(--cb-gold-hover), var(--cb-gold)) !important;
  color: #181713 !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 36%),
    0 18px 30px -24px color-mix(in srgb, var(--cb-gold) 42%, transparent);
}

.callback-action:hover:not(:disabled),
.callback-action:focus-visible:not(:disabled) {
  border-color: color-mix(in srgb, var(--cb-gold-hover) 84%, var(--foreground) 10%) !important;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 42%),
    0 0 0 3px color-mix(in srgb, var(--cb-gold) 16%, transparent),
    0 22px 44px -34px color-mix(in srgb, var(--cb-gold) 58%, transparent);
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
