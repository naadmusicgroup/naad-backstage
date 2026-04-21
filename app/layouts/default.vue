<template>
  <div class="site-shell">
    <header class="site-header">
      <NuxtLink to="/" class="brandmark">Naad Backstage</NuxtLink>
      <div class="button-row">
        <NuxtLink to="/login" class="button button-secondary">Log in</NuxtLink>
      </div>
    </header>

    <main class="site-main">
      <slot />
    </main>
  </div>
</template>
