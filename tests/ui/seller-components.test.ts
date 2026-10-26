// Seam: seller-screen components rendered to HTML (react-dom/server) from contract-shaped payloads:
// preview drawer (added vs kept + keyword check), gap cards (listing vs assortment), and the buyer-side
// "Notify me" button on Kitly noMatch rows.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { gapKeyFor } from "@/contract";
import { kitSample } from "@/contract/fixtures";
import type { BasketOption, EnrichmentPreviewResponse, Gap, KitPlan, Product } from "@/contract/types";
import { FixDrawer } from "@/components/seller/FixDrawer";
import { GapCard } from "@/components/seller/GapCard";
import { Basket } from "@/components/kit/Basket";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

const before: Product = {
  id: "prod-minhan-backpack",
  shopId: "shop-minhan",
  title: "Minh An Kids Backpack New Model 2026",
  category: "school-backpack",
  description: "Padded ergonomic back panel.",
  price: 349000,
  rating: 4.8,
  reviewCount: 412,
  soldCount: 1930,
  stock: 120,
  tags: ["kids"],
  attributes: { material: "polyester" },
  shipDaysMin: 1,
  shipDaysMax: 3,
  updatedForDemandAt: null,
};
const preview: EnrichmentPreviewResponse = {
  proposalId: "p1",
  before,
  after: {
    ...before,
    title: `${before.title} | Anti-Hunchback, Lightweight, Grade 1`,
    tags: ["kids", "anti-hunchback", "lightweight", "grade-1"],
    attributes: { material: "polyester", weight: "0.75 kg" },
    description: `${before.description}\n\nAnti-hunchback back panel, suitable for Grade 1.`,
  },
  added: {
    titleSuffix: "Anti-Hunchback, Lightweight, Grade 1",
    tags: ["anti-hunchback", "lightweight", "grade-1"],
    attributes: { weight: "0.75 kg" },
    descriptionAppend: "Anti-hunchback back panel, suitable for Grade 1.",
  },
  kept: { title: before.title, tags: ["kids"] },
  keywordCheck: [
    { keyword: "minh", stillMatches: true },
    { keyword: "backpack", stillMatches: true },
    { keyword: "2026", stillMatches: false },
  ],
  evidence: "S-shaped straps that keep the spine straight",
};

const drawer = (over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(FixDrawer, { preview, onApply: () => {}, onClose: () => {}, ...over }));

/** Elements carrying a data-testid, with their class + text. */
function byTestId(html: string, id: string) {
  const re = new RegExp(`<[a-z]+ [^>]*data-testid="${id}"[^>]*>([^<]*)<`, "g");
  return [...html.matchAll(re)].map((m) => ({ tag: m[0], text: m[1].trim() }));
}

describe("FixDrawer (enrichment preview)", () => {
  it("shows before and after titles", () => {
    const t = text(drawer());
    expect(t).toContain("Before");
    expect(t).toContain("Minh An Kids Backpack New Model 2026");
    expect(t).toContain("After");
    expect(t).toContain("Minh An Kids Backpack New Model 2026 | Anti-Hunchback, Lightweight, Grade 1");
  });

  it("renders added tags green and kept tags grey", () => {
    const html = drawer();
    const added = byTestId(html, "added-tag");
    const kept = byTestId(html, "kept-tag");
    expect(added.map((a) => a.text)).toEqual(["+ anti-hunchback", "+ lightweight", "+ grade-1"]);
    expect(added.every((a) => a.tag.includes("emerald"))).toBe(true);
    expect(kept.map((k) => k.text)).toEqual(["kids"]);
    expect(kept.every((k) => k.tag.includes("gray") && !k.tag.includes("emerald"))).toBe(true);
  });

  it("lists added attributes, the appended description and the evidence", () => {
    const t = text(drawer());
    expect(t).toContain("weight: 0.75 kg");
    expect(t).toContain("Anti-hunchback back panel, suitable for Grade 1.");
    expect(t).toContain("S-shaped straps that keep the spine straight");
  });

  it("checks every old keyword with ✓ or ✗", () => {
    const html = drawer();
    const rows = byTestId(html, "keyword-ok").map((r) => r.text);
    const lost = byTestId(html, "keyword-lost").map((r) => r.text);
    expect(rows).toEqual(["✓ minh", "✓ backpack"]);
    expect(lost).toEqual(["✗ 2026"]);
    expect(text(html)).toContain("Old keywords still match");
  });

  it("has Apply and Cancel, disabled while applying", () => {
    expect(text(drawer())).toContain("Apply");
    expect(drawer({ applying: true })).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Applying/);
  });
});

const listingGap: Gap = {
  key: "school-backpack|anti-hunchback",
  type: "listing_gap",
  needLabel: "Anti-hunchback backpack",
  category: "school-backpack",
  tags: ["anti-hunchback"],
  thisWeek: 38,
  lastWeek: 21,
  matchingProducts: 0,
  priceBand: { p25: 300000, p75: 400000 },
  neededWith: [{ category: "kids-raincoat", share: 0.6 }],
  advice: "Say anti-hunchback in your backpack listing.",
  candidates: [
    {
      productId: "prod-minhan-backpack",
      title: "Minh An Kids Backpack New Model 2026",
      evidence: "S-shaped straps that keep the spine straight.",
    },
  ],
  watchers: 0,
};
const assortmentGap: Gap = {
  ...listingGap,
  key: "kids-raincoat|backpack-cover",
  type: "assortment_gap",
  needLabel: "Kids raincoat with backpack cover",
  category: "kids-raincoat",
  tags: ["backpack-cover"],
  thisWeek: 52,
  lastWeek: 30,
  priceBand: { p25: 120000, p75: 180000 },
  neededWith: [{ category: "school-backpack", share: 0.96 }],
  candidates: undefined,
  watchers: 3,
};
const card = (gap: Gap, over: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(GapCard, { gap, fixed: null, onPreview: () => {}, onUndo: () => {}, ...over }),
  );

describe("GapCard", () => {
  it("listing gap: blue badge, counts with ▲%, price band, needed-with chips, advice, candidate + evidence", () => {
    const html = card(listingGap);
    const t = text(html);
    expect(byTestId(html, "gap-type")[0]).toMatchObject({ text: "Listing gap" });
    expect(byTestId(html, "gap-type")[0].tag).toContain("blue");
    expect(t).toContain("Anti-hunchback backpack");
    expect(t).toContain("38");
    expect(t).toContain("21");
    expect(t).toContain("▲ 81%");
    expect(t).toContain("300.000₫ – 400.000₫");
    expect(t).toContain("Kids raincoat");
    expect(t).toContain("Say anti-hunchback in your backpack listing.");
    expect(t).toContain("0 matching products");
    expect(t).toContain("Minh An Kids Backpack New Model 2026");
    expect(t).toContain("“S-shaped straps that keep the spine straight.”");
    expect(t).toContain("Preview fix");
  });

  it("listing gap after Apply shows Fixed with Undo instead of Preview fix", () => {
    const t = text(
      card(listingGap, { fixed: { productId: "prod-minhan-backpack", title: "Minh An Kids Backpack" } }),
    );
    expect(t).toContain("Fixed");
    expect(t).toContain("Undo");
    expect(t).not.toContain("Preview fix");
  });

  it("assortment gap: amber badge, 0 shops selling, buyers waiting, no add-product button", () => {
    const html = card(assortmentGap);
    const t = text(html);
    expect(byTestId(html, "gap-type")[0]).toMatchObject({ text: "Assortment gap" });
    expect(byTestId(html, "gap-type")[0].tag).toContain("amber");
    expect(t).toContain("0 shops selling");
    expect(t).toContain("3 buyers waiting");
    expect(t).toContain("School backpack");
    expect(t.toLowerCase()).not.toContain("add product");
    expect(t).not.toContain("Preview fix");
    expect(html).not.toContain("<button");
  });

  it("keeps Fixed + Undo when a refresh turns the fixed gap into an assortment gap", () => {
    // After Apply the listing carries the gap tags, so the server no longer lists it as a candidate.
    const html = card(assortmentGap, {
      fixed: { productId: "prod-minhan-backpack", title: "Minh An Kids Backpack" },
    });
    const t = text(html);
    expect(t).toContain("Fixed");
    expect(t).toContain("Minh An Kids Backpack");
    expect(t).toContain("Undo");
  });

  it("a gap with no taxonomy category still shows an icon tile, never an empty box", () => {
    const html = card({ ...assortmentGap, key: "none|", category: null, needLabel: "Dog bed" });
    expect(html).toContain('aria-label="Not sold on DemoMart yet"');
    expect(html.slice(html.indexOf('aria-label="Not sold on DemoMart yet"'))).toMatch(/^[^>]*>\s*<svg/);
  });

  it("assortment gap without watchers hides the waiting line", () => {
    expect(text(card({ ...assortmentGap, watchers: 0 }))).not.toContain("buyers waiting");
    expect(text(card({ ...assortmentGap, watchers: 1 }))).toContain("1 buyer waiting");
  });
});

describe("Basket — Notify me on noMatch rows", () => {
  const optionsEv = kitSample.find((e) => e.event === "options")!;
  const planEv = kitSample.find((e) => e.event === "plan")!;
  if (optionsEv.event !== "options" || planEv.event !== "plan") throw new Error("fixture");
  const option: BasketOption = optionsEv.data.options[0];
  const plan: KitPlan = planEv.data.plan;
  const backpack = plan.items.find((i) => i.key === "backpack")!;

  it("shows a Notify me button keyed by the plan item's gap key", () => {
    const html = renderToStaticMarkup(
      createElement(Basket, { option, plan, diff: null, onNotify: async () => 1 }),
    );
    expect(text(html)).toContain("Notify me");
    expect(html).toContain(`data-gapkey="${gapKeyFor(backpack.category, backpack.mustHaveTags)}"`);
  });

  it("has no Notify me button without a handler", () => {
    const html = renderToStaticMarkup(createElement(Basket, { option, plan, diff: null }));
    expect(text(html)).not.toContain("Notify me");
  });
});
