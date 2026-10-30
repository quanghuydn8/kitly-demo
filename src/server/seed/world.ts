// buildWorld: the whole DemoMart world in memory (DATA.md §2–§7), ready to be written by `npm run seed`.
// LLM catalog per category (max 8 concurrent) → depth/express rules → planted products → vouchers, persona → demand.
import type { Persona, Product, Shop, Voucher } from "@/contract";
import { CATEGORIES } from "@/contract";
import type { LLMClient } from "@/server/llm";
import { DEFAULT_CACHE_DIR, generateCategory, toProducts } from "./catalog";
import { generateDemand, type SeedSession } from "./demand";
import { enforceDepth } from "./depth";
import { PLANTED_CATEGORIES, PLANTED_PRODUCTS, plantedPersona, plantedVouchers } from "./planted";
import { SHOPS, shopsFor } from "./shops";

export const LLM_CATEGORIES = CATEGORIES.map((c) => c.id).filter((id) => !PLANTED_CATEGORIES.includes(id));

export interface World {
  shops: Shop[];
  products: Product[];
  vouchers: Voucher[];
  personas: Persona[];
  sessions: SeedSession[];
  /** Categories whose LLM call failed (filled by code only). */
  failedCategories: string[];
}

async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  const worker = async () => {
    while (next < xs.length) {
      const i = next++;
      out[i] = await fn(xs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker));
  return out;
}

export async function buildWorld(opts: {
  llm: LLMClient;
  today: string;
  categories?: string[];
  cacheDir?: string | null;
  concurrency?: number;
  log?: (msg: string) => void;
}): Promise<World> {
  const categories = opts.categories ?? LLM_CATEGORIES;
  const cacheDir = opts.cacheDir === undefined ? DEFAULT_CACHE_DIR : opts.cacheDir;
  const failedCategories: string[] = [];

  const generated = await mapLimit(categories, opts.concurrency ?? 8, async (category) => {
    let products: Product[] = [];
    try {
      products = toProducts(await generateCategory(opts.llm, category, cacheDir), category);
    } catch (err) {
      failedCategories.push(category);
      opts.log?.(`catalog: ${category} LLM failed (${(err as Error).message}); filling by code`);
    }
    return enforceDepth(products, { category, shops: shopsFor(category) });
  });

  const products = [...PLANTED_PRODUCTS.map((p) => structuredClone(p)), ...generated.flat()];
  return {
    shops: structuredClone(SHOPS),
    products,
    vouchers: plantedVouchers(opts.today),
    personas: [plantedPersona(opts.today)],
    sessions: generateDemand({ catalog: products, today: opts.today }),
    failedCategories,
  };
}
