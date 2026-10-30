// priceSelection (seam S9): the buyer's edits (swaps, Add anyway, drops) on top of one profile, priced exactly like
// the Optimizer, with Fit to budget when over. Hero world = kit.sample plan + fixtures, candidates from the real Matcher.
import { describe, expect, it } from "vitest";
import type { KitPlan, KitSelection, Profile } from "@/contract";
import kitSample from "@/contract/fixtures/kit.sample.json";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { matchPlan } from "@/server/kit/matcher";
import { optimize } from "@/server/optimizer";
import { priceSelection, SelectionError } from "@/server/kit/selection";

const TODAY = "2026-09-02";

async function heroWorld(budget: number | null) {
  const adapter = new InMemoryAdapter();
  const plan = structuredClone(
    (kitSample as { event: string; data: { plan?: KitPlan } }[]).find((e) => e.event === "plan")!.data.plan!,
  );
  plan.budget = budget;
  const shops = await adapter.listShops();
  const vouchers = await adapter.listVouchers("lan");
  const match = await matchPlan(adapter, plan, { shops, today: TODAY });
  const price = (selection: KitSelection) =>
    priceSelection(plan, match.candidates, selection, shops, vouchers, { noMatch: match.noMatch, today: TODAY });
  const base = (profile: Profile) =>
    optimize({ plan, candidates: match.candidates, noMatch: match.noMatch, shops, vouchers, today: TODAY }, [
      profile,
    ])[0];
  return { plan, match, shops, vouchers, price, base };
}

const sel = (profile: Profile, picks: Record<string, string> = {}, dropped: string[] = []): KitSelection => ({
  profile,
  picks,
  dropped,
});

function expectTotalsAddUp(o: ReturnType<typeof optimize>[number]) {
  expect(o.lines.reduce((s, l) => s + l.lineTotal, 0)).toBe(o.itemsTotal);
  for (const l of o.lines) expect(l.lineTotal).toBe(l.product.price * l.quantity);
  expect(o.itemsTotal + o.shippingTotal - o.discountTotal).toBe(o.grandTotal);
  expect(o.savings.reduce((s, x) => s + x.amount, 0)).toBe(o.discountTotal);
  expect(o.shops.reduce((s, g) => s + g.subtotal, 0)).toBe(o.itemsTotal);
  expect(o.shops.reduce((s, g) => s + g.shipping, 0)).toBe(o.shippingTotal);
}

describe("priceSelection", () => {
  it("an empty selection = the Optimizer's option for that profile", async () => {
    const w = await heroWorld(1_500_000);
    for (const p of ["saver", "balanced", "premium"] as const) {
      const o = w.price(sel(p));
      const base = w.base(p);
      expect(o.profile).toBe(p);
      expect(o.lines.map((l) => l.product.id)).toEqual(base.lines.map((l) => l.product.id));
      expect(o.grandTotal).toBe(base.grandTotal);
      expect(o.status).toBe("ok");
    }
  });

  it("a swap replaces the line's product and re-prices exactly (balanced shoes → KidZone 359k)", async () => {
    const w = await heroWorld(1_500_000);
    const base = w.base("balanced");
    expect(base.lines.find((l) => l.itemKey === "shoes")!.product.id).toBe("prod-minhan-shoes");
    const o = w.price(sel("balanced", { shoes: "prod-kidzone-shoes" }));
    const shoes = o.lines.find((l) => l.itemKey === "shoes")!;
    expect(shoes.product.id).toBe("prod-kidzone-shoes");
    expect(shoes.shop.id).toBe(shoes.product.shopId);
    expect(o.itemsTotal).toBe(base.itemsTotal - 229_000 + 359_000);
    expectTotalsAddUp(o);
  });

  it("totals add up and stay consistent for 200 random selections (seeded)", async () => {
    const w = await heroWorld(1_500_000);
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const keys = Object.keys(w.match.candidates);
    for (let n = 0; n < 200; n++) {
      const profile = (["saver", "balanced", "premium"] as const)[Math.floor(rnd() * 3)];
      const picks: Record<string, string> = {};
      const dropped: string[] = [];
      for (const k of keys) {
        const r = rnd();
        const list = w.match.candidates[k];
        if (r < 0.4) picks[k] = list[Math.floor(rnd() * list.length)].product.id;
        else if (r < 0.5) dropped.push(k);
      }
      const o = w.price(sel(profile, picks, dropped));
      expectTotalsAddUp(o);
      for (const [k, id] of Object.entries(picks))
        if (!dropped.includes(k)) expect(o.lines.find((l) => l.itemKey === k)!.product.id).toBe(id);
      for (const k of dropped) expect(o.lines.some((l) => l.itemKey === k)).toBe(false);
      if (o.status === "ok") expect(o.grandTotal).toBeLessThanOrEqual(1_500_000);
      else expect(o.overBy).toBe(o.grandTotal - 1_500_000);
    }
  });

  it("a swap that pushes the 1M hero basket over budget ⇒ over_budget, overBy, 1–2 fit; a fits:true fit gives ≤ budget", async () => {
    const w = await heroWorld(1_000_000);
    const base = w.base("balanced");
    expect(base.status).toBe("ok");
    const o = w.price(
      sel("balanced", {
        shoes: "prod-kidzone-shoes",
        "water-bottle": "prod-kidzone-bottle",
        uniform: "prod-kidzone-uniform",
      }),
    );
    expect(o.status).toBe("over_budget");
    expect(o.overBy).toBe(o.grandTotal - 1_000_000);
    expect(o.overBy).toBeGreaterThan(0);
    expect(o.fit!.length).toBeGreaterThanOrEqual(1);
    expect(o.fit!.length).toBeLessThanOrEqual(2);
    expect(o.minimumCost).toBeLessThanOrEqual(o.grandTotal);
    expect(o.costDrivers!.length).toBeGreaterThan(0);
    expectTotalsAddUp(o);

    const fits = o.fit!.filter((f) => f.fits);
    expect(fits.length).toBeGreaterThan(0);
    for (const f of fits) {
      expect(f.dropsMustHave).toBe(false);
      const picks = {
        shoes: "prod-kidzone-shoes",
        "water-bottle": "prod-kidzone-bottle",
        uniform: "prod-kidzone-uniform",
      } as Record<string, string>;
      for (const s of f.swaps) picks[s.itemKey] = s.productId;
      const next = w.price(sel("balanced", picks, f.removeItemKeys));
      expect(next.grandTotal).toBe(f.grandTotal);
      expect(next.grandTotal).toBeLessThanOrEqual(1_000_000);
      expect(next.status).toBe("ok");
      expect(next.fit).toBeUndefined();
      for (const k of f.removeItemKeys) expect(next.skipped.map((s) => s.itemKey)).toContain(k);
    }
  });

  it("Add anyway of the closest backpack (Minh An) joins Minh An's shop group: no extra shipping, its vouchers apply", async () => {
    const w = await heroWorld(1_500_000);
    const base = w.base("saver");
    expect(base.noMatch.find((n) => n.itemKey === "backpack")!.closest!.candidate.product.id).toBe(
      "prod-minhan-backpack",
    );
    const o = w.price(sel("saver", { backpack: "prod-minhan-backpack" }));
    const line = o.lines.find((l) => l.itemKey === "backpack")!;
    expect(line.product.id).toBe("prod-minhan-backpack");
    expect(line.reason).toContain("anti-hunchback");
    expect(o.lines[0].itemKey).toBe("backpack"); // plan order
    expect(o.noMatch.some((n) => n.itemKey === "backpack")).toBe(false);
    const g = (x: typeof o) => x.shops.find((s) => s.shopId === line.shop.id)!;
    expect(g(o).subtotal).toBe(g(base).subtotal + line.product.price);
    expect(g(o).shipping).toBe(g(base).shipping);
    expect(o.shippingTotal).toBe(base.shippingTotal);
    expect(o.discountTotal).toBeGreaterThanOrEqual(base.discountTotal);
    expect(o.grandTotal).toBeLessThanOrEqual(base.grandTotal + line.product.price);
    expectTotalsAddUp(o);
  });

  it("Add anyway on its own shop: priced with that shop's shipping fee", async () => {
    const w = await heroWorld(3_000_000);
    const premium = w.base("premium");
    const minhan = w.shops.find((s) => s.id === "shop-minhan")!;
    const usesMinhan = premium.shops.some((g) => g.shopId === minhan.id);
    const o = w.price(sel("premium", { backpack: "prod-minhan-backpack" }));
    expectTotalsAddUp(o);
    const g = o.shops.find((s) => s.shopId === minhan.id)!;
    expect(g.shipping).toBe(minhan.shipFee);
    if (!usesMinhan) expect(o.shippingTotal).toBe(premium.shippingTotal + minhan.shipFee);
  });

  it("a pick that is neither a candidate, an alternative nor the closest of that item → SelectionError", async () => {
    const w = await heroWorld(1_500_000);
    expect(() => w.price(sel("balanced", { shoes: "prod-kidzone-bottle" }))).toThrow(SelectionError);
    expect(() => w.price(sel("balanced", { backpack: "prod-kidzone-lite-backpack" }))).toThrow(SelectionError);
    expect(() => w.price(sel("balanced", { nope: "prod-kidzone-shoes" }))).toThrow(SelectionError);
  });

  it("dropped wins over a pick of the same item", async () => {
    const w = await heroWorld(1_500_000);
    const o = w.price(sel("balanced", { shoes: "prod-kidzone-shoes" }, ["shoes"]));
    expect(o.lines.some((l) => l.itemKey === "shoes")).toBe(false);
    expect(o.skipped).toContainEqual({ itemKey: "shoes", needLabel: "School shoes", reason: "budget" });
  });
});
