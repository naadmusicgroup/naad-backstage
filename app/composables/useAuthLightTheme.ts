type AuthTheme = "dark" | "light"

const AUTH_THEME_STORAGE_KEY = "naad-backstage-theme"
const DEFAULT_AUTH_THEME: AuthTheme = "dark"
const BROWSER_COLOR_SCHEME = "only light"

function applyAuthTheme(theme: AuthTheme) {
  const root = document.documentElement
  root.classList.remove(theme === "dark" ? "light" : "dark")
  root.classList.add(theme)
  root.dataset.theme = theme
  root.style.colorScheme = BROWSER_COLOR_SCHEME
}

function storeAuthTheme(theme: AuthTheme) {
  try {
    window.localStorage.setItem(AUTH_THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be blocked in private or embedded browser contexts.
  }
}

function readStoredAuthTheme(): AuthTheme {
  try {
    return window.localStorage.getItem(AUTH_THEME_STORAGE_KEY) === "light" ? "light" : DEFAULT_AUTH_THEME
  } catch {
    return DEFAULT_AUTH_THEME
  }
}

function useAuthTheme(theme: AuthTheme, options: { persist?: boolean } = {}) {
  useHead({
    htmlAttrs: {
      class: theme,
      "data-theme": theme,
      style: `color-scheme: ${BROWSER_COLOR_SCHEME};`,
    },
  })

  onMounted(() => {
    if (options.persist) {
      storeAuthTheme(theme)
    }

    applyAuthTheme(theme)
  })

  onBeforeUnmount(() => {
    applyAuthTheme(readStoredAuthTheme())
  })
}

export function useAuthDarkTheme() {
  useAuthTheme("dark", { persist: true })
}

export function useAuthLightTheme() {
  useAuthTheme("light")
}
