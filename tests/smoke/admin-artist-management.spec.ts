import { expect, test, type Locator, type Page } from "@playwright/test"
import { confirmAdminDialog, signInWithPassword, verifyAdminPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  countSmokeCsvUploadsForArtist,
  createSmokeArtistRecordForUser,
  ensureSmokeArtist,
  findAuthUserByEmail,
  getSmokeArtistCountForUser,
  insertSmokeCsvUpload,
  purgeSmokeArtistWithRpc,
} from "./support/supabase"

const defaultSmokeBaseURL = "http://localhost:3100"

interface AdminCreateArtistInput {
  stageName: string
  legalName: string
  email: string
  password: string
  country: string
  bio: string
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function panelByTitle(page: Page, title: string) {
  return page
    .getByRole("heading", { name: title, exact: true })
    .locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' data-panel ')][1]")
}

async function openCreateArtistCard(page: Page) {
  const card = page.locator(".create-artist-panel")
  const trigger = card.getByRole("button", { name: /Create artist account/ })
  const accessMethod = card.getByLabel("Access method")

  if (!(await accessMethod.isVisible().catch(() => false))) {
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
  }

  await expect(accessMethod).toBeVisible()
  return card
}

async function findArtistCard(page: Page, searchValue: string) {
  await expect(page.getByRole("heading", { name: "Artist directory", exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("tr.artist-directory-row").first()).toBeVisible({ timeout: 30_000 })

  const searchInput = page.getByLabel("Search artists")
  await searchInput.fill("")
  await searchInput.fill(searchValue)
  await expect(searchInput).toHaveValue(searchValue)

  await expect(page.locator("tr.artist-directory-row")).toHaveCount(1, { timeout: 30_000 })

  const artistMatch = new RegExp(escapeForRegex(searchValue), "i")
  const artistRow = page.locator("tr.artist-directory-row").filter({ hasText: artistMatch }).first()
  await expect(artistRow).toBeVisible({ timeout: 30_000 })
  await artistRow.scrollIntoViewIfNeeded()
  await artistRow.locator(".artist-directory-primary").click()

  const selectedArtistPanel = panelByTitle(page, "Selected artist")
  await expect(selectedArtistPanel).toBeVisible()

  const artistCard = selectedArtistPanel.locator("article.catalog-item").filter({ hasText: artistMatch }).first()
  await expect(artistCard.getByLabel("Stage name")).toBeVisible({ timeout: 30_000 })

  if (searchValue.includes("@")) {
    await expect(artistCard.getByLabel("Login email")).toHaveValue(searchValue)
  }

  return artistCard
}

async function setCreateArtistAccessMethod(card: Locator, mode: "password" | "gmailInvite") {
  const select = card.getByLabel("Access method")
  const optionLabel = mode === "gmailInvite" ? "Gmail invite" : "Password account now"
  const submitButtonName = mode === "gmailInvite" ? "Create Gmail invite" : "Create artist"

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!(await select.isVisible().catch(() => false))) {
      await card.getByRole("button", { name: /Create artist account/ }).click()
      await expect(select).toBeVisible()
    }

    if ((await select.textContent())?.includes(optionLabel)) {
      const submitButton = card.getByRole("button", { name: submitButtonName, exact: true })
      if (await submitButton.isVisible().catch(() => false)) {
        return
      }
    }

    await select.click()
    const option = card.page().getByRole("option", { name: optionLabel, exact: true })
    await expect(option).toBeVisible()
    await option.click({ force: true })
    await expect(select).toHaveText(optionLabel)

    const submitButton = card.getByRole("button", { name: submitButtonName, exact: true })
    if (await submitButton.count()) {
      return
    }

    await card.page().waitForTimeout(500)
  }

  await expect(card.getByRole("button", { name: submitButtonName, exact: true })).toBeVisible()
}

async function createArtistFromAdmin(page: Page, input: AdminCreateArtistInput) {
  const createArtistCard = await openCreateArtistCard(page)

  await setCreateArtistAccessMethod(createArtistCard, "password")
  await createArtistCard.getByLabel("Stage name").fill(input.stageName)
  await createArtistCard.getByLabel("Legal/full name").fill(input.legalName)
  await createArtistCard.getByLabel("Email").fill(input.email)
  await createArtistCard.getByLabel("Temporary password").fill(input.password)
  await createArtistCard.getByLabel("Country").fill(input.country)
  await createArtistCard.getByLabel("Bio").fill(input.bio)
  await createArtistCard.getByRole("button", { name: "Create artist", exact: true }).click()
  await expect(createArtistCard).toContainText(`Created ${input.stageName} (${input.email}).`, { timeout: 30_000 })
}

test.describe("admin artist management", () => {
  test.setTimeout(120000)

  test("admin can edit artist core fields, sync login email, and archive the artist", async ({ page, browser }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const artistPassword = "SmokeArtist123!"
    const updatedArtistPassword = "SmokeArtistReset123!"
    const smokeBaseURL = readEnv("SMOKE_BASE_URL") || defaultSmokeBaseURL
    const initialStageName = `Smoke Artist ${suffix}`
    const updatedStageName = `Smoke Artist Updated ${suffix}`
    const initialEmail = `smoke-artist-${suffix}@naad-backstage.local`
    const updatedEmail = `smoke-artist-${suffix}-updated@naad-backstage.local`

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })
    await page.goto("/admin/artists")
    await expect(page).toHaveURL(/\/admin\/artists$/)

    const createArtistCard = await openCreateArtistCard(page)
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
    const saveArtistButton = artistCard.getByRole("button", { name: /^(Save artist|Saving\.\.\.)$/ })
    await saveArtistButton.click()
    await expect(saveArtistButton).toHaveText("Save artist", { timeout: 30_000 })
    await expect(artistCard).toContainText("Saved artist details and publishing info.", { timeout: 30_000 })

    await page.reload()
    await page.waitForLoadState("networkidle")

    const updatedArtistCard = await findArtistCard(page, updatedEmail)
    await expect(updatedArtistCard.getByLabel("Stage name")).toHaveValue(updatedStageName)
    await expect(updatedArtistCard.getByLabel("Login email")).toHaveValue(updatedEmail)
    await expect(updatedArtistCard.getByLabel("Avatar URL")).toHaveValue("https://example.com/smoke-artist-avatar.png")
    await expect(updatedArtistCard.getByLabel("Bio")).toHaveValue("Updated smoke-test bio")
    await expect(updatedArtistCard.getByLabel("Legal name")).toHaveValue("Smoke Legal Name")
    await expect(updatedArtistCard.getByLabel("IPI / CAE")).toHaveValue("123456789")
    await expect(updatedArtistCard.getByLabel("PRO")).toHaveValue("ASCAP")
    await updatedArtistCard.getByLabel("New dashboard password").fill(updatedArtistPassword)
    await updatedArtistCard.getByLabel("Confirm dashboard password").fill(updatedArtistPassword)
    await updatedArtistCard.getByRole("button", { name: "Change dashboard password", exact: true }).click()
    await confirmAdminDialog(page, {
      buttonName: "Change password",
      password: adminPassword,
    })
    await expect(updatedArtistCard).toContainText(`Changed the dashboard password for ${updatedStageName}.`, { timeout: 30_000 })
    await expect(updatedArtistCard.getByLabel("New dashboard password")).toHaveValue("")
    await expect(updatedArtistCard.getByLabel("Confirm dashboard password")).toHaveValue("")

    const artistContext = await browser.newContext({
      baseURL: smokeBaseURL,
    })
    const artistPage = await artistContext.newPage()
    await signInWithPassword(artistPage, updatedEmail, updatedArtistPassword, "/dashboard")
    await expect(artistPage.getByRole("heading", { name: /Welcome back,/ })).toBeVisible()
    await artistContext.close()

    const artistCardForArchive = await findArtistCard(page, updatedEmail)
    await artistCardForArchive.getByRole("button", { name: "Archive artist", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive artist", exact: true }).click()
    await expect(page.getByText(`Archived ${updatedStageName}. Restore the record from Settings when needed.`)).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("article.catalog-item").filter({ hasText: updatedEmail })).toHaveCount(0)

    await page.goto("/admin/settings")
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

    const createArtistCard = await openCreateArtistCard(page)
    await createArtistCard.scrollIntoViewIfNeeded()
    await setCreateArtistAccessMethod(createArtistCard, "gmailInvite")
    await createArtistCard.getByLabel("Stage name").fill(`Smoke Invite Artist ${suffix}`)
    await createArtistCard.getByLabel("Legal/full name").fill(`Smoke Invite Legal ${suffix}`)
    await createArtistCard.getByLabel("Email").fill(artistInviteEmail)
    await createArtistCard.getByLabel("Country").fill("Nepal")
    await createArtistCard.getByLabel("Bio").fill("Artist Gmail invite smoke test")
    await createArtistCard.getByRole("button", { name: "Create Gmail invite", exact: true }).click()
    await expect(createArtistCard).toContainText(`Created Gmail invite for ${artistInviteEmail}.`)
    await expect(createArtistCard.getByRole("button", { name: "Create Gmail invite", exact: true })).toBeEnabled({ timeout: 30_000 })

    const accessQueueSearch = page.getByLabel("Search access queue")
    await accessQueueSearch.fill(artistInviteEmail)
    await expect(page.locator("article.catalog-item").filter({ hasText: artistInviteEmail }).first()).toBeVisible({ timeout: 30_000 })

    const adminInviteCard = panelByTitle(page, "Admin Gmail invite")
    await adminInviteCard.getByLabel("Gmail address").fill(adminInviteEmail)
    await adminInviteCard.getByLabel("Full name").fill(`Smoke Admin ${suffix}`)
    await adminInviteCard.getByLabel("Country").fill("Nepal")
    await adminInviteCard.getByLabel("Bio").fill("Admin Gmail invite smoke test")
    await adminInviteCard.getByRole("button", { name: "Create admin invite", exact: true }).click()
    await expect(page.getByText(`Created admin Gmail invite for ${adminInviteEmail}.`)).toBeVisible()

    await accessQueueSearch.fill(adminInviteEmail)
    await expect(page.locator("article.catalog-item").filter({ hasText: adminInviteEmail }).first()).toBeVisible({ timeout: 30_000 })
  })

  test("admin can select and permanently delete multiple active artists", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const artistPassword = "SmokeArtist123!"
    const firstStageName = `Smoke Bulk Artist One ${suffix}`
    const secondStageName = `Smoke Bulk Artist Two ${suffix}`
    const firstEmail = `smoke-bulk-${suffix}-one@naad-backstage.local`
    const secondEmail = `smoke-bulk-${suffix}-two@naad-backstage.local`

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })
    await page.goto("/admin/artists")
    await expect(page).toHaveURL(/\/admin\/artists$/)

    await createArtistFromAdmin(page, {
      stageName: firstStageName,
      legalName: firstStageName,
      email: firstEmail,
      password: artistPassword,
      country: "Nepal",
      bio: "Bulk permanent delete smoke test",
    })
    await createArtistFromAdmin(page, {
      stageName: secondStageName,
      legalName: secondStageName,
      email: secondEmail,
      password: artistPassword,
      country: "Nepal",
      bio: "Bulk permanent delete smoke test",
    })

    const searchInput = page.getByLabel("Search artists")
    await searchInput.fill(`smoke-bulk-${suffix}`)
    await expect(page.locator("tr.artist-directory-row")).toHaveCount(2, { timeout: 30_000 })

    await page.getByRole("checkbox", { name: `Select ${firstStageName}` }).click()
    await page.getByRole("checkbox", { name: `Select ${secondStageName}` }).click()
    await expect(page.getByText("2 selected")).toBeVisible()

    await page.getByRole("button", { name: "Permanent delete selected (2)", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Permanent delete 2 artists?", exact: true })).toBeVisible()
    await expect(page.getByText(/stored CSV\/release\/avatar files/)).toBeVisible()
    await confirmAdminDialog(page, {
      buttonName: "Delete forever",
      password: adminPassword,
      requiredText: "DELETE",
    })

    await expect(page.getByText("Permanently deleted 2 artists.")).toBeVisible({ timeout: 60_000 })
    await searchInput.fill(`smoke-bulk-${suffix}`)
    await expect(page.getByRole("heading", { name: "No active artists", exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("tr.artist-directory-row").filter({ hasText: firstEmail })).toHaveCount(0)
    await expect(page.locator("tr.artist-directory-row").filter({ hasText: secondEmail })).toHaveCount(0)
  })

  test("permanent delete purges CSV checksums and removes shared login only after the last artist", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const sharedEmail = `smoke-shared-delete-${suffix}@naad-backstage.local`
    const checksum = `smoke-checksum-${suffix}`

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

    const firstArtist = await ensureSmokeArtist({
      email: sharedEmail,
      password: "SmokeArtist123!",
      fullName: `Smoke Shared Delete ${suffix}`,
      stageName: `Smoke Shared Delete One ${suffix}`,
      country: "Nepal",
      bio: "Shared-login permanent delete smoke test",
    })
    const secondArtistId = await createSmokeArtistRecordForUser({
      userId: firstArtist.userId,
      stageName: `Smoke Shared Delete Two ${suffix}`,
      email: `smoke-shared-delete-${suffix}-two@naad-backstage.local`,
      country: "Nepal",
      bio: "Shared-login permanent delete smoke test",
    })

    await insertSmokeCsvUpload({
      uploadedBy: firstArtist.userId,
      artistId: firstArtist.artistId,
      filename: `smoke-delete-${suffix}.csv`,
      checksum,
      periodMonth: "2026-05-01",
    })

    const firstPurge = await purgeSmokeArtistWithRpc(firstArtist.artistId)
    expect(firstPurge.profile_became_unused).toBe(false)
    expect(firstPurge.remaining_linked_artist_count).toBe(1)
    expect(await countSmokeCsvUploadsForArtist(firstArtist.artistId, checksum)).toBe(0)
    expect(await getSmokeArtistCountForUser(firstArtist.userId)).toBe(1)
    expect(await findAuthUserByEmail(sharedEmail)).not.toBeNull()

    const recreatedArtistId = await createSmokeArtistRecordForUser({
      userId: firstArtist.userId,
      stageName: `Smoke Shared Delete Recreated ${suffix}`,
      email: `smoke-shared-delete-${suffix}-recreated@naad-backstage.local`,
      country: "Nepal",
      bio: "CSV checksum recreate smoke test",
    })
    await insertSmokeCsvUpload({
      uploadedBy: firstArtist.userId,
      artistId: recreatedArtistId,
      filename: `smoke-delete-${suffix}-recreated.csv`,
      checksum,
      periodMonth: "2026-05-01",
    })
    expect(await countSmokeCsvUploadsForArtist(recreatedArtistId, checksum)).toBe(1)

    await verifyAdminPassword(page, adminPassword, "artist.bulk_permanently_deleted")
    const response = await page.request.post("/api/admin/artists/bulk-permanent-delete", {
      data: {
        artistIds: [secondArtistId, recreatedArtistId],
      },
    })
    expect(response.ok()).toBeTruthy()

    const result = await response.json() as {
      ok: boolean
      deletedArtistIds: string[]
      removedAuthUserIds: string[]
      results: Array<{
        artistId: string
        removedAuthUserId: string | null
        remainingLinkedArtistCount: number
      }>
    }

    expect(result.ok).toBe(true)
    expect(result.deletedArtistIds).toEqual([secondArtistId, recreatedArtistId])
    expect(result.results[0]).toMatchObject({
      artistId: secondArtistId,
      removedAuthUserId: null,
      remainingLinkedArtistCount: 1,
    })
    expect(result.results[1]).toMatchObject({
      artistId: recreatedArtistId,
      removedAuthUserId: firstArtist.userId,
      remainingLinkedArtistCount: 0,
    })
    expect(result.removedAuthUserIds).toContain(firstArtist.userId)
    expect(await findAuthUserByEmail(sharedEmail)).toBeNull()
  })
})
