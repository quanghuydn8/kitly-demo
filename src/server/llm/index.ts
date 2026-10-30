// src/server/llm: one client for every LLM call (AGENTS.md). Route handlers get it via getLLM();
// tests swap in a FakeLLM with setLLM().
import { OpenAILLM } from "./openai";
import type { LLMClient } from "./types";

export * from "./types";
export { OpenAILLM } from "./openai";
export { FakeLLM, FakeDelay, fakeDelay, type FakeLLMCall } from "./fake";
export { llmModels } from "./models";
export { withIdleTimeout } from "./idle";

let current: LLMClient | null = null;

export function getLLM(): LLMClient {
  current ??= new OpenAILLM();
  return current;
}

/** Test seam: replace the process LLM client (pass null to reset). */
export function setLLM(llm: LLMClient | null): void {
  current = llm;
}
