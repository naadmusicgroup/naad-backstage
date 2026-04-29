<script setup lang="ts">
const route = useRoute()
const showLoginLink = computed(() => route.path !== "/login")
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <NuxtLink to="/" class="site-brand">
        <span class="site-brand__sigil">NB</span>
        <span class="brandmark">Naad Backstage</span>
      </NuxtLink>
      <div v-if="showLoginLink" class="button-row">
        <NuxtLink to="/login" class="button button-secondary">Log in</NuxtLink>
      </div>
    </header>

    <main class="site-main">
      <slot />
    </main>
  </div>
</template>
