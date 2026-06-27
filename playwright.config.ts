import { defineConfig, devices } from "@playwright/test";

// Playwright e2e (POLISH U4). Runs the PRECOMPILED production server (fast, no per-route dev compile)
// with DEMO_MODE=1 so /api/simulate is enabled, then drives the real core flow in a real browser.
// `npm run test:e2e` builds first so it's self-contained. Deterministic: globalSetup reseeds the ledger
// and we rely on Playwright's auto-waiting (no fixed sleeps) for the 2s poll.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm start",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DEMO_MODE: "1" },
  },
});
