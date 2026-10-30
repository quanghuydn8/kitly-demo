// Live run state (T11): replays the recorded SSE fixtures through the reducer the Kitly screen uses.
import { describe, expect, it } from "vitest";
import kitSample from "@/contract/fixtures/kit.sample.json";
import clarifySample from "@/contract/fixtures/kit.clarify.sample.json";
import { KitStreamSchema, type KitStreamEvent } from "@/contract";
import { applyEvent, runAsVersion, runSummary, startRun, type RunState } from "@/lib/client/kit-run";

function replay(events: KitStreamEvent[], run: RunState = startRun({ kind: "new", query: "q" })): RunState {
  return events.reduce(applyEvent, run);
}

describe("kit run reducer", () => {
  it("hero stream: timeline steps in order, plan, 3 options, full explanation, done", () => {
    const run = replay(KitStreamSchema.parse(kitSample));
    expect(run.steps.map((s) => [s.id, s.status])).toEqual([
      ["understand", "done"],
      ["plan", "done"],
      ["search", "done"],
      ["optimize", "done"],
      ["explain", "done"],
    ]);
    expect(run.threadId).toBe("11111111-1111-4111-8111-111111111111");
    expect(run.options).toHaveLength(3);
    expect(run.explanation).toMatch(/^Your Grade 1 kit costs 820\.000₫, .*applied\.$/);
    expect(run.status).toBe("done");
    expect(runSummary(run)).toBe("Planned 10 items · compared 24 products from 4 shops");
  });

  it("while streaming, the run is 'running' and its provisional version carries the options", () => {
    const events = KitStreamSchema.parse(kitSample);
    const cut = events.findIndex((e) => e.event === "explanation");
    const run = replay(events.slice(0, cut + 1));
    expect(run.status).toBe("running");
    const v = runAsVersion(run)!;
    expect(v.version).toBe(1);
    expect(v.status).toBe("ready");
    expect(v.options).toHaveLength(3);
    expect(v.userText).toBe("q");
  });

  it("clarify stream: question with 4 choices, provisional version awaiting_budget", () => {
    const run = replay(KitStreamSchema.parse(clarifySample));
    expect(run.clarify?.choices).toEqual([500000, 1000000, 2000000, null]);
    expect(run.status).toBe("done");
    expect(runAsVersion(run)!.status).toBe("awaiting_budget");
  });

  it("an error event ends the run with the message; no plan ⇒ no provisional version", () => {
    const run = replay([
      { event: "step", data: { id: "understand", status: "running" } },
      { event: "error", data: { code: "llm_timeout", message: "The planner timed out" } },
    ]);
    expect(run.status).toBe("error");
    expect(run.error).toEqual({ code: "llm_timeout", message: "The planner timed out" });
    expect(runAsVersion(run)).toBeNull();
  });

  it("refine run keeps the diff and the refine message as the version's user text", () => {
    const events = KitStreamSchema.parse(kitSample).map((e) =>
      e.event === "plan"
        ? { ...e, data: { ...e.data, version: 2, diff: { added: [], removed: ["uniform"], changed: [] } } }
        : e,
    );
    const run = replay(events, startRun({ kind: "refine", threadId: "t", message: "No uniform" }));
    const v = runAsVersion(run)!;
    expect(v.kind).toBe("refine");
    expect(v.version).toBe(2);
    expect(v.userText).toBe("No uniform");
    expect(v.diff?.removed).toEqual(["uniform"]);
  });
});
