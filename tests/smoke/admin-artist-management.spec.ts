import { expect, test, type Locator, type Page } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"

const defaultSmokeBaseURL = "http://localhost:3100"

function cardByTitle(page: Page, title: string) {
  return page
    .getByRole("heading", { name: title, exact: true })
    .locator("xpath=ancestor::article[1]")
}

async function findArtistCard(page: Page, searchValue: string) {
  const searchInput = page.getByLabel("Search artists")
  await searchInput.fill(searchValue)

  const artistCard = page.locator("article.catalog-item").filter({ hasText: searchValue }).first()
  await expect(artistCard).toBeVisible()
  return artistCard
}

async function setCreateArtistAccessMethod(card: Locator, mode: "password" | "gmailInvite") {
  const select = card.getByLabel("Access method")
  const option = mode === "gmailInvite" ? { label: "Gmail invite" } : { label: "Password account now" }
  const submitButtonName = mode === "gmailInvite" ? "Create Gmail invite" : "Create artist"

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await select.selectOption(option)
    await expect(select).toHaveValue(mode)

    const submitButton = card.getByRole("button", { name: submitButtonName, exact: true })
    if (await submitButton.count()) {
      return
    }

    await card.page().waitForTimeout(500)
  }

  await expect(card.getByRole("button", { name: submitButtonName, exact: true })).toBeVisible()
}

test.describe("admin artist management", () => {
  test.setTimeout(120000)

  test("admin can edit artist core fields, sync login email, and archive the artist", async ({ page, browser }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const artistPassword = "SmokeArtist123!"
    const smokeBaseURL = readEnv("SMOKE_BASE_URL") || defaultSmokeBaseURL
    const initialStageName = `Smoke Artist ${suffix}`
    const updatedStageName = `Smoke Artist Updated ${suffix}`
    const initialEmail = `smoke-artist-${suffix}@naad-backstage.local`
    const updatedEmail = `smoke-artist-${suffix}-updated@naad-backstage.local`

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })
    await page.getByRole("link", { name: "Artists", exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/artists$/)

    const createArtistCard = cardByTitle(page, "Create artist account")
    await createArtistCard.getByLabel("Stage name").fill(initialStageName)
    await createArtistCard.getByLabel("Legal/full name").fill(initialStageName)
    await createArtistCard.getByLabel("Email").fill(initialEmail)
    await createArtistCard.getByLabel("Temporary password").fill(artistPassword)
    await createArtistCard.getByLabel("Country").fill("Nepal")
    await createArtistCard.getByLabel("Bio").fill("Initial smoke-test bio")
    await createArtistCard.getByRole("button", { name: "Create artist", exact: true }).click()
    await expect(createArtistCard).toContainText(`Created ${initialStageName} (${initialEmail}).`)

    const artistCard = await findArtistCard(page, suffix)
    await artistCard.getByLabel("Stage name").fill(updatedStageName)
    await artistCard.getByLabel("Login email").fill(updatedEmail)
    await artistCard.getByLabel("Avatar URL").fill("https://example.com/smoke-artist-avatar.png")
    await artistCard.getByLabel("Country").fill("Nepal")
    await artistCard.getByLabel("Bio").fill("Updated smoke-test bio")
    await artistCard.getByLabel("Legal name").fill("Smoke Legal Name")
    await artistCard.getByLabel("IPI / CAE").fill("123456789")
    await artistCard.getByLabel("PRO").fill("ASCAP")
    await artistCard.getByRole("button", { name: "Save artist", exact: true }).click()
    await expect(artistCard).toContainText("Saved artist details and publishing info.")

    await page.reload()

    const updatedArtistCard = await findArtistCard(page, updatedEmail)
    await expect(updatedArtistCard.getByLabel("Stage name")).toHaveValue(updatedStageName)
    await expect(updatedArtistCard.getByLabel("Login email")).toHaveValue(updatedEmail)
    await expect(updatedArtistCard.getByLabel("Avatar URL")).toHaveValue("https://example.com/smoke-artist-avatar.png")
    await expect(updatedArtistCard.getByLabel("Bio")).toHaveValue("Updated smoke-test bio")
    await expect(updatedArtistCard.getByLabel("Legal name")).toHaveValue("Smoke Legal Name")
    await expect(updatedArtistCard.getByLabel("IPI / CAE")).toHaveValue("123456789")
    await expect(updatedArtistCard.getByLabel("PRO")).toHaveValue("ASCAP")

    const artistContext = await browser.newContext({
      baseURL: smokeBaseURL,
    })
    const artistPage = await artistContext.newPage()
    await signInWithPassword(artistPage, updatedEmail, artistPassword, "/dashboard")
    await expect(artistPage.getByRole("heading", { name: "Wallet state", exact: true })).toBeVisible()
    await artistContext.close()

    const artistCardForArchive = await findArtistCard(page, updatedEmail)
    page.once("dialog", async (dialog) => {
      await dialog.accept()
    })
    await artistCardForArchive.getByRole("button", { name: "Archive artist", exact: true }).click()
    await expect(page.getByText(`Archived ${updatedStageName}. Restore the record from Settings when needed.`)).toBeVisible()
    await expect(page.locator("article.catalog-item").filter({ hasText: updatedEmail })).toHaveCount(0)

    await page.getByRole("link", { name: "Settings", exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/settings$/)
    await page.getByLabel("Search archived items").fill(updatedEmail)

    const archivedArtistRow = page.locator(".catalog-subitem-compact").filter({ hasText: updatedEmail }).first()
    await expect(archivedArtistRow).toContainText(updatedStageName)
    await expect(archivedArtistRow.getByRole("button", { name: "Restore artist", exact: true })).toBeVisible()
  })

  test("admin can manage Gmail invites from the merged artists workspace", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const artistInviteEmail = `smoke-artist-invite-${suffix}@gmail.com`
    const adminInviteEmail = `smoke-admin-invite-${suffix}@gmail.com`

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

    await page.goto("/admin/invites")
    await expect(page).toHaveURL(/\/admin\/artists\?section=access$/)
    await expect(page.getByRole("heading", { name: "Access queue", exact: true })).toBeVisible()

    const createArtistCard = cardByTitle(page, "Create artist account")
    await createArtistCard.scrollIntoViewIfNeeded()
    await setCreateArtistAccessMethod(createArtistCard, "gmailInvite")
    await createArtistCard.getByLabel("Stage name").fill(`Smoke Invite Artist ${suffix}`)
    await createArtistCard.getByLabel("Legal/full name").fill(`Smoke Invite Legal ${suffix}`)
    await createArtistCard.getByLabel("Email").fill(artistInviteEmail)
    await createArtistCard.getByLabel("Country").fill("Nepal")
    await createArtistCard.getByLabel("Bio").fill("Artist Gmail invite smoke test")
    await createArtistCard.getByRole("button", { name: "Create Gmail invite", exact: true }).click()
    await expect(createArtistCard).toContainText(`Created Gmail invite for ${artistInviteEmail}.`)

    const accessQueueCard = cardByTitle(page, "Access queue")
    await accessQueueCard.getByLabel("Search access queue").fill(artistInviteEmail)
    await expect(page.locator("article.catalog-item").filter({ hasText: artistInviteEmail }).first()).toBeVisible()

    const adminInviteCard = cardByTitle(page, "Admin Gmail invite")
    await adminInviteCard.getByLabel("Gmail address").fill(adminInviteEmail)
    await adminInviteCard.getByLabel("Full name").fill(`Smoke Admin ${suffix}`)
    await adminInviteCard.getByLabel("Country").fill("Nepal")
    await adminInviteCard.getByLabel("Bio").fill("Admin Gmail invite smoke test")
    await adminInviteCard.getByRole("button", { name: "Create admin invite", exact: true }).click()
    await expect(page.getByText(`Created admin Gmail invite for ${adminInviteEmail}.`)).toBeVisible()

    await accessQueueCard.getByLabel("Search access queue").fill(adminInviteEmail)
    await expect(page.locator("article.catalog-item").filter({ hasText: adminInviteEmail }).first()).toBeVisible()
  })
})
