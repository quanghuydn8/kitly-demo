// Enrichment merge (seam S4, pure). mergeEnrichment is ADDITIVE ONLY: the original title stays verbatim as the
// prefix (title = original + " | " + suffix, suffix trimmed at a word to fit MAX_TITLE, never the original), tags and
// attributes are unioned (an existing attribute value is never overwritten), and the description gets
// "\n\n" + descriptionAppend only when the append still holds new information after code drops every sentence that
// is already in the original description (case-insensitive). keywordCheck proves old title keywords still match.
import type { Product } from "@/contract";

export const MAX_TITLE = 120;
const SEP = " | ";

/** What the fast model drafts (after code filtering of tags, see propose.ts). */
export interface EnrichmentProposal {
  titleSuffix: string;
  tags: string[];
  attributes: Record<string, string>;
  descriptionAppend: string;
  evidence: string;
}
export type Listing = Pick<Product, "title" | "description" | "tags" | "attributes">;
export type Added = Omit<EnrichmentProposal, "evidence">;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function fitSuffix(title: string, suffix: string): string {
  // the model often wraps the suffix in its own separator ("— Ergonomic", ": A, B,"): we add " | " ourselves
  const clean = suffix.replace(/^[\s|—–\-:,;/]+|[\s|—–\-:,;/]+$/g, "");
  const room = MAX_TITLE - title.length - SEP.length;
  if (!clean || room <= 0) return "";
  if (clean.length <= room) return clean;
  const cut = clean.slice(0, room + 1);
  const atWord = cut.lastIndexOf(" ") > 0 ? cut.slice(0, cut.lastIndexOf(" ")) : clean.slice(0, room);
  return atWord.replace(/[\s,;:|/-]+$/, "");
}

/** Sentences of `append` not already contained (case-insensitive) in `description`, joined by one space. */
export function newSentencesOnly(append: string, description: string): string {
  const original = norm(description);
  return append
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s && !original.includes(norm(s)))
    .join(" ");
}

export function mergeEnrichment(listing: Listing, proposal: EnrichmentProposal): { listing: Listing; added: Added } {
  const titleSuffix = fitSuffix(listing.title, proposal.titleSuffix);
  const tags = [...new Set(proposal.tags)].filter((t) => !listing.tags.includes(t));
  const attributes = Object.fromEntries(
    Object.entries(proposal.attributes).filter(([k, v]) => !(k in listing.attributes) && v.trim() !== ""),
  );
  const descriptionAppend = newSentencesOnly(proposal.descriptionAppend, listing.description);
  return {
    listing: {
      title: titleSuffix ? listing.title + SEP + titleSuffix : listing.title,
      description: descriptionAppend ? listing.description + "\n\n" + descriptionAppend : listing.description,
      tags: [...listing.tags, ...tags],
      attributes: { ...listing.attributes, ...attributes },
    },
    added: { titleSuffix, tags, attributes, descriptionAppend },
  };
}

/** Every original title token (lowercased, ≥ 3 chars, deduped) and whether the new title still contains it. */
export function keywordCheck(old: Pick<Listing, "title">, next: Pick<Listing, "title">) {
  const newTitle = next.title.toLowerCase();
  const tokens = [...new Set(old.title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3))];
  return tokens.map((keyword) => ({ keyword, stillMatches: newTitle.includes(keyword) }));
}
