// proposeEnrichment (seam S4, FakeLLM): the fast model drafts additions; CODE keeps only tags that are allowed
// (gap tags + tags the category already uses) AND backed by an evidence quote found in the listing.
import { describe, expect, it } from "vitest";
import type { Product } from "@/contract";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { proposeEnrichment } from "@/server/enrichment/propose";
import { FakeLLM } from "@/server/llm";
import { draft, SPINE } from "./support/enrichment";

const GAP = { key: "school-backpack|anti-hunchback", category: "school-backpack", tags: ["anti-hunchback"] };
const VOCAB = ["kids", "lightweight", "grade-1", "anti-hunchback"];

async function minhAn(): Promise<Product> {
  return (await new InMemoryAdapter().getProduct("prod-minhan-backpack"))!;
}
describe("proposeEnrichment", () => {
  it("one fast-model call (enrichment_draft) whose prompt asks for new information only", async () => {
    const llm = new FakeLLM({ structured: [draft()] });
    const p = await proposeEnrichment(await minhAn(), GAP, { llm, vocabulary: VOCAB });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]).toMatchObject({ kind: "structured", name: "enrichment_draft", effort: "low" });
    const prompt = llm.calls[0].messages.map((m) => m.content).join("\n");
    expect(prompt).toMatch(/not already in the listing/i);
    expect(prompt).toContain("anti-hunchback");
    expect(p).toEqual({
      titleSuffix: "Anti-hunchback, Lightweight, Grade 1",
      tags: ["anti-hunchback", "lightweight", "grade-1"],
      attributes: { weight: "0.75 kg" },
      descriptionAppend: "",
      evidence: SPINE,
    });
  });

  // rehearsal 2 (31/10): allowedTags were sent as "anti-hunchback (hint…)" and 1 real draft in 8 copied that whole string
  // as the tag name → every tag was dropped → Apply changed only the title and Beat 4's loop broke
  it("allowedTags go to the model as plain tag ids (hints apart); a tag echoed with its hint still counts", async () => {
    const llm = new FakeLLM({
      structured: [
        draft({
          tags: [
            { tag: "anti-hunchback (ergonomic back support / S-shaped straps that keep a child's spine straight)", evidence: SPINE },
            { tag: "lightweight", evidence: "Weighs only 0.75 kg" },
          ],
        }),
      ],
    });
    const p = await proposeEnrichment(await minhAn(), GAP, { llm, vocabulary: VOCAB });
    expect(p.tags).toEqual(["anti-hunchback", "lightweight"]);
    const user = JSON.parse(llm.calls[0].messages.at(-1)!.content as string);
    expect(user.allowedTags).toEqual(expect.arrayContaining(["anti-hunchback", "lightweight", "grade-1"]));
    expect(user.allowedTags.every((t: string) => /^[a-z0-9-]+$/.test(t))).toBe(true);
  });

  it("a draft that keeps none of the gap's tags is asked again once (the gap tag is what closes the Beat 4 loop)", async () => {
    const noGapTag = draft({ tags: [{ tag: "lightweight", evidence: "Weighs only 0.75 kg" }] });
    const llm = new FakeLLM({ structured: [noGapTag, draft()] });
    const p = await proposeEnrichment(await minhAn(), GAP, { llm, vocabulary: VOCAB });
    expect(llm.calls).toHaveLength(2);
    expect(p.tags).toContain("anti-hunchback");
  });

  it("drops tags not supported by evidence even if the LLM returns them", async () => {
    const llm = new FakeLLM({
      structured: [
        draft({
          tags: [
            { tag: "anti-hunchback", evidence: SPINE },
            { tag: "lightweight", evidence: "ultra-light 300 g frame" }, // quote not in the listing
            { tag: "grade-1", evidence: "" }, // no evidence
            { tag: "glow-in-dark", evidence: "Water-resistant fabric" }, // real quote, but not an allowed tag
            { tag: "kids", evidence: "Kids" }, // already on the listing
          ],
        }),
      ],
    });
    const p = await proposeEnrichment(await minhAn(), GAP, { llm, vocabulary: [...VOCAB, "waterproof"] });
    expect(p.tags).toEqual(["anti-hunchback"]);
    expect(p.evidence).toBe(SPINE);
  });

  it("evidence quotes match the listing case- and whitespace-insensitively, with quotes / trailing dot ignored", async () => {
    const llm = new FakeLLM({
      structured: [draft({ tags: [{ tag: "anti-hunchback", evidence: ' "s-shaped  straps that keep the spine straight." ' }] })],
    });
    const p = await proposeEnrichment(await minhAn(), GAP, { llm, vocabulary: VOCAB });
    expect(p.tags).toEqual(["anti-hunchback"]);
  });

  it("an LLM error propagates (the route answers 502)", async () => {
    const llm = new FakeLLM({ structured: [new Error("proxy down")] });
    await expect(proposeEnrichment(await minhAn(), GAP, { llm, vocabulary: VOCAB })).rejects.toThrow("proxy down");
  });
});
