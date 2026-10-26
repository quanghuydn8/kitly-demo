// npm run eval — planner eval against the real model (PRD seam S8). Costs tokens: manual only, never in npm test.
import { evalMain } from "@/server/eval/planner-eval";
import { getLLM, models } from "@/server/llm";
import { today } from "@/server/today";

console.log(
  `planner eval · model ${models.planner()} · today ${today()} · ${process.env.OPENAI_BASE_URL ? "via OPENAI_BASE_URL" : "official OpenAI"}`,
);
process.exitCode = await evalMain(getLLM(), { today: today() });
