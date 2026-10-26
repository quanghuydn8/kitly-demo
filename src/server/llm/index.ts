// LLM entry point: getLLM() for production code, FakeLLM for tests, model names from env.
import { OpenAILLM } from "./openai";
import type { LLM } from "./types";

export { OpenAILLM } from "./openai";
export { FakeLLM } from "./fake";
export type { LLM, LLMMessage } from "./types";

export const models = {
  planner: () => process.env.KITLY_MODEL_PLANNER || "gpt-6.1-sol",
  fast: () => process.env.KITLY_MODEL_FAST || "gpt-6-luna",
};

let instance: LLM | null = null;

export function getLLM(): LLM {
  return (instance ??= new OpenAILLM());
}

/** Tests only: inject a FakeLLM (or null to reset). */
export function setLLMForTests(llm: LLM | null): void {
  instance = llm;
}
