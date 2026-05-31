import { expect, test } from "@playwright/test"
import { signInWithPassword } from "./support/auth"
import { readEnv } from "./support/env"
import {
  countSmokeDuesById,
  countSmokeLedgerRowsForReference,
  countSmokeManualPayoutLedgerRows,
  countSmokePayoutRequests,
  ensureSmokeArtist,
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

      const payoutsResponse = await page.request.get("/api/admin/payouts")
      expect(payoutsResponse.ok()).toBeTruthy()
      const payoutsPayload = await payoutsResponse.json() as AdminPayoutsResponse
      const manualPayout = payoutsPayload.requests.find((request) => request.id === requestId)
      expect(manualPayout).toMatchObject({
        id: requestId,
        isManualPayout: true,
        canReverse: true,
        paymentReference,
        serviceCharge: "0.75000000",
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
        amount: "3.25000000",
        serviceCharge: "0.75000000",
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
})
