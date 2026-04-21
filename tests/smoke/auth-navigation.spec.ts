import { expect, test, type Page } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"

const artistTabs = [
  { label: "Wallet", path: "/dashboard", heading: "Wallet state" },
  { label: "Analytics", path: "/dashboard/analytics", heading: "Analytics" },
  { label: "Statements", path: "/dashboard/statements", heading: "Monthly statements" },
  { label: "Releases", path: "/dashboard/releases", heading: "Releases" },
  { label: "Settings", path: "/dashboard/settings", heading: "Account settings" },
]

const adminTabs = [
  { label: "Dashboard", path: "/admin", heading: "Admin panel" },
  { label: "Ingestion", path: "/admin/ingestion", heading: "CSV intake" },
  { label: "Artists", path: "/admin/artists", heading: "Create artist account" },
  { label: "Payouts", path: "/admin/payouts", heading: "Payout operations" },
  { label: "Settings", path: "/admin/settings", heading: "Settings and logs" },
]

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function assertTabReloadPersistsSession(
  page: Page,
  tabs: Array<{ label: string; path: string; heading: string }>,
) {
  for (const tab of tabs) {
    await test.step(`${tab.label} survives reload`, async () => {
      await page.getByRole("link", { name: tab.label, exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`${escapeForRegex(tab.path)}$`))
      await expect(page.getByRole("heading", { name: tab.heading, exact: true })).toBeVisible()

      await page.reload()

      await expect(page).toHaveURL(new RegExp(`${escapeForRegex(tab.path)}$`))
      await expect(page.getByRole("heading", { name: tab.heading, exact: true })).toBeVisible()
      await expect(page).not.toHaveURL(/\/login$/)
    })
  }
}

test.describe("artist auth navigation", () => {
  test.setTimeout(60000)

  test("artist routes stay rendered and authenticated after tab clicks and refreshes", async ({ page }) => {
    await signInWithPassword(
      page,
      readEnv("SMOKE_ARTIST_EMAIL"),
      readEnv("SMOKE_ARTIST_PASSWORD"),
      "/dashboard",
    )

    await assertTabReloadPersistsSession(page, artistTabs)
  })
})

test.describe("admin auth navigation", () => {
  test.setTimeout(60000)

  test("admin routes stay rendered and authenticated after tab clicks and refreshes", async ({ page }) => {
    await signInWithPassword(
      page,
      readEnv("SMOKE_ADMIN_EMAIL"),
      readEnv("SMOKE_ADMIN_PASSWORD"),
      "/admin",
      { adminMfa: true },
    )

    await assertTabReloadPersistsSession(page, adminTabs)
  })
})
