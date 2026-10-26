// POST /api/seller/enrichment/apply (CONTRACT.md §3): { proposalId } → { product } with updatedForDemandAt set.
import { EnrichmentApplyRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { applyEnrichment } from "@/server/enrichment";
import { enrichmentRoute } from "@/server/enrichment/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = enrichmentRoute(EnrichmentApplyRequestSchema, "{ proposalId }", async (b) => ({
  product: await applyEnrichment(b.proposalId, { adapter: getAdapter() }),
}));
