// Explainer (PRD "Explainer"): plan + chosen option → short streamed text in the plan language (fast model).
// The model only sees code-computed facts, so every number it can cite is real. On a refine it also gets what changed
// (code-computed from the PlanDiff and the previous plan) and must start with it, then the new total.
// Ticket 16: it also gets the SalesContext (wallet vouchers, cart products) and may mention them, with only those numbers.
import type { BasketOption, KitPlan, PlanDiff, SalesContext } from "@/contract";
import { formatVnd } from "@/server/optimizer";
import { llmModels, type LLMClient, type LLMMessage } from "@/server/llm";

/** A refine's changes vs the previous version (CONTRACT KitVersion.diff). */
export interface ExplainChanges {
  previous: KitPlan;
  diff: PlanDiff;
}

function changeFacts(plan: KitPlan, { previous, diff }: ExplainChanges): string[] {
  const label = (p: KitPlan, key: string) => p.items.find((i) => i.key === key)?.needLabel ?? key;
  const money = (n: number | null) => (n === null ? "none" : formatVnd(n));
  const out: string[] = [];
  if (diff.added.length) out.push(`- Added: ${diff.added.map((k) => label(plan, k)).join(", ")}`);
  if (diff.removed.length) out.push(`- Removed: ${diff.removed.map((k) => label(previous, k)).join(", ")}`);
  if (diff.changed.length) out.push(`- Changed: ${diff.changed.map((k) => label(plan, k)).join(", ")}`);
  if (previous.budget !== plan.budget) out.push(`- Budget changed: ${money(previous.budget)} → ${money(plan.budget)}`);
  if (previous.deadline !== plan.deadline)
    out.push(`- Deadline changed: ${previous.deadline ?? "none"} → ${plan.deadline ?? "none"}`);
  return ["What changed since the previous version:", ...(out.length ? out : ["- Nothing in the plan changed"])];
}

/** What the marketplace knows about the buyer, as facts lines (D39–D46). */
function salesFacts(sales: SalesContext): string[] {
  const out: string[] = [];
  if (sales.address) out.push(`Buyer address: ${sales.address}`);
  for (const i of sales.interests)
    out.push(
      `- In the buyer's cart (fits ${i.itemKey}): ${i.title}, ${formatVnd(i.price)}` +
        (i.voucherCode ? ` → ${formatVnd(i.priceAfterVoucher)} with ${i.voucherCode}` : "") +
        (i.overMaxPriceBy ? `, over the price limit by ${formatVnd(i.overMaxPriceBy)}` : ""),
    );
  for (const v of sales.walletVouchers)
    out.push(`- Wallet voucher ${v.code} (${v.label}), valid until ${v.validUntil}${v.usedInBasket ? ", applied in this kit" : ""}`);
  return out.length ? ["What the marketplace knows about the buyer:", ...out] : [];
}

export function explainerMessages(plan: KitPlan, option: BasketOption, changes?: ExplainChanges, sales?: SalesContext): LLMMessage[] {
  const lang = plan.language === "vi" ? "Vietnamese" : "English";
  const system = [
    `You explain a shopping kit to the buyer in ${lang}. Plain text, no markdown, no lists.`,
    "Hard limit: at most 70 words and at most 4 sentences.",
    "Say the total against the budget, the main savings, and every gap honestly.",
    'For a gap with a closest product, name it and what it lacks (e.g. "closest: Minh An Kids Backpack, missing anti-hunchback").',
    "Use only the facts and numbers given; never invent products, prices or dates. Money format: 1.500.000₫.",
    ...(changes ? ["This is a revised kit: start with what changed (from the facts), then say the new total."] : []),
    ...(sales ? ["You may mention the wallet saving or the cart product; only these numbers."] : []),
  ].join("\n");
  const label = (key: string) => plan.items.find((i) => i.key === key)?.needLabel ?? key;
  const facts: string[] = [
    ...(changes ? changeFacts(plan, changes) : []),
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
  if (sales) facts.push(...salesFacts(sales));
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
  changes?: ExplainChanges,
  sales?: SalesContext,
): AsyncIterable<string> {
  const { fast } = llmModels();
  return llm.stream(fast.model, explainerMessages(plan, option, changes, sales), { effort: fast.effort, signal });
}
