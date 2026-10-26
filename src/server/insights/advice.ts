// Seller advice (PRD "Insights"): one fast-model sentence per gap, cached in insight_advice by gap key and a
// counts signature — counts change ⇒ regenerated. The advice depends on the gap type (which depends on the
// selected shop), so the cache row key is `${gapKey}#${type}`: switching shops never thrashes the cache. A model failure falls back to a code
// sentence that is NOT cached, so the next request retries the model.
import { z } from "zod";
import type { CommerceAdapter } from "@/contract";
import { models, type LLM } from "@/server/llm";
import { formatVnd } from "@/server/optimizer/present";
import type { GapStats } from "./aggregate";
import type { Classification } from "./classify";

export type AdviceInput = GapStats & Classification & { matchingProducts: number };

const AdviceSchema = z.object({ advice: z.string().min(1) });

const SYSTEM = [
  "You advise a marketplace seller about one unmet buyer need, in English, in exactly ONE sentence of at most 30 words.",
  "listing_gap: a product that fits already exists but its listing does not say so — tell the seller to add the missing details (name the tags in plain words) to that listing; never suggest a duplicate listing.",
  "assortment_gap: nobody sells a fitting product — give decision support (demand, trend, accepted price band, what it is bought with); do not promise sales.",
  "Use only the facts given. No product names, no markdown.",
].join("\n");

export const countsSignature = (g: AdviceInput) => `${g.thisWeek}/${g.lastWeek}`;
const cacheKey = (g: AdviceInput) => `${g.key}#${g.type}`;

const band = (g: AdviceInput) =>
  g.priceBand ? `${formatVnd(g.priceBand.p25)}–${formatVnd(g.priceBand.p75)}` : null;

function facts(g: AdviceInput) {
  return {
    needLabel: g.needLabel,
    type: g.type,
    category: g.category,
    missingTags: g.tags,
    thisWeek: g.thisWeek,
    lastWeek: g.lastWeek,
    acceptedPriceBand: band(g),
    neededWith: g.neededWith.map((n) => `${n.category} (${Math.round(n.share * 100)}% of these buyers)`),
    productsThatMatchToday: g.matchingProducts,
  };
}

export function fallbackAdvice(g: AdviceInput): string {
  const demand = `${g.thisWeek} buyers this week (${g.lastWeek} last week) asked for ${g.needLabel.toLowerCase()}`;
  if (g.type === "listing_gap")
    return `${demand}; add ${g.tags.join(", ")} to the listing that already fits so they can find it.`;
  const price = band(g);
  return `${demand} and ${g.matchingProducts} products match; consider stocking it${price ? ` at ${price}` : ""}.`;
}

async function generate(llm: LLM, g: AdviceInput): Promise<string | null> {
  try {
    const out = await llm.structured(
      models.fast(),
      AdviceSchema,
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(facts(g)) },
      ],
      "seller_advice",
    );
    return out.advice.replace(/\s+/g, " ").trim() || null;
  } catch (e) {
    console.error("seller advice failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Advice per gap key: cached rows with the same signature are reused, the rest generated and saved. */
export async function adviseGaps(
  gaps: AdviceInput[],
  adapter: CommerceAdapter,
  llm: LLM,
): Promise<Map<string, string>> {
  const cached = new Map((await adapter.getInsightAdvice(gaps.map(cacheKey))).map((r) => [r.gapKey, r]));
  const out = new Map<string, string>();
  await Promise.all(
    gaps.map(async (g) => {
      const sig = countsSignature(g);
      const hit = cached.get(cacheKey(g));
      if (hit && hit.countsSignature === sig) return void out.set(g.key, hit.advice);
      const advice = await generate(llm, g);
      if (advice === null) return void out.set(g.key, fallbackAdvice(g));
      await adapter.saveInsightAdvice({ gapKey: cacheKey(g), countsSignature: sig, advice });
      out.set(g.key, advice);
    }),
  );
  return out;
}
