import { expect, test, type Page } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"

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
})
