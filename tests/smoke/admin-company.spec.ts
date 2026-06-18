import { expect, test, type APIResponse } from "@playwright/test"
import { signInWithPassword, verifyAdminPassword } from "./support/auth"
import { readEnv } from "./support/env"
import type {
  CompanyAnalyticsResponse,
  CompanyAttachmentUploadTargetResponse,
  CompanyBankDetailsMutationResponse,
  CompanyCurrency,
  CompanyFinanceResponse,
  CompanyTransactionMutationResponse,
  CompanyTransactionType,
} from "../../types/company"

function companyQuery(params: Record<string, string>) {
  return `/api/admin/company?${new URLSearchParams(params).toString()}`
}

function companyExportQuery(params: Record<string, string>) {
  return `/api/admin/company/export?${new URLSearchParams(params).toString()}`
}

async function expectOk(response: APIResponse, label: string) {
  if (response.ok()) {
    return
  }

  const body = await response.text()
  expect(response.ok(), `${label} failed with ${response.status()} ${response.statusText()}: ${body}`).toBeTruthy()
}

test.describe("admin company finance suite", () => {
  test.setTimeout(180000)

  test("admin records USD and NPR company ledger transactions with pagination, export, and analytics", async ({ page }) => {
    const suffix = `${Date.now()}-${Math.round(Math.random() * 1000)}`
    const adminEmail = readEnv("SMOKE_ADMIN_EMAIL")
    const adminPassword = readEnv("SMOKE_ADMIN_PASSWORD")
    const transactionIds: string[] = []

    const unauthenticatedResponse = await page.request.get(companyQuery({ currency: "USD" }))
    expect([401, 403]).toContain(unauthenticatedResponse.status())

    await signInWithPassword(page, adminEmail, adminPassword, "/admin", { adminMfa: true })

    const blockedCreateResponse = await page.request.post("/api/admin/company", {
      data: {
        currency: "USD",
        transactionType: "income",
        transactionDate: "2026-04-01",
        name: `Smoke blocked company transaction ${suffix}`,
        amount: "10.00",
        category: "Smoke income",
        vendorPayee: `Smoke vendor ${suffix}`,
        paymentMethod: "bank_transfer",
        referenceNumber: `REF-${suffix}`,
        status: "recorded",
        note: "Blocked verification smoke check",
      },
    })
    expect(blockedCreateResponse.status()).toBe(403)

    const wrongPasswordResponse = await page.request.post("/api/admin/security/verify", {
      data: {
        action: "company_transaction.created",
        password: "definitely-not-the-admin-password",
      },
    })
    expect(wrongPasswordResponse.status()).toBe(401)

    await verifyAdminPassword(page, adminPassword, "company_transaction.created")
    await verifyAdminPassword(page, adminPassword, "company_bank_details.updated")

    async function saveBankDetails(input: {
      currency: CompanyCurrency
      bankName: string
      accountNumber: string
      bankAddress?: string
      routingAba?: string
      swiftCode?: string
      accountType?: string
      accountName?: string
      beneficiaryName?: string
      branchName?: string
    }) {
      const response = await page.request.put("/api/admin/company/bank-details", {
        data: {
          currency: input.currency,
          bankName: input.bankName,
          bankAddress: input.bankAddress ?? null,
          routingAba: input.routingAba ?? null,
          swiftCode: input.swiftCode ?? null,
          accountNumber: input.accountNumber,
          accountType: input.accountType ?? null,
          accountName: input.accountName ?? null,
          beneficiaryName: input.beneficiaryName ?? null,
          branchName: input.branchName ?? null,
        },
      })
      await expectOk(response, `Save ${input.currency} company bank details`)

      const payload = await response.json() as CompanyBankDetailsMutationResponse
      expect(payload.bankDetails).toMatchObject({
        currency: input.currency,
        bankName: input.bankName,
        accountNumber: input.accountNumber,
      })

      return payload.bankDetails
    }

    const usdBankDetails = await saveBankDetails({
      currency: "USD",
      bankName: `Smoke USD Bank ${suffix}`,
      bankAddress: "123 Smoke Street, New York, NY",
      routingAba: "021000021",
      swiftCode: "CHASUS33",
      accountNumber: `USD-${suffix}`,
      accountType: "Checking",
      beneficiaryName: "Naad Studios LLC",
    })
    const nprBankDetails = await saveBankDetails({
      currency: "NPR",
      bankName: `Smoke NPR Bank ${suffix}`,
      accountNumber: `NPR-${suffix}`,
      accountName: "Naad Studios Pvt. Ltd.",
      branchName: "Kathmandu",
      swiftCode: "NIBLNPKT",
    })

    async function createTransaction(input: {
      currency: CompanyCurrency
      name: string
      transactionType: CompanyTransactionType
      date: string
      amount: string
      category: string
      status?: "recorded" | "pending" | "reconciled" | "flagged"
    }) {
      const response = await page.request.post("/api/admin/company", {
        data: {
          currency: input.currency,
          transactionType: input.transactionType,
          transactionDate: input.date,
          name: input.name,
          amount: input.amount,
          category: input.category,
          vendorPayee: `Smoke vendor ${suffix}`,
          paymentMethod: "bank_transfer",
          referenceNumber: `REF-${suffix}`,
          status: input.status ?? "recorded",
          note: `Smoke company ledger ${suffix}`,
        },
      })
      await expectOk(response, `Create ${input.currency} company transaction`)

      const payload = await response.json() as CompanyTransactionMutationResponse
      transactionIds.push(payload.transaction.id)
      expect(payload.transaction).toMatchObject({
        currency: input.currency,
        name: input.name,
      })
      expect((payload.transaction as any).bankAccountId).toBeUndefined()

      return payload.transaction
    }

    try {
      const usdNames: string[] = []

      for (let index = 0; index < 21; index += 1) {
        const year = index < 10 ? "2026" : "2025"
        const day = String((index % 20) + 1).padStart(2, "0")
        const name = `Smoke Company USD ${suffix} ${String(index + 1).padStart(2, "0")}`
        usdNames.push(name)
        await createTransaction({
          currency: "USD",
          name,
          transactionType: index % 5 === 0 ? "income" : "expense",
          date: `${year}-04-${day}`,
          amount: `${(index + 1) * 3}.25`,
          category: index % 5 === 0 ? "Smoke income" : "Smoke expense",
          status: index === 3 ? "flagged" : "recorded",
        })
      }

      const nprTransaction = await createTransaction({
        currency: "NPR",
        name: `Smoke Company NPR ${suffix}`,
        transactionType: "expense",
        date: "2026-05-10",
        amount: "2500.00",
        category: "Smoke NPR expense",
        status: "pending",
      })

      const attachmentResponse = await page.request.post(`/api/admin/company/${nprTransaction.id}/attachments`, {
        data: {
          filename: `smoke-receipt-${suffix}.pdf`,
          fileSize: 512,
          contentType: "application/pdf",
        },
      })
      await expectOk(attachmentResponse, "Create company attachment metadata")
      const attachment = await attachmentResponse.json() as CompanyAttachmentUploadTargetResponse
      const attachmentFolder = `2026-05-10-Smoke Company NPR ${suffix}`
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig
      expect(attachment).toMatchObject({
        transactionId: nprTransaction.id,
        filename: `smoke-receipt-${suffix}.pdf`,
        contentType: "application/pdf",
        uploadMethod: "s3-presigned-put",
      })
      const attachmentPathUuidMatches = [...attachment.path.matchAll(uuidPattern)].map((match) => match[0])
      expect(new Set(attachmentPathUuidMatches)).toEqual(new Set([nprTransaction.id]))
      expect(attachment.path).toContain(`Transactions-doc/NPR/2026/05-May/${attachmentFolder}/`)
      expect(attachment.path).toContain(`Smoke Company NPR ${suffix}-${nprTransaction.id}-receipt-`)
      expect(attachment.path).toMatch(/-receipt-\d{4}-\d{2}-\d{2}-\d{6}-\d{3}\.pdf$/)

      const firstPageResponse = await page.request.get(companyQuery({
        currency: "USD",
        search: suffix,
        page: "1",
        pageSize: "20",
      }))
      await expectOk(firstPageResponse, "Load first USD company transaction page")
      const firstPage = await firstPageResponse.json() as CompanyFinanceResponse
      expect(firstPage.pagination).toMatchObject({
        page: 1,
        pageSize: 20,
        totalCount: 21,
        totalPages: 2,
        hasNextPage: true,
      })
      expect(firstPage.summary.availableBalance).toBe(firstPage.summary.netCashFlow)
      expect(firstPage.transactions).toHaveLength(20)
      expect(firstPage.years).toEqual(expect.arrayContaining([2025, 2026]))
      expect(firstPage.bankDetails).toMatchObject({
        bankName: usdBankDetails.bankName,
        accountNumber: usdBankDetails.accountNumber,
        routingAba: "021000021",
      })
      expect((firstPage.transactions[0] as any).bankAccountName).toBeUndefined()

      const secondPageResponse = await page.request.get(companyQuery({
        currency: "USD",
        search: suffix,
        page: "2",
        pageSize: "20",
      }))
      await expectOk(secondPageResponse, "Load second USD company transaction page")
      const secondPage = await secondPageResponse.json() as CompanyFinanceResponse
      expect(secondPage.pagination.hasPreviousPage).toBe(true)
      expect(secondPage.transactions).toHaveLength(1)

      const nprResponse = await page.request.get(companyQuery({
        currency: "NPR",
        search: suffix,
        page: "1",
        pageSize: "20",
      }))
      await expectOk(nprResponse, "Load NPR company transaction page")
      const nprPage = await nprResponse.json() as CompanyFinanceResponse
      expect(nprPage.pagination.totalCount).toBe(1)
      expect(nprPage.transactions[0]?.attachments).toHaveLength(1)
      expect(nprPage.bankDetails).toMatchObject({
        bankName: nprBankDetails.bankName,
        accountName: nprBankDetails.accountName,
        branchName: "Kathmandu",
      })

      const exportResponse = await page.request.get(companyExportQuery({
        currency: "USD",
        search: suffix,
        dateFrom: "2025-01-01",
        dateTo: "2026-12-31",
      }))
      await expectOk(exportResponse, "Export company CSV")
      expect(exportResponse.headers()["content-disposition"] ?? "").toContain("company-usd-transactions-2025-01-01-to-2026-12-31.csv")
      const csv = await exportResponse.text()
      expect(csv).toContain("Date,Year,Currency,Type,Name,Amount,Category")
      expect(csv).toContain("Attachment links")
      expect(csv).not.toContain("Bank account")
      expect(csv).toContain(usdNames[0])

      const nprExportResponse = await page.request.get(companyExportQuery({
        currency: "NPR",
        search: suffix,
        dateFrom: "2026-01-01",
        dateTo: "2026-12-31",
      }))
      await expectOk(nprExportResponse, "Export NPR company CSV")
      const nprCsv = await nprExportResponse.text()
      const s3PublicBaseUrl = readEnv("S3_PUBLIC_BASE_URL").replace(/\/+$/, "")
      expect(nprCsv).toContain("Attachment links")
      expect(nprCsv).toContain(`${s3PublicBaseUrl}/Transactions-doc/NPR/2026/05-May/${encodeURIComponent(attachmentFolder)}/`)

      const analyticsResponse = await page.request.get("/api/admin/company/analytics")
      await expectOk(analyticsResponse, "Load company analytics")
      const analytics = await analyticsResponse.json() as CompanyAnalyticsResponse
      expect(analytics.summaryByCurrency.USD.transactionCount).toBeGreaterThanOrEqual(21)
      expect(analytics.summaryByCurrency.NPR.transactionCount).toBeGreaterThanOrEqual(1)
      expect(analytics.bankDetailsByCurrency.USD?.bankName).toBe(usdBankDetails.bankName)
      expect(analytics.bankDetailsByCurrency.NPR?.bankName).toBe(nprBankDetails.bankName)
      expect(analytics.monthly.some((row) => row.currency === "USD" && row.month === "2026-04")).toBe(true)
      expect(analytics.monthly.some((row) => row.currency === "NPR" && row.month === "2026-05")).toBe(true)
      expect(analytics.reviewTransactions.length).toBeGreaterThanOrEqual(1)

      await page.goto("/admin/company")
      await expect(page.getByRole("heading", { name: "Company" })).toBeVisible()
      await expect(page.getByRole("tab", { name: /USD Transactions/ })).toBeVisible()
      await expect(page.getByRole("tab", { name: /Bank Accounts/ })).toHaveCount(0)
      await expect(page.getByText("Available balance")).toBeVisible()
      await expect(page.getByText(usdBankDetails.bankName)).toBeVisible()
      await expect(page.getByRole("button", { name: "Edit USD bank details" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Copy USD bank details" })).toBeVisible()
      await expect(page.getByRole("columnheader", { name: "Vendor / Payee" })).toBeVisible()
      await expect(page.getByRole("button", { name: /Add income/i })).toBeVisible()
      await expect(page.getByRole("button", { name: /Add expense/i })).toBeVisible()
      await page.getByLabel("Search").fill(suffix)
      await expect(page.getByText(`${suffix} 01`)).toBeVisible()
      await expect(page.getByText("2026 year")).toBeVisible()
      await expect(page.getByText("2025 year")).toBeVisible()

      const nprTab = page.getByRole("tab", { name: /NPR Transactions/ })
      await nprTab.click()
      await expect(nprTab).toHaveAttribute("aria-selected", "true")
      await page.getByLabel("Search").fill(suffix)
      await expect(page.getByText(nprBankDetails.bankName)).toBeVisible()
      await expect(page.getByText(`Smoke Company NPR ${suffix}`)).toBeVisible({ timeout: 15000 })
      await page.getByRole("button", { name: /1 file/i }).click()
      const transactionDialog = page.getByRole("dialog")
      await expect(transactionDialog.getByRole("button", { name: "View" })).toBeVisible()
      await expect(transactionDialog.getByRole("button", { name: "Download" })).toBeVisible()
      await transactionDialog.getByRole("button", { name: "Close" }).first().click()

      await page.getByRole("tab", { name: /Analytics/ }).click()
      await expect(page.getByText("Cash flow by currency")).toBeVisible()
      await expect(page.getByText("Expense categories")).toBeVisible()
      await expect(page.getByText("Review health")).toBeVisible()
    } finally {
      await verifyAdminPassword(page, adminPassword, "company_transaction.deleted").catch(() => undefined)

      for (const transactionId of transactionIds) {
        await page.request.delete(`/api/admin/company/${transactionId}`).catch(() => undefined)
      }
    }
  })
})
