<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true,
})

useHead({
  title: "Page not found | Naad Backstage",
})
</script>

<template>
  <AppErrorPage
    :status-code="404"
    eyebrow="Page not found"
    title="This page is offstage"
    description="The link may be outdated, mistyped, or moved to another part of Naad Backstage."
    :show-retry="false"
  />
</template>
