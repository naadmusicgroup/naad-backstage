import { expect, test } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"
import { ensureSmokeArtist, generateRecoveryData } from "./support/supabase"

const defaultSmokeBaseURL = "http://localhost:3100"

test.describe("auth recovery and security", () => {
  test.setTimeout(120000)

  test("logged-in artist can change the password from settings and use the new password", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const email = `smoke-settings-password-${suffix}@naad-backstage.local`
    const originalPassword = "SettingsArtist123!"
    const nextPassword = "SettingsArtist456!"

    await ensureSmokeArtist({
      email,
      password: originalPassword,
      fullName: `Settings Artist ${suffix}`,
      stageName: `Settings Stage ${suffix}`,
      country: "Nepal",
      bio: "Settings password smoke test user",
    })

    await signInWithPassword(page, email, originalPassword, "/dashboard")
    await page.goto("/dashboard/settings")
    await expect(page.getByRole("heading", { name: "Account settings", exact: true })).toBeVisible()

    await page.getByLabel("Current password", { exact: true }).fill(originalPassword)
    await page.getByLabel("New password", { exact: true }).fill(nextPassword)
    await page.getByLabel("Confirm new password", { exact: true }).fill(nextPassword)
    await page.getByRole("button", { name: "Change password", exact: true }).click()

    await expect(page.getByText("Password updated for this account.")).toBeVisible()
    await page.getByRole("button", { name: "Sign out", exact: true }).click()
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole("heading", { name: "Log in to Naad Backstage", exact: true })).toBeVisible()

    await page.getByLabel("Email", { exact: true }).fill(email)
    await page.getByLabel("Password", { exact: true }).fill(originalPassword)
    await page.getByRole("button", { name: "Sign in with password", exact: true }).click()
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)

    await signInWithPassword(page, email, nextPassword, "/dashboard")
    await expect(page.getByRole("heading", { name: "Wallet state", exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test("password recovery updates the password and returns the artist to the dashboard", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const email = `smoke-recovery-${suffix}@naad-backstage.local`
    const originalPassword = "RecoverArtist123!"
    const nextPassword = "RecoverArtist456!"
    const fullName = `Recovery Artist ${suffix}`
    const baseURL = readEnv("SMOKE_BASE_URL") || defaultSmokeBaseURL

    await ensureSmokeArtist({
      email,
      password: originalPassword,
      fullName,
      stageName: `Recovery Stage ${suffix}`,
      country: "Nepal",
      bio: "Recovery smoke test user",
    })

    const recovery = await generateRecoveryData(email, `${baseURL}/auth/reset-password`)

    await page.goto(recovery.actionLink)
    await expect(page.getByRole("heading", { name: "Reset password", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Save new password", exact: true })).toBeEnabled({ timeout: 30_000 })
    await page.getByLabel("New password", { exact: true }).fill(nextPassword)
    await page.getByLabel("Confirm password", { exact: true }).fill(nextPassword)
    await expect(page.getByRole("button", { name: "Save new password", exact: true })).toBeEnabled()
    await page.getByRole("button", { name: "Save new password", exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole("heading", { name: "Wallet state", exact: true })).toBeVisible({ timeout: 15_000 })

    await page.getByRole("button", { name: "Sign out", exact: true }).click()
    await signInWithPassword(page, email, nextPassword, "/dashboard")
    await expect(page.getByRole("heading", { name: "Wallet state", exact: true })).toBeVisible({ timeout: 15_000 })
  })

  test("inactivity timeout signs the artist out when the last activity is stale", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const email = `smoke-inactivity-${suffix}@naad-backstage.local`
    const password = "InactivityArtist123!"

    await ensureSmokeArtist({
      email,
      password,
      fullName: `Inactivity Artist ${suffix}`,
      stageName: `Inactivity Stage ${suffix}`,
      country: "Nepal",
      bio: "Inactivity smoke test user",
    })

    await signInWithPassword(page, email, password, "/dashboard")

    await expect(page.getByRole("heading", { name: "Wallet state", exact: true })).toBeVisible({ timeout: 15_000 })

    await page.evaluate(() => {
      const staleTimestamp = String(Date.now() - 60 * 60 * 1000)
      window.localStorage.setItem("naad-last-activity-at", staleTimestamp)
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "naad-last-activity-at",
          newValue: staleTimestamp,
        }),
      )
    })

    await expect(page).toHaveURL(/\/login$/, { timeout: 35_000 })
    await expect(page.getByRole("heading", { name: "Log in to Naad Backstage", exact: true })).toBeVisible()
  })
})
