// GET /api/seller/insights?shopId=<id|all> (CONTRACT §3 Seller Intelligence). Missing shopId = all; unknown shop → 404.
import type { NextRequest } from "next/server";
import type { InsightsResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { getAdviceStore } from "@/server/advicestore";
import { apiError, json } from "@/server/http/json";
import { buildInsights, UnknownShopError, type JudgeCache } from "@/server/insights";
import { getLLM } from "@/server/llm";
import { today } from "@/server/today";
import { getWatchStore } from "@/server/watchstore";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Process cache of listing-fit judgements, keyed by listing content (a cache, not state: safe per instance).
const judgeCache: JudgeCache = new Map();

export async function GET(request: NextRequest): Promise<Response> {
  const shopId = request.nextUrl.searchParams.get("shopId")?.trim() || "all";
  try {
    const body = await buildInsights(
      { adapter: getAdapter(), llm: getLLM(), advice: getAdviceStore(), watches: getWatchStore(), today: today(), judgeCache },
      shopId,
    );
    return json<InsightsResponse>(body);
  } catch (err) {
    if (err instanceof UnknownShopError) return apiError(404, "not_found", err.message);
    throw err;
  }
}
