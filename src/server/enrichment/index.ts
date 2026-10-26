// Listing enrichment (CONTRACT.md §3 /api/seller/enrichment/*): preview an additive fix for a demand gap, apply it
// through the CommerceAdapter (which snapshots + sets updatedForDemandAt), undo to the exact previous listing.
import { isDeepStrictEqual } from "node:util";
import type { CommerceAdapter, EnrichmentPreviewResponse, Product } from "@/contract";
import type { LLM } from "@/server/llm";
import { keywordCheck, mergeEnrichment } from "./merge";
import { parseGapKey, proposeEnrichment } from "./propose";
import { deleteProposal, getProposal, saveProposal } from "./proposals";

export { keywordCheck, mergeEnrichment, MAX_TITLE, type Proposal } from "./merge";
export { parseGapKey, proposeEnrichment } from "./propose";
export { PROPOSAL_TTL_MS, resetProposalsForTests, setEnrichmentClockForTests } from "./proposals";

export class EnrichmentError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 502,
    readonly code: "bad_request" | "not_found" | "conflict" | "llm_error",
    message: string,
  ) {
    super(message);
  }
}

export async function previewEnrichment(
  input: { productId: string; gapKey: string },
  deps: { adapter: CommerceAdapter; llm: LLM },
): Promise<EnrichmentPreviewResponse> {
  const gap = parseGapKey(input.gapKey);
  if (!gap) throw new EnrichmentError(400, "bad_request", `malformed gapKey ${input.gapKey}`);
  const before = await deps.adapter.getProduct(input.productId);
  if (!before) throw new EnrichmentError(404, "not_found", `unknown product ${input.productId}`);
  if (before.category !== gap.category)
    throw new EnrichmentError(
      400,
      "bad_request",
      `gap ${gap.key} is not in the product's category ${before.category}`,
    );

  const draft = await proposeEnrichment(before, gap, deps.llm).catch((e: unknown) => {
    throw new EnrichmentError(
      502,
      "llm_error",
      `enrichment draft failed: ${e instanceof Error ? e.message : e}`,
    );
  });
  const after = mergeEnrichment(before, draft);
  const proposalId = saveProposal({ productId: before.id, before, after });
  return {
    proposalId,
    before,
    after,
    added: {
      titleSuffix: after.title.slice(before.title.length).replace(/^ \| /, ""),
      tags: after.tags.filter((t) => !before.tags.includes(t)),
      attributes: Object.fromEntries(
        Object.entries(after.attributes).filter(([k]) => !(k in before.attributes)),
      ),
      descriptionAppend: after.description.slice(before.description.length).replace(/^\n\n/, ""),
    },
    kept: { title: before.title, tags: [...before.tags] },
    keywordCheck: keywordCheck(before, after),
    evidence: draft.evidence,
  };
}

/** Writes the previewed listing. 404 unknown/expired/used proposal; 409 if the listing changed since the preview. */
export async function applyEnrichment(
  proposalId: string,
  deps: { adapter: CommerceAdapter },
): Promise<Product> {
  const p = getProposal(proposalId);
  if (!p) throw new EnrichmentError(404, "not_found", `unknown or expired proposal ${proposalId}`);
  const current = await deps.adapter.getProduct(p.productId);
  if (!current) throw new EnrichmentError(404, "not_found", `unknown product ${p.productId}`);
  if (!isDeepStrictEqual(current, p.before))
    throw new EnrichmentError(409, "conflict", "the listing changed since the preview; preview again");
  const { title, description, tags, attributes } = p.after;
  const product = await deps.adapter.updateListing(p.productId, { title, description, tags, attributes });
  deleteProposal(proposalId);
  return product;
}

/** Restores the latest snapshot; 404 when there is nothing to undo. */
export async function undoEnrichment(
  productId: string,
  deps: { adapter: CommerceAdapter },
): Promise<Product> {
  const restored = await deps.adapter.undoListing(productId);
  if (!restored) throw new EnrichmentError(404, "not_found", `nothing to undo for ${productId}`);
  return restored;
}
