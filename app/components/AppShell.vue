<script setup lang="ts">
import type { NavItem } from "~/utils/navigation"
import type { ShellNotificationPreviewItem } from "~~/types/dashboard"
import { ArrowRight, Lock, Menu, Moon, Sun } from "lucide-vue-next"
import PremiumNotificationIcon from "~/components/icons/PremiumNotificationIcon.vue"
import PremiumSignOutIcon from "~/components/icons/PremiumSignOutIcon.vue"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import AppTooltip from "~/components/AppTooltip.vue"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent } from "@/components/ui/sheet"

const props = withDefaults(defineProps<{
  title: string
  subtitle: string
  panelLabel: string
  navItems: NavItem[]
  mobileTabs?: NavItem[]
  notificationTo?: string
  notificationCount?: number
  notificationPreviewItems?: ShellNotificationPreviewItem[]
}>(), {
  mobileTabs: () => [],
  notificationCount: 0,
  notificationPreviewItems: () => [],
})

function isMobileTabActive(item: NavItem) {
  if (item.exact || item.to === "/dashboard" || item.to === "/admin") {
    return route.path === item.to
  }

  return route.path.startsWith(item.to)
}
const emit = defineEmits<{
  "notification-menu-opened": []
}>()

const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const { viewer } = useViewerContext()
const { activeArtist } = useActiveArtist()
const { isSigningOut, signOutAndClear } = useAuthSecurity()
const isDark = ref(true)
const isNotificationMenuOpen = ref(false)
const isMobileSidebarOpen = ref(false)
const isDesktopSidebarCollapsed = ref(false)
const isMobileNavigation = ref(false)
const hasNavigationMotion = ref(false)
const brandLogoVariants = {
  dark: {
    avif: "/logo-512.avif",
    webp: "/logo-512.webp",
    png: "/logo-512.png",
  },
  light: {
    avif: "/logo-512.avif",
    webp: "/logo-512.webp",
    png: "/logo-512.png",
  },
}
let sidebarMediaQuery: MediaQueryList | null = null
type AppTheme = "dark" | "light"
const THEME_STORAGE_KEY = "naad-backstage-theme"
const DEFAULT_THEME: AppTheme = "dark"

useInactivityTimeout()

onMounted(() => {
  syncDocumentTheme()

  sidebarMediaQuery = window.matchMedia("(max-width: 1023px)")
  updateNavigationMode()
  sidebarMediaQuery.addEventListener("change", updateNavigationMode)
  window.addEventListener("storage", handleThemeStorageChange)
})

onBeforeUnmount(() => {
  sidebarMediaQuery?.removeEventListener("change", updateNavigationMode)
  window.removeEventListener("storage", handleThemeStorageChange)
})

watch(
  () => route.fullPath,
  () => {
    if (import.meta.client) {
      syncDocumentTheme()
    }
  },
)

function toggleTheme() {
  const nextTheme: AppTheme = isDark.value ? "light" : "dark"

  const applyNextTheme = () => {
    applyDocumentTheme(nextTheme)
    storeTheme(nextTheme)
    isDark.value = nextTheme === "dark"
  }

  // Cross-fade the whole page between themes via the View Transitions API.
  // Browsers without it (and reduced-motion users) switch instantly as before.
  if (
    typeof document.startViewTransition === "function"
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    document.startViewTransition(applyNextTheme)
    return
  }

  applyNextTheme()
}

function normalizeTheme(value: string | null): AppTheme {
  return value === "light" ? "light" : DEFAULT_THEME
}

function readStoredTheme(): AppTheme {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

function storeTheme(theme: AppTheme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function syncDocumentTheme() {
  const theme = readStoredTheme()
  applyDocumentTheme(theme)
  isDark.value = theme === "dark"
}

function applyDocumentTheme(theme: AppTheme) {
  const root = document.documentElement
  root.classList.toggle("dark", theme === "dark")
  root.classList.toggle("light", theme === "light")
  root.dataset.theme = theme
  root.style.colorScheme = "only light"
}

function handleThemeStorageChange(event: StorageEvent) {
  if (event.key !== THEME_STORAGE_KEY) {
    return
  }

  const theme = normalizeTheme(event.newValue)
  applyDocumentTheme(theme)
  isDark.value = theme === "dark"
}

const navGroups = computed(() => {
  const groups = new Map<string, NavItem[]>()

  for (const item of props.navItems) {
    const group = item.group || "Navigation"
    groups.set(group, [...(groups.get(group) ?? []), item])
  }

  return Array.from(groups, ([label, items]) => ({ label, items }))
})

function navItemAriaLabel(item: NavItem) {
  const baseLabel = item.description ? `${item.label}: ${item.description}` : item.label

  if (!item.locked) {
    return baseLabel
  }

  return `${baseLabel}. Locked. ${item.lockedTooltip ?? ""}`.trim()
}

function navItemTooltipLabel(item: NavItem) {
  if (item.locked) {
    return item.lockedTooltip ?? navItemAriaLabel(item)
  }

  return item.label
}

function navItemTooltipDisabled(item: NavItem) {
  return !item.locked && !isDesktopSidebarCollapsed.value
}

function handleNavItemClick(item: NavItem, event: MouseEvent) {
  if (item.locked) {
    event.preventDefault()
    return
  }

  closeMobileNavigation()
}

const membershipSummary = computed(() => {
  if (viewer.value.impersonation?.active && props.panelLabel === "Artist") {
    return `Viewing ${viewer.value.impersonation.artistName} as admin`
  }

  if (viewer.value.profile?.role === "admin") {
    return "Full catalog access"
  }

  if (viewer.value.artistMemberships.length === 0) {
    return "No artist profile"
  }

  return activeArtist.value?.name ? "Artist profile" : "Artist profile"
})
const appVersionLabel = computed(() => {
  const version = String(runtimeConfig.public.appVersion || "").trim()

  return version ? `v${version}` : "vlocal"
})
const brandLogoSources = computed(() => (isDark.value ? brandLogoVariants.dark : brandLogoVariants.light))

const notificationPreviewItems = computed(() => props.notificationPreviewItems.slice(0, 5))
const hasUnreadNotifications = computed(() => props.notificationCount > 0)
const notificationCountLabel = computed(() => (props.notificationCount > 99 ? "99+" : String(props.notificationCount)))
const notificationButtonLabel = computed(() => (
  hasUnreadNotifications.value
    ? `${props.notificationCount} unread notification${props.notificationCount === 1 ? "" : "s"}`
    : "Open notifications"
))

const shellAvatarName = computed(() => activeArtist.value?.name || viewer.value.profile?.fullName || "Signed-in user")
const userInitial = computed(() => shellAvatarName.value.charAt(0).toUpperCase())

const themeToggleLabel = computed(() => (isDark.value ? "Switch to light theme" : "Switch to dark theme"))
const navigationToggleLabel = computed(() => {
  if (isMobileNavigation.value) {
    return isMobileSidebarOpen.value ? "Close navigation" : "Open navigation"
  }

  return isDesktopSidebarCollapsed.value ? "Reveal navigation" : "Hide navigation labels"
})
const isNavigationExpanded = computed(() => (
  isMobileNavigation.value ? isMobileSidebarOpen.value : !isDesktopSidebarCollapsed.value
))

function isActive(item: NavItem) {
  return item.exact
    ? route.path === item.to
    : route.path === item.to || route.path.startsWith(`${item.to}/`)
}

function updateNavigationMode() {
  isMobileNavigation.value = Boolean(sidebarMediaQuery?.matches)
  if (!isMobileNavigation.value) {
    isMobileSidebarOpen.value = false
  }
}

function closeMobileNavigation() {
  isMobileSidebarOpen.value = false
}

function toggleNavigation() {
  if (isMobileNavigation.value) {
    isMobileSidebarOpen.value = !isMobileSidebarOpen.value
    return
  }

  hasNavigationMotion.value = true
  isDesktopSidebarCollapsed.value = !isDesktopSidebarCollapsed.value
}

function formatRelativeNotificationTime(value: string) {
  const timestamp = Date.parse(value)

  if (!Number.isFinite(timestamp)) {
    return "recently"
  }

  const elapsedMs = Math.max(0, Date.now() - timestamp)
  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs

  if (elapsedMs < minuteMs) {
    return "just now"
  }

  if (elapsedMs < hourMs) {
    const minutes = Math.max(1, Math.floor(elapsedMs / minuteMs))
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  }

  if (elapsedMs < dayMs) {
    const hours = Math.max(1, Math.floor(elapsedMs / hourMs))
    return `${hours} hour${hours === 1 ? "" : "s"} ago`
  }

  const days = Math.max(1, Math.floor(elapsedMs / dayMs))
  return `${days} day${days === 1 ? "" : "s"} ago`
}

watch(
  isNotificationMenuOpen,
  (isOpen) => {
    if (isOpen) {
      emit("notification-menu-opened")
    }
  },
)

watch(
  () => route.path,
  () => closeMobileNavigation(),
)
</script>

<template>
  <div class="app-shell" :class="{ 'has-mobile-tabbar': props.mobileTabs.length > 0 }">
    <AmbientBackdrop />
    <Sheet v-model:open="isMobileSidebarOpen">
      <SheetContent side="left" class="mobile-sheet-sidebar" :show-close-button="false">
        <aside class="sidebar mobile-sidebar" aria-label="Primary navigation">
          <nav class="sidebar-nav" aria-label="Primary navigation">
            <section v-for="group in navGroups" :key="group.label" class="sidebar-group">
              <template v-for="item in group.items" :key="item.to">
                <AppTooltip
                  :label="navItemTooltipLabel(item)"
                  :disabled="!item.locked"
                  side="right"
                  :content-class="item.locked ? 'sidebar-locked-tooltip' : undefined"
                >
                  <button
                    v-if="item.locked"
                    type="button"
                    class="sidebar-item sidebar-item-locked"
                    :aria-label="navItemAriaLabel(item)"
                    aria-disabled="true"
                    @click="handleNavItemClick(item, $event)"
                  >
                    <span class="sidebar-icon-shell" aria-hidden="true">
                      <component :is="item.icon" class="sidebar-item-icon" />
                    </span>
                    <span class="sidebar-item-label">{{ item.label }}</span>
                    <span class="sidebar-lock-badge" aria-hidden="true">
                      <Lock class="size-3" />
                    </span>
                  </button>

                  <NuxtLink
                    v-else
                    :to="item.to"
                    class="sidebar-item"
                    :class="{ active: isActive(item) }"
                    :aria-label="navItemAriaLabel(item)"
                    @click="handleNavItemClick(item, $event)"
                  >
                    <span class="sidebar-icon-shell" aria-hidden="true">
                      <component :is="item.icon" class="sidebar-item-icon" />
                    </span>
                    <span class="sidebar-item-label">{{ item.label }}</span>
                  </NuxtLink>
                </AppTooltip>
              </template>
            </section>
          </nav>

          <div class="sidebar-footer">
            <div class="sidebar-user">
              <ArtistAvatar
                class="sidebar-user-avatar"
                :display-name="shellAvatarName"
                :fallback="userInitial"
                :avatar-mode="activeArtist?.avatarMode"
                :avatar-preset="activeArtist?.avatarPreset"
                :avatar-custom-colors="activeArtist?.avatarCustomColors"
                :avatar-url="activeArtist?.avatarUrl"
                :label="`${shellAvatarName} avatar`"
              />
              <div class="sidebar-user-info">
                <span class="sidebar-user-name">{{ viewer.profile?.fullName || "Signed-in user" }}</span>
                <span class="sidebar-user-meta-row">
                  <span class="sidebar-user-meta">{{ membershipSummary }}</span>
                  <span class="sidebar-version-badge">{{ appVersionLabel }}</span>
                </span>
              </div>
            </div>

          <AppTooltip
            :label="isSigningOut ? 'Signing out' : 'Sign out'"
            :disabled="!isDesktopSidebarCollapsed"
            side="right"
          >
            <span class="sidebar-signout-tooltip-target">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="sidebar-signout h-auto px-0 py-0"
                :disabled="isSigningOut"
                :aria-label="isSigningOut ? 'Signing out' : 'Sign out'"
                @click="signOutAndClear"
              >
                <PremiumSignOutIcon class="size-4" />
                <span class="sidebar-signout-label">{{ isSigningOut ? "Signing out..." : "Sign out" }}</span>
              </Button>
            </span>
          </AppTooltip>
          </div>
        </aside>
      </SheetContent>
    </Sheet>

    <!-- Thumb-reach navigation on phones; hidden on wider screens -->
    <nav v-if="props.mobileTabs.length" class="mobile-tabbar" aria-label="Primary mobile navigation">
      <NuxtLink
        v-for="item in props.mobileTabs"
        :key="item.to"
        :to="item.to"
        class="mobile-tab"
        :class="{ 'mobile-tab-active': isMobileTabActive(item) }"
        :aria-current="isMobileTabActive(item) ? 'page' : undefined"
      >
        <component :is="item.icon" class="mobile-tab-icon" data-no-icon-depth aria-hidden="true" />
        <span>{{ item.label }}</span>
      </NuxtLink>
    </nav>

    <header class="topbar">
      <div class="topbar-left">
        <AppTooltip :label="navigationToggleLabel" side="bottom">
          <Button
            type="button"
            variant="neo-raised"
            size="icon"
            class="topbar-menu-btn neo-button-icon"
            :class="{ 'is-collapsed': isDesktopSidebarCollapsed }"
            :aria-label="navigationToggleLabel"
            :aria-expanded="isNavigationExpanded"
            @click="toggleNavigation"
          >
            <Menu class="size-5" />
          </Button>
        </AppTooltip>
        <NuxtLink to="/" class="topbar-brand" aria-label="Naad Backstage home">
          <span class="topbar-brand-badge">
            <picture>
              <source :srcset="brandLogoSources.avif" type="image/avif">
              <source :srcset="brandLogoSources.webp" type="image/webp">
              <img
                :src="brandLogoSources.png"
                alt="Naad Backstage"
                class="topbar-brand-logo"
                width="512"
                height="206"
                decoding="async"
              >
            </picture>
          </span>
        </NuxtLink>
      </div>

      <div class="topbar-right">
        <span class="topbar-label">{{ props.panelLabel }}</span>
        <AppTooltip :label="themeToggleLabel" side="bottom">
          <Button type="button" variant="neo-raised" size="icon-sm" class="topbar-icon-btn neo-button-icon-sm" :aria-label="themeToggleLabel" @click="toggleTheme">
            <Sun v-if="isDark" class="size-4" />
            <Moon v-else class="size-4" />
          </Button>
        </AppTooltip>
        <DropdownMenu
          v-if="props.notificationTo"
          v-model:open="isNotificationMenuOpen"
        >
          <DropdownMenuTrigger as-child>
            <Button
              type="button"
              variant="neo-raised"
              size="icon-sm"
              class="topbar-icon-btn topbar-notification-trigger neo-button-icon-sm"
              :class="{ 'has-alert': hasUnreadNotifications }"
              :aria-label="notificationButtonLabel"
            >
              <PremiumNotificationIcon class="size-4" />
              <span v-if="hasUnreadNotifications" class="topbar-alert-dot" aria-hidden="true" />
              <Badge
                v-if="hasUnreadNotifications"
                variant="destructive"
                class="topbar-badge h-[18px] min-w-[18px] rounded-full px-1 font-mono text-[10px] leading-none tabular-nums"
              >
                {{ notificationCountLabel }}
              </Badge>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" class="notification-menu" :side-offset="10">
            <DropdownMenuLabel class="notification-menu-header">
              <strong>Notifications</strong>
              <Badge v-if="hasUnreadNotifications" variant="secondary" class="notification-menu-count">
                {{ notificationCountLabel }} unread
              </Badge>
            </DropdownMenuLabel>

            <AppEmptyState
              v-if="!notificationPreviewItems.length"
              compact
              title="No notifications"
              description="New updates will appear here."
              class="min-h-28 border-dashed"
            />

            <div v-else class="notification-menu-list">
              <NuxtLink
                v-for="notification in notificationPreviewItems"
                :key="notification.id"
                :to="notification.to"
                class="notification-menu-item"
                :class="{ 'notification-menu-item-unread': !notification.isRead }"
                @click="isNotificationMenuOpen = false"
              >
                <span v-if="!notification.isRead" class="notification-menu-unread-dot" aria-hidden="true" />
                <div class="notification-menu-item-heading">
                  <strong>{{ notification.title }}</strong>
                  <span class="notification-menu-time">
                    {{ formatRelativeNotificationTime(notification.createdAt) }}
                  </span>
                </div>
                <p v-if="notification.message" class="notification-menu-message">
                  {{ notification.message }}
                </p>
              </NuxtLink>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem as-child>
              <NuxtLink :to="props.notificationTo" class="notification-menu-action" @click="isNotificationMenuOpen = false">
                <span>View all notifications</span>
                <ArrowRight class="size-4" />
              </NuxtLink>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ArtistAvatar
          class="topbar-avatar"
          :display-name="shellAvatarName"
          :fallback="userInitial"
          :avatar-mode="activeArtist?.avatarMode"
          :avatar-preset="activeArtist?.avatarPreset"
          :avatar-custom-colors="activeArtist?.avatarCustomColors"
          :avatar-url="activeArtist?.avatarUrl"
          :label="`${shellAvatarName} avatar`"
        />
      </div>
    </header>

      <!-- ═══ MAIN CONTENT ═══ -->
    <div class="app-body" :class="{ 'sidebar-is-collapsed': isDesktopSidebarCollapsed }">
      <aside
        id="dashboard-sidebar"
        class="sidebar desktop-sidebar"
        :class="{ collapsed: isDesktopSidebarCollapsed, 'has-navigation-motion': hasNavigationMotion }"
        aria-label="Primary navigation"
      >
        <nav class="sidebar-nav" aria-label="Primary navigation">
          <section v-for="group in navGroups" :key="group.label" class="sidebar-group">
            <AppTooltip
              v-for="item in group.items"
              :key="item.to"
              :label="navItemTooltipLabel(item)"
              :disabled="navItemTooltipDisabled(item)"
              side="right"
              :content-class="item.locked ? 'sidebar-locked-tooltip' : undefined"
            >
              <button
                v-if="item.locked"
                type="button"
                class="sidebar-item sidebar-item-locked"
                :aria-label="navItemAriaLabel(item)"
                aria-disabled="true"
                @click="handleNavItemClick(item, $event)"
              >
                <span class="sidebar-icon-shell" aria-hidden="true">
                  <component :is="item.icon" class="sidebar-item-icon" />
                </span>
                <span class="sidebar-item-label">{{ item.label }}</span>
                <span class="sidebar-lock-badge" aria-hidden="true">
                  <Lock class="size-3" />
                </span>
              </button>

              <NuxtLink
                v-else
                :to="item.to"
                class="sidebar-item"
                :class="{ active: isActive(item) }"
                :aria-label="navItemAriaLabel(item)"
              >
                <span class="sidebar-icon-shell" aria-hidden="true">
                  <component :is="item.icon" class="sidebar-item-icon" />
                </span>
                <span class="sidebar-item-label">{{ item.label }}</span>
              </NuxtLink>
            </AppTooltip>
          </section>
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-user">
            <ArtistAvatar
              class="sidebar-user-avatar"
              :display-name="shellAvatarName"
              :fallback="userInitial"
              :avatar-mode="activeArtist?.avatarMode"
              :avatar-preset="activeArtist?.avatarPreset"
              :avatar-custom-colors="activeArtist?.avatarCustomColors"
              :avatar-url="activeArtist?.avatarUrl"
              :label="`${shellAvatarName} avatar`"
            />
            <div class="sidebar-user-info">
              <span class="sidebar-user-name">{{ viewer.profile?.fullName || "Signed-in user" }}</span>
              <span class="sidebar-user-meta-row">
                <span class="sidebar-user-meta">{{ membershipSummary }}</span>
                <span class="sidebar-version-badge">{{ appVersionLabel }}</span>
              </span>
            </div>
          </div>

          <AppTooltip
            :label="isSigningOut ? 'Signing out' : 'Sign out'"
            :disabled="!isDesktopSidebarCollapsed"
            side="right"
          >
            <span class="sidebar-signout-tooltip-target">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="sidebar-signout h-auto px-0 py-0"
                :disabled="isSigningOut"
                :aria-label="isSigningOut ? 'Signing out' : 'Sign out'"
                @click="signOutAndClear"
              >
                <PremiumSignOutIcon class="size-4" />
                <span class="sidebar-signout-label">{{ isSigningOut ? "Signing out..." : "Sign out" }}</span>
              </Button>
            </span>
          </AppTooltip>
        </div>
      </aside>

      <section class="workspace">
        <main class="main-content">
          <PageScaffold class="page-enter">
            <slot />
          </PageScaffold>
        </main>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* ── App Shell ── */
.app-shell {
  --sidebar-expanded-width: 250px;
  --sidebar-collapsed-width: 76px;
  --topbar-height: 64px;
  --sidebar-motion-duration: 220ms;
  --sidebar-motion-ease: cubic-bezier(0.25, 0.1, 0.25, 1);
  --shell-control-glass-accent: var(--priority);
  --shell-topbar-surface:
    linear-gradient(145deg, color-mix(in srgb, var(--topbar) 88%, #2a251a 12%), var(--topbar) 58%, color-mix(in srgb, var(--topbar) 90%, black 10%));
  --shell-topbar-border: color-mix(in srgb, var(--topbar-foreground) 10%, transparent);
  --shell-topbar-edge: color-mix(in srgb, var(--topbar-foreground) 17%, transparent);
  --shell-topbar-foreground: var(--topbar-foreground);
  --shell-topbar-muted: color-mix(in srgb, var(--topbar-foreground) 64%, transparent);
  --shell-topbar-shadow:
    inset 0 1px 0 rgb(244 238 223 / 6%),
    inset 0 -1px 0 rgb(0 0 0 / 42%),
    0 14px 32px -26px rgb(0 0 0 / 72%);
  --shell-control-border: color-mix(in srgb, var(--topbar-foreground) 10%, transparent);
  --shell-control-border-hover: color-mix(in srgb, var(--topbar-foreground) 16%, transparent);
  --shell-control-surface:
    linear-gradient(145deg, rgb(255 255 255 / 5%), rgb(0 0 0 / 18%));
  --shell-control-surface-hover:
    linear-gradient(145deg, rgb(255 255 255 / 7%), rgb(0 0 0 / 14%));
  --shell-control-surface-active:
    linear-gradient(145deg, rgb(255 255 255 / 8%), rgb(0 0 0 / 16%));
  --shell-control-foreground: color-mix(in srgb, var(--topbar-foreground) 82%, transparent);
  --shell-control-muted: color-mix(in srgb, var(--topbar-foreground) 64%, transparent);
  --shell-control-glint: rgb(244 238 223 / 9%);
  --shell-control-shadow:
    inset 1px 1px 0 rgb(244 238 223 / 5%),
    inset -1px -1px 0 rgb(0 0 0 / 38%),
    8px 10px 22px -18px rgb(0 0 0 / 78%);
  --shell-control-hover-shadow:
    inset 1px 1px 0 rgb(244 238 223 / 7%),
    inset -1px -1px 0 rgb(0 0 0 / 42%),
    10px 12px 26px -20px rgb(0 0 0 / 82%);
  --shell-control-pressed-shadow:
    inset 4px 4px 10px rgb(0 0 0 / 36%),
    inset -3px -3px 8px rgb(244 238 223 / 4%);
  --shell-control-focus-ring: color-mix(in srgb, var(--priority) 34%, transparent);
  --shell-alert-ring-surface: color-mix(in srgb, var(--sidebar) 94%, white 6%);
  --shell-avatar-surface:
    linear-gradient(145deg, rgb(255 255 255 / 6%), rgb(0 0 0 / 18%));
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  min-height: 100svh;
  overflow-x: hidden;
  overflow-x: clip;
  background: var(--background);
}

:global(.dark .app-shell) {
  --shell-control-glass-accent: var(--priority);
  --shell-topbar-surface:
    linear-gradient(145deg, color-mix(in srgb, var(--topbar) 88%, #2a251a 12%), var(--topbar) 58%, color-mix(in srgb, var(--topbar) 90%, black 10%));
  --shell-topbar-border: color-mix(in srgb, var(--topbar-foreground) 10%, transparent);
  --shell-topbar-edge: color-mix(in srgb, var(--topbar-foreground) 17%, transparent);
  --shell-topbar-foreground: var(--topbar-foreground);
  --shell-topbar-muted: color-mix(in srgb, var(--topbar-foreground) 64%, transparent);
  --shell-topbar-shadow:
    inset 0 1px 0 rgb(244 238 223 / 6%),
    inset 0 -1px 0 rgb(0 0 0 / 42%),
    0 14px 32px -26px rgb(0 0 0 / 72%);
  --shell-control-border: color-mix(in srgb, var(--topbar-foreground) 10%, transparent);
  --shell-control-border-hover: color-mix(in srgb, var(--topbar-foreground) 16%, transparent);
  --shell-control-surface:
    linear-gradient(145deg, rgb(255 255 255 / 5%), rgb(0 0 0 / 18%));
  --shell-control-surface-hover:
    linear-gradient(145deg, rgb(255 255 255 / 7%), rgb(0 0 0 / 14%));
  --shell-control-surface-active:
    linear-gradient(145deg, rgb(255 255 255 / 8%), rgb(0 0 0 / 16%));
  --shell-control-foreground: color-mix(in srgb, var(--topbar-foreground) 82%, transparent);
  --shell-control-muted: color-mix(in srgb, var(--topbar-foreground) 64%, transparent);
  --shell-control-glint: rgb(244 238 223 / 9%);
  --shell-control-shadow:
    inset 1px 1px 0 rgb(244 238 223 / 5%),
    inset -1px -1px 0 rgb(0 0 0 / 38%),
    8px 10px 22px -18px rgb(0 0 0 / 78%);
  --shell-control-hover-shadow:
    inset 1px 1px 0 rgb(244 238 223 / 7%),
    inset -1px -1px 0 rgb(0 0 0 / 42%),
    10px 12px 26px -20px rgb(0 0 0 / 82%);
  --shell-control-pressed-shadow:
    inset 4px 4px 10px rgb(0 0 0 / 36%),
    inset -3px -3px 8px rgb(244 238 223 / 4%);
  --shell-control-focus-ring: color-mix(in srgb, var(--shell-control-glass-accent) 34%, transparent);
  --shell-alert-ring-surface: color-mix(in srgb, var(--topbar) 92%, transparent);
  --shell-avatar-surface:
    linear-gradient(145deg, rgb(255 255 255 / 6%), rgb(0 0 0 / 18%));
  background: var(--background);
}

/* ── Top Bar ── */
/* ── Mobile tab bar: thumb-reach nav on phones only ── */
.mobile-tabbar {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 50;
  display: none;
  grid-auto-flow: column;
  border-top: 1px solid var(--line-1, var(--border));
  background: color-mix(in srgb, var(--background) 90%, transparent);
  padding: 6px max(10px, env(safe-area-inset-right)) calc(6px + env(safe-area-inset-bottom, 0px)) max(10px, env(safe-area-inset-left));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.mobile-tab {
  display: grid;
  min-height: 48px;
  justify-items: center;
  align-content: center;
  gap: 3px;
  border-radius: 10px;
  color: var(--muted-foreground);
  padding: 5px 4px;
  font-size: 10.5px;
  font-weight: 650;
  line-height: 1.2;
  text-decoration: none;
  transition: color var(--duration-fast, 150ms) var(--ease-out);
}

.mobile-tab-icon {
  width: 20px;
  height: 20px;
}

.mobile-tab-active {
  color: var(--foreground);
  box-shadow: inset 0 2px 0 var(--priority);
}

.mobile-tab-active .mobile-tab-icon {
  color: var(--priority);
}

@media (max-width: 767px) {
  .mobile-tabbar {
    display: grid;
  }

  /* Clearance below page content + fixed docks while the tab bar exists */
  .has-mobile-tabbar {
    --mobile-tabbar-clearance: calc(62px + env(safe-area-inset-bottom, 0px));
  }
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  height: var(--topbar-height);
  padding: 0 24px;
  border-bottom: 1px solid var(--shell-topbar-border);
  background: var(--shell-topbar-surface);
  color: var(--shell-topbar-foreground);
  box-shadow: var(--shell-topbar-shadow);
}

/* Design Engineering: neutral topbar edge that supports card glints without competing. */
.topbar::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    color-mix(in srgb, var(--shell-topbar-edge) 58%, transparent) 18%,
    var(--shell-topbar-edge) 50%,
    color-mix(in srgb, var(--shell-topbar-edge) 58%, transparent) 82%,
    transparent 100%
  );
  opacity: 0.88;
  pointer-events: none;
  z-index: 1;
}

:global(.dark) .topbar {
  border-bottom-color: var(--shell-topbar-border);
  background: var(--shell-topbar-surface);
  color: var(--shell-topbar-foreground);
  box-shadow: var(--shell-topbar-shadow);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.topbar-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--shell-control-border);
  background: var(--shell-control-surface);
  color: var(--shell-control-muted);
  box-shadow: var(--shell-control-shadow);
  cursor: pointer;
  overflow: hidden;
  position: relative;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    border-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.topbar-menu-btn:hover {
  border-color: var(--shell-control-border-hover);
  background: var(--shell-control-surface-hover);
  color: var(--shell-control-foreground);
  box-shadow: var(--shell-control-hover-shadow);
}

:global(.dark) .topbar-menu-btn {
  border-color: var(--shell-control-border);
  background: var(--shell-control-surface);
  color: var(--shell-control-muted);
  box-shadow: var(--shell-control-shadow);
}

:global(.dark) .topbar-menu-btn:hover {
  border-color: var(--shell-control-border-hover);
  background: var(--shell-control-surface-hover);
  color: var(--shell-control-foreground);
  box-shadow: var(--shell-control-hover-shadow);
}

.topbar-menu-btn svg {
  position: relative;
  z-index: 1;
  transform-origin: center;
  transition:
    color var(--sidebar-toggle-motion),
    opacity var(--sidebar-toggle-motion),
    transform var(--sidebar-toggle-motion);
}

.topbar-menu-btn.is-collapsed {
  border-color: color-mix(in srgb, var(--shell-control-glass-accent) 36%, var(--shell-control-border));
  background: var(--shell-control-surface-active);
  color: var(--shell-control-foreground);
  box-shadow:
    var(--shell-control-shadow),
    inset 2px 0 0 color-mix(in srgb, var(--shell-control-glass-accent) 72%, transparent);
}

.topbar-menu-btn.is-collapsed svg {
  transform: rotate(90deg) scale(0.96);
}

:global(.dark) .topbar-menu-btn.is-collapsed {
  border-color: color-mix(in srgb, var(--shell-control-glass-accent) 36%, var(--shell-control-border));
  background: var(--shell-control-surface-active);
  color: var(--shell-control-foreground);
  box-shadow:
    var(--shell-control-shadow),
    inset 2px 0 0 color-mix(in srgb, var(--shell-control-glass-accent) 72%, transparent);
}

.topbar-brand {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.topbar-brand-badge {
  display: grid;
  width: 132px;
  height: 38px;
  place-items: center;
  border: 0;
  border-radius: 0;
  background: transparent;
  overflow: visible;
}

.topbar-brand-logo {
  display: block;
  width: 128px;
  height: auto;
  filter: none;
  object-fit: contain;
}

:global(.dark) .topbar-brand-logo {
  filter: none;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.topbar-label {
  display: none;
  padding: 6px 16px;
  border-radius: 10px;
  border: 1px solid var(--shell-control-border);
  background: var(--shell-control-surface);
  font-size: 13px;
  font-weight: 500;
  color: var(--shell-control-foreground);
  box-shadow: var(--shell-control-shadow);
  overflow: hidden;
  position: relative;
}

:global(.dark) .topbar-label {
  border-color: var(--shell-control-border);
  background: var(--shell-control-surface);
  color: var(--shell-control-foreground);
  box-shadow: var(--shell-control-shadow);
}

@media (min-width: 640px) {
  .topbar-label {
    display: block;
  }
}

.topbar-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--shell-control-border);
  background: var(--shell-control-surface);
  color: var(--shell-control-muted);
  box-shadow: var(--shell-control-shadow);
  cursor: pointer;
  overflow: hidden;
  position: relative;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

/* Neomorphic icon button size overrides */
:global(.neo-button-icon) {
  width: 44px !important;
  height: 44px !important;
}

:global(.neo-button-icon-sm) {
  width: 40px !important;
  height: 40px !important;
}

:global(.neo-button-icon-xs) {
  width: 32px !important;
  height: 32px !important;
}

:global(.neo-button-icon-lg) {
  width: 48px !important;
  height: 48px !important;
}

.topbar-icon-btn:hover {
  border-color: var(--shell-control-border-hover);
  background: var(--shell-control-surface-hover);
  color: var(--shell-control-foreground);
  box-shadow: var(--shell-control-hover-shadow);
}

.topbar-menu-btn::before,
.topbar-menu-btn::after,
.topbar-icon-btn::before,
.topbar-icon-btn::after,
.topbar-label::before,
.topbar-label::after {
  display: none;
}

.topbar-icon-btn svg {
  position: relative;
  z-index: 1;
}

.topbar-menu-btn:focus-visible,
.topbar-icon-btn:focus-visible,
.topbar-brand:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--priority) 34%, transparent);
  outline-offset: 3px;
}

.topbar-menu-btn:active,
.topbar-icon-btn:active {
  box-shadow: var(--shell-control-pressed-shadow);
  transform: translateY(0) scale(0.98);
}

:global(.dark) .topbar-icon-btn {
  border-color: var(--shell-control-border);
  background: var(--shell-control-surface);
  color: var(--shell-control-muted);
  box-shadow: var(--shell-control-shadow);
}

:global(.dark) .topbar-icon-btn:hover {
  border-color: var(--shell-control-border-hover);
  background: var(--shell-control-surface-hover);
  color: var(--shell-control-foreground);
  box-shadow: var(--shell-control-hover-shadow);
}

@media (max-width: 480px) {
  .topbar {
    padding: 0 16px;
  }

  .topbar-left,
  .topbar-right {
    gap: 8px;
    min-width: 0;
  }

  .topbar-brand-badge {
    width: 108px;
    height: 34px;
  }

  .topbar-brand-logo {
    width: 108px;
  }

  .topbar-avatar {
    display: none;
  }
}

.topbar-notification-trigger {
  position: relative;
  overflow: visible;
}

.topbar-notification-trigger.has-alert {
  border-color: color-mix(in srgb, var(--priority) 38%, var(--shell-control-border));
  background: var(--shell-control-surface-active);
  color: var(--shell-control-foreground);
  box-shadow:
    var(--shell-control-shadow),
    0 0 0 3px color-mix(in srgb, var(--priority) 8%, transparent);
}

:global(.dark) .topbar-notification-trigger.has-alert {
  border-color: color-mix(in srgb, var(--priority) 38%, var(--shell-control-border));
  background: var(--shell-control-surface-active);
  color: var(--shell-control-foreground);
  box-shadow:
    var(--shell-control-shadow),
    0 0 0 3px color-mix(in srgb, var(--priority) 8%, transparent);
}

.topbar-alert-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--priority);
  box-shadow:
    0 0 0 2px var(--shell-alert-ring-surface),
    0 0 0 4px color-mix(in srgb, var(--priority) 14%, transparent);
}

:global(.dark) .topbar-alert-dot {
  box-shadow:
    0 0 0 2px var(--shell-alert-ring-surface),
    0 0 0 4px color-mix(in srgb, var(--priority) 14%, transparent);
}

.topbar-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  z-index: 2;
  pointer-events: none;
}

:global(.notification-menu) {
  width: min(390px, calc(100vw - 24px));
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--popover);
  box-shadow: var(--shadow-md);
}

:global(.dark .notification-menu) {
  border-color: color-mix(in srgb, var(--border) 82%, var(--foreground) 10%);
  background: var(--popover);
  box-shadow: 0 18px 44px -34px rgb(0 0 0 / 78%);
}

:global(.notification-menu-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 8px 10px;
}

:global(.notification-menu-header strong) {
  color: var(--popover-foreground);
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.25;
}

:global(.notification-menu-count) {
  flex-shrink: 0;
  border: 1px solid var(--border);
  background: var(--secondary);
  color: var(--secondary-foreground);
  font-size: 11px;
  font-weight: 600;
}

:global(.notification-menu-list) {
  display: grid;
  max-height: 356px;
  overflow-y: auto;
  border-block: 1px solid var(--border);
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--foreground) 18%, transparent) transparent;
}

:global(.notification-menu-item) {
  position: relative;
  display: grid;
  gap: 5px;
  padding: 12px 8px 12px 18px;
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: transparent;
  color: inherit;
  text-decoration: none;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

:global(.notification-menu-item:hover) {
  background: var(--accent);
  color: var(--accent-foreground);
}

:global(.dark .notification-menu-item:hover) {
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
  color: var(--foreground);
}

:global(.notification-menu-item:focus-visible) {
  outline: 2px solid var(--ring);
  outline-offset: -2px;
}

:global(.notification-menu-item:last-child) {
  border-bottom: 0;
}

:global(.notification-menu-item strong) {
  color: var(--popover-foreground);
  font-size: 14px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1.35;
}

:global(.notification-menu-item-unread) {
  background: color-mix(in srgb, var(--priority) 5%, transparent);
}

:global(.dark .notification-menu-item-unread) {
  background: color-mix(in srgb, var(--priority) 8%, transparent);
}

:global(.notification-menu-item-heading) {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

:global(.notification-menu-item-heading strong) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

:global(.notification-menu-time) {
  flex: 0 0 auto;
  max-width: 120px;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.notification-menu-unread-dot) {
  position: absolute;
  top: 18px;
  left: 7px;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--priority);
}

:global(.notification-menu-message) {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

:global(.notification-menu-action) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding: 10px 8px;
  border-radius: 8px;
  color: var(--foreground);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

:global(.notification-menu-action:hover) {
  background: var(--accent);
  color: var(--accent-foreground);
}

:global(.dark .notification-menu-action:hover) {
  background: color-mix(in srgb, var(--foreground) 8%, transparent);
  color: var(--foreground);
}

.topbar-avatar {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 999px !important;
  background: var(--shell-avatar-surface);
  color: var(--shell-control-foreground);
  font-weight: 600;
  font-size: 14px;
  outline: 0;
  box-shadow:
    0 0 0 1px var(--shell-control-border),
    var(--shell-control-shadow);
}

:global(.dark) .topbar-avatar {
  border: 0;
  background: var(--shell-avatar-surface);
  color: var(--shell-control-foreground);
  outline: 0;
  box-shadow:
    0 0 0 1px var(--shell-control-border),
    var(--shell-control-shadow);
}

.topbar-avatar-fallback {
  border-radius: inherit !important;
  background: transparent;
  color: inherit;
}

.app-body {
  display: flex;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  min-height: calc(100svh - var(--topbar-height));
  overflow-x: hidden;
  overflow-x: clip;
  position: relative;
  /* Above .ambient-backdrop (fixed, z:0) */
  z-index: 1;
  background: var(--background);
}

.workspace {
  display: flex;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  flex-direction: column;
  overflow-x: hidden;
  overflow-x: clip;
  background: var(--background);
  transition: margin-left var(--sidebar-motion-duration) var(--sidebar-motion-ease);
}

:global(.dark .workspace) {
  background: var(--background);
}

.sidebar {
  --sidebar-active-rail: var(--priority);
  --sidebar-active-rail-glow: color-mix(in srgb, var(--priority) 24%, transparent);
  --sidebar-hover-item-background:
    radial-gradient(120% 120% at 16% 0%, rgb(255 255 255 / 58%), transparent 44%),
    linear-gradient(100deg, color-mix(in srgb, var(--sidebar) 92%, white 8%), color-mix(in srgb, var(--sidebar) 88%, var(--foreground) 3%) 100%);
  --sidebar-hover-item-shadow:
    inset 0 1px 0 rgb(255 255 255 / 78%),
    inset 0 -1px 0 rgb(10 10 10 / 5%),
    0 12px 22px -20px rgb(72 68 61 / 24%);
  --sidebar-active-item-background:
    radial-gradient(130% 120% at 14% 0%, color-mix(in srgb, var(--priority) 9%, white 66%), transparent 46%),
    linear-gradient(100deg, color-mix(in srgb, var(--sidebar) 88%, white 12%), color-mix(in srgb, var(--sidebar) 91%, var(--priority) 5%) 54%, color-mix(in srgb, var(--sidebar) 88%, var(--foreground) 4%));
  --sidebar-active-item-shadow:
    inset 3px 3px 9px rgb(72 68 61 / 8%),
    inset -3px -3px 9px rgb(255 255 255 / 66%),
    inset 0 0 0 1px color-mix(in srgb, var(--priority) 16%, var(--sidebar-border)),
    0 10px 22px -20px color-mix(in srgb, var(--priority) 14%, rgb(72 68 61 / 22%));
  --sidebar-hover-icon-background: linear-gradient(135deg, rgb(255 255 255 / 64%), color-mix(in srgb, currentColor 9%, transparent));
  --sidebar-hover-icon-shadow:
    inset 0 1px 0 rgb(255 255 255 / 78%),
    0 10px 18px -16px rgb(84 64 24 / 28%);
  --sidebar-active-icon-background:
    radial-gradient(110% 90% at 50% 0%, rgb(255 255 255 / 88%), transparent 62%),
    linear-gradient(180deg, color-mix(in srgb, var(--priority) 12%, white 88%), color-mix(in srgb, var(--sidebar) 72%, var(--priority) 10%));
  --sidebar-active-icon-shadow:
    inset 0 1px 0 rgb(255 255 255 / 82%),
    inset 0 -1px 0 rgb(10 10 10 / 7%),
    0 10px 18px -16px rgb(72 68 61 / 24%);
  position: fixed;
  top: 64px;
  left: 0;
  bottom: 0;
  z-index: 40;
  isolation: isolate;
  display: flex;
  width: var(--sidebar-expanded-width);
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: 1px solid var(--sidebar-border);
  background:
    radial-gradient(96% 62% at 0% 12%, color-mix(in srgb, var(--sidebar-foreground) 7%, transparent), transparent 56%),
    radial-gradient(86% 64% at 108% 86%, color-mix(in srgb, var(--sidebar-foreground) 4%, transparent), transparent 66%),
    linear-gradient(90deg, rgb(255 255 255 / 64%), transparent 34%, rgb(10 10 10 / 2%) 100%),
    linear-gradient(145deg, color-mix(in srgb, var(--sidebar) 92%, white 8%) 0%, var(--sidebar) 56%, color-mix(in srgb, var(--sidebar) 94%, var(--foreground) 3%) 100%);
  color: var(--sidebar-foreground);
  box-shadow:
    inset -1px 0 0 rgb(255 255 255 / 72%),
    16px 0 42px -36px rgba(84, 64, 24, 0.46);
  transform: translateX(-100%);
  transition:
    width var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    transform var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    border-color var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    background var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    box-shadow var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1));
  will-change: width, transform;
}

.sidebar::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image:
    linear-gradient(90deg, rgb(255 255 255 / 52%), transparent 24%, rgb(10 10 10 / 5%) 54%, transparent 80%, rgb(255 255 255 / 40%)),
    radial-gradient(circle, rgb(10 10 10 / 7%) 0 0.25px, transparent 0.72px),
    radial-gradient(circle, rgb(255 255 255 / 76%) 0 0.35px, transparent 0.84px);
  background-position: 0 0, 0 0, 3px 4px;
  background-size: 100% 100%, 5px 5px, 7px 7px;
  content: "";
  mix-blend-mode: multiply;
  opacity: 0.14;
  pointer-events: none;
}

.sidebar::after {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  width: 2px;
  background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--sidebar-foreground) 10%, var(--sidebar-border)) 24%, color-mix(in srgb, var(--sidebar-border) 70%, white 30%) 54%, transparent);
  content: "";
  opacity: 0.94;
  pointer-events: none;
}

:global(.dark .sidebar) {
  --sidebar-foreground: #ddd6c6;
  --sidebar-primary: #f4eedf;
  --sidebar-primary-foreground: #14120e;
  --sidebar-accent: rgba(244, 238, 223, 0.074);
  --sidebar-accent-foreground: #f1ead9;
  --sidebar-border: rgba(244, 238, 223, 0.075);
  --sidebar-glass-accent: var(--priority);
  --sidebar-active-rail: color-mix(in srgb, var(--sidebar-glass-accent) 72%, var(--sidebar-foreground) 28%);
  --sidebar-active-rail-glow: color-mix(in srgb, var(--sidebar-glass-accent) 34%, transparent);
  --sidebar-ring: color-mix(in srgb, var(--sidebar-glass-accent) 58%, transparent);
  --muted-foreground: #a49b8b;
  --sidebar-hover-item-background:
    radial-gradient(120% 120% at 16% 0%, rgb(255 255 255 / 4%), transparent 44%),
    linear-gradient(100deg, rgb(255 255 255 / 4%), rgb(255 255 255 / 1.5%) 48%, rgb(0 0 0 / 8%));
  --sidebar-hover-item-shadow:
    inset 0 1px 0 rgb(255 255 255 / 6%),
    inset 0 -1px 0 rgb(0 0 0 / 22%),
    0 14px 26px -24px rgb(0 0 0 / 70%);
  --sidebar-active-item-background:
    radial-gradient(130% 120% at 14% 0%, rgb(255 255 255 / 5%), transparent 46%),
    linear-gradient(100deg, rgb(255 255 255 / 6%), rgb(255 255 255 / 2%) 48%, rgb(255 255 255 / 1%));
  --sidebar-active-item-shadow:
    inset 3px 3px 9px rgb(0 0 0 / 30%),
    inset -2px -2px 8px rgb(244 238 223 / 4%),
    inset 0 0 0 1px rgb(255 255 255 / 4%),
    0 10px 22px -20px rgb(0 0 0 / 66%);
  --sidebar-hover-icon-background:
    radial-gradient(110% 90% at 50% 0%, rgb(255 255 255 / 5%), transparent 58%),
    linear-gradient(135deg, rgb(255 255 255 / 8%), color-mix(in srgb, currentColor 9%, transparent));
  --sidebar-hover-icon-shadow:
    inset 0 1px 0 rgb(255 255 255 / 8%),
    inset 0 -1px 0 rgb(0 0 0 / 36%),
    0 10px 18px -16px rgb(0 0 0 / 72%);
  --sidebar-active-icon-background:
    radial-gradient(110% 90% at 50% 0%, rgb(255 255 255 / 6%), transparent 62%),
    linear-gradient(180deg, rgb(255 255 255 / 6%), rgb(0 0 0 / 24%));
  --sidebar-active-icon-shadow:
    inset 0 1px 0 rgb(255 255 255 / 8%),
    inset 0 -1px 0 rgb(0 0 0 / 42%),
    0 10px 20px -17px rgb(0 0 0 / 82%);
  background:
    radial-gradient(112% 72% at 18% -9%, rgb(244 238 223 / 5%), transparent 58%),
    radial-gradient(82% 56% at 104% 84%, color-mix(in srgb, var(--priority) 4%, transparent), transparent 64%),
    linear-gradient(145deg, #191713 0%, #11100e 54%, #0d0c0a 100%);
  box-shadow:
    inset -1px 0 0 rgb(244 238 223 / 5%),
    16px 0 42px -36px rgb(0 0 0 / 74%);
}

:global(.dark .sidebar::before) {
  background-image:
    linear-gradient(90deg, rgb(244 238 223 / 3%), transparent 24%, rgb(0 0 0 / 14%) 54%, transparent 80%, rgb(244 238 223 / 3%)),
    radial-gradient(circle, rgb(244 238 223 / 10%) 0 0.25px, transparent 0.72px),
    radial-gradient(circle, rgb(0 0 0 / 26%) 0 0.35px, transparent 0.84px);
  mix-blend-mode: screen;
  opacity: 0.09;
}

:global(.dark .sidebar::after) {
  background: linear-gradient(180deg, transparent, rgb(244 238 223 / 12%) 24%, rgb(244 238 223 / 6%) 54%, transparent);
  opacity: 0.72;
}

.desktop-sidebar {
  display: none;
}

.mobile-sheet-sidebar {
  width: min(86vw, 280px);
  max-width: min(86vw, 280px);
  padding: 0;
  border-color: var(--sidebar-border);
  background: transparent;
}

.mobile-sidebar {
  position: static;
  inset: auto;
  width: 100%;
  height: 100%;
  transform: none;
  border-right: 0;
  box-shadow: 18px 0 48px -42px rgba(10,10,10, 0.86);
}

@media (min-width: 1024px) {
  .app-body {
    display: block;
  }

  .workspace {
    min-height: calc(100svh - var(--topbar-height));
    margin-left: var(--sidebar-expanded-width);
  }

  .app-body.sidebar-is-collapsed .workspace {
    margin-left: var(--sidebar-collapsed-width);
  }

  .desktop-sidebar {
    display: flex;
    position: fixed;
    top: 64px;
    bottom: 0;
    width: var(--sidebar-expanded-width);
    height: auto;
    flex-shrink: 0;
    transform: translateX(0);
  }

  .desktop-sidebar.collapsed {
    width: var(--sidebar-collapsed-width);
  }
}

.sidebar-nav {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 12px 0;
}

.sidebar-group {
  padding: 4px 12px;
  transition: padding var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1));
}

.sidebar-group + .sidebar-group {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--sidebar-border);
}

.sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 50px;
  padding: 10px 12px 10px 14px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 400;
  color: var(--sidebar-foreground);
  overflow: hidden;
  --silver-glow: rgba(140, 140, 155, 0.05);
  transition:
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    transform 200ms var(--ease-out);
  text-decoration: none;
}

button.sidebar-item {
  width: 100%;
  border: 1px solid transparent;
  font: inherit;
  text-align: left;
}

:global(.dark .sidebar-item) {
  --silver-glow: rgba(240, 240, 255, 0.03);
}

.sidebar-item > * {
  position: relative;
  z-index: 1;
}

.sidebar-item::before {
  position: absolute;
  inset: 9px auto 9px 6px;
  width: 3px;
  border-radius: 999px;
  background: transparent;
  content: "";
  z-index: 2;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out),
    box-shadow var(--duration-fast, 150ms) var(--ease-out),
    opacity var(--duration-fast, 150ms) var(--ease-out);
}

.sidebar-item::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at center,
    var(--silver-glow) 0%,
    transparent 70%
  );
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 250ms var(--ease-out), transform 250ms var(--ease-out);
  pointer-events: none;
  z-index: 0;
}

.sidebar-item:hover {
  border-color: color-mix(in srgb, var(--sidebar-foreground) 12%, var(--sidebar-border));
  background: var(--sidebar-hover-item-background);
  color: var(--sidebar-accent-foreground);
  box-shadow: var(--sidebar-hover-item-shadow);
  transform: translateY(-0.5px) translateZ(0);
}

.sidebar-item:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--sidebar-ring) 76%, transparent);
  outline-offset: 2px;
}

.sidebar-item:hover::after {
  opacity: 1;
  transform: scale(1.05);
}

.sidebar-item.active {
  border-color: color-mix(in srgb, var(--sidebar-active-rail) 20%, var(--sidebar-border));
  color: var(--sidebar-accent-foreground);
  font-weight: 560;
  background: var(--sidebar-active-item-background);
  box-shadow: var(--sidebar-active-item-shadow);
}

.sidebar-item.active:hover {
  background: var(--sidebar-active-item-background);
  box-shadow: var(--sidebar-active-item-shadow);
  transform: translateY(0) translateZ(0);
}

.sidebar-item.active:hover::after {
  opacity: 0;
  transform: scale(0.96);
}

.sidebar-item.active::before {
  background: var(--sidebar-active-rail);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--sidebar-active-rail) 28%, transparent),
    0 0 10px var(--sidebar-active-rail-glow);
  opacity: 0.95;
}

.sidebar-item.active::after {
  opacity: 0;
}

.sidebar-item-locked {
  color: color-mix(in srgb, var(--sidebar-foreground) 58%, var(--muted-foreground));
  cursor: not-allowed;
}

.sidebar-item-locked:hover {
  background:
    radial-gradient(120% 120% at 16% 0%, rgb(255 255 255 / 4%), transparent 44%),
    linear-gradient(100deg, rgb(255 255 255 / 4%), rgb(255 255 255 / 1%) 48%, rgb(0 0 0 / 10%));
  color: color-mix(in srgb, var(--sidebar-foreground) 72%, var(--muted-foreground));
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 5%),
    inset 0 -1px 0 rgb(0 0 0 / 26%);
  transform: translateY(0) translateZ(0);
}

.sidebar-item-locked::before {
  background: color-mix(in srgb, var(--muted-foreground) 22%, transparent);
}

.sidebar-item-locked .sidebar-item-icon {
  opacity: 0.46;
}

.sidebar-item-locked:hover .sidebar-icon-shell {
  border-color: color-mix(in srgb, currentColor 14%, transparent);
  background:
    linear-gradient(135deg, rgb(255 255 255 / 5%), color-mix(in srgb, currentColor 7%, transparent));
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 6%),
    inset 0 -1px 0 rgb(0 0 0 / 32%);
}

.sidebar-lock-badge {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  margin-left: auto;
  border: 1px solid color-mix(in srgb, var(--sidebar-foreground) 16%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sidebar-foreground) 8%, transparent);
  color: color-mix(in srgb, var(--sidebar-foreground) 72%, var(--muted-foreground));
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 6%);
}

:global(.sidebar-locked-tooltip) {
  max-width: 270px;
  white-space: normal;
  line-height: 1.35;
}

.sidebar-icon-shell {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 7px;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
  background: color-mix(in srgb, currentColor 7%, transparent);
  color: currentColor;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    border-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.sidebar-item:hover .sidebar-icon-shell,
.sidebar-item.active .sidebar-icon-shell {
  border-color: color-mix(in srgb, currentColor 22%, transparent);
  background: var(--sidebar-hover-icon-background);
  box-shadow: var(--sidebar-hover-icon-shadow);
}

.sidebar-item.active .sidebar-icon-shell {
  border-color: color-mix(in srgb, currentColor 20%, transparent);
  background: var(--sidebar-active-icon-background);
  color: color-mix(in srgb, var(--sidebar-accent-foreground) 78%, var(--priority) 22%);
  box-shadow: var(--sidebar-active-icon-shadow);
}

.sidebar-item-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.68;
}

.sidebar-item.active .sidebar-item-icon {
  opacity: 0.9;
}

.sidebar-item-label {
  flex: 1;
  min-width: 0;
  max-width: 160px;
  opacity: 1;
  overflow: hidden;
  clip-path: inset(0 0 0 0 round 2px);
  text-overflow: ellipsis;
  transform: translate3d(0, 0, 0);
  white-space: nowrap;
  transition:
    max-width 220ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 480ms cubic-bezier(0.16, 1, 0.3, 1),
    clip-path 220ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: max-width, opacity, clip-path, transform;
}

/* ── Sidebar Footer ── */
.sidebar-footer {
  position: relative;
  z-index: 1;
  padding: 16px;
  border-top: 1px solid var(--sidebar-border);
  background:
    linear-gradient(180deg, transparent, color-mix(in srgb, var(--sidebar-foreground) 3%, transparent));
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition:
    gap var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    padding var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1));
}

.sidebar-user {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--sidebar-border) 86%, var(--sidebar-foreground) 5%);
  overflow: hidden;
  background: var(--sidebar-hover-item-background);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 72%),
    inset 0 -1px 0 rgb(72 68 61 / 6%),
    10px 12px 24px -18px rgb(72 68 61 / 28%),
    -8px -8px 20px -16px rgb(255 255 255 / 76%);
  transition:
    border-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    box-shadow var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    gap var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    height var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    padding var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    width var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1));
}

.sidebar-user::before,
.sidebar-signout::before {
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 14%), transparent 42%),
    radial-gradient(circle at 18% 0%, color-mix(in srgb, var(--sidebar-foreground) 6%, transparent), transparent 34%);
  content: "";
  opacity: 0.58;
  pointer-events: none;
}

.sidebar-user > *,
.sidebar-signout > * {
  position: relative;
  z-index: 1;
}

.sidebar-user-avatar {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 999px !important;
  border: 0;
  background: var(--sidebar-active-icon-background);
  color: var(--sidebar-foreground);
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
  outline: 0;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--sidebar-foreground) 18%, var(--sidebar-border)),
    var(--sidebar-active-icon-shadow);
}

.sidebar-user-avatar-fallback {
  border-radius: inherit !important;
  background: transparent;
  color: inherit;
}

:global(.dark .sidebar-user) {
  border-color: color-mix(in srgb, var(--sidebar-border) 86%, var(--sidebar-foreground) 5%);
  background:
    radial-gradient(120% 120% at 16% 0%, rgb(254 249 231 / 5%), transparent 44%),
    linear-gradient(145deg, rgb(34 32 28 / 88%), rgb(17 16 14 / 90%));
  box-shadow:
    inset 0 1px 0 rgb(254 249 231 / 9%),
    inset 0 -1px 0 rgb(0 0 0 / 32%),
    10px 12px 26px -18px rgb(0 0 0 / 92%),
    -6px -6px 18px -16px rgb(254 249 231 / 14%);
}

:global(.dark .sidebar-user::before),
:global(.dark .sidebar-signout::before) {
  background:
    linear-gradient(135deg, rgb(254 249 231 / 7%), transparent 42%),
    radial-gradient(circle at 18% 0%, rgb(254 249 231 / 5%), transparent 34%);
  opacity: 0.58;
}

:global(.dark .sidebar-user-avatar) {
  border: 0;
  background: var(--sidebar-active-icon-background);
  color: var(--sidebar-foreground);
  outline: 0;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--sidebar-foreground) 18%, var(--sidebar-border)),
    var(--sidebar-active-icon-shadow);
}

:global(.dark .sidebar-item.active .sidebar-icon-shell) {
  color: color-mix(in srgb, var(--sidebar-foreground) 84%, var(--sidebar-glass-accent) 16%);
}

.sidebar-user-info {
  min-width: 0;
  flex: 1;
  max-width: 168px;
  overflow: hidden;
  transition:
    max-width var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    opacity 360ms var(--sidebar-motion-ease, cubic-bezier(0.25, 0.1, 0.25, 1)),
    transform var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1));
}

.sidebar-user-name {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--sidebar-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-user-meta {
  font-size: 12px;
  color: var(--muted-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.6;
}

.sidebar-user-meta-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.sidebar-user-meta-row .sidebar-user-meta {
  min-width: 0;
  flex: 1;
}

.sidebar-version-badge {
  flex: 0 0 auto;
  max-width: 72px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--sidebar-foreground) 14%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--sidebar) 88%, white 12%);
  padding: 1px 6px;
  color: color-mix(in srgb, var(--sidebar-foreground) 70%, var(--muted-foreground));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 10px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark) .sidebar-version-badge {
  border-color: color-mix(in srgb, var(--sidebar-foreground) 18%, transparent);
  background: color-mix(in srgb, var(--sidebar-foreground) 8%, transparent);
  color: color-mix(in srgb, var(--sidebar-foreground) 76%, var(--muted-foreground));
}

.sidebar-signout {
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--sidebar-border) 86%, var(--sidebar-foreground) 5%);
  overflow: hidden;
  background: var(--sidebar-hover-item-background);
  color: var(--muted-foreground);
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--sidebar-hover-item-shadow);
  cursor: pointer;
  transition:
    background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    border-color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    color var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1)),
    gap var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    height var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    padding var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    width var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    box-shadow var(--duration-standard, 200ms) var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
}

.sidebar-signout :deep(svg) {
  filter:
    drop-shadow(0 1px 0 rgb(255 255 255 / 28%))
    drop-shadow(0 6px 8px rgb(84 64 24 / 14%));
}

:global(.dark .sidebar-signout) {
  border-color: color-mix(in srgb, var(--sidebar-border) 82%, var(--sidebar-foreground) 5%);
  background: var(--sidebar-hover-item-background);
  box-shadow: var(--sidebar-hover-item-shadow);
}

:global(.dark .sidebar-signout svg) {
  filter:
    drop-shadow(0 1px 0 rgb(254 249 231 / 10%))
    drop-shadow(0 6px 8px rgb(0 0 0 / 42%));
}

.sidebar-signout-label {
  display: inline-block;
  max-width: 96px;
  overflow: hidden;
  white-space: nowrap;
  transition:
    max-width var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1)),
    opacity 360ms var(--sidebar-motion-ease, cubic-bezier(0.25, 0.1, 0.25, 1)),
    transform var(--sidebar-motion-duration, 220ms) var(--sidebar-motion-ease, cubic-bezier(0.19, 1, 0.22, 1));
}

.sidebar-signout:hover {
  border-color: var(--destructive);
  color: var(--destructive);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--destructive) 8%, transparent), transparent),
    var(--sidebar-hover-item-background);
  box-shadow:
    var(--sidebar-hover-item-shadow),
    inset 2px 0 0 color-mix(in srgb, var(--destructive) 38%, transparent);
}

:global(.dark .sidebar-signout:hover) {
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--destructive) 9%, transparent), transparent),
    var(--sidebar-hover-item-background);
  box-shadow:
    var(--sidebar-hover-item-shadow),
    inset 2px 0 0 color-mix(in srgb, var(--destructive) 42%, transparent);
}

.sidebar-signout:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (min-width: 1024px) {
  @keyframes sidebar-label-conceal {
    0% {
      max-width: 160px;
      opacity: 1;
      clip-path: inset(0 0 0 0 round 2px);
      transform: translate3d(0, 0, 0);
    }

    38% {
      opacity: 0.72;
      transform: translate3d(-2px, 0, 0);
    }

    100% {
      max-width: 0;
      opacity: 0;
      clip-path: inset(0 100% 0 10px round 2px);
      transform: translate3d(-8px, 0, 0);
    }
  }

  @keyframes sidebar-label-reveal {
    0% {
      max-width: 0;
      opacity: 0;
      clip-path: inset(0 100% 0 10px round 2px);
      transform: translate3d(-8px, 0, 0);
    }

    44% {
      opacity: 0.18;
      transform: translate3d(-4px, 0, 0);
    }

    100% {
      max-width: 160px;
      opacity: 1;
      clip-path: inset(0 0 0 0 round 2px);
      transform: translate3d(0, 0, 0);
    }
  }

  .sidebar.collapsed .sidebar-item-label {
    max-width: 0;
    opacity: 0;
    clip-path: inset(0 100% 0 10px round 2px);
    pointer-events: none;
    transform: translate3d(-8px, 0, 0);
  }

  .desktop-sidebar.has-navigation-motion.collapsed .sidebar-item-label {
    animation: sidebar-label-conceal 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .desktop-sidebar.has-navigation-motion:not(.collapsed) .sidebar-item-label {
    animation: sidebar-label-reveal 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .sidebar.collapsed .sidebar-lock-badge {
    position: absolute;
    top: 7px;
    right: 7px;
    width: 16px;
    height: 16px;
  }

  .sidebar.collapsed .sidebar-lock-badge svg {
    width: 10px;
    height: 10px;
  }

  .sidebar.collapsed .sidebar-footer {
    align-items: center;
    gap: 10px;
    padding: 12px 10px;
  }

  .sidebar.collapsed .sidebar-user {
    justify-content: center;
    gap: 0;
    width: 44px;
    height: 44px;
    padding: 6px;
  }

  .sidebar.collapsed .sidebar-user-info {
    flex: 0 0 0;
    max-width: 0;
    opacity: 0;
    overflow: hidden;
    transform: translateX(-8px);
  }

  .sidebar.collapsed .sidebar-signout {
    width: 44px;
    height: 40px;
    gap: 0;
    padding: 0;
  }

  .sidebar.collapsed .sidebar-signout-label {
    max-width: 0;
    opacity: 0;
    transform: translateX(-6px);
  }

  .sidebar.collapsed .sidebar-signout-tooltip-target {
    width: 44px;
  }
}

.sidebar-signout-tooltip-target {
  display: block;
  width: 100%;
}

/* ── Main Content ── */
.main-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  max-width: 100%;
  min-height: calc(100svh - var(--topbar-height));
  overflow-x: hidden;
  overflow-x: clip;
  background: var(--background);
}

</style>
