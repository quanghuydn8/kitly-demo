// GET /api/seller/insights?shopId=<id|all> (CONTRACT.md §3): unmet demand gaps, combos and top needs.
// 400 without shopId, 404 for an unknown shop, 502 llm_error when the listing judge fails.
import type { NextRequest } from "next/server";
import { getAdapter } from "@/server/adapter";
import { apiError, handle, json } from "@/server/http";
import { getSellerInsights, JudgeError, UnknownShopError } from "@/server/insights";
import { getLLM } from "@/server/llm";
import { today } from "@/server/today";

export const runtime = "nodejs";
export const maxDuration = 120; // Vercel: LLM calls via proxy take 20–40 s
export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const shopId = req.nextUrl.searchParams.get("shopId")?.trim();
  if (!shopId) return apiError(400, "bad_request", "shopId is required (a shop id or 'all')");
  try {
    return json(await getSellerInsights(shopId, { adapter: getAdapter(), llm: getLLM(), today: today() }));
  } catch (e) {
    if (e instanceof UnknownShopError) return apiError(404, "not_found", e.message);
    if (e instanceof JudgeError) return apiError(502, "llm_error", `listing check failed: ${e.message}`);
    throw e;
  }
});
