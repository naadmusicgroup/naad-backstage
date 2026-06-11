import { expect, test, type Page } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  ensureSmokeArtist,
  insertSmokeCatalogTrack,
  purgeSmokeArtistWithRpc,
} from "./support/supabase"

async function assertShellControls(page: Page, options: { hasNotifications?: boolean } = {}) {
  await test.step("theme toggle works", async () => {
    const trigger = page.locator('.topbar-right button[aria-label^="Switch to"]')
    await expect(trigger).toBeVisible()

    const initialTheme = await page.locator("html").getAttribute("data-theme")
    await trigger.click()
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).not.toBe(initialTheme)

    await trigger.click()
    await expect.poll(() => page.locator("html").getAttribute("data-theme")).toBe(initialTheme)
  })

  await test.step("sidebar label toggle works", async () => {
    await page.getByRole("button", { name: "Hide navigation labels" }).click()
    await expect(page.getByRole("button", { name: "Reveal navigation" })).toBeVisible()

    await page.getByRole("button", { name: "Reveal navigation" }).click()
    await expect(page.getByRole("button", { name: "Hide navigation labels" })).toBeVisible()
  })

  if (options.hasNotifications) {
    await test.step("notification menu opens", async () => {
      const trigger = page.locator(".topbar-notification-trigger")
      await expect(trigger).toBeVisible()
      await trigger.click()
      await expect(page.getByText("Recent artist inbox activity", { exact: true })).toBeVisible()
      await page.keyboard.press("Escape")
    })
  }
}

async function assertNativeSelectOpens(page: Page, label: string, expectedOption: string) {
  const trigger = page.getByRole("combobox", { name: label })
  await expect(trigger).toBeVisible()
  const content = page.locator(".native-select-content")

  await expect(async () => {
    await trigger.click()

    if (!await content.isVisible()) {
      await trigger.press("Enter")
    }

    await expect(content).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10000 })

  await expect(content.getByText(expectedOption, { exact: true })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(trigger).toBeVisible()
}

async function assertSearchableAnalyticsFilter(page: Page, label: string, searchLabel: string) {
  const control = page.locator(".analytics-filter-strip .filter-control")
    .filter({ has: page.locator(".filter-control-label", { hasText: label }) })
    .first()
  const trigger = control.locator('[data-slot="native-select"]')
  await expect(trigger).toBeVisible()

  await trigger.click()

  const content = page.locator(".native-select-content")
  await expect(content).toBeVisible()

  const searchbox = content.getByRole("searchbox", { name: searchLabel })
  await expect(searchbox).toBeVisible()

  await searchbox.fill(`no-match-${Date.now()}`)
  await expect(content.getByText("No matches", { exact: true })).toBeVisible()

  await page.keyboard.press("Escape")
  if (await content.isVisible()) {
    await page.keyboard.press("Escape")
  }
  await expect(content).toBeHidden()
}

async function assertWorkspaceTab(page: Page, tabLabel: string, heading: string) {
  const tab = page.getByRole("tab", { name: new RegExp(`^${tabLabel}\\b`) })
  const headingLocator = page.getByRole("heading", { name: heading, exact: true })

  await expect(async () => {
    await tab.click()

    if (!await headingLocator.isVisible()) {
      await tab.press("Enter")
    }

    await expect(headingLocator).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10000 })
}

test.describe("safe dashboard controls", () => {
  test.setTimeout(180000)

  test("artist dashboard safe controls remain interactive", async ({ page }) => {
    await signInWithPassword(
      page,
      readEnv("SMOKE_ARTIST_EMAIL"),
      readEnv("SMOKE_ARTIST_PASSWORD"),
      "/dashboard",
    )

    await assertShellControls(page, { hasNotifications: true })

    await test.step("dashboard chart range selector works", async () => {
      await assertNativeSelectOpens(page, "Revenue chart range", "Last 6 months")
    })

    await test.step("analytics reset filter control works", async () => {
      await page.goto("/dashboard/analytics")
      await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible()
      await page.getByRole("button", { name: "Reset filters" }).click()
      await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible()
    })

    await test.step("settings section tabs work", async () => {
      await page.goto("/dashboard/settings")
      await assertWorkspaceTab(page, "Bank", "Bank details")
      await assertWorkspaceTab(page, "Preferences", "DSP profile preferences")
      await assertWorkspaceTab(page, "Login", "Connected login methods")
      await assertWorkspaceTab(page, "Publishing", "Publishing info")
      await assertWorkspaceTab(page, "Profile", "Profile details")
    })
  })

  test("admin dashboard safe controls remain interactive", async ({ page }) => {
    await signInWithPassword(
      page,
      readEnv("SMOKE_ADMIN_EMAIL"),
      readEnv("SMOKE_ADMIN_PASSWORD"),
      "/admin",
      { adminMfa: true },
    )

    await assertShellControls(page)

    await test.step("admin dashboard section tabs work", async () => {
      await assertWorkspaceTab(page, "Pending Releases", "Pending Releases")
      await assertWorkspaceTab(page, "Readiness", "Artist readiness")
      await assertWorkspaceTab(page, "Activity", "Recent admin activity")
      await assertWorkspaceTab(page, "Today", "Attention now")
    })

    await test.step("admin analytics period selector works", async () => {
      await page.goto("/admin/analytics")
      await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible()
      await assertNativeSelectOpens(page, "Analytics overview period", "12 months")
    })

    await test.step("admin artist workspace section tabs work", async () => {
      await page.goto("/admin/artists")
      await assertWorkspaceTab(page, "Access Queue", "Access queue")
      await assertWorkspaceTab(page, "Directory", "Artist directory")
    })

    await test.step("admin settings account login tab works", async () => {
      await page.goto("/admin/settings")
      await assertWorkspaceTab(page, "Account", "Connected login methods")
    })
  })

  test("admin release import requires an explicit artist target", async ({ page }) => {
    await signInWithPassword(
      page,
      readEnv("SMOKE_ADMIN_EMAIL"),
      readEnv("SMOKE_ADMIN_PASSWORD"),
      "/admin",
      { adminMfa: true },
    )

    await page.goto("/admin/releases")
    await assertWorkspaceTab(page, "Import", "Catalog Import")
    await expect(page.getByRole("combobox", { name: "Import target artist" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Run catalog import" })).toBeDisabled()
  })

  test("artist statements mobile controls do not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInWithPassword(
      page,
      readEnv("SMOKE_ARTIST_EMAIL"),
      readEnv("SMOKE_ARTIST_PASSWORD"),
      "/dashboard",
    )

    await page.goto("/dashboard/statements")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Monthly statements", exact: true })).toBeVisible()
    const filtersButton = page.getByRole("button", { name: /^Filters/ })
    await expect(filtersButton).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    const sheetHeading = page.getByRole("heading", { name: "Statement filters", exact: true })
    await expect(async () => {
      await filtersButton.click()
      await expect(sheetHeading).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10000 })
    await page.getByRole("button", { name: "Apply", exact: true }).click()
  })

  test("artist wallet statement mobile controls do not overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signInWithPassword(
      page,
      readEnv("SMOKE_ARTIST_EMAIL"),
      readEnv("SMOKE_ARTIST_PASSWORD"),
      "/dashboard",
    )

    await page.goto("/dashboard/wallet")
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toBeVisible()
    await expect(page.getByRole("tab", { name: /^Statement/ })).toBeVisible()
    await expect(page.getByRole("tab", { name: /^Request payout/ })).toBeVisible()
    await expect(page.getByText("Available balance", { exact: true }).first()).toBeVisible()
    await assertNativeSelectOpens(page, "Statement year", "2026")

    const statementPanel = page.locator(".statement-panel")
    await statementPanel.getByRole("button", { name: "Credit", exact: true }).click()
    await expect(statementPanel.getByRole("button", { name: "Clear", exact: true })).toBeVisible()
    await statementPanel.getByRole("button", { name: "Debit", exact: true }).click()
    await expect(statementPanel.getByRole("button", { name: "Clear", exact: true })).toBeVisible()
    await statementPanel.getByRole("button", { name: "Clear", exact: true }).click()
    await expect(statementPanel.getByRole("button", { name: "Clear", exact: true })).toBeHidden()

    await page.getByRole("tab", { name: /^Dues & Fees/ }).click()
    await expect(page.getByRole("tab", { name: /^Dues & Fees/ })).toHaveAttribute("aria-selected", "true")
    await page.getByRole("tab", { name: /^Payout History/ }).click()
    await expect(page.getByRole("tab", { name: /^Payout History/ })).toHaveAttribute("aria-selected", "true")
    await page.getByRole("tab", { name: /^Request payout/ }).click()
    await expect(page.getByRole("heading", { name: "Request payout", exact: true })).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })

  test("artist releases search filters by catalog identifiers and artists", async ({ page }) => {
    test.setTimeout(180000)

    const suffix = Date.now().toString(36)
    const email = `smoke-release-search-${suffix}@naad-backstage.local`
    const password = "SmokeArtist123!"
    const releaseTitle = `Searchable Release ${suffix}`
    const trackTitle = `Searchable Song ${suffix}`
    const isrc = `SRS${String(Date.now()).slice(-9)}`
    const upc = `98${String(Date.now()).slice(-10)}`
    const creditedName = `Featured Search Artist ${suffix}`
    let artistId = ""

    try {
      const smokeArtist = await ensureSmokeArtist({
        email,
        password,
        fullName: `Smoke Release Search ${suffix}`,
        stageName: `Search Primary Artist ${suffix}`,
        country: "NP",
        bio: "Release search smoke test artist",
      })
      artistId = smokeArtist.artistId

      await insertSmokeCatalogTrack({
        artistId,
        releaseTitle,
        trackTitle,
        isrc,
        upc,
        creditedName,
      })

      await page.setViewportSize({ width: 390, height: 844 })
      await signInWithPassword(page, email, password, "/dashboard")
      await page.goto("/dashboard/releases")
      await page.waitForLoadState("networkidle")
      await expect(page.getByRole("heading", { name: "Releases", exact: true })).toBeVisible()

      const searchInput = page.getByRole("searchbox", { name: "Search catalog" })
      await expect(searchInput).toBeVisible()
      await expect(page.getByText(releaseTitle, { exact: true })).toBeVisible()

      for (const term of [releaseTitle, trackTitle, isrc, upc, creditedName]) {
        await searchInput.fill(term)
        await page.waitForLoadState("networkidle")
        await expect(page.getByText(releaseTitle, { exact: true })).toBeVisible()
        await expect(page.getByRole("button", { name: "Clear release search" })).toBeVisible()
      }

      await searchInput.fill(`no-match-${suffix}`)
      await page.waitForLoadState("networkidle")
      await expect(page.getByText("No matching releases", { exact: true })).toBeVisible()

      await page.getByRole("button", { name: "Clear release search" }).click()
      await page.waitForLoadState("networkidle")
      await expect(page.getByText(releaseTitle, { exact: true })).toBeVisible()

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)
    } finally {
      if (artistId) {
        await purgeSmokeArtistWithRpc(artistId).catch(() => undefined)
      }
    }
  })

  test("artist analytics searchable filters remain usable", async ({ page }) => {
    await signInWithPassword(
      page,
      readEnv("SMOKE_ARTIST_EMAIL"),
      readEnv("SMOKE_ARTIST_PASSWORD"),
      "/dashboard",
    )

    await page.goto("/dashboard/analytics")
    await expect(page.getByRole("heading", { name: "Analytics", exact: true })).toBeVisible()
    await assertSearchableAnalyticsFilter(page, "Platform", "Search platforms")
    await assertSearchableAnalyticsFilter(page, "Country", "Search countries")
    await assertSearchableAnalyticsFilter(page, "Release", "Search releases")
    await assertSearchableAnalyticsFilter(page, "Track", "Search tracks")
  })
})
