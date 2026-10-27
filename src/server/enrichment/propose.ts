// proposeEnrichment (PRD "Enrichment"): the fast model drafts additions for one listing + one demand gap; code keeps
// only canonical tags the listing lacks whose evidence quote appears verbatim in the listing's own text.
import { z } from "zod";
import { CANONICAL_TAGS, type Product } from "@/contract";
import { quoteIsVerbatim } from "@/server/insights/classify";
import { models, type LLM } from "@/server/llm";
import type { Proposal } from "./merge";

export interface Gap {
  key: string;
  category: string;
  tags: string[];
}

/** `${category}|${sorted tags joined by ","}` (insights gap key) → parts; null when malformed. */
export function parseGapKey(key: string): Gap | null {
  const m = /^([a-z0-9-]+)\|([a-z0-9,-]*)$/.exec(key);
  if (!m || m[1] === "none") return null;
  return { key, category: m[1], tags: m[2] ? m[2].split(",") : [] };
}

const DraftSchema = z.object({
  titleSuffix: z.string(),
  // Plain string (not an enum) so one off-list tag drops that tag in code instead of failing the whole draft.
  tags: z.array(z.object({ tag: z.string(), evidence: z.string() })),
  attributes: z.array(z.object({ name: z.string(), value: z.string() })),
  descriptionAppend: z.string(),
});

const SYSTEM = [
  "You improve one marketplace listing so buyers searching for an unmet need can find it. Additive only: you never rewrite what is there.",
  "Only claim what the listing's own title or description already states. Never invent features, sizes or certifications.",
  "tags: canonical tags the listing does not have yet and its text supports. Always consider needTags first, then other canonical tags (e.g. lightweight from a stated low weight, grade-1 from an age of about 6, waterproof from water-resistant). For each tag, evidence = an exact quote copied verbatim from the description or title, max 20 words.",
  "titleSuffix: max 40 characters, English, the key buyer terms (e.g. 'Anti-Hunchback, Lightweight, Grade 1'); do not repeat words already in the title.",
  "attributes: short name/value pairs stated in the text (e.g. weight '0.75 kg', age '6-8'); skip names the listing already has.",
  "descriptionAppend: one or two plain English sentences with ONLY information that is not already in the description (a feature the title/tags/attributes make clear but the description never says, in buyer words), no hype. Never restate or reword a sentence the description already has. If there is nothing new to add, return an empty string.",
].join("\n");

const CANONICAL = new Set<string>(CANONICAL_TAGS);

export interface DraftedProposal extends Proposal {
  evidence: string;
}

export async function proposeEnrichment(product: Product, gap: Gap, llm: LLM): Promise<DraftedProposal> {
  const user = JSON.stringify({
    title: product.title,
    description: product.description,
    tags: product.tags,
    attributes: product.attributes,
    needTags: gap.tags,
    canonicalTags: CANONICAL_TAGS,
  });
  const draft = await llm.structured(
    models.fast(),
    DraftSchema,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    "listing_enrichment",
  );
  const kept = new Map<string, string>();
  for (const { tag, evidence } of draft.tags) {
    if (!CANONICAL.has(tag) || product.tags.includes(tag) || kept.has(tag)) continue;
    if (!evidence.trim() || !quoteIsVerbatim(evidence, product)) continue;
    kept.set(tag, evidence.trim().replace(/[\s.,;:…]+$/, ""));
  }
  // Gap tags first, then the other supported tags in model order.
  const tags = [...kept.keys()].sort((a, b) => rank(gap, a) - rank(gap, b));
  const attributes: Record<string, string> = {};
  for (const { name, value } of draft.attributes) {
    const k = name.trim().toLowerCase();
    if (k && value.trim() && !(k in attributes)) attributes[k] = value.trim();
  }
  return {
    titleSuffix: draft.titleSuffix,
    tags,
    attributes,
    descriptionAppend: onlyNewSentences(draft.descriptionAppend, product.description),
    evidence: [...new Set(tags.map((t) => kept.get(t)!))].join(" … "),
  };
}

const words = (t: string) => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
/** A sentence counts as "already said" when at least this share of its words appear in the description. */
const ALREADY_SAID = 0.7;

/** Code guard for F13: keeps only the appended sentences that add words the description does not already contain. */
export function onlyNewSentences(append: string, description: string): string {
  const known = new Set(words(description));
  return append
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((sentence) => {
      const w = words(sentence);
      return w.length > 0 && w.filter((x) => known.has(x)).length / w.length < ALREADY_SAID;
    })
    .join(" ");
}

const rank = (gap: Gap, tag: string) => (gap.tags.includes(tag) ? gap.tags.indexOf(tag) : gap.tags.length);
