// Test helper: a full seeded catalog built through the real generateCatalog with a FakeLLM (no network).
// The fake output is deliberately adversarial: it uses the planted-gap tags the code must strip.
import { FakeLLM } from "@/server/llm";
import { generateCatalog, LLM_CATEGORIES } from "@/server/seed/catalog";

export function fakeCategoryOutput(category: string) {
  return {
    products: Array.from({ length: 6 }, (_, i) => ({
      title: `Test ${category} item ${i + 1}`,
      description: `A ${category} with concrete specs: ${i + 1}00 g, 2-year warranty.`,
      price: 100000 + i * 50000,
      rating: 4.2 + i * 0.1,
      reviewCount: 10 + i,
      soldCount: 100 + i,
      stock: i === 0 ? 0 : 50,
      shipDaysMin: 1 + (i % 3),
      shipDaysMax: 3 + (i % 3),
      tags: [
        "kids",
        "lightweight",
        "anti-hunchback",
        "backpack-cover",
        "anti-blue-light",
        i % 2 ? "compact" : "premium",
      ],
      attributes: [
        { key: "material", value: "plastic" },
        { key: "weight", value: `${i + 1}00 g` },
      ],
    })),
  };
}

export function fakeCatalogLLM() {
  return new FakeLLM({ structured: LLM_CATEGORIES.map((c) => fakeCategoryOutput(c)) });
}

export async function buildTestCatalog() {
  return generateCatalog({ llm: fakeCatalogLLM(), model: "fake-fast", cacheDir: null });
}
