// Shared planted-fact assertions (DATA.md §4, §7, ticket 01 Full): used on the in-memory built world and on the
// seeded Supabase database.
import { expect } from "vitest";
import type { Persona, Product, Shop, Voucher } from "@/contract";
import { addDays } from "@/server/today";

export interface SeededFacts {
  products: Product[];
  vouchers: Voucher[];
  persona: Persona;
  shops: Shop[];
}

export function expectPlantedFacts(w: SeededFacts, today: string): void {
  const hero = w.products.find((p) => p.id === "prod-minhan-backpack");
  expect(hero).toEqual({
    id: "prod-minhan-backpack",
    shopId: "shop-minhan",
    title: "Minh An Kids Backpack New Model 2026",
    category: "school-backpack",
    description:
      "Padded ergonomic back panel with S-shaped straps that keep the spine straight. Weighs only 0.75 kg. Water-resistant fabric. Sized for children aged 6–8.",
    price: 349000,
    rating: 4.8,
    reviewCount: 412,
    soldCount: 1930,
    stock: 120,
    tags: ["kids"],
    attributes: { material: "polyester" },
    shipDaysMin: 1,
    shipDaysMax: 2,
    updatedForDemandAt: null,
  });

  const anti = w.products.filter((p) => p.tags.includes("anti-hunchback"));
  expect(anti.map((p) => [p.title, p.price, p.shopId, p.shipDaysMin, p.shipDaysMax])).toEqual([
    ["KidZone Ergo Spine-Care Backpack", 890000, "shop-kidzone", 1, 2],
  ]);
  expect(w.shops.find((s) => s.id === "shop-kidzone")?.tier).toBe("mall");
  expect(w.products.filter((p) => p.tags.includes("backpack-cover"))).toEqual([]);
  expect(w.products.filter((p) => p.tags.includes("anti-blue-light"))).toEqual([]);
  expect(w.products.filter((p) => p.category === "kids-desk-lamp").length).toBeGreaterThan(0);

  expect(w.products.find((p) => p.id === "prod-kidzone-lite-backpack")).toMatchObject({
    shopId: "shop-kidzone",
    title: "KidZone Lite Backpack Grade 1–3",
    price: 520000,
    rating: 4.9,
    reviewCount: 860,
    soldCount: 2400,
    stock: 40,
    shipDaysMin: 1,
    shipDaysMax: 2,
    tags: ["kids", "lightweight", "grade-1"],
    attributes: { weight: "0.6 kg", age: "6-9" },
  });

  expect(w.persona).toMatchObject({
    id: "lan",
    name: "Lan",
    address: { district: "Cau Giay", city: "Hanoi" },
    favoriteShopIds: ["shop-kidzone"],
  });
  expect(w.persona.cart).toHaveLength(1);
  expect(w.persona.cart[0].productId).toBe("prod-kidzone-lite-backpack");
  expect(w.persona.cart[0].addedAt.slice(0, 10)).toBe(addDays(today, -14));

  const code = (c: string) => w.vouchers.find((v) => v.code === c);
  expect(code("LAN-BTS10")).toMatchObject({
    scope: "platform",
    shopId: null,
    kind: "percent",
    value: 10,
    maxDiscount: 100000,
    minSpend: 500000,
    validUntil: addDays(today, 2),
    ownerPersona: "lan",
    label: "Back-to-school 10%",
  });
  expect(code("LAN-KZ80")).toMatchObject({
    scope: "shop",
    shopId: "shop-kidzone",
    kind: "fixed",
    value: 80000,
    maxDiscount: null,
    minSpend: 400000,
    validUntil: addDays(today, 28),
    ownerPersona: "lan",
    label: "KidZone 80k off",
  });
  const pub = w.vouchers.filter((v) => v.ownerPersona === null);
  expect(pub).toHaveLength(8);
  expect(pub.filter((v) => v.scope === "shop")).toHaveLength(5);
  expect(code("KITLY50")).toMatchObject({ scope: "platform", kind: "fixed", value: 50000, minSpend: 1000000 });
  expect(code("FREESHIP")).toMatchObject({ scope: "platform", kind: "freeship", value: 30000, minSpend: 200000 });
  expect(code("SAVE5")).toMatchObject({ kind: "percent", value: 5, maxDiscount: 40000, minSpend: 500000 });
  expect(code("MINHAN30")).toMatchObject({ shopId: "shop-minhan", kind: "fixed", value: 30000, minSpend: 300000 });
  expect(code("KIDZONE10")).toMatchObject({
    shopId: "shop-kidzone",
    kind: "percent",
    value: 10,
    maxDiscount: 50000,
    minSpend: 400000,
  });
  expect(w.vouchers).toHaveLength(10);
}
