// Seam: the Kitly screen state machine (src/lib/client/kit-state.ts) driven by contract SSE events.
// Uses the recorded Beat 1 stream (kit.sample.json) as realistic input.
import { describe, expect, it } from "vitest";
import { kitSample } from "@/contract/fixtures";
import type { KitSseEvent } from "@/contract/types";
import { initialKitState, kitReducer, type KitState } from "@/lib/client/kit-state";

const run = (events: KitSseEvent[], from: KitState = initialKitState) =>
  events.reduce((s, e) => kitReducer(s, { type: "event", event: e }), kitReducer(from, { type: "start" }));

describe("kitReducer", () => {
  it("start shows all five timeline steps immediately, all pending", () => {
    const s = kitReducer(initialKitState, { type: "start" });
    expect(s.status).toBe("running");
    expect(s.steps.map((x) => [x.id, x.status])).toEqual([
      ["understand", "pending"],
      ["plan", "pending"],
      ["search", "pending"],
      ["optimize", "pending"],
      ["explain", "pending"],
    ]);
  });

  it("replaying the Beat 1 stream ends with plan, options, full explanation and every step done", () => {
    const s = run(kitSample);
    expect(s.status).toBe("done");
    expect(s.steps.every((x) => x.status === "done")).toBe(true);
    expect(s.steps.find((x) => x.id === "plan")!.detail).toBe("Planned 9 items");
    expect(s.sessionId).toBe("9b6f1c1e-2c4a-4d1e-9a51-7f3c2b8d0a01");
    expect(s.plan!.budget).toBe(1_500_000);
    expect(s.options).toHaveLength(1);
    expect(s.explanation).toMatch(/^I built a Grade 1 kit.*Total: 1\.000\.000₫\.$/);
  });

  it("a step keeps the detail it got when running if done brings none", () => {
    const s = run([
      { event: "step", data: { id: "search", status: "running", detail: "Searching…" } },
      { event: "step", data: { id: "search", status: "done" } },
    ]);
    expect(s.steps.find((x) => x.id === "search")).toMatchObject({ status: "done", detail: "Searching…" });
  });

  it("error is terminal: stored, marks the running step failed, status error", () => {
    const s = run([
      { event: "step", data: { id: "understand", status: "done" } },
      { event: "step", data: { id: "plan", status: "running" } },
      { event: "error", data: { code: "llm_timeout", message: "The planner took too long" } },
    ]);
    expect(s.status).toBe("error");
    expect(s.error).toEqual({ code: "llm_timeout", message: "The planner took too long" });
    expect(s.steps.find((x) => x.id === "plan")!.status).toBe("failed");
  });

  it("a network failure becomes an error the timeline can show", () => {
    const s = kitReducer(kitReducer(initialKitState, { type: "start" }), {
      type: "failed",
      message: "HTTP 500",
    });
    expect(s.status).toBe("error");
    expect(s.error).toEqual({ code: "network", message: "HTTP 500" });
  });

  it("a refine run keeps the previous basket visible until new options arrive, then stores the diff", () => {
    const first = run(kitSample);
    const refining = kitReducer(first, { type: "start", refine: true });
    expect(refining.options).toBe(first.options);
    expect(refining.plan).toBe(first.plan);
    expect(refining.explanation).toBe("");
    const plan = kitSample.find((e) => e.event === "plan")!;
    if (plan.event !== "plan") throw new Error();
    const after = kitReducer(refining, {
      type: "event",
      event: {
        event: "plan",
        data: { ...plan.data, diff: { added: [], removed: ["uniform"], changed: ["backpack"] } },
      },
    });
    expect(after.diff).toEqual({ added: [], removed: ["uniform"], changed: ["backpack"] });
  });

  it("a fresh (non-refine) run clears the previous result", () => {
    const s = kitReducer(run(kitSample), { type: "start" });
    expect(s.plan).toBeNull();
    expect(s.options).toEqual([]);
    expect(s.diff).toBeNull();
  });
});
