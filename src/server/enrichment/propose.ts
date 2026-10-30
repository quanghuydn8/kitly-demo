// proposeEnrichment (PRD Enrichment): the fast model drafts additive changes for one listing and one demand gap.
// CODE constrains the draft: a tag is kept only when (1) it is a gap tag or a tag the category already uses
// (`vocabulary`, so the model never invents tags; DEMO Beat 3 adds lightweight + grade-1 next to the gap tag),
// (2) it is not on the listing yet, and (3) its evidence quote is found in the listing text (title, description,
// attribute values; case/whitespace-insensitive). The model is told to put only NEW facts in descriptionAppend;
// mergeEnrichment enforces that too.
import { z } from "zod";
import type { Product } from "@/contract";
import { TAG_HINTS } from "@/server/insights/classify";
import { llmModels, type LLMClient } from "@/server/llm";
import type { EnrichmentProposal } from "./merge";

export interface GapRef {
  key: string;
  category: string | null;
  tags: string[];
}

const DraftSchema = z.object({
  titleSuffix: z.string(),
  tags: z.array(z.object({ tag: z.string(), evidence: z.string() })),
  attributes: z.array(z.object({ key: z.string(), value: z.string() })),
  descriptionAppend: z.string(),
});

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

function messages(p: Product, gap: GapRef, allowed: string[]) {
  return [
    {
      role: "system" as const,
      content:
        "You improve a marketplace listing so buyers searching for a need can find it. The change is ADDITIVE ONLY: " +
        "never rewrite or remove anything. Return: titleSuffix = a short phrase (≤ 60 chars) appended after the original " +
        "title, naming the key features; tags = tags from allowedTags that the listing text clearly supports, each with " +
        "the shortest exact quote from the listing that proves it (skip a tag you cannot quote); attributes = structured " +
        "facts stated in the listing that are not attributes yet (e.g. weight, age); descriptionAppend = only facts that " +
        "are not already in the listing (title, tags, attributes, description) — usually an empty string. Never invent facts.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        listing: { title: p.title, description: p.description, tags: p.tags, attributes: p.attributes },
        gapTags: gap.tags,
        // plain ids: "tag (hint)" strings were copied back as tag names (rehearsal 2) → hints go in their own field
        allowedTags: allowed,
        tagHints: Object.fromEntries(allowed.filter((t) => TAG_HINTS[t]).map((t) => [t, TAG_HINTS[t]])),
      }),
    },
  ];
}

/** Tags of a draft that are allowed and backed by a quote found in the listing text (first quote per tag). */
function keptTags(draft: z.infer<typeof DraftSchema>, allowed: string[], text: string) {
  const kept: { tag: string; evidence: string }[] = [];
  for (const { tag: raw, evidence } of draft.tags) {
    const tag = raw.split("(")[0].trim(); // a tag echoed with its hint still counts
    const quote = norm(evidence);
    if (!allowed.includes(tag) || kept.some((k) => k.tag === tag) || !quote || !text.includes(quote)) continue;
    kept.push({ tag, evidence: evidence.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "") });
  }
  return kept;
}

export async function proposeEnrichment(
  product: Product,
  gap: GapRef,
  deps: { llm: LLMClient; vocabulary: string[] },
): Promise<EnrichmentProposal> {
  const allowed = [...new Set([...gap.tags, ...deps.vocabulary])].filter((t) => !product.tags.includes(t));
  const { fast } = llmModels();
  const draftOnce = () =>
    deps.llm.structured(fast.model, DraftSchema, messages(product, gap, allowed), { effort: fast.effort, name: "enrichment_draft" });
  const text = norm([product.title, product.description, ...Object.values(product.attributes)].join(" \n "));
  let draft = await draftOnce();
  let kept = keptTags(draft, allowed, text);
  // the gap tag is what makes the listing match the need (Beat 4); a draft without it is asked again once
  if (!kept.some((k) => gap.tags.includes(k.tag))) {
    const again = await draftOnce();
    const keptAgain = keptTags(again, allowed, text);
    if (keptAgain.some((k) => gap.tags.includes(k.tag)) || keptAgain.length > kept.length) [draft, kept] = [again, keptAgain];
  }
  // evidence shown to the seller: the quote for the first gap tag kept, else the first kept quote
  const main = kept.find((k) => gap.tags.includes(k.tag)) ?? kept[0];
  return {
    titleSuffix: draft.titleSuffix.trim(),
    tags: kept.map((k) => k.tag),
    attributes: Object.fromEntries(draft.attributes.map((a) => [a.key.trim(), a.value.trim()]).filter(([k, v]) => k && v)),
    descriptionAppend: draft.descriptionAppend.trim(),
    evidence: main?.evidence ?? "",
  };
}
