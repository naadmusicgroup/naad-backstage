<script setup lang="ts">
interface SetupStatus {
  schemaReady: boolean
  profileCount: number
  adminCount: number
  needsBootstrap: boolean
}

definePageMeta({
  layout: "default",
})

const form = reactive({
  fullName: "",
  email: "",
  password: "",
})

const isSubmitting = ref(false)
const successMessage = ref("")
const errorMessage = ref("")

const { data: setupStatus, error: setupStatusError, pending: setupStatusPending, refresh } =
  await useFetch<SetupStatus>("/api/setup/status")

async function bootstrapAdmin() {
  isSubmitting.value = true
  successMessage.value = ""
  errorMessage.value = ""

  try {
    await $fetch("/api/setup/bootstrap-admin", {
      method: "POST",
      body: form,
    })

    successMessage.value = "The first admin account was created. You can sign in now."
    await refresh()
    await navigateTo("/login")
  } catch (error: any) {
    errorMessage.value = error?.data?.statusMessage || error?.message || "Unable to create the first admin."
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="split-grid">
      <SectionCard
        title="Create the first admin"
        eyebrow="Project setup"
        description="This screen should be used exactly once. After the first admin exists, the normal login flow takes over."
      >
        <div v-if="setupStatusError" class="banner error">
          {{ setupStatusError.statusMessage || "Unable to check setup status right now." }}
        </div>

        <div v-else-if="setupStatusPending" class="banner">Checking project bootstrap status...</div>

        <div v-else-if="setupStatus && !setupStatus.schemaReady" class="banner error">
          Database setup is not complete yet. Apply the Supabase SQL migrations before creating the first admin.
        </div>

        <div v-else-if="setupStatus && !setupStatus.needsBootstrap" class="banner">
          The first admin already exists for this project. Use the normal login page instead.
        </div>

        <div v-else class="form-grid">
          <div v-if="errorMessage" class="banner error">{{ errorMessage }}</div>
          <div v-if="successMessage" class="banner">{{ successMessage }}</div>

          <div class="field-row">
            <label for="setup-full-name">Full name</label>
            <input id="setup-full-name" v-model="form.fullName" class="input" type="text" autocomplete="name" />
          </div>

          <div class="field-row">
            <label for="setup-email">Email</label>
            <input id="setup-email" v-model="form.email" class="input" type="email" autocomplete="email" />
          </div>

          <div class="field-row">
            <label for="setup-password">Password</label>
            <input
              id="setup-password"
              v-model="form.password"
              class="input"
              type="password"
              autocomplete="new-password"
            />
          </div>

          <div class="button-row">
            <button class="button" :disabled="isSubmitting || !setupStatus?.needsBootstrap" @click="bootstrapAdmin">
              {{ isSubmitting ? "Creating admin..." : "Create first admin" }}
            </button>
            <NuxtLink to="/login" class="button button-secondary">Back to login</NuxtLink>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="What this does"
        eyebrow="Bootstrap rules"
        description="The bootstrap route creates the auth user and the matching application profile in one server-side action."
      >
        <ul class="list">
          <li>Creates a Supabase Auth user with confirmed email.</li>
          <li>Creates the matching `profiles` row with `role = admin`.</li>
          <li>Locks itself after the first admin profile exists.</li>
          <li>Keeps the secret key on the server only.</li>
        </ul>
      </SectionCard>
    </div>
  </div>
</template>
