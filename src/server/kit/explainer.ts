// Explainer (PRD "Explainer"): plan + chosen basket → short streamed explanation in the buyer's language (fast model).
// The model only rephrases facts we computed; it is told to never add products or numbers that are not given.
import type { BasketOption, KitPlan, PlanDiff } from "@/contract";
import { models, type LLM } from "@/server/llm";
import { formatVnd } from "@/server/optimizer/present";

/** Refine: what the buyer's change did to the plan, in need labels (the model never sees raw keys). */
export interface PlanChanges {
  previous: KitPlan;
  diff: PlanDiff;
}

function changeFacts(plan: KitPlan, { previous, diff }: PlanChanges) {
  const label = (p: KitPlan, key: string) => p.items.find((i) => i.key === key)?.needLabel ?? key;
  const money = (n: number | null) => (n === null ? null : formatVnd(n));
  return {
    added: diff.added.map((k) => label(plan, k)),
    removed: diff.removed.map((k) => label(previous, k)),
    changed: diff.changed.map((k) => label(plan, k)),
    ...(previous.budget !== plan.budget ? { budget: { before: money(previous.budget), after: money(plan.budget) } } : {}),
    ...(previous.deadline !== plan.deadline ? { deadline: { before: previous.deadline, after: plan.deadline } } : {}),
  };
}

function facts(plan: KitPlan, o: BasketOption, changes?: PlanChanges) {
  return {
    ...(changes ? { changes: changeFacts(plan, changes) } : {}),
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

export function explainOption(
  llm: LLM,
  plan: KitPlan,
  option: BasketOption,
  changes?: PlanChanges,
): AsyncIterable<string> {
  const lang = plan.language === "vi" ? "Vietnamese" : "English";
  const system = [
    `You explain a shopping kit to the buyer in ${lang}, at most 120 words, plain prose, no lists or markdown.`,
    "Say why the basket is built this way: mention the savings (vouchers, free shipping, fewer shops) and every need with no suitable product (say honestly it was left open instead of guessing).",
    "If the status is over_budget, say the minimum cost and what drives it. Mention items skipped for budget.",
    ...(changes
      ? ["The buyer just refined the kit: start by saying what changed (the `changes` facts) and the new total (grandTotal)."]
      : []),
    "Use only the facts given. Never invent products, shops or numbers. Write money exactly as given.",
  ].join("\n");
  return llm.stream(models.fast(), [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(facts(plan, option, changes)) },
  ]);
}
