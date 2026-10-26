// Seam S4 (pure half) — mergeEnrichment + keywordCheck: original title kept verbatim, additive only, old keywords match.
import { describe, expect, it } from "vitest";
import type { Product } from "@/contract";
import { fixtures } from "@/contract/fixtures";
import { keywordCheck, mergeEnrichment, MAX_TITLE, type Proposal } from "@/server/enrichment";

const hero = (): Product => structuredClone(fixtures.products.find((p) => p.id === "prod-minhan-backpack")!);

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  titleSuffix: "Anti-Hunchback, Lightweight 0.75 kg, Grade 1",
  tags: ["anti-hunchback", "lightweight", "grade-1"],
  attributes: { weight: "0.75 kg", age: "6-8" },
  descriptionAppend: "Ergonomic anti-hunchback design for Grade 1 children.",
  ...over,
});

describe("mergeEnrichment", () => {
  it("keeps the original title verbatim as the prefix and appends ' | ' + suffix", () => {
    const before = hero();
    const after = mergeEnrichment(before, proposal());
    expect(after.title).toBe(`${before.title} | Anti-Hunchback, Lightweight 0.75 kg, Grade 1`);
  });

  it("trims a long suffix at a word boundary to fit MAX_TITLE and never cuts the original", () => {
    const before = hero();
    const after = mergeEnrichment(before, proposal({ titleSuffix: "Very ".repeat(40) + "Long" }));
    expect(after.title.length).toBeLessThanOrEqual(MAX_TITLE);
    expect(after.title.startsWith(`${before.title} | Very`)).toBe(true);
    expect(after.title).not.toMatch(/\s$/);
    expect(after.title.endsWith("Ver")).toBe(false);
  });

  it("drops the suffix (no separator) when the original leaves no room, original longer than MAX_TITLE included", () => {
    for (const len of [118, 130]) {
      const before = { ...hero(), title: "T".repeat(len) };
      expect(mergeEnrichment(before, proposal()).title).toBe(before.title);
    }
    expect(mergeEnrichment(hero(), proposal({ titleSuffix: "  " })).title).toBe(hero().title);
  });

  it("unions tags (original first, no duplicates) and never overwrites an existing attribute value", () => {
    const before = { ...hero(), attributes: { material: "polyester", weight: "0.8 kg" } };
    const after = mergeEnrichment(before, proposal({ tags: ["kids", "anti-hunchback", "anti-hunchback"] }));
    expect(after.tags).toEqual(["kids", "anti-hunchback"]);
    expect(after.attributes).toEqual({ material: "polyester", weight: "0.8 kg", age: "6-8" });
  });

  it("appends the description paragraph after a blank line; an empty append leaves it unchanged", () => {
    const before = hero();
    expect(mergeEnrichment(before, proposal()).description).toBe(
      `${before.description}\n\nErgonomic anti-hunchback design for Grade 1 children.`,
    );
    expect(mergeEnrichment(before, proposal({ descriptionAppend: " " })).description).toBe(
      before.description,
    );
  });

  it("is additive only: nothing in the original listing is removed or changed, input not mutated", () => {
    const before = hero();
    const snapshot = structuredClone(before);
    const after = mergeEnrichment(before, proposal());
    expect(before).toEqual(snapshot);
    expect(after.title.startsWith(before.title)).toBe(true);
    expect(after.description.startsWith(before.description)).toBe(true);
    for (const t of before.tags) expect(after.tags).toContain(t);
    for (const [k, v] of Object.entries(before.attributes)) expect(after.attributes[k]).toBe(v);
    const { title, description, tags, attributes, ...rest } = after;
    const { title: t0, description: d0, tags: g0, attributes: a0, ...rest0 } = before;
    void [title, description, tags, attributes, t0, d0, g0, a0];
    expect(rest).toEqual(rest0);
  });
});

describe("keywordCheck", () => {
  it("lists every original title token (lowercased, ≥ 3 chars, unique) and they all still match after merge", () => {
    const before = hero();
    const check = keywordCheck(before, mergeEnrichment(before, proposal()));
    expect(check.map((c) => c.keyword)).toEqual(["minh", "kids", "backpack", "new", "model", "2026"]);
    expect(check.every((c) => c.stillMatches)).toBe(true);
  });

  it("reports a keyword that is gone", () => {
    const before = { ...hero(), title: "Kids Backpack, Blue" };
    const check = keywordCheck(before, { ...before, title: "Kids Rucksack" });
    expect(check).toEqual([
      { keyword: "kids", stillMatches: true },
      { keyword: "backpack", stillMatches: false },
      { keyword: "blue", stillMatches: false },
    ]);
  });
});
