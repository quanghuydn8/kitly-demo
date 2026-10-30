import { defineConfig } from "@playwright/test";

// e2e runs against a running app: BASE_URL (default local dev on PORT 3011).
// When the deployment sits behind Basic Auth, KITLY_BASIC_AUTH=user:pass is passed as httpCredentials.
const basic = process.env.KITLY_BASIC_AUTH;
const [username, password] = basic ? basic.split(":") : [];

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/artifacts",
  timeout: 120_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3011",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    ...(basic ? { httpCredentials: { username, password } } : {}),
  },
});
