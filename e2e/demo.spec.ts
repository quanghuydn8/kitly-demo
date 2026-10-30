// T14 (seam S7): DEMO.md Beats 1–4 + personalisation + reload, against BASE_URL (real DB, real LLM). One browser
// context for the whole demo (the owner cookie keeps the history, the persona cookie the buyer), run in order.
// Asserts every Expect line that the DOM can show; the Beat 3 fix is undone at the end (and in afterAll, should a step
// fail after Apply) so the next run starts clean; the persona cookie is left on Lan.
// Not checkable from the DOM, so not asserted: "Bago Bags absent because of the deadline" is checked as "no Bago Bags in
// any basket"; "the Minh An group has one more item" (the kit has no per-shop groups); exact seeded counts (38/21/52)
// — the seller count is checked as baseline + 1 so the test holds on any seed.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import type { InsightsResponse, PersonaResponse } from "@/contract";
import {
  backpackGap,
  backpackThisWeek,
  HERO_BUDGET,
  HERO_EN,
  MINHAN_BACKPACK,
  MINHAN_SHOP,
  parseVnd,
  slowerThan,
  SPEED_LIMIT_MS,
} from "./support/demo";

/** LLM steps: a kit run is ~10 s on a good day; insights / preview can take a minute on a cold instance. */
const LLM = { timeout: 150_000 };

test.describe.configure({ mode: "serial", retries: 1, timeout: 360_000 });

let context: BrowserContext;
let page: Page;
let baselineCount = 0;
let lanBalanced = 0;
let answerText = "";

const chat = () => page.getByRole("region", { name: "Chat" });
const kit = () => page.getByRole("region", { name: "Kit" });
const composer = () => chat().getByRole("textbox", { name: "Message Kitly" });
const basketLines = () => kit().getByRole("list", { name: "Basket" }).locator(":scope > li");
const tabs = () => kit().getByRole("tablist", { name: "Baskets" }).getByRole("tab");
const versionSelect = () => kit().getByRole("combobox", { name: "Version" });
const lastSuggestions = () => chat().getByRole("group", { name: "Suggestions" }).last();

async function insights(): Promise<InsightsResponse> {
  const res = await page.request.get(`/api/seller/insights?shopId=${MINHAN_SHOP}`, LLM);
  expect(res.ok()).toBe(true);
  return (await res.json()) as InsightsResponse;
}

async function grandTotal(): Promise<number> {
  const text = (await kit().getByRole("region", { name: "Totals" }).textContent()) ?? "";
  const m = text.match(/Grand total\s*(\d[\d.]*\s*₫)/);
  if (!m) throw new Error(`no grand total in "${text}"`);
  return parseVnd(m[1]);
}

/** A run (new kit / refine / answer) is finished when the newest turn's suggestion pills are clickable. */
async function waitForTurnDone(): Promise<void> {
  await expect(lastSuggestions().getByRole("button").first()).toBeEnabled(LLM);
  await expect(composer()).toBeEnabled();
}

async function expectVersion(n: number, of: number): Promise<void> {
  await expect(versionSelect().locator("option:checked")).toHaveText(`Version ${n} of ${of}`, LLM);
}

/** The persona chip in the header ("👤 Lan · …" / "👤 Guest") → pick `name` from its menu. */
async function switchPersona(name: "Lan" | "Guest"): Promise<void> {
  await page.getByRole("button", { name: /^👤 / }).click();
  await page.getByRole("menuitemradio", { name }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^👤 ${name}`) })).toBeVisible();
}

async function newKitFromComposer(text: string): Promise<void> {
  await page.getByRole("link", { name: "New kit" }).first().click();
  await expect(page).toHaveURL(/\/kit\/new/);
  await composer().fill(text);
  await composer().press("Enter");
  await expect(page).toHaveURL(/\/kit\/t\//, LLM);
  await expect(basketLines().first()).toBeVisible(LLM);
  await waitForTurnDone();
}

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  page = await context.newPage();
  // Start as Lan (the persona the demo is told with) and note the seller's count before the Beat 1 query.
  expect((await page.request.post("/api/persona", { data: { id: "lan" } })).ok()).toBe(true);
  baselineCount = backpackThisWeek(await insights());
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await page.screenshot({ path: testInfo.outputPath("failure.png"), fullPage: true }).catch(() => {});
  }
});

test.afterAll(async () => {
  // Leave the DB and the cookie as the demo expects them, even when a step failed after Apply.
  const gap = backpackGap(await insights().catch(() => ({ gaps: [] }) as unknown as InsightsResponse));
  if (gap?.appliedFix) await page.request.post("/api/seller/enrichment/undo", { data: { productId: gap.appliedFix.productId } });
  await page.request.post("/api/persona", { data: { id: "lan" } });
  await context.close();
});

test("Beat 1: need → kit, personalised for Lan, first basket line within the D36 limit", async ({}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^👤 Lan · Cau Giay, Hanoi · 2 vouchers/ })).toBeVisible();
  await page.getByRole("radio", { name: "Describe your need" }).click();
  await page.getByRole("textbox", { name: "Describe your need" }).fill(HERO_EN);

  const started = Date.now();
  await page.getByRole("button", { name: "Build my kit" }).click();
  await expect(chat().getByText("Understanding your need")).toBeVisible(LLM);
  await expect(basketLines().first()).toBeVisible(LLM);
  const elapsed = Date.now() - started;
  const speed = `Run → first basket line: ${(elapsed / 1000).toFixed(1)} s (limit ${SPEED_LIMIT_MS / 1000} s, target 10 s)`;
  console.log(`[speed] ${speed}`);
  testInfo.annotations.push({ type: "speed", description: speed });
  expect(slowerThan(SPEED_LIMIT_MS, elapsed), speed).toBe(false);

  await waitForTurnDone();

  // URL + history sidebar
  await expect(page).toHaveURL(/\/kit\/t\/[^/]+$/);
  const threadId = page.url().split("/kit/t/")[1];
  await expect(page.getByRole("navigation", { name: "Kit history" }).locator(`a[href="/kit/t/${threadId}"]`)).toBeVisible();

  // Timeline summary: Planned ≥ 8 items · compared N products from M shops
  const summary = chat().getByText(/^Planned \d+ items/).first();
  await expect(summary).toHaveText(/Planned \d+ items · compared \d+ products from \d+ shops/);
  expect(Number((await summary.textContent())!.match(/Planned (\d+) items/)![1])).toBeGreaterThanOrEqual(8);

  // Kit header + assumption chips
  const header = kit().locator("header").first();
  await expect(header).toContainText("Budget 1.500.000 ₫");
  await expect(header).toContainText("By Sep 5");
  await expect(header).toContainText("Deliver to Cau Giay, Hanoi");
  await expect(chat().getByRole("list", { name: "Assumptions" }).last()).toContainText(/Sep\s*5/i);
  await expectVersion(1, 1);

  // Three baskets, Balanced selected, all ≤ budget, Saver < Premium
  await expect(tabs()).toHaveCount(3);
  await expect(tabs().nth(0)).toHaveText(/^Saver · .+ · lowest total/);
  await expect(tabs().nth(1)).toHaveText(/^Balanced · .+ · best value/);
  await expect(tabs().nth(2)).toHaveText(/^Premium · .+ · top-rated within budget/);
  await expect(tabs().nth(1)).toHaveAttribute("aria-selected", "true");
  const totals = await Promise.all([0, 1, 2].map(async (i) => parseVnd((await tabs().nth(i).textContent()) ?? "")));
  for (const t of totals) expect(t).toBeLessThanOrEqual(HERO_BUDGET);
  expect(totals[0]).toBeLessThan(totals[2]);
  lanBalanced = await grandTotal();
  expect(lanBalanced).toBe(totals[1]);
  await expect(kit().getByRole("list", { name: "Basket" })).not.toContainText("Bago Bags");

  // Savings: the wallet voucher line + at least one shop saving line
  const savings = kit().getByRole("region", { name: "Totals" }).locator("ul > li");
  await expect(savings.filter({ hasText: "Your wallet voucher Back-to-school 10%" })).toHaveCount(1);
  expect(await savings.count()).toBeGreaterThanOrEqual(2);

  // Backpack: No exact match + closest Minh An 349.000 ₫ missing anti-hunchback + Add anyway
  const noMatch = kit().getByRole("list", { name: "No exact match" }).locator(":scope > li").filter({ hasText: /backpack/i });
  await expect(noMatch).toHaveCount(1);
  await expect(noMatch).toContainText(/No exact match: no anti-hunchback .*backpack under 400k/i);
  await expect(noMatch).toContainText(MINHAN_BACKPACK);
  await expect(noMatch).toContainText("349.000 ₫");
  await expect(noMatch).toContainText("Missing: anti-hunchback");
  await expect(noMatch.getByRole("button", { name: "Add anyway" })).toBeVisible();

  // 💛 In your cart: KidZone Lite 520.000 ₫ → 440.000 ₫ with LAN-KZ80, over the 400k limit by 40.000 ₫, missing anti-hunchback
  const cart = noMatch.getByRole("region", { name: "In your cart" });
  await expect(cart).toContainText("KidZone Lite Backpack Grade 1–3");
  await expect(cart).toContainText("520.000 ₫ → 440.000 ₫ with LAN-KZ80");
  await expect(cart).toContainText("over your 400k limit by 40.000 ₫");
  await expect(cart).toContainText("missing: anti-hunchback");
  await expect(cart.getByRole("button", { name: "Switch to this" })).toBeVisible();

  // One follow-up question ending with "?" and 2–3 quick replies
  const followUp = lastSuggestions().locator("xpath=preceding-sibling::p[1]");
  await expect(followUp).toHaveText(/\?\s*$/);
  expect(await lastSuggestions().getByRole("button").count()).toBeGreaterThanOrEqual(2);

  // Premium then back to Balanced
  await tabs().nth(2).click();
  await expect(tabs().nth(2)).toHaveAttribute("aria-selected", "true");
  expect(await grandTotal()).toBe(totals[2]);
  await tabs().nth(1).click();
  expect(await grandTotal()).toBe(totals[1]);
});

test("Beat 2: an answer keeps version 1; refine → version 2; ✕ water bottle; reload keeps every turn", async () => {
  // 0. A question is answered from the description; the kit does not change (D42).
  await composer().fill("Is the Minh An backpack really anti-hunchback?");
  await composer().press("Enter");
  await expect(chat().getByTestId("user-bubble")).toHaveCount(2);
  await waitForTurnDone();
  const answer = chat().locator("li").filter({ has: page.getByRole("group", { name: "Suggestions" }) }).last();
  answerText = ((await answer.locator("p").first().textContent()) ?? "").trim();
  expect(answerText).toMatch(/spine|S-shaped|straight/i);
  await expect(lastSuggestions().locator("xpath=preceding-sibling::p[1]")).toHaveText(/\?\s*$/);
  expect(await lastSuggestions().getByRole("button").count()).toBeGreaterThanOrEqual(2);
  await expectVersion(1, 1);

  // 1–2. Refine: version 2, Removed: uniform, budget 1.000.000 ₫, total ≤ 1M
  await composer().fill("School gives the uniform, cut the budget to 1M.");
  await composer().press("Enter");
  await expect(chat().getByTestId("user-bubble")).toHaveCount(3);
  await expectVersion(2, 2);
  await waitForTurnDone();
  await expect(chat().getByRole("list", { name: "What changed" }).last()).toContainText(/Removed: .*uniform/i);
  await expect(kit().locator("header").first()).toContainText("Budget 1.000.000 ₫");
  const before = await grandTotal();
  expect(before).toBeLessThanOrEqual(1_000_000);

  // 3. ✕ on the water bottle: system line with Undo, total drops without an AI call
  const started = Date.now();
  await kit().getByRole("button", { name: /^Remove .*bottle.* \(I already have this\)$/i }).click();
  const line = chat().locator("li").filter({ hasText: /⚙ Removed: .*bottle/i });
  await expect(line).toBeVisible();
  await expect(line.getByRole("button", { name: "Undo" })).toBeVisible();
  await expect.poll(grandTotal, { timeout: 10_000 }).toBeLessThan(before);
  console.log(`[speed] ✕ water bottle → new total: ${((Date.now() - started) / 1000).toFixed(1)} s (DEMO: < 1 s, no AI call)`);
  await expectVersion(3, 3);

  // 4. F5: same kit, version 3, every chat turn including the answer
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expectVersion(3, 3);
  const bubbles = chat().getByTestId("user-bubble");
  await expect(bubbles).toHaveText([HERO_EN, "Is the Minh An backpack really anti-hunchback?", "School gives the uniform, cut the budget to 1M."]);
  await expect(chat().getByText(answerText.slice(0, 60), { exact: false })).toBeVisible();
  await expect(chat().locator("li").filter({ hasText: /⚙ Removed: .*bottle/i })).toBeVisible();
});

test("Beat 3: Seller Centre shows the live need, the listing gap +1, and Preview fix → Apply", async () => {
  await page.getByRole("link", { name: "Seller Centre" }).click();
  await expect(page).toHaveURL(/\/seller/);
  await page.getByRole("combobox", { name: "Shop" }).selectOption(MINHAN_SHOP);
  await expect(page).toHaveURL(new RegExp(`shop=${MINHAN_SHOP}`));

  // Labels come from the planner / the most frequent label of the gap, so cards and live rows are found by category + tag
  // from the same API the screen reads, then looked for by that label on screen.
  const api = await insights();
  const live = api.recent.find((r) => r.category === "school-backpack" && r.tags.includes("anti-hunchback"));
  expect(live, "the Beat 1 need is in insights.recent").toBeDefined();
  await expect(page.getByRole("region", { name: "Just searched (live)" })).toContainText(live!.needLabel, { timeout: 30_000 });
  const gap = backpackGap(api);
  expect(gap?.type).toBe("listing_gap");

  const cards = page.getByRole("region", { name: "Unmet demand" }).getByRole("article");
  const listing = cards.first();
  await expect(listing).toHaveAccessibleName(gap!.needLabel, LLM);
  await expect(listing).toContainText("Listing gap");
  await expect(listing).toContainText(`${baselineCount + 1} this week`);
  await expect(listing).toContainText(MINHAN_BACKPACK);
  await expect(listing.locator("blockquote")).toContainText("spine straight");

  // By card name: the LLM advice on other cards may mention raincoats too.
  const raincoat = page.getByRole("region", { name: "Unmet demand" }).getByRole("article", { name: /raincoat/i });
  await expect(raincoat).toHaveCount(1);
  await expect(raincoat).toContainText("Assortment gap");
  await expect(raincoat).toContainText("0 shops selling");
  await expect(raincoat).toContainText("School backpack");
  await expect(raincoat.getByRole("button", { name: /add product/i })).toHaveCount(0);

  await listing.getByRole("button", { name: "Preview fix" }).click();
  const drawer = page.getByRole("dialog", { name: "Preview fix" });
  await expect(drawer).toBeVisible(LLM);
  const added = drawer.getByRole("list", { name: "Added tags" });
  for (const tag of ["anti-hunchback", "lightweight", "grade-1"]) await expect(added.getByText(tag, { exact: true })).toBeVisible();
  const titles = drawer.locator("section").first().locator("p");
  const oldTitle = ((await titles.nth(0).textContent()) ?? "").trim();
  expect(oldTitle).toBe(MINHAN_BACKPACK);
  expect(((await titles.nth(1).textContent()) ?? "").trim().startsWith(oldTitle)).toBe(true);
  const keywords = drawer.getByRole("list", { name: "Old keywords still match" }).getByRole("listitem");
  expect(await keywords.count()).toBeGreaterThan(0);
  for (const k of await keywords.allTextContents()) expect(k.trim()).toMatch(/✓$/);

  await drawer.getByRole("button", { name: "Apply" }).click();
  await expect(drawer).toBeHidden(LLM);
  await expect(listing).toContainText("Fixed", LLM);
  await expect(listing.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("Beat 4: the loop closes — the Minh An backpack is a normal line, Updated for this need", async () => {
  await page.getByRole("link", { name: "Back to buyer" }).click();
  await expect(page).toHaveURL(/\/kit/);
  await newKitFromComposer(HERO_EN);

  const backpack = basketLines().filter({ hasText: MINHAN_BACKPACK });
  await expect(backpack).toHaveCount(1);
  await expect(backpack).toContainText("349.000 ₫");
  await expect(backpack).toContainText("Updated for this need");
  await expect(kit().getByRole("list", { name: "No exact match" })).toHaveCount(0);
  expect(await grandTotal()).toBeLessThanOrEqual(HERO_BUDGET);
});

test("After the demo: Undo the listing fix so the next run starts clean", async () => {
  await page.goto(`/seller?shop=${MINHAN_SHOP}`);
  const label = backpackGap(await insights())!.needLabel;
  const listing = page.getByRole("region", { name: "Unmet demand" }).getByRole("article", { name: label, exact: true });
  await listing.getByRole("button", { name: "Undo" }).click(LLM);
  await expect(listing.getByRole("button", { name: "Preview fix" })).toBeVisible(LLM);
  expect(backpackGap(await insights())?.appliedFix ?? null).toBeNull();
});

test("Guest (D43): the Beat 1 sentence has no 💛 card, no wallet line and a higher Balanced total; back to Lan", async () => {
  await page.goto("/kit/new");
  await switchPersona("Guest");
  await page.keyboard.press("Escape");
  await composer().fill(HERO_EN);
  await composer().press("Enter");
  await expect(basketLines().first()).toBeVisible(LLM);
  await waitForTurnDone();

  await expect(kit().getByRole("region", { name: "In your cart" })).toHaveCount(0);
  await expect(kit().getByRole("region", { name: "Totals" })).not.toContainText("Your wallet voucher");
  await expect(kit().locator("header").first()).not.toContainText("Deliver to");
  expect(await grandTotal()).toBeGreaterThan(lanBalanced);

  await switchPersona("Lan");
  const persona = (await (await page.request.get("/api/persona")).json()) as PersonaResponse;
  expect(persona.persona.id).toBe("lan");
});

