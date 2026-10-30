import { describe, expect, it } from "vitest";
import { ProductSchema } from "@/contract";
import productsFixture from "@/contract/fixtures/products.json";
import { generateDemand, FORCED_NEEDS, type SeedSession } from "@/server/seed/demand";
import { addDays } from "@/server/today";
import { CATEGORIES, type Product } from "@/contract";

// Memory, no LLM: the demand generator is pure code over a catalog (DATA.md §5).
const catalog = ProductSchema.array().parse(productsFixture);
const TODAY = "2026-09-02";
const sessions = generateDemand({ catalog, today: TODAY });

const day = (s: SeedSession) => s.createdAt.slice(0, 10);
const inThisWeek = (s: SeedSession) => day(s) >= addDays(TODAY, -6) && day(s) <= TODAY;
const inLastWeek = (s: SeedSession) => day(s) >= addDays(TODAY, -13) && day(s) <= addDays(TODAY, -7);
const sameTags = (a: string[], b: string[]) => [...a].sort().join(",") === [...b].sort().join(",");

function sessionsWith(category: string | null, tags: string[], inWeek: (s: SeedSession) => boolean): number {
  return sessions.filter(
    (s) => inWeek(s) && s.items.some((i) => i.category === category && (category === null || sameTags(i.tags, tags))),
  ).length;
}

describe("generateDemand (DATA.md §5)", () => {
  it("hits the forced this-week / last-week counts exactly (distinct sessions)", () => {
    expect(FORCED_NEEDS.map((f) => [f.category, f.tags, f.thisWeek, f.lastWeek])).toEqual([
      ["school-backpack", ["anti-hunchback"], 37, 21],
      ["kids-raincoat", ["backpack-cover"], 52, 30],
      ["kids-desk-lamp", ["anti-blue-light"], 18, 15],
      [null, [], 9, 4],
    ]);
    expect(sessionsWith("school-backpack", ["anti-hunchback"], inThisWeek)).toBe(37);
    expect(sessionsWith("school-backpack", ["anti-hunchback"], inLastWeek)).toBe(21);
    expect(sessionsWith("kids-raincoat", ["backpack-cover"], inThisWeek)).toBe(52);
    expect(sessionsWith("kids-raincoat", ["backpack-cover"], inLastWeek)).toBe(30);
    expect(sessionsWith("kids-desk-lamp", ["anti-blue-light"], inThisWeek)).toBe(18);
    expect(sessionsWith("kids-desk-lamp", ["anti-blue-light"], inLastWeek)).toBe(15);
    expect(sessionsWith(null, [], inThisWeek)).toBe(9);
    expect(sessionsWith(null, [], inLastWeek)).toBe(4);
  });

  it("forced tags appear nowhere else (any tag containing them is exactly the forced need)", () => {
    for (const s of sessions)
      for (const i of s.items) {
        if (i.tags.includes("anti-hunchback"))
          expect([i.category, i.tags]).toEqual(["school-backpack", ["anti-hunchback"]]);
        if (i.tags.includes("backpack-cover"))
          expect([i.category, i.tags]).toEqual(["kids-raincoat", ["backpack-cover"]]);
        if (i.tags.includes("anti-blue-light"))
          expect([i.category, i.tags]).toEqual(["kids-desk-lamp", ["anti-blue-light"]]);
      }
  });

  it("forced needs have the DATA.md budget-hint p25–p75 band", () => {
    const hints = (cat: string) =>
      sessions
        .flatMap((s) => s.items)
        .filter((i) => i.category === cat && i.tags.length === 1 && FORCED_NEEDS.some((f) => f.tags[0] === i.tags[0]))
        .map((i) => i.budgetHint!)
        .sort((a, b) => a - b);
    const q = (xs: number[], p: number) => xs[Math.floor((xs.length - 1) * p)];
    const bp = hints("school-backpack");
    expect(q(bp, 0.25)).toBeGreaterThanOrEqual(270000);
    expect(q(bp, 0.25)).toBeLessThanOrEqual(330000);
    expect(q(bp, 0.75)).toBeGreaterThanOrEqual(370000);
    expect(q(bp, 0.75)).toBeLessThanOrEqual(430000);
    const rc = hints("kids-raincoat");
    expect(q(rc, 0.25)).toBeGreaterThanOrEqual(105000);
    expect(q(rc, 0.75)).toBeLessThanOrEqual(195000);
  });

  it("pet items are null-category with varied labels, unmet", () => {
    const pets = sessions.flatMap((s) => s.items).filter((i) => i.category === null);
    expect(new Set(pets.map((i) => i.needLabel)).size).toBeGreaterThanOrEqual(3);
    expect(pets.every((i) => i.matchedCount === 0)).toBe(true);
  });

  it("back-to-school combo backpack + water bottle + lunch box co-occurs in ≥ 60% of its sessions", () => {
    const bts = sessions.filter((s) => s.event === "back_to_school");
    const combo = bts.filter((s) =>
      ["school-backpack", "water-bottle", "lunch-box"].every((c) => s.items.some((i) => i.category === c)),
    );
    expect(combo.length / bts.length).toBeGreaterThanOrEqual(0.6);
  });

  it("~1,500 sessions over the 28 days before DEMO_TODAY, back-to-school rising ×1.5 this week", () => {
    // every category stocked (as in the seeded world), so every event has sessions
    const filler = CATEGORIES.flatMap((c) =>
      [1, 2].map((n): Product => ({ ...catalog[0], id: `t-${c.id}-${n}`, category: c.id, tags: [], stock: 10 })),
    );
    const sessions = generateDemand({ catalog: [...catalog, ...filler], today: TODAY });
    expect(sessions.length).toBeGreaterThan(1300);
    expect(sessions.length).toBeLessThan(1700);
    expect(sessions.every((s) => day(s) >= addDays(TODAY, -27) && day(s) <= TODAY)).toBe(true);
    const bts = (w: (s: SeedSession) => boolean) => sessions.filter((s) => s.event === "back_to_school" && w(s)).length;
    expect(bts(inThisWeek) / bts(inLastWeek)).toBeCloseTo(1.5, 1);
    expect(sessions.every((s) => s.source === "seed" && s.items.length >= 1)).toBe(true);
    expect(new Set(sessions.map((s) => s.id)).size).toBe(sessions.length);
  });

  it("matchedCount = in-stock products of that category carrying every tag; normal needs are met (≥ 2)", () => {
    const hero = sessions.flatMap((s) => s.items).find((i) => i.tags[0] === "anti-hunchback")!;
    expect(hero.matchedCount).toBe(1); // only the KidZone Ergo backpack
    const lamp = sessions.flatMap((s) => s.items).find((i) => i.tags[0] === "anti-blue-light")!;
    expect(lamp.matchedCount).toBe(0);
    const forced = new Set(["anti-hunchback", "backpack-cover", "anti-blue-light"]);
    const normal = sessions
      .flatMap((s) => s.items)
      .filter((i) => i.category !== null && !i.tags.some((t) => forced.has(t)));
    // fixtures have 1-product categories, so only categories with ≥ 2 in-stock products are planned at all
    expect(normal.every((i) => i.matchedCount >= 2)).toBe(true);
  });

  it("is deterministic for the same inputs and each session carries a valid plan", () => {
    const again = generateDemand({ catalog, today: TODAY });
    expect(again.map((s) => [s.createdAt, s.items.length])).toEqual(sessions.map((s) => [s.createdAt, s.items.length]));
    const s = sessions[0];
    expect(s.plan.items.map((i) => i.needLabel)).toEqual(s.items.map((i) => i.needLabel));
  });
});
