// Seller Intelligence (CONTRACT.md §3 GET /api/seller/insights): demand rows → top unmet gaps classified for one
// shop (or all shops) + advice, combos and top needs. Everything goes through the CommerceAdapter.
import type { CommerceAdapter, InsightsResponse, Product } from "@/contract";
import type { LLM } from "@/server/llm";
import { aggregateDemand, insightWindow } from "./aggregate";
import { adviseGaps } from "./advice";
import { classifyGap, type JudgeMemo } from "./classify";

export { JudgeError } from "./classify";

const TOP_GAPS = 8;

/** shopId is neither "all" nor a known shop. */
export class UnknownShopError extends Error {}

let judgeMemo: JudgeMemo = new Map();

/** Tests only: forget memoised listing judgements. */
export function resetInsightsCacheForTests(): void {
  judgeMemo = new Map();
}

export async function getSellerInsights(
  shopId: string | "all",
  deps: { adapter: CommerceAdapter; llm: LLM; today: string },
): Promise<InsightsResponse> {
  const { adapter, llm, today } = deps;
  if (shopId !== "all" && !(await adapter.listShops()).some((s) => s.id === shopId))
    throw new UnknownShopError(`unknown shop ${shopId}`);

  const window = insightWindow(today);
  const agg = aggregateDemand(await adapter.demandItemsSince(`${window.lastWeekFrom}T00:00:00.000Z`), window);
  const top = agg.gaps.slice(0, TOP_GAPS);

  const categories = [...new Set(top.flatMap((g) => (g.category ? [g.category] : [])))];
  const byCategory = new Map<string, Product[]>(
    await Promise.all(
      categories.map(async (c) => [c, await adapter.searchProducts({ category: c })] as const),
    ),
  );

  const classified = await Promise.all(
    top.map(async (g) => {
      const products = g.category ? (byCategory.get(g.category) ?? []) : [];
      const matchingProducts = g.category
        ? products.filter((p) => g.tags.every((t) => p.tags.includes(t))).length
        : 0;
      return { ...g, matchingProducts, ...(await classifyGap(g, products, shopId, llm, judgeMemo)) };
    }),
  );
  const advice = await adviseGaps(classified, adapter, llm);

  return {
    window,
    gaps: classified.map((g) => ({ ...g, advice: advice.get(g.key)! })),
    combos: agg.combos,
    topNeeds: agg.topNeeds,
  };
}
