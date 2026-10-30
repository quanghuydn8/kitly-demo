// Models + reasoning efforts from env (AGENTS.md). Effort "none" is never used: it breaks plans.
import type { Effort } from "./types";

const EFFORTS: Effort[] = ["minimal", "low", "medium", "high"];
const effort = (v: string | undefined): Effort => (EFFORTS.includes(v as Effort) ? (v as Effort) : "low");

export function llmModels(): { planner: { model: string; effort: Effort }; fast: { model: string; effort: Effort } } {
  return {
    planner: {
      model: process.env.KITLY_MODEL_PLANNER || "gpt-6-luna",
      effort: effort(process.env.KITLY_PLANNER_EFFORT),
    },
    fast: { model: process.env.KITLY_MODEL_FAST || "gpt-6-luna", effort: effort(process.env.KITLY_FAST_EFFORT) },
  };
}
