// Explainer (PRD "Explainer"): plan + chosen option → short streamed text in the plan language (fast model).
// The model only sees code-computed facts, so every number it can cite is real.
import type { BasketOption, KitPlan } from "@/contract";
import { formatVnd } from "@/server/optimizer";
import { llmModels, type LLMClient, type LLMMessage } from "@/server/llm";

export function explainerMessages(plan: KitPlan, option: BasketOption): LLMMessage[] {
  const lang = plan.language === "vi" ? "Vietnamese" : "English";
  const system = [
    `You explain a shopping kit to the buyer in ${lang}. Plain text, no markdown, no lists.`,
    "Hard limit: at most 70 words and at most 4 sentences.",
    "Say the total against the budget, the main savings, and every gap honestly.",
    'For a gap with a closest product, name it and what it lacks (e.g. "closest: Minh An Kids Backpack, missing anti-hunchback").',
    "Use only the facts and numbers given; never invent products, prices or dates. Money format: 1.500.000₫.",
  ].join("\n");
  const label = (key: string) => plan.items.find((i) => i.key === key)?.needLabel ?? key;
  const facts: string[] = [
    `Budget: ${plan.budget === null ? "none" : formatVnd(plan.budget)}`,
    `Deadline: ${plan.deadline ?? "none"}`,
    `Status: ${option.status}${option.overBy ? ` (over budget by ${formatVnd(option.overBy)})` : ""}`,
    `Total: ${formatVnd(option.grandTotal)} (items ${formatVnd(option.itemsTotal)}, shipping ${formatVnd(option.shippingTotal)}, discounts ${formatVnd(option.discountTotal)})`,
    `Shops: ${option.shops.map((s) => s.shopName).join(", ") || "none"}`,
    "Lines:",
    ...option.lines.map((l) => `- ${label(l.itemKey)}: ${l.product.title}, ${formatVnd(l.lineTotal)} (${l.reason})`),
  ];
  if (option.savings.length) facts.push("Savings:", ...option.savings.map((s) => `- ${s.label}: ${formatVnd(s.amount)}`));
  if (option.noMatch.length) {
    facts.push("Gaps:");
    for (const n of option.noMatch) {
      if (n.reason === "no_category") {
        facts.push(`- ${n.needLabel}: not sold in this store yet`);
        continue;
      }
      const c = n.closest;
      const lacks = c
        ? [c.missingTags.length ? `missing ${c.missingTags.join(", ")}` : "", c.overMaxPriceBy ? `over the price limit by ${formatVnd(c.overMaxPriceBy)}` : ""]
            .filter(Boolean)
            .join(", ")
        : "";
      facts.push(
        `- ${n.needLabel}: no exact match (${n.reason})` +
          (c ? `; closest: ${c.candidate.product.title}, ${formatVnd(c.candidate.product.price)}${lacks ? `, ${lacks}` : ""}` : ""),
      );
    }
  }
  if (option.skipped.length) facts.push(`Skipped for budget: ${option.skipped.map((s) => s.needLabel).join(", ")}`);
  if (option.minimumCost) facts.push(`Minimum cost of the must-haves: ${formatVnd(option.minimumCost)}`);
  return [
    { role: "system", content: system },
    { role: "user", content: facts.join("\n") },
  ];
}

export function streamExplanation(
  llm: LLMClient,
  plan: KitPlan,
  option: BasketOption,
  signal?: AbortSignal,
): AsyncIterable<string> {
  const { fast } = llmModels();
  return llm.stream(fast.model, explainerMessages(plan, option), { effort: fast.effort, signal });
}
