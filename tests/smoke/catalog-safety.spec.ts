import { expect, test } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  archiveSmokeReleaseDirectly,
  commitSmokeRoyaltyUpload,
  countSmokeEarningsForArtistByUpload,
  countSmokeTracksByIsrc,
  countSmokeTracksByIsrcForArtist,
  ensureSmokeArtist,
  findAuthUserByEmail,
  getSmokeTrackByIsrc,
  getSmokeTrackByIsrcForArtist,
  getSmokeTrackCredits,
  insertSmokeCatalogTrack,
  insertSmokeEarning,
  insertSmokeReleaseSplitVersion,
  insertSmokeReleaseSplitStopVersion,
  insertSmokeRoyaltyPreviewUpload,
  insertSmokeTrackOnRelease,
  insertSmokeTrackSplitVersion,
  purgeSmokeArtistWithRpc,
  sumSmokeEarningsForArtistByUpload,
} from "./support/supabase"

function uniqueDigits(length: number) {
  return String(Date.now()).slice(-length).padStart(length, "0")
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

test.describe("catalog import and archive safety", () => {
  test.setTimeout(180000)

  test("catalog import stores track versions and comma-separated main artists", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const ownerEmail = `smoke-catalog-owner-${suffix}@naad-backstage.local`
    const creditOneEmail = `smoke-credit-one-${suffix}@naad-backstage.local`
    const creditTwoEmail = `smoke-credit-two-${suffix}@naad-backstage.local`
    const creditOneName = `Smoke Credit One ${suffix}`
    const creditTwoName = `Smoke Credit Two ${suffix}`
    const releaseTitle = `Smoke Version Release ${suffix}`
    const isrc = `SCV${uniqueDigits(9)}`
    const upc = `91${uniqueDigits(10)}`
    const artistIds: string[] = []

    try {
      const owner = await ensureSmokeArtist({
        email: ownerEmail,
        password: "SmokeArtist123!",
        fullName: `Smoke Catalog Owner ${suffix}`,
        stageName: `Smoke Catalog Owner ${suffix}`,
        country: "NP",
        bio: "Catalog version import smoke test owner",
      })
      artistIds.push(owner.artistId)

      const creditOne = await ensureSmokeArtist({
        email: creditOneEmail,
        password: "SmokeArtist123!",
        fullName: creditOneName,
        stageName: creditOneName,
        country: "NP",
        bio: "Catalog credit import smoke test artist",
      })
      artistIds.push(creditOne.artistId)

      const creditTwo = await ensureSmokeArtist({
        email: creditTwoEmail,
        password: "SmokeArtist123!",
        fullName: creditTwoName,
        stageName: creditTwoName,
        country: "NP",
        bio: "Catalog credit import smoke test artist",
      })
      artistIds.push(creditTwo.artistId)

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const csvText = [
        "Release Title,Release Date,UPC,Track Title,Track Version,ISRC,Primary Artist,Track Listing,Release Format",
        [
          csvEscape(releaseTitle),
          "2026-01-01",
          upc,
          csvEscape("Merai Tira"),
          "Acoustic",
          isrc,
          csvEscape(`${creditOneName}, ${creditTwoName}`),
          "1",
          "Single",
        ].join(","),
      ].join("\n")

      const importResponse = await page.request.post("/api/admin/releases/bulk-import", {
        data: {
          artistId: owner.artistId,
          filename: `smoke-catalog-version-${suffix}.csv`,
          csvText,
        },
      })
      expect(importResponse.ok()).toBeTruthy()

      const track = await getSmokeTrackByIsrc(isrc)
      expect(track).toBeTruthy()
      expect(track?.title).toBe("Merai Tira - Acoustic")
      expect(track?.version_line).toBe("Acoustic")
      expect((Array.isArray(track?.releases) ? track?.releases[0] : track?.releases)?.artist_id).toBe(owner.artistId)

      const credits = await getSmokeTrackCredits(track!.id)
      const mainCredits = credits.filter((credit) => credit.role_code === "Main Artist")
      expect(mainCredits.map((credit) => credit.credited_name)).toEqual([creditOneName, creditTwoName])
      expect(mainCredits.map((credit) => credit.linked_artist_id)).toEqual([creditOne.artistId, creditTwo.artistId])

      await signInWithPassword(page, ownerEmail, "SmokeArtist123!", "/dashboard")

      const releasesResponse = await page.request.get("/api/dashboard/releases", {
        params: {
          artistId: owner.artistId,
          surface: "catalog_list",
          search: isrc,
        },
      })
      expect(releasesResponse.ok()).toBeTruthy()
      const releasesPayload = await releasesResponse.json()
      expect(releasesPayload.releases[0]).toMatchObject({
        title: releaseTitle,
        artistName: `${creditOneName}, ${creditTwoName}`,
      })
    } finally {
      for (const artistId of artistIds) {
        await purgeSmokeArtistWithRpc(artistId).catch(() => undefined)
      }
    }
  })

  test("catalog import blocks duplicate ISRC only inside the selected artist dashboard", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const artistIds: string[] = []
    const isrc = `SDI${uniqueDigits(9)}`
    const firstUpc = `94${uniqueDigits(10)}`
    const duplicateUpc = `95${uniqueDigits(10)}`
    const otherArtistUpc = `96${uniqueDigits(10)}`
    const firstReleaseTitle = `Scoped ISRC Release ${suffix}`

    try {
      const firstArtist = await ensureSmokeArtist({
        email: `smoke-scoped-isrc-a-${suffix}@naad-backstage.local`,
        password: "SmokeArtist123!",
        fullName: `Smoke Scoped ISRC A ${suffix}`,
        stageName: `Smoke Scoped ISRC A ${suffix}`,
        country: "NP",
        bio: "Scoped duplicate ISRC smoke test artist A",
      })
      artistIds.push(firstArtist.artistId)

      const secondArtist = await ensureSmokeArtist({
        email: `smoke-scoped-isrc-b-${suffix}@naad-backstage.local`,
        password: "SmokeArtist123!",
        fullName: `Smoke Scoped ISRC B ${suffix}`,
        stageName: `Smoke Scoped ISRC B ${suffix}`,
        country: "NP",
        bio: "Scoped duplicate ISRC smoke test artist B",
      })
      artistIds.push(secondArtist.artistId)

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const firstCsv = [
        "Release Title,Release Date,UPC,Track Title,Track Version,ISRC,Primary Artist,Track Listing,Release Format",
        [
          csvEscape(firstReleaseTitle),
          "2026-02-01",
          firstUpc,
          csvEscape("Scoped Song"),
          "",
          isrc,
          csvEscape("Scoped Artist A"),
          "1",
          "Single",
        ].join(","),
      ].join("\n")

      const firstImport = await page.request.post("/api/admin/releases/bulk-import", {
        data: {
          artistId: firstArtist.artistId,
          filename: `smoke-scoped-isrc-a-${suffix}.csv`,
          csvText: firstCsv,
        },
      })
      expect(firstImport.ok()).toBeTruthy()

      const sameArtistDuplicateCsv = [
        "Release Title,Release Date,UPC,Track Title,Track Version,ISRC,Primary Artist,Track Listing,Release Format",
        [
          csvEscape(`Scoped ISRC Duplicate ${suffix}`),
          "2026-02-02",
          duplicateUpc,
          csvEscape("Scoped Song Duplicate"),
          "",
          isrc,
          csvEscape("Scoped Artist A"),
          "1",
          "Single",
        ].join(","),
      ].join("\n")

      const sameArtistDuplicate = await page.request.post("/api/admin/releases/bulk-import", {
        data: {
          artistId: firstArtist.artistId,
          filename: `smoke-scoped-isrc-a-duplicate-${suffix}.csv`,
          csvText: sameArtistDuplicateCsv,
        },
      })
      expect(sameArtistDuplicate.ok()).toBeTruthy()
      const duplicatePayload = await sameArtistDuplicate.json()
      expect(duplicatePayload.createdTrackCount).toBe(0)
      expect(duplicatePayload.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "track_exists_other_release",
            isrc,
          }),
        ]),
      )
      await expect.poll(() => countSmokeTracksByIsrcForArtist(isrc, firstArtist.artistId)).toBe(1)

      const sameReleaseReimportCsv = [
        "Release Title,Release Date,UPC,Track Title,Track Version,ISRC,Primary Artist,Track Listing,Release Format",
        [
          csvEscape(firstReleaseTitle),
          "2026-02-01",
          firstUpc,
          csvEscape("Scoped Song"),
          "Acoustic",
          isrc,
          csvEscape("Scoped Artist A"),
          "1",
          "Single",
        ].join(","),
      ].join("\n")

      const sameReleaseReimport = await page.request.post("/api/admin/releases/bulk-import", {
        data: {
          artistId: firstArtist.artistId,
          filename: `smoke-scoped-isrc-a-reimport-${suffix}.csv`,
          csvText: sameReleaseReimportCsv,
        },
      })
      expect(sameReleaseReimport.ok()).toBeTruthy()
      const sameReleasePayload = await sameReleaseReimport.json()
      expect(sameReleasePayload.createdTrackCount).toBe(0)
      expect(sameReleasePayload.skippedTrackCount).toBe(1)
      const updatedFirstArtistTrack = await getSmokeTrackByIsrcForArtist(isrc, firstArtist.artistId)
      expect(updatedFirstArtistTrack?.title).toBe("Scoped Song - Acoustic")
      expect(updatedFirstArtistTrack?.version_line).toBe("Acoustic")
      expect(await countSmokeTracksByIsrcForArtist(isrc, firstArtist.artistId)).toBe(1)

      const otherArtistCsv = [
        "Release Title,Release Date,UPC,Track Title,Track Version,ISRC,Primary Artist,Track Listing,Release Format",
        [
          csvEscape(`Scoped ISRC Other Artist ${suffix}`),
          "2026-02-03",
          otherArtistUpc,
          csvEscape("Scoped Song Other Artist"),
          "",
          isrc,
          csvEscape("Scoped Artist B"),
          "1",
          "Single",
        ].join(","),
      ].join("\n")

      const otherArtistImport = await page.request.post("/api/admin/releases/bulk-import", {
        data: {
          artistId: secondArtist.artistId,
          filename: `smoke-scoped-isrc-b-${suffix}.csv`,
          csvText: otherArtistCsv,
        },
      })
      expect(otherArtistImport.ok()).toBeTruthy()
      const otherArtistPayload = await otherArtistImport.json()
      expect(otherArtistPayload.createdTrackCount).toBe(1)
      expect(otherArtistPayload.issues).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "track_exists_other_artist",
            isrc,
          }),
        ]),
      )
      expect(await countSmokeTracksByIsrcForArtist(isrc, secondArtist.artistId)).toBe(1)
      expect(await countSmokeTracksByIsrc(isrc)).toBe(2)
    } finally {
      for (const artistId of artistIds) {
        await purgeSmokeArtistWithRpc(artistId).catch(() => undefined)
      }
    }
  })

  test("royalty preview blocks ISRC matches from archived catalog rows", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const adminUser = await findAuthUserByEmail(adminEmail)

    if (!adminUser) {
      throw new Error(`Smoke admin user ${adminEmail} was not found.`)
    }

    const artist = await ensureSmokeArtist({
      email: `smoke-archived-isrc-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Archived ISRC ${suffix}`,
      stageName: `Smoke Archived ISRC ${suffix}`,
      country: "NP",
      bio: "Archived ISRC royalty preview smoke test artist",
    })
    const isrc = `SAI${uniqueDigits(9)}`
    const upc = `92${uniqueDigits(10)}`

    try {
      const catalog = await insertSmokeCatalogTrack({
        artistId: artist.artistId,
        releaseTitle: `Archived Preview Release ${suffix}`,
        trackTitle: `Archived Preview Track ${suffix}`,
        isrc,
        upc,
      })
      await archiveSmokeReleaseDirectly(catalog.releaseId)

      const csvText = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,upc,units,unit_price,total",
        `2026-01-31,2026-01-15,Archived Preview Release,Archived Preview Track,Smoke DSP,NP,${isrc},${upc},1,1.00000000,1.00000000`,
      ].join("\n")
      const uploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: artist.artistId,
        filename: `smoke-archived-isrc-${suffix}.csv`,
        csvText,
        periodMonth: "2026-01-01",
        checksum: `smoke-archived-isrc-${suffix}`,
      })

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const previewResponse = await page.request.post(`/api/admin/imports/${uploadId}/preview`)
      expect(previewResponse.ok()).toBeTruthy()

      const preview = await previewResponse.json()
      expect(preview.summary.matchedCount).toBe(0)
      expect(preview.summary.unmatchedCount).toBe(1)
      expect(preview.unmatched[0]).toMatchObject({
        isrc,
        issueCode: "archived_catalog_isrc",
        reason: "ISRC exists in archived catalog. Restore catalog row before committing royalties.",
      })
    } finally {
      await purgeSmokeArtistWithRpc(artist.artistId).catch(() => undefined)
    }
  })

  test("royalty preview does not match another artist dashboard by ISRC", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const adminUser = await findAuthUserByEmail(adminEmail)

    if (!adminUser) {
      throw new Error(`Smoke admin user ${adminEmail} was not found.`)
    }

    const targetArtist = await ensureSmokeArtist({
      email: `smoke-royalty-scope-target-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Royalty Scope Target ${suffix}`,
      stageName: `Smoke Royalty Scope Target ${suffix}`,
      country: "NP",
      bio: "Royalty preview scoped matching target artist",
    })
    const otherArtist = await ensureSmokeArtist({
      email: `smoke-royalty-scope-other-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Royalty Scope Other ${suffix}`,
      stageName: `Smoke Royalty Scope Other ${suffix}`,
      country: "NP",
      bio: "Royalty preview scoped matching other artist",
    })
    const isrc = `SRM${uniqueDigits(9)}`
    const upc = `97${uniqueDigits(10)}`

    try {
      await insertSmokeCatalogTrack({
        artistId: otherArtist.artistId,
        releaseTitle: `Royalty Scope Other Release ${suffix}`,
        trackTitle: `Royalty Scope Other Track ${suffix}`,
        isrc,
        upc,
      })

      const csvText = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,upc,units,unit_price,total",
        `2026-02-28,2026-02-15,Royalty Scope Other Release,Royalty Scope Other Track,Smoke DSP,NP,${isrc},${upc},1,1.00000000,1.00000000`,
      ].join("\n")
      const uploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: targetArtist.artistId,
        filename: `smoke-royalty-scope-${suffix}.csv`,
        csvText,
        periodMonth: "2026-02-01",
        checksum: `smoke-royalty-scope-${suffix}`,
      })

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const previewResponse = await page.request.post(`/api/admin/imports/${uploadId}/preview`)
      expect(previewResponse.ok()).toBeTruthy()

      const preview = await previewResponse.json()
      expect(preview.summary.matchedCount).toBe(0)
      expect(preview.summary.unmatchedCount).toBe(1)
      expect(preview.unmatched[0]).toMatchObject({
        isrc,
        issueCode: "catalog_not_found",
      })
    } finally {
      await purgeSmokeArtistWithRpc(targetArtist.artistId).catch(() => undefined)
      await purgeSmokeArtistWithRpc(otherArtist.artistId).catch(() => undefined)
    }
  })

  test("royalty preview and commit allow statement-month release split access without double splitting", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const adminUser = await findAuthUserByEmail(adminEmail)

    if (!adminUser) {
      throw new Error(`Smoke admin user ${adminEmail} was not found.`)
    }

    const owner = await ensureSmokeArtist({
      email: `smoke-split-owner-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Split Owner ${suffix}`,
      stageName: `Smoke Split Owner ${suffix}`,
      country: "NP",
      bio: "Split access royalty owner",
    })
    const collaborator = await ensureSmokeArtist({
      email: `smoke-split-collab-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Split Collaborator ${suffix}`,
      stageName: `Smoke Split Collaborator ${suffix}`,
      country: "NP",
      bio: "Split access royalty collaborator",
    })
    const laterCollaborator = await ensureSmokeArtist({
      email: `smoke-split-later-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Split Later ${suffix}`,
      stageName: `Smoke Split Later ${suffix}`,
      country: "NP",
      bio: "Later split access collaborator",
    })
    const artistIds = [owner.artistId, collaborator.artistId, laterCollaborator.artistId]
    const isrc = `SRS${uniqueDigits(9)}`
    const upc = `81${uniqueDigits(10)}`

    try {
      const catalog = await insertSmokeCatalogTrack({
        artistId: owner.artistId,
        releaseTitle: `Split Access Release ${suffix}`,
        trackTitle: `Split Access Track ${suffix}`,
        isrc,
        upc,
      })
      await insertSmokeReleaseSplitVersion({
        releaseId: catalog.releaseId,
        artistId: collaborator.artistId,
        effectivePeriodMonth: "2026-01-01",
        splitPct: "30.00",
      })
      await insertSmokeReleaseSplitVersion({
        releaseId: catalog.releaseId,
        artistId: laterCollaborator.artistId,
        effectivePeriodMonth: "2026-03-01",
        splitPct: "30.00",
      })

      const januaryCsv = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,upc,units,unit_price,total",
        `2026-01-31,2026-01-15,Split Access Release,Split Access Track,Smoke DSP,NP,${isrc},${upc},3,2.50000000,7.50000000`,
      ].join("\n")
      const januaryUploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: collaborator.artistId,
        filename: `smoke-split-access-${suffix}.csv`,
        csvText: januaryCsv,
        periodMonth: "2026-01-01",
        checksum: `smoke-split-access-${suffix}`,
      })

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const previewResponse = await page.request.post(`/api/admin/imports/${januaryUploadId}/preview`)
      expect(previewResponse.ok()).toBeTruthy()
      const preview = await previewResponse.json()
      expect(preview.summary).toMatchObject({
        matchedCount: 1,
        unmatchedCount: 0,
        totalAmount: "7.50000000",
      })

      const commit = await commitSmokeRoyaltyUpload(januaryUploadId, adminUser.id)
      expect(commit).toMatchObject({
        status: "completed",
        rowsInserted: 1,
        totalAmount: "7.50000000",
      })
      expect(await countSmokeEarningsForArtistByUpload(collaborator.artistId, januaryUploadId)).toBe(1)
      expect(await countSmokeEarningsForArtistByUpload(owner.artistId, januaryUploadId)).toBe(0)
      expect(await sumSmokeEarningsForArtistByUpload(collaborator.artistId, januaryUploadId)).toBeCloseTo(7.5, 8)

      const marchCsv = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,upc,units,unit_price,total",
        `2026-03-31,2026-03-15,Split Access Release,Split Access Track,Smoke DSP,NP,${isrc},${upc},1,1.00000000,1.00000000`,
      ].join("\n")
      const marchUploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: collaborator.artistId,
        filename: `smoke-split-access-march-${suffix}.csv`,
        csvText: marchCsv,
        periodMonth: "2026-03-01",
        checksum: `smoke-split-access-march-${suffix}`,
      })

      const marchPreviewResponse = await page.request.post(`/api/admin/imports/${marchUploadId}/preview`)
      expect(marchPreviewResponse.ok()).toBeTruthy()
      const marchPreview = await marchPreviewResponse.json()
      expect(marchPreview.summary).toMatchObject({
        matchedCount: 0,
        unmatchedCount: 1,
      })
      expect(marchPreview.unmatched[0]).toMatchObject({
        isrc,
        issueCode: "catalog_not_found",
      })
    } finally {
      for (const artistId of artistIds) {
        await purgeSmokeArtistWithRpc(artistId).catch(() => undefined)
      }
    }
  })

  test("stopped release collaborators keep historical visibility while losing post-stop CSV access", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const adminUser = await findAuthUserByEmail(adminEmail)

    if (!adminUser) {
      throw new Error(`Smoke admin user ${adminEmail} was not found.`)
    }

    const ownerEmail = `smoke-stop-owner-${suffix}@naad-backstage.local`
    const collaboratorEmail = `smoke-stop-collab-${suffix}@naad-backstage.local`
    const owner = await ensureSmokeArtist({
      email: ownerEmail,
      password: "SmokeArtist123!",
      fullName: `Smoke Stop Owner ${suffix}`,
      stageName: `Smoke Stop Owner ${suffix}`,
      country: "NP",
      bio: "Stopped collaboration owner",
    })
    const collaborator = await ensureSmokeArtist({
      email: collaboratorEmail,
      password: "SmokeArtist123!",
      fullName: `Smoke Stop Collaborator ${suffix}`,
      stageName: `Smoke Stop Collaborator ${suffix}`,
      country: "NP",
      bio: "Stopped collaboration collaborator",
    })
    const isrc = `STP${uniqueDigits(9)}`
    const upc = `85${uniqueDigits(10)}`

    try {
      const catalog = await insertSmokeCatalogTrack({
        artistId: owner.artistId,
        releaseTitle: `Stopped Collaboration Release ${suffix}`,
        trackTitle: `Stopped Collaboration Track ${suffix}`,
        isrc,
        upc,
      })
      await insertSmokeReleaseSplitVersion({
        releaseId: catalog.releaseId,
        artistId: collaborator.artistId,
        effectivePeriodMonth: "2026-01-01",
        splitPct: "35.00",
      })
      await insertSmokeReleaseSplitStopVersion({
        releaseId: catalog.releaseId,
        effectivePeriodMonth: "2026-03-01",
      })

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const januaryCsv = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,upc,units,unit_price,total",
        `2026-01-31,2026-01-15,Stopped Collaboration Release,Stopped Collaboration Track,Smoke DSP,NP,${isrc},${upc},2,2.00000000,4.00000000`,
      ].join("\n")
      const januaryUploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: collaborator.artistId,
        filename: `smoke-stop-before-${suffix}.csv`,
        csvText: januaryCsv,
        periodMonth: "2026-01-01",
        checksum: `smoke-stop-before-${suffix}`,
      })
      const januaryPreviewResponse = await page.request.post(`/api/admin/imports/${januaryUploadId}/preview`)
      expect(januaryPreviewResponse.ok()).toBeTruthy()
      const januaryPreview = await januaryPreviewResponse.json()
      expect(januaryPreview.summary).toMatchObject({
        matchedCount: 1,
        unmatchedCount: 0,
      })

      const aprilCsv = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,upc,units,unit_price,total",
        `2026-04-30,2026-04-15,Stopped Collaboration Release,Stopped Collaboration Track,Smoke DSP,NP,${isrc},${upc},1,1.00000000,1.00000000`,
      ].join("\n")
      const aprilUploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: collaborator.artistId,
        filename: `smoke-stop-after-${suffix}.csv`,
        csvText: aprilCsv,
        periodMonth: "2026-04-01",
        checksum: `smoke-stop-after-${suffix}`,
      })
      const aprilPreviewResponse = await page.request.post(`/api/admin/imports/${aprilUploadId}/preview`)
      expect(aprilPreviewResponse.ok()).toBeTruthy()
      const aprilPreview = await aprilPreviewResponse.json()
      expect(aprilPreview.summary).toMatchObject({
        matchedCount: 0,
        unmatchedCount: 1,
      })
      expect(aprilPreview.unmatched[0]).toMatchObject({
        isrc,
        issueCode: "catalog_not_found",
      })

      await signInWithPassword(page, ownerEmail, "SmokeArtist123!", "/dashboard")
      const ownerReleasesResponse = await page.request.get("/api/dashboard/releases", {
        params: {
          artistId: owner.artistId,
          surface: "catalog_list",
          search: isrc,
        },
      })
      expect(ownerReleasesResponse.ok()).toBeTruthy()
      const ownerReleases = await ownerReleasesResponse.json()
      expect(ownerReleases.releases[0]).toMatchObject({
        id: catalog.releaseId,
        viewerCollaborationStatus: "owner",
        ownerCurrentSplitPct: "100.00",
      })

      await signInWithPassword(page, collaboratorEmail, "SmokeArtist123!", "/dashboard")
      const collaboratorReleasesResponse = await page.request.get("/api/dashboard/releases", {
        params: {
          artistId: collaborator.artistId,
          surface: "catalog_list",
          search: isrc,
        },
      })
      expect(collaboratorReleasesResponse.ok()).toBeTruthy()
      const collaboratorReleases = await collaboratorReleasesResponse.json()
      expect(collaboratorReleases.releases[0]).toMatchObject({
        id: catalog.releaseId,
        viewerRelation: "collaborator",
        viewerCollaborationStatus: "stopped",
        viewerLastSplitPct: "35.00",
        viewerCollaborationEndedEffectiveMonth: "2026-03",
      })
    } finally {
      await purgeSmokeArtistWithRpc(owner.artistId).catch(() => undefined)
      await purgeSmokeArtistWithRpc(collaborator.artistId).catch(() => undefined)
    }
  })

  test("royalty preview limits track split access to that track", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const adminUser = await findAuthUserByEmail(adminEmail)

    if (!adminUser) {
      throw new Error(`Smoke admin user ${adminEmail} was not found.`)
    }

    const owner = await ensureSmokeArtist({
      email: `smoke-track-split-owner-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Track Split Owner ${suffix}`,
      stageName: `Smoke Track Split Owner ${suffix}`,
      country: "NP",
      bio: "Track split scope owner",
    })
    const collaborator = await ensureSmokeArtist({
      email: `smoke-track-split-collab-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Track Split Collaborator ${suffix}`,
      stageName: `Smoke Track Split Collaborator ${suffix}`,
      country: "NP",
      bio: "Track split scope collaborator",
    })
    const isrcAllowed = `TSA${uniqueDigits(9)}`
    const isrcDenied = `TSD${uniqueDigits(9)}`
    const upc = `82${uniqueDigits(10)}`

    try {
      const catalog = await insertSmokeCatalogTrack({
        artistId: owner.artistId,
        releaseTitle: `Track Split Scope Release ${suffix}`,
        trackTitle: `Track Split Allowed ${suffix}`,
        isrc: isrcAllowed,
        upc,
      })
      await insertSmokeTrackOnRelease({
        releaseId: catalog.releaseId,
        trackTitle: `Track Split Denied ${suffix}`,
        isrc: isrcDenied,
        trackNumber: 2,
      })
      await insertSmokeTrackSplitVersion({
        trackId: catalog.trackId,
        releaseId: catalog.releaseId,
        artistId: collaborator.artistId,
        effectivePeriodMonth: "2026-02-01",
        splitPct: "25.00",
      })

      const csvText = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,upc,units,unit_price,total",
        `2026-02-28,2026-02-10,Track Split Scope Release,Track Split Allowed,Smoke DSP,NP,${isrcAllowed},${upc},1,3.00000000,3.00000000`,
        `2026-02-28,2026-02-11,Track Split Scope Release,Track Split Denied,Smoke DSP,NP,${isrcDenied},${upc},1,4.00000000,4.00000000`,
      ].join("\n")
      const uploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: collaborator.artistId,
        filename: `smoke-track-split-scope-${suffix}.csv`,
        csvText,
        periodMonth: "2026-02-01",
        checksum: `smoke-track-split-scope-${suffix}`,
      })

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const previewResponse = await page.request.post(`/api/admin/imports/${uploadId}/preview`)
      expect(previewResponse.ok()).toBeTruthy()
      const preview = await previewResponse.json()
      expect(preview.summary).toMatchObject({
        matchedCount: 1,
        unmatchedCount: 1,
      })
      expect(preview.releases[0]).toMatchObject({
        releaseId: catalog.releaseId,
        totalAmount: "3.00000000",
      })
      expect(preview.unmatched[0]).toMatchObject({
        isrc: isrcDenied,
        issueCode: "catalog_not_found",
      })
    } finally {
      await purgeSmokeArtistWithRpc(owner.artistId).catch(() => undefined)
      await purgeSmokeArtistWithRpc(collaborator.artistId).catch(() => undefined)
    }
  })

  test("royalty preview requires UPC when split access makes an ISRC ambiguous", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const adminUser = await findAuthUserByEmail(adminEmail)

    if (!adminUser) {
      throw new Error(`Smoke admin user ${adminEmail} was not found.`)
    }

    const firstOwner = await ensureSmokeArtist({
      email: `smoke-ambig-owner-a-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Ambig Owner A ${suffix}`,
      stageName: `Smoke Ambig Owner A ${suffix}`,
      country: "NP",
      bio: "Ambiguous ISRC owner A",
    })
    const secondOwner = await ensureSmokeArtist({
      email: `smoke-ambig-owner-b-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Ambig Owner B ${suffix}`,
      stageName: `Smoke Ambig Owner B ${suffix}`,
      country: "NP",
      bio: "Ambiguous ISRC owner B",
    })
    const collaborator = await ensureSmokeArtist({
      email: `smoke-ambig-collab-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Ambig Collaborator ${suffix}`,
      stageName: `Smoke Ambig Collaborator ${suffix}`,
      country: "NP",
      bio: "Ambiguous ISRC collaborator",
    })
    const isrc = `AMB${uniqueDigits(9)}`
    const firstUpc = `83${uniqueDigits(10)}`
    const secondUpc = `84${uniqueDigits(10)}`

    try {
      const firstCatalog = await insertSmokeCatalogTrack({
        artistId: firstOwner.artistId,
        releaseTitle: `Ambiguous Release A ${suffix}`,
        trackTitle: `Ambiguous Track A ${suffix}`,
        isrc,
        upc: firstUpc,
      })
      const secondCatalog = await insertSmokeCatalogTrack({
        artistId: secondOwner.artistId,
        releaseTitle: `Ambiguous Release B ${suffix}`,
        trackTitle: `Ambiguous Track B ${suffix}`,
        isrc,
        upc: secondUpc,
      })
      await insertSmokeReleaseSplitVersion({
        releaseId: firstCatalog.releaseId,
        artistId: collaborator.artistId,
        effectivePeriodMonth: "2026-02-01",
      })
      await insertSmokeReleaseSplitVersion({
        releaseId: secondCatalog.releaseId,
        artistId: collaborator.artistId,
        effectivePeriodMonth: "2026-02-01",
      })

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const ambiguousCsv = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,units,unit_price,total",
        `2026-02-28,2026-02-15,Ambiguous Release,Ambiguous Track,Smoke DSP,NP,${isrc},1,1.00000000,1.00000000`,
      ].join("\n")
      const ambiguousUploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: collaborator.artistId,
        filename: `smoke-ambiguous-isrc-${suffix}.csv`,
        csvText: ambiguousCsv,
        periodMonth: "2026-02-01",
        checksum: `smoke-ambiguous-isrc-${suffix}`,
      })

      const ambiguousPreviewResponse = await page.request.post(`/api/admin/imports/${ambiguousUploadId}/preview`)
      expect(ambiguousPreviewResponse.ok()).toBeTruthy()
      const ambiguousPreview = await ambiguousPreviewResponse.json()
      expect(ambiguousPreview.summary).toMatchObject({
        matchedCount: 0,
        unmatchedCount: 1,
      })
      expect(ambiguousPreview.unmatched[0]).toMatchObject({
        isrc,
        issueCode: "ambiguous_catalog_isrc",
      })

      const disambiguatedCsv = [
        "accounting_date,sale_date,release_title,track_title,channel,country,isrc,upc,units,unit_price,total",
        `2026-02-28,2026-02-15,Ambiguous Release B,Ambiguous Track B,Smoke DSP,NP,${isrc},${secondUpc},1,1.00000000,1.00000000`,
      ].join("\n")
      const disambiguatedUploadId = await insertSmokeRoyaltyPreviewUpload({
        uploadedBy: adminUser.id,
        artistId: collaborator.artistId,
        filename: `smoke-ambiguous-isrc-upc-${suffix}.csv`,
        csvText: disambiguatedCsv,
        periodMonth: "2026-02-01",
        checksum: `smoke-ambiguous-isrc-upc-${suffix}`,
      })

      const disambiguatedPreviewResponse = await page.request.post(`/api/admin/imports/${disambiguatedUploadId}/preview`)
      expect(disambiguatedPreviewResponse.ok()).toBeTruthy()
      const disambiguatedPreview = await disambiguatedPreviewResponse.json()
      expect(disambiguatedPreview.summary).toMatchObject({
        matchedCount: 1,
        unmatchedCount: 0,
      })
      expect(disambiguatedPreview.releases[0]).toMatchObject({
        releaseId: secondCatalog.releaseId,
      })
    } finally {
      await purgeSmokeArtistWithRpc(firstOwner.artistId).catch(() => undefined)
      await purgeSmokeArtistWithRpc(secondOwner.artistId).catch(() => undefined)
      await purgeSmokeArtistWithRpc(collaborator.artistId).catch(() => undefined)
    }
  })

  test("release archive risk exposes earnings impact and blocks unconfirmed deletes", async ({ page }) => {
    const suffix = Date.now().toString(36)
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const adminUser = await findAuthUserByEmail(adminEmail)

    if (!adminUser) {
      throw new Error(`Smoke admin user ${adminEmail} was not found.`)
    }

    const artist = await ensureSmokeArtist({
      email: `smoke-archive-risk-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Archive Risk ${suffix}`,
      stageName: `Smoke Archive Risk ${suffix}`,
      country: "NP",
      bio: "Archive risk smoke test artist",
    })
    const isrc = `SAR${uniqueDigits(9)}`
    const upc = `93${uniqueDigits(10)}`

    try {
      const catalog = await insertSmokeCatalogTrack({
        artistId: artist.artistId,
        releaseTitle: `Archive Risk Release ${suffix}`,
        trackTitle: `Archive Risk Track ${suffix}`,
        isrc,
        upc,
      })
      await insertSmokeEarning({
        uploadedBy: adminUser.id,
        artistId: artist.artistId,
        releaseId: catalog.releaseId,
        trackId: catalog.trackId,
        amount: "2.50000000",
        units: 2,
        checksum: `smoke-archive-risk-${suffix}`,
        filename: `smoke-archive-risk-${suffix}.csv`,
        periodMonth: "2026-01-01",
      })

      await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

      const riskResponse = await page.request.get(`/api/admin/releases/${catalog.releaseId}/archive-risk`)
      expect(riskResponse.ok()).toBeTruthy()
      const risk = await riskResponse.json()
      expect(risk).toMatchObject({
        releaseId: catalog.releaseId,
        releaseUpc: upc,
        hasEarnings: true,
        earningsRowCount: 1,
        affectedUploadCount: 1,
      })
      expect(risk.tracks[0]).toMatchObject({
        isrc,
        earningsRowCount: 1,
      })

      const unconfirmedResponse = await page.request.patch(`/api/admin/releases/${catalog.releaseId}`, {
        data: {
          status: "deleted",
        },
      })
      expect(unconfirmedResponse.status()).toBe(409)

      const confirmedResponse = await page.request.patch(`/api/admin/releases/${catalog.releaseId}`, {
        data: {
          status: "deleted",
          confirmArchiveWithEarnings: true,
        },
      })
      expect(confirmedResponse.ok()).toBeTruthy()
    } finally {
      await purgeSmokeArtistWithRpc(artist.artistId).catch(() => undefined)
    }
  })
})
