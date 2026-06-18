import { expect, test, type Locator, type Page } from "@playwright/test"
import { confirmAdminDialog, signInWithPassword, verifyAdminPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  countSmokeCsvUploadsForArtist,
  countSmokeEarningsForArtist,
  countSmokeLedgerRowsForArtist,
  countSmokeMonthlyEarningsSummaryCacheRowsForArtist,
  createSmokeArchivedArtistRecord,
  createSmokeArtistRecordForUser,
  ensureSmokeArtist,
  fetchSmokeAdminAnalyticsRevenueRows,
  findAuthUserByEmail,
  getSmokeArtistCountForUser,
  insertSmokeCatalogTrack,
  insertSmokeCsvUpload,
  insertSmokeEarning,
  insertSmokePayoutRequest,
  purgeSmokeArtistWithRpc,
  refreshSmokeMonthlyEarningsSummary,
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

async function openCreateArtistCard(page: Page) {
  const addAccessButton = page.getByRole("button", { name: "Add access", exact: true })
  const dialog = page.getByRole("dialog", { name: "Add access" })
  await expect(addAccessButton).toBeVisible({ timeout: 30_000 })

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await addAccessButton.click()
    if (await dialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
      return dialog
    }
  }

  await expect(dialog).toBeVisible()
  return dialog
}

function artistDirectoryRows(page: Page) {
  return page.locator("tbody tr").filter({
    has: page.getByRole("button", { name: "Row actions" }),
  })
}

async function findArtistCard(page: Page, searchValue: string) {
  await expect(page.getByRole("heading", { name: "Artist directory", exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(artistDirectoryRows(page).first()).toBeVisible({ timeout: 30_000 })

  const searchInput = page.getByLabel("Search artists")
  await searchInput.fill("")
  await searchInput.fill(searchValue)
  await expect(searchInput).toHaveValue(searchValue)

  await expect(artistDirectoryRows(page)).toHaveCount(1, { timeout: 30_000 })

  const artistMatch = new RegExp(escapeForRegex(searchValue), "i")
  const artistRow = artistDirectoryRows(page).filter({ hasText: artistMatch }).first()
  await expect(artistRow).toBeVisible({ timeout: 30_000 })
  await artistRow.scrollIntoViewIfNeeded()
  await artistRow.getByRole("button", { name: "Row actions" }).click()
  await page.getByRole("menuitem", { name: "Edit artist", exact: true }).click()

  const artistDialog = page.getByRole("dialog").filter({ has: page.getByLabel("Stage name") }).first()
  await expect(artistDialog.getByLabel("Stage name")).toBeVisible({ timeout: 30_000 })

  if (searchValue.includes("@")) {
    await expect(artistDialog.getByLabel("Login email")).toHaveValue(searchValue)
  }

  return artistDialog
}

async function chooseNativeSelect(container: Locator, label: string, optionLabel: string) {
  const select = container.getByLabel(label)

  if ((await select.textContent())?.includes(optionLabel)) {
    return
  }

  await select.click()
  const option = container.page().getByRole("option", { name: optionLabel, exact: true })
  await expect(option).toBeVisible()
  await option.click({ force: true })
  await expect(select).toHaveText(optionLabel)
}

async function setCreateArtistAccessMethod(card: Locator, mode: "password" | "gmailInvite") {
  const optionLabel = mode === "gmailInvite" ? "Gmail invite" : "Password account now"
  await chooseNativeSelect(card, "Access method", optionLabel)
  await expect(card.getByRole("button", { name: "Create access", exact: true })).toBeVisible()
}

async function createArtistFromAdmin(page: Page, input: AdminCreateArtistInput) {
  const createArtistCard = await openCreateArtistCard(page)

  await setCreateArtistAccessMethod(createArtistCard, "password")
  await createArtistCard.getByLabel("Stage name").fill(input.stageName)
  await createArtistCard.getByLabel("Legal / full name").fill(input.legalName)
  await createArtistCard.getByLabel("Artist share %").fill("81")
  await createArtistCard.getByLabel("Email").fill(input.email)
  await createArtistCard.getByLabel("Temporary password").fill(input.password)
  await createArtistCard.getByLabel("Country").fill(input.country)
  await createArtistCard.getByLabel("Bio").fill(input.bio)
  await createArtistCard.getByRole("button", { name: "Create access", exact: true }).click()
  await expect(page.getByText(`Created ${input.stageName} (${input.email}).`)).toBeVisible({ timeout: 30_000 })
}

test.describe("admin artist management", () => {
  test.setTimeout(180000)

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
    await createArtistCard.getByLabel("Legal / full name").fill(initialStageName)
    await createArtistCard.getByLabel("Artist share %").fill("81")
    await createArtistCard.getByLabel("Email").fill(initialEmail)
    await createArtistCard.getByLabel("Temporary password").fill(artistPassword)
    await createArtistCard.getByLabel("Country").fill("Nepal")
    await createArtistCard.getByLabel("Bio").fill("Initial smoke-test bio")
    await createArtistCard.getByRole("button", { name: "Create access", exact: true }).click()
    await expect(page.getByText(`Created ${initialStageName} (${initialEmail}).`)).toBeVisible({ timeout: 30_000 })

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
    await updatedArtistCard.getByLabel("New password").fill(updatedArtistPassword)
    await updatedArtistCard.getByLabel("Confirm password").fill(updatedArtistPassword)
    await updatedArtistCard.getByRole("button", { name: "Change password", exact: true }).click()
    await confirmAdminDialog(page, {
      buttonName: "Change password",
      password: adminPassword,
    })
    await expect(updatedArtistCard).toContainText(`Changed the dashboard password for ${updatedStageName}.`, { timeout: 30_000 })
    await expect(updatedArtistCard.getByLabel("New password")).toHaveValue("")
    await expect(updatedArtistCard.getByLabel("Confirm password")).toHaveValue("")

    const artistContext = await browser.newContext({
      baseURL: smokeBaseURL,
    })
    const artistPage = await artistContext.newPage()
    await signInWithPassword(artistPage, updatedEmail, updatedArtistPassword, "/dashboard")
    await expect(artistPage.getByRole("heading", { name: /Welcome back,/ })).toBeVisible()
    await artistContext.close()

    const artistCardForArchive = updatedArtistCard
    await artistCardForArchive.getByRole("button", { name: "Archive artist", exact: true }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Archive artist", exact: true }).click()
    await expect(page.getByText(`Archived ${updatedStageName}. Restore the record from Settings when needed.`)).toBeVisible({ timeout: 30_000 })
    await expect(artistDirectoryRows(page).filter({ hasText: updatedEmail })).toHaveCount(0)

    await page.goto("/admin/settings")
    await expect(page).toHaveURL(/\/admin\/settings$/)
    await expect(page.getByText("Archived artists", { exact: true })).toBeVisible()
    await page.getByLabel("Search archived items").fill(updatedEmail)

    const archivedArtistRow = page.locator("tbody tr").filter({ hasText: updatedEmail }).first()
    await expect(archivedArtistRow).toContainText(updatedStageName)
    await archivedArtistRow.getByRole("button", { name: "Row actions", exact: true }).click()
    await expect(page.getByRole("menuitem", { name: "Edit profile", exact: true })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "Restore access", exact: true })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "Permanent delete", exact: true })).toBeVisible()
    await page.getByRole("menuitem", { name: "Edit profile", exact: true }).click()

    const archivedUpdatedStageName = `Smoke Archived Edited ${suffix}`
    const archivedUpdatedEmail = `smoke-artist-${suffix}-archived@naad-backstage.local`
    const archivedEditDialog = page.getByRole("dialog", { name: `Edit ${updatedStageName}` })
    await expect(archivedEditDialog.getByLabel("Saved email")).toBeVisible({ timeout: 30_000 })
    await archivedEditDialog.getByLabel("Stage name").fill(archivedUpdatedStageName)
    await archivedEditDialog.getByLabel("Saved email").fill(archivedUpdatedEmail)
    await archivedEditDialog.getByLabel("Artist share %").fill("76.50")
    await archivedEditDialog.locator("input[id^='archived-avatar-url-']").fill("https://example.com/smoke-archived-avatar.png")
    await archivedEditDialog.getByLabel("Country").fill("Nepal")
    await archivedEditDialog.getByLabel("Bio").fill("Archived smoke-test bio")
    await archivedEditDialog.getByLabel("Legal name").fill("Smoke Archived Legal Name")
    await archivedEditDialog.getByLabel("IPI / CAE").fill("987654321")
    await archivedEditDialog.getByLabel("PRO", { exact: true }).fill("BMI")
    await archivedEditDialog.getByLabel("Account name").fill("Smoke Archived Account")
    await archivedEditDialog.getByLabel("Bank name").fill("Smoke Archived Bank")
    await archivedEditDialog.getByLabel("Account number").fill("1234567890")
    await archivedEditDialog.getByLabel("Bank address").fill("123 Smoke Archive Way")
    await chooseNativeSelect(archivedEditDialog, "Spotify", "Profile exists")
    await archivedEditDialog.locator("input[id$='-spotify-url']").fill("https://open.spotify.com/artist/smoke-archived")
    await archivedEditDialog.locator("input[id$='-spotify-display']").fill(archivedUpdatedStageName)
    await archivedEditDialog.locator("input[id$='-spotify-avatar']").fill("https://example.com/smoke-spotify-avatar.png")
    await archivedEditDialog.getByLabel("Instagram").fill("https://instagram.com/smoke_archived")
    await archivedEditDialog.getByRole("button", { name: "Save archived profile", exact: true }).click()
    await expect(page.getByText("Saved archived artist settings.")).toBeVisible({ timeout: 30_000 })
    await page.getByRole("dialog").filter({ has: page.getByLabel("Saved email") }).first().getByRole("button", { name: "Close", exact: true }).first().click()

    await page.getByLabel("Search archived items").fill(archivedUpdatedEmail)
    const updatedArchivedArtistRow = page.locator("tbody tr").filter({ hasText: archivedUpdatedEmail }).first()
    await expect(updatedArchivedArtistRow).toContainText(archivedUpdatedStageName, { timeout: 30_000 })
    await updatedArchivedArtistRow.getByRole("button", { name: "Row actions", exact: true }).click()
    await page.getByRole("menuitem", { name: "Permanent delete", exact: true }).click()
    await expect(page.getByRole("heading", { name: `Permanent delete ${archivedUpdatedStageName}?`, exact: true })).toBeVisible()
    await expect(page.getByText(/stored CSV\/release\/avatar files/)).toBeVisible()
    await confirmAdminDialog(page, {
      buttonName: "Delete forever",
      password: adminPassword,
      requiredText: "DELETE",
    })
    await expect(page.getByText(`Permanently deleted ${archivedUpdatedStageName}.`)).toBeVisible({ timeout: 60_000 })
    await page.getByLabel("Search archived items").fill(archivedUpdatedEmail)
    await expect(page.getByRole("heading", { name: "No archived artists", exact: true })).toBeVisible({ timeout: 30_000 })
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
    await setCreateArtistAccessMethod(createArtistCard, "gmailInvite")
    await createArtistCard.getByLabel("Stage name").fill(`Smoke Invite Artist ${suffix}`)
    await createArtistCard.getByLabel("Legal / full name").fill(`Smoke Invite Legal ${suffix}`)
    await createArtistCard.getByLabel("Artist share %").fill("81")
    await createArtistCard.getByLabel("Email").fill(artistInviteEmail)
    await createArtistCard.getByLabel("Country").fill("Nepal")
    await createArtistCard.getByLabel("Bio").fill("Artist Gmail invite smoke test")
    await createArtistCard.getByRole("button", { name: "Create access", exact: true }).click()
    await expect(page.getByText(new RegExp(`Created artist Gmail invite for ${escapeForRegex(artistInviteEmail)}\\.`))).toBeVisible({ timeout: 30_000 })

    const accessQueueSearch = page.getByLabel("Search queue")
    await accessQueueSearch.fill(artistInviteEmail)
    await expect(page.locator("tbody tr").filter({ hasText: artistInviteEmail }).first()).toBeVisible({ timeout: 30_000 })

    const adminInviteDialog = await openCreateArtistCard(page)
    await chooseNativeSelect(adminInviteDialog, "Role", "Admin")
    await adminInviteDialog.getByLabel("Legal / full name").fill(`Smoke Admin ${suffix}`)
    await adminInviteDialog.getByLabel("Email").fill(adminInviteEmail)
    await adminInviteDialog.getByLabel("Country").fill("Nepal")
    await adminInviteDialog.getByLabel("Bio").fill("Admin Gmail invite smoke test")
    await adminInviteDialog.getByRole("button", { name: "Create access", exact: true }).click()
    await expect(page.getByText(new RegExp(`Created admin Gmail invite for ${escapeForRegex(adminInviteEmail)}\\.`))).toBeVisible({ timeout: 30_000 })

    await accessQueueSearch.fill(adminInviteEmail)
    await expect(page.locator("tbody tr").filter({ hasText: adminInviteEmail }).first()).toBeVisible({ timeout: 30_000 })
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
    await expect(artistDirectoryRows(page)).toHaveCount(2, { timeout: 30_000 })

    await page.getByRole("checkbox", { name: `Select ${firstStageName}` }).click()
    await page.getByRole("checkbox", { name: `Select ${secondStageName}` }).click()
    await expect(page.getByText("2 selected")).toBeVisible()

    await page
      .getByRole("toolbar", { name: "Bulk artist actions" })
      .getByRole("button", { name: "Permanent delete", exact: true })
      .click()
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
    await expect(artistDirectoryRows(page).filter({ hasText: firstEmail })).toHaveCount(0)
    await expect(artistDirectoryRows(page).filter({ hasText: secondEmail })).toHaveCount(0)
  })

  test("admin can select and permanently delete multiple archived artists", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const firstStageName = `Smoke Archived Bulk One ${suffix}`
    const secondStageName = `Smoke Archived Bulk Two ${suffix}`
    const firstEmail = `smoke-archived-bulk-${suffix}-one@naad-backstage.local`
    const secondEmail = `smoke-archived-bulk-${suffix}-two@naad-backstage.local`

    await createSmokeArchivedArtistRecord({
      stageName: firstStageName,
      email: firstEmail,
      country: "Nepal",
      bio: "Archived bulk permanent delete smoke test",
    })
    await createSmokeArchivedArtistRecord({
      stageName: secondStageName,
      email: secondEmail,
      country: "Nepal",
      bio: "Archived bulk permanent delete smoke test",
    })

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })
    await page.goto("/admin/settings")
    await expect(page).toHaveURL(/\/admin\/settings/)
    await expect(page.getByText("Archived artists", { exact: true })).toBeVisible()

    const archiveSearch = page.getByLabel("Search archived items")
    await archiveSearch.fill(`smoke-archived-bulk-${suffix}`)

    const firstArchivedRow = page.locator("tbody tr").filter({ hasText: firstEmail }).first()
    const secondArchivedRow = page.locator("tbody tr").filter({ hasText: secondEmail }).first()
    await expect(firstArchivedRow).toContainText(firstStageName, { timeout: 30_000 })
    await expect(secondArchivedRow).toContainText(secondStageName, { timeout: 30_000 })

    await firstArchivedRow.getByRole("checkbox", { name: `Select ${firstStageName}` }).click()
    await secondArchivedRow.getByRole("checkbox", { name: `Select ${secondStageName}` }).click()
    await expect(page.getByRole("toolbar", { name: "Bulk archived artist actions" })).toContainText("2 selected")

    await page
      .getByRole("toolbar", { name: "Bulk archived artist actions" })
      .getByRole("button", { name: "Permanent delete", exact: true })
      .click()
    await expect(page.getByRole("heading", { name: "Permanent delete 2 archived artists?", exact: true })).toBeVisible()
    await expect(page.getByText(/stored CSV\/release\/avatar files/)).toBeVisible()
    await confirmAdminDialog(page, {
      buttonName: "Delete forever",
      password: adminPassword,
      requiredText: "DELETE",
    })

    await expect(page.getByText("Permanently deleted 2 archived artists.")).toBeVisible({ timeout: 60_000 })
    await archiveSearch.fill(`smoke-archived-bulk-${suffix}`)
    await expect(page.getByRole("heading", { name: "No archived artists", exact: true })).toBeVisible({ timeout: 30_000 })
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

    const catalog = await insertSmokeCatalogTrack({
      artistId: firstArtist.artistId,
      releaseTitle: `Smoke Analytics Delete Release ${suffix}`,
      trackTitle: `Smoke Analytics Delete Track ${suffix}`,
      isrc: `SAD${Date.now().toString(36).toUpperCase()}${Math.round(Math.random() * 1000)}`,
    })
    await insertSmokeEarning({
      uploadedBy: firstArtist.userId,
      artistId: firstArtist.artistId,
      releaseId: catalog.releaseId,
      trackId: catalog.trackId,
      amount: "7.25000000",
      units: 7,
      checksum: `smoke-analytics-delete-${suffix}`,
      filename: `smoke-analytics-delete-${suffix}.csv`,
      periodMonth: "2026-05-01",
    })
    await refreshSmokeMonthlyEarningsSummary(firstArtist.artistId, "2026-05-01")
    await insertSmokePayoutRequest({
      requestedBy: firstArtist.userId,
      artistId: firstArtist.artistId,
      amount: "1.00000000",
    })

    expect(await countSmokeEarningsForArtist(firstArtist.artistId)).toBe(1)
    expect(await countSmokeMonthlyEarningsSummaryCacheRowsForArtist(firstArtist.artistId)).toBeGreaterThan(0)
    expect(await countSmokeLedgerRowsForArtist(firstArtist.artistId)).toBeGreaterThan(0)
    expect((await fetchSmokeAdminAnalyticsRevenueRows()).some((row) => row.artist_id === firstArtist.artistId)).toBe(true)

    const analyticsBeforeDeleteResponse = await page.request.get("/api/admin/analytics?periodRange=all_time")
    expect(analyticsBeforeDeleteResponse.ok()).toBeTruthy()
    const analyticsBeforeDelete = await analyticsBeforeDeleteResponse.json()
    expect(analyticsBeforeDelete.revenueRows.some((row: { artistId: string }) => row.artistId === firstArtist.artistId)).toBe(true)
    expect(analyticsBeforeDelete.artistLeaderboard.some((row: { artistId: string }) => row.artistId === firstArtist.artistId)).toBe(true)

    const firstPurge = await purgeSmokeArtistWithRpc(firstArtist.artistId)
    expect(firstPurge.profile_became_unused).toBe(false)
    expect(firstPurge.remaining_linked_artist_count).toBe(1)
    expect(await countSmokeCsvUploadsForArtist(firstArtist.artistId, checksum)).toBe(0)
    expect(await countSmokeCsvUploadsForArtist(firstArtist.artistId)).toBe(0)
    expect(await countSmokeEarningsForArtist(firstArtist.artistId)).toBe(0)
    expect(await countSmokeMonthlyEarningsSummaryCacheRowsForArtist(firstArtist.artistId)).toBe(0)
    expect(await countSmokeLedgerRowsForArtist(firstArtist.artistId)).toBe(0)
    expect((await fetchSmokeAdminAnalyticsRevenueRows()).some((row) => row.artist_id === firstArtist.artistId)).toBe(false)

    const analyticsAfterDeleteResponse = await page.request.get("/api/admin/analytics?periodRange=all_time")
    expect(analyticsAfterDeleteResponse.ok()).toBeTruthy()
    const analyticsAfterDelete = await analyticsAfterDeleteResponse.json()
    expect(analyticsAfterDelete.revenueRows.some((row: { artistId: string }) => row.artistId === firstArtist.artistId)).toBe(false)
    expect(analyticsAfterDelete.artistLeaderboard.some((row: { artistId: string }) => row.artistId === firstArtist.artistId)).toBe(false)

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
