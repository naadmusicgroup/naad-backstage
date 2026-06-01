import { readFileSync } from "node:fs"
import tailwindcss from "@tailwindcss/vite"

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

function resolveAppVersion() {
  const explicitVersion = String(process.env.NUXT_PUBLIC_APP_VERSION || process.env.APP_VERSION || "").trim()

  if (explicitVersion) {
    return explicitVersion
  }

  try {
    const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
      version?: unknown
    }
    const packageVersion = String(packageJson.version ?? "").trim()

    return packageVersion || "0.0.0"
  } catch {
    return "0.0.0"
  }
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
const appVersion = resolveAppVersion()
const siteTitle = "Naad Backstage"
const siteDescription = "Dashboard of Naad Music Group artists and labels."
const socialSiteUrl = "https://naadbackstage.com"
const socialImageUrl = `${socialSiteUrl}/og-naad-backstage.png`
const useSecureCookies = /^https:\/\//i.test(siteUrl)
const inactivityTimeoutMs = Number(process.env.NUXT_PUBLIC_INACTIVITY_TIMEOUT_MS || 30 * 60 * 1000)
const immutableStaticAssetHeaders = {
  "cache-control": "public, max-age=31536000, immutable",
}
const immutableStaticAssetRule = {
  cache: { maxAge: 31536000 },
  headers: immutableStaticAssetHeaders,
}
const themeInitScript = `!function(){try{var d=document.documentElement,t=localStorage.getItem("naad-backstage-theme");if(t!=="light"&&t!=="dark")t="dark";d.classList.remove(t==="dark"?"light":"dark");d.classList.add(t);d.dataset.theme=t;d.style.colorScheme=t;}catch(e){var d=document.documentElement;d.classList.remove("light");d.classList.add("dark");d.dataset.theme="dark";d.style.colorScheme="dark";}}();`

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  srcDir: "app/",
  dir: {
    public: "../public",
  },
  devtools: { enabled: process.env.NUXT_DEVTOOLS === "true" },
  experimental: {
    appManifest: false,
    defaults: {
      nuxtLink: {
        prefetch: true,
        prefetchOn: {
          visibility: false,
          interaction: true,
        },
      },
    },
  },
  css: ["~/assets/css/tailwind.css", "~/assets/css/components.css", "~/assets/css/cream-glass.css"],
  modules: ["@nuxtjs/supabase", "shadcn-nuxt"],
  vite: {
    plugins: [tailwindcss()],
  },
  shadcn: {
    prefix: "",
    componentDir: "@/components/ui",
  },
  runtimeConfig: {
    public: {
      siteUrl,
      appVersion,
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
      exclude: ["/", "/login", "/auth/callback", "/auth/reset-password"],
    },
  },
  routeRules: {
    "/dashboard-wallet-balance-bg.png": immutableStaticAssetRule,
    "/dashboard-wallet-balance-bg.avif": immutableStaticAssetRule,
    "/dashboard-wallet-balance-bg.webp": immutableStaticAssetRule,
    "/dashboard-wallet-balance-bg-light.png": immutableStaticAssetRule,
    "/dashboard-wallet-balance-bg-light.avif": immutableStaticAssetRule,
    "/dashboard-wallet-balance-bg-light.webp": immutableStaticAssetRule,
    "/dashboard-total-balance-bg.png": immutableStaticAssetRule,
    "/dashboard-total-balance-bg.avif": immutableStaticAssetRule,
    "/dashboard-total-balance-bg.webp": immutableStaticAssetRule,
    "/dashboard-total-balance-bg-light.png": immutableStaticAssetRule,
    "/dashboard-total-balance-bg-light.avif": immutableStaticAssetRule,
    "/dashboard-total-balance-bg-light.webp": immutableStaticAssetRule,
    "/dashboard-pending-dues-bg.png": immutableStaticAssetRule,
    "/dashboard-pending-dues-bg.avif": immutableStaticAssetRule,
    "/dashboard-pending-dues-bg.webp": immutableStaticAssetRule,
    "/dashboard-pending-dues-bg-light.png": immutableStaticAssetRule,
    "/dashboard-pending-dues-bg-light.avif": immutableStaticAssetRule,
    "/dashboard-pending-dues-bg-light.webp": immutableStaticAssetRule,
    "/email-access-pass-header.jpg": immutableStaticAssetRule,
    "/email-logo.png": immutableStaticAssetRule,
    "/logo-512.avif": immutableStaticAssetRule,
    "/logo-512.webp": immutableStaticAssetRule,
    "/logo-512.png": immutableStaticAssetRule,
    "/logo-light-512.avif": immutableStaticAssetRule,
    "/logo-light-512.webp": immutableStaticAssetRule,
    "/logo-light-512.png": immutableStaticAssetRule,
    "/naadlogo-512.avif": immutableStaticAssetRule,
    "/naadlogo-512.webp": immutableStaticAssetRule,
    "/naadlogo-512.png": immutableStaticAssetRule,
  },
  app: {
    head: {
      htmlAttrs: {
        class: "dark",
        "data-theme": "dark",
        style: "color-scheme: dark;",
      },
      title: siteTitle,
      meta: [
        {
          name: "description",
          content: siteDescription,
        },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: siteTitle },
        { property: "og:title", content: siteTitle },
        { property: "og:description", content: siteDescription },
        { property: "og:url", content: socialSiteUrl },
        { property: "og:image", content: socialImageUrl },
        { property: "og:image:secure_url", content: socialImageUrl },
        { property: "og:image:type", content: "image/png" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: "Naad Backstage" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: siteTitle },
        {
          name: "twitter:description",
          content: siteDescription,
        },
        {
          name: "twitter:image",
          content: socialImageUrl,
        },
      ],
      link: [
        { rel: "canonical", href: socialSiteUrl },
        { rel: "icon", href: "/favicon.ico", sizes: "any" },
        { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      ],
      script: [
        {
          id: "theme-init",
          innerHTML: themeInitScript,
          tagPriority: "critical",
          tagPosition: "head",
        },
      ],
    },
  },
  typescript: {
    strict: true,
  },
})
