// POST /api/kit/price (CONTRACT §3 "Kit edits"): { threadId, selection } → { option } — the buyer's swaps / Add anyway /
// drops re-priced exactly (priceSelection, + fit when over budget), saved on the latest version (no new version).
// Code only, no LLM. Not the caller's thread → 404; a pick that is not an option of its item → 400.
import type { NextRequest } from "next/server";
import { PriceRequestSchema, type PriceResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { getKitStore } from "@/server/kitstore";
import { apiError, json } from "@/server/http/json";
import { ownerFrom } from "@/server/http/request";
import { matchPlan } from "@/server/kit/matcher";
import { priceSelection, SelectionError } from "@/server/kit/selection";
import { today } from "@/server/today";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const t0 = performance.now();
  const body = PriceRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !body.data.threadId) {
    return apiError(400, "bad_request", "Body must be { threadId: string, selection: KitSelection }");
  }
  const owner = ownerFrom(request);
  if (!owner) return apiError(400, "no_owner", "Missing kitly_uid cookie");
  const store = getKitStore();
  const thread = await store.getThread(body.data.threadId, owner);
  const latest = thread?.versions.at(-1);
  if (!thread || !latest) return apiError(404, "not_found", "Kit not found");
  if (latest.status !== "ready") return apiError(409, "no_options", "This kit is waiting for a budget");

  const adapter = getAdapter();
  const day = today();
  const [shops, vouchers] = await Promise.all([adapter.listShops(), adapter.listVouchers(thread.thread.persona)]);
  const match = await matchPlan(adapter, latest.plan, { shops, today: day });
  const { selection } = body.data;
  try {
    const option = priceSelection(latest.plan, match.candidates, selection, shops, vouchers, { noMatch: match.noMatch, today: day });
    await store.saveSelection(thread.thread.id, owner, selection);
    console.info(`[kit] price ${selection.profile} ${Math.round(performance.now() - t0)}ms`);
    return json<PriceResponse>({ option });
  } catch (err) {
    if (err instanceof SelectionError) return apiError(400, "bad_selection", err.message);
    throw err;
  }
}
