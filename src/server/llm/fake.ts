// FakeLLM: the only allowed LLM fake in tests. Returns queued structured outputs (validated with the caller's
// schema, an Error entry rejects) and streams queued text; records every call with its model and effort.
// A stream answer may contain an Error after some deltas (`[["Partial ", new Error("stall")]]`): it throws there.
// `fakeDelay(ms, value?)` waits first: as a structured entry it then returns (or throws) `value`; inside a stream
// answer it pauses before the next delta (concurrency tests, ticket 16).
import type { z } from "zod";
import type { Effort, LLMClient, LLMMessage, StreamOptions, StructuredOptions } from "./types";

export class FakeDelay {
  constructor(
    readonly ms: number,
    readonly value?: unknown,
  ) {}
}
export const fakeDelay = (ms: number, value?: unknown) => new FakeDelay(ms, value);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type StreamEntry = string | Error | FakeDelay;

export interface FakeLLMCall {
  kind: "structured" | "stream";
  model: string;
  effort: Effort | undefined;
  messages: LLMMessage[];
  name?: string;
}

export class FakeLLM implements LLMClient {
  calls: FakeLLMCall[] = [];
  private structuredQueue: unknown[];
  private streamQueue: (StreamEntry[] | Error)[];

  constructor(opts: { structured?: unknown[]; stream?: StreamEntry[] | (StreamEntry[] | Error)[] } = {}) {
    this.structuredQueue = [...(opts.structured ?? [])];
    const s = opts.stream ?? [];
    // `stream: ["a", "b"]` = one streamed answer; `stream: [["a"], ["b"]]` = one answer per call.
    this.streamQueue =
      s.length && s.every((x) => typeof x === "string" || x instanceof FakeDelay)
        ? [s as StreamEntry[]]
        : [...(s as (StreamEntry[] | Error)[])];
  }

  async structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    opts: StructuredOptions = {},
  ): Promise<T> {
    this.calls.push({ kind: "structured", model, effort: opts.effort, messages, name: opts.name });
    if (!this.structuredQueue.length) throw new Error("FakeLLM: no structured output queued");
    let next = this.structuredQueue.shift();
    if (next instanceof FakeDelay) {
      await sleep(next.ms);
      next = next.value;
    }
    if (next instanceof Error) throw next;
    return schema.parse(next);
  }

  async *stream(model: string, messages: LLMMessage[], opts: StreamOptions = {}): AsyncIterable<string> {
    this.calls.push({ kind: "stream", model, effort: opts.effort, messages });
    const next = this.streamQueue.length > 1 ? this.streamQueue.shift() : this.streamQueue[0];
    if (!next) return;
    if (next instanceof Error) throw next;
    for (const d of next) {
      if (d instanceof FakeDelay) {
        await sleep(d.ms);
        continue;
      }
      if (d instanceof Error) throw d;
      yield d;
    }
  }
}
