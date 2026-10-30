// withIdleTimeout: the stream idle guard every LLM stream goes through (20 s in prod).
import { describe, expect, it } from "vitest";
import { LLMTimeoutError, withIdleTimeout } from "@/server/llm";

async function* deltas(parts: string[], gapMs: number) {
  for (const p of parts) {
    await new Promise((r) => setTimeout(r, gapMs));
    yield p;
  }
}
async function collect(it: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const d of it) out.push(d);
  return out;
}

describe("withIdleTimeout", () => {
  it("passes every delta through while they keep arriving", async () => {
    expect(await collect(withIdleTimeout(deltas(["a", "b", "c"], 5), 100))).toEqual(["a", "b", "c"]);
  });

  it("throws LLMTimeoutError and calls onIdle when no delta arrives within the window", async () => {
    let idled = false;
    const got: string[] = [];
    const run = async () => {
      for await (const d of withIdleTimeout(slow(), 30, () => (idled = true))) got.push(d);
    };
    async function* slow() {
      yield "a";
      await new Promise((r) => setTimeout(r, 300));
      yield "late";
    }
    await expect(run()).rejects.toBeInstanceOf(LLMTimeoutError);
    expect(got).toEqual(["a"]);
    expect(idled).toBe(true);
  });
});
