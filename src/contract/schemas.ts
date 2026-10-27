// kit/CONTRACT.md §1–3 as zod schemas; TS types are inferred from them so the two can never drift.
// FROZEN after T00: only Lane 1 changes this file, in a commit titled `contract: …`.
import { z } from "zod";
import { EVENT_TYPES } from "./taxonomy";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---------- §1 Domain ----------
export const EventTypeSchema = z.enum(EVENT_TYPES);
export const ShopTierSchema = z.enum(["mall", "preferred", "regular"]);
export const CategoryIdSchema = z.string();

export const ShopSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: ShopTierSchema,
  rating: z.number(),
  shipFee: z.number().int(),
  city: z.string(),
});

export const ProductSchema = z.object({
  id: z.string(),
  shopId: z.string(),
  title: z.string(),
  category: CategoryIdSchema,
  description: z.string(),
  price: z.number().int(),
  rating: z.number(),
  reviewCount: z.number().int(),
  soldCount: z.number().int(),
  stock: z.number().int(),
  tags: z.array(z.string()),
  attributes: z.record(z.string(), z.string()),
  shipDaysMin: z.number().int(),
  shipDaysMax: z.number().int(),
  updatedForDemandAt: z.string().nullable(),
});

export const VoucherSchema = z.object({
  id: z.string(),
  scope: z.enum(["platform", "shop"]),
  shopId: z.string().nullable(),
  code: z.string(),
  kind: z.enum(["fixed", "percent", "freeship"]),
  value: z.number().int(),
  maxDiscount: z.number().int().nullable(),
  minSpend: z.number().int(),
  validUntil: isoDate,
});

export const PlanItemSchema = z.object({
  key: z.string(),
  needLabel: z.string(),
  category: CategoryIdSchema.nullable(),
  required: z.boolean(),
  quantity: z.number().int(),
  mustHaveTags: z.array(z.string()),
  niceToHaveTags: z.array(z.string()),
  maxUnitPrice: z.number().int().nullable(),
});

export const KitPlanSchema = z.object({
  event: EventTypeSchema,
  language: z.enum(["en", "vi"]),
  budget: z.number().int().nullable(),
  deadline: isoDate.nullable(),
  items: z.array(PlanItemSchema),
  assumptions: z.array(z.string()),
});

export const CandidateSchema = z.object({
  product: ProductSchema,
  shop: ShopSchema,
  score: z.number(),
  matchedTags: z.array(z.string()),
  arrivesBy: isoDate,
});

export const BasketLineSchema = z.object({
  itemKey: z.string(),
  product: ProductSchema,
  shop: ShopSchema,
  quantity: z.number().int(),
  lineTotal: z.number().int(),
  reason: z.string(),
  alternatives: z.array(CandidateSchema).max(2),
});

export const ShopGroupSchema = z.object({
  shopId: z.string(),
  shopName: z.string(),
  subtotal: z.number().int(),
  shipping: z.number().int(),
  shopDiscount: z.number().int(),
  voucherCodes: z.array(z.string()),
});

export const SavingSchema = z.object({ label: z.string(), amount: z.number().int() });

export const ProfileSchema = z.enum(["saver", "balanced", "premium"]);

export const BasketOptionSchema = z.object({
  profile: ProfileSchema,
  status: z.enum(["ok", "over_budget"]),
  lines: z.array(BasketLineSchema),
  noMatch: z.array(
    z.object({
      itemKey: z.string(),
      needLabel: z.string(),
      reason: z.enum(["no_category", "no_product_with_tags", "none_in_time", "none_in_budget"]),
    }),
  ),
  skipped: z.array(z.object({ itemKey: z.string(), needLabel: z.string(), reason: z.literal("budget") })),
  shops: z.array(ShopGroupSchema),
  itemsTotal: z.number().int(),
  shippingTotal: z.number().int(),
  discountTotal: z.number().int(),
  grandTotal: z.number().int(),
  savings: z.array(SavingSchema),
  minimumCost: z.number().int().optional(),
  costDrivers: z.array(z.string()).optional(),
});

export const PlanDiffSchema = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  changed: z.array(z.string()),
});

// ---------- §2 Adapter rows ----------
export const DemandItemRowSchema = z.object({
  sessionId: z.string(),
  createdAt: z.string(),
  event: EventTypeSchema,
  needLabel: z.string(),
  category: CategoryIdSchema.nullable(),
  tags: z.array(z.string()),
  matchedCount: z.number().int(),
  budgetHint: z.number().int().nullable(),
});

// ---------- §3 HTTP API ----------
export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export const CategoryInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  event: EventTypeSchema,
  icon: z.string(),
  color: z.string(),
});

export const ProductWithShopSchema = ProductSchema.extend({ shop: ShopSchema });
export const ProductsResponseSchema = z.object({ products: z.array(ProductWithShopSchema) });
export const ProductDetailResponseSchema = z.object({
  product: ProductSchema,
  shop: ShopSchema,
  vouchers: z.array(VoucherSchema),
});
export const ShopsResponseSchema = z.object({ shops: z.array(ShopSchema) });
export const CategoriesResponseSchema = z.object({ categories: z.array(CategoryInfoSchema) });
export const CheckoutRequestSchema = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().positive() })).min(1),
});
export const CheckoutResponseSchema = z.object({ orderId: z.string(), grandTotal: z.number().int() });

// Kitly SSE
export const KitRequestSchema = z.object({
  query: z.string().min(1),
  profiles: z.array(ProfileSchema).optional(),
});
export const RefineRequestSchema = z.object({
  sessionId: z.string(),
  previousPlan: KitPlanSchema,
  message: z.string().min(1),
  profiles: z.array(ProfileSchema).optional(),
});

export const StepIdSchema = z.enum(["understand", "plan", "search", "optimize", "explain"]);
export const StepEventDataSchema = z.object({
  id: StepIdSchema,
  status: z.enum(["running", "done"]),
  detail: z.string().optional(),
});
export const PlanEventDataSchema = z.object({
  sessionId: z.string(),
  plan: KitPlanSchema,
  diff: PlanDiffSchema.optional(),
});
export const OptionsEventDataSchema = z.object({ options: z.array(BasketOptionSchema) });
export const ExplanationEventDataSchema = z.object({ delta: z.string() });
export const DoneEventDataSchema = z.object({ sessionId: z.string() });
export const ErrorEventDataSchema = z.object({ code: z.string(), message: z.string() });

export const KitSseEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("step"), data: StepEventDataSchema }),
  z.object({ event: z.literal("plan"), data: PlanEventDataSchema }),
  z.object({ event: z.literal("options"), data: OptionsEventDataSchema }),
  z.object({ event: z.literal("explanation"), data: ExplanationEventDataSchema }),
  z.object({ event: z.literal("done"), data: DoneEventDataSchema }),
  z.object({ event: z.literal("error"), data: ErrorEventDataSchema }),
]);

// Seller Intelligence
const PriceBandSchema = z.object({ p25: z.number().int(), p75: z.number().int() });
export const GapSchema = z.object({
  key: z.string(),
  type: z.enum(["listing_gap", "assortment_gap"]),
  needLabel: z.string(),
  category: CategoryIdSchema.nullable(),
  tags: z.array(z.string()),
  thisWeek: z.number().int(),
  lastWeek: z.number().int(),
  matchingProducts: z.number().int(),
  priceBand: PriceBandSchema.nullable(),
  neededWith: z.array(z.object({ category: CategoryIdSchema, share: z.number() })),
  advice: z.string(),
  candidates: z
    .array(z.object({ productId: z.string(), title: z.string(), evidence: z.string() }))
    .optional(),
  watchers: z.number().int().optional(),
  /** F5: this shop's listing was already fixed by Kitly for this gap (survives reload; Undo reverts it). */
  appliedFix: z.object({ productId: z.string(), title: z.string(), appliedAt: z.string() }).nullable().optional(),
});
export const InsightsResponseSchema = z.object({
  window: z.object({ thisWeekFrom: isoDate, lastWeekFrom: isoDate, today: isoDate }),
  gaps: z.array(GapSchema),
  combos: z.array(z.object({ categories: z.array(CategoryIdSchema), count: z.number().int() })),
  topNeeds: z.array(z.object({ event: EventTypeSchema, count: z.number().int() })),
});

export const EnrichmentPreviewRequestSchema = z.object({ productId: z.string(), gapKey: z.string() });
export const EnrichmentPreviewResponseSchema = z.object({
  proposalId: z.string(),
  before: ProductSchema,
  after: ProductSchema,
  added: z.object({
    titleSuffix: z.string(),
    tags: z.array(z.string()),
    attributes: z.record(z.string(), z.string()),
    descriptionAppend: z.string(),
  }),
  kept: z.object({ title: z.string(), tags: z.array(z.string()) }),
  keywordCheck: z.array(z.object({ keyword: z.string(), stillMatches: z.boolean() })),
  evidence: z.string(),
});
export const EnrichmentApplyRequestSchema = z.object({ proposalId: z.string() });
export const EnrichmentUndoRequestSchema = z.object({ productId: z.string() });
export const ProductResponseSchema = z.object({ product: ProductSchema });

export const DemandWatchRequestSchema = z.object({ gapKey: z.string() });
export const DemandWatchResponseSchema = z.object({ watchers: z.number().int() });
