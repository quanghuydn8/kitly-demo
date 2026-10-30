// The hero kit for a persona, built with the real Planner post-processing + Matcher + Optimizer on the In-memory
// fixtures (ticket 16 tests). No LLM: the plan is the sloppy hero plan run through postProcessPlan.
import type { PersonaId } from "@/contract";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { matchPlan } from "@/server/kit/matcher";
import { postProcessPlan, type PlannerOutput } from "@/server/kit/planner";
import { optimize } from "@/server/optimizer";
import { sloppyHeroPlan } from "./plans";

export const TODAY = "2026-09-02";

export async function heroWorld(personaId: PersonaId, raw: object = sloppyHeroPlan()) {
  const adapter = new InMemoryAdapter();
  const plan = postProcessPlan(raw as PlannerOutput, TODAY);
  const [shops, vouchers, persona] = await Promise.all([
    adapter.listShops(),
    adapter.listVouchers(personaId),
    adapter.getPersona(personaId),
  ]);
  const match = await matchPlan(adapter, plan, { shops, today: TODAY });
  const options = optimize({ plan, candidates: match.candidates, noMatch: match.noMatch, shops, vouchers, today: TODAY });
  const balanced = options.find((o) => o.profile === "balanced")!;
  return { adapter, plan, shops, vouchers, persona, match, options, balanced };
}
