import { expect, test, type Locator, type Page } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import {
  ensureSmokeArtist,
  insertSmokeCatalogTrack,
  insertSmokeEarning,
  purgeSmokeArtistWithRpc,
  refreshSmokeMonthlyEarningsSummary,
} from "./support/supabase"

async function selectMonth(page: Page, trigger: Locator, monthLabel: string) {
  await expect(trigger).toBeVisible()
  await trigger.click()
  await page.getByRole("button", { name: monthLabel, exact: true }).click()
}

function waitForResponseWithParams(page: Page, pathname: string, expectedParams: Record<string, string>) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())

    if (url.pathname !== pathname) {
      return false
    }

    return Object.entries(expectedParams).every(([key, value]) => url.searchParams.get(key) === value)
  })
}

test.describe("dashboard custom date range", () => {
  test.setTimeout(180000)

  test("analytics time control updates preset, period, and custom queries", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const email = `smoke-range-${suffix}@naad-backstage.local`
    const password = "SmokeArtist123!"
    const currentYear = new Date().getUTCFullYear()
    const seedPeriodMonth = `${currentYear}-05-01`
    let artistId = ""

    try {
      const smokeArtist = await ensureSmokeArtist({
        email,
        password,
        fullName: `Smoke Range ${suffix}`,
        stageName: `Range Artist ${suffix}`,
        country: "NP",
        bio: "Analytics range smoke test artist",
      })
      artistId = smokeArtist.artistId
      const uploadedBy = smokeArtist.userId
      const { releaseId, trackId } = await insertSmokeCatalogTrack({
        artistId,
        releaseTitle: `Analytics Range Release ${suffix}`,
        trackTitle: `Analytics Range Track ${suffix}`,
        isrc: `ARG${String(Date.now()).slice(-9)}`,
      })

      await insertSmokeEarning({
        uploadedBy,
        artistId,
        releaseId,
        trackId,
        amount: "18.00000000",
        checksum: `smoke-analytics-range-${suffix}`,
        filename: `smoke-analytics-range-${suffix}.csv`,
        periodMonth: seedPeriodMonth,
      })
      await refreshSmokeMonthlyEarningsSummary(artistId, seedPeriodMonth)

      await signInWithPassword(page, email, password, "/dashboard")

      await page.goto("/dashboard/analytics", { waitUntil: "domcontentloaded" })
      await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible()

      const timeTrigger = page.getByRole("button", { name: /^Time:/ })
      await expect(timeTrigger).toBeVisible({ timeout: 30000 })
      await expect(timeTrigger).toContainText("Last 6 months")
      await timeTrigger.click()

      const timePanel = page.locator(".analytics-time-panel")
      await expect(timePanel).toBeVisible()
      await expect(timePanel.getByRole("tab", { name: "Preset" })).toHaveAttribute("aria-selected", "true")

      await timePanel.getByRole("tab", { name: "Period" }).click()
      const analyticsPeriodResponse = waitForResponseWithParams(page, "/api/dashboard/analytics", {
        periodMonth: seedPeriodMonth,
      })
      await timePanel.getByRole("button", { name: `May ${currentYear}`, exact: true }).click()
      await expect(timeTrigger).toContainText(`May ${currentYear}`)
      expect((await analyticsPeriodResponse).ok()).toBeTruthy()

      await timePanel.getByRole("tab", { name: "Preset" }).click()
      const analyticsPresetResponse = waitForResponseWithParams(page, "/api/dashboard/analytics", {
        overviewPeriodRange: "last_12_months",
      })
      await timePanel.getByRole("button", { name: "Last 12 months", exact: true }).click()
      await expect(timeTrigger).toContainText("Last 12 months")
      expect((await analyticsPresetResponse).ok()).toBeTruthy()

      await timePanel.getByRole("tab", { name: "Custom" }).click()
      const analyticsRangeFields = timePanel.locator(".analytics-time-field")
      const analyticsStartMonth = analyticsRangeFields.first().getByRole("button")
      const analyticsEndMonth = analyticsRangeFields.nth(1).getByRole("button")

      const analyticsRangeResponse = waitForResponseWithParams(page, "/api/dashboard/analytics", {
        overviewPeriodStartMonth: `${currentYear}-03`,
        overviewPeriodEndMonth: `${currentYear}-05`,
      })

      await selectMonth(page, analyticsStartMonth, "Mar")
      await selectMonth(page, analyticsEndMonth, "May")

      await expect(analyticsStartMonth).toContainText(`March ${currentYear}`)
      await expect(analyticsEndMonth).toContainText(`May ${currentYear}`)
      await expect(timeTrigger).toContainText(`Mar ${currentYear} to May ${currentYear}`)
      await expect(timePanel.getByRole("button", { name: "Clear range" })).toBeVisible()
      expect((await analyticsRangeResponse).ok()).toBeTruthy()

      await page.screenshot({
        path: "D:/naad-backstage/.codex-screenshots/dashboard-analytics-custom-range.png",
        fullPage: false,
      })

      await page.setViewportSize({ width: 390, height: 844 })
      if (!(await timePanel.isVisible())) {
        await timeTrigger.click()
      }
      await expect(timePanel).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    } finally {
      if (artistId) {
        await purgeSmokeArtistWithRpc(artistId).catch(() => undefined)
      }
    }
  })

  test("statements date range updates the dashboard query", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const email = `smoke-statement-range-${suffix}@naad-backstage.local`
    const password = "SmokeArtist123!"
    const currentYear = new Date().getUTCFullYear()
    const seedPeriodMonth = `${currentYear}-05-01`
    let artistId = ""

    try {
      const smokeArtist = await ensureSmokeArtist({
        email,
        password,
        fullName: `Smoke Statement Range ${suffix}`,
        stageName: `Statement Range Artist ${suffix}`,
        country: "NP",
        bio: "Statement range smoke test artist",
      })
      artistId = smokeArtist.artistId
      const uploadedBy = smokeArtist.userId
      const { releaseId, trackId } = await insertSmokeCatalogTrack({
        artistId,
        releaseTitle: `Statement Range Release ${suffix}`,
        trackTitle: `Statement Range Track ${suffix}`,
        isrc: `SRG${String(Date.now()).slice(-9)}`,
      })

      await insertSmokeEarning({
        uploadedBy,
        artistId,
        releaseId,
        trackId,
        amount: "12.00000000",
        checksum: `smoke-statement-range-${suffix}`,
        filename: `smoke-statement-range-${suffix}.csv`,
        periodMonth: seedPeriodMonth,
      })
      await refreshSmokeMonthlyEarningsSummary(artistId, seedPeriodMonth)

      await page.setViewportSize({ width: 1440, height: 1100 })
      await signInWithPassword(page, email, password, "/dashboard")

      await page.goto("/dashboard/statements", { waitUntil: "domcontentloaded" })
      await expect(page.getByRole("heading", { name: "Monthly statements", exact: true })).toBeVisible()
      await page.waitForLoadState("networkidle")

      const statementFilterGrid = page.locator(".statement-filter-grid.statement-desktop-filters")
      await expect(statementFilterGrid).toBeVisible()
      const statementRangeInputs = statementFilterGrid.locator(".statement-range-input")
      const statementStartMonth = statementRangeInputs.first().locator("button")
      const statementEndMonth = statementRangeInputs.nth(1).locator("button")

      await expect(statementStartMonth).toBeVisible()
      await expect(statementEndMonth).toBeVisible()

      const statementsRangeResponse = waitForResponseWithParams(page, "/api/dashboard/statements", {
        periodStartMonth: `${currentYear}-03`,
        periodEndMonth: `${currentYear}-05`,
      })

      await selectMonth(page, statementStartMonth, "Mar")
      await selectMonth(page, statementEndMonth, "May")

      await expect(statementStartMonth).toContainText(`March ${currentYear}`)
      await expect(statementEndMonth).toContainText(`May ${currentYear}`)
      expect((await statementsRangeResponse).ok()).toBeTruthy()

      await page.screenshot({
        path: "D:/naad-backstage/.codex-screenshots/dashboard-statements-custom-range.png",
        fullPage: false,
      })

      await page.setViewportSize({ width: 390, height: 844 })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    } finally {
      if (artistId) {
        await purgeSmokeArtistWithRpc(artistId).catch(() => undefined)
      }
    }
  })
})
