function decodeJwtPayload(token?: string | null): Record<string, unknown> | null {
  if (!token) {
    return null
  }

  const [, payload] = token.split(".")

  if (!payload) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
}

function deriveCanonicalSupabaseUrl(token?: string | null) {
  const payload = decodeJwtPayload(token)
  const projectRef = typeof payload?.ref === "string" ? payload.ref.trim() : ""

  return projectRef ? `https://${projectRef}.supabase.co` : ""
}

function normalizeSiteUrl() {
  const configuredUrl = String(process.env.NUXT_PUBLIC_SITE_URL || "").trim()

  if (configuredUrl) {
    return configuredUrl
  }

  const vercelUrl = String(process.env.VERCEL_URL || "").trim()

  if (!vercelUrl) {
    return "http://localhost:3000"
  }

  return /^https?:\/\//i.test(vercelUrl) ? vercelUrl : `https://${vercelUrl}`
}

const supabasePublicKey =
  process.env.NUXT_PUBLIC_SUPABASE_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ||
  ""
const supabasePublicUrl =
  process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || deriveCanonicalSupabaseUrl(supabasePublicKey)
const siteUrl = normalizeSiteUrl()
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
      supabase: {
        url: supabasePublicUrl,
        key: supabasePublicKey,
      },
    },
  },
  supabase: {
    url: supabasePublicUrl,
    key: supabasePublicKey,
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
