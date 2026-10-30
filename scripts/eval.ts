// npm run eval — planner eval against the REAL model (seam S8, ticket 08). Costs tokens: never part of npm test.
// Runs the planner + refine planner on EVAL_CASES with today = EVAL_TODAY (2026-09-02, D45), prints latency per call
// and a pass/fail table, exits 1 when any case fails.
import { EVAL_CASES, EVAL_TODAY, formatReport, runEval } from "@/server/eval/planner-eval";
import { getLLM, llmModels } from "@/server/llm";
import { today } from "@/server/today";

if (!process.env.OPENAI_API_KEY) {
  console.error("eval: OPENAI_API_KEY is not set (.env)");
  process.exit(2);
}
const { planner } = llmModels();
if (today() !== EVAL_TODAY) console.warn(`eval: DEMO_TODAY is ${today()}; the eval always runs on ${EVAL_TODAY}`);
console.log(
  `eval: ${EVAL_CASES.length} calls · planner ${planner.model} (effort ${planner.effort})` +
    ` · ${process.env.OPENAI_BASE_URL ? "proxy" : "official OpenAI"} · today ${EVAL_TODAY}\n`,
);

const started = Date.now();
const rows = await runEval(getLLM(), { today: EVAL_TODAY, cases: EVAL_CASES });
console.log(formatReport(rows));
console.log(`total ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exit(rows.every((r) => r.pass) ? 0 : 1);
