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

      <div class="error-content">
        <span class="error-engraving" aria-hidden="true">
          <EmptyEngraving name="compass" />
        </span>
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
            <Home :size="18" aria-hidden="true" />
            Home
          </NuxtLink>
        </Button>
        <Button v-if="props.showRetry" variant="secondary" class="error-action" @click="emit('retry')">
          <RefreshCw :size="18" aria-hidden="true" />
          Retry
        </Button>
        <Button variant="ghost" class="error-action" @click="goBack">
          <ArrowLeft :size="18" aria-hidden="true" />
          Back
        </Button>
      </div>

      <div class="error-code" aria-label="Error code">
        {{ props.statusCode }}
      </div>
    </section>
  </main>
</template>

<style scoped>
.error-page {
  min-height: 100svh;
  display: grid;
  place-items: center;
  padding: 28px;
  background:
    radial-gradient(circle at 16% 12%, color-mix(in srgb, var(--priority) 14%, transparent), transparent 32%),
    linear-gradient(135deg, var(--background), color-mix(in srgb, var(--background) 84%, var(--foreground) 6%));
  color: var(--foreground);
}

.error-shell {
  position: relative;
  isolation: isolate;
  display: grid;
  width: min(100%, 760px);
  min-height: 520px;
  align-content: center;
  gap: 28px;
  overflow: hidden;
  border: 1px solid var(--glass-border, color-mix(in srgb, var(--surface-border, var(--border)) 88%, transparent));
  border-radius: 24px;
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--glass-specular, rgba(255,255,255,0.4)) 36%, transparent) 0%, transparent 18%),
    linear-gradient(145deg, var(--glass-bg-0, var(--card)) 0%, var(--glass-bg-1, var(--card)) 100%),
    var(--card);
  box-shadow: var(--shadow-lg), var(--glow-gold-soft, none);
  padding: clamp(28px, 5vw, 56px);
}

.error-shell::before {
  position: absolute;
  inset: 22px;
  z-index: -1;
  border: 1px solid color-mix(in srgb, var(--foreground) 8%, transparent);
  border-radius: 18px;
  content: "";
}

.error-brand {
  display: inline-flex;
  width: fit-content;
  align-items: center;
}

.error-brand-logo {
  display: block;
  width: 170px;
  height: auto;
  object-fit: contain;
}

.error-content {
  display: grid;
  max-width: 560px;
  gap: 12px;
}

.error-engraving {
  display: block;
  width: 84px;
  height: 84px;
  margin-bottom: 4px;
}

.error-eyebrow {
  margin: 0;
  color: var(--priority);
  font-size: var(--text-caption-size);
  font-weight: var(--text-caption-weight);
  letter-spacing: 0;
  text-transform: uppercase;
}

.error-title {
  margin: 0;
  max-width: 12ch;
  font-family: var(--font-app-display);
  font-size: 4rem;
  font-weight: var(--text-display-weight);
  letter-spacing: 0;
  line-height: 0.96;
}

.error-description {
  max-width: 520px;
  margin: 0;
  color: var(--muted-foreground);
  font-size: var(--text-body-size);
  line-height: var(--text-body-line-height);
}

.error-support {
  width: fit-content;
  max-width: 100%;
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  border: 1px solid color-mix(in srgb, var(--destructive) 22%, var(--border));
  border-radius: 12px;
  background: color-mix(in srgb, var(--destructive) 8%, transparent);
  color: color-mix(in srgb, var(--foreground) 82%, var(--destructive));
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.45;
}

.error-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.error-action {
  gap: 8px;
}

.error-code {
  position: absolute;
  right: clamp(24px, 5vw, 54px);
  bottom: clamp(18px, 4vw, 38px);
  z-index: -1;
  color: color-mix(in srgb, var(--foreground) 8%, transparent);
  font-family: var(--font-app-mono);
  font-size: 11rem;
  font-weight: 800;
  letter-spacing: 0;
  line-height: 0.8;
  pointer-events: none;
}

@media (max-width: 560px) {
  .error-page {
    align-items: stretch;
    padding: 16px;
  }

  .error-shell {
    min-height: calc(100svh - 32px);
    border-radius: 18px;
    padding: 26px;
  }

  .error-shell::before {
    inset: 14px;
    border-radius: 14px;
  }

  .error-brand-logo {
    width: 142px;
  }

  .error-title {
    font-size: 2.75rem;
  }

  .error-code {
    right: 18px;
    bottom: 18px;
    font-size: 6rem;
  }

  .error-actions {
    display: grid;
  }

  .error-action {
    width: 100%;
  }
}
</style>
