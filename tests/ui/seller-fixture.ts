// Hand-built Seller Intelligence fixtures for the T12 UI tests (validated against the frozen contract schemas).
// Numbers follow DEMO.md Beat 3: Minh An's backpack listing gap 38 vs 21, the raincoat assortment gap 52.
import {
  EnrichmentPreviewResponseSchema,
  InsightsResponseSchema,
  type EnrichmentPreviewResponse,
  type InsightsResponse,
} from "@/contract";

export const backpackGap: InsightsResponse["gaps"][number] = {
  key: "school-backpack|anti-hunchback",
  type: "listing_gap",
  needLabel: "Anti-hunchback backpack",
  category: "school-backpack",
  tags: ["anti-hunchback"],
  thisWeek: 38,
  lastWeek: 21,
  matchingProducts: 0,
  priceBand: { p25: 300000, p75: 400000 },
  neededWith: [
    { category: "notebooks", share: 0.8 },
    { category: "water-bottle", share: 0.5 },
  ],
  advice: "Add anti-hunchback wording to your Minh An backpack listing.",
  candidates: [
    {
      productId: "prod-minhan-backpack",
      title: "Minh An Kids Backpack New Model 2026",
      evidence: "S-shaped straps keep the spine straight",
    },
  ],
  appliedFix: null,
  watchers: 0,
};

export const raincoatGap: InsightsResponse["gaps"][number] = {
  key: "kids-raincoat|backpack-cover",
  type: "assortment_gap",
  needLabel: "Kids raincoat with backpack cover",
  category: "kids-raincoat",
  tags: ["backpack-cover"],
  thisWeek: 52,
  lastWeek: 40,
  matchingProducts: 0,
  priceBand: { p25: 150000, p75: 250000 },
  neededWith: [{ category: "school-backpack", share: 0.6 }],
  advice: "Buyers want a raincoat that also covers the backpack.",
  appliedFix: null,
  watchers: 4,
};

export const noneGap: InsightsResponse["gaps"][number] = {
  key: "none|",
  type: "assortment_gap",
  needLabel: "Not in catalog: Dog food, Dog bed",
  category: null,
  tags: [],
  thisWeek: 5,
  lastWeek: 0,
  matchingProducts: 0,
  priceBand: null,
  neededWith: [],
  advice: "Pet supplies are not sold yet.",
  appliedFix: null,
  watchers: 0,
};

export function insights(over: Partial<InsightsResponse> = {}): InsightsResponse {
  return InsightsResponseSchema.parse({
    window: { thisWeekFrom: "2026-08-27", lastWeekFrom: "2026-08-20", today: "2026-09-02" },
    gaps: [backpackGap, raincoatGap, noneGap],
    combos: [
      { categories: ["notebooks", "school-backpack"], count: 30 },
      { categories: ["kids-raincoat", "school-backpack"], count: 12 },
    ],
    topNeeds: [
      { event: "back_to_school", count: 90 },
      { event: "newborn", count: 30 },
    ],
    recent: [
      {
        needLabel: "Anti-hunchback backpack",
        category: "school-backpack",
        tags: ["anti-hunchback"],
        event: "back_to_school",
        createdAt: "2026-09-02T09:58:00.000Z",
      },
      { needLabel: "Puppy leash", category: null, tags: [], event: "other", createdAt: "2026-09-02T09:40:00.000Z" },
    ],
    ...over,
  });
}

const minhAn = {
  id: "prod-minhan-backpack",
  shopId: "shop-minhan",
  title: "Minh An Kids Backpack New Model 2026",
  category: "school-backpack",
  description: "S-shaped straps keep the spine straight.",
  price: 349000,
  rating: 4.7,
  reviewCount: 320,
  soldCount: 1200,
  stock: 40,
  tags: ["school", "kids"],
  attributes: { weight: "0.75 kg" },
  shipDaysMin: 1,
  shipDaysMax: 2,
  updatedForDemandAt: null,
};

export const preview: EnrichmentPreviewResponse = EnrichmentPreviewResponseSchema.parse({
  proposalId: "tok.sig",
  before: minhAn,
  after: {
    ...minhAn,
    title: `${minhAn.title} — Anti-hunchback, Lightweight`,
    tags: [...minhAn.tags, "anti-hunchback", "lightweight", "grade-1"],
    attributes: { ...minhAn.attributes, back_support: "S-shaped straps" },
    description: `${minhAn.description}\n\nAnti-hunchback design for Grade 1.`,
  },
  added: {
    titleSuffix: " — Anti-hunchback, Lightweight",
    tags: ["anti-hunchback", "lightweight", "grade-1"],
    attributes: { back_support: "S-shaped straps" },
    descriptionAppend: "Anti-hunchback design for Grade 1.",
  },
  kept: { title: minhAn.title, tags: minhAn.tags },
  keywordCheck: [
    { keyword: "backpack", stillMatches: true },
    { keyword: "kids", stillMatches: true },
    { keyword: "model", stillMatches: false },
  ],
  evidence: "S-shaped straps keep the spine straight",
});
