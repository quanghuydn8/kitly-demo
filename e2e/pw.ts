// @ts-nocheck — @playwright/test is not a declared dependency yet (BLOCKERS.md T14). Every e2e file imports
// Playwright through here so `next build` (which type-checks **/*.ts) still passes on a clean `npm ci`.
// Once Lane 1 adds the devDependency: delete this comment line and the `@ts-nocheck`.
export { expect, test } from "@playwright/test";
export type { BrowserContext, Locator, Page, PlaywrightTestConfig, TestInfo } from "@playwright/test";
