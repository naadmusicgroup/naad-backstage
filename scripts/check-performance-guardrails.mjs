import fs from "node:fs"
import path from "node:path"

const rootDir = process.cwd()

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8")
}

const dashboardPage = readFile("app/pages/dashboard/index.vue")
const adminDashboardPage = readFile("app/pages/admin/index.vue")
const nuxtConfig = readFile("nuxt.config.ts")

const failures = []

const dashboardChecks = [
  {
    label: "dashboard KPI row uses the shared StatCard loop",
    test: () => {
      const kpiGridMatch = dashboardPage.match(/<div class="dashboard-kpi-grid[\s\S]*?<DashboardBento\b/)

      if (!kpiGridMatch) {
        return false
      }

      const kpiGridSource = kpiGridMatch[0]
      return kpiGridSource.includes('v-for="stat in dashboardStats"') && /<StatCard\b/.test(kpiGridSource) && !/<picture\b|<source\b|<img\b|<article\b/.test(kpiGridSource)
    },
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
