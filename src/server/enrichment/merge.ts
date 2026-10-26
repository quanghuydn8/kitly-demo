// Pure, additive-only listing merge (PRD "Enrichment", seam S4): the original title stays verbatim as the prefix,
// tags/attributes are unions (existing values win), the description gets one appended paragraph.
import type { Product } from "@/contract";

export const MAX_TITLE = 120;
const SEP = " | ";

/** What an enrichment adds. Tags here are already evidence-checked by proposeEnrichment. */
export interface Proposal {
  titleSuffix: string;
  tags: string[];
  attributes: Record<string, string>;
  descriptionAppend: string;
}

/** Cuts `s` to at most `max` chars at a word boundary, dropping trailing separators/punctuation. */
function fitWords(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const words = lastSpace > 0 ? cut.slice(0, lastSpace) : "";
  return words.replace(/[\s,;:|/&-]+$/, "");
}

export function mergeEnrichment(listing: Product, proposal: Proposal): Product {
  const suffix = fitWords(
    proposal.titleSuffix.trim().replace(/\s+/g, " "),
    MAX_TITLE - listing.title.length - SEP.length,
  );
  const append = proposal.descriptionAppend.trim();
  const attributes = { ...listing.attributes };
  for (const [k, v] of Object.entries(proposal.attributes))
    if (!(k in attributes) && v.trim()) attributes[k] = v.trim();
  return {
    ...structuredClone(listing),
    title: suffix ? `${listing.title}${SEP}${suffix}` : listing.title,
    description: append ? `${listing.description}\n\n${append}` : listing.description,
    tags: [...new Set([...listing.tags, ...proposal.tags])],
    attributes,
  };
}

const titleTokens = (title: string) =>
  title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);

/** Every original title keyword (lowercased, ≥ 3 chars) and whether the new title still contains it as a word. */
export function keywordCheck(
  oldListing: Pick<Product, "title">,
  newListing: Pick<Product, "title">,
): { keyword: string; stillMatches: boolean }[] {
  const now = new Set(titleTokens(newListing.title));
  return [...new Set(titleTokens(oldListing.title))].map((keyword) => ({
    keyword,
    stillMatches: now.has(keyword),
  }));
}
