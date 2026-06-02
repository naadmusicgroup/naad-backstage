<script setup lang="ts">
import GoogleGradientIcon from "@/components/icons/GoogleGradientIcon.vue"
import { Badge } from "@/components/ui/badge"
import { ChevronDown, KeyRound, Mail, Unplug } from "lucide-vue-next"
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
const isEmailPasswordOpen = ref(false)
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
const passwordStatusVariant = computed(() => (hasPasswordIdentity.value ? "success" : "warning"))
const googleStatusVariant = computed(() => {
  if (!hasGoogleIdentity.value) {
    return "muted"
  }

  return googleIdentityMatchesLoginEmail.value ? "success" : "warning"
})
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
        ? `Email change requested. Confirm ${requestedEmail} from the email we sent to finish it.`
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
  <div class="account-login-methods">
    <AppAlert v-if="loginMethodError" variant="destructive">{{ loginMethodError }}</AppAlert>
    <AppAlert v-if="loginMethodSuccess" variant="success">{{ loginMethodSuccess }}</AppAlert>

    <section class="login-method-overview" aria-label="Current login methods">
      <div class="login-method-current">
        <span class="login-method-kicker">Signed in as</span>
        <strong class="login-method-email">{{ currentLoginEmail || "Unavailable" }}</strong>
        <span v-if="pendingLoginEmail" class="login-method-pending">
          Pending change: {{ pendingLoginEmail }}
        </span>
      </div>
      <div class="login-method-statuses">
        <Badge :variant="passwordStatusVariant" class="login-method-badge">
          <KeyRound class="size-3.5" aria-hidden="true" />
          Password {{ emailStatusLabel }}
        </Badge>
        <Badge :variant="googleStatusVariant" class="login-method-badge">
          <GoogleGradientIcon class="google-gradient-mark google-gradient-mark-sm" />
          Google {{ googleStatusLabel }}
        </Badge>
      </div>
    </section>

    <section class="login-method-section login-method-collapsible" aria-labelledby="email-password-heading">
      <header class="login-method-section-header">
        <div class="login-method-heading-row">
          <span class="login-method-icon" aria-hidden="true">
            <KeyRound class="size-4" />
          </span>
          <div>
            <h3 id="email-password-heading">Email & password</h3>
            <p>Change credentials only when needed.</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="login-method-toggle"
          :aria-expanded="isEmailPasswordOpen"
          aria-controls="email-password-panel"
          @click="isEmailPasswordOpen = !isEmailPasswordOpen"
        >
          {{ isEmailPasswordOpen ? "Close" : "Manage" }}
          <ChevronDown class="size-4 login-method-toggle-icon" :class="{ 'is-open': isEmailPasswordOpen }" aria-hidden="true" />
        </Button>
      </header>

      <div v-if="isEmailPasswordOpen" id="email-password-panel" class="login-method-collapsible-panel">
        <div class="login-method-subsection" aria-labelledby="login-email-heading">
          <div>
            <h4 id="login-email-heading">Login email</h4>
            <p>Change the address used for password sign-in.</p>
          </div>

          <div class="login-method-inline-form">
            <div class="field-row">
              <label for="account-login-email-change">New login email</label>
              <Input
                id="account-login-email-change"
                v-model="emailChangeForm.email"
                type="email"
                autocomplete="email"
              />
            </div>

            <Button size="sm" :disabled="isSavingEmailChange" @click="requestEmailChange">
              <Mail class="size-4" aria-hidden="true" />
              {{ isSavingEmailChange ? "Sending..." : "Send confirmation" }}
            </Button>
          </div>
        </div>

        <div class="login-method-subsection" aria-labelledby="password-heading">
          <div class="login-method-subsection-header">
            <div>
              <h4 id="password-heading">Password</h4>
              <p>{{ passwordActionDescription }}</p>
            </div>
            <Button
              v-if="showForgotPasswordAction"
              variant="ghost"
              size="sm"
              :disabled="isSigningOut"
              @click="signOutAndClear"
            >
              {{ isSigningOut ? "Opening login..." : "Forgot password" }}
            </Button>
          </div>

          <div class="login-method-password-grid">
            <div v-if="hasPasswordIdentity" class="field-row">
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
          </div>

          <div class="login-method-actions">
            <Button size="sm" :disabled="isSavingPassword" @click="savePassword">
              <KeyRound class="size-4" aria-hidden="true" />
              {{ isSavingPassword ? "Saving..." : passwordActionLabel }}
            </Button>
          </div>
        </div>
      </div>
    </section>

    <section class="login-method-section" aria-labelledby="google-heading">
      <header class="login-method-section-header">
        <div class="login-method-heading-row">
          <span class="login-method-icon login-method-icon-google" aria-hidden="true">
            <GoogleGradientIcon class="google-gradient-mark google-gradient-mark-lg" />
          </span>
          <div>
            <h3 id="google-heading">Google sign-in</h3>
            <p>
              {{
                primaryGoogleIdentityEmail
                  ? `Linked to ${primaryGoogleIdentityEmail}.`
                  : "Connect a Gmail account for Google sign-in."
              }}
            </p>
          </div>
        </div>
      </header>

      <div class="login-method-actions">
        <Button
          v-if="!hasGoogleIdentity"
          variant="secondary"
          size="sm"
          :disabled="googleActionInProgress || !canConnectGoogle"
          @click="connectGoogle"
        >
          <GoogleGradientIcon class="google-gradient-mark" />
          {{ connectButtonLabel }}
        </Button>
        <Button
          v-if="hasGoogleIdentity"
          variant="secondary"
          size="sm"
          :disabled="googleActionInProgress || !canReconnectGoogle"
          @click="reconnectGoogle"
        >
          <GoogleGradientIcon class="google-gradient-mark" />
          {{ reconnectButtonLabel }}
        </Button>
        <Button
          v-if="hasGoogleIdentity"
          variant="secondary"
          size="sm"
          :disabled="googleActionInProgress || !canDisconnectGoogle"
          @click="disconnectGoogle"
        >
          <Unplug class="size-4" aria-hidden="true" />
          {{ disconnectButtonLabel }}
        </Button>
      </div>

      <p v-if="hasGoogleIdentity && !hasPasswordIdentity" class="login-method-note">
        Set a password before changing Google. That keeps the account from getting locked out.
      </p>
      <p v-else-if="hasGoogleIdentity && !googleIdentityMatchesLoginEmail" class="login-method-note">
        Google should match the login email. Use password sign-in, then reconnect Google with the right Gmail.
      </p>
      <p v-else-if="!hasGoogleIdentity && !currentLoginEmailIsGmail" class="login-method-note">
        Google sign-in is available only when the login email is a Gmail address.
      </p>
    </section>

    <details class="login-method-help">
      <summary>Connection help</summary>
      <p>
        Email changes are completed from the confirmation email. If Google linking fails, contact Naad Backstage support.
      </p>
    </details>
  </div>
</template>

<style scoped>
.account-login-methods {
  display: grid;
  gap: 22px;
}

.login-method-overview {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border);
}

.login-method-current {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.login-method-kicker {
  color: var(--muted-foreground);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0;
  text-transform: uppercase;
}

.login-method-email {
  overflow-wrap: anywhere;
  font-size: 18px;
  font-weight: 750;
  line-height: 1.25;
}

.login-method-pending,
.login-method-note,
.login-method-help p {
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
}

.login-method-statuses,
.login-method-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.login-method-statuses {
  justify-content: flex-end;
}

.login-method-badge {
  min-height: 26px;
}

.login-method-section {
  display: grid;
  gap: 14px;
}

.login-method-section + .login-method-section,
.login-method-help {
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.login-method-section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.login-method-heading-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}

.login-method-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 8%, transparent);
}

.login-method-icon-google {
  background: var(--card);
}

.login-method-toggle {
  flex: 0 0 auto;
}

.login-method-toggle-icon {
  transition: transform 0.16s ease;
}

.login-method-toggle-icon.is-open {
  transform: rotate(180deg);
}

.account-login-methods :deep(.google-gradient-mark) {
  display: block;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.account-login-methods :deep(.google-gradient-mark-sm) {
  width: 14px;
  height: 14px;
}

.account-login-methods :deep(.google-gradient-mark-lg) {
  width: 19px;
  height: 19px;
}

.login-method-section h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 750;
  line-height: 1.25;
}

.login-method-subsection h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 750;
  line-height: 1.25;
}

.login-method-section p {
  margin: 3px 0 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.45;
}

.login-method-collapsible-panel {
  display: grid;
  gap: 18px;
  padding: 16px 0 2px;
  border-top: 1px solid var(--border);
}

.login-method-subsection {
  display: grid;
  gap: 12px;
}

.login-method-subsection + .login-method-subsection {
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

.login-method-subsection-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.login-method-inline-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 12px;
}

.login-method-password-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.account-login-methods .field-row {
  gap: 6px;
}

.account-login-methods .field-row label {
  font-size: 13px;
}

.account-login-methods :deep(.premium-box-button) {
  border-color: var(--border);
  background: color-mix(in srgb, var(--card) 82%, var(--foreground) 3%);
  color: var(--foreground);
  box-shadow: none;
}

.account-login-methods :deep(.premium-box-button:hover:not(:disabled)) {
  border-color: color-mix(in srgb, var(--primary) 38%, var(--border));
  background: color-mix(in srgb, var(--primary) 10%, var(--card));
  color: var(--foreground);
  box-shadow: none;
}

.account-login-methods :deep(.premium-box-button:disabled) {
  border-color: var(--border);
  background: var(--muted);
  color: var(--muted-foreground);
  opacity: 0.76;
}

.login-method-note {
  margin: -4px 0 0;
  max-width: 64ch;
}

.login-method-help {
  color: var(--muted-foreground);
}

.login-method-help summary {
  width: fit-content;
  cursor: pointer;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
}

.login-method-help p {
  margin: 8px 0 0;
  max-width: 72ch;
}

@media (max-width: 760px) {
  .login-method-overview,
  .login-method-section-header,
  .login-method-subsection-header {
    display: grid;
    justify-content: stretch;
  }

  .login-method-toggle {
    width: fit-content;
  }

  .login-method-statuses {
    justify-content: flex-start;
  }

  .login-method-inline-form {
    grid-template-columns: 1fr;
  }

  .login-method-inline-form .premium-box-button,
  .login-method-actions .premium-box-button {
    width: 100%;
  }
}
</style>
