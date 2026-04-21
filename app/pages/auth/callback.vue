<script setup lang="ts">
import { destinationForViewer } from "~/utils/auth-routing"

definePageMeta({
  layout: "default",
})

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
          "The OAuth callback returned, but the authenticated session was not established. Try the Google sign-in again in the same browser window.",
        )
      }

      return
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
      error?.data?.statusMessage || error?.message || "Unable to complete the sign-in callback."
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
  <div class="page">
    <SectionCard
      title="Completing sign-in"
      eyebrow="Auth callback"
      description="OAuth returns here before we send the user to the correct panel."
    >
      <div v-if="callbackError || runtimeError" class="banner error">{{ callbackError || runtimeError }}</div>
      <div v-if="callbackError || runtimeError" class="button-row">
        <NuxtLink to="/login" class="button button-secondary">Back to login</NuxtLink>
      </div>
      <p v-else class="status-message">Waiting for session confirmation and role-aware redirect...</p>
    </SectionCard>
  </div>
</template>
