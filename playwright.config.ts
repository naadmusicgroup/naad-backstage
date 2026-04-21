import { defineConfig } from "@playwright/test"
import { readEnv } from "./tests/smoke/support/env"

const defaultSmokeBaseURL = "http://localhost:3100"
const baseURL = readEnv("SMOKE_BASE_URL") || defaultSmokeBaseURL
const shouldStartDevServer = !readEnv("SMOKE_BASE_URL")

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: shouldStartDevServer
    ? {
        command: "node ./node_modules/nuxt/bin/nuxt.mjs dev --port 3100",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120000,
      }
    : undefined,
})
