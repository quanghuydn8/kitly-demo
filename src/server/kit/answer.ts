// Answer turns (D42, CONTRACT §3 refine intent "answer"): the buyer asks about the kit, a product or the occasion
// without changing a constraint. The fast model streams a short answer (≤ 80 words, plan language) from the current
// version's option, the facts of the products the message names (else the whole basket) and the SalesContext.
// No new version, no intent session, no demand.
import type { BasketOption, Candidate, KitPlan, Product, SalesContext, Shop } from "@/contract";
import { llmModels, type LLMClient, type LLMMessage } from "@/server/llm";
import { formatVnd } from "@/server/optimizer";

export const ANSWER_MAX_WORDS = 80;

type Known = { product: Product; shop: Shop; itemKey: string };

/** Every product the buyer can see in this option: basket lines, closest products, cart interests. */
function knownProducts(option: BasketOption | null): Known[] {
  if (!option) return [];
  const seen = new Set<string>();
  const out: Known[] = [];
  const add = (itemKey: string, c: Pick<Candidate, "product" | "shop">) => {
    if (seen.has(c.product.id)) return;
    seen.add(c.product.id);
    out.push({ itemKey, product: c.product, shop: c.shop });
  };
  for (const l of option.lines) add(l.itemKey, l);
  for (const n of option.noMatch) if (n.closest) add(n.itemKey, n.closest.candidate);
  for (const i of option.interests ?? []) add(i.itemKey, i.candidate);
  return out;
}

const firstWords = (s: string, n: number) => s.toLowerCase().split(/\s+/).slice(0, n).join(" ");

/**
 * Products the message names: by the first two words of the title ("Minh An", "KidZone Lite") or the shop name;
 * else the products of the plan items the message names ("backpack"); else the whole basket.
 */
export function productsForQuestion(message: string, plan: KitPlan, option: BasketOption | null): Known[] {
  const text = message.toLowerCase();
  const known = knownProducts(option);
  const named = known.filter((k) => text.includes(firstWords(k.product.title, 2)) || text.includes(k.shop.name.toLowerCase()));
  if (named.length) return named;
  const items = plan.items.filter((i) =>
    i.needLabel
      .toLowerCase()
      .split(/[^\p{L}]+/u)
      .some((w) => w.length >= 4 && text.includes(w)),
  );
  const byItem = known.filter((k) => items.some((i) => i.key === k.itemKey));
  if (byItem.length) return byItem;
  return known.filter((k) => option?.lines.some((l) => l.product.id === k.product.id));
}

function productFacts(k: Known): string {
  const p = k.product;
  const days = p.shipDaysMin === p.shipDaysMax ? `${p.shipDaysMax}` : `${p.shipDaysMin}–${p.shipDaysMax}`;
  return (
    `- ${p.title} (${k.shop.name}): ${p.description} Tags: ${p.tags.join(", ") || "none"}. ` +
    `price ${formatVnd(p.price)}, rating ${p.rating} (${p.reviewCount} reviews), ships in ${days} days`
  );
}

export interface AnswerInput {
  plan: KitPlan;
  option: BasketOption | null;
  sales: SalesContext;
  message: string;
}

export function answerMessages(input: AnswerInput): LLMMessage[] {
  const { plan, option, sales, message } = input;
  const lang = plan.language === "vi" ? "Vietnamese" : "English";
  const system = [
    `You are Kitly, a shopping assistant. Answer the buyer's question about their kit in ${lang}. Plain text, no markdown.`,
    `Hard limit: at most ${ANSWER_MAX_WORDS} words. Be direct and honest: if a product lacks something (a tag), say so and what the description says.`,
    "Use only the facts below (products, kit, sales context); never invent products, prices, dates or specs. Money format: 440.000₫.",
    "When the buyer asks for a better, cheaper or different product, name the listed alternatives (title, price, how the item total changes, arrival); say there is none only when no alternative is listed for that item.",
    "Do not ask a follow-up question (one is added separately). Do not change the kit.",
  ].join("\n");
  const facts: string[] = [`Buyer question: ${message}`, "Products:", ...productsForQuestion(message, plan, option).map(productFacts)];
  if (option) {
    facts.push(
      `Kit (${option.profile}): total ${formatVnd(option.grandTotal)}, budget ${plan.budget === null ? "none" : formatVnd(plan.budget)}, deadline ${plan.deadline ?? "none"}`,
      ...option.lines.map((l) => `- ${plan.items.find((i) => i.key === l.itemKey)?.needLabel ?? l.itemKey}: ${l.product.title}, ${formatVnd(l.lineTotal)}`),
    );
    for (const n of option.noMatch) facts.push(`- ${n.needLabel}: no exact match`);
    // The alternatives the panel shows under the asked-about lines (31/10: without them the model said a fancier
    // lunch box did not exist while the panel listed one).
    const asked = new Set(productsForQuestion(message, plan, option).map((k) => k.itemKey));
    for (const l of option.lines) {
      if (!asked.has(l.itemKey) || l.alternatives.length === 0) continue;
      const label = plan.items.find((i) => i.key === l.itemKey)?.needLabel ?? l.itemKey;
      facts.push(`Alternatives for ${label} (instead of ${l.product.title}, ${formatVnd(l.product.price)}):`);
      for (const a of l.alternatives) {
        const delta = (a.product.price - l.product.price) * l.quantity;
        // Code does the maths (the model added its own total and missed that it broke the budget).
        const after = option.grandTotal + delta;
        const over = plan.budget !== null && after > plan.budget ? `, over budget by ${formatVnd(after - plan.budget)}` : "";
        facts.push(
          `- ${a.product.title} (${a.shop.name}): price ${formatVnd(a.product.price)}, rating ${a.product.rating}, ` +
            `arrives ${a.arrivesBy}; swapping makes the kit about ${formatVnd(after)} ` +
            `(${delta >= 0 ? "+" : "−"}${formatVnd(Math.abs(delta))}, vouchers may change it)${over}`,
        );
      }
    }
  } else {
    facts.push("Kit: no basket yet (waiting for a budget)");
  }
  facts.push(`Sales context (JSON): ${JSON.stringify(sales)}`);
  return [
    { role: "system", content: system },
    { role: "user", content: facts.join("\n") },
  ];
}

export function streamAnswer(llm: LLMClient, input: AnswerInput, signal?: AbortSignal): AsyncIterable<string> {
  const { fast } = llmModels();
  return llm.stream(fast.model, answerMessages(input), { effort: fast.effort, signal });
}

export function answerUnavailable(language: KitPlan["language"]): string {
  return language === "vi" ? "Xin lỗi, mình chưa trả lời được câu này lúc này." : "Sorry, I can't answer that right now.";
}
