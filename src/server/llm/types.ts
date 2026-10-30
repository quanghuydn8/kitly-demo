import type { z } from "zod";

export type Effort = "minimal" | "low" | "medium" | "high";
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface StructuredOptions {
  effort?: Effort;
  /** json_schema name sent to the API (letters, digits, _ and -). */
  name?: string;
}
export interface StreamOptions {
  effort?: Effort;
  signal?: AbortSignal;
}

/** The one LLM seam. All Kitly LLM calls go through an LLMClient (OpenAILLM in prod, FakeLLM in tests). */
export interface LLMClient {
  structured<T>(model: string, schema: z.ZodType<T>, messages: LLMMessage[], opts?: StructuredOptions): Promise<T>;
  stream(model: string, messages: LLMMessage[], opts?: StreamOptions): AsyncIterable<string>;
}

export class LLMTimeoutError extends Error {
  constructor(message = "LLM stream stalled") {
    super(message);
    this.name = "LLMTimeoutError";
  }
}
