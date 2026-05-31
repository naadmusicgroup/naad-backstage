import { expect, test, type Page } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"

const artistTabs = [
  { label: "Dashboard", path: "/dashboard", heading: /Welcome back,/ },
  { label: "Wallet", path: "/dashboard/wallet", heading: "Wallet" },
  { label: "Notifications", path: "/dashboard/notifications", heading: "Notifications" },
  { label: "Analytics", path: "/dashboard/analytics", heading: "Analytics" },
  { label: "Releases", path: "/dashboard/releases", heading: "Releases" },
  { label: "Uploaded", path: "/dashboard/uploaded", heading: "Uploaded" },
  { label: "Statements", path: "/dashboard/statements", heading: "Monthly statements" },
  { label: "Settings", path: "/dashboard/settings", heading: "Profile details" },
]

const adminTabs = [
  { label: "Dashboard", path: "/admin", heading: "Admin panel" },
  { label: "Ingestion", path: "/admin/ingestion", heading: "CSV intake" },
  { label: "Artists", path: "/admin/artists", heading: "Artist directory" },
  { label: "Releases", path: "/admin/releases", heading: "Release Workspace" },
  { label: "Analytics", path: "/admin/analytics", heading: "Analytics" },
  { label: "Earnings", path: "/admin/earnings", heading: "Earnings ledger" },
  { label: "Publishing", path: "/admin/publishing", heading: "Publishing" },
  { label: "Dues", path: "/admin/dues", heading: "Dues" },
  { label: "Payouts", path: "/admin/payouts", heading: "Payout operations" },
  { label: "Settings", path: "/admin/settings", heading: "Settings and logs" },
]

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

async function assertTabReloadPersistsSession(
  page: Page,
  tabs: Array<{ label: string; path: string; heading: string | RegExp }>,
) {
  for (const tab of tabs) {
    await test.step(`${tab.label} survives reload`, async () => {
      await page.getByRole("link", { name: new RegExp(`\\b${escapeForRegex(tab.label)}\\b`) }).first().click()
      await expect(page).toHaveURL(new RegExp(`${escapeForRegex(tab.path)}$`))
      await expect(page.getByRole("heading", { name: tab.heading, exact: typeof tab.heading === "string" })).toBeVisible()

      await page.reload()

      await expect(page).toHaveURL(new RegExp(`${escapeForRegex(tab.path)}$`))
      await expect(page.getByRole("heading", { name: tab.heading, exact: typeof tab.heading === "string" })).toBeVisible()
      await expect(page).not.toHaveURL(/\/login$/)
    })
  }
}

test.describe("artist auth navigation", () => {
  test.setTimeout(120000)

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
  test.setTimeout(120000)

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
