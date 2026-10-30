// POST /api/seller/enrichment/undo { productId } → { product } restored from the latest snapshot (CONTRACT §3);
// 404 when there is nothing to undo. Works any time after Apply (snapshots live in the adapter / product_versions).
import type { NextRequest } from "next/server";
import { EnrichmentUndoRequestSchema, type ProductResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { EnrichmentError, undoEnrichment } from "@/server/enrichment";
import { apiError, json } from "@/server/http/json";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  const body = EnrichmentUndoRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError(400, "bad_request", "Body must be { productId: string }");
  try {
    return json<ProductResponse>({ product: await undoEnrichment(getAdapter(), body.data.productId) });
  } catch (err) {
    if (err instanceof EnrichmentError) return apiError(err.status, err.code, err.message);
    throw err;
  }
}
