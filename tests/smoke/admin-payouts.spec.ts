import { expect, test } from "@playwright/test"
import { signInWithPassword, verifyAdminPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  countSmokeLedgerRowsForReference,
  countSmokePayoutFinancialLedgerRows,
  countSmokeManualPayoutLedgerRows,
  countSmokePayoutRequests,
  ensureSmokeArtist,
  insertSmokePayoutRequest,
} from "./support/supabase"
import type {
  AdminPayoutsResponse,
  PayoutMutationResponse,
  ReverseAdminManualPayoutResponse,
} from "../../types/payouts"

test.describe("admin payouts", () => {
  test.setTimeout(120000)

  test("admin can reverse a manual payout and restore the ledger", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const paymentReference = `smoke-manual-reverse-${suffix}`
    let artistId = ""
    let requestId = ""

    const smokeArtist = await ensureSmokeArtist({
      email: `smoke-manual-reverse-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Manual Reverse ${suffix}`,
      stageName: `Smoke Manual Reverse ${suffix}`,
      country: "Nepal",
      bio: "Manual payout reversal smoke test",
    })
    artistId = smokeArtist.artistId

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

    try {
      const blockedResponse = await page.request.post("/api/admin/payouts/manual", {
        data: {
          artistId,
          amount: "3.25",
          paidAt: new Date(Date.now() - 120_000).toISOString(),
          paymentMethod: "bank_transfer",
          paymentReference,
        },
      })
      expect(blockedResponse.status()).toBe(403)

      const wrongPasswordResponse = await page.request.post("/api/admin/security/verify", {
        data: {
          action: "payout.manual_paid",
          password: "definitely-not-the-password",
        },
      })
      expect(wrongPasswordResponse.status()).toBe(401)

      const stillBlockedResponse = await page.request.post("/api/admin/payouts/manual", {
        data: {
          artistId,
          amount: "3.25",
          paidAt: new Date(Date.now() - 120_000).toISOString(),
          paymentMethod: "bank_transfer",
          paymentReference,
        },
      })
      expect(stillBlockedResponse.status()).toBe(403)

      await verifyAdminPassword(page, adminPassword, "payout.manual_paid")

      const createResponse = await page.request.post("/api/admin/payouts/manual", {
        data: {
          artistId,
          amount: "3.25",
          serviceCharge: "0.75",
          paidAt: new Date(Date.now() - 120_000).toISOString(),
          paymentMethod: "bank_transfer",
          paymentReference,
          adminNotes: "Manual payout reversal smoke test",
        },
      })
      expect(createResponse.ok()).toBeTruthy()

      const createResult = await createResponse.json() as PayoutMutationResponse
      requestId = createResult.requestId
      expect(createResult.status).toBe("paid")
      expect(createResult.serviceCharge).toBe("0.75000000")
      expect(await countSmokePayoutRequests(requestId)).toBe(1)
      expect(await countSmokeLedgerRowsForReference(requestId)).toBe(1)
      expect(await countSmokeManualPayoutLedgerRows(requestId)).toBe(1)

      const updateResponse = await page.request.patch(`/api/admin/payouts/${requestId}/financials`, {
        data: {
          amount: "4.25",
          serviceCharge: "1.25",
        },
      })
      expect(updateResponse.ok()).toBeTruthy()

      const updateResult = await updateResponse.json() as PayoutMutationResponse
      expect(updateResult).toMatchObject({
        requestId,
        status: "paid",
        amount: "4.25000000",
        serviceCharge: "1.25000000",
      })
      expect(await countSmokePayoutRequests(requestId)).toBe(1)
      expect(await countSmokeLedgerRowsForReference(requestId)).toBe(1)
      expect(await countSmokeManualPayoutLedgerRows(requestId)).toBe(1)

      const payoutsResponse = await page.request.get("/api/admin/payouts")
      expect(payoutsResponse.ok()).toBeTruthy()
      const payoutsPayload = await payoutsResponse.json() as AdminPayoutsResponse
      const manualPayout = payoutsPayload.requests.find((request) => request.id === requestId)
      expect(manualPayout).toMatchObject({
        id: requestId,
        amount: "4.25000000",
        isManualPayout: true,
        canReverse: true,
        paymentReference,
        serviceCharge: "1.25000000",
      })

      const reverseResponse = await page.request.post(`/api/admin/payouts/${requestId}/reverse-manual`, {
        data: {
          adminNotes: "Smoke test reversal",
        },
      })
      expect(reverseResponse.ok()).toBeTruthy()

      const reverseResult = await reverseResponse.json() as ReverseAdminManualPayoutResponse
      expect(reverseResult).toMatchObject({
        requestId,
        artistId,
        amount: "4.25000000",
        serviceCharge: "1.25000000",
      })
      expect(await countSmokePayoutRequests(requestId)).toBe(0)
      expect(await countSmokeLedgerRowsForReference(requestId)).toBe(0)
      expect(await countSmokeManualPayoutLedgerRows(requestId)).toBe(0)
      requestId = ""
    } finally {
      if (requestId && await countSmokePayoutRequests(requestId)) {
        await verifyAdminPassword(page, adminPassword, "payout.manual_reversed").catch(() => undefined)
        await page.request.post(`/api/admin/payouts/${requestId}/reverse-manual`, {
          data: {
            adminNotes: "Smoke cleanup reversal",
          },
        }).catch(() => undefined)
      }

      if (artistId) {
        await verifyAdminPassword(page, adminPassword, "artist.bulk_permanently_deleted").catch(() => undefined)
        await page.request.post("/api/admin/artists/bulk-permanent-delete", {
          data: {
            artistIds: [artistId],
          },
        }).catch(() => undefined)
      }
    }
  })

  test("admin can edit a standard payout amount and display-only fees", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    let artistId = ""
    let requestId = ""

    const smokeArtist = await ensureSmokeArtist({
      email: `smoke-payout-financials-${suffix}@naad-backstage.local`,
      password: "SmokeArtist123!",
      fullName: `Smoke Payout Financials ${suffix}`,
      stageName: `Smoke Payout Financials ${suffix}`,
      country: "Nepal",
      bio: "Payout financial edit smoke test",
    })
    artistId = smokeArtist.artistId

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })
    await verifyAdminPassword(page, adminPassword, "payout.financials_updated")

    try {
      requestId = await insertSmokePayoutRequest({
        requestedBy: smokeArtist.userId,
        artistId,
        amount: "10.00",
      })

      const updateResponse = await page.request.patch(`/api/admin/payouts/${requestId}/financials`, {
        data: {
          amount: "11.50",
          serviceCharge: "0.50",
          bankChargePct: "2.50",
        },
      })
      expect(updateResponse.ok()).toBeTruthy()

      const updateResult = await updateResponse.json() as PayoutMutationResponse
      expect(updateResult).toMatchObject({
        requestId,
        status: "pending",
        amount: "11.50000000",
        serviceCharge: "0.50000000",
        bankChargePct: "2.50",
      })
      expect(await countSmokePayoutFinancialLedgerRows(requestId)).toBe(1)

      const payoutsResponse = await page.request.get("/api/admin/payouts")
      expect(payoutsResponse.ok()).toBeTruthy()
      const payoutsPayload = await payoutsResponse.json() as AdminPayoutsResponse
      const payout = payoutsPayload.requests.find((request) => request.id === requestId)
      expect(payout).toMatchObject({
        id: requestId,
        amount: "11.50000000",
        serviceCharge: "0.50000000",
        bankChargePct: "2.50",
        isManualPayout: false,
      })
    } finally {
      if (artistId) {
        await verifyAdminPassword(page, adminPassword, "artist.bulk_permanently_deleted").catch(() => undefined)
        await page.request.post("/api/admin/artists/bulk-permanent-delete", {
          data: {
            artistIds: [artistId],
          },
        }).catch(() => undefined)
      }
    }
  })
})
