// Kitly screen state: a pure reducer over contract SSE events (CONTRACT.md §3), so the UI and the mock replay
// share one code path. Timeline shows all five steps from the first frame ("appears instantly").
import type { BasketOption, KitPlan, KitSseEvent, PlanDiff, StepId } from "@/contract/types";

export type StepStatus = "pending" | "running" | "done" | "failed";
export interface TimelineStep {
  id: StepId;
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface KitState {
  status: "idle" | "running" | "done" | "error";
  refining: boolean;
  steps: TimelineStep[];
  sessionId: string | null;
  plan: KitPlan | null;
  diff: PlanDiff | null;
  options: BasketOption[];
  explanation: string;
  error: { code: string; message: string } | null;
}

export type KitAction =
  | { type: "start"; refine?: boolean }
  | { type: "event"; event: KitSseEvent }
  | { type: "failed"; message: string };

const STEP_LABELS: [StepId, string][] = [
  ["understand", "Understanding your need"],
  ["plan", "Planning the kit"],
  ["search", "Searching products"],
  ["optimize", "Optimizing the basket"],
  ["explain", "Explaining"],
];

const freshSteps = (): TimelineStep[] => STEP_LABELS.map(([id, label]) => ({ id, label, status: "pending" }));

export const initialKitState: KitState = {
  status: "idle",
  refining: false,
  steps: freshSteps(),
  sessionId: null,
  plan: null,
  diff: null,
  options: [],
  explanation: "",
  error: null,
};

function failRunningStep(steps: TimelineStep[]): TimelineStep[] {
  const i = steps.findIndex((s) => s.status === "running");
  const at = i !== -1 ? i : steps.findIndex((s) => s.status === "pending");
  return steps.map((s, j) => (j === at ? { ...s, status: "failed" } : s));
}

export function kitReducer(state: KitState, action: KitAction): KitState {
  switch (action.type) {
    case "start":
      // Refine keeps the current plan + basket on screen (dimmed by the UI) until the new ones stream in.
      return action.refine
        ? { ...state, status: "running", refining: true, steps: freshSteps(), explanation: "", error: null }
        : { ...initialKitState, status: "running", steps: freshSteps() };
    case "failed":
      return {
        ...state,
        status: "error",
        steps: failRunningStep(state.steps),
        error: { code: "network", message: action.message },
      };
    case "event":
      return onEvent(state, action.event);
  }
}

function onEvent(state: KitState, e: KitSseEvent): KitState {
  switch (e.event) {
    case "step":
      return {
        ...state,
        steps: state.steps.map((s) =>
          s.id === e.data.id ? { ...s, status: e.data.status, detail: e.data.detail ?? s.detail } : s,
        ),
      };
    case "plan":
      return { ...state, sessionId: e.data.sessionId, plan: e.data.plan, diff: e.data.diff ?? null };
    case "options":
      return { ...state, options: e.data.options, refining: false };
    case "explanation":
      return { ...state, explanation: state.explanation + e.data.delta };
    case "done":
      return { ...state, status: "done", refining: false, sessionId: e.data.sessionId };
    case "error":
      return {
        ...state,
        status: "error",
        refining: false,
        steps: failRunningStep(state.steps),
        error: e.data,
      };
  }
}
