<script setup lang="ts">
import type { User, UserIdentity } from "@supabase/supabase-js"
import type { ArtistSettingsResponse } from "~~/types/settings"

definePageMeta({
  layout: "artist",
  middleware: ["artist"],
})

interface AuthAccountSummary {
  email: string | null
  pendingEmail: string | null
}

const supabase = useSupabaseClient()
const user = useSupabaseUser()
const runtimeConfig = useRuntimeConfig()
const { refreshViewerContext } = useViewerContext()
const { signOutAndClear, isSigningOut } = useAuthSecurity()
const { activeArtistId } = useActiveArtist()

const { data, error, pending, refresh } = await useFetch<ArtistSettingsResponse>("/api/dashboard/settings")

const selectedArtistId = activeArtistId
const isSavingProfile = ref(false)
const isSavingBankDetails = ref(false)
const isLinkingGoogle = ref(false)
const isUnlinkingGoogle = ref(false)
const isSavingPassword = ref(false)
const isSavingEmailChange = ref(false)
const successMessage = ref("")
const errorMessage = ref("")
const loginMethodSuccess = ref("")
const loginMethodError = ref("")
const linkedIdentities = ref<UserIdentity[]>([])
const authAccount = ref<AuthAccountSummary>({
  email: null,
  pendingEmail: null,
})

const profileForm = reactive({
  fullName: "",
  phone: "",
})

const artistForm = reactive({
  avatarUrl: "",
  country: "",
  bio: "",
})

const bankForm = reactive({
  accountName: "",
  bankName: "",
  accountNumber: "",
  bankAddress: "",
})

const passwordForm = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
})

const emailChangeForm = reactive({
  email: "",
})

const artists = computed(() => data.value?.artists ?? [])
const selectedArtist = computed(() => artists.value.find((artist) => artist.artistId === selectedArtistId.value) ?? null)
const publishingInfo = computed(() => selectedArtist.value?.publishingInfo ?? null)
const linkedProviders = computed(() => [...new Set(linkedIdentities.value.map((identity) => identity.provider))])
const hasPasswordIdentity = computed(() => linkedProviders.value.includes("email"))
const hasGoogleIdentity = computed(() => linkedProviders.value.includes("google"))
const hasAlternativeLoginMethod = computed(() => linkedProviders.value.some((provider) => provider !== "google"))
const canDisconnectGoogle = computed(() => hasGoogleIdentity.value && hasAlternativeLoginMethod.value)
const currentLoginEmail = computed(() => authAccount.value.email || data.value?.profile.email || null)
const pendingLoginEmail = computed(() => authAccount.value.pendingEmail)
const currentLoginEmailIsGmail = computed(() => isGmailLoginEmail(currentLoginEmail.value))
const canConnectGoogle = computed(() => !hasGoogleIdentity.value && currentLoginEmailIsGmail.value)
const emailStatusLabel = computed(() => (hasPasswordIdentity.value ? "Connected" : "Not connected"))
const googleStatusLabel = computed(() => (hasGoogleIdentity.value ? "Connected" : "Not connected"))
const passwordActionLabel = computed(() => (hasPasswordIdentity.value ? "Change password" : "Set password"))
const passwordActionDescription = computed(() =>
  hasPasswordIdentity.value
    ? "Update the password tied to this account."
    : "Add a password so this account can sign in without Google.",
)

watch(
  () => data.value?.profile,
  (profile) => {
    if (!profile) {
      return
    }

    profileForm.fullName = profile.fullName
    profileForm.phone = profile.phone ?? ""
  },
  { immediate: true },
)

watch(
  artists,
  (value) => {
    if (!value.length) {
      selectedArtistId.value = ""
      return
    }

    if (!value.some((artist) => artist.artistId === selectedArtistId.value)) {
      selectedArtistId.value = value[0].artistId
    }
  },
  { immediate: true },
)

watch(
  selectedArtist,
  (artist) => {
    artistForm.avatarUrl = artist?.avatarUrl ?? ""
    artistForm.country = artist?.country ?? ""
    artistForm.bio = artist?.bio ?? ""
    bankForm.accountName = artist?.bankDetails?.accountName ?? ""
    bankForm.bankName = artist?.bankDetails?.bankName ?? ""
    bankForm.accountNumber = artist?.bankDetails?.accountNumber ?? ""
    bankForm.bankAddress = artist?.bankDetails?.bankAddress ?? ""
  },
  { immediate: true },
)

watch(
  currentLoginEmail,
  (email) => {
    if (!emailChangeForm.email || emailChangeForm.email === authAccount.value.pendingEmail) {
      emailChangeForm.email = email ?? ""
    }
  },
  { immediate: true },
)

function normalizeLoginEmail(value: string) {
  const normalized = value.trim().toLowerCase()

  if (!normalized || !normalized.includes("@")) {
    throw new Error("Enter a valid login email.")
  }

  return normalized
}

function isGmailLoginEmail(value: string | null) {
  return /@gmail\.com$/i.test(value?.trim() ?? "")
}

function resetMessages() {
  successMessage.value = ""
  errorMessage.value = ""
}

function setError(error: any, fallback: string) {
  errorMessage.value = error?.data?.statusMessage || error?.message || fallback
  successMessage.value = ""
}

function setSuccess(message: string) {
  successMessage.value = message
  errorMessage.value = ""
}

function resetLoginMethodMessages() {
  loginMethodSuccess.value = ""
  loginMethodError.value = ""
}

function setLoginMethodError(error: any, fallback: string) {
  loginMethodError.value = error?.data?.statusMessage || error?.message || fallback
  loginMethodSuccess.value = ""
}

function setLoginMethodSuccess(message: string) {
  loginMethodSuccess.value = message
  loginMethodError.value = ""
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

onMounted(() => {
  refreshLoginMethods()
})

async function saveProfile() {
  if (!selectedArtist.value) {
    errorMessage.value = "No artist profile is available for this account."
    return
  }

  isSavingProfile.value = true
  resetMessages()

  try {
    await $fetch("/api/dashboard/settings", {
      method: "PATCH",
      body: {
        profile: {
          fullName: profileForm.fullName,
          phone: profileForm.phone || null,
        },
        artist: {
          artistId: selectedArtist.value.artistId,
          avatarUrl: artistForm.avatarUrl || null,
          country: artistForm.country || null,
          bio: artistForm.bio || null,
        },
      },
    })

    await Promise.all([refresh(), refreshViewerContext(true)])
    setSuccess(`Saved profile details for ${selectedArtist.value.artistName}.`)
  } catch (error: any) {
    setError(error, "Unable to save your profile details.")
  } finally {
    isSavingProfile.value = false
  }
}

async function saveBankDetails() {
  if (!selectedArtist.value) {
    errorMessage.value = "No artist profile is available for this account."
    return
  }

  isSavingBankDetails.value = true
  resetMessages()

  try {
    await $fetch("/api/dashboard/settings", {
      method: "PATCH",
      body: {
        bankDetails: {
          artistId: selectedArtist.value.artistId,
          accountName: bankForm.accountName,
          bankName: bankForm.bankName,
          accountNumber: bankForm.accountNumber,
          bankAddress: bankForm.bankAddress || null,
        },
      },
    })

    await refresh()
    setSuccess(`Saved bank details for ${selectedArtist.value.artistName}.`)
  } catch (error: any) {
    setError(error, "Unable to save your bank details.")
  } finally {
    isSavingBankDetails.value = false
  }
}

async function connectGoogle() {
  if (!currentLoginEmailIsGmail.value) {
    loginMethodError.value = "Google linking is limited to Gmail login emails in this app."
    return
  }

  isLinkingGoogle.value = true
  resetLoginMethodMessages()

  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: {
      redirectTo: `${runtimeConfig.public.siteUrl}/auth/callback`,
    },
  })

  if (error) {
    setLoginMethodError(error, "Unable to start Google linking.")
    isLinkingGoogle.value = false
  }
}

async function disconnectGoogle() {
  resetLoginMethodMessages()

  if (!canDisconnectGoogle.value) {
    loginMethodError.value = "Set a password before disconnecting Google so this account keeps another sign-in method."
    return
  }

  const googleIdentity = linkedIdentities.value.find((identity) => identity.provider === "google")

  if (!googleIdentity) {
    loginMethodError.value = "Google is not currently linked to this account."
    return
  }

  isUnlinkingGoogle.value = true

  try {
    const { error } = await supabase.auth.unlinkIdentity(googleIdentity)

    if (error) {
      throw error
    }

    await refreshLoginMethods()
    setLoginMethodSuccess("Google sign-in removed. Your remaining login method still works.")
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
    loginMethodError.value = "Choose a password with at least 8 characters."
    return
  }

  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    loginMethodError.value = "The new password confirmation does not match."
    return
  }

  if (hasPasswordIdentity.value && !passwordForm.currentPassword) {
    loginMethodError.value = "Enter your current password to change it."
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
        : "Password login added. You can now sign in with email/password or Google.",
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
    loginMethodError.value = "That is already the current login email for this account."
    return
  }

  if (hasGoogleIdentity.value && !isGmailLoginEmail(nextEmail)) {
    loginMethodError.value = "Change the login email to another Gmail address while Google sign-in is linked."
    return
  }

  isSavingEmailChange.value = true

  try {
    const { data: updateResult, error } = await supabase.auth.updateUser(
      { email: nextEmail },
      {
        emailRedirectTo: `${runtimeConfig.public.siteUrl}/auth/callback`,
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
  <div class="page">
    <SectionCard
      title="Account settings"
      eyebrow="Artist self-service"
      description="Profile edits stay narrow here: identity, artist-facing bio/media, bank details, and linked login methods."
    >
      <div v-if="error" class="banner error">
        {{ error.statusMessage || "Unable to load account settings right now." }}
        <div class="button-row">
          <button class="button button-secondary" @click="() => refresh()">Retry</button>
        </div>
      </div>

      <div v-else-if="pending" class="status-message">Loading account settings...</div>

      <div v-else-if="!artists.length" class="muted-copy">
        No active artist profile is attached to this login.
      </div>

      <div v-else class="form-grid">
        <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
        <div v-if="successMessage" class="banner">{{ successMessage }}</div>

        <div class="field-row">
          <label for="settings-artist">Artist profile</label>
          <select id="settings-artist" v-model="selectedArtistId" class="input">
            <option v-for="artist in artists" :key="artist.artistId" :value="artist.artistId">
              {{ artist.artistName }}
            </option>
          </select>
        </div>
      </div>
    </SectionCard>

    <div v-if="artists.length" class="panel-grid">
      <SectionCard
        title="Profile details"
        eyebrow="Editable"
        description="Full name and phone are account-level. Avatar, country, and bio apply to the selected artist profile."
      >
        <div class="form-grid">
          <div class="field-row">
            <label for="settings-full-name">Full name</label>
            <input id="settings-full-name" v-model="profileForm.fullName" class="input" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-phone">Phone</label>
            <input id="settings-phone" v-model="profileForm.phone" class="input" type="tel" />
          </div>

          <div class="field-row">
            <label for="settings-email">Login email</label>
            <input id="settings-email" :value="currentLoginEmail || ''" class="input" type="email" disabled />
          </div>

          <div class="field-row">
            <label for="settings-avatar-url">Avatar URL</label>
            <input id="settings-avatar-url" v-model="artistForm.avatarUrl" class="input" type="url" />
          </div>

          <div class="field-row">
            <label for="settings-country">Country</label>
            <input id="settings-country" v-model="artistForm.country" class="input" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-bio">Bio</label>
            <textarea id="settings-bio" v-model="artistForm.bio" class="input" rows="4" />
          </div>

          <div class="button-row">
            <button class="button" :disabled="isSavingProfile" @click="saveProfile">
              {{ isSavingProfile ? "Saving..." : "Save profile" }}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Bank details"
        eyebrow="Payout destination"
        description="Admins use this information when they manually complete approved payout requests."
      >
        <div class="form-grid">
          <div class="field-row">
            <label for="settings-account-name">Account name</label>
            <input id="settings-account-name" v-model="bankForm.accountName" class="input" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-bank-name">Bank name</label>
            <input id="settings-bank-name" v-model="bankForm.bankName" class="input" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-account-number">Account number</label>
            <input id="settings-account-number" v-model="bankForm.accountNumber" class="input" type="text" />
          </div>

          <div class="field-row">
            <label for="settings-bank-address">Bank address</label>
            <textarea id="settings-bank-address" v-model="bankForm.bankAddress" class="input" rows="3" />
          </div>

          <div class="button-row">
            <button class="button" :disabled="isSavingBankDetails" @click="saveBankDetails">
              {{ isSavingBankDetails ? "Saving..." : "Save bank details" }}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>

    <div v-if="artists.length" class="panel-grid">
      <SectionCard
        title="Connected login methods"
        eyebrow="Access"
        description="Account access is managed here for the whole login, not just the selected artist profile."
      >
        <div class="form-grid">
          <div v-if="loginMethodError" class="banner error">{{ loginMethodError }}</div>
          <div v-if="loginMethodSuccess" class="banner">{{ loginMethodSuccess }}</div>

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
          </div>

          <div class="field-row">
            <label for="settings-login-email-change">Change login email</label>
            <input
              id="settings-login-email-change"
              v-model="emailChangeForm.email"
              class="input"
              type="email"
              autocomplete="email"
            />
          </div>

          <div class="button-row">
            <button class="button" :disabled="isSavingEmailChange" @click="requestEmailChange">
              {{ isSavingEmailChange ? "Sending change..." : "Change login email" }}
            </button>
          </div>

          <p class="field-note">
            Supabase handles the confirmation email. Once the change is confirmed, the app will sync the new address
            across all artist records on the same account.
          </p>

          <div class="field-row" v-if="hasPasswordIdentity">
            <label for="settings-current-password">Current password</label>
            <input
              id="settings-current-password"
              v-model="passwordForm.currentPassword"
              class="input"
              type="password"
              autocomplete="current-password"
            />
          </div>

          <div class="field-row">
            <label for="settings-new-password">
              {{ hasPasswordIdentity ? "New password" : "Set a password" }}
            </label>
            <input
              id="settings-new-password"
              v-model="passwordForm.newPassword"
              class="input"
              type="password"
              autocomplete="new-password"
            />
          </div>

          <div class="field-row">
            <label for="settings-confirm-password">Confirm new password</label>
            <input
              id="settings-confirm-password"
              v-model="passwordForm.confirmPassword"
              class="input"
              type="password"
              autocomplete="new-password"
            />
          </div>

          <div class="button-row">
            <button class="button" :disabled="isSavingPassword" @click="savePassword">
              {{ isSavingPassword ? "Saving password..." : passwordActionLabel }}
            </button>
          </div>

          <p class="field-note">{{ passwordActionDescription }}</p>

          <div class="button-row">
            <button
              class="button button-secondary"
              :disabled="isLinkingGoogle || !canConnectGoogle"
              @click="connectGoogle"
            >
              {{
                hasGoogleIdentity
                  ? "Google already linked"
                  : !currentLoginEmailIsGmail
                    ? "Gmail required"
                  : isLinkingGoogle
                    ? "Redirecting..."
                    : "Connect Google"
              }}
            </button>
            <button
              class="button button-secondary"
              :disabled="isUnlinkingGoogle || !hasGoogleIdentity || !canDisconnectGoogle"
              @click="disconnectGoogle"
            >
              {{
                isUnlinkingGoogle
                  ? "Disconnecting..."
                  : canDisconnectGoogle
                    ? "Disconnect Google"
                    : "Set password first"
              }}
            </button>
          </div>

          <p v-if="hasGoogleIdentity && !canDisconnectGoogle" class="field-note">
            Add a password before disconnecting Google so the account keeps another sign-in method.
          </p>
          <p v-if="!hasGoogleIdentity && !currentLoginEmailIsGmail" class="field-note">
            Google linking is only available for Gmail login emails in this app.
          </p>

          <div class="button-row">
            <button class="button button-secondary" :disabled="isSigningOut" @click="signOutAndClear">
              {{ isSigningOut ? "Opening login..." : "Go to login for forgot password" }}
            </button>
          </div>

          <p class="field-note">
            Use forgot password from the login page when you no longer know the current password. If Google linking
            fails, enable manual identity linking in Supabase Auth for the Google provider first.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Publishing info"
        eyebrow="Read only"
        description="Admins manage this for contracts and collection societies. Artists can view it here but cannot edit it."
      >
        <div v-if="publishingInfo" class="summary-table">
          <div class="summary-row">
            <span class="detail-copy">Legal name</span>
            <strong>{{ publishingInfo.legalName || "Not set" }}</strong>
          </div>
          <div class="summary-row">
            <span class="detail-copy">IPI / CAE</span>
            <strong>{{ publishingInfo.ipiNumber || "Not set" }}</strong>
          </div>
          <div class="summary-row">
            <span class="detail-copy">PRO</span>
            <strong>{{ publishingInfo.proName || "Not set" }}</strong>
          </div>
        </div>

        <p v-else class="muted-copy">
          Publishing info has not been entered for this artist yet.
        </p>
      </SectionCard>
    </div>
  </div>
</template>
