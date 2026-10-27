import { describe, expect, it } from "vitest";
import { withIdleTimeout } from "@/server/llm/timeout";

async function* gen(delays: number[]) {
  for (const [i, d] of delays.entries()) {
    await new Promise((r) => setTimeout(r, d));
    yield `t${i}`;
  }
}
const collect = async (it: AsyncIterable<string>) => {
  const out: string[] = [];
  for await (const x of it) out.push(x);
  return out;
};

describe("withIdleTimeout (a hung proxy stream must end the SSE with an error, not hang the demo)", () => {
  it("passes deltas through when they keep coming", async () => {
    expect(await collect(withIdleTimeout(gen([5, 5, 5]), 50))).toEqual(["t0", "t1", "t2"]);
  });
  it("throws when no delta arrives within the idle window", async () => {
    await expect(collect(withIdleTimeout(gen([5, 200]), 50))).rejects.toThrow(/no output for/);
  });
});
