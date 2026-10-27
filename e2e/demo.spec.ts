// DEMO.md Beats 1–4 end to end (seam S7): buyer tab + seller tab against BASE_URL with the real DB and LLM.
// Every **Expect** line that the DOM can show is asserted; the listing fix is undone at the end (and, as a safety
// net, through the API before/after each attempt) so the next run starts clean.
import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "./pw";
import {
  GAP_KEYS,
  HERO_PRODUCT,
  MINH_AN,
  parseCompared,
  parsePlanned,
  parsePriceBand,
  parseVnd,
  savingsAt,
  unaccountedItems,
} from "./demo-checks";
import { formatVnd } from "../src/lib/client/format";
import { EVENT_LABELS } from "../src/lib/client/events";

const NEED =
  "My kid starts Grade 1. Budget 1.5M VND, need everything by Aug 25. The backpack must be anti-hunchback, under 400k.";
const REFINE = "School gives the uniform, cut the budget to 1M.";
const RUN = 4 * 60_000; // one kit/refine run (planner + matcher + explainer through the proxy)
const INSIGHTS = 2 * 60_000; // cold /api/seller/insights (classification + advice)

/** Restore the hero listing if a previous (failed) attempt left it enriched. */
async function undoHeroIfEnriched(page: Page) {
  const res = await page.request.get(`/api/products/${HERO_PRODUCT.id}`);
  expect(res.ok()).toBe(true);
  const { product } = (await res.json()) as { product: { updatedForDemandAt: string | null } };
  if (!product.updatedForDemandAt) return;
  const undo = await page.request.post("/api/seller/enrichment/undo", {
    data: { productId: HERO_PRODUCT.id },
  });
  expect(undo.ok()).toBe(true);
}

/** The Kitly need form's submit button ("Build my kit" / "Building…"); the header may have one too. */
const runButton = (page: Page) =>
  page
    .locator("form")
    .filter({ has: page.getByLabel("Your need", { exact: true }) })
    .getByRole("button", { name: /Build my kit|Building…/ });

/** Waits for the kit/refine run that was just started to finish, and fails fast on a pipeline error. */
async function waitForRun(page: Page) {
  await expect(runButton(page)).toHaveText(/Building…/, { timeout: 30_000 });
  const finished = page.locator(
    '[data-testid="step-explain"][data-status="done"], [data-testid="kit-error"]',
  );
  await expect(finished.first()).toBeVisible({ timeout: RUN });
  await expect(page.getByTestId("kit-error")).toHaveCount(0);
  await expect(runButton(page)).toHaveText(/Build my kit/, { timeout: 30_000 });
}

async function money(l: Locator) {
  return parseVnd(await l.innerText());
}

async function savingsLines(page: Page) {
  const items = page.getByTestId("savings").locator("li");
  const out: { label: string; amount: string }[] = [];
  for (const li of await items.all()) {
    const [label, amount] = await li.locator("span").allInnerTexts();
    out.push({ label, amount });
  }
  return out;
}

/** Basket status ok: no over-budget banner, a real total, and total ≤ budget. */
async function expectOkWithin(page: Page, budget: number) {
  await expect(page.getByTestId("over-budget")).toHaveCount(0);
  const total = await money(page.getByTestId("grand-total"));
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(budget);
  return total;
}

async function openSellerAt(seller: Page) {
  await seller.goto("/seller");
  await seller.getByLabel("Shop").selectOption({ label: MINH_AN.name });
  await expect(seller).toHaveURL(new RegExp(`shop=${MINH_AN.shopId}`));
  const card = seller.getByTestId(`gap-${GAP_KEYS.backpack}`);
  await expect(card).toBeVisible({ timeout: INSIGHTS });
  return card;
}

const lastWeekOf = async (card: Locator) =>
  Number((await card.getByTestId("gap-last-week").innerText()).match(/(\d+) last week/)![1]);

// Fixture types are spelled out so this file type-checks even before @playwright/test is installed (see pw.ts).
type Fixtures = { page: Page; context: BrowserContext };

test.beforeEach(async ({ page }: Fixtures) => undoHeroIfEnriched(page));

test.afterEach(async ({ page, context }: Fixtures, testInfo: TestInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    // The fixture screenshots `page`; also keep the seller tab.
    for (const [i, p] of context.pages().entries() as IterableIterator<[number, Page]>)
      await p.screenshot({ path: testInfo.outputPath(`tab-${i}.png`), fullPage: true }).catch(() => {});
  }
  await undoHeroIfEnriched(page);
});

test("DEMO.md Beats 1–4: need → kit → adapt → seller fix → loop closes", async ({
  page: buyer,
  context,
}: Fixtures) => {
  const seller = await context.newPage();

  // Baseline for "this week 38 (37 seeded + the live query)": the count before our live query.
  const baseline = await test.step("baseline: Minh An backpack gap count", async () => {
    await seller.goto(`/seller?shop=${MINH_AN.shopId}`);
    const card = seller.getByTestId(`gap-${GAP_KEYS.backpack}`);
    await expect(card).toBeVisible({ timeout: INSIGHTS });
    return Number(await card.getByTestId("gap-this-week").innerText());
  });

  let minhAnSavingsBeat1 = 0;

  await test.step("Beat 1: need → kit", async () => {
    await buyer.bringToFront();
    await buyer.goto("/");
    await buyer.getByRole("radio", { name: "Describe your need" }).click();
    await buyer.getByLabel("Describe your need").fill(NEED);
    await buyer.getByRole("button", { name: "Build my kit" }).click();
    await expect(buyer).toHaveURL(/\/kit\?q=/);
    await waitForRun(buyer);

    // Timeline: Understanding → Planned ≥ 8 items → Compared N products from M shops → Optimized → Explaining.
    for (const id of ["understand", "plan", "search", "optimize", "explain"])
      await expect(buyer.getByTestId(`step-${id}`)).toHaveAttribute("data-status", "done");
    expect(parsePlanned(await buyer.getByTestId("step-plan").innerText())).toBeGreaterThanOrEqual(8);
    const compared = parseCompared(await buyer.getByTestId("step-search").innerText());
    expect(compared.products).toBeGreaterThan(0);
    expect(compared.shops).toBeGreaterThan(0);

    // Plan: back_to_school, budget 1,500,000, deadline 2026-08-25, backpack must-have anti-hunchback max 400k.
    const plan = buyer.getByTestId("plan-card");
    await expect(plan.getByRole("heading")).toHaveText(EVENT_LABELS.back_to_school);
    await expect(buyer.getByTestId("plan-budget")).toHaveText(formatVnd(1_500_000));
    await expect(buyer.getByTestId("plan-deadline")).toHaveText("Aug 25");
    const backpackItem = plan.locator('[data-testid^="plan-item-"]').filter({ hasText: "anti-hunchback" });
    await expect(backpackItem).toHaveCount(1);
    await expect(backpackItem).toContainText(/backpack/i);
    await expect(backpackItem).toContainText("Must-have");
    await expect(backpackItem).toContainText("max 400k");

    // Basket: ok, ≤ 1,500,000; no Bago Bags line (cannot arrive by Aug 25); a Minh An savings line.
    await expectOkWithin(buyer, 1_500_000);
    const chosen = buyer.locator('[data-testid^="line-"] > div:first-child');
    expect(await chosen.count()).toBeGreaterThan(0);
    for (const text of await chosen.allInnerTexts()) expect(text).not.toContain("Bago Bags");
    minhAnSavingsBeat1 = savingsAt(await savingsLines(buyer), MINH_AN.name);
    expect(minhAnSavingsBeat1).toBeGreaterThan(0);

    // Backpack row: the honest gap.
    const gap = buyer.locator('[data-testid^="nomatch-"]').filter({ hasText: /backpack/i });
    await expect(gap).toHaveCount(1);
    await expect(gap).toContainText(
      /No suitable product yet: no .*backpack.*(under 400k|with anti-hunchback|matching your must-haves)/i,
    );
  });

  await test.step("Beat 2: adapt", async () => {
    await buyer.getByLabel("Change your kit").fill(REFINE);
    await buyer.getByRole("button", { name: "Update kit" }).click();
    await waitForRun(buyer);

    // Diff: uniform removed; budget 1,000,000; total ≤ 1,000,000; dropped nice-to-haves listed; explanation.
    await expect(buyer.getByTestId("basket").getByText(/Removed: .*uniform/i)).toBeVisible();
    await expect(buyer.getByTestId("plan-budget")).toHaveText(formatVnd(1_000_000));
    await expectOkWithin(buyer, 1_000_000);
    // "Skipped for budget" only appears when the cut budget forces a drop (live runs vary: 936.000₫ once fitted
    // every item). Either way nothing vanishes silently, and only nice-to-haves are ever skipped.
    const keysOf = async (prefix: string) =>
      (
        await buyer.locator(`[data-testid^="${prefix}"]`).evaluateAll((els) =>
          els.map((e) => e.getAttribute("data-testid") ?? ""),
        )
      ).map((id) => id.slice(prefix.length));
    const planKeys = await keysOf("plan-item-");
    const skippedKeys = await keysOf("skipped-");
    expect(
      unaccountedItems(planKeys, {
        lines: await keysOf("line-"),
        noMatch: await keysOf("nomatch-"),
        skipped: skippedKeys,
      }),
    ).toEqual([]);
    for (const key of skippedKeys) {
      await expect(buyer.getByTestId(`plan-item-${key}`)).toContainText("Nice-to-have");
      await expect(buyer.getByTestId("skipped")).toContainText("Skipped for budget");
    }
    await expect(buyer.getByTestId("explanation")).toContainText(/\S{3,}/);
  });

  await test.step("Beat 3: seller intelligence → preview fix → apply", async () => {
    await seller.bringToFront();
    const card = await openSellerAt(seller);

    // Top gap: anti-hunchback backpack, this week = baseline + the live query (refine may log it once more),
    // last week 21, band within 300k–400k, Listing gap with the Minh An candidate and its evidence.
    await expect(card.getByTestId("gap-type")).toHaveText("Listing gap");
    await expect(card.getByRole("heading")).toContainText(/anti-hunchback/i);
    const thisWeek = Number(await card.getByTestId("gap-this-week").innerText());
    expect(thisWeek).toBeGreaterThanOrEqual(baseline + 1);
    expect(thisWeek).toBeLessThanOrEqual(baseline + 2);
    expect(await lastWeekOf(card)).toBe(21);
    const band = parsePriceBand(await card.getByTestId("gap-price-band").innerText());
    expect(band.p25).toBeGreaterThanOrEqual(300_000);
    expect(band.p75).toBeLessThanOrEqual(400_000);
    await expect(card).toContainText(HERO_PRODUCT.title);
    await expect(card).toContainText(/ergonomic back panel|spine straight/i);

    // Assortment gap: kids raincoat with backpack cover, 52 this week, 0 shops, needed with backpacks, no add button.
    const rain = seller.getByTestId(`gap-${GAP_KEYS.raincoat}`);
    await expect(rain.getByTestId("gap-type")).toHaveText("Assortment gap");
    expect(Number(await rain.getByTestId("gap-this-week").innerText())).toBeGreaterThanOrEqual(52);
    await expect(rain.getByTestId("gap-supply")).toHaveText("0 shops selling");
    await expect(rain.getByText(/Needed with/)).toBeVisible();
    await expect(rain).toContainText(/School backpack · \d+%/);
    await expect(rain.getByRole("button", { name: /add/i })).toHaveCount(0);

    // Preview fix: added tags, title = original + suffix, every old keyword still matches.
    await card.getByRole("button", { name: "Preview fix" }).click();
    const drawer = seller.getByTestId("fix-drawer");
    await expect(drawer).toBeVisible({ timeout: INSIGHTS });
    const added = await drawer.getByTestId("added-tag").allInnerTexts();
    for (const t of ["anti-hunchback", "lightweight", "grade-1"]) expect(added).toContain(`+ ${t}`);
    const before = await drawer.getByTestId("title-before").innerText();
    const after = await drawer.getByTestId("title-after").innerText();
    expect(before).toBe(HERO_PRODUCT.title);
    expect(after.startsWith(before)).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
    await expect(drawer.getByText("Old keywords still match ✓")).toBeVisible();
    await expect(drawer.getByTestId("keyword-lost")).toHaveCount(0);
    expect(await drawer.getByTestId("keyword-ok").count()).toBeGreaterThan(0);

    // Apply: toast, the card now offers Undo.
    await drawer.getByRole("button", { name: "Apply" }).click();
    await expect(seller.getByRole("status")).toContainText("Listing updated");
    await expect(card.getByText("Fixed", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  await test.step("Beat 4: the loop closes", async () => {
    await buyer.bringToFront();
    await runButton(buyer).click(); // same need → runs again
    await waitForRun(buyer);

    const hero = buyer.locator('[data-testid^="line-"]').filter({ hasText: HERO_PRODUCT.title });
    await expect(hero).toHaveCount(1);
    await expect(hero).toContainText("Updated for this need");
    await expect(hero).toContainText(formatVnd(349_000));
    await expectOkWithin(buyer, 1_500_000);
    // "Minh An consolidation saving grows": one more item there — never smaller than in Beat 1.
    expect(savingsAt(await savingsLines(buyer), MINH_AN.name)).toBeGreaterThanOrEqual(minhAnSavingsBeat1);
  });

  await test.step("after the demo: Undo on the listing", async () => {
    await seller.bringToFront();
    const card = seller.getByTestId(`gap-${GAP_KEYS.backpack}`);
    await card.getByRole("button", { name: "Undo" }).click();
    await expect(seller.getByRole("status")).toContainText("Undone");
    const res = await seller.request.get(`/api/products/${HERO_PRODUCT.id}`);
    const { product } = (await res.json()) as {
      product: { title: string; updatedForDemandAt: string | null };
    };
    expect(product.updatedForDemandAt).toBeNull();
    expect(product.title).toBe(HERO_PRODUCT.title);
  });
});
