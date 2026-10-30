// FakeLLM answers for the enrichment draft (enrichment_draft schema) used by the enrichment tests.
export const SPINE = "S-shaped straps that keep the spine straight";

export function draft(over: Record<string, unknown> = {}) {
  return {
    titleSuffix: "Anti-hunchback, Lightweight, Grade 1",
    tags: [
      { tag: "anti-hunchback", evidence: SPINE },
      { tag: "lightweight", evidence: "Weighs only 0.75 kg" },
      { tag: "grade-1", evidence: "sized for children aged 6–8" },
    ],
    attributes: [{ key: "weight", value: "0.75 kg" }],
    descriptionAppend: "",
    ...over,
  };
}
