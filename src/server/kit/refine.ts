// Refine (PRD "Refine", seam S6): previous plan + plain-language change → revised plan → same pipeline events,
// with `plan.diff` computed in code by item key. The planner is told to keep keys; keepPlanKeys repairs a renamed
// unchanged item so the diff stays honest even when the model drifts.
import type { KitPlan, KitSseEvent, Profile } from "@/contract";
import type { LLM } from "@/server/llm";
import { kitStream, normalizeProfiles, type KitDeps } from "./pipeline";
import { keepPlanKeys } from "./plan-diff";
import { planKit } from "./planner";

export { diffPlans, keepPlanKeys } from "./plan-diff";

export function refineInstructions(prev: KitPlan): string {
  return [
    "The buyer is refining an existing plan. Previous plan (JSON):",
    JSON.stringify(prev),
    "Return the full revised plan after applying the buyer's message.",
    "Keep every item the message does not touch exactly as it is, and keep the same key for every item that stays (even if it changes). New items get new keys.",
    "Remove items the buyer no longer needs. Keep event, language, budget and deadline unless the message changes them.",
  ].join("\n");
}

export async function refinePlan(llm: LLM, prev: KitPlan, message: string, today: string): Promise<KitPlan> {
  const plan = await planKit(llm, message, today, [{ role: "system", content: refineInstructions(prev) }]);
  return keepPlanKeys(prev, plan);
}

/** POST /api/kit/refine: previous plan + change message → events (with plan.diff). Session existence is checked by the route. */
export function runRefine(
  input: { previousPlan: KitPlan; message: string; profiles?: Profile[] },
  deps: KitDeps,
): AsyncGenerator<KitSseEvent> {
  return kitStream(
    {
      makePlan: () => refinePlan(deps.llm, input.previousPlan, input.message, deps.today),
      record: async (plan) =>
        (await deps.adapter.recordIntent({ query: input.message, plan, source: "live" })).sessionId,
      previous: input.previousPlan,
    },
    normalizeProfiles(input.profiles),
    deps,
  );
}
