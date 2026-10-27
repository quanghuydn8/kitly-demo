// POST /api/seller/enrichment/preview (CONTRACT.md §3): { productId, gapKey } → additive proposal (nothing written).
import { EnrichmentPreviewRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { previewEnrichment } from "@/server/enrichment";
import { enrichmentRoute } from "@/server/enrichment/route-helpers";
import { getLLM } from "@/server/llm";

export const runtime = "nodejs";
export const maxDuration = 120; // Vercel: LLM calls via proxy take 20–40 s
export const dynamic = "force-dynamic";

export const POST = enrichmentRoute(EnrichmentPreviewRequestSchema, "{ productId, gapKey }", (b) =>
  previewEnrichment(b, { adapter: getAdapter(), llm: getLLM() }),
);
