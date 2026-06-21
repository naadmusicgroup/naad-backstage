<script setup lang="ts">
import { KeyRound } from "lucide-vue-next"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import ShaderAnimation from "@/components/ShaderAnimation.vue"
import AppTooltip from "~/components/AppTooltip.vue"
import { useAuthDarkTheme } from "~/composables/useAuthLightTheme"
import { destinationForViewer } from "~/utils/auth-routing"

definePageMeta({
  layout: "default",
})
useAuthDarkTheme()

const email = ref("")
const password = ref("")
const isSubmitting = ref(false)
const isSendingReset = ref(false)
const isHydrated = ref(false)
const isPasswordVisible = ref(false)
const isPasswordTyping = ref(false)
const focusedField = ref<"email" | "password" | "">("")
type AuthAnimationState = "idle" | "checking" | "approved" | "denied"
const authAnimationState = ref<AuthAnimationState>("idle")
const errorMessage = ref("")
const resetMessage = ref("")
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const { refreshViewerContext, resolveAuthUserId } = useViewerContext()
const passwordInputType = computed(() => (isPasswordVisible.value ? "text" : "password"))
const passwordToggleLabel = computed(() => (isPasswordVisible.value ? "Hide password" : "Show password"))
const signInButtonLabel = "Sign in"
const brandLogoSources = {
  avif: "/logo-512.avif",
  webp: "/logo-512.webp",
  png: "/logo-512.png",
}
const prefersReducedMotion = ref(false)
const raccoonRoot = ref<SVGSVGElement | null>(null)
const raccoonLift = ref<SVGGElement | null>(null)
const raccoonFloat = ref<SVGGElement | null>(null)
const raccoonCharacter = ref<SVGGElement | null>(null)
const raccoonTail = ref<SVGGElement | null>(null)
const raccoonEyes = ref<SVGGElement | null>(null)
const raccoonPupils = ref<SVGGElement | null>(null)
const raccoonEyelids = ref<SVGGElement | null>(null)
const raccoonPaws = ref<SVGGElement | null>(null)
const raccoonPawCovers = ref<SVGGElement | null>(null)

let gsapApi: any = null
let idleTimeline: any = null
let motionMediaQuery: MediaQueryList | null = null
let passwordGazeTimer: number | null = null
let passwordSurveyTimer: number | null = null
let passwordSurveyTimeline: any = null

onMounted(async () => {
  isHydrated.value = true
  await initializeRaccoonAnimation()
  await startGoogleInviteSignIn()
})

onBeforeUnmount(() => {
  clearPasswordGazeTimer()
  stopRaccoonAnimation()
  if (motionMediaQuery) {
    motionMediaQuery.removeEventListener("change", syncMotionPreference)
    motionMediaQuery = null
  }
})

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

watch([isPasswordVisible, isPasswordTyping, focusedField, authAnimationState, password], () => {
  if (!isPasswordVisible.value || authAnimationState.value !== "idle") {
    clearPasswordGazeTimer()
  } else if (!password.value) {
    clearPasswordGazeTimer()
    isPasswordTyping.value = false
  } else if (isPasswordTyping.value) {
    stopPasswordSurvey()
  }

  playRaccoonState()
})

function clearPasswordSurveyTimer() {
  if (passwordSurveyTimer === null || typeof window === "undefined") {
    return
  }

  window.clearTimeout(passwordSurveyTimer)
  passwordSurveyTimer = null
}

function stopPasswordSurvey() {
  passwordSurveyTimeline?.kill()
  passwordSurveyTimeline = null
}

function clearPasswordGazeTimer() {
  if (passwordGazeTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(passwordGazeTimer)
    passwordGazeTimer = null
  }

  clearPasswordSurveyTimer()
  stopPasswordSurvey()
}

function startPasswordSurvey() {
  if (
    !gsapApi ||
    prefersReducedMotion.value ||
    !raccoonPupils.value ||
    !isPasswordVisible.value ||
    !password.value ||
    isPasswordTyping.value ||
    authAnimationState.value !== "idle"
  ) {
    return
  }

  stopPasswordSurvey()
  gsapApi.killTweensOf(raccoonPupils.value)
  passwordSurveyTimeline = gsapApi.timeline({
    defaults: { ease: "power2.inOut" },
  })
  passwordSurveyTimeline
    .to(raccoonPupils.value, { x: -4.8, y: 1.9, duration: 0.28, ease: "power2.out" })
    .to(raccoonPupils.value, { x: 4.6, y: -2.1, duration: 0.48, ease: "power3.inOut" }, "+=0.16")
}

function holdPasswordGaze() {
  if (!isPasswordVisible.value || typeof window === "undefined") {
    return
  }

  clearPasswordGazeTimer()

  if (!password.value) {
    isPasswordTyping.value = false
    playRaccoonState()
    return
  }

  isPasswordTyping.value = true
  passwordGazeTimer = window.setTimeout(() => {
    isPasswordTyping.value = false
    passwordGazeTimer = null
  }, 400)
  passwordSurveyTimer = window.setTimeout(() => {
    passwordSurveyTimer = null
    startPasswordSurvey()
  }, 3000)
}

function togglePasswordVisibility() {
  isPasswordVisible.value = !isPasswordVisible.value

  if (isPasswordVisible.value) {
    if (password.value) {
      holdPasswordGaze()
    } else {
      clearPasswordGazeTimer()
      isPasswordTyping.value = false
    }
    return
  }

  clearPasswordGazeTimer()
  isPasswordTyping.value = false
}

function handlePasswordTyping() {
  if (focusedField.value !== "password") {
    focusedField.value = "password"
  }

  holdPasswordGaze()
}

function raccoonTweenTargets() {
  return [
    raccoonLift.value,
    raccoonCharacter.value,
    raccoonEyes.value,
    raccoonPupils.value,
    raccoonEyelids.value,
    raccoonPaws.value,
    raccoonPawCovers.value,
  ].filter(Boolean)
}

function stopRaccoonAnimation() {
  stopPasswordSurvey()
  idleTimeline?.kill()
  idleTimeline = null

  if (gsapApi) {
    gsapApi.killTweensOf(raccoonTweenTargets())
    gsapApi.killTweensOf([raccoonFloat.value, raccoonTail.value].filter(Boolean))
  }
}

function clearRaccoonInlineStyles() {
  if (!gsapApi) {
    return
  }

  gsapApi.set(
    [raccoonRoot.value, raccoonFloat.value, raccoonTail.value, ...raccoonTweenTargets()].filter(Boolean),
    { clearProps: "all" },
  )
}

function syncMotionPreference() {
  prefersReducedMotion.value = Boolean(motionMediaQuery?.matches)

  if (prefersReducedMotion.value) {
    stopRaccoonAnimation()
    clearRaccoonInlineStyles()
    return
  }

  void initializeRaccoonAnimation()
}

async function initializeRaccoonAnimation() {
  if (typeof window === "undefined" || !raccoonRoot.value) {
    return
  }

  if (!motionMediaQuery) {
    motionMediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    motionMediaQuery.addEventListener("change", syncMotionPreference)
  }

  prefersReducedMotion.value = motionMediaQuery.matches

  if (prefersReducedMotion.value) {
    return
  }

  if (!gsapApi) {
    const { gsap } = await import("gsap")
    gsapApi = gsap
  }

  stopRaccoonAnimation()

  gsapApi.set(raccoonRoot.value, { autoAlpha: 1 })
  gsapApi.set([...raccoonTweenTargets(), raccoonTail.value].filter(Boolean), {
    transformBox: "fill-box",
    transformOrigin: "50% 50%",
  })
  gsapApi.set(raccoonTail.value, { transformBox: "fill-box", transformOrigin: "14% 74%" })
  gsapApi.set(raccoonFloat.value, { transformOrigin: "50% 78%" })
  playRaccoonState({ immediate: true })

  idleTimeline = gsapApi.timeline({ repeat: -1, defaults: { ease: "sine.inOut" } })
  idleTimeline
    .to(raccoonTail.value, { rotate: 4, duration: 1.12 })
    .to(raccoonTail.value, { rotate: -3, duration: 1.22 })
    .to(raccoonTail.value, { rotate: 2, duration: 1.08 })
    .to(raccoonFloat.value, { y: -1.2, rotate: 0.35, duration: 1.12 }, 0)
    .to(raccoonFloat.value, { y: 0.9, rotate: -0.28, duration: 1.22 }, 1.12)
    .to(raccoonFloat.value, { y: 0, rotate: 0, duration: 0.92 }, 2.34)
}

function playRaccoonState(options: { immediate?: boolean } = {}) {
  if (!gsapApi || prefersReducedMotion.value || !raccoonRoot.value) {
    return
  }

  const isVisible = isPasswordVisible.value
  const isFocused = focusedField.value === "password"
  const isCheckingAccess = authAnimationState.value === "checking"
  const isAccessApproved = authAnimationState.value === "approved"
  const isAccessDenied = authAnimationState.value === "denied"
  const isAuthActive = isCheckingAccess || isAccessApproved || isAccessDenied
  const isPasswordEmpty = !password.value
  const isPasswordLookActive = isVisible && (isPasswordTyping.value || isPasswordEmpty)
  const isPasswordLookAway = isVisible && !isPasswordEmpty && !isPasswordTyping.value && !isAuthActive
  const duration = options.immediate ? 0 : isAuthActive ? 0.52 : isVisible ? 0.64 : 0.42
  const ease = isAccessDenied ? "elastic.out(1, 0.64)" : isAuthActive || isVisible ? "back.out(1.45)" : "power3.out"
  const pupilX = isPasswordLookActive ? -4.8 : isAccessDenied ? -2.8 : isAuthActive ? -4.8 : isPasswordLookAway ? 4.6 : 0
  const pupilY = isPasswordLookActive ? 1.9 : isAccessDenied ? 0.8 : isAuthActive ? 1.9 : isPasswordLookAway ? -2.1 : 0

  gsapApi.killTweensOf(raccoonTweenTargets())
  gsapApi.to(raccoonLift.value, {
    x: isAuthActive ? -34 : isVisible ? -16 : 0,
    y: isAuthActive ? -7 : isVisible ? -3 : isFocused ? -1 : 0,
    duration,
    ease,
  })
  gsapApi.to(raccoonCharacter.value, {
    x: isAuthActive ? -7 : isVisible ? -5 : 0,
    y: isAccessApproved ? -2 : 0,
    rotate: isAccessDenied ? -4 : isAuthActive ? -2 : 0,
    duration,
    ease,
  })
  gsapApi.to(raccoonPaws.value, {
    x: 0,
    y: isAuthActive ? 19 : isVisible ? 15 : isFocused ? -8 : -10,
    rotate: isAccessDenied ? -6 : isAuthActive || isVisible ? -3 : 0,
    duration: options.immediate ? 0 : isAuthActive || isVisible ? 0.52 : 0.28,
    ease: isAuthActive || isVisible ? "back.out(1.8)" : "power3.inOut",
  })
  gsapApi.to(raccoonPawCovers.value, {
    autoAlpha: isAuthActive || isVisible ? 0 : 1,
    x: 0,
    y: isAuthActive || isVisible ? 20 : -12,
    scale: isAuthActive || isVisible ? 0.76 : 1,
    duration: options.immediate ? 0 : 0.24,
    ease: "power2.out",
  })
  gsapApi.to(raccoonEyes.value, {
    autoAlpha: isAuthActive || isVisible ? 1 : 0,
    scaleY: isAuthActive || isVisible ? 1 : 0.16,
    duration: options.immediate ? 0 : 0.18,
    ease: "power2.out",
  })
  gsapApi.to(raccoonEyelids.value, {
    autoAlpha: isAuthActive || isVisible ? 0 : 1,
    scaleY: 1,
    duration: options.immediate ? 0 : 0.18,
    ease: "power2.out",
  })
  gsapApi.to(raccoonPupils.value, {
    autoAlpha: isAuthActive || isVisible ? 1 : 0,
    x: pupilX,
    y: pupilY,
    scale: 1,
    duration: options.immediate ? 0 : isPasswordLookAway ? 0.42 : 0.2,
    ease: isPasswordLookAway ? "power3.inOut" : "power2.out",
  })
}

function waitForAuthAnimation(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, prefersReducedMotion.value ? 80 : ms))
}

async function playDeniedAccessAnimation() {
  authAnimationState.value = "denied"
  await waitForAuthAnimation(780)
  authAnimationState.value = "idle"
}

async function playApprovedAccessAnimation() {
  authAnimationState.value = "approved"
  await waitForAuthAnimation(420)
}

async function completeLogin(userId: string) {
  await $fetch("/api/auth/login-complete", { method: "POST" })
  const context = await refreshViewerContext(true, userId)

  if (!context.profile) {
    throw new Error("This account does not have an application profile yet.")
  }

  await navigateTo(destinationForViewer(context), { replace: true })
}

async function signInWithPassword() {
  if (!isHydrated.value || isSubmitting.value) {
    return
  }

  isSubmitting.value = true
  clearPasswordGazeTimer()
  isPasswordTyping.value = false
  authAnimationState.value = "checking"
  errorMessage.value = ""
  resetMessage.value = ""

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.value.trim(),
      password: password.value,
    })

    if (error) {
      errorMessage.value = error.message
      await playDeniedAccessAnimation()
      return
    }

    const activeUserId = data.user?.id ?? (await resolveAuthUserId())

    if (!activeUserId) {
      throw new Error("Sign-in completed, but the authenticated user could not be resolved.")
    }

    await playApprovedAccessAnimation()
    await completeLogin(activeUserId)
  } catch (error: any) {
    errorMessage.value =
      error?.data?.statusMessage || error?.message || "Unable to complete sign-in for this account."
    await playDeniedAccessAnimation()
  } finally {
    isSubmitting.value = false
    authAnimationState.value = "idle"
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
      redirectTo: `${window.location.origin || runtimeConfig.public.siteUrl}/auth/reset-password`,
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

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : ""
  }

  return typeof value === "string" ? value : ""
}

function googleInviteLoginHint() {
  const hintedEmail = firstQueryValue(route.query.email).trim()

  if (hintedEmail && hintedEmail.includes("@")) {
    return hintedEmail
  }

  return email.value.trim()
}

function shouldAutoStartGoogleInvite() {
  const provider = firstQueryValue(route.query.provider).trim().toLowerCase()
  const google = firstQueryValue(route.query.google).trim().toLowerCase()

  return provider === "google" || google === "1" || google === "true"
}

async function startGoogleInviteSignIn() {
  if (!shouldAutoStartGoogleInvite()) {
    return
  }

  const hintedEmail = firstQueryValue(route.query.email).trim()

  if (hintedEmail) {
    email.value = hintedEmail
  }

  await signInWithGoogle({ loginHint: googleInviteLoginHint() })
}

async function signInWithGoogle(options: { loginHint?: string } = {}) {
  if (!isHydrated.value || isSubmitting.value) {
    return
  }

  isSubmitting.value = true
  errorMessage.value = ""
  resetMessage.value = ""

  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${runtimeConfig.public.siteUrl}/auth/callback`,
        queryParams: {
          prompt: "select_account",
          ...(options.loginHint ? { login_hint: options.loginHint } : {}),
        },
      },
    })

    if (error) {
      errorMessage.value = error.message
      isSubmitting.value = false
    }
  } catch (error: any) {
    errorMessage.value = error?.message || "Unable to continue with Google."
    isSubmitting.value = false
  }
}

// Denied: shake the card.
watch(authAnimationState, async (state) => {
  if (state !== "denied" || !motionOK()) {
    return
  }

  const { gsap } = await import("gsap")

  gsap.fromTo(
    ".login-panel",
    { x: 0 },
    { x: 8, duration: 0.06, repeat: 7, yoyo: true, ease: "none", clearProps: "x" },
  )
})
</script>

<template>
  <div
    class="login-page"
    :class="{
      'is-password-focused': focusedField === 'password',
      'is-password-visible': isPasswordVisible,
    }"
  >
    <div class="login-aurora-fallback" aria-hidden="true" />
    <ClientOnly>
      <ShaderAnimation class="login-shader" />
    </ClientOnly>
    <div class="login-shader-scrim" aria-hidden="true" />

    <div class="login-composition">
      <div
        class="password-mascot-stage"
        :class="[
          `auth-${authAnimationState}`,
          {
            'is-private': !isPasswordVisible,
            'is-peeking': isPasswordVisible,
            'is-focused': focusedField === 'password',
          },
        ]"
        aria-hidden="true"
      >
        <svg
          ref="raccoonRoot"
          class="password-raccoon-scene"
          :class="{
            'is-private': !isPasswordVisible,
            'is-peeking': isPasswordVisible,
            'is-focused': focusedField === 'password',
            'is-reduced-motion': prefersReducedMotion,
          }"
          viewBox="0 0 232 150"
          fill="none"
        >
          <ellipse class="raccoon-stage-shadow" cx="142" cy="119" rx="58" ry="12" />
          <g ref="raccoonLift" class="raccoon-lift">
            <g ref="raccoonFloat" class="raccoon-float">
              <g ref="raccoonCharacter" class="raccoon-character">
                <g class="raccoon-tail-base">
                  <g ref="raccoonTail" class="raccoon-tail-wag">
                    <path
                      class="raccoon-tail-fill"
                      d="M99.8 93.7c-33.8 7.8-61.9-7.1-62.5-29.4-.4-15.8 12.6-26.3 29-22.4 11.1 2.6 19.4 10.6 23.5 20.7-11.6-5-23.8-2.6-27.7 5-4.7 9.2 5.3 19.1 25.7 18.7 8.7-.2 17.5-2.6 25.5-6.2l8.6 11.6c-6 1.7-13.4 2.5-22.1 2Z"
                    />
                    <path
                      class="raccoon-tail-stripe raccoon-tail-stripe-a"
                      d="M48.4 47.5c9.4.8 16.7 5.3 21.1 12.9-5.2.7-9.3 3.2-11.3 6.9-4.5-7.4-11.3-11.4-20.4-12.5 2-3.5 5.5-6.1 10.6-7.3Z"
                    />
                    <path
                      class="raccoon-tail-stripe raccoon-tail-stripe-b"
                      d="M69.6 84.3c6.1 2.8 14.6 4.1 24.8 3.5 1.5-.1 3.1-.3 4.6-.5l7.4 9.8c-11.7 2.4-23.7 1.6-33.2-1.8-1.6-3.4-2.8-7.1-3.6-11Z"
                    />
                  </g>
                  <path
                    class="raccoon-tail-socket"
                    d="M93.6 84.7c11.7-6.9 25.6-4.7 33.6 5l-5.1 15.2c-10.1-5.9-21.5-6-33.5-.1Z"
                  />
                </g>

                <g class="raccoon-body-rig">
                  <path
                    class="raccoon-body-fill"
                    d="M96.7 104.2c0-24.2 17.3-40.2 43.9-40.2 25.4 0 41.6 15.8 41.6 40.5 0 13.9-15.9 21.8-42.7 21.8-26.3 0-42.8-7.7-42.8-22.1Z"
                  />
                  <path
                    class="raccoon-body-glass"
                    d="M116.6 108.4c4.5-11.9 12.9-18 24.8-18 11.7 0 20.2 6.1 24.7 18-5.7 5.1-13.8 7.6-24.6 7.6-11.1 0-19.4-2.5-24.9-7.6Z"
                  />
                </g>

              <g class="raccoon-head-rig">
                <path class="raccoon-ear raccoon-ear-left" d="M112.5 43.9 102 18.1l29.6 13.8Z" />
                <path class="raccoon-ear raccoon-ear-right" d="m173.6 43.9 10.4-25.8-29.5 13.8Z" />
                <path
                  class="raccoon-face"
                  d="M100.6 61.2c0-24.5 17.2-39.4 42.3-39.4 25.5 0 42.6 14.9 42.6 39.4 0 24.1-17.4 38.5-42.6 38.5-25 0-42.3-14.4-42.3-38.5Z"
                />
                <path
                  class="raccoon-mask-fill"
                  d="M110.7 61.7c8-12.4 18.6-17.8 32.2-17.8 13.8 0 24.5 5.4 32.6 17.8-7.1 13.3-18.1 19.6-32.6 19.6-14.2 0-25.2-6.3-32.2-19.6Z"
                />
                <g ref="raccoonEyes" class="raccoon-eyes">
                  <ellipse class="raccoon-eye-white" cx="130.2" cy="61.7" rx="8.2" ry="8" />
                  <ellipse class="raccoon-eye-white" cx="155.8" cy="61.7" rx="8.2" ry="8" />
                  <g ref="raccoonPupils" class="raccoon-pupils">
                    <circle class="raccoon-pupil" cx="132.1" cy="62.1" r="3.3" />
                    <circle class="raccoon-pupil" cx="157.7" cy="62.1" r="3.3" />
                  </g>
                </g>
                <g ref="raccoonEyelids" class="raccoon-eyelids">
                  <path class="raccoon-eye-closed" d="M123.2 62.1c3.8 3.1 10.5 3.1 14.2 0" />
                  <path class="raccoon-eye-closed" d="M148.8 62.1c3.8 3.1 10.5 3.1 14.2 0" />
                </g>
                <path class="raccoon-snout" d="M130.5 73.1c2.8-3 6.8-4.5 12.2-4.5 5.5 0 9.7 1.5 12.5 4.5-1.5 6-5.6 9.1-12.4 9.1-6.7 0-10.8-3.1-12.3-9.1Z" />
                <path class="raccoon-nose" d="M136.7 72.9h12.1l-6.1 6Z" />
                <path class="raccoon-mouth" d="M142.7 78.8v4.9" />
              </g>

              <g ref="raccoonPaws" class="raccoon-paws-rig">
                <g ref="raccoonPawCovers" class="raccoon-paw-covers">
                  <path
                    class="raccoon-paw-cover raccoon-paw-cover-left"
                    d="M117.8 64.5c0-8.5 5.8-13.5 13.1-13.5 7.6 0 13.1 5.2 13.1 13.2 0 7.6-5.6 12.5-13.2 12.5-7.5 0-13-4.7-13-12.2Z"
                  />
                  <path
                    class="raccoon-paw-cover raccoon-paw-cover-right"
                    d="M142.3 64.2c0-8 5.6-13.2 13.1-13.2 7.4 0 13.1 5 13.1 13.5 0 7.5-5.5 12.2-13 12.2-7.6 0-13.2-4.9-13.2-12.5Z"
                  />
                </g>
              </g>
              </g>
            </g>
          </g>
        </svg>
      </div>

      <Card class="login-panel" aria-label="Naad Backstage sign in">
      <header class="login-header">
        <span class="login-brand-badge">
          <picture>
            <source :srcset="brandLogoSources.avif" type="image/avif">
            <source :srcset="brandLogoSources.webp" type="image/webp">
            <img
              :src="brandLogoSources.png"
              alt="Naad Backstage"
              class="login-brand-logo"
              width="512"
              height="206"
              decoding="async"
            >
          </picture>
        </span>
        <h1 class="login-title">Welcome back</h1>
        <p class="login-subtitle">Sign in to your backstage</p>
      </header>

      <div class="login-body">
        <Transition name="login-message">
          <AppAlert v-if="errorMessage" variant="destructive" class="login-message">
            {{ errorMessage }}
          </AppAlert>
        </Transition>
        <Transition name="login-message">
          <AppAlert v-if="resetMessage" variant="success" class="login-message">
            {{ resetMessage }}
          </AppAlert>
        </Transition>

        <form class="login-form" @submit.prevent="signInWithPassword">
          <div
            class="login-field"
            :class="{
              'is-active': focusedField === 'email' || email,
              'is-focused': focusedField === 'email',
            }"
          >
            <label for="email" class="login-label">Email</label>
            <div class="login-input-shell">
              <Input
                id="email"
                v-model="email"
                type="email"
                autocomplete="email"
                class="login-input"
                :aria-invalid="Boolean(errorMessage)"
                @focus="focusedField = 'email'"
                @blur="focusedField = ''"
              />
            </div>
          </div>

          <div
            class="login-field login-password-field"
            :class="{
              'is-active': focusedField === 'password' || password,
              'is-focused': focusedField === 'password',
              'is-revealed': isPasswordVisible,
            }"
          >
            <label for="password" class="login-label">Password</label>
            <div
              class="login-input-shell login-password-shell"
              :class="{
                'is-private': !isPasswordVisible,
                'is-revealed': isPasswordVisible,
              }"
            >
              <Input
                id="password"
                v-model="password"
                :type="passwordInputType"
                autocomplete="current-password"
                class="login-input login-password-input"
                :aria-invalid="Boolean(errorMessage)"
                @focus="focusedField = 'password'"
                @blur="focusedField = ''"
                @input="handlePasswordTyping"
              />
              <AppTooltip :label="passwordToggleLabel" side="left">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="login-password-toggle"
                  :aria-label="passwordToggleLabel"
                  :aria-pressed="isPasswordVisible"
                  @click="togglePasswordVisibility"
                >
                  <span class="password-toggle-mark" aria-hidden="true">
                    <span class="password-toggle-eye">
                      <span class="password-toggle-pupil" />
                    </span>
                  </span>
                </Button>
              </AppTooltip>
            </div>
          </div>

          <Button
            type="submit"
            class="login-btn-primary"
            :class="{
              'is-checking': authAnimationState === 'checking',
              'is-approved': authAnimationState === 'approved',
              'is-denied': authAnimationState === 'denied',
            }"
            :disabled="!isHydrated || isSubmitting"
          >
            <span class="login-btn-label">{{ signInButtonLabel }}</span>
          </Button>
        </form>

        <div class="login-divider">
          <span>or</span>
        </div>

        <Button
          type="button"
          variant="secondary"
          class="login-btn-google"
          :disabled="!isHydrated || isSubmitting"
          @click="signInWithGoogle"
        >
          <svg class="size-5 login-google-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="login-forgot"
          :disabled="!isHydrated || isSendingReset || isSubmitting"
          @click="sendPasswordReset"
        >
          <KeyRound class="size-4" aria-hidden="true" />
          <span>{{ isSendingReset ? "Sending reset..." : "Forgot your password?" }}</span>
        </Button>
      </div>
      </Card>

      <p class="login-footer">© 2026 Naad Backstage · Crafted for the stage</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  --background: #0a0a0a;
  --foreground: #f2f3ea;
  --card: #161615;
  --muted: #1e1e1c;
  --muted-foreground: #9a9b92;
  --primary: var(--priority, #e8c028);
  --primary-foreground: #181713;
  --login-brand-gold: var(--priority, #e8c028);
  --login-brand-gold-hover: var(--priority-hover, #f0d028);
  --login-panel-surface:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 94%, var(--foreground) 4%), var(--card) 58%, color-mix(in srgb, var(--card) 88%, black 12%)),
    var(--card);
  --login-panel-surface-strong:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 5%), color-mix(in srgb, var(--muted) 18%, var(--card)) 62%, color-mix(in srgb, var(--card) 88%, black 12%)),
    var(--card);
  --login-field-surface:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 86%, black 14%), color-mix(in srgb, var(--muted) 24%, var(--card))),
    var(--card);
  --login-field-surface-strong:
    linear-gradient(145deg, color-mix(in srgb, var(--card) 96%, var(--foreground) 5%), color-mix(in srgb, var(--muted) 24%, var(--card)) 62%, color-mix(in srgb, var(--card) 88%, black 12%)),
    var(--card);
  --login-glass: var(--login-panel-surface);
  --login-glass-strong: var(--login-panel-surface-strong);
  --login-stroke: color-mix(in srgb, var(--border, rgb(242 243 234 / 10%)) 84%, var(--foreground) 10%);
  --login-stroke-strong: color-mix(in srgb, var(--login-brand-gold) 48%, var(--login-stroke));
  --login-panel-rim: color-mix(in srgb, var(--border, rgb(242 243 234 / 10%)) 88%, var(--foreground) 8%);
  --login-inner-glow: transparent;
  --login-soft-shadow:
    inset 1px 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent),
    inset -1px -1px 0 rgb(0 0 0 / 50%),
    22px 28px 64px -42px rgb(0 0 0 / 90%),
    -10px -12px 28px -24px rgb(244 238 223 / 4%);
  --surface-control-shadow:
    inset 3px 3px 8px rgb(0 0 0 / 42%),
    inset -3px -3px 8px rgb(244 238 223 / 4%),
    inset 0 0 0 1px rgb(244 238 223 / 2%);
  color-scheme: only light;
  forced-color-adjust: none;
  position: relative;
  isolation: isolate;
  display: grid;
  width: 100%;
  min-height: 100svh;
  place-items: center;
  overflow: hidden;
  padding: clamp(18px, 4svh, 48px) clamp(16px, 4vw, 32px);
  /* Deep obsidian base. The animated aurora stand-in (.login-aurora-fallback)
     sits on top and drifts from the first paint, so there is no frozen "stuck"
     frame before the WebGL aurora boots. */
  background: #060507;
}

.login-page::before {
  display: none;
}

/* Animated stand-in shown instantly (CSS only, no JS/WebGL wait) so the
   background is alive from the first paint. The WebGL aurora fades in over it. */
.login-aurora-fallback {
  position: absolute;
  inset: -12%;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(52% 56% at 18% 22%, color-mix(in srgb, #f3b21f 20%, transparent), transparent 72%),
    radial-gradient(48% 50% at 82% 28%, color-mix(in srgb, #f3b21f 17%, transparent), transparent 72%),
    radial-gradient(56% 52% at 86% 78%, color-mix(in srgb, #5a3aa0 16%, transparent), transparent 72%),
    radial-gradient(52% 56% at 12% 82%, color-mix(in srgb, #5a3aa0 13%, transparent), transparent 72%);
  animation: login-aurora-drift 26s ease-in-out infinite alternate;
}

@keyframes login-aurora-drift {
  0% {
    transform: translate3d(0, 0, 0) scale(1);
  }
  50% {
    transform: translate3d(1.6%, -1.4%, 0) scale(1.06);
  }
  100% {
    transform: translate3d(-1.4%, 1.6%, 0) scale(1.03);
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-aurora-fallback {
    animation: none;
  }
}

.login-shader {
  position: absolute;
  inset: 0;
  z-index: 0;
}

/* Gentle vignette: keeps the page corners deep-obsidian and anchors the bright
   centre streaks so the glass card stays legible without dimming the animation. */
.login-shader-scrim {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(125% 95% at 50% 50%, transparent 55%, rgb(0 0 0 / 30%) 100%);
}

.login-composition {
  position: relative;
  z-index: 1;
  isolation: isolate;
  width: min(100%, 408px);
}

.login-panel {
  --login-panel-pad: clamp(24px, 3.6vw, 32px);
  position: relative;
  z-index: 2;
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--login-panel-rim);
  border-radius: var(--surface-radius-card, 16px);
  background: linear-gradient(
    155deg,
    color-mix(in srgb, var(--card) 58%, transparent) 0%,
    color-mix(in srgb, var(--card) 40%, transparent) 100%
  );
  /* Stronger saturation lets the background's glow bloom through the glass. */
  -webkit-backdrop-filter: blur(28px) saturate(1.55) brightness(1.05);
  backdrop-filter: blur(28px) saturate(1.55) brightness(1.05);
  /* Clean depth, no glow: top highlight, inner ring, contact + deep float shadow. */
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 13%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--foreground) 3%, transparent),
    0 2px 6px rgb(0 0 0 / 44%),
    0 28px 78px -36px rgb(0 0 0 / 94%);
  padding: var(--login-panel-pad);
  /* Flash-free entrance: a CSS keyframe starts hidden at first paint, so the
     panel never "appears then vanishes" the way a JS .from() would. */
  animation: login-panel-enter 560ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

@media (prefers-reduced-motion: reduce) {
  .login-panel {
    animation: none;
  }
}

.login-panel::before,
.login-panel::after {
  position: absolute;
  content: "";
  pointer-events: none;
}

.login-panel::before {
  inset: 0 22px auto;
  z-index: 1;
  height: 1px;
  background:
    linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, white 14%, transparent) 20%,
      color-mix(in srgb, var(--login-brand-gold) 18%, transparent) 52%,
      color-mix(in srgb, white 10%, transparent) 82%,
      transparent
    );
}

.login-panel::after {
  display: none;
}

.login-header {
  position: relative;
  z-index: 3;
  display: grid;
  justify-items: center;
  margin-bottom: 20px;
  text-align: center;
}

.login-brand-badge {
  position: relative;
  z-index: 1;
  display: grid;
  justify-self: stretch;
  width: auto;
  height: 92px;
  margin: calc(-1 * var(--login-panel-pad)) calc(-1 * var(--login-panel-pad)) 16px;
  place-items: center;
  border: 0;
  border-radius: var(--surface-radius-card, 16px) var(--surface-radius-card, 16px) 0 0;
  background: color-mix(in srgb, var(--background) 52%, transparent);
  box-shadow: none;
  overflow: hidden;
  transform: translateZ(0);
}

.login-brand-badge::before {
  display: none;
}

/* One clean premium divider: a hairline that spans the full card width and
   fades to transparent at both ends, with a quiet gold glow at its centre. */
.login-brand-badge::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--login-stroke) 76%, transparent) 18%,
    color-mix(in srgb, var(--login-brand-gold) 36%, var(--login-stroke)) 50%,
    color-mix(in srgb, var(--login-stroke) 76%, transparent) 82%,
    transparent 100%
  );
  content: "";
}

.login-brand-logo {
  position: relative;
  z-index: 1;
  display: block;
  width: 166px;
  height: auto;
  filter: none;
  object-fit: contain;
  transform: translateY(1px);
  transform-origin: 50% 52%;
}

.login-title {
  position: relative;
  z-index: 1;
  margin: 0;
  color: var(--foreground);
  font-family: var(--font-app-display);
  font-size: clamp(30px, 4.2vw, 34px);
  font-weight: 740;
  letter-spacing: -0.022em;
  line-height: 1.03;
  text-shadow: 0 1px 14px rgb(0 0 0 / 35%);
}

.login-subtitle {
  position: relative;
  z-index: 1;
  max-width: 318px;
  margin: 9px 0 0;
  color: color-mix(in srgb, var(--muted-foreground) 90%, transparent);
  font-size: 14px;
  font-weight: 460;
  letter-spacing: 0.012em;
  line-height: 1.5;
}

.login-footer {
  position: relative;
  z-index: 1;
  margin: 18px 0 0;
  text-align: center;
  color: color-mix(in srgb, var(--muted-foreground) 64%, transparent);
  font-size: 12px;
  font-weight: 550;
  letter-spacing: 0.05em;
  text-shadow: 0 1px 6px rgb(0 0 0 / 60%);
}

.login-body,
.login-form {
  position: relative;
  z-index: 3;
  display: grid;
  gap: 13px;
}

.login-field {
  position: relative;
  display: grid;
}

.login-label {
  position: absolute;
  top: 17px;
  left: 16px;
  z-index: 3;
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.012em;
  line-height: 1;
  pointer-events: none;
  transform-origin: left center;
  transition:
    color 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.login-field.is-active .login-label {
  color: color-mix(in srgb, var(--foreground) 78%, var(--login-brand-gold));
  transform: translateY(-10px) scale(0.78);
}

.login-input-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--login-stroke);
  border-radius: var(--surface-radius-control, 12px);
  background: var(--login-field-surface);
  box-shadow:
    var(--surface-control-shadow, inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent)),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 7%, transparent);
  transition:
    border-color 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.login-field.is-focused .login-input-shell {
  border-color: color-mix(in srgb, var(--login-brand-gold) 82%, var(--foreground) 8%);
  box-shadow:
    var(--surface-control-shadow, inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent)),
    inset 0 1px 0 color-mix(in srgb, var(--foreground) 8%, transparent),
    0 0 0 3px color-mix(in srgb, var(--login-brand-gold) 16%, transparent);
  transform: translateY(-1px);
}

.login-input {
  position: relative;
  z-index: 1;
  height: 50px;
  border: 0;
  border-radius: var(--surface-radius-control, 12px);
  background: transparent;
  box-shadow: none;
  color: var(--foreground);
  padding: 21px 16px 7px;
  caret-color: var(--login-brand-gold);
}

.login-input:focus-visible {
  outline: none;
  box-shadow: none;
}

.login-password-input {
  padding-right: 68px;
}

.login-password-field {
  z-index: 1;
}

.login-password-field .login-label {
  z-index: 5;
}

.login-password-shell {
  position: relative;
  z-index: 1;
  border-color: var(--login-stroke);
  background: var(--login-field-surface);
  box-shadow: var(--surface-control-shadow, inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent));
}

.password-mascot-stage {
  position: absolute;
  top: 244px;
  right: -118px;
  z-index: 4;
  width: 154px;
  height: 118px;
  color: var(--foreground);
  filter: none;
  opacity: 0.92;
  overflow: visible;
  pointer-events: none;
  transform: translateZ(0);
  transition:
    opacity 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    right 360ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    top 360ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.password-mascot-stage.is-focused {
  opacity: 1;
}

.password-mascot-stage.is-peeking {
  top: 239px;
  right: -112px;
  filter: none;
  opacity: 1;
}

.password-raccoon-scene {
  width: 100%;
  height: 100%;
  overflow: visible;
  opacity: 1;
  transform: translateX(-8px) scale(0.94);
  /* Grounding shadow only — no gold glow. */
  filter: drop-shadow(0 6px 18px rgb(0 0 0 / 55%));
}

.password-mascot-stage.auth-checking,
.password-mascot-stage.auth-approved {
  top: 238px;
  right: -112px;
  filter: none;
  opacity: 1;
}

.password-mascot-stage.auth-denied {
  top: 238px;
  right: -112px;
  filter: none;
  opacity: 1;
  animation: mascot-stage-denied 520ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.raccoon-lift,
.raccoon-float,
.raccoon-character,
.raccoon-tail-base,
.raccoon-tail-wag,
.raccoon-body-rig,
.raccoon-head-rig,
.raccoon-paws-rig,
.raccoon-paw-covers,
.raccoon-eyes,
.raccoon-pupils,
.raccoon-eyelids {
  transform-box: fill-box;
  transform-origin: center;
}

.raccoon-stage-shadow {
  opacity: 0;
}

.raccoon-tail-fill,
.raccoon-tail-socket,
.raccoon-body-fill,
.raccoon-face,
.raccoon-ear,
.raccoon-paw-cover {
  /* Warm grey (lifted from near-black) so the silhouette reads against the
     obsidian login scene; the dark mask band + gold features still pop. */
  fill: #3a352d;
}

.raccoon-tail-stripe,
.raccoon-mask-fill,
.raccoon-nose {
  fill: #0a0a0a;
}

.raccoon-body-glass,
.raccoon-snout,
.raccoon-eye-white {
  fill: var(--login-brand-gold);
}

.raccoon-eye-white {
  stroke: rgb(201 168 76 / 24%);
  stroke-width: 1;
}

.raccoon-body-glass,
.raccoon-snout {
  opacity: 0.95;
}

.raccoon-pupil {
  fill: #050505;
}

.raccoon-mouth,
.raccoon-eye-closed,
.raccoon-arm,
.raccoon-paw-rest,
.raccoon-field-lip {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.raccoon-mouth,
.raccoon-eye-closed {
  stroke: var(--login-brand-gold);
}

.raccoon-mouth {
  stroke-width: 2.2;
}

.raccoon-eye-closed {
  stroke-width: 3.2;
}

.raccoon-arm,
.raccoon-paw-rest,
.raccoon-field-lip {
  stroke: #1e1e1c;
}

.raccoon-arm {
  stroke-width: 8;
  opacity: 0.92;
}

.raccoon-paw-rest {
  stroke-width: 9;
  opacity: 0.96;
}

.raccoon-field-lip {
  stroke-width: 3;
  opacity: 0.18;
}

.raccoon-tail-stripe {
  opacity: 0.72;
}

.raccoon-eyelids {
  opacity: 1;
}

.raccoon-eyes,
.raccoon-pupils {
  opacity: 0;
}

.raccoon-paws-rig {
  transform: translate(0, -10px) rotate(0deg);
}

.raccoon-paw-covers {
  opacity: 1;
  transform: translate(0, -12px) scale(1);
}

.password-raccoon-scene.is-reduced-motion {
  opacity: 1;
}

.password-raccoon-scene.is-reduced-motion.is-focused .raccoon-lift {
  transform: translate(0, -1px);
}

.password-raccoon-scene.is-reduced-motion.is-focused .raccoon-paws-rig {
  transform: translate(0, -8px) rotate(0deg);
}

.password-raccoon-scene.is-reduced-motion.is-peeking .raccoon-lift {
  transform: translate(-16px, -3px);
}

.password-raccoon-scene.is-reduced-motion.is-peeking .raccoon-character {
  transform: translate(-5px, 0);
}

.password-raccoon-scene.is-reduced-motion.is-peeking .raccoon-paws-rig {
  transform: translate(0, 15px) rotate(-3deg);
}

.password-raccoon-scene.is-reduced-motion.is-peeking .raccoon-paw-covers {
  opacity: 0;
  transform: translate(0, 20px) scale(0.76);
}

.password-raccoon-scene.is-reduced-motion.is-peeking .raccoon-eyes,
.password-raccoon-scene.is-reduced-motion.is-peeking .raccoon-pupils {
  opacity: 1;
}

.password-raccoon-scene.is-reduced-motion.is-peeking .raccoon-pupils {
  transform: translate(-4.8px, 1.9px);
}

.password-raccoon-scene.is-reduced-motion.is-peeking .raccoon-eyelids {
  opacity: 0;
}

.login-password-shell::before {
  display: none;
}

.login-password-shell.is-revealed::before,
.login-password-field.is-focused .login-password-shell::before {
  opacity: 0;
}

.login-password-toggle {
  position: absolute;
  top: 50%;
  right: 7px;
  z-index: 4;
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid var(--login-stroke);
  border-radius: var(--surface-radius-compact, 10px);
  background: var(--login-field-surface-strong);
  box-shadow: var(--surface-control-shadow, inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent));
  color: var(--foreground);
  cursor: pointer;
  transform: translateY(-50%);
  transition:
    background-color 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    border-color 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.login-password-toggle:hover,
.login-password-toggle:focus-visible,
.login-password-field.is-revealed .login-password-toggle {
  border-color: var(--login-stroke-strong);
  background: color-mix(in srgb, var(--login-brand-gold) 14%, var(--login-field-surface-strong));
  transform: translateY(-50%);
}

.login-password-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--login-brand-gold) 32%, transparent);
  outline-offset: 2px;
}

.password-toggle-mark {
  position: relative;
  display: grid;
  width: 25px;
  height: 18px;
  place-items: center;
}

.password-toggle-eye {
  position: relative;
  display: block;
  width: 24px;
  height: 15px;
  border: 2px solid color-mix(in srgb, var(--foreground) 84%, var(--muted-foreground));
  border-radius: 50%;
  transform: rotate(-6deg);
  transition:
    border-color 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.password-toggle-pupil {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--foreground);
  transform: translate(-50%, -50%);
  transition: transform 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.password-toggle-mark::after {
  position: absolute;
  width: 29px;
  height: 2px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground) 84%, var(--muted-foreground));
  content: "";
  transform: rotate(-38deg) scaleX(1);
  transform-origin: center;
  transition:
    opacity 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 220ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.login-password-field.is-revealed .password-toggle-eye {
  border-color: var(--foreground);
  transform: rotate(4deg);
}

.login-password-field.is-revealed .password-toggle-pupil {
  transform: translate(-6%, -50%);
}

.login-password-field.is-revealed .password-toggle-mark::after {
  opacity: 0;
  transform: rotate(-38deg) scaleX(0.2);
}

.login-btn-primary,
.login-btn-google {
  width: 100%;
  height: 50px;
  border-radius: var(--surface-radius-control, 12px);
  font-size: var(--text-button-size, 14px);
  font-weight: var(--text-button-weight, 650);
  letter-spacing: 0;
}

.login-btn-primary {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--login-brand-gold) 76%, var(--foreground) 12%);
  background: linear-gradient(180deg, var(--login-brand-gold-hover), var(--login-brand-gold));
  color: var(--primary-foreground);
  box-shadow: inset 0 1px 0 color-mix(in srgb, white 36%, transparent);
}

.login-btn-primary::before,
.login-btn-primary::after {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  content: "";
  pointer-events: none;
}

.login-btn-primary::before {
  display: none;
}

.login-btn-primary::after {
  display: none;
}

.login-btn-primary:hover:not(:disabled),
.login-btn-primary:focus-visible:not(:disabled) {
  border-color: color-mix(in srgb, var(--login-brand-gold-hover) 84%, var(--foreground) 10%);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 42%, transparent),
    0 0 0 3px color-mix(in srgb, var(--login-brand-gold) 16%, transparent);
  transform: none;
}

.login-btn-primary.is-checking {
  border-color: color-mix(in srgb, var(--login-brand-gold) 68%, var(--foreground) 12%);
  background: linear-gradient(180deg, var(--login-brand-gold-hover), var(--login-brand-gold));
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, white 36%, transparent),
    0 0 0 3px color-mix(in srgb, var(--login-brand-gold) 12%, transparent);
  opacity: 1;
}

.login-btn-primary.is-checking {
  animation: login-button-checking-ring 1.6s var(--ease-in-out, ease-in-out) infinite;
}

.login-btn-primary.is-denied {
  animation: login-button-denied 420ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)) both;
}

.login-btn-label {
  position: relative;
  z-index: 1;
  line-height: 1;
}

.login-btn-google {
  gap: 10px;
  border: 1px solid var(--login-stroke);
  background: var(--login-field-surface);
  color: color-mix(in srgb, var(--foreground) 88%, var(--login-brand-gold));
  box-shadow: var(--surface-control-shadow, inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent));
}

.login-btn-google:hover:not(:disabled),
.login-btn-google:focus-visible:not(:disabled) {
  border-color: color-mix(in srgb, var(--login-brand-gold) 52%, var(--login-stroke));
  box-shadow:
    var(--surface-control-shadow, inset 0 1px 0 color-mix(in srgb, var(--foreground) 4%, transparent)),
    0 0 0 3px color-mix(in srgb, var(--login-brand-gold) 10%, transparent);
  transform: none;
}

.login-divider {
  display: flex;
  align-items: center;
  gap: 15px;
  color: color-mix(in srgb, var(--muted-foreground) 82%, var(--foreground));
  font-size: 12px;
}

.login-divider::before,
.login-divider::after {
  flex: 1;
  height: 1px;
  background: color-mix(in srgb, var(--login-brand-gold) 16%, var(--login-stroke));
  content: "";
}

.login-forgot {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: color-mix(in srgb, var(--foreground) 80%, var(--login-brand-gold));
  cursor: pointer;
  font-size: 13px;
  font-weight: 650;
  padding: 6px 8px;
  transition:
    background-color 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    opacity 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.login-forgot:hover,
.login-forgot:focus-visible {
  background: color-mix(in srgb, var(--login-brand-gold) 12%, transparent);
  color: var(--foreground);
}

.login-forgot:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--login-brand-gold) 28%, transparent);
  outline-offset: 2px;
}

.login-forgot:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.login-message-enter-active,
.login-message-leave-active {
  transition:
    opacity 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 180ms var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.login-message-enter-from,
.login-message-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes login-panel-enter {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes login-sheet-drift {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 -12px;
  }
}

@keyframes mascot-stage-denied {
  0%,
  100% {
    transform: translateX(0);
  }
  28% {
    transform: translateX(-5px);
  }
  54% {
    transform: translateX(4px);
  }
  78% {
    transform: translateX(-2px);
  }
}

@keyframes login-button-checking-ring {
  0% {
    border-color: color-mix(in srgb, var(--login-brand-gold) 52%, var(--foreground) 12%);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 36%, transparent),
      0 24px 44px -34px rgb(0 0 0 / 84%),
      0 0 0 3px color-mix(in srgb, var(--login-brand-gold) 8%, transparent);
  }
  50% {
    border-color: color-mix(in srgb, var(--login-brand-gold) 78%, var(--foreground) 12%);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 42%, transparent),
      0 24px 44px -34px rgb(0 0 0 / 84%),
      0 0 0 3px color-mix(in srgb, var(--login-brand-gold) 14%, transparent);
  }
  100% {
    border-color: color-mix(in srgb, var(--login-brand-gold) 52%, var(--foreground) 12%);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 36%, transparent),
      0 24px 44px -34px rgb(0 0 0 / 84%),
      0 0 0 3px color-mix(in srgb, var(--login-brand-gold) 8%, transparent);
  }
}

@keyframes login-button-denied {
  0%,
  100% {
    transform: translateX(0);
  }
  28% {
    transform: translateX(-4px);
  }
  54% {
    transform: translateX(3px);
  }
  78% {
    transform: translateX(-2px);
  }
}

@media (max-width: 760px) {
  .login-page {
    min-height: 100svh;
    padding: clamp(14px, 2.6svh, 24px) 22px;
  }

  .login-glass-sheet-a {
    top: 4%;
    left: -46%;
    width: 360px;
    height: 210px;
    opacity: 0.42;
  }

  .login-glass-sheet-b {
    right: -54%;
    bottom: 4%;
    width: 380px;
    height: 230px;
    opacity: 0.4;
  }

  .login-composition {
    width: min(100%, 396px);
  }

  .login-panel {
    --login-panel-pad: 20px;
    border-radius: var(--surface-radius-card, 16px);
    padding: var(--login-panel-pad);
  }

  .login-panel::after {
    border-radius: var(--surface-radius-card, 16px);
  }

  .login-header {
    margin-bottom: 20px;
  }

  .login-brand-badge {
    height: 94px;
    border-radius: var(--surface-radius-card, 16px) var(--surface-radius-card, 16px) 0 0;
  }

  .password-mascot-stage {
    top: 252px;
    right: -22px;
    z-index: 3;
    width: 68px;
    height: 54px;
    opacity: 0.92;
  }

  .password-mascot-stage.is-focused {
    opacity: 1;
  }

  .password-mascot-stage.is-peeking {
    top: 248px;
    right: -22px;
    opacity: 1;
  }

  .password-mascot-stage.auth-checking,
  .password-mascot-stage.auth-approved,
  .password-mascot-stage.auth-denied {
    top: 248px;
    right: -22px;
  }

}

@media (max-width: 420px) {
  .login-page {
    padding-inline: 18px;
  }

  .login-title {
    font-size: 28px;
  }

  .login-brand-badge {
    height: 88px;
  }

  .login-brand-logo {
    width: 146px;
  }

  .login-input,
  .login-btn-primary,
  .login-btn-google {
    height: 50px;
  }

  .password-mascot-stage {
    top: 240px;
    right: -18px;
    width: 58px;
    height: 46px;
  }

  .password-mascot-stage.is-peeking {
    top: 236px;
    right: -18px;
  }

  .password-mascot-stage.auth-checking,
  .password-mascot-stage.auth-approved,
  .password-mascot-stage.auth-denied {
    top: 236px;
    right: -18px;
  }
}

@media (max-height: 760px) {
  .login-page {
    padding-block: 14px;
  }

  .login-panel {
    --login-panel-pad: 20px;
    padding: 20px;
  }

  .login-header {
    margin-bottom: 18px;
  }

  .login-brand-badge {
    height: 82px;
    margin-bottom: 12px;
  }

  .login-brand-logo {
    width: 136px;
  }

  .login-title {
    font-size: clamp(26px, 5vw, 31px);
  }

  .login-subtitle {
    margin-top: 7px;
  }

  .login-body,
  .login-form {
    gap: 11px;
  }

  .login-input,
  .login-btn-primary,
  .login-btn-google {
    height: 48px;
  }

  .login-label {
    top: 15px;
  }

  .login-field.is-active .login-label {
    transform: translateY(-9px) scale(0.78);
  }

  .login-input {
    padding-top: 20px;
  }

  .login-password-toggle {
    width: 38px;
    height: 38px;
  }

  .password-mascot-stage {
    top: 218px;
    right: -36px;
    width: 78px;
    height: 62px;
  }

  .password-mascot-stage.is-peeking {
    top: 214px;
    right: -33px;
  }

  .password-mascot-stage.auth-checking,
  .password-mascot-stage.auth-approved,
  .password-mascot-stage.auth-denied {
    top: 214px;
    right: -33px;
  }

  .password-toggle-eye {
    width: 22px;
    height: 14px;
  }
}

.login-page:has(.login-message) .password-mascot-stage {
  top: 306px;
}

.login-page:has(.login-message) .password-mascot-stage.is-peeking,
.login-page:has(.login-message) .password-mascot-stage.auth-checking,
.login-page:has(.login-message) .password-mascot-stage.auth-approved,
.login-page:has(.login-message) .password-mascot-stage.auth-denied {
  top: 300px;
}

@media (max-width: 760px) {
  .login-page:has(.login-message) .password-mascot-stage {
    top: 320px;
    right: -22px;
  }

  .login-page:has(.login-message) .password-mascot-stage.is-peeking,
  .login-page:has(.login-message) .password-mascot-stage.auth-checking,
  .login-page:has(.login-message) .password-mascot-stage.auth-approved,
  .login-page:has(.login-message) .password-mascot-stage.auth-denied {
    top: 316px;
    right: -22px;
  }
}

@media (max-width: 420px) {
  .login-page:has(.login-message) .password-mascot-stage {
    top: 304px;
    right: -18px;
  }

  .login-page:has(.login-message) .password-mascot-stage.is-peeking,
  .login-page:has(.login-message) .password-mascot-stage.auth-checking,
  .login-page:has(.login-message) .password-mascot-stage.auth-approved,
  .login-page:has(.login-message) .password-mascot-stage.auth-denied {
    top: 300px;
    right: -18px;
  }
}

@media (max-height: 760px) {
  .login-page:has(.login-message) .password-mascot-stage {
    top: 278px;
  }

  .login-page:has(.login-message) .password-mascot-stage.is-peeking,
  .login-page:has(.login-message) .password-mascot-stage.auth-checking,
  .login-page:has(.login-message) .password-mascot-stage.auth-approved,
  .login-page:has(.login-message) .password-mascot-stage.auth-denied {
    top: 274px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-page *,
  .login-page *::before,
  .login-page *::after {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
