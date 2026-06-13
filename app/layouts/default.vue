<script setup lang="ts">
const route = useRoute()
const showLoginLink = computed(() => route.path !== "/login")
const isLoginRoute = computed(() => route.path === "/login")
const brandLogoSources = {
  avif: "/logo-512.avif",
  webp: "/logo-512.webp",
  png: "/logo-512.png",
}
</script>

<template>
  <div class="default-layout">
    <header v-if="!isLoginRoute" class="default-header">
      <NuxtLink to="/" class="default-brand" aria-label="Naad Backstage home">
        <span class="default-brand-badge">
          <picture>
            <source :srcset="brandLogoSources.avif" type="image/avif">
            <source :srcset="brandLogoSources.webp" type="image/webp">
            <img
              :src="brandLogoSources.png"
              alt="Naad Backstage"
              class="default-brand-logo"
              width="512"
              height="206"
              decoding="async"
            >
          </picture>
        </span>
      </NuxtLink>
      <div v-if="showLoginLink" class="default-header-actions">
        <Button variant="secondary" as-child>
          <NuxtLink to="/login">Log in</NuxtLink>
        </Button>
      </div>
    </header>

    <main class="default-main page-enter" :class="{ 'default-main-login': isLoginRoute }">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.default-layout {
  min-height: 100vh;
  background: var(--background);
  color: var(--foreground);
}

.default-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1440px;
  margin: 0 auto;
  padding: 10px 24px;
  background:
    radial-gradient(circle at 14% 0%, color-mix(in srgb, var(--gold-500, var(--primary)) 12%, transparent), transparent 30%),
    #0a0a0a;
  border-radius: 0 0 24px 24px;
  box-shadow: 0 20px 44px -36px rgb(10 10 10 / 72%);
}

/* Gold filament along the header's lower edge for brand cohesion */
.default-header::after {
  content: "";
  position: absolute;
  inset: auto 12% -1px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--gold-500, #d8ad25) 50%, transparent) 50%,
    transparent
  );
  pointer-events: none;
}

@media (min-width: 640px) {
  .default-header {
    padding: 10px 32px;
  }
}

.default-brand {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.default-brand-badge {
  display: grid;
  width: 150px;
  height: 48px;
  place-items: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: visible;
}

.default-brand-logo {
  display: block;
  width: 146px;
  height: auto;
  filter: none;
  object-fit: contain;
}

.default-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.default-main {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 24px 40px;
}

.default-main-login {
  max-width: none;
  padding: 0;
}

@media (min-width: 640px) {
  .default-main {
    padding: 0 32px 40px;
  }

  .default-main-login {
    padding: 0;
  }
}
</style>
