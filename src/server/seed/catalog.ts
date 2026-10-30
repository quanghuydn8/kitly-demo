// Catalog generator (DATA.md §3): the fast model writes 6 listings per category (2 budget / 2 mid / 2 premium) with a
// JSON schema; code sanitises every field, assigns shops, and caches the raw model output so re-runs are free.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Product } from "@/contract";
import { CANONICAL_TAGS, categoryById, EVENTS } from "@/contract";
import { llmModels, type LLMClient } from "@/server/llm";
import { shopsFor } from "./shops";

/** Never generated: reserved for the planted gaps (DATA.md §4). */
export const GAP_TAGS = ["anti-hunchback", "backpack-cover", "anti-blue-light"] as const;
const ALLOWED_TAGS = CANONICAL_TAGS.filter((t) => !(GAP_TAGS as readonly string[]).includes(t)) as [
  string,
  ...string[],
];

// Structured Outputs (strict): every field required, attributes as name/value pairs. Tags stay plain strings in the
// schema so a stray tag never fails the whole category; code filters them to the canonical list.
export const GeneratedCatalogSchema = z.object({
  products: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      tier: z.enum(["budget", "mid", "premium"]),
      price: z.number(),
      rating: z.number(),
      reviewCount: z.number(),
      soldCount: z.number(),
      stock: z.number(),
      shipDaysMin: z.number(),
      shipDaysMax: z.number(),
      tags: z.array(z.string()),
      attributes: z.array(z.object({ name: z.string(), value: z.string() })),
    }),
  ),
});
export type GeneratedCatalog = z.infer<typeof GeneratedCatalogSchema>;

export const DEFAULT_CACHE_DIR = path.resolve("scripts/.cache/catalog");

function prompt(category: string) {
  const c = categoryById(category);
  const event = c ? EVENTS[c.event].label : "general";
  return [
    {
      role: "system" as const,
      content:
        "You write realistic product listings for DemoMart, a fictional Vietnamese online marketplace. " +
        "Never use real brand, shop or marketplace names. Prices are integer VND, realistic for Vietnam in 2026.",
    },
    {
      role: "user" as const,
      content: [
        `Category id: ${category} (${c?.label ?? category}), shopping occasion: ${event}.`,
        "Write exactly 6 products: 2 budget, 2 mid and 2 premium (set `tier`). Premium products cost clearly more",
        "(the most expensive at least 3x the cheapest) and have higher ratings and more reviews.",
        "- title: marketplace-style English title, 4-10 words.",
        "- description: 2-4 sentences with concrete specs (size, weight, material, capacity, power, age range...).",
        "- rating 3.8-5.0, reviewCount 5-8000, soldCount, stock 0-500 (rarely 0), shipDaysMin/shipDaysMax 1-9",
        "  (most ship in 1-3 days, some budget ones in 5-9 days).",
        `- tags: 0-4 tags, ONLY from this list and only when the description supports them: ${ALLOWED_TAGS.join(", ")}.`,
        "- attributes: 2-5 short name/value pairs (e.g. weight / 0.5 kg).",
      ].join("\n"),
    },
  ];
}

/** Raw model output for one category, from the cache when present. */
export async function generateCategory(
  llm: LLMClient,
  category: string,
  cacheDir: string | null,
): Promise<GeneratedCatalog> {
  const file = cacheDir ? path.join(cacheDir, `${category}.json`) : null;
  if (file && fs.existsSync(file)) return GeneratedCatalogSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const { model, effort } = llmModels().fast;
  const out = await llm.structured(model, GeneratedCatalogSchema, prompt(category), { effort, name: "catalog" });
  if (file) {
    fs.mkdirSync(cacheDir!, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
  }
  return out;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/** Sanitised products for a category: ids, shops (cheap → regular, premium → mall), clamped numbers, canonical tags. */
export function toProducts(raw: GeneratedCatalog, category: string): Product[] {
  const shops = shopsFor(category);
  const allowed = new Set<string>(ALLOWED_TAGS);
  const rows = raw.products.slice(0, 6).sort((a, b) => a.price - b.price);
  return rows.map((r, i): Product => {
    const max = Math.round(clamp(r.shipDaysMax, 1, 9));
    const premium = i >= rows.length - 2 && rows.length >= 4;
    const rating = Math.round(clamp(r.rating, 3.8, 5) * 10) / 10;
    const attributes = Object.fromEntries(
      r.attributes
        .filter((a) => a.name.trim() && a.value.trim())
        .slice(0, 5)
        .map((a) => [a.name.trim(), a.value.trim()]),
    );
    return {
      id: `prod-${category}-${i + 1}`,
      shopId: shops[Math.floor((i * shops.length) / rows.length)].id,
      title: r.title.trim(),
      category,
      description: r.description.trim(),
      price: Math.max(1000, Math.round(r.price / 1000) * 1000),
      rating: premium ? Math.max(rating, 4.7) : rating,
      reviewCount: Math.round(clamp(r.reviewCount, 5, 8000)),
      soldCount: Math.round(clamp(r.soldCount, 0, 100000)),
      stock: Math.round(clamp(r.stock, 0, 500)),
      tags: [...new Set(r.tags.map((t) => t.trim().toLowerCase()))].filter((t) => allowed.has(t)),
      attributes,
      shipDaysMin: Math.min(Math.round(clamp(r.shipDaysMin, 1, 9)), max),
      shipDaysMax: max,
      updatedForDemandAt: null,
    };
  });
}
