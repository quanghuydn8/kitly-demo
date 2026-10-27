// Every e2e file imports Playwright through here (one place to swap the runner).
export { expect, test } from "@playwright/test";
export type { BrowserContext, Locator, Page, PlaywrightTestConfig, TestInfo } from "@playwright/test";
