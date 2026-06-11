<script setup lang="ts">
const props = defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
    message?: string
  }
}>()

const statusCode = computed(() => props.error?.statusCode || 500)
const isNotFound = computed(() => statusCode.value === 404)
const eyebrow = computed(() => (isNotFound.value ? "Page not found" : "System error"))
const title = computed(() => {
  if (isNotFound.value) {
    return "This page is offstage"
  }

  if (statusCode.value === 503) {
    return "Backstage is briefly unavailable"
  }

  return "Something went wrong"
})
const description = computed(() => {
  if (isNotFound.value) {
    return "The link may be outdated, mistyped, or moved to another part of Naad Backstage."
  }

  if (statusCode.value === 503) {
    return "The service is temporarily unavailable. Try again in a moment."
  }

  return "The app hit an unexpected issue. You can retry the page or return to the dashboard."
})
const supportMessage = computed(() => (isNotFound.value ? "" : props.error?.statusMessage || props.error?.message || ""))

function goHome() {
  void clearError({ redirect: "/" })
}

function retryPage() {
  void clearError({ redirect: useRoute().fullPath })
}
</script>

<template>
  <AppErrorPage
    :status-code="statusCode"
    :eyebrow="eyebrow"
    :title="title"
    :description="description"
    :support-message="supportMessage"
    :show-retry="!isNotFound"
    @home="goHome"
    @retry="retryPage"
  />
</template>
