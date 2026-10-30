// One AI advice sentence per gap (fast model), cached in insight_advice by gap key + counts signature: a cache hit
// never calls the LLM; when the counts change the sentence is regenerated. An LLM error falls back to a code
// sentence that is NOT cached (the next load tries the model again).
// LLM calls start synchronously in the order of `gaps` (after one parallel cache read), so FakeLLM tests can queue them.
import { z } from "zod";
import type { CategoryId } from "@/contract";
import type { AdviceStore } from "@/server/advicestore";
import { llmModels, type LLMClient } from "@/server/llm";
import { formatVnd } from "@/server/optimizer";

export interface AdviceInput {
  key: string;
  needLabel: string;
  category: CategoryId | null;
  tags: string[];
  thisWeek: number;
  lastWeek: number;
  matchingProducts: number;
  priceBand: { p25: number; p75: number } | null;
  neededWith: { category: CategoryId; share: number }[];
  /** For the selected shop: listing_gap = the shop already sells a fitting product (candidates) whose listing lacks the tags. */
  type?: "listing_gap" | "assortment_gap";
  candidates?: { title: string }[];
}

const isListing = (g: AdviceInput) => g.type === "listing_gap" && !!g.candidates?.length;
/** Listing-gap advice ("fix your listing") is cached apart from the shop-neutral advice of the same need. */
export const adviceKey = (g: AdviceInput) => (isListing(g) ? `${g.key}#listing` : g.key);

const AdviceSchema = z.object({ advice: z.string() });
const MAX_CHARS = 240;

export const countsSignature = (g: AdviceInput) => `${g.thisWeek}|${g.lastWeek}|${g.matchingProducts}`;

const band = (g: AdviceInput) => (g.priceBand ? `${formatVnd(g.priceBand.p25)}–${formatVnd(g.priceBand.p75)}` : null);

export function fallbackAdvice(g: AdviceInput): string {
  if (isListing(g))
    return `${g.thisWeek} buyers looked for "${g.needLabel}" this week: add ${g.tags.join(", ")} to your listing "${g.candidates![0].title}" so they find it.`;
  const trend = g.thisWeek > g.lastWeek ? "up from" : "vs";
  const tail = band(g) ? `buyers expect to pay ${band(g)}` : "worth checking whether you can source it";
  return `${g.thisWeek} buyers looked for "${g.needLabel}" this week (${trend} ${g.lastWeek} last week) and ${g.matchingProducts} products match; ${tail}.`;
}

/** First sentence, single-spaced, ≤ MAX_CHARS; "" if nothing usable. */
function oneSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const first = flat.split(/(?<=[.!?])\s/)[0] ?? "";
  return first.length > MAX_CHARS ? `${first.slice(0, MAX_CHARS - 1).trimEnd()}…` : first;
}

function adviceMessages(g: AdviceInput) {
  return [
    {
      role: "system" as const,
      content:
        "You advise sellers on an online marketplace. Write exactly ONE short, actionable sentence in English " +
        "(max 30 words) about this unmet buyer demand. Use only the facts given; never invent numbers, shops or products." +
        (isListing(g)
          ? " This seller ALREADY sells a product that fits (sellerListing) but its listing does not say so: advise them to update that listing" +
            " (add the missing tags to its title and tags). Never advise creating a new or duplicate listing."
          : " Nobody sells a product that fits: advise whether stocking it is worth considering (demand, trend, price band)."),
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        need: g.needLabel,
        category: g.category,
        tags: g.tags,
        buyersThisWeek: g.thisWeek,
        buyersLastWeek: g.lastWeek,
        matchingProductsOnMarketplace: g.matchingProducts,
        acceptedPriceBand: band(g),
        neededWith: g.neededWith.map((n) => n.category),
        ...(isListing(g) ? { gapType: "listing_gap", sellerListing: g.candidates![0].title, missingTags: g.tags } : {}),
      }),
    },
  ];
}

export async function adviceFor(gaps: AdviceInput[], llm: LLMClient, store: AdviceStore): Promise<string[]> {
  const cached = await Promise.all(gaps.map((g) => store.get(adviceKey(g)).catch(() => null)));
  const { fast } = llmModels();
  return Promise.all(
    gaps.map((g, i) => {
      const sig = countsSignature(g);
      const hit = cached[i];
      if (hit && hit.countsSignature === sig) return Promise.resolve(hit.advice);
      return llm
        .structured(fast.model, AdviceSchema, adviceMessages(g), { effort: fast.effort, name: "gap_advice" })
        .then(async ({ advice }) => {
          const sentence = oneSentence(advice);
          if (!sentence) return fallbackAdvice(g);
          await store.put(adviceKey(g), sig, sentence).catch((err) => console.warn(`[insights] advice cache write: ${err}`));
          return sentence;
        })
        .catch((err) => {
          console.warn(`[insights] gap_advice ${g.key} failed: ${err instanceof Error ? err.message : err}`);
          return fallbackAdvice(g);
        });
    }),
  );
}
