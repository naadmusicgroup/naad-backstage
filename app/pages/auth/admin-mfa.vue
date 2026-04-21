<script setup lang="ts">
import { destinationForViewer } from "~/utils/auth-routing"

definePageMeta({
  layout: "default",
})

const { refreshViewerContext } = useViewerContext()
const context = await refreshViewerContext(true)
await navigateTo(destinationForViewer(context), { replace: true })
</script>

<template>
  <div class="page">
    <SectionCard
      title="Redirecting"
      eyebrow="Access"
      description="Authenticator-app verification is no longer required. Sending you to the right dashboard now."
    >
      <p class="status-message">Redirecting...</p>
    </SectionCard>
  </div>
</template>
