import { beforeAll, describe, expect, it } from "vitest";
import { DemandItemRowSchema, KitPlanSchema, type DemandItemRow, type Product } from "@/contract";
import { generateDemand, FORCED_NEEDS, type SeedDemand } from "@/server/seed/demand";
import { countMatches } from "@/server/seed/match-count";
import { buildTestCatalog } from "./fake-catalog";

const TODAY = "2026-08-20";
const THIS_WEEK = ["2026-08-14", "2026-08-20"] as const; // 7 days ending DEMO_TODAY
const LAST_WEEK = ["2026-08-07", "2026-08-13"] as const;

const inWindow = (r: DemandItemRow, [from, to]: readonly [string, string]) =>
  r.createdAt.slice(0, 10) >= from && r.createdAt.slice(0, 10) <= to;
const gapKey = (r: { category: string | null; tags: string[] }) =>
  `${r.category ?? "none"}|${[...r.tags].sort().join(",")}`;

let products: Product[];
let demand: SeedDemand;

beforeAll(async () => {
  products = await buildTestCatalog();
  demand = generateDemand({ products, today: TODAY, seed: 42 });
});

describe("generateDemand (DATA.md §5, pure code)", () => {
  it("forced needs have the exact this-week / last-week counts", () => {
    const expected = {
      "school-backpack|anti-hunchback": [37, 21],
      "kids-raincoat|backpack-cover": [52, 30],
      "kids-desk-lamp|anti-blue-light": [18, 15],
      "none|": [9, 4],
    };
    for (const [key, [tw, lw]] of Object.entries(expected)) {
      const rows = demand.items.filter((r) => gapKey(r) === key);
      expect(rows.filter((r) => inWindow(r, THIS_WEEK)).length, `${key} this week`).toBe(tw);
      expect(rows.filter((r) => inWindow(r, LAST_WEEK)).length, `${key} last week`).toBe(lw);
    }
    expect(FORCED_NEEDS).toHaveLength(4);
  });

  it("back-to-school sessions: backpack + water bottle + lunch box co-occur in ≥ 60%", () => {
    const b2s = demand.sessions.filter((s) => s.event === "back_to_school");
    const combo = b2s.filter((s) => {
      const cats = new Set(s.plan.items.map((i) => i.category));
      return cats.has("school-backpack") && cats.has("water-bottle") && cats.has("lunch-box");
    });
    expect(combo.length / b2s.length).toBeGreaterThanOrEqual(0.6);
  });

  it("~1,500 sessions over the 28 days before DEMO_TODAY with the event volume shape", () => {
    expect(demand.sessions.length).toBeGreaterThanOrEqual(1400);
    expect(demand.sessions.length).toBeLessThanOrEqual(1650);
    for (const s of demand.sessions) {
      expect(s.createdAt.slice(0, 10) >= "2026-07-24" && s.createdAt.slice(0, 10) <= TODAY, s.createdAt).toBe(
        true,
      );
      expect(s.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(s.source).toBe("seed");
      KitPlanSchema.parse(s.plan);
    }
    const perWeek = (event: string, w: readonly [string, string]) =>
      demand.sessions.filter(
        (s) => s.event === event && s.createdAt.slice(0, 10) >= w[0] && s.createdAt.slice(0, 10) <= w[1],
      ).length;
    const tw = perWeek("back_to_school", THIS_WEEK);
    const lw = perWeek("back_to_school", LAST_WEEK);
    expect(tw / lw).toBeCloseTo(1.5, 1);
    expect(perWeek("newborn", THIS_WEEK)).toBeGreaterThan(perWeek("tet_gifts", THIS_WEEK) * 3);
    expect(perWeek("tet_gifts", THIS_WEEK)).toBeGreaterThan(0);
  });

  it("items are valid rows tied to their session; plans have 6–10 items (except pet sessions)", () => {
    const byId = new Map(demand.sessions.map((s) => [s.id, s]));
    for (const r of demand.items) {
      DemandItemRowSchema.parse(r);
      const s = byId.get(r.sessionId)!;
      expect(s, r.sessionId).toBeDefined();
      expect(r.createdAt).toBe(s.createdAt);
      expect(r.event).toBe(s.event);
    }
    for (const s of demand.sessions.filter((x) => x.event !== "other")) {
      expect(s.plan.items.length, s.id).toBeGreaterThanOrEqual(6);
      expect(s.plan.items.length, s.id).toBeLessThanOrEqual(10);
      expect(demand.items.filter((r) => r.sessionId === s.id)).toHaveLength(s.plan.items.length);
    }
  });

  it("matchedCount = category + all tags count against the catalog; only forced needs are unmet (< 2)", () => {
    for (const r of demand.items.slice(0, 2000))
      expect(r.matchedCount).toBe(countMatches(products, r.category, r.tags));
    const unmet = new Set(demand.items.filter((r) => r.matchedCount < 2).map(gapKey));
    expect(unmet).toEqual(new Set(FORCED_NEEDS.map((n) => gapKey(n))));
    const hero = demand.items.find((r) => gapKey(r) === "school-backpack|anti-hunchback")!;
    expect(hero.matchedCount).toBe(1);
  });

  it("forced budget hints land in the DATA.md p25–p75 bands (±10%)", () => {
    const pct = (xs: number[], p: number) => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))];
    };
    for (const n of FORCED_NEEDS.filter((x) => x.band)) {
      const hints = demand.items
        .filter((r) => gapKey(r) === gapKey(n) && inWindow(r, THIS_WEEK))
        .map((r) => r.budgetHint!);
      expect(hints.every((h) => Number.isInteger(h))).toBe(true);
      expect(Math.abs(pct(hints, 0.25) - n.band![0]) / n.band![0], `${n.needLabel} p25`).toBeLessThanOrEqual(
        0.1,
      );
      expect(Math.abs(pct(hints, 0.75) - n.band![1]) / n.band![1], `${n.needLabel} p75`).toBeLessThanOrEqual(
        0.1,
      );
    }
  });

  it("is deterministic for the same seed", () => {
    const again = generateDemand({ products, today: TODAY, seed: 42 });
    expect(again).toEqual(demand);
  });
});
