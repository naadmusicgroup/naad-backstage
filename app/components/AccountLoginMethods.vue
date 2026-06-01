<script setup lang="ts">
import type { User, UserIdentity } from "@supabase/supabase-js"
import { toast } from "vue-sonner"

const props = withDefaults(
  defineProps<{
    fallbackEmail?: string | null
    returnTo?: string
    showForgotPasswordAction?: boolean
  }>(),
  {
    fallbackEmail: null,
    returnTo: "",
    showForgotPasswordAction: true,
  },
)

const emit = defineEmits<{
  updated: []
}>()

interface AuthAccountSummary {
  email: string | null
  pendingEmail: string | null
}

const route = useRoute()
const supabase = useSupabaseClient()
const runtimeConfig = useRuntimeConfig()
const { signOutAndClear, isSigningOut } = useAuthSecurity()

const isLinkingGoogle = ref(false)
const isReconnectingGoogle = ref(false)
const isUnlinkingGoogle = ref(false)
const isSavingPassword = ref(false)
const isSavingEmailChange = ref(false)
const loginMethodSuccess = ref("")
const loginMethodError = ref("")
const linkedIdentities = ref<UserIdentity[]>([])
const authAccount = ref<AuthAccountSummary>({
  email: null,
  pendingEmail: null,
})

const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
})

const emailChangeForm = reactive({
  email: "",
})

const linkedProviders = computed(() => [...new Set(linkedIdentities.value.map((identity) => identity.provider))])
const hasPasswordIdentity = computed(() => linkedProviders.value.includes("email"))
const hasGoogleIdentity = computed(() => linkedProviders.value.includes("google"))
const currentLoginEmail = computed(() => authAccount.value.email || props.fallbackEmail || null)
const pendingLoginEmail = computed(() => authAccount.value.pendingEmail)
const currentLoginEmailIsGmail = computed(() => isGmailLoginEmail(currentLoginEmail.value))
const googleIdentityEmails = computed(() => linkedIdentities.value
  .filter((identity) => identity.provider === "google")
  .map(identityEmail)
  .filter(Boolean) as string[])
const primaryGoogleIdentityEmail = computed(() => googleIdentityEmails.value[0] ?? null)
const googleIdentityMatchesLoginEmail = computed(() => {
  const loginEmail = normalizeStoredEmail(currentLoginEmail.value)

  return Boolean(
    loginEmail
    && googleIdentityEmails.value.length
    && googleIdentityEmails.value.every((email) => email === loginEmail),
  )
})
const canConnectGoogle = computed(() => !hasGoogleIdentity.value && currentLoginEmailIsGmail.value)
const canDisconnectGoogle = computed(() => hasGoogleIdentity.value && hasPasswordIdentity.value)
const canReconnectGoogle = computed(() => hasGoogleIdentity.value && hasPasswordIdentity.value && currentLoginEmailIsGmail.value)
const emailStatusLabel = computed(() => (hasPasswordIdentity.value ? "Connected" : "Not connected"))
const googleStatusLabel = computed(() => {
  if (!hasGoogleIdentity.value) {
    return "Not connected"
  }

  return googleIdentityMatchesLoginEmail.value ? "Connected" : "Email mismatch"
})
const passwordActionLabel = computed(() => (hasPasswordIdentity.value ? "Change password" : "Set password"))
const passwordActionDescription = computed(() =>
  hasPasswordIdentity.value
    ? "Update the password tied to this account."
    : "Add a password so this account can sign in without Google.",
)
const googleActionInProgress = computed(() => (
  isLinkingGoogle.value || isReconnectingGoogle.value || isUnlinkingGoogle.value
))
const reconnectButtonLabel = computed(() => {
  if (isReconnectingGoogle.value) {
    return "Opening Google..."
  }

  if (!hasGoogleIdentity.value) {
    return "Google not linked"
  }

  if (!hasPasswordIdentity.value) {
    return "Set password first"
  }

  return "Reconnect Google"
})
const disconnectButtonLabel = computed(() => {
  if (isUnlinkingGoogle.value) {
    return "Disconnecting..."
  }

  if (!hasGoogleIdentity.value) {
    return "Google not linked"
  }

  if (!hasPasswordIdentity.value) {
    return "Set password first"
  }

  return "Disconnect Google"
})
const connectButtonLabel = computed(() => {
  if (isLinkingGoogle.value) {
    return "Redirecting..."
  }

  if (hasGoogleIdentity.value) {
    return "Google already linked"
  }

  if (!currentLoginEmailIsGmail.value) {
    return "Gmail required"
  }

  return "Connect Google"
})
const callbackRedirectUrl = computed(() => {
  const siteUrl = String(runtimeConfig.public.siteUrl || "").replace(/\/$/, "")
  const returnPath = normalizeReturnPath(props.returnTo || route.fullPath)
  const nextQuery = returnPath ? `?next=${encodeURIComponent(returnPath)}` : ""

  return `${siteUrl}/auth/callback${nextQuery}`
})

watch(
  currentLoginEmail,
  (email) => {
    if (!emailChangeForm.email || emailChangeForm.email === authAccount.value.pendingEmail) {
      emailChangeForm.email = email ?? ""
    }
  },
  { immediate: true },
)

onMounted(() => {
  void refreshLoginMethods()
})

function normalizeReturnPath(value: string | null | undefined) {
  const normalized = String(value ?? "").trim()

  if (!normalized || !normalized.startsWith("/") || normalized.startsWith("//") || normalized.includes("\\")) {
    return ""
  }

  return normalized
}

function normalizeLoginEmail(value: string) {
  const normalized = value.trim().toLowerCase()

  if (!normalized || !normalized.includes("@")) {
    throw new Error("Enter a valid login email.")
  }

  return normalized
}

function normalizeStoredEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null
}

function isGmailLoginEmail(value: string | null) {
  return /@gmail\.com$/i.test(value?.trim() ?? "")
}

function identityEmail(identity: UserIdentity) {
  return normalizeStoredEmail((identity as any).email ?? identity.identity_data?.email)
}

function resetLoginMethodMessages() {
  loginMethodSuccess.value = ""
  loginMethodError.value = ""
}

function showLoginMethodErrorMessage(message: string) {
  loginMethodError.value = message
  loginMethodSuccess.value = ""

  if (import.meta.client) {
    toast.error(message)
  }
}

function setLoginMethodError(error: any, fallback: string) {
  showLoginMethodErrorMessage(error?.data?.statusMessage || error?.message || fallback)
}

function setLoginMethodSuccess(message: string) {
  loginMethodSuccess.value = message
  loginMethodError.value = ""
  emit("updated")

  if (import.meta.client) {
    toast.success(message)
  }
}

function resetPasswordForm() {
  passwordForm.currentPassword = ""
  passwordForm.newPassword = ""
  passwordForm.confirmPassword = ""
}

function applyAuthUserState(nextUser?: User | null) {
  if (!nextUser) {
    return
  }

  authAccount.value = {
    email: nextUser.email?.trim().toLowerCase() || null,
    pendingEmail: nextUser.new_email?.trim().toLowerCase() || null,
  }

  if (nextUser.identities?.length) {
    linkedIdentities.value = nextUser.identities
  }
}

async function refreshLoginMethods(options: { preserveMessages?: boolean } = {}) {
  if (!import.meta.client) {
    return
  }

  if (!options.preserveMessages) {
    resetLoginMethodMessages()
  }

  const [{ data: userResult, error: userError }, { data: identitiesResult, error: identitiesError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getUserIdentities(),
  ])

  if (userError) {
    setLoginMethodError(userError, "Unable to load the current account email.")
    return
  }

  applyAuthUserState(userResult.user)

  if (identitiesError) {
    linkedIdentities.value = userResult.user?.identities ?? []
    setLoginMethodError(identitiesError, "Unable to load connected login methods.")
    return
  }

  linkedIdentities.value = identitiesResult?.identities ?? userResult.user?.identities ?? []
}

async function startGoogleLinking() {
  const queryParams: Record<string, string> = {
    prompt: "select_account",
  }

  if (currentLoginEmail.value) {
    queryParams.login_hint = currentLoginEmail.value
  }

  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: callbackRedirectUrl.value,
      queryParams,
    },
  })

  if (error) {
    throw error
  }
}

async function connectGoogle() {
  resetLoginMethodMessages()

  if (!currentLoginEmailIsGmail.value) {
    showLoginMethodErrorMessage("Google linking is limited to Gmail login emails in this app.")
    return
  }

  isLinkingGoogle.value = true

  try {
    await startGoogleLinking()
  } catch (error: any) {
    setLoginMethodError(error, "Unable to start Google linking.")
    isLinkingGoogle.value = false
  }
}

async function reconnectGoogle() {
  resetLoginMethodMessages()

  if (!hasPasswordIdentity.value) {
    showLoginMethodErrorMessage("Set a password before reconnecting Google so this account keeps another sign-in method.")
    return
  }

  if (!currentLoginEmailIsGmail.value) {
    showLoginMethodErrorMessage("Google linking is limited to Gmail login emails in this app.")
    return
  }

  const googleIdentity = linkedIdentities.value.find((identity) => identity.provider === "google")

  if (!googleIdentity) {
    showLoginMethodErrorMessage("Google is not currently linked to this account.")
    return
  }

  isReconnectingGoogle.value = true

  try {
    const { error: unlinkError } = await supabase.auth.unlinkIdentity(googleIdentity)

    if (unlinkError) {
      throw unlinkError
    }
  } catch (error: any) {
    setLoginMethodError(error, "Unable to disconnect the current Google sign-in before reconnecting.")
    await refreshLoginMethods({ preserveMessages: true })
    isReconnectingGoogle.value = false
    return
  }

  try {
    await refreshLoginMethods({ preserveMessages: true })
    await startGoogleLinking()
  } catch (error: any) {
    setLoginMethodError(error, "Google was disconnected, but reconnect could not start. Use Connect Google to try again.")
    await refreshLoginMethods({ preserveMessages: true })
    isReconnectingGoogle.value = false
  }
}

async function disconnectGoogle() {
  resetLoginMethodMessages()

  if (!canDisconnectGoogle.value) {
    showLoginMethodErrorMessage("Set a password before disconnecting Google so this account keeps another sign-in method.")
    return
  }

  const googleIdentity = linkedIdentities.value.find((identity) => identity.provider === "google")

  if (!googleIdentity) {
    showLoginMethodErrorMessage("Google is not currently linked to this account.")
    return
  }

  isUnlinkingGoogle.value = true

  try {
    const { error } = await supabase.auth.unlinkIdentity(googleIdentity)

    if (error) {
      throw error
    }

    await refreshLoginMethods()
    setLoginMethodSuccess("Google sign-in removed. Your password login still works.")
  } catch (error: any) {
    setLoginMethodError(error, "Unable to disconnect Google.")
  } finally {
    isUnlinkingGoogle.value = false
  }
}

async function savePassword() {
  resetLoginMethodMessages()
  const hadPasswordIdentity = hasPasswordIdentity.value

  if (!passwordForm.newPassword || passwordForm.newPassword.length < 8) {
    showLoginMethodErrorMessage("Choose a password with at least 8 characters.")
    return
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    showLoginMethodErrorMessage("The new password confirmation does not match.")
    return
  }

  if (hasPasswordIdentity.value && !passwordForm.currentPassword) {
    showLoginMethodErrorMessage("Enter your current password to change it.")
    return
  }

  isSavingPassword.value = true

  try {
    const attributes: {
      password: string
      current_password?: string
    } = {
      password: passwordForm.newPassword,
    }

    if (hasPasswordIdentity.value) {
      attributes.current_password = passwordForm.currentPassword
    }

    const { data: updateResult, error } = await supabase.auth.updateUser(attributes)

    if (error) {
      throw error
    }

    applyAuthUserState(updateResult.user)
    resetPasswordForm()
    setLoginMethodSuccess(
      hadPasswordIdentity
        ? "Password updated for this account."
        : hasGoogleIdentity.value
          ? "Password login added. You can now sign in with email/password or Google."
          : "Password login added. You can now sign in with email/password.",
    )
    void refreshLoginMethods({ preserveMessages: true })
  } catch (error: any) {
    setLoginMethodError(error, "Unable to save the password for this account.")
  } finally {
    isSavingPassword.value = false
  }
}

async function requestEmailChange() {
  resetLoginMethodMessages()

  let nextEmail = ""

  try {
    nextEmail = normalizeLoginEmail(emailChangeForm.email)
  } catch (error: any) {
    setLoginMethodError(error, "Enter a valid login email.")
    return
  }

  if (nextEmail === currentLoginEmail.value && !pendingLoginEmail.value) {
    showLoginMethodErrorMessage("That is already the current login email for this account.")
    return
  }

  if (hasGoogleIdentity.value && !isGmailLoginEmail(nextEmail)) {
    showLoginMethodErrorMessage("Change the login email to another Gmail address while Google sign-in is linked.")
    return
  }

  if (hasGoogleIdentity.value && primaryGoogleIdentityEmail.value && nextEmail !== primaryGoogleIdentityEmail.value) {
    showLoginMethodErrorMessage("Disconnect or reconnect Google before changing the login email to a different Gmail.")
    return
  }

  isSavingEmailChange.value = true

  try {
    const { data: updateResult, error } = await supabase.auth.updateUser(
      { email: nextEmail },
      {
        emailRedirectTo: callbackRedirectUrl.value,
      },
    )

    if (error) {
      throw error
    }

    applyAuthUserState(updateResult.user)

    if (!authAccount.value.pendingEmail && authAccount.value.email !== nextEmail) {
      authAccount.value.pendingEmail = nextEmail
    }

    const requestedEmail = authAccount.value.pendingEmail || nextEmail
    setLoginMethodSuccess(
      requestedEmail
        ? `Email change requested. Confirm ${requestedEmail} from the Supabase email link to finish it.`
        : "Login email updated for this account.",
    )
    void refreshLoginMethods({ preserveMessages: true })
  } catch (error: any) {
    setLoginMethodError(error, "Unable to start the login email change.")
  } finally {
    isSavingEmailChange.value = false
  }
}
</script>

<template>
  <div class="form-grid">
    <AppAlert v-if="loginMethodError" variant="destructive">{{ loginMethodError }}</AppAlert>
    <AppAlert v-if="loginMethodSuccess" variant="success">{{ loginMethodSuccess }}</AppAlert>

    <div class="summary-table">
      <div class="summary-row">
        <span class="detail-copy">Current login email</span>
        <strong>{{ currentLoginEmail || "Unavailable" }}</strong>
      </div>
      <div v-if="pendingLoginEmail" class="summary-row">
        <span class="detail-copy">Pending email change</span>
        <strong>{{ pendingLoginEmail }}</strong>
      </div>
      <div class="summary-row">
        <span class="detail-copy">Email / password</span>
        <strong>{{ emailStatusLabel }}</strong>
      </div>
      <div class="summary-row">
        <span class="detail-copy">Google</span>
        <strong>{{ googleStatusLabel }}</strong>
      </div>
      <div v-if="primaryGoogleIdentityEmail" class="summary-row">
        <span class="detail-copy">Google email</span>
        <strong>{{ primaryGoogleIdentityEmail }}</strong>
      </div>
    </div>

    <div class="field-row">
      <label for="account-login-email-change">Change login email</label>
      <Input
        id="account-login-email-change"
        v-model="emailChangeForm.email"
        type="email"
        autocomplete="email"
      />
    </div>

    <div class="flex flex-wrap gap-2">
      <Button :disabled="isSavingEmailChange" @click="requestEmailChange">
        {{ isSavingEmailChange ? "Sending change..." : "Change login email" }}
      </Button>
    </div>

    <p class="field-note">
      Supabase handles the confirmation email. Once the change is confirmed, the app will sync the new address where
      account-owned records need it.
    </p>

    <div class="field-row" v-if="hasPasswordIdentity">
      <label for="account-current-password">Current password</label>
      <Input
        id="account-current-password"
        v-model="passwordForm.currentPassword"
        type="password"
        autocomplete="current-password"
      />
    </div>

    <div class="field-row">
      <label for="account-new-password">
        {{ hasPasswordIdentity ? "New password" : "Set a password" }}
      </label>
      <Input
        id="account-new-password"
        v-model="passwordForm.newPassword"
        type="password"
        autocomplete="new-password"
      />
    </div>

    <div class="field-row">
      <label for="account-confirm-password">Confirm new password</label>
      <Input
        id="account-confirm-password"
        v-model="passwordForm.confirmPassword"
        type="password"
        autocomplete="new-password"
      />
    </div>

    <div class="flex flex-wrap gap-2">
      <Button :disabled="isSavingPassword" @click="savePassword">
        {{ isSavingPassword ? "Saving password..." : passwordActionLabel }}
      </Button>
    </div>

    <p class="field-note">{{ passwordActionDescription }}</p>

    <div class="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        :disabled="googleActionInProgress || !canConnectGoogle"
        @click="connectGoogle"
      >
        {{ connectButtonLabel }}
      </Button>
      <Button
        v-if="hasGoogleIdentity"
        variant="secondary"
        :disabled="googleActionInProgress || !canReconnectGoogle"
        @click="reconnectGoogle"
      >
        {{ reconnectButtonLabel }}
      </Button>
      <Button
        variant="secondary"
        :disabled="googleActionInProgress || !hasGoogleIdentity || !canDisconnectGoogle"
        @click="disconnectGoogle"
      >
        {{ disconnectButtonLabel }}
      </Button>
    </div>

    <p v-if="hasGoogleIdentity && !hasPasswordIdentity" class="field-note">
      Add a password before disconnecting or reconnecting Google so the account keeps another sign-in method.
    </p>
    <p v-if="hasGoogleIdentity && !googleIdentityMatchesLoginEmail" class="field-note">
      The linked Google email must match the login email. Sign in with password, then reconnect Google using the same
      Gmail address.
    </p>
    <p v-if="!hasGoogleIdentity && !currentLoginEmailIsGmail" class="field-note">
      Google linking is only available for Gmail login emails in this app.
    </p>
    <p v-if="hasGoogleIdentity && hasPasswordIdentity" class="field-note">
      Reconnect replaces the linked Google identity. Finish Google sign-in with the Gmail account you want connected.
    </p>

    <div v-if="showForgotPasswordAction" class="flex flex-wrap gap-2">
      <Button variant="secondary" :disabled="isSigningOut" @click="signOutAndClear">
        {{ isSigningOut ? "Opening login..." : "Go to login for forgot password" }}
      </Button>
    </div>

    <p class="field-note">
      Use forgot password from the login page when you no longer know the current password. If Google linking fails,
      enable manual identity linking in Supabase Auth for the Google provider first.
    </p>
  </div>
</template>
