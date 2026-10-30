// FakeLLM: the only allowed LLM fake in tests. Returns queued structured outputs (validated with the caller's
// schema, an Error entry rejects) and streams queued text; records every call with its model and effort.
import type { z } from "zod";
import type { Effort, LLMClient, LLMMessage, StreamOptions, StructuredOptions } from "./types";

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
  private streamQueue: (string[] | Error)[];

  constructor(opts: { structured?: unknown[]; stream?: string[] | (string[] | Error)[] } = {}) {
    this.structuredQueue = [...(opts.structured ?? [])];
    const s = opts.stream ?? [];
    // `stream: ["a", "b"]` = one streamed answer; `stream: [["a"], ["b"]]` = one answer per call.
    this.streamQueue =
      s.length && s.every((x) => typeof x === "string") ? [s as string[]] : [...(s as (string[] | Error)[])];
  }

  async structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    opts: StructuredOptions = {},
  ): Promise<T> {
    this.calls.push({ kind: "structured", model, effort: opts.effort, messages, name: opts.name });
    if (!this.structuredQueue.length) throw new Error("FakeLLM: no structured output queued");
    const next = this.structuredQueue.shift();
    if (next instanceof Error) throw next;
    return schema.parse(next);
  }

  async *stream(model: string, messages: LLMMessage[], opts: StreamOptions = {}): AsyncIterable<string> {
    this.calls.push({ kind: "stream", model, effort: opts.effort, messages });
    const next = this.streamQueue.length > 1 ? this.streamQueue.shift() : this.streamQueue[0];
    if (!next) return;
    if (next instanceof Error) throw next;
    for (const d of next) yield d;
  }
}
