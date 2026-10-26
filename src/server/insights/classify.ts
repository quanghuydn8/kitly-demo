// Gap classification (PRD "Insights"): listing gap = a shop already sells a fitting product whose listing lacks the
// needed tags, judged by the fast model from the product's own text; otherwise assortment gap.
// Code picks the candidates and verifies the evidence quote; the model only answers "does the text support it?".
import { z } from "zod";
import type { Product } from "@/contract";
import { models, type LLM } from "@/server/llm";
import type { GapStats } from "./aggregate";

/** Candidates may cost up to this multiple of the buyers' p75 budget hint. */
export const PRICE_SLACK = 1.3;

export interface Classification {
  type: "listing_gap" | "assortment_gap";
  candidates?: { productId: string; title: string; evidence: string }[];
}

const JudgementSchema = z.object({ supports: z.boolean(), evidence: z.string() });
type Judgement = z.infer<typeof JudgementSchema>;

const SYSTEM = [
  "You check a marketplace listing against buyer-need tags (kebab-case, e.g. anti-hunchback = ergonomic, spine-supporting back design; grade-1 = suits a child starting grade 1, about age 6; backpack-cover = comes with a cover that goes over a school backpack; anti-blue-light = filters blue light).",
  "supports = true only if the listing's own title or description clearly states EVERY one of needTags, judged by meaning, not exact words. Never assume features that are not written.",
  "evidence = the shortest exact quote copied verbatim from the description (or title) that proves it, max 20 words; empty string when supports is false.",
].join("\n");

/** Model call failed while judging a listing. The route maps it to 502 llm_error. */
export class JudgeError extends Error {}

const norm = (s: string) => s.toLowerCase().replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();

/** Every part of the quote (split on ellipses) must appear verbatim in the listing text. */
export function quoteIsVerbatim(evidence: string, p: Pick<Product, "title" | "description">): boolean {
  const hay = norm(`${p.title} ${p.description}`);
  const parts = evidence
    .split(/…|\.\.\./)
    .map((x) => norm(x).replace(/^[\s.,;:]+|[\s.,;:]+$/g, ""))
    .filter(Boolean);
  return parts.length > 0 && parts.every((x) => hay.includes(x));
}

/** In-process memo of judgements: same listing text + same missing tags ⇒ same answer. */
export type JudgeMemo = Map<string, Promise<Judgement>>;

function judge(llm: LLM, p: Product, needTags: string[], memo: JudgeMemo): Promise<Judgement> {
  const key = JSON.stringify([p.id, p.title, p.description, p.attributes, needTags]);
  const hit = memo.get(key);
  if (hit) return hit;
  const user = JSON.stringify({
    title: p.title,
    description: p.description,
    attributes: p.attributes,
    tags: p.tags,
    needTags,
  });
  const call = llm
    .structured(
      models.fast(),
      JudgementSchema,
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      "listing_fit",
    )
    .catch((e: unknown) => {
      memo.delete(key);
      throw new JudgeError(e instanceof Error ? e.message : String(e));
    });
  memo.set(key, call);
  return call;
}

/**
 * Candidates = products of the shop (or every shop) in the gap category, priced within PRICE_SLACK × p75,
 * lacking at least one gap tag. Any candidate whose description supports the missing tags (with a verbatim
 * quote) makes it a listing gap.
 */
export async function classifyGap(
  gap: GapStats,
  categoryProducts: Product[],
  shopId: string | "all",
  llm: LLM,
  memo: JudgeMemo,
): Promise<Classification> {
  if (!gap.category || gap.tags.length === 0) return { type: "assortment_gap" };
  const maxPrice = gap.priceBand ? gap.priceBand.p75 * PRICE_SLACK : Infinity;
  const pool = categoryProducts.filter(
    (p) =>
      (shopId === "all" || p.shopId === shopId) &&
      p.price <= maxPrice &&
      gap.tags.some((t) => !p.tags.includes(t)),
  );
  const judged = await Promise.all(
    pool.map(async (p) => {
      const missing = gap.tags.filter((t) => !p.tags.includes(t));
      const j = await judge(llm, p, missing, memo);
      const ok = j.supports && quoteIsVerbatim(j.evidence, p);
      return ok ? [{ productId: p.id, title: p.title, evidence: j.evidence.trim() }] : [];
    }),
  );
  const candidates = judged.flat();
  return candidates.length ? { type: "listing_gap", candidates } : { type: "assortment_gap" };
}
