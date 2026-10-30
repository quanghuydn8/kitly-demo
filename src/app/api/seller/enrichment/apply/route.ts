// POST /api/seller/enrichment/apply { proposalId } → { product } (CONTRACT §3). Bad signature / expired / already
// applied → 404; listing changed since the preview → 409. Snapshot + updatedForDemandAt happen in the adapter.
import type { NextRequest } from "next/server";
import { EnrichmentApplyRequestSchema, type ProductResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { applyEnrichment, EnrichmentError } from "@/server/enrichment";
import { proposalSecret } from "@/server/enrichment/token";
import { apiError, json } from "@/server/http/json";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const body = EnrichmentApplyRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(400, "bad_request", "Body must be { proposalId: string }");
  try {
    const product = await applyEnrichment(
      { adapter: getAdapter(), secret: proposalSecret(), nowMs: Date.now() },
      body.data.proposalId,
    );
    return json<ProductResponse>({ product });
  } catch (err) {
    if (err instanceof EnrichmentError) return apiError(err.status, err.code, err.message);
    throw err;
  }
}
