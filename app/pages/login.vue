<script setup lang="ts">
import { destinationForViewer } from "~/utils/auth-routing"

interface SetupStatus {
  schemaReady: boolean
  profileCount: number
  adminCount: number
  needsBootstrap: boolean
}

definePageMeta({
  layout: "default",
})

const email = ref("")
const password = ref("")
const isSubmitting = ref(false)
const isSendingReset = ref(false)
const errorMessage = ref("")
const resetMessage = ref("")
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const runtimeConfig = useRuntimeConfig()
const { refreshViewerContext, resolveAuthUserId } = useViewerContext()
const { data: setupStatus, error: setupStatusError } = await useFetch<SetupStatus>("/api/setup/status")

const checklist = [
  "Single login page for both admins and artists",
  "Email/password plus Google OAuth on the same account",
  "Role-based redirect after session creation",
  "Session expiry enforced in route middleware",
]

watch(
  () => user.value?.id,
  async (userId) => {
    if (!userId || isSubmitting.value) {
      return
    }

    const context = await refreshViewerContext(true, userId)

    if (!context.profile) {
      return
    }

    await navigateTo(destinationForViewer(context), { replace: true })
  },
  { immediate: true },
)

async function completeLogin(userId: string) {
  await $fetch("/api/auth/login-complete", { method: "POST" })
  const context = await refreshViewerContext(true, userId)

  if (!context.profile) {
    throw new Error("This account does not have an application profile yet.")
  }

  await navigateTo(destinationForViewer(context), { replace: true })
}

async function signInWithPassword() {
  isSubmitting.value = true
  errorMessage.value = ""
  resetMessage.value = ""

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    })

    if (error) {
      errorMessage.value = error.message
      return
    }

    const activeUserId = data.user?.id ?? (await resolveAuthUserId())

    if (!activeUserId) {
      throw new Error("Sign-in completed, but the authenticated user could not be resolved.")
    }

    await completeLogin(activeUserId)
  } catch (error: any) {
    errorMessage.value =
      error?.data?.statusMessage || error?.message || "Unable to complete sign-in for this account."
  } finally {
    isSubmitting.value = false
  }
}

async function sendPasswordReset() {
  const normalizedEmail = email.value.trim()
  resetMessage.value = ""
  errorMessage.value = ""

  if (!normalizedEmail) {
    errorMessage.value = "Enter your login email before requesting a password reset."
    return
  }

  isSendingReset.value = true

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${runtimeConfig.public.siteUrl}/auth/reset-password`,
    })

    if (error) {
      throw new Error(error.message)
    }

    resetMessage.value = "Password reset email sent. Open the recovery link to choose a new password."
  } catch (error: any) {
    errorMessage.value = error?.message || "Unable to send a password reset email."
  } finally {
    isSendingReset.value = false
  }
}

async function signInWithGoogle() {
  isSubmitting.value = true
  errorMessage.value = ""
  resetMessage.value = ""

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${runtimeConfig.public.siteUrl}/auth/callback`,
    },
  })

  if (error) {
    errorMessage.value = error.message
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="split-grid">
      <SectionCard
        title="Log in to Naad Backstage"
        eyebrow="Access"
        description="Use the shared login surface for admins and artists. Routing happens after we resolve your role and active session."
      >
        <div class="form-grid">
          <div v-if="setupStatusError" class="banner error">
            {{ setupStatusError.statusMessage || "Unable to load setup status." }}
          </div>

          <div v-else-if="setupStatus && !setupStatus.schemaReady" class="banner error">
            Database setup is not complete yet. Apply the Supabase migrations, then refresh this page.
          </div>

          <div v-else-if="setupStatus?.needsBootstrap" class="banner">
            No admin exists yet. Use the setup screen first.
            <NuxtLink to="/setup" class="button button-secondary">Open setup</NuxtLink>
          </div>

          <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
          <div v-if="resetMessage" class="banner">{{ resetMessage }}</div>

          <div class="field-row">
            <label for="email">Email</label>
            <input id="email" v-model="email" class="input" type="email" autocomplete="email" />
          </div>

          <div class="field-row">
            <label for="password">Password</label>
            <input
              id="password"
              v-model="password"
              class="input"
              type="password"
              autocomplete="current-password"
            />
          </div>

          <div class="button-row">
            <button class="button" :disabled="isSubmitting" @click="signInWithPassword">
              {{ isSubmitting ? "Signing in..." : "Sign in with password" }}
            </button>
            <button class="button button-secondary" :disabled="isSubmitting" @click="signInWithGoogle">
              Continue with Google
            </button>
          </div>

          <div class="button-row">
            <button
              class="button button-secondary"
              :disabled="isSendingReset || isSubmitting"
              @click="sendPasswordReset"
            >
              {{ isSendingReset ? "Sending reset..." : "Forgot password?" }}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Auth rules already in code"
        eyebrow="Guardrails"
        description="This matches the planning docs so the login surface does not drift from the product rules."
      >
        <ul class="list">
          <li v-for="item in checklist" :key="item">{{ item }}</li>
        </ul>
      </SectionCard>
    </div>
  </div>
</template>
