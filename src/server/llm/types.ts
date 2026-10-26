import type { z } from "zod";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The one LLM seam. Kitly modules depend on this interface; tests inject FakeLLM. */
export interface LLM {
  /** Structured Outputs: the model must return JSON matching `schema`; result is zod-validated. */
  structured<T>(model: string, schema: z.ZodType<T>, messages: LLMMessage[], name?: string): Promise<T>;
  /** Streams plain-text deltas. */
  stream(model: string, messages: LLMMessage[]): AsyncIterable<string>;
}
