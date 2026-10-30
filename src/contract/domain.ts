// Domain types of CONTRACT.md §1 as zod schemas; every TS type is z.infer of its schema so the two never drift.
// FROZEN after ticket 00: only Lane 1 changes this file, in a commit titled `contract: …`.
import { z } from "zod";

export const EventTypeSchema = z.enum([
  "back_to_school",
  "newborn",
  "first_apartment",
  "camping_trip",
  "home_office",
  "tet_gifts",
  "other",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const ShopTierSchema = z.enum(["mall", "preferred", "regular"]);
export type ShopTier = z.infer<typeof ShopTierSchema>;

/** One of the DATA.md taxonomy ids (see CATEGORY_IDS in taxonomy.ts). Kept a plain string in the wire contract. */
export const CategoryIdSchema = z.string();
export type CategoryId = z.infer<typeof CategoryIdSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const IsoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ISO datetime");
const Vnd = z.number().int();

export const ShopSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: ShopTierSchema,
  rating: z.number(),
  shipFee: Vnd,
  city: z.string(),
});
export type Shop = z.infer<typeof ShopSchema>;

export const ProductSchema = z.object({
  id: z.string(),
  shopId: z.string(),
  title: z.string(),
  category: CategoryIdSchema,
  description: z.string(),
  price: Vnd,
  rating: z.number(),
  reviewCount: z.number().int(),
  soldCount: z.number().int(),
  stock: z.number().int(),
  tags: z.array(z.string()),
  attributes: z.record(z.string(), z.string()),
  shipDaysMin: z.number().int(),
  shipDaysMax: z.number().int(),
  updatedForDemandAt: IsoDateTime.nullable(),
});
export type Product = z.infer<typeof ProductSchema>;

export const PersonaIdSchema = z.enum(["lan", "guest"]);
export type PersonaId = z.infer<typeof PersonaIdSchema>;

export const VoucherSchema = z.object({
  id: z.string(),
  scope: z.enum(["platform", "shop"]),
  shopId: z.string().nullable(),
  code: z.string(),
  kind: z.enum(["fixed", "percent", "freeship"]),
  value: z.number().int(), // fixed: VND off; percent: 0-100; freeship: max shipping covered (VND)
  maxDiscount: Vnd.nullable(),
  minSpend: Vnd,
  validUntil: IsoDate,
  ownerPersona: PersonaIdSchema.nullable(), // null = public; else a wallet voucher only that persona may use (D46)
  label: z.string(),
});
export type Voucher = z.infer<typeof VoucherSchema>;

export const PersonaSchema = z.object({
  id: PersonaIdSchema,
  name: z.string(),
  address: z.object({ district: z.string(), city: z.string() }).nullable(), // display + AI context only (D44)
  favoriteShopIds: z.array(z.string()),
  cart: z.array(z.object({ productId: z.string(), addedAt: IsoDateTime })),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const GUEST_PERSONA: Persona = { id: "guest", name: "Guest", address: null, favoriteShopIds: [], cart: [] };

export const PlanItemSchema = z.object({
  key: z.string(),
  needLabel: z.string(),
  category: CategoryIdSchema.nullable(), // null = not covered by taxonomy
  required: z.boolean(),
  quantity: z.number().int(),
  mustHaveTags: z.array(z.string()),
  niceToHaveTags: z.array(z.string()),
  maxUnitPrice: Vnd.nullable(),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

export const KitPlanSchema = z.object({
  event: EventTypeSchema,
  language: z.enum(["en", "vi"]),
  budget: Vnd.nullable(),
  deadline: IsoDate.nullable(),
  items: z.array(PlanItemSchema),
  assumptions: z.array(z.string()),
});
export type KitPlan = z.infer<typeof KitPlanSchema>;

// score = QUALITY only in [0,1]; price is never part of it (CONTRACT §1).
export const CandidateSchema = z.object({
  product: ProductSchema,
  shop: ShopSchema,
  score: z.number().min(0).max(1),
  matchedTags: z.array(z.string()),
  arrivesBy: IsoDate,
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const ClosestSchema = z.object({
  candidate: CandidateSchema,
  missingTags: z.array(z.string()),
  overMaxPriceBy: Vnd.nullable(),
});
export type Closest = z.infer<typeof ClosestSchema>;

export const BasketLineSchema = z.object({
  itemKey: z.string(),
  product: ProductSchema,
  shop: ShopSchema,
  quantity: z.number().int(),
  lineTotal: Vnd,
  reason: z.string(),
  alternatives: z.array(CandidateSchema).max(2),
});
export type BasketLine = z.infer<typeof BasketLineSchema>;

export const ShopGroupSchema = z.object({
  shopId: z.string(),
  shopName: z.string(),
  subtotal: Vnd,
  shipping: Vnd,
  shopDiscount: Vnd,
  voucherCodes: z.array(z.string()),
});
export type ShopGroup = z.infer<typeof ShopGroupSchema>;

// Only deductions actually applied; invariant sum(savings[].amount) === discountTotal.
export const SavingSchema = z.object({ label: z.string(), amount: Vnd, wallet: z.boolean().optional() });
export type Saving = z.infer<typeof SavingSchema>;

export const ProfileSchema = z.enum(["saver", "balanced", "premium"]);
export type Profile = z.infer<typeof ProfileSchema>;

export const FitSuggestionSchema = z.object({
  id: z.string(),
  label: z.string(),
  removeItemKeys: z.array(z.string()),
  swaps: z.array(z.object({ itemKey: z.string(), productId: z.string() })),
  grandTotal: Vnd,
  fits: z.boolean(),
  dropsMustHave: z.boolean(),
});
export type FitSuggestion = z.infer<typeof FitSuggestionSchema>;

export const InterestSchema = z.object({
  itemKey: z.string(),
  candidate: CandidateSchema,
  addedToCartAt: IsoDateTime,
  walletVoucherCode: z.string().nullable(),
  priceAfterVoucher: Vnd,
  overMaxPriceBy: Vnd.nullable(),
  missingTags: z.array(z.string()),
});
export type Interest = z.infer<typeof InterestSchema>;

export const NoMatchReasonSchema = z.enum(["no_category", "no_product_with_tags", "none_in_time", "none_in_budget"]);
export type NoMatchReason = z.infer<typeof NoMatchReasonSchema>;

export const BasketOptionSchema = z.object({
  profile: ProfileSchema,
  status: z.enum(["ok", "over_budget"]),
  lines: z.array(BasketLineSchema),
  noMatch: z.array(
    z.object({
      itemKey: z.string(),
      needLabel: z.string(),
      reason: NoMatchReasonSchema,
      closest: ClosestSchema.nullable(),
    }),
  ),
  skipped: z.array(z.object({ itemKey: z.string(), needLabel: z.string(), reason: z.literal("budget") })),
  shops: z.array(ShopGroupSchema),
  itemsTotal: Vnd,
  shippingTotal: Vnd,
  discountTotal: Vnd,
  grandTotal: Vnd,
  savings: z.array(SavingSchema),
  minimumCost: Vnd.optional(),
  costDrivers: z.array(z.string()).optional(),
  overBy: Vnd.positive().optional(),
  fit: z.array(FitSuggestionSchema).max(2).optional(),
  interests: z.array(InterestSchema).optional(),
});
export type BasketOption = z.infer<typeof BasketOptionSchema>;

export const PlanDiffSchema = z.object({
  added: z.array(z.string()),
  removed: z.array(z.string()),
  changed: z.array(z.string()),
});
export type PlanDiff = z.infer<typeof PlanDiffSchema>;

export const SalesHookSchema = z.enum([
  "deadline_soon",
  "cart_interest",
  "voucher_expiring",
  "freeship_gap",
  "favorite_shop_promo",
]);
export type SalesHook = z.infer<typeof SalesHookSchema>;

export const SalesContextSchema = z.object({
  today: IsoDate,
  deadline: IsoDate.nullable(),
  daysLeft: z.number().int().nullable(),
  address: z.string().nullable(),
  interests: z.array(
    z.object({
      itemKey: z.string(),
      title: z.string(),
      price: Vnd,
      priceAfterVoucher: Vnd,
      voucherCode: z.string().nullable(),
      overMaxPriceBy: Vnd.nullable(),
    }),
  ),
  walletVouchers: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      validUntil: IsoDate,
      daysToExpiry: z.number().int(),
      usedInBasket: z.boolean(),
    }),
  ),
  freeshipGaps: z.array(z.object({ shopName: z.string(), missing: Vnd })),
  favoriteShopPromos: z.array(z.object({ shopName: z.string(), code: z.string(), label: z.string() })),
  hooks: z.array(SalesHookSchema),
});
export type SalesContext = z.infer<typeof SalesContextSchema>;

export const FollowUpSchema = z.object({
  question: z.string().endsWith("?"),
  suggestions: z
    .array(
      z.object({
        text: z.string().max(40),
        action: z.object({ type: z.literal("swap"), itemKey: z.string(), productId: z.string() }).optional(),
      }),
    )
    .min(2)
    .max(3),
  source: z.enum(["llm", "template"]),
});
export type FollowUp = z.infer<typeof FollowUpSchema>;

export const KitSelectionSchema = z.object({
  profile: ProfileSchema,
  picks: z.record(z.string(), z.string()), // itemKey -> productId
  dropped: z.array(z.string()),
});
export type KitSelection = z.infer<typeof KitSelectionSchema>;

export const KitVersionSchema = z.object({
  threadId: z.string(),
  version: z.number().int().min(1),
  createdAt: IsoDateTime,
  kind: z.enum(["new", "refine", "adjust", "restore"]),
  userText: z.string(),
  plan: KitPlanSchema,
  excludedKeys: z.array(z.string()),
  status: z.enum(["awaiting_budget", "ready"]),
  options: z.array(BasketOptionSchema),
  explanation: z.string(),
  diff: PlanDiffSchema.nullable(),
  selection: KitSelectionSchema.nullable(),
  followUp: FollowUpSchema.nullable(),
});
export type KitVersion = z.infer<typeof KitVersionSchema>;

export const KitMessageSchema = z.object({
  threadId: z.string(),
  afterVersion: z.number().int().min(1),
  createdAt: IsoDateTime,
  userText: z.string(),
  answer: z.string(),
  followUp: FollowUpSchema.nullable(),
});
export type KitMessage = z.infer<typeof KitMessageSchema>;

export const KitThreadSummarySchema = z.object({
  id: z.string(),
  title: z.string().max(60),
  updatedAt: IsoDateTime,
  versionCount: z.number().int(),
  persona: PersonaIdSchema,
});
export type KitThreadSummary = z.infer<typeof KitThreadSummarySchema>;

export const DemandItemRowSchema = z.object({
  sessionId: z.string(),
  createdAt: IsoDateTime,
  event: EventTypeSchema,
  needLabel: z.string(),
  category: CategoryIdSchema.nullable(),
  tags: z.array(z.string()),
  matchedCount: z.number().int(),
  budgetHint: Vnd.nullable(),
});
export type DemandItemRow = z.infer<typeof DemandItemRowSchema>;
