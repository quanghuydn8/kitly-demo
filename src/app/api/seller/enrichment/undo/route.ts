// POST /api/seller/enrichment/undo (CONTRACT.md §3): { productId } → { product } restored; 404 if nothing to undo.
import { EnrichmentUndoRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { undoEnrichment } from "@/server/enrichment";
import { enrichmentRoute } from "@/server/enrichment/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = enrichmentRoute(EnrichmentUndoRequestSchema, "{ productId }", async (b) => ({
  product: await undoEnrichment(b.productId, { adapter: getAdapter() }),
}));
