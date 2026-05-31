import fs from "node:fs"
import path from "node:path"

const rootDir = process.cwd()

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

function fileSize(relativePath) {
  return fs.statSync(path.join(rootDir, relativePath)).size
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath))
}

const dashboardPage = readFile("app/pages/dashboard/index.vue")
const adminDashboardPage = readFile("app/pages/admin/index.vue")
const nuxtConfig = readFile("nuxt.config.ts")

const dashboardArtAssets = [
  "dashboard-wallet-balance-bg",
  "dashboard-wallet-balance-bg-light",
  "dashboard-total-balance-bg",
  "dashboard-total-balance-bg-light",
  "dashboard-pending-dues-bg",
  "dashboard-pending-dues-bg-light",
]

const failures = []

for (const assetName of dashboardArtAssets) {
  const avifPath = `public/${assetName}.avif`
  const webpPath = `public/${assetName}.webp`
  const pngPath = `public/${assetName}.png`

  if (!fileExists(avifPath)) {
    failures.push(`${avifPath}: optimized AVIF dashboard art is missing`)
  } else if (fileSize(avifPath) > 400 * 1024) {
    failures.push(`${avifPath}: AVIF dashboard art must stay below 400 KB`)
  }

  if (!fileExists(webpPath)) {
    failures.push(`${webpPath}: optimized WebP dashboard art is missing`)
  } else if (fileSize(webpPath) > 700 * 1024) {
    failures.push(`${webpPath}: WebP dashboard art must stay below 700 KB`)
  }

  if (!fileExists(pngPath)) {
    failures.push(`${pngPath}: PNG fallback is missing`)
  }
}

const dashboardChecks = [
  {
    label: "dashboard card art serves AVIF first",
    test: () => /<source\s+:srcset="dashboardKpiArtSrc\(stat\.art,\s*'avif'\)"\s+type="image\/avif">/.test(dashboardPage),
  },
  {
    label: "dashboard card art serves WebP before PNG fallback",
    test: () => /<source\s+:srcset="dashboardKpiArtSrc\(stat\.art,\s*'webp'\)"\s+type="image\/webp">/.test(dashboardPage),
  },
  {
    label: "dashboard card art keeps PNG only as the fallback img src",
    test: () => /<img[\s\S]*:src="dashboardKpiArtSrc\(stat\.art\)"[\s\S]*>/.test(dashboardPage),
  },
  {
    label: "only the primary wallet card gets high image priority",
    test: () => /:fetchpriority="stat\.art === 'wallet' \? 'high' : 'auto'"/.test(dashboardPage),
  },
  {
    label: "non-primary dashboard art stays lazy loaded",
    test: () => /:loading="stat\.art === 'wallet' \? 'eager' : 'lazy'"/.test(dashboardPage),
  },
  {
    label: "dashboard page does not preload all dashboard card art",
    test: () => !/rel:\s*["']preload["'][\s\S]*dashboard-[\w-]+-bg/.test(dashboardPage),
  },
  {
    label: "dashboard home revenue chart stays lazy loaded",
    test: () =>
      /<LazyAnalyticsMonthlyRevenueChartPanel\b/.test(dashboardPage)
      && !/<AnalyticsMonthlyRevenueChartPanel\b/.test(dashboardPage),
  },
]

for (const check of dashboardChecks) {
  if (!check.test()) {
    failures.push(`app/pages/dashboard/index.vue: ${check.label}`)
  }
}

const adminDashboardChecks = [
  {
    label: "admin dashboard tables stay lazy loaded",
    test: () =>
      /<LazyDataTable\b/.test(adminDashboardPage)
      && !/<DataTable\b/.test(adminDashboardPage),
  },
]

for (const check of adminDashboardChecks) {
  if (!check.test()) {
    failures.push(`app/pages/admin/index.vue: ${check.label}`)
  }
}

const nuxtLinkPrefetchCheck =
  /defaults\s*:\s*{[\s\S]*nuxtLink\s*:\s*{[\s\S]*prefetch\s*:\s*true[\s\S]*prefetchOn\s*:\s*{[\s\S]*visibility\s*:\s*false[\s\S]*interaction\s*:\s*true[\s\S]*}/m.test(nuxtConfig)
  && !/prefetchOn\s*:\s*{[\s\S]*visibility\s*:\s*true/m.test(nuxtConfig)

if (!nuxtLinkPrefetchCheck) {
  failures.push("nuxt.config.ts: NuxtLink prefetch must stay interaction-only to avoid loading every visible dashboard route")
}

if (failures.length) {
  console.error("Performance guardrails failed:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Performance guardrails passed.")
