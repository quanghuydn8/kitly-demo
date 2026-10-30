// Refine planner (PRD "Planner", CONTRACT §3): previous plan + the buyer's message + excluded items → revised plan
// + intent ("change_kit" | "answer", D42). Same planner model, rules and code post-processing as the planner, plus
// two code guarantees: excluded items never come back (key or category, D33) and an item the model re-keyed in the
// same category keeps its previous key (so PlanDiff stays honest).
import { z } from "zod";
import type { CategoryId, KitPlan, PlanItem } from "@/contract";
import type { LLMClient, LLMMessage } from "@/server/llm";
import { callPlanner, plannerRules, PlannerOutputSchema, postProcessPlan } from "./planner";

export const RefineOutputSchema = PlannerOutputSchema.extend({ intent: z.enum(["change_kit", "answer"]) });
export type RefineIntent = z.infer<typeof RefineOutputSchema>["intent"];

/** Items the buyer removed with ✕ in this thread: never planned again. */
export interface ExcludedItems {
  keys: string[];
  categories: CategoryId[];
  labels?: string[];
}
export interface RefineInput {
  previous: KitPlan;
  message: string;
  excluded: ExcludedItems;
}

export function refineMessages(input: RefineInput, today: string): LLMMessage[] {
  const { keys, categories, labels = [] } = input.excluded;
  const excluded = keys.length
    ? `Excluded items — the buyer already has these, never add them: ${[...labels, ...keys].join(", ")}` +
      (categories.length ? ` (categories: ${categories.join(", ")})` : "")
    : "Excluded items: none.";
  const system = [
    "You are Kitly's planner for DemoMart, a Vietnamese marketplace. The buyer already has a shopping plan (KitPlan) and sends a message about it. Return the revised plan.",
    "Change only what the message asks for; keep everything else exactly as it is. An item that stays must keep the same key (and its fields) as in the previous plan; a new item gets a new key.",
    "The budget, deadline, items, tags, quantities and price limits may all change when the message says so. Keep the previous language unless the buyer switches language.",
    'intent: "change_kit" when the message changes any constraint (items, budget, deadline, tags, quantities, prices). "answer" only when no constraint changes (a question about the kit, a product or the occasion); then return the previous plan unchanged. When unsure, use "change_kit" only if a constraint changes.',
    excluded,
    ...plannerRules(today),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: `Previous plan (JSON): ${JSON.stringify(input.previous)}\n\nBuyer message: ${input.message}` },
  ];
}

/** An item the model re-keyed but that has the same category as a previous item no longer present gets that key back. */
function keepPreviousKeys(previous: KitPlan, items: PlanItem[]): PlanItem[] {
  const prevKeys = new Set(previous.items.map((i) => i.key));
  const used = new Set(items.map((i) => i.key));
  return items.map((item) => {
    if (prevKeys.has(item.key) || item.category === null) return item;
    const old = previous.items.find((p) => p.category === item.category && !used.has(p.key));
    if (!old) return item;
    used.add(old.key);
    return { ...item, key: old.key };
  });
}

export async function refineKit(
  llm: LLMClient,
  input: RefineInput,
  opts: { today: string },
): Promise<{ intent: RefineIntent; plan: KitPlan }> {
  const raw = await callPlanner(llm, RefineOutputSchema, refineMessages(input, opts.today), "kit_refine");
  const { intent, ...rest } = raw;
  const plan = postProcessPlan(rest, opts.today);
  const keys = new Set(input.excluded.keys);
  const cats = new Set<string>(input.excluded.categories);
  // D33: code drops any returned item whose key or category matches an excluded item, whatever the prompt said.
  const kept = plan.items.filter((i) => !keys.has(i.key) && !(i.category !== null && cats.has(i.category)));
  return { intent, plan: { ...plan, items: keepPreviousKeys(input.previous, kept) } };
}
