// Playwright e2e of the DEMO.md script (seam S7) against a running app: BASE_URL, real DB, real LLM.
// Run: BASE_URL=http://localhost:3012 npx playwright test -c e2e/playwright.config.ts   (npm run e2e once wired)
import type { PlaywrightTestConfig } from "./pw";

const config: PlaywrightTestConfig = {
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "artifacts", // e2e/artifacts/ — gitignored
  timeout: 12 * 60_000, // the whole demo: 3 kit runs + 1 refine + 3 cold insights loads, LLM via proxy
  expect: { timeout: 30_000 },
  retries: 1,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3012",
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
};

export default config;
