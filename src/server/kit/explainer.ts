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
    `You explain a shopping kit to the buyer in ${lang}, at most 70 words and at most 4 sentences, plain prose, no lists or markdown.`,
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

// ---------- Three baskets (T20a): one code-written line per profile, after the prose ----------

const PROFILE_NAME: Record<BasketOption["profile"], string> = { saver: "Saver", balanced: "Balanced", premium: "Premium" };
const PROFILE_RANK: Record<BasketOption["profile"], number> = { saver: 0, balanced: 1, premium: 2 };

/** The basket the prose explains: Balanced when requested, else the first option. */
export function primaryOption(options: BasketOption[]): BasketOption {
  return options.find((o) => o.profile === "balanced") ?? options[0];
}

/** Need labels whose chosen product differs from the base basket (plan order). */
function changedNeeds(plan: KitPlan, o: BasketOption, base: BasketOption): string {
  const baseProduct = new Map(base.lines.map((l) => [l.itemKey, l.product.id]));
  return o.lines
    .filter((l) => baseProduct.get(l.itemKey) !== l.product.id)
    .map((l) => plan.items.find((i) => i.key === l.itemKey)?.needLabel ?? l.itemKey)
    .join(", ");
}

/**
 * One line per option, compared with `base` ("Saver saves 210.000₫ by choosing cheaper …"). Written by code, not
 * the model, so every amount is exact. Buyer's language; profile names stay as the UI shows them.
 */
export function profileLines(plan: KitPlan, options: BasketOption[], base: BasketOption): string[] {
  const vi = plan.language === "vi";
  const baseName = PROFILE_NAME[base.profile];
  return options.map((o) => {
    const name = PROFILE_NAME[o.profile];
    const total = formatVnd(o.grandTotal);
    if (o.status === "over_budget") {
      const min = formatVnd(o.minimumCost ?? o.grandTotal);
      return vi ? `${name}: vượt ngân sách — tối thiểu ${min}.` : `${name}: over budget — at least ${min}.`;
    }
    if (o === base) {
      const n = o.shops.length;
      const value = o.profile === "balanced";
      return vi
        ? `${name}: ${total} từ ${n} shop${value ? " — cân bằng nhất giữa giá và chất lượng" : ""}.`
        : `${name}: ${total} from ${n} shop${n === 1 ? "" : "s"}${value ? " — the best value for the money" : ""}.`;
    }
    const delta = o.grandTotal - base.grandTotal;
    if (delta === 0) {
      const cheaperSide = PROFILE_RANK[o.profile] < PROFILE_RANK[base.profile];
      if (vi)
        return cheaperSide
          ? `${name}: ${total}, bằng ${baseName} — không có lựa chọn rẻ hơn đáng lấy.`
          : `${name}: ${total}, bằng ${baseName} — đây đã là những món được đánh giá cao nhất.`;
      return cheaperSide
        ? `${name}: ${total}, the same as ${baseName} — no cheaper picks worth taking.`
        : `${name}: ${total}, the same as ${baseName} — these are already the best-rated picks.`;
    }
    const needs = changedNeeds(plan, o, base);
    if (delta < 0) {
      const by = needs ? (vi ? ` nhờ chọn ${needs} rẻ hơn` : ` by choosing cheaper ${needs}`) : "";
      return vi
        ? `${name} tiết kiệm ${formatVnd(-delta)}${by} — tổng ${total}.`
        : `${name} saves ${formatVnd(-delta)}${by} — ${total} in total.`;
    }
    const forWhat = needs ? (vi ? ` để lấy ${needs} được đánh giá cao hơn` : ` for better-rated ${needs}`) : "";
    return vi
      ? `${name} thêm ${formatVnd(delta)}${forWhat} — tổng ${total}.`
      : `${name} costs ${formatVnd(delta)} more${forWhat} — ${total} in total.`;
  });
}

/** Prose about the primary basket (model), then — when several profiles were asked for — one line per profile. */
export async function* explainKit(
  llm: LLM,
  plan: KitPlan,
  options: BasketOption[],
  changes?: PlanChanges,
): AsyncGenerator<string> {
  const base = primaryOption(options);
  yield* explainOption(llm, plan, base, changes);
  if (options.length > 1) yield `\n\n${profileLines(plan, options, base).join("\n")}`;
}
