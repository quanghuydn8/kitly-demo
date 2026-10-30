// Listing vs assortment classification (CONTRACT §3, PRD Insights). Per visible gap, in this order:
//   1. appliedFix (specific shop only, code): a shop product in the gap category carrying every gap tag with
//      updatedForDemandAt set ⇒ listing_gap + appliedFix, no LLM call (stable across reloads; Undo clears it).
//   2. candidates (code): the shop's products (every shop for "all") in the gap category, price ≤ 1.3 × p75,
//      lacking ≥ 1 gap tag, id asc, at most MAX_JUDGED.
//   3. the fast model judges each candidate: does the description support the missing tags? (supports + quote).
//      Any supported ⇒ listing_gap with those candidates, else assortment_gap. An LLM error = not supported.
// Judgements run in parallel; each LLM call starts synchronously in (gap key, product id) order, so FakeLLM
// tests can queue answers in that order.
import { z } from "zod";
import type { Product } from "@/contract";
import { llmModels, type LLMClient } from "@/server/llm";
import type { GapStats } from "./aggregate";

export const PRICE_SLACK = 1.3;
export const MAX_JUDGED = 8;

export interface Judgement {
  supports: boolean;
  evidence: string;
}
/** Optional process cache of judgements, keyed by listing content (an edited listing is judged again). */
export type JudgeCache = Map<string, Judgement>;
const JUDGE_CACHE_MAX = 500;

export interface Classification {
  type: "listing_gap" | "assortment_gap";
  candidates?: { productId: string; title: string; evidence: string }[];
  appliedFix: { productId: string; title: string; appliedAt: string } | null;
}

const JudgementSchema = z.object({ supports: z.boolean(), evidence: z.string() });

// Plain-language meaning of tags the model is asked about (helps it read specs like "keeps the spine straight").
export const TAG_HINTS: Record<string, string> = {
  "anti-hunchback": "ergonomic back support / S-shaped straps that keep a child's spine straight",
  lightweight: "light weight, e.g. under about 1 kg for a backpack",
  waterproof: "waterproof or water-resistant material",
  "grade-1": "sized for primary-school children around 6 years old",
  "backpack-cover": "includes a cover/extension that fits over a school backpack",
  "anti-blue-light": "filters or reduces blue light",
};

const hasAll = (p: Product, tags: string[]) => tags.every((t) => p.tags.includes(t));

function judgeMessages(p: Product, missing: string[]) {
  return [
    {
      role: "system" as const,
      content:
        "You check marketplace listings. Decide whether the product DESCRIPTION (not the title alone) clearly supports " +
        "EVERY tag in tagsToCheck. Use only the listing text, never outside knowledge. supports = true only if the text " +
        "states it. evidence = the shortest exact quote from the description that proves it (empty string if not supported).",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        title: p.title,
        description: p.description,
        currentTags: p.tags,
        attributes: p.attributes,
        tagsToCheck: missing.map((t) => (TAG_HINTS[t] ? `${t} (${TAG_HINTS[t]})` : t)),
      }),
    },
  ];
}

function judge(llm: LLMClient, p: Product, missing: string[], cache?: JudgeCache): Promise<Judgement> {
  const key = JSON.stringify([p.id, p.title, p.description, [...p.tags].sort(), p.attributes, missing]);
  const hit = cache?.get(key);
  if (hit) return Promise.resolve(hit);
  const { fast } = llmModels();
  // started synchronously (see header): no await before llm.structured
  return llm
    .structured(fast.model, JudgementSchema, judgeMessages(p, missing), { effort: fast.effort, name: "listing_fit" })
    .then((j) => {
      const out = { supports: j.supports, evidence: j.evidence.trim() };
      if (cache) {
        if (cache.size >= JUDGE_CACHE_MAX) cache.clear();
        cache.set(key, out);
      }
      return out;
    })
    .catch((err) => {
      console.warn(`[insights] listing_fit ${p.id} failed: ${err instanceof Error ? err.message : err}`);
      return { supports: false, evidence: "" };
    });
}

/**
 * Classifies each gap for `shopId` ("all" = every shop). `products` = every product in the gaps' categories.
 * Returns one Classification per gap key.
 */
export async function classifyGaps(
  gaps: GapStats[],
  products: Product[],
  shopId: string,
  llm: LLMClient,
  cache?: JudgeCache,
): Promise<Map<string, Classification>> {
  const out = new Map<string, Classification>();
  const pending: { key: string; product: Product; done: Promise<Judgement> }[] = [];
  const assortment: Classification = { type: "assortment_gap", appliedFix: null };

  for (const gap of [...gaps].sort((a, b) => a.key.localeCompare(b.key))) {
    if (gap.category === null || gap.tags.length === 0) {
      out.set(gap.key, assortment);
      continue;
    }
    const mine = products
      .filter((p) => p.category === gap.category && (shopId === "all" || p.shopId === shopId))
      .sort((a, b) => a.id.localeCompare(b.id));

    const fixed = shopId === "all" ? undefined : mine.find((p) => hasAll(p, gap.tags) && p.updatedForDemandAt !== null);
    if (fixed) {
      out.set(gap.key, {
        type: "listing_gap",
        candidates: [],
        appliedFix: { productId: fixed.id, title: fixed.title, appliedAt: fixed.updatedForDemandAt! },
      });
      continue;
    }

    const maxPrice = gap.priceBand ? gap.priceBand.p75 * PRICE_SLACK : Infinity;
    const candidates = mine.filter((p) => !hasAll(p, gap.tags) && p.price <= maxPrice).slice(0, MAX_JUDGED);
    out.set(gap.key, assortment);
    for (const product of candidates) {
      const missing = gap.tags.filter((t) => !product.tags.includes(t));
      pending.push({ key: gap.key, product, done: judge(llm, product, missing, cache) });
    }
  }

  const judged = await Promise.all(pending.map(async (p) => ({ ...p, judgement: await p.done })));
  for (const { key, product, judgement } of judged) {
    if (!judgement.supports) continue;
    const current = out.get(key)!;
    const candidates = [...(current.candidates ?? []), { productId: product.id, title: product.title, evidence: judgement.evidence }];
    out.set(key, { type: "listing_gap", candidates, appliedFix: null });
  }
  return out;
}
