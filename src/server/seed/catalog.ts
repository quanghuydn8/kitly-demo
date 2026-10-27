// Catalog generator (ticket 01): the fast model writes ~6 products per category (Structured Outputs, canonical tags
// only), raw output cached in scripts/.cache/. Code then assigns shops/ids, clamps numbers, strips the planted-gap
// tags and inserts the planted products (DATA.md §4) so demo facts never depend on the LLM.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CANONICAL_TAGS, CATEGORIES } from "@/contract/taxonomy";
import { fixtures } from "@/contract/fixtures";
import type { Product } from "@/contract/types";
import type { LLM } from "@/server/llm";
import { PRICE_BANDS, SEED_SHOPS, SHOP_CATEGORIES } from "./world";

/** Categories fully planted by code (no LLM call). */
const PLANTED_CATEGORIES = ["school-backpack", "kids-raincoat"];
export const LLM_CATEGORIES = CATEGORIES.map((c) => c.id).filter((id) => !PLANTED_CATEGORIES.includes(id));

/** Tags only planted products may carry: they define the demo gaps. */
const GAP_TAGS = ["anti-hunchback", "backpack-cover", "anti-blue-light"];

const PLANTED_FIXTURE_IDS = [
  // backpacks: hero listing gap, the only anti-hunchback one, 3 cheap slow Bago, 2 mid-range kids+lightweight
  "prod-minhan-backpack",
  "prod-kidzone-ergo-backpack",
  "prod-bago-basic-backpack",
  "prod-bago-classic-backpack",
  "prod-bago-roomy-backpack",
  "prod-minhan-light-backpack",
  "prod-kidzone-air-backpack",
  // plain kids raincoats (no backpack-cover)
  "prod-kidzone-raincoat",
  "prod-bago-raincoat",
  "prod-homie-raincoat",
];

export function plantedProducts(): Product[] {
  const byId = new Map(fixtures.products.map((p) => [p.id, p]));
  const planted = PLANTED_FIXTURE_IDS.map((id) => {
    const p = byId.get(id);
    if (!p) throw new Error(`planted fixture product missing: ${id}`);
    return structuredClone(p);
  });
  planted.push({
    id: "prod-stepup-raincoat",
    shopId: "shop-stepup",
    title: "StepUp Kids Hooded Raincoat Bright Yellow",
    category: "kids-raincoat",
    description:
      "Lightweight PVC-free raincoat with a snap-button front and elastic cuffs. Reflective strip on the back for rainy mornings. Sizes for ages 4–10.",
    price: 95000,
    rating: 4.4,
    reviewCount: 233,
    soldCount: 1120,
    stock: 80,
    tags: ["kids", "waterproof"],
    attributes: { material: "EVA", sizes: "4-10 years" },
    shipDaysMin: 2,
    shipDaysMax: 4,
    updatedForDemandAt: null,
  });
  return planted;
}

const LlmProductSchema = z.object({
  title: z.string(),
  description: z.string(),
  price: z.number().int(),
  rating: z.number(),
  reviewCount: z.number().int(),
  soldCount: z.number().int(),
  stock: z.number().int(),
  shipDaysMin: z.number().int(),
  shipDaysMax: z.number().int(),
  tags: z.array(z.enum(CANONICAL_TAGS)),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })),
});
export const CategoryOutputSchema = z.object({ products: z.array(LlmProductSchema) });
type CategoryOutput = z.infer<typeof CategoryOutputSchema>;

function prompt(categoryId: string) {
  const c = CATEGORIES.find((x) => x.id === categoryId)!;
  const [lo, hi] = PRICE_BANDS[categoryId] ?? [50000, 1000000];
  const allowed = CANONICAL_TAGS.filter((t) => !GAP_TAGS.includes(t));
  return [
    {
      role: "system" as const,
      content:
        "You write realistic product listings for a fictional Vietnamese online marketplace. English only. " +
        "Use invented brand names only — never real brands, real shops or real marketplaces.",
    },
    {
      role: "user" as const,
      content: [
        `Category id: "${categoryId}" (${c.label}, shopping event: ${c.event}).`,
        "Write 6 different products for this category.",
        "- title: marketplace style, 6–12 words, includes the invented brand and a key spec.",
        "- description: 2–4 sentences with concrete specs (sizes, weight, capacity, materials, age range where relevant).",
        `- price: integer VND between ${lo} and ${hi}, rounded to 1000; vary budget to premium.`,
        "- rating 3.8–5.0, reviewCount 5–8000, soldCount ≥ reviewCount, stock 0–500 (at most one product at 0).",
        "- shipDaysMin/shipDaysMax between 1 and 9, min ≤ max.",
        `- tags: 1–4 tags from this list only, and only if the description supports them: ${allowed.join(", ")}.`,
        "- attributes: 2–5 key/value pairs (e.g. material, weight, capacity, size).",
      ].join("\n"),
    },
  ];
}

async function fetchCategory(
  llm: LLM,
  model: string,
  categoryId: string,
  cacheDir: string | null,
): Promise<CategoryOutput> {
  const file = cacheDir ? join(cacheDir, `${categoryId}.json`) : null;
  if (file && existsSync(file)) return CategoryOutputSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = await llm.structured(model, CategoryOutputSchema, prompt(categoryId), "category_products");
      if (out.products.length < 3) throw new Error(`only ${out.products.length} products`);
      if (file) {
        mkdirSync(cacheDir!, { recursive: true });
        writeFileSync(file, JSON.stringify(out, null, 2));
      }
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`catalog generation failed for ${categoryId}: ${String(lastErr)}`);
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function shopsCarrying(categoryId: string): string[] {
  return SEED_SHOPS.map((s) => s.id).filter((id) => SHOP_CATEGORIES[id]?.includes(categoryId));
}

function toProducts(categoryId: string, out: CategoryOutput): Product[] {
  const shops = shopsCarrying(categoryId);
  if (shops.length === 0) throw new Error(`no shop carries ${categoryId}`);
  const [lo, hi] = PRICE_BANDS[categoryId] ?? [10000, 50000000];
  return out.products.slice(0, 6).map((p, i) => {
    const shipDaysMin = clamp(Math.round(p.shipDaysMin), 1, 9);
    const attributes = Object.fromEntries(p.attributes.slice(0, 5).map((a) => [a.key, a.value]));
    return {
      id: `prod-${categoryId}-${i + 1}`,
      shopId: shops[i % shops.length],
      title: p.title.trim(),
      category: categoryId,
      description: p.description.trim(),
      price: Math.round(clamp(p.price, lo * 0.5, hi * 1.5) / 1000) * 1000,
      rating: Math.round(clamp(p.rating, 3.8, 5) * 10) / 10,
      reviewCount: clamp(Math.round(p.reviewCount), 5, 8000),
      soldCount: Math.max(Math.round(p.soldCount), Math.round(p.reviewCount)),
      stock: clamp(Math.round(p.stock), 0, 500),
      tags: [...new Set(p.tags)].filter((t) => !GAP_TAGS.includes(t)),
      attributes,
      shipDaysMin,
      shipDaysMax: clamp(Math.round(p.shipDaysMax), shipDaysMin, 9),
      updatedForDemandAt: null,
    };
  });
}

/** Max shipping days for the "express" product every LLM category must have (DATA.md §4 Coverage fill). */
const EXPRESS_DAYS = 2;

/**
 * Coverage fill (DATA.md §4): rehearsal probes showed urgent needs ("camping this weekend") hit no-match only because
 * no product in a category shipped fast enough. Unless the category already has one, the best-rated in-stock
 * product becomes a 1–2 day product. Only the 4 planted gaps should ever show "No suitable product".
 */
export function coverageFill(products: Product[]): Product[] {
  if (products.some((p) => p.stock > 0 && p.shipDaysMax <= EXPRESS_DAYS)) return products;
  const inStock = products.filter((p) => p.stock > 0);
  const pool = inStock.length ? inStock : products;
  const best = pool.reduce((a, p) => (p.rating > a.rating ? p : a), pool[0]);
  return products.map((p) =>
    p === best ? { ...p, stock: Math.max(p.stock, 50), shipDaysMin: 1, shipDaysMax: EXPRESS_DAYS } : p,
  );
}

/** Builds the full seeded catalog: LLM categories (cached, ≤ `concurrency` parallel calls) + planted products. */
export async function generateCatalog(opts: {
  llm: LLM;
  model: string;
  cacheDir: string | null;
  concurrency?: number;
}): Promise<Product[]> {
  const outputs = await mapLimit(LLM_CATEGORIES, opts.concurrency ?? 8, (c) =>
    fetchCategory(opts.llm, opts.model, c, opts.cacheDir),
  );
  const generated = LLM_CATEGORIES.flatMap((c, i) => coverageFill(toProducts(c, outputs[i])));
  return [...plantedProducts(), ...generated];
}
