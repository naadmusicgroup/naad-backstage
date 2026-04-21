<script setup lang="ts">
definePageMeta({
  layout: "admin",
  middleware: ["admin"],
})

await navigateTo(
  {
    path: "/admin/artists",
    query: {
      section: "access",
    },
  },
  {
    replace: true,
  },
)
</script>

<template>
  <div class="page">
    <SectionCard
      title="Redirecting to Artists"
      eyebrow="Compatibility route"
      description="Invite management now lives in the Artists workspace."
    >
      <p class="muted-copy">
        Redirecting to the access queue...
      </p>
    </SectionCard>
  </div>
</template>
