// Enrichment merge (seam S4, pure): mergeEnrichment is additive only, keywordCheck proves old keywords still match.
import { describe, expect, it } from "vitest";
import type { Product } from "@/contract";
import { InMemoryAdapter } from "@/server/adapter/in-memory";
import { keywordCheck, mergeEnrichment, MAX_TITLE, type EnrichmentProposal } from "@/server/enrichment/merge";

const DESC =
  "Padded ergonomic back panel with S-shaped straps that keep the spine straight. Weighs only 0.75 kg. Water-resistant fabric. Sized for children aged 6–8.";

async function minhAn(): Promise<Product> {
  return (await new InMemoryAdapter().getProduct("prod-minhan-backpack"))!;
}
const proposal = (over: Partial<EnrichmentProposal> = {}): EnrichmentProposal => ({
  titleSuffix: "Anti-hunchback, Lightweight 0.75 kg, Grade 1",
  tags: ["anti-hunchback", "lightweight", "grade-1"],
  attributes: { weight: "0.75 kg", age: "6-8" },
  descriptionAppend: "Fits notebooks up to A4.",
  evidence: "S-shaped straps that keep the spine straight",
  ...over,
});

describe("mergeEnrichment", () => {
  it("keeps the original title verbatim as a prefix and appends ' | ' + suffix", async () => {
    const p = await minhAn();
    const { listing, added } = mergeEnrichment(p, proposal());
    expect(listing.title).toBe("Minh An Kids Backpack New Model 2026 | Anti-hunchback, Lightweight 0.75 kg, Grade 1");
    expect(added.titleSuffix).toBe("Anti-hunchback, Lightweight 0.75 kg, Grade 1");
  });

  it("is additive only: tags/attributes union, existing attribute values never overwritten, description appended", async () => {
    const p = await minhAn();
    const { listing, added } = mergeEnrichment(p, proposal({ attributes: { material: "nylon", weight: "0.75 kg" } }));
    expect(listing.tags).toEqual(["kids", "anti-hunchback", "lightweight", "grade-1"]);
    expect(listing.attributes).toEqual({ material: "polyester", weight: "0.75 kg" });
    expect(listing.description).toBe(DESC + "\n\nFits notebooks up to A4.");
    expect(added).toEqual({
      titleSuffix: "Anti-hunchback, Lightweight 0.75 kg, Grade 1",
      tags: ["anti-hunchback", "lightweight", "grade-1"],
      attributes: { weight: "0.75 kg" },
      descriptionAppend: "Fits notebooks up to A4.",
    });
    for (const t of p.tags) expect(listing.tags).toContain(t);
  });

  it("a descriptionAppend that repeats the existing description leaves the description unchanged", async () => {
    const p = await minhAn();
    const repeat = "weighs only 0.75 kg.  Water-resistant fabric.";
    const { listing, added } = mergeEnrichment(p, proposal({ descriptionAppend: repeat }));
    expect(listing.description).toBe(DESC);
    expect(added.descriptionAppend).toBe("");
  });

  it("drops only the repeated sentences and keeps the new ones", async () => {
    const p = await minhAn();
    const { listing } = mergeEnrichment(p, proposal({ descriptionAppend: "Weighs only 0.75 kg. Has a chest strap!" }));
    expect(listing.description).toBe(DESC + "\n\nHas a chest strap!");
  });

  it("trims the suffix (at a word) to fit 120 chars and never cuts the original title", async () => {
    const p = { ...(await minhAn()), title: "A".repeat(100) };
    const { listing, added } = mergeEnrichment(p, proposal({ titleSuffix: "Anti-hunchback Lightweight Grade 1 Waterproof" }));
    expect(listing.title.length).toBeLessThanOrEqual(MAX_TITLE);
    expect(listing.title).toBe("A".repeat(100) + " | Anti-hunchback");
    expect(added.titleSuffix).toBe("Anti-hunchback");

    const full = { ...p, title: "B".repeat(118) };
    const r = mergeEnrichment(full, proposal());
    expect(r.listing.title).toBe(full.title);
    expect(r.added.titleSuffix).toBe("");
  });

  it("strips separators the model puts around the suffix (live model sent '— Ergonomic, …')", async () => {
    const p = await minhAn();
    for (const suffix of ["— Ergonomic, Lightweight", "| - Ergonomic, Lightweight |", ": Ergonomic, Lightweight,"]) {
      expect(mergeEnrichment(p, proposal({ titleSuffix: suffix })).listing.title).toBe(
        "Minh An Kids Backpack New Model 2026 | Ergonomic, Lightweight",
      );
    }
  });

  it("an empty proposal changes nothing; duplicate / existing tags are not added twice", async () => {
    const p = await minhAn();
    const { listing, added } = mergeEnrichment(
      p,
      proposal({ titleSuffix: " ", tags: ["kids", "kids"], attributes: {}, descriptionAppend: "" }),
    );
    expect(listing).toEqual({ title: p.title, description: p.description, tags: p.tags, attributes: p.attributes });
    expect(added).toEqual({ titleSuffix: "", tags: [], attributes: {}, descriptionAppend: "" });
  });
});

describe("keywordCheck", () => {
  it("every original title token (lowercased, ≥ 3 chars) still matches after the merge", async () => {
    const p = await minhAn();
    const { listing } = mergeEnrichment(p, proposal());
    const check = keywordCheck(p, listing);
    expect(check.map((c) => c.keyword)).toEqual(["minh", "kids", "backpack", "new", "model", "2026"]);
    expect(check.every((c) => c.stillMatches)).toBe(true);
  });

  it("flags a keyword the new title lost", () => {
    expect(keywordCheck({ title: "Blue Kids Bag" }, { title: "Kids Bag" })).toEqual([
      { keyword: "blue", stillMatches: false },
      { keyword: "kids", stillMatches: true },
      { keyword: "bag", stillMatches: true },
    ]);
  });
});
