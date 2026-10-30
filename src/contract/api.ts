// HTTP API (CONTRACT.md §3) — request/response bodies and SSE event payloads as zod schemas.
// FROZEN after ticket 00: only Lane 1 changes this file, in a commit titled `contract: …`.
import { z } from "zod";
import {
  BasketOptionSchema,
  CategoryIdSchema,
  EventTypeSchema,
  FollowUpSchema,
  KitMessageSchema,
  KitPlanSchema,
  KitSelectionSchema,
  KitThreadSummarySchema,
  KitVersionSchema,
  PersonaIdSchema,
  PersonaSchema,
  PlanDiffSchema,
  ProductSchema,
  ProfileSchema,
  ShopSchema,
  VoucherSchema,
} from "./domain";

export const ApiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ---------- Store ----------
export const ProductWithShopSchema = ProductSchema.extend({ shop: ShopSchema });
export type ProductWithShop = z.infer<typeof ProductWithShopSchema>;

export const ProductsResponseSchema = z.object({ products: z.array(ProductWithShopSchema) });
export type ProductsResponse = z.infer<typeof ProductsResponseSchema>;

export const ProductDetailResponseSchema = z.object({
  product: ProductSchema,
  shop: ShopSchema,
  vouchers: z.array(VoucherSchema),
});
export type ProductDetailResponse = z.infer<typeof ProductDetailResponseSchema>;

export const ShopsResponseSchema = z.object({ shops: z.array(ShopSchema) });
export type ShopsResponse = z.infer<typeof ShopsResponseSchema>;

export const CategoryInfoSchema = z.object({
  id: CategoryIdSchema,
  label: z.string(),
  event: EventTypeSchema,
  icon: z.string(),
  color: z.string(),
});
export type CategoryInfo = z.infer<typeof CategoryInfoSchema>;
export const CategoriesResponseSchema = z.object({ categories: z.array(CategoryInfoSchema) });
export type CategoriesResponse = z.infer<typeof CategoriesResponseSchema>;

export const CheckoutRequestSchema = z.object({
  lines: z.array(z.object({ productId: z.string(), quantity: z.number().int().min(1) })).min(1),
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;
export const CheckoutResponseSchema = z.object({ orderId: z.string(), grandTotal: z.number().int() });
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

// ---------- Persona (D43) ----------
export const PersonaResponseSchema = z.object({ persona: PersonaSchema, walletVouchers: z.array(VoucherSchema) });
export type PersonaResponse = z.infer<typeof PersonaResponseSchema>;
export const PersonaRequestSchema = z.object({ id: PersonaIdSchema });
export type PersonaRequest = z.infer<typeof PersonaRequestSchema>;

// ---------- Kitly SSE ----------
export const KitRequestSchema = z.object({ query: z.string().min(1), profiles: z.array(ProfileSchema).optional() });
export type KitRequest = z.infer<typeof KitRequestSchema>;
export const RefineRequestSchema = z.object({
  threadId: z.string(),
  message: z.string().min(1),
  profiles: z.array(ProfileSchema).optional(),
});
export type RefineRequest = z.infer<typeof RefineRequestSchema>;

export const StepIdSchema = z.enum(["understand", "plan", "search", "optimize", "explain"]);
export type StepId = z.infer<typeof StepIdSchema>;

export const StepEventDataSchema = z.object({
  id: StepIdSchema,
  status: z.enum(["running", "done"]),
  detail: z.string().optional(),
});
export const PlanEventDataSchema = z.object({
  sessionId: z.string(),
  threadId: z.string(),
  version: z.number().int(),
  plan: KitPlanSchema,
  diff: PlanDiffSchema.optional(),
});
export const ClarifyEventDataSchema = z.object({
  threadId: z.string(),
  version: z.number().int(),
  question: z.object({
    kind: z.literal("budget"),
    text: z.string(),
    choices: z.array(z.number().int().nullable()), // null = "No limit"
  }),
});
export const OptionsEventDataSchema = z.object({ options: z.array(BasketOptionSchema) });
export const ExplanationEventDataSchema = z.object({ delta: z.string() });
export const FollowupEventDataSchema = z.object({ followUp: FollowUpSchema });
export const DoneEventDataSchema = z.object({
  sessionId: z.string().nullable(), // null on an answer turn (D42)
  threadId: z.string(),
  version: z.number().int(),
  answered: z.literal(true).optional(),
});
export const ErrorEventDataSchema = z.object({ code: z.string(), message: z.string() });

export const KitStreamEventSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("step"), data: StepEventDataSchema }),
  z.object({ event: z.literal("plan"), data: PlanEventDataSchema }),
  z.object({ event: z.literal("clarify"), data: ClarifyEventDataSchema }),
  z.object({ event: z.literal("options"), data: OptionsEventDataSchema }),
  z.object({ event: z.literal("explanation"), data: ExplanationEventDataSchema }),
  z.object({ event: z.literal("followup"), data: FollowupEventDataSchema }),
  z.object({ event: z.literal("done"), data: DoneEventDataSchema }),
  z.object({ event: z.literal("error"), data: ErrorEventDataSchema }),
]);
export type KitStreamEvent = z.infer<typeof KitStreamEventSchema>;
export type KitStreamEventName = KitStreamEvent["event"];
/** A recorded SSE stream, as in fixtures/kit.sample.json. */
export const KitStreamSchema = z.array(KitStreamEventSchema);

// ---------- Kit edits + history ----------
export const KitChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_budget"), budget: z.number().int().nullable() }),
  z.object({ type: z.literal("set_deadline"), deadline: z.string().nullable() }),
  z.object({ type: z.literal("remove_item"), itemKey: z.string() }),
  z.object({ type: z.literal("restore_item"), itemKey: z.string() }),
  z.object({ type: z.literal("restore_version"), version: z.number().int().min(1) }),
]);
export type KitChange = z.infer<typeof KitChangeSchema>;

export const AdjustRequestSchema = z.object({ threadId: z.string(), change: KitChangeSchema });
export type AdjustRequest = z.infer<typeof AdjustRequestSchema>;
export const AdjustResponseSchema = z.object({ version: KitVersionSchema });
export type AdjustResponse = z.infer<typeof AdjustResponseSchema>;

export const PriceRequestSchema = z.object({ threadId: z.string(), selection: KitSelectionSchema });
export type PriceRequest = z.infer<typeof PriceRequestSchema>;
export const PriceResponseSchema = z.object({ option: BasketOptionSchema });
export type PriceResponse = z.infer<typeof PriceResponseSchema>;

export const ThreadsResponseSchema = z.object({ threads: z.array(KitThreadSummarySchema) });
export type ThreadsResponse = z.infer<typeof ThreadsResponseSchema>;
// `messages` = answer turns (D42), included so a reload shows every chat turn.
export const ThreadResponseSchema = z.object({
  thread: KitThreadSummarySchema,
  versions: z.array(KitVersionSchema),
  messages: z.array(KitMessageSchema),
});
export type ThreadResponse = z.infer<typeof ThreadResponseSchema>;
/** fixtures/threads.sample.json: one ThreadResponse per sample thread. */
export const ThreadsSampleSchema = z.array(ThreadResponseSchema);

// ---------- Seller Intelligence ----------
export const GapSchema = z.object({
  key: z.string(),
  type: z.enum(["listing_gap", "assortment_gap"]),
  needLabel: z.string(),
  category: CategoryIdSchema.nullable(),
  tags: z.array(z.string()),
  thisWeek: z.number().int(),
  lastWeek: z.number().int(),
  matchingProducts: z.number().int(),
  priceBand: z.object({ p25: z.number().int(), p75: z.number().int() }).nullable(),
  neededWith: z.array(z.object({ category: CategoryIdSchema, share: z.number() })).max(3),
  advice: z.string(),
  candidates: z.array(z.object({ productId: z.string(), title: z.string(), evidence: z.string() })).optional(),
  appliedFix: z.object({ productId: z.string(), title: z.string(), appliedAt: z.string() }).nullable(),
  watchers: z.number().int().optional(),
});
export type Gap = z.infer<typeof GapSchema>;

export const InsightsResponseSchema = z.object({
  window: z.object({ thisWeekFrom: z.string(), lastWeekFrom: z.string(), today: z.string() }),
  gaps: z.array(GapSchema).max(8),
  combos: z.array(z.object({ categories: z.array(CategoryIdSchema), count: z.number().int() })).max(5),
  topNeeds: z.array(z.object({ event: EventTypeSchema, count: z.number().int() })),
  recent: z
    .array(
      z.object({
        needLabel: z.string(),
        category: CategoryIdSchema.nullable(),
        tags: z.array(z.string()),
        event: EventTypeSchema,
        createdAt: z.string(),
      }),
    )
    .max(10),
});
export type InsightsResponse = z.infer<typeof InsightsResponseSchema>;

export const EnrichmentPreviewRequestSchema = z.object({ productId: z.string(), gapKey: z.string() });
export type EnrichmentPreviewRequest = z.infer<typeof EnrichmentPreviewRequestSchema>;
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
export type EnrichmentPreviewResponse = z.infer<typeof EnrichmentPreviewResponseSchema>;
export const EnrichmentApplyRequestSchema = z.object({ proposalId: z.string() });
export const EnrichmentUndoRequestSchema = z.object({ productId: z.string() });
export const ProductResponseSchema = z.object({ product: ProductSchema });
export type ProductResponse = z.infer<typeof ProductResponseSchema>;

// Full mode only
export const WatchRequestSchema = z.object({ gapKey: z.string() });
export const WatchResponseSchema = z.object({ watchers: z.number().int() });
