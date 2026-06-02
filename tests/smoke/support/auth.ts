import { expect, type Page } from "@playwright/test"

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export async function signInWithPassword(
  page: Page,
  email: string,
  password: string,
  expectedPathPrefix: string,
  options?: { adminMfa?: boolean },
) {
  void options

  await page.goto("/login")
  await expect(page.getByRole("heading", { name: /^(?:Welcome back|Log in(?: to Naad Backstage)?)$/ })).toBeVisible()
  await page.waitForLoadState("networkidle")

  const emailInput = page.getByRole("textbox", { name: "Email" })
  const passwordInput = page.getByRole("textbox", { name: "Password" })

  await emailInput.fill(email)
  await expect(emailInput).toHaveValue(email)

  await passwordInput.fill(password)
  await expect(passwordInput).toHaveValue(password)

  await page.getByRole("button", { name: /^(?:Sign in|Sign in with password)$/ }).click()
  await page.waitForURL(new RegExp(escapeForRegex(expectedPathPrefix)))
  await page.waitForLoadState("networkidle")
}

export async function verifyAdminPassword(page: Page, password: string, action = "admin.high_risk") {
  const response = await page.request.post("/api/admin/security/verify", {
    data: {
      action,
      password,
    },
  })

  expect(response.ok()).toBeTruthy()
  return response
}

export async function confirmAdminDialog(page: Page, options: {
  buttonName: string | RegExp
  password: string
  requiredText?: string
}) {
  const dialog = page.getByRole("alertdialog")
  await expect(dialog).toBeVisible()

  if (options.requiredText) {
    await dialog.getByLabel(new RegExp(`Type ${escapeForRegex(options.requiredText)} to confirm`)).fill(options.requiredText)
  }

  await dialog.getByLabel("Admin password").fill(options.password)
  await dialog.getByRole("button", { name: options.buttonName, exact: typeof options.buttonName === "string" }).click()
}
