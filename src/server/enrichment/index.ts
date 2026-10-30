// Listing enrichment (CONTRACT §3 /api/seller/enrichment/*, seam S4): preview → apply → undo.
// preview: fast-model draft (proposeEnrichment) → pure mergeEnrichment + keywordCheck → signed proposal token.
// apply:   verify the token (bad/expired → not found); listing already equals `after` → not found (used);
//          listing differs from `before` → conflict; else adapter.updateListing (snapshots, sets updatedForDemandAt).
// undo:    adapter.undoListing (restores the latest snapshot incl. updatedForDemandAt) → not found when none.
// No process memory anywhere (serverless-safe).
import type { CommerceAdapter, EnrichmentPreviewResponse, Product } from "@/contract";
import type { LLMClient } from "@/server/llm";
import { keywordCheck, mergeEnrichment, type Listing } from "./merge";
import { proposeEnrichment, type GapRef } from "./propose";
import { signProposal, verifyProposal } from "./token";

export { keywordCheck, mergeEnrichment, type EnrichmentProposal } from "./merge";
export { proposeEnrichment } from "./propose";

export class EnrichmentError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 502,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EnrichmentError";
  }
}

export interface EnrichmentDeps {
  adapter: CommerceAdapter;
  secret: string;
  nowMs: number;
}

const listingOf = (p: Pick<Product, keyof Listing>): Listing => ({
  title: p.title,
  description: p.description,
  tags: p.tags,
  attributes: p.attributes,
});
// attribute key order is not meaningful (jsonb in Postgres does not keep it)
const canonical = (l: Listing) =>
  JSON.stringify([l.title, l.description, l.tags, Object.entries(l.attributes).sort(([a], [b]) => a.localeCompare(b))]);
const sameListing = (a: Listing, b: Listing) => canonical(a) === canonical(b);

/** gapKey = `${category}|${sorted tags joined by ","}` (insights). "none|" (no category) cannot be enriched. */
function parseGapKey(key: string): GapRef | null {
  const bar = key.indexOf("|");
  if (bar <= 0) return null;
  const category = key.slice(0, bar);
  const tags = key.slice(bar + 1).split(",").map((t) => t.trim()).filter(Boolean);
  if (category === "none" || tags.length === 0) return null;
  return { key, category, tags };
}

export async function previewEnrichment(
  deps: EnrichmentDeps & { llm: LLMClient },
  productId: string,
  gapKey: string,
): Promise<EnrichmentPreviewResponse> {
  const product = await deps.adapter.getProduct(productId);
  if (!product) throw new EnrichmentError(404, "not_found", `Unknown product ${productId}`);
  const gap = parseGapKey(gapKey);
  if (!gap || gap.category !== product.category) {
    throw new EnrichmentError(400, "bad_gap", `Gap ${gapKey} does not fit a ${product.category} listing`);
  }
  // tags the category already uses: the only extra tags the draft may add next to the gap's (no invented tags)
  const vocabulary = [...new Set((await deps.adapter.searchProducts({ category: product.category })).flatMap((p) => p.tags))];

  let proposal;
  try {
    proposal = await proposeEnrichment(product, gap, { llm: deps.llm, vocabulary });
  } catch (err) {
    console.warn(`[enrichment] draft ${productId} failed: ${err instanceof Error ? err.message : err}`);
    throw new EnrichmentError(502, "llm_error", "Could not draft the enrichment, try again");
  }
  const before = listingOf(product);
  const { listing: after, added } = mergeEnrichment(before, proposal);
  if (sameListing(before, after)) throw new EnrichmentError(409, "nothing_to_add", "Nothing new to add to this listing");

  const proposalId = signProposal(
    { productId, before, after, createdAt: new Date(deps.nowMs).toISOString() },
    deps.secret,
  );
  return {
    proposalId,
    before: product,
    after: { ...product, ...after },
    added,
    kept: { title: product.title, tags: product.tags },
    keywordCheck: keywordCheck(before, after),
    evidence: proposal.evidence,
  };
}

export async function applyEnrichment(deps: EnrichmentDeps, proposalId: string): Promise<Product> {
  const payload = verifyProposal(proposalId, deps.secret, deps.nowMs);
  if (!payload) throw new EnrichmentError(404, "not_found", "Proposal not found or expired");
  const product = await deps.adapter.getProduct(payload.productId);
  if (!product) throw new EnrichmentError(404, "not_found", "Product not found");
  const current = listingOf(product);
  if (sameListing(current, payload.after)) throw new EnrichmentError(404, "not_found", "Proposal already applied");
  if (!sameListing(current, payload.before)) {
    throw new EnrichmentError(409, "listing_changed", "The listing changed since the preview, preview again");
  }
  return deps.adapter.updateListing(payload.productId, payload.after);
}

export async function undoEnrichment(adapter: CommerceAdapter, productId: string): Promise<Product> {
  const product = await adapter.undoListing(productId);
  if (!product) throw new EnrichmentError(404, "not_found", "Nothing to undo");
  return product;
}
