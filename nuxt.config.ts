const siteUrl = process.env.NUXT_PUBLIC_SITE_URL || "http://localhost:3000"
const useSecureCookies = /^https:\/\//i.test(siteUrl)
const inactivityTimeoutMs = Number(process.env.NUXT_PUBLIC_INACTIVITY_TIMEOUT_MS || 30 * 60 * 1000)

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  srcDir: "app/",
  devtools: { enabled: true },
  experimental: {
    appManifest: false,
  },
  css: ["~/assets/css/main.css"],
  modules: ["@nuxtjs/supabase"],
  runtimeConfig: {
    public: {
      siteUrl,
      inactivityTimeoutMs,
    },
  },
  supabase: {
    redirect: false,
    types: false,
    cookieOptions: {
      secure: useSecureCookies,
    },
    redirectOptions: {
      login: "/login",
      callback: "/auth/callback",
      exclude: ["/", "/login", "/setup", "/auth/callback", "/auth/reset-password"],
    },
  },
  app: {
    head: {
      title: "Naad Backstage",
      meta: [
        {
          name: "description",
          content:
            "White-label music royalty operations dashboard for admin ingestion, catalog control, and artist wallets.",
        },
      ],
    },
  },
  typescript: {
    strict: true,
  },
})
