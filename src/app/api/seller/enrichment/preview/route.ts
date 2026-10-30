// POST /api/seller/enrichment/preview { productId, gapKey } → EnrichmentPreviewResponse (CONTRACT §3, seam S4).
// The proposalId is a signed self-contained token (nothing kept in memory). Fast model: may take a while on a proxy.
import type { NextRequest } from "next/server";
import { EnrichmentPreviewRequestSchema, type EnrichmentPreviewResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { EnrichmentError, previewEnrichment } from "@/server/enrichment";
import { proposalSecret } from "@/server/enrichment/token";
import { apiError, json } from "@/server/http/json";
import { getLLM } from "@/server/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest): Promise<Response> {
  const body = EnrichmentPreviewRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(400, "bad_request", "Body must be { productId: string, gapKey: string }");
  try {
    const deps = { adapter: getAdapter(), llm: getLLM(), secret: proposalSecret(), nowMs: Date.now() };
    return json<EnrichmentPreviewResponse>(await previewEnrichment(deps, body.data.productId, body.data.gapKey));
  } catch (err) {
    if (err instanceof EnrichmentError) return apiError(err.status, err.code, err.message);
    throw err;
  }
}
