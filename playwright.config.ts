import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;
const authTokenFile = process.env.PLAYWRIGHT_AUTH_TOKEN_FILE;
const extraHTTPHeaders = authTokenFile
  ? { Authorization: `Bearer ${readFileSync(authTokenFile, "utf8").trim()}` }
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    extraHTTPHeaders,
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-webkit",
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: externalBaseURL
    ? undefined
    : {
        command: `bun run dev:web --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
