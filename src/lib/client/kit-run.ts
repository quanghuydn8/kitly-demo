// One live Kitly run (POST /api/kit or /api/kit/refine) as pure state: applyEvent folds SSE events in order.
// runAsVersion turns an in-flight run into a provisional KitVersion so the kit panel renders options before `done`
// (the server's saved version replaces it once the thread is refetched).
import type { BasketOption, KitPlan, KitStreamEvent, KitVersion, PlanDiff, StepId } from "@/contract";

export type RunRequest = { kind: "new"; query: string } | { kind: "refine"; threadId: string; message: string };

export interface RunStep {
  id: StepId;
  status: "running" | "done";
  detail?: string;
}

export interface RunState {
  request: RunRequest;
  status: "running" | "done" | "error";
  steps: RunStep[];
  threadId: string | null;
  version: number | null;
  plan: KitPlan | null;
  diff: PlanDiff | null;
  clarify: { text: string; choices: (number | null)[] } | null;
  options: BasketOption[] | null;
  explanation: string;
  error: { code: string; message: string } | null;
  answered: boolean;
}

export function startRun(request: RunRequest): RunState {
  return {
    request,
    status: "running",
    steps: [],
    threadId: request.kind === "refine" ? request.threadId : null,
    version: null,
    plan: null,
    diff: null,
    clarify: null,
    options: null,
    explanation: "",
    error: null,
    answered: false,
  };
}

export function runUserText(request: RunRequest): string {
  return request.kind === "new" ? request.query : request.message;
}

export function applyEvent(run: RunState, e: KitStreamEvent): RunState {
  switch (e.event) {
    case "step": {
      const i = run.steps.findIndex((s) => s.id === e.data.id);
      const step: RunStep = { ...run.steps[i], ...e.data, detail: e.data.detail ?? run.steps[i]?.detail };
      const steps = i < 0 ? [...run.steps, step] : run.steps.map((s, j) => (j === i ? step : s));
      return { ...run, steps };
    }
    case "plan":
      return {
        ...run,
        threadId: e.data.threadId,
        version: e.data.version,
        plan: e.data.plan,
        diff: e.data.diff ?? null,
      };
    case "clarify":
      return {
        ...run,
        threadId: e.data.threadId,
        version: e.data.version,
        clarify: { text: e.data.question.text, choices: e.data.question.choices },
      };
    case "options":
      return { ...run, options: e.data.options };
    case "explanation":
      return { ...run, explanation: run.explanation + e.data.delta };
    case "followup":
      return run; // follow-up question: ticket 17
    case "done":
      return {
        ...run,
        status: "done",
        threadId: e.data.threadId,
        version: run.version ?? e.data.version,
        answered: e.data.answered === true,
        steps: run.steps.map((s) => ({ ...s, status: "done" })),
      };
    case "error":
      return { ...run, status: "error", error: e.data };
  }
}

/** "Planned 10 items · compared 24 products from 4 shops" — the collapsed timeline line. */
export function runSummary(run: RunState): string {
  const parts = (["plan", "search"] as StepId[])
    .map((id) => run.steps.find((s) => s.id === id)?.detail)
    .filter((d): d is string => !!d)
    .map((d, i) => (i === 0 ? d : d.charAt(0).toLowerCase() + d.slice(1)));
  if (parts.length === 0 && run.plan) parts.push(`Planned ${run.plan.items.length} items`);
  return parts.join(" · ");
}

export function runAsVersion(run: RunState): KitVersion | null {
  if (!run.plan || !run.threadId || run.version === null || run.answered) return null;
  return {
    threadId: run.threadId,
    version: run.version,
    createdAt: "",
    kind: run.request.kind,
    userText: runUserText(run.request),
    plan: run.plan,
    excludedKeys: [],
    status: run.clarify ? "awaiting_budget" : "ready",
    options: run.options ?? [],
    explanation: run.explanation,
    diff: run.diff,
    selection: null,
    followUp: null,
  };
}
