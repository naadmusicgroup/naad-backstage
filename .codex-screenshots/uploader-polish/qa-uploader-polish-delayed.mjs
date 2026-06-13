import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

function parseEnvFile(content) {
  const values = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

const envPath = path.resolve(process.cwd(), ".env");
const localEnv = fs.existsSync(envPath) ? parseEnvFile(fs.readFileSync(envPath, "utf8")) : {};
const readEnv = (name, fallback = "") => process.env[name] ?? localEnv[name] ?? fallback;
const baseURL = readEnv("SMOKE_BASE_URL", "http://127.0.0.1:3000") || "http://127.0.0.1:3000";
const email = readEnv("SMOKE_ARTIST_EMAIL", "smoke-artist@naad-backstage.local");
const password = readEnv("SMOKE_ARTIST_PASSWORD", "SmokeArtist123!");
const shotDir = path.resolve(process.cwd(), ".codex-screenshots/uploader-polish");
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(60_000);

await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 90_000 });
await expect(page.getByRole("heading", { name: /^(?:Welcome back|Log in(?: to Naad Backstage)?)$/ })).toBeVisible();
await page.getByRole("textbox", { name: "Email" }).fill(email);
await page.getByRole("textbox", { name: "Password" }).fill(password);
await page.getByRole("button", { name: /^(?:Sign in|Sign in with password)$/ }).click();
await page.waitForURL(/\/dashboard/, { waitUntil: "commit", timeout: 90_000 });

await page.goto("/dashboard/uploaded", { waitUntil: "domcontentloaded", timeout: 90_000 });
await expect(page.getByRole("heading", { name: "Uploader", level: 1 })).toBeVisible();
await expect(page.getByText("Release desk", { exact: true })).toBeVisible();

const titleInput = page.locator("#upload-title");
if (await titleInput.count() === 1) {`n  await titleInput.fill("");`n}`nawait page.waitForTimeout(2500);
const continueButton = page.getByRole("button", { name: "Continue", exact: true });
await continueButton.click();
await page.waitForTimeout(1000);
const dialogVisible = await page.getByRole("dialog").isVisible().catch(() => false);
const dialogText = dialogVisible ? await page.getByRole("dialog").innerText().catch(() => "") : "";
if (dialogVisible) {
  await page.screenshot({ path: path.join(shotDir, "desktop-title-dialog.png"), fullPage: true });
  const cancel = page.getByRole("button", { name: "Cancel", exact: true });
  if (await cancel.count() === 1) await cancel.click();
  await page.waitForTimeout(300);
}

const desktopMetrics = await page.evaluate(() => {
  const bodyText = document.body.innerText;
  const rail = document.querySelector(".uploader-step-rail");
  const help = document.querySelector(".uploader-help-panel");
  const active = document.querySelector(".uploader-step-tab.active .step-tab-label");
  return {
    activeStep: active?.textContent?.trim() ?? "",
    confirmedSteps: document.querySelectorAll(".uploader-step-tab.complete").length,
    hasReleaseDesk: bodyText.includes("Release desk"),
    hasNextAction: bodyText.includes("Next action"),
    hasReadiness: bodyText.includes("Package readiness"),
    hasUnsupportedNewArtistButton: bodyText.includes("New Artist"),
    hasLegacyCopy: /(Spotify|Instagram|Meta story|waveform|glass cockpit|At least one Primary Artist|Type in the release title)/i.test(bodyText),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    helpVisible: !!help && getComputedStyle(help).display !== "none",
    railScrollbarWidth: rail ? getComputedStyle(rail).scrollbarWidth : "",
  };
});
await page.screenshot({ path: path.join(shotDir, "desktop-basic.png"), fullPage: true });

await page.setViewportSize({ width: 390, height: 844 });
await page.goto("/dashboard/uploaded", { waitUntil: "domcontentloaded", timeout: 90_000 });
await expect(page.getByRole("heading", { name: "Uploader", level: 1 })).toBeVisible();
const mobileMetrics = await page.evaluate(() => {
  const rail = document.querySelector(".uploader-step-rail");
  const help = document.querySelector(".uploader-help-panel");
  return {
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    railScrollbarWidth: rail ? getComputedStyle(rail).scrollbarWidth : "",
    helpVisible: !!help && getComputedStyle(help).display !== "none",
    actionButtonsFit: Array.from(document.querySelectorAll(".uploader-step-actions .wizard-button")).every((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width <= document.documentElement.clientWidth;
    }),
  };
});
await page.screenshot({ path: path.join(shotDir, "mobile-basic.png"), fullPage: true });

console.log(JSON.stringify({ dialogVisible, dialogText, desktopMetrics, mobileMetrics, screenshots: [path.join(shotDir, "desktop-basic.png"), path.join(shotDir, "desktop-title-dialog.png"), path.join(shotDir, "mobile-basic.png")] }, null, 2));
await browser.close();

