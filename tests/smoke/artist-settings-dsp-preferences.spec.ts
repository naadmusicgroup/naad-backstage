import { expect, test } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"

test.describe("artist DSP profile preferences", () => {
  test.setTimeout(120000)

  test("saved DSP profile links reload in artist settings", async ({ page }) => {
    const hydrationWarnings: string[] = []
    page.on("console", (message) => {
      const text = message.text()

      if (/hydration/i.test(text)) {
        hydrationWarnings.push(text)
      }
    })

    await signInWithPassword(
      page,
      readEnv("SMOKE_ARTIST_EMAIL"),
      readEnv("SMOKE_ARTIST_PASSWORD"),
      "/dashboard",
    )

    await page.goto("/dashboard/settings")
    await expect(page.getByRole("heading", { name: "Account settings", exact: true })).toBeVisible()
    await page.waitForLoadState("networkidle")
    const preferencesTab = page.getByRole("tab", { name: /Preferences/ })
    await preferencesTab.click()
    await expect(preferencesTab).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("heading", { name: "DSP profile preferences" })).toBeVisible()

    const spotifyCard = page.locator(".dsp-profile-card-spotify")
    await expect(spotifyCard).toBeVisible()

    await spotifyCard.getByLabel("Yes").check()
    await spotifyCard.getByLabel("Display name").fill("Smoke Artist Spotify")
    await spotifyCard.getByLabel("Profile URL").fill("open.spotify.com/artist/1234567890abcdef")
    await page.getByRole("button", { name: "Save DSP preferences" }).click()

    await expect(page.getByText(/Saved DSP preferences for/)).toBeVisible({ timeout: 30_000 })

    await page.reload()
    await expect(page.getByRole("heading", { name: "Account settings", exact: true })).toBeVisible()
    await page.waitForLoadState("networkidle")
    await preferencesTab.click()
    await expect(preferencesTab).toHaveAttribute("aria-selected", "true")
    await expect(page.getByRole("heading", { name: "DSP profile preferences" })).toBeVisible()

    await expect(spotifyCard.getByLabel("Yes")).toBeChecked()
    await expect(spotifyCard.getByLabel("Display name")).toHaveValue("Smoke Artist Spotify")
    await expect(spotifyCard.getByLabel("Profile URL")).toHaveValue("https://open.spotify.com/artist/1234567890abcdef")
    expect(hydrationWarnings).toEqual([])
  })
})
