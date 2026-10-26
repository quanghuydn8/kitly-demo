// Seam: where Kitly events come from (src/lib/client/kit-source.ts): the mock replay of kit.sample.json and the
// live byte-stream consumer that validates each SSE event against the contract.
import { describe, expect, it } from "vitest";
import { kitSample } from "@/contract/fixtures";
import type { KitSseEvent } from "@/contract/types";
import { consumeKitStream, replayKitSample } from "@/lib/client/kit-source";

const streamOf = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  });
const sse = (events: { event: string; data: unknown }[]) =>
  events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");

describe("replayKitSample", () => {
  it("replays the recorded stream in order", async () => {
    const out: KitSseEvent[] = [];
    await replayKitSample((e) => out.push(e), { delayMs: 0 });
    expect(out).toEqual(kitSample);
  });

  it("stops when aborted", async () => {
    const out: KitSseEvent[] = [];
    const ac = new AbortController();
    await replayKitSample(
      (e) => {
        out.push(e);
        if (out.length === 3) ac.abort();
      },
      { delayMs: 0, signal: ac.signal },
    );
    expect(out).toHaveLength(3);
  });
});

describe("consumeKitStream", () => {
  it("emits typed contract events from the recorded stream sent as SSE bytes", async () => {
    const out: KitSseEvent[] = [];
    await consumeKitStream(streamOf(sse(kitSample)), (e) => out.push(e));
    expect(out).toEqual(kitSample);
  });

  it("skips unknown event names (forward compatible)", async () => {
    const out: KitSseEvent[] = [];
    await consumeKitStream(
      streamOf(
        sse([
          { event: "heartbeat", data: {} },
          { event: "done", data: { sessionId: "s" } },
        ]),
      ),
      (e) => out.push(e),
    );
    expect(out).toEqual([{ event: "done", data: { sessionId: "s" } }]);
  });

  it("throws on an event that breaks the contract", async () => {
    await expect(
      consumeKitStream(streamOf(sse([{ event: "plan", data: { nope: 1 } }])), () => {}),
    ).rejects.toThrow(/plan/);
  });

  it("throws when the stream ends without done or error", async () => {
    await expect(
      consumeKitStream(streamOf(sse([{ event: "step", data: { id: "plan", status: "running" } }])), () => {}),
    ).rejects.toThrow(/ended/);
  });
});
