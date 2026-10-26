// Explainer (PRD "Explainer"): plan + chosen basket → short streamed explanation in the buyer's language (fast model).
// The model only rephrases facts we computed; it is told to never add products or numbers that are not given.
import type { BasketOption, KitPlan } from "@/contract";
import { models, type LLM } from "@/server/llm";
import { formatVnd } from "@/server/optimizer/present";

function facts(plan: KitPlan, o: BasketOption) {
  return {
    budget: plan.budget === null ? null : formatVnd(plan.budget),
    deadline: plan.deadline,
    status: o.status,
    profile: o.profile,
    picked: o.lines.map((l) => ({
      need: plan.items.find((i) => i.key === l.itemKey)?.needLabel ?? l.itemKey,
      product: l.product.title,
      shop: l.shop.name,
      lineTotal: formatVnd(l.lineTotal),
      why: l.reason,
    })),
    noSuitableProduct: o.noMatch.map((n) => ({ need: n.needLabel, reason: n.reason })),
    skippedForBudget: o.skipped.map((s) => s.needLabel),
    savings: o.savings.map((s) => `${s.label}: ${formatVnd(s.amount)}`),
    grandTotal: formatVnd(o.grandTotal),
    ...(o.status === "over_budget"
      ? { minimumCost: formatVnd(o.minimumCost ?? o.grandTotal), costDrivers: o.costDrivers ?? [] }
      : {}),
  };
}

export function explainOption(llm: LLM, plan: KitPlan, option: BasketOption): AsyncIterable<string> {
  const lang = plan.language === "vi" ? "Vietnamese" : "English";
  const system = [
    `You explain a shopping kit to the buyer in ${lang}, at most 120 words, plain prose, no lists or markdown.`,
    "Say why the basket is built this way: mention the savings (vouchers, free shipping, fewer shops) and every need with no suitable product (say honestly it was left open instead of guessing).",
    "If the status is over_budget, say the minimum cost and what drives it. Mention items skipped for budget.",
    "Use only the facts given. Never invent products, shops or numbers. Write money exactly as given.",
  ].join("\n");
  return llm.stream(models.fast(), [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(facts(plan, option)) },
  ]);
}
