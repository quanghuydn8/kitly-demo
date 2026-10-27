// POST /api/seller/enrichment/preview (CONTRACT.md §3): { productId, gapKey } → additive proposal (nothing written).
import { EnrichmentPreviewRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { previewEnrichment } from "@/server/enrichment";
import { enrichmentRoute } from "@/server/enrichment/route-helpers";
import { getLLM } from "@/server/llm";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel: many parallel LLM judge/advice calls via proxy; cold run 35 s+
export const dynamic = "force-dynamic";

export const POST = enrichmentRoute(EnrichmentPreviewRequestSchema, "{ productId, gapKey }", (b) =>
  previewEnrichment(b, { adapter: getAdapter(), llm: getLLM() }),
);
