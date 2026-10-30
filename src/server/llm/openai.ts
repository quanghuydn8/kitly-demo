// OpenAILLM: the only place that talks to OpenAI. Honours OPENAI_BASE_URL (proxies in rehearsal).
// Streaming iterates raw `responses.create({ stream: true })` events — never the SDK's responses.stream() helper,
// which breaks on proxies that rewrite response ids. A stream aborts when no delta arrives for streamIdleMs.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { LLMTimeoutError, type LLMClient, type LLMMessage, type StreamOptions, type StructuredOptions } from "./types";

export interface OpenAILLMOptions {
  apiKey?: string;
  baseURL?: string;
  streamIdleMs?: number;
}

const STREAM_IDLE_MS = 20_000;

/** Text of the first output_text content in a Responses API result. */
function outputText(response: { output?: unknown[] }): string {
  for (const item of response.output ?? []) {
    const content = (item as { type?: string; content?: { type?: string; text?: string }[] }).content;
    if ((item as { type?: string }).type !== "message" || !content) continue;
    const text = content.find((c) => c.type === "output_text")?.text;
    if (text !== undefined) return text;
  }
  throw new Error("LLM response has no output_text");
}

export class OpenAILLM implements LLMClient {
  private client: OpenAI;
  private streamIdleMs: number;

  constructor(opts: OpenAILLMOptions = {}) {
    this.client = new OpenAI({
      apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: opts.baseURL ?? (process.env.OPENAI_BASE_URL || undefined),
      timeout: 45_000,
      maxRetries: 1,
    });
    this.streamIdleMs = opts.streamIdleMs ?? STREAM_IDLE_MS;
  }

  async structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    opts: StructuredOptions = {},
  ): Promise<T> {
    const response = await this.client.responses.create({
      model,
      input: messages,
      text: { format: zodTextFormat(schema as never, opts.name ?? "output") },
      ...(opts.effort ? { reasoning: { effort: opts.effort } } : {}),
    });
    return schema.parse(JSON.parse(outputText(response)));
  }

  async *stream(model: string, messages: LLMMessage[], opts: StreamOptions = {}): AsyncIterable<string> {
    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    opts.signal?.addEventListener("abort", onOuterAbort);
    let stalled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        controller.abort();
      }, this.streamIdleMs);
    };
    try {
      arm();
      const events = await this.client.responses.create(
        { model, input: messages, stream: true, ...(opts.effort ? { reasoning: { effort: opts.effort } } : {}) },
        { signal: controller.signal },
      );
      for await (const event of events) {
        if (event.type === "response.output_text.delta") {
          arm();
          yield event.delta;
        } else if (event.type === "response.failed" || event.type === "error") {
          const msg = event.type === "error" ? event.message : (event.response.error?.message ?? "LLM response failed");
          throw new Error(msg);
        } else if (event.type === "response.completed" || event.type === "response.incomplete") {
          return;
        }
      }
      // The SDK ends the iterator quietly when aborted, so a stall must be detected here too.
      if (stalled) throw new LLMTimeoutError(`no LLM delta for ${this.streamIdleMs} ms`);
    } catch (err) {
      if (stalled) throw new LLMTimeoutError(`no LLM delta for ${this.streamIdleMs} ms`);
      throw err;
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onOuterAbort);
    }
  }
}
