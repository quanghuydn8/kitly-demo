// FakeLLM: the only allowed fake (AGENTS.md). Returns queued structured outputs (zod-validated) and fixed stream chunks.
import type { z } from "zod";
import type { LLM, LLMMessage } from "./types";

export type FakeResponder = (call: { model: string; messages: LLMMessage[]; name?: string }) => unknown;

export class FakeLLM implements LLM {
  readonly calls: { kind: "structured" | "stream"; model: string; messages: LLMMessage[]; name?: string }[] =
    [];
  private queue: unknown[];
  private chunks: string[];
  private respond?: FakeResponder;

  /** `respond` answers structured calls once the queue is empty — for parallel calls whose order is not fixed. */
  constructor(opts: { structured?: unknown[]; stream?: string[]; respond?: FakeResponder } = {}) {
    this.queue = [...(opts.structured ?? [])];
    this.chunks = opts.stream ?? ["Fake explanation."];
    this.respond = opts.respond;
  }

  async structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    name?: string,
  ): Promise<T> {
    this.calls.push({ kind: "structured", model, messages, name });
    if (this.queue.length > 0) return schema.parse(this.queue.shift());
    if (this.respond) return schema.parse(await this.respond({ model, messages, name }));
    throw new Error("FakeLLM: no structured output queued");
  }

  async *stream(model: string, messages: LLMMessage[]): AsyncIterable<string> {
    this.calls.push({ kind: "stream", model, messages });
    for (const c of this.chunks) yield c;
  }
}
