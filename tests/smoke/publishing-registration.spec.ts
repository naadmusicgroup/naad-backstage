import { expect, test, type BrowserContext } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  countSmokeLedgerRowsForArtist,
  countSmokeArtistPublishingWriterLinks,
  countSmokePublishingEarningsForArtist,
  countSmokePublishingRegistrationTracksForArtist,
  countSmokePublishingWritersByIpi,
  countSmokePublishingWritersByIdentity,
  deleteSmokePublishingRegistrationsForArtist,
  deleteSmokePublishingWritersByNames,
  ensureSmokeArtist,
  insertSmokeCatalogTrack,
  insertSmokePublishingWriter,
  purgeSmokeArtistWithRpc,
  upsertSmokeArtistPublishingInfo,
} from "./support/supabase"
import type { AdminPublishingMutationResponse } from "../../types/admin"
import type {
  AdminPublishingRegistrationResponse,
  AdminPublishingWriterMutationResponse,
  AdminPublishingWritersResponse,
  ArtistPublishingResponse,
  PublishingRegistrationMutationResponse,
} from "../../types/publishing"

function writer(fullName: string, sharePct: string | number, extra?: { writerId?: string; collectRoyalties?: boolean }) {
  const compactName = fullName.replace(/\W+/g, "")

  return {
    writerId: extra?.writerId,
    fullName: extra?.writerId ? undefined : fullName,
    ipiNumber: extra?.writerId ? undefined : `IPI-${compactName.slice(0, 24)}-${compactName.slice(-10)}`,
    proName: extra?.writerId ? undefined : "Smoke PRO",
    role: "Composition",
    sharePct,
    collectRoyalties: extra?.collectRoyalties ?? true,
  }
}

test.describe("publishing registration batch flow", () => {
  test.setTimeout(180000)

  test("artist submits a batch, admin reviews rows, and registrations stay separate from credits", async ({ browser, baseURL }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const artistEmail = `smoke-publishing-${suffix}@naad-backstage.local`
    const artistPassword = "SmokeArtist123!"
    const artistName = `Smoke Publishing Artist ${suffix}`
    const secondArtistEmail = `smoke-publishing-linked-${suffix}@naad-backstage.local`
    const secondArtistName = `Smoke Publishing Linked Artist ${suffix}`
    const defaultWriterName = `000 Smoke Artist Legal Writer ${suffix}`
    const defaultWriterIpi = `ARTIST-IP-${suffix}`
    const defaultWriterPro = "Artist Smoke PRO"
    const mergeCandidateName = `000 Smoke Merge Candidate ${suffix}`
    const unusedWriterName = `000 Smoke Unused Writer ${suffix}`
    const writerNames = [
      defaultWriterName,
      `000 Smoke Writer B ${suffix}`,
      `000 Smoke Writer C ${suffix}`,
      `000 Smoke Writer D ${suffix}`,
      `000 Smoke Global Writer ${suffix}`,
      mergeCandidateName,
      unusedWriterName,
    ]
    let artistContext: BrowserContext | null = null
    let adminContext: BrowserContext | null = null
    let artistId = ""
    let secondArtistId = ""
    let releaseId = ""

    try {
      const smokeArtist = await ensureSmokeArtist({
        email: artistEmail,
        password: artistPassword,
        fullName: artistName,
        stageName: artistName,
        country: "Nepal",
        bio: "Publishing registration smoke test",
      })
      artistId = smokeArtist.artistId

      const secondSmokeArtist = await ensureSmokeArtist({
        email: secondArtistEmail,
        password: artistPassword,
        fullName: secondArtistName,
        stageName: secondArtistName,
        country: "Nepal",
        bio: "Publishing linked writer smoke test",
      })
      secondArtistId = secondSmokeArtist.artistId

      await upsertSmokeArtistPublishingInfo({
        artistId,
        legalName: defaultWriterName,
        ipiNumber: defaultWriterIpi,
        proName: defaultWriterPro,
      })

      const catalogTrack = await insertSmokeCatalogTrack({
        artistId,
        releaseTitle: `Smoke Publishing Release ${suffix}`,
        trackTitle: `Smoke Catalog Song ${suffix}`,
        isrc: `SMK${String(Date.now()).slice(-9)}`,
        upc: `99${String(Date.now()).slice(-10)}`,
      })
      releaseId = catalogTrack.releaseId

      const globalWriterId = await insertSmokePublishingWriter({
        fullName: writerNames[4],
        ipiNumber: `GLOBAL-${suffix}`,
        proName: "Global Smoke PRO",
      })
      const mergeCandidateWriterId = await insertSmokePublishingWriter({
        fullName: mergeCandidateName,
        ipiNumber: `MERGE-${suffix}`,
        proName: "Merge Smoke PRO",
      })
      const unusedWriterId = await insertSmokePublishingWriter({
        fullName: unusedWriterName,
        ipiNumber: `UNUSED-${suffix}`,
        proName: "Unused Smoke PRO",
      })

      artistContext = await browser.newContext({ baseURL })
      const artistPage = await artistContext.newPage()
      await signInWithPassword(artistPage, artistEmail, artistPassword, "/dashboard")

      const httpSpotifyResponse = await artistPage.request.post("/api/dashboard/publishing/batches", {
        data: {
          artistId,
          tracks: [{
            source: "manual",
            songTitle: `Invalid HTTP Spotify ${suffix}`,
            performerName: artistName,
            spotifyUrl: "http://open.spotify.com/track/not-secure",
            writers: [writer(writerNames[0], "100")],
          }],
        },
      })
      expect(httpSpotifyResponse.status()).toBe(400)

      const nonSpotifyResponse = await artistPage.request.post("/api/dashboard/publishing/batches", {
        data: {
          artistId,
          tracks: [{
            source: "manual",
            songTitle: `Invalid Platform ${suffix}`,
            performerName: artistName,
            spotifyUrl: "https://music.apple.com/us/album/not-spotify",
            writers: [writer(writerNames[0], "100")],
          }],
        },
      })
      expect(nonSpotifyResponse.status()).toBe(400)

      const invalidSharesResponse = await artistPage.request.post("/api/dashboard/publishing/batches", {
        data: {
          artistId,
          tracks: [{
            source: "manual",
            songTitle: `Invalid Shares ${suffix}`,
            performerName: artistName,
            spotifyUrl: "https://open.spotify.com/track/invalidshares",
            writers: [writer(writerNames[0], "60")],
          }],
        },
      })
      expect(invalidSharesResponse.status()).toBe(400)

      const submitResponse = await artistPage.request.post("/api/dashboard/publishing/batches", {
        data: {
          artistId,
          artistNotes: "Smoke artist publishing registration",
          tracks: [
            {
              source: "catalog",
              trackId: catalogTrack.trackId,
              writers: [{
                fullName: defaultWriterName,
                ipiNumber: defaultWriterIpi,
                proName: defaultWriterPro,
                role: "Composition",
                sharePct: "100",
                collectRoyalties: true,
              }],
            },
            {
              source: "manual",
              songTitle: `Smoke Manual Song One ${suffix}`,
              performerName: artistName,
              spotifyUrl: "https://open.spotify.com/track/manualone",
              writers: [
                writer(writerNames[1], "50"),
                writer(writerNames[2], "50", { collectRoyalties: false }),
              ],
            },
            {
              source: "manual",
              songTitle: `Smoke Manual Song Two ${suffix}`,
              performerName: artistName,
              spotifyUrl: "https://open.spotify.com/track/manualtwo",
              writers: [writer(writerNames[3], "100")],
            },
          ],
        },
      })
      const submitResponseBody = await submitResponse.text()
      expect(submitResponse.ok(), submitResponseBody).toBeTruthy()

      const submitResult = JSON.parse(submitResponseBody) as PublishingRegistrationMutationResponse
      expect(submitResult.trackIds).toHaveLength(3)
      expect(await countSmokePublishingRegistrationTracksForArtist(artistId)).toBe(3)
      expect(await countSmokePublishingWritersByIdentity({
        fullName: defaultWriterName,
        ipiNumber: defaultWriterIpi,
        proName: defaultWriterPro,
      })).toBe(1)
      expect(await countSmokeArtistPublishingWriterLinks(artistId, defaultWriterName)).toBe(1)

      const duplicateCatalogResponse = await artistPage.request.post("/api/dashboard/publishing/batches", {
        data: {
          artistId,
          tracks: [{
            source: "catalog",
            trackId: catalogTrack.trackId,
            writers: [writer(defaultWriterName, "100")],
          }],
        },
      })
      expect(duplicateCatalogResponse.status()).toBe(409)

      const artistPublishingResponse = await artistPage.request.get(`/api/dashboard/publishing?artistId=${artistId}`)
      expect(artistPublishingResponse.ok()).toBeTruthy()
      const artistPublishing = await artistPublishingResponse.json() as ArtistPublishingResponse
      expect(artistPublishing.defaultWriter?.fullName).toBe(defaultWriterName)
      expect(artistPublishing.summary.pendingCount).toBe(3)
      const artistCatalogOption = artistPublishing.catalogTrackOptions.find((track) => track.value === catalogTrack.trackId)
      expect(artistCatalogOption?.registrationStatus).toBe("pending_review")
      expect(artistPublishing.writerOptions.map((option) => option.label)).toContain(writerNames[0])
      expect(artistPublishing.writerOptions.map((option) => option.label)).not.toContain(writerNames[4])

      adminContext = await browser.newContext({ baseURL })
      const adminPage = await adminContext.newPage()
      await signInWithPassword(
        adminPage,
        readEnv("SMOKE_ADMIN_EMAIL"),
        readEnv("SMOKE_ADMIN_PASSWORD"),
        "/admin",
        { adminMfa: true },
      )

      const adminPendingResponse = await adminPage.request.get(`/api/admin/publishing/registrations?status=pending_review&artistId=${artistId}`)
      expect(adminPendingResponse.ok()).toBeTruthy()
      const adminPending = await adminPendingResponse.json() as AdminPublishingRegistrationResponse
      const pendingTracks = adminPending.tracks.filter((track) => submitResult.trackIds.includes(track.id))
      expect(pendingTracks).toHaveLength(3)
      expect(adminPending.writerOptions.map((option) => option.label)).toContain(writerNames[4])
      expect(adminPending.writerOptions.map((option) => option.label)).toContain(writerNames[0])
      expect(adminPending.writerOptions.find((option) => option.label === writerNames[0])?.linkedArtistNames).toContain(artistName)

      const sharedWriterResponse = await adminPage.request.post("/api/admin/publishing/registrations", {
        data: {
          artistId: secondArtistId,
          adminNotes: "Smoke shared writer IPI direct add",
          tracks: [{
            source: "manual",
            songTitle: `Smoke Shared Writer Song ${suffix}`,
            performerName: secondArtistName,
            spotifyUrl: "https://open.spotify.com/track/sharedwriter",
            writers: [{
              fullName: `${defaultWriterName} Variant`,
              ipiNumber: defaultWriterIpi,
              proName: "Different Smoke PRO",
              role: "Composition",
              sharePct: "100",
              collectRoyalties: true,
            }],
          }],
        },
      })
      expect(sharedWriterResponse.ok()).toBeTruthy()
      expect(await countSmokePublishingWritersByIpi(defaultWriterIpi)).toBe(1)

      const writerDirectoryResponse = await adminPage.request.get("/api/admin/publishing/writers?status=active")
      expect(writerDirectoryResponse.ok()).toBeTruthy()
      const writerDirectory = await writerDirectoryResponse.json() as AdminPublishingWritersResponse
      const defaultWriterRecord = writerDirectory.writers.find((entry) => entry.ipiNumber === defaultWriterIpi)
      expect(defaultWriterRecord).toBeTruthy()
      const defaultWriterId = defaultWriterRecord!.id
      expect(defaultWriterRecord?.linkedArtistNames).toContain(artistName)
      expect(defaultWriterRecord?.linkedArtistNames).toContain(secondArtistName)

      const mergeWriterResponse = await adminPage.request.patch(`/api/admin/publishing/writers/${mergeCandidateWriterId}`, {
        data: {
          fullName: defaultWriterName,
          ipiNumber: defaultWriterIpi,
          proName: defaultWriterPro,
        },
      })
      expect(mergeWriterResponse.ok()).toBeTruthy()
      const mergeWriterResult = await mergeWriterResponse.json() as AdminPublishingWriterMutationResponse
      expect(mergeWriterResult.mergedIntoWriterId).toBe(defaultWriterId)
      expect(await countSmokePublishingWritersByIpi(defaultWriterIpi)).toBe(1)

      const deleteUnusedWriterResponse = await adminPage.request.delete(`/api/admin/publishing/writers/${unusedWriterId}`)
      expect(deleteUnusedWriterResponse.ok()).toBeTruthy()
      const deleteUnusedWriterResult = await deleteUnusedWriterResponse.json() as AdminPublishingWriterMutationResponse
      expect(deleteUnusedWriterResult.deleted).toBeTruthy()
      const allWritersAfterUnusedDeleteResponse = await adminPage.request.get("/api/admin/publishing/writers?status=all")
      expect(allWritersAfterUnusedDeleteResponse.ok()).toBeTruthy()
      const allWritersAfterUnusedDelete = await allWritersAfterUnusedDeleteResponse.json() as AdminPublishingWritersResponse
      expect(allWritersAfterUnusedDelete.writers.some((entry) => entry.id === unusedWriterId)).toBeFalsy()

      const archiveUsedWriterResponse = await adminPage.request.delete(`/api/admin/publishing/writers/${defaultWriterId}`)
      expect(archiveUsedWriterResponse.ok()).toBeTruthy()
      const archiveUsedWriterResult = await archiveUsedWriterResponse.json() as AdminPublishingWriterMutationResponse
      expect(archiveUsedWriterResult.archived).toBeTruthy()
      expect(archiveUsedWriterResult.writer?.isActive).toBeFalsy()

      const artistAfterArchiveResponse = await artistPage.request.get(`/api/dashboard/publishing?artistId=${artistId}`)
      expect(artistAfterArchiveResponse.ok()).toBeTruthy()
      const artistAfterArchive = await artistAfterArchiveResponse.json() as ArtistPublishingResponse
      expect(artistAfterArchive.writerOptions.map((option) => option.label)).not.toContain(defaultWriterName)

      const restoreUsedWriterResponse = await adminPage.request.post(`/api/admin/publishing/writers/${defaultWriterId}/restore`)
      expect(restoreUsedWriterResponse.ok()).toBeTruthy()
      const restoreUsedWriterResult = await restoreUsedWriterResponse.json() as AdminPublishingWriterMutationResponse
      expect(restoreUsedWriterResult.restored).toBeTruthy()
      expect(restoreUsedWriterResult.writer?.isActive).toBeTruthy()

      const artistAfterRestoreResponse = await artistPage.request.get(`/api/dashboard/publishing?artistId=${artistId}`)
      expect(artistAfterRestoreResponse.ok()).toBeTruthy()
      const artistAfterRestore = await artistAfterRestoreResponse.json() as ArtistPublishingResponse
      expect(artistAfterRestore.writerOptions.map((option) => option.label)).toContain(defaultWriterName)

      const acceptedIds = submitResult.trackIds.slice(0, 2)
      const rejectedId = submitResult.trackIds[2]
      const acceptResponse = await adminPage.request.post("/api/admin/publishing/registrations/review", {
        data: {
          trackIds: acceptedIds,
          action: "accept",
          adminNotes: "Smoke bulk accept",
        },
      })
      expect(acceptResponse.ok()).toBeTruthy()
      expect((await acceptResponse.json() as PublishingRegistrationMutationResponse).updatedCount).toBe(2)

      const rejectResponse = await adminPage.request.post("/api/admin/publishing/registrations/review", {
        data: {
          trackIds: [rejectedId],
          action: "reject",
          adminNotes: "Smoke row reject",
        },
      })
      expect(rejectResponse.ok()).toBeTruthy()
      expect((await rejectResponse.json() as PublishingRegistrationMutationResponse).updatedCount).toBe(1)

      const artistAfterReviewResponse = await artistPage.request.get(`/api/dashboard/publishing?artistId=${artistId}`)
      expect(artistAfterReviewResponse.ok()).toBeTruthy()
      const artistAfterReview = await artistAfterReviewResponse.json() as ArtistPublishingResponse
      expect(artistAfterReview.tracks.filter((track) => acceptedIds.includes(track.id) && track.status === "accepted")).toHaveLength(2)
      expect(artistAfterReview.tracks.find((track) => track.id === rejectedId)?.status).toBe("rejected")
      expect(artistAfterReview.catalogTrackOptions.find((track) => track.value === catalogTrack.trackId)?.registrationStatus).toBe("accepted")

      const scopedWriterId = artistAfterReview.writerOptions.find((option) => option.label === writerNames[0])?.value
      expect(scopedWriterId).toBeTruthy()

      const writerHistoryResponse = await adminPage.request.get(`/api/admin/publishing/registrations?status=accepted&artistId=${artistId}&writerId=${scopedWriterId}`)
      expect(writerHistoryResponse.ok()).toBeTruthy()
      const writerHistory = await writerHistoryResponse.json() as AdminPublishingRegistrationResponse
      expect(writerHistory.tracks.some((track) => track.writers.some((trackWriter) => trackWriter.writerId === scopedWriterId))).toBeTruthy()

      const directAddResponse = await adminPage.request.post("/api/admin/publishing/registrations", {
        data: {
          artistId,
          adminNotes: "Smoke admin direct publishing add",
          tracks: [
            {
              source: "manual",
              songTitle: `Smoke Direct Song One ${suffix}`,
              performerName: artistName,
              spotifyUrl: "https://open.spotify.com/track/directone",
              writers: [writer(writerNames[4], "100", { writerId: globalWriterId })],
            },
            {
              source: "manual",
              songTitle: `Smoke Direct Song Two ${suffix}`,
              performerName: artistName,
              spotifyUrl: "https://open.spotify.com/track/directtwo",
              writers: [writer(writerNames[4], "100", { writerId: globalWriterId })],
            },
          ],
        },
      })
      expect(directAddResponse.ok()).toBeTruthy()
      expect((await directAddResponse.json() as PublishingRegistrationMutationResponse).updatedCount).toBe(2)

      const artistAfterDirectResponse = await artistPage.request.get(`/api/dashboard/publishing?artistId=${artistId}`)
      expect(artistAfterDirectResponse.ok()).toBeTruthy()
      const artistAfterDirect = await artistAfterDirectResponse.json() as ArtistPublishingResponse
      expect(artistAfterDirect.summary.acceptedCount).toBe(4)
      expect(artistAfterDirect.writerOptions.map((option) => option.label)).toContain(writerNames[4])

      expect(await countSmokePublishingEarningsForArtist(artistId)).toBe(0)
      expect(await countSmokeLedgerRowsForArtist(artistId)).toBe(0)

      const periodMonth = "2099-01-01"
      const createCreditResponse = await adminPage.request.post("/api/admin/publishing", {
        data: {
          artistId,
          releaseId,
          amount: "1.25",
          periodMonth,
          notes: "Smoke publishing credit create",
        },
      })
      expect(createCreditResponse.ok()).toBeTruthy()
      const createdCredit = await createCreditResponse.json() as AdminPublishingMutationResponse
      expect(createdCredit.entryId).toBeTruthy()
      expect(await countSmokePublishingEarningsForArtist(artistId)).toBe(1)
      expect(await countSmokeLedgerRowsForArtist(artistId)).toBeGreaterThan(0)

      const updateCreditResponse = await adminPage.request.patch(`/api/admin/publishing/${createdCredit.entryId}`, {
        data: {
          releaseId,
          amount: "2.50",
          periodMonth,
          notes: "Smoke publishing credit update",
        },
      })
      expect(updateCreditResponse.ok()).toBeTruthy()

      const deleteCreditResponse = await adminPage.request.delete(`/api/admin/publishing/${createdCredit.entryId}`)
      expect(deleteCreditResponse.ok()).toBeTruthy()
      expect(await countSmokePublishingEarningsForArtist(artistId)).toBe(0)
    } finally {
      if (artistId) {
        await deleteSmokePublishingRegistrationsForArtist(artistId).catch(() => undefined)
        await purgeSmokeArtistWithRpc(artistId).catch(() => undefined)
      }

      if (secondArtistId) {
        await deleteSmokePublishingRegistrationsForArtist(secondArtistId).catch(() => undefined)
        await purgeSmokeArtistWithRpc(secondArtistId).catch(() => undefined)
      }

      await deleteSmokePublishingWritersByNames(writerNames).catch(() => undefined)
      await artistContext?.close().catch(() => undefined)
      await adminContext?.close().catch(() => undefined)
    }
  })
})
