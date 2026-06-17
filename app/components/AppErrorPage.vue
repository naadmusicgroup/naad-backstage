<script setup lang="ts">
import { ArrowLeft, Home, RefreshCw } from "lucide-vue-next"
import { Button } from "@/components/ui/button"

const props = withDefaults(
  defineProps<{
    statusCode?: number
    eyebrow?: string
    title?: string
    description?: string
    supportMessage?: string
    showRetry?: boolean
  }>(),
  {
    statusCode: 500,
    eyebrow: "System error",
    title: "Something went wrong",
    description: "The app hit an unexpected issue. You can retry the page or return to the dashboard.",
    supportMessage: "",
    showRetry: true,
  },
)
const emit = defineEmits<{
  home: []
  retry: []
}>()

const brandLogoSources = {
  avif: "/logo-512.avif",
  webp: "/logo-512.webp",
  png: "/logo-512.png",
}

function goBack() {
  if (window.history.length > 1) {
    window.history.back()
    return
  }

  void navigateTo("/")
}
</script>

<template>
  <main class="error-page">
    <section class="error-shell" aria-labelledby="error-title">
      <header class="error-head">
        <NuxtLink to="/" class="error-brand" aria-label="Naad Backstage home" @click="emit('home')">
          <picture>
            <source :srcset="brandLogoSources.avif" type="image/avif">
            <source :srcset="brandLogoSources.webp" type="image/webp">
            <img
              :src="brandLogoSources.png"
              alt="Naad Backstage"
              class="error-brand-logo"
              width="512"
              height="206"
              decoding="async"
            >
          </picture>
        </NuxtLink>
        <span class="error-status" aria-label="Error code">{{ props.statusCode }}</span>
      </header>

      <div class="error-content">
        <p class="error-eyebrow">{{ props.eyebrow }}</p>
        <h1 id="error-title" class="error-title">{{ props.title }}</h1>
        <p class="error-description">{{ props.description }}</p>
        <p v-if="props.supportMessage" class="error-support">
          {{ props.supportMessage }}
        </p>
      </div>

      <div class="error-actions">
        <Button variant="default" class="error-action" as-child>
          <NuxtLink to="/" @click="emit('home')">
            <Home :size="16" aria-hidden="true" />
            Home
          </NuxtLink>
        </Button>
        <Button v-if="props.showRetry" variant="outline" class="error-action" @click="emit('retry')">
          <RefreshCw :size="16" aria-hidden="true" />
          Retry
        </Button>
        <Button variant="ghost" class="error-action" @click="goBack">
          <ArrowLeft :size="16" aria-hidden="true" />
          Back
        </Button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.error-page {
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 32px;
  background: var(--background);
  color: var(--foreground);
}

.error-shell {
  display: grid;
  width: min(100%, 520px);
  gap: 40px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--card);
  box-shadow: var(--shadow-lg);
  padding: clamp(32px, 5vw, 48px);
}

.error-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.error-brand {
  display: inline-flex;
  width: fit-content;
  align-items: center;
}

.error-brand-logo {
  display: block;
  width: 132px;
  height: auto;
  object-fit: contain;
}

.error-status {
  font-family: var(--font-app-mono);
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  color: color-mix(in srgb, var(--muted-foreground) 70%, transparent);
}

.error-content {
  display: grid;
  gap: 14px;
}

.error-eyebrow {
  margin: 0;
  color: var(--priority);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.error-title {
  margin: 0;
  max-width: 14ch;
  font-family: var(--font-app-display);
  font-size: clamp(2.25rem, 5vw, 2.875rem);
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1.02;
}

.error-description {
  max-width: 42ch;
  margin: 0;
  color: var(--muted-foreground);
  font-size: 0.9375rem;
  line-height: 1.65;
}

.error-support {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  max-width: 100%;
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: var(--muted-foreground);
  font-family: var(--font-app-mono);
  font-size: 0.78rem;
  line-height: 1.5;
}

.error-support::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--destructive) 80%, transparent);
}

.error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.error-action {
  gap: 8px;
}

@media (max-width: 560px) {
  .error-page {
    align-items: center;
    padding: 20px;
  }

  .error-shell {
    border-radius: 18px;
    gap: 32px;
  }

  .error-brand-logo {
    width: 118px;
  }

  .error-actions {
    display: grid;
  }

  .error-action {
    width: 100%;
  }
}
</style>
