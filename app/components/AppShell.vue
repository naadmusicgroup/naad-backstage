<script setup lang="ts">
import type { NavItem } from "~/utils/navigation"

const props = defineProps<{
  title: string
  subtitle: string
  panelLabel: string
  navItems: NavItem[]
  notificationTo?: string
  notificationCount?: number
}>()

const route = useRoute()
const { viewer } = useViewerContext()
const { activeArtistId, activeArtist, hasMultipleArtists } = useActiveArtist()
const { isSigningOut, signOutAndClear } = useAuthSecurity()
const isSidebarOpen = ref(false)

useInactivityTimeout()

const navGroups = computed(() => {
  const groups = new Map<string, NavItem[]>()

  for (const item of props.navItems) {
    const group = item.group || "Navigation"
    groups.set(group, [...(groups.get(group) ?? []), item])
  }

  return Array.from(groups, ([label, items]) => ({ label, items }))
})

const membershipSummary = computed(() => {
  if (viewer.value.impersonation?.active && props.panelLabel === "Artist") {
    return `Viewing ${viewer.value.impersonation.artistName} as admin`
  }

  if (viewer.value.profile?.role === "admin") {
    return "Full catalog access"
  }

  if (viewer.value.artistMemberships.length === 0) {
    return "No linked artist profiles yet"
  }

  if (hasMultipleArtists.value && activeArtist.value) {
    return `Viewing ${activeArtist.value.name} across ${viewer.value.artistMemberships.length} linked artist profiles`
  }

  return `${viewer.value.artistMemberships.length} linked artist profile${viewer.value.artistMemberships.length > 1 ? "s" : ""}`
})

const activeItem = computed(() => props.navItems.find((item) => isActive(item)))

const panelInitials = computed(() => {
  return props.panelLabel
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase()
})

function isActive(item: NavItem) {
  return item.exact
    ? route.path === item.to
    : route.path === item.to || route.path.startsWith(`${item.to}/`)
}

function closeSidebar() {
  isSidebarOpen.value = false
}

watch(
  () => route.path,
  () => closeSidebar(),
)
</script>

<template>
  <div class="shell">
    <div class="mobile-shell-bar">
      <NuxtLink to="/" class="mobile-brand">
        <span class="brand-sigil">NB</span>
        <span>Naad</span>
      </NuxtLink>
      <button
        type="button"
        class="sidebar-toggle"
        :aria-expanded="isSidebarOpen"
        aria-controls="dashboard-sidebar"
        @click="isSidebarOpen = !isSidebarOpen"
      >
        <span class="sidebar-toggle__line" />
        <span class="sidebar-toggle__line" />
        <span class="sidebar-toggle__label">Menu</span>
      </button>
    </div>

    <button
      v-if="isSidebarOpen"
      type="button"
      class="sidebar-scrim"
      aria-label="Close navigation"
      @click="closeSidebar"
    />

    <aside id="dashboard-sidebar" class="sidebar" :class="{ 'is-open': isSidebarOpen }">
      <div class="sidebar-brand">
        <NuxtLink to="/" class="brand-lockup" @click="closeSidebar">
          <span class="brand-sigil">NB</span>
          <span>
            <span class="brandmark brandmark--stacked">Naad Backstage</span>
            <span class="brand-subtitle">{{ props.panelLabel }} workspace</span>
          </span>
        </NuxtLink>

        <div class="workspace-switcher">
          <span class="workspace-switcher__badge">{{ panelInitials }}</span>
          <span>
            <strong>{{ props.panelLabel }}</strong>
          </span>
        </div>
      </div>

      <nav class="sidebar-nav">
        <section v-for="group in navGroups" :key="group.label" class="nav-group">
          <p class="nav-group-label">{{ group.label }}</p>
          <NuxtLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            class="nav-link"
            :class="{ active: isActive(item) }"
            @click="closeSidebar"
          >
            <span class="nav-icon">{{ item.icon }}</span>
            <span class="nav-copy">
              <strong>{{ item.label }}</strong>
            </span>
          </NuxtLink>
        </section>
      </nav>

      <div class="sidebar-footer">
        <div
          v-if="props.panelLabel === 'Artist' && viewer.artistMemberships.length"
          class="stack"
        >
          <label for="active-artist-scope" class="meta-label">Active artist</label>
          <select id="active-artist-scope" v-model="activeArtistId" class="input">
            <option v-for="artist in viewer.artistMemberships" :key="artist.id" :value="artist.id">
              {{ artist.name }}
            </option>
          </select>
        </div>

        <div class="account-card">
          <span class="account-avatar">{{ (viewer.profile?.fullName || viewer.profile?.role || "U").charAt(0).toUpperCase() }}</span>
          <span class="account-copy">
            <strong>{{ viewer.profile?.fullName || "Signed-in user" }}</strong>
            <small>{{ membershipSummary }}</small>
          </span>
        </div>
        <button class="button button-secondary button-block" :disabled="isSigningOut" @click="signOutAndClear">
          {{ isSigningOut ? "Signing out..." : "Sign out" }}
        </button>
      </div>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="topbar-heading">
          <p class="eyebrow">{{ activeItem?.label || props.panelLabel }}</p>
          <h1 class="page-title">{{ props.title }}</h1>
        </div>

        <div class="badge-row">
          <NuxtLink
            v-if="props.notificationTo"
            :to="props.notificationTo"
            class="notification-link"
            :aria-label="`${props.notificationCount || 0} unread notification${props.notificationCount === 1 ? '' : 's'}`"
          >
            <svg class="notification-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 17h5l-1.4-1.4c-.4-.4-.6-.9-.6-1.4V11a6 6 0 0 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0m6 0H9"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
              />
            </svg>
            <span class="notification-label">Notifications</span>
            <span v-if="props.notificationCount" class="notification-count">
              {{ props.notificationCount > 99 ? "99+" : props.notificationCount }}
            </span>
          </NuxtLink>
          <span class="pill">{{ viewer.profile?.role || "guest" }}</span>
          <span v-if="viewer.artistMemberships.length" class="pill pill-muted">
            {{ viewer.artistMemberships.length }} artist{{ viewer.artistMemberships.length > 1 ? "s" : "" }}
          </span>
        </div>
      </header>

      <div class="workspace-body">
        <slot />
      </div>
    </section>
  </div>
</template>
