import { expect, test } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  archiveSmokeReleaseDirectly,
  countSmokeTracksByIsrc,
  countSmokeTracksByIsrcForArtist,
  ensureSmokeArtist,
  findAuthUserByEmail,
  getSmokeTrackByIsrc,
  getSmokeTrackByIsrcForArtist,
  getSmokeTrackCredits,
  insertSmokeCatalogTrack,
  insertSmokeEarning,
  insertSmokeRoyaltyPreviewUpload,
  purgeSmokeArtistWithRpc,
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
