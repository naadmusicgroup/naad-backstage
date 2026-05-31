import { expect, test } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  countSmokeDuesById,
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
      expect(createResult.serviceChargeDueId).toBeTruthy()
      expect(createResult.serviceChargeLedgerEntryId).toBeTruthy()
      expect(await countSmokePayoutRequests(requestId)).toBe(1)
      expect(await countSmokeLedgerRowsForReference(requestId)).toBe(1)
      expect(await countSmokeManualPayoutLedgerRows(requestId)).toBe(2)
      expect(await countSmokeDuesById(createResult.serviceChargeDueId ?? "")).toBe(1)

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
      expect(updateResult.serviceChargeDueId).toBe(createResult.serviceChargeDueId)
      expect(await countSmokePayoutRequests(requestId)).toBe(1)
      expect(await countSmokeLedgerRowsForReference(requestId)).toBe(1)
      expect(await countSmokeManualPayoutLedgerRows(requestId)).toBe(2)

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
      expect(await countSmokeDuesById(createResult.serviceChargeDueId ?? "")).toBe(0)
      requestId = ""
    } finally {
      if (requestId && await countSmokePayoutRequests(requestId)) {
        await page.request.post(`/api/admin/payouts/${requestId}/reverse-manual`, {
          data: {
            adminNotes: "Smoke cleanup reversal",
          },
        }).catch(() => undefined)
      }

      if (artistId) {
        await page.request.post("/api/admin/artists/bulk-permanent-delete", {
          data: {
            artistIds: [artistId],
          },
        }).catch(() => undefined)
      }
    }
  })

  test("admin can edit a standard payout amount and service charge", async ({ page }) => {
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
        },
      })
      expect(updateResponse.ok()).toBeTruthy()

      const updateResult = await updateResponse.json() as PayoutMutationResponse
      expect(updateResult).toMatchObject({
        requestId,
        status: "pending",
        amount: "11.50000000",
        serviceCharge: "0.50000000",
      })
      expect(updateResult.serviceChargeDueId).toBeTruthy()
      expect(updateResult.serviceChargeLedgerEntryId).toBeTruthy()
      expect(await countSmokePayoutFinancialLedgerRows(requestId)).toBe(2)
      expect(await countSmokeDuesById(updateResult.serviceChargeDueId ?? "")).toBe(1)

      const payoutsResponse = await page.request.get("/api/admin/payouts")
      expect(payoutsResponse.ok()).toBeTruthy()
      const payoutsPayload = await payoutsResponse.json() as AdminPayoutsResponse
      const payout = payoutsPayload.requests.find((request) => request.id === requestId)
      expect(payout).toMatchObject({
        id: requestId,
        amount: "11.50000000",
        serviceCharge: "0.50000000",
        isManualPayout: false,
      })
    } finally {
      if (artistId) {
        await page.request.post("/api/admin/artists/bulk-permanent-delete", {
          data: {
            artistIds: [artistId],
          },
        }).catch(() => undefined)
      }
    }
  })
})
