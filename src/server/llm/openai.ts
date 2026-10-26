// The ONLY place that talks to OpenAI (AGENTS.md). Honours OPENAI_BASE_URL for OpenAI-compatible proxies.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { LLM, LLMMessage } from "./types";

type OutputItem = { type: string; content?: { type: string; text?: string }[] };

export class OpenAILLM implements LLM {
  private client: OpenAI;

  constructor(opts?: { apiKey?: string; baseURL?: string }) {
    this.client = new OpenAI({
      apiKey: opts?.apiKey ?? process.env.OPENAI_API_KEY,
      baseURL: opts?.baseURL ?? (process.env.OPENAI_BASE_URL || undefined),
    });
  }

  async structured<T>(
    model: string,
    schema: z.ZodType<T>,
    messages: LLMMessage[],
    name = "output",
  ): Promise<T> {
    const res = await this.client.responses.create({
      model,
      input: messages,
      text: { format: zodTextFormat(schema, name) },
    });
    // Read the text from the raw output items (not output_parsed / helpers) so proxies that reshape responses still work.
    const text = ((res.output ?? []) as OutputItem[])
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
    if (!text) throw new Error(`LLM returned no output_text (model ${model})`);
    return schema.parse(JSON.parse(text));
  }

  async *stream(model: string, messages: LLMMessage[]): AsyncIterable<string> {
    // Raw events via create({stream:true}); never responses.stream() — it breaks on proxies that rewrite ids.
    const events = await this.client.responses.create({ model, input: messages, stream: true });
    for await (const e of events) {
      if (e.type === "response.output_text.delta") yield e.delta;
      else if (e.type === "error") throw new Error(`LLM stream error: ${e.message}`);
      else if (e.type === "response.failed") throw new Error("LLM stream failed");
    }
  }
}
