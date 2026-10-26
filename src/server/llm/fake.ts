// FakeLLM: the only allowed fake (AGENTS.md). Returns queued structured outputs (zod-validated) and fixed stream chunks.
import type { z } from "zod";
import type { LLM, LLMMessage } from "./types";

export class FakeLLM implements LLM {
  readonly calls: { kind: "structured" | "stream"; model: string; messages: LLMMessage[]; name?: string }[] =
    [];
  private queue: unknown[];
  private chunks: string[];

  constructor(opts: { structured?: unknown[]; stream?: string[] } = {}) {
    this.queue = [...(opts.structured ?? [])];
    this.chunks = opts.stream ?? ["Fake explanation."];
  }

  async structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    name?: string,
  ): Promise<T> {
    this.calls.push({ kind: "structured", model, messages, name });
    if (this.queue.length === 0) throw new Error("FakeLLM: no structured output queued");
    return schema.parse(this.queue.shift());
  }

  async *stream(model: string, messages: LLMMessage[]): AsyncIterable<string> {
    this.calls.push({ kind: "stream", model, messages });
    for (const c of this.chunks) yield c;
  }
}
