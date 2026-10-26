// TS types for kit/CONTRACT.md, inferred from the zod schemas (single source of truth).
import type { z } from "zod";
import type * as S from "./schemas";

export type ShopTier = z.infer<typeof S.ShopTierSchema>;
export type CategoryId = string;

export type Shop = z.infer<typeof S.ShopSchema>;
export type Product = z.infer<typeof S.ProductSchema>;
export type Voucher = z.infer<typeof S.VoucherSchema>;
export type PlanItem = z.infer<typeof S.PlanItemSchema>;
export type KitPlan = z.infer<typeof S.KitPlanSchema>;
export type Candidate = z.infer<typeof S.CandidateSchema>;
export type BasketLine = z.infer<typeof S.BasketLineSchema>;
export type ShopGroup = z.infer<typeof S.ShopGroupSchema>;
export type Saving = z.infer<typeof S.SavingSchema>;
export type Profile = z.infer<typeof S.ProfileSchema>;
export type BasketOption = z.infer<typeof S.BasketOptionSchema>;
export type PlanDiff = z.infer<typeof S.PlanDiffSchema>;
export type DemandItemRow = z.infer<typeof S.DemandItemRowSchema>;

export type ApiError = z.infer<typeof S.ApiErrorSchema>;
export type CategoryInfo = z.infer<typeof S.CategoryInfoSchema>;
export type ProductWithShop = z.infer<typeof S.ProductWithShopSchema>;
export type ProductsResponse = z.infer<typeof S.ProductsResponseSchema>;
export type ProductDetailResponse = z.infer<typeof S.ProductDetailResponseSchema>;
export type ShopsResponse = z.infer<typeof S.ShopsResponseSchema>;
export type CategoriesResponse = z.infer<typeof S.CategoriesResponseSchema>;
export type CheckoutRequest = z.infer<typeof S.CheckoutRequestSchema>;
export type CheckoutResponse = z.infer<typeof S.CheckoutResponseSchema>;

export type KitRequest = z.infer<typeof S.KitRequestSchema>;
export type RefineRequest = z.infer<typeof S.RefineRequestSchema>;
export type StepId = z.infer<typeof S.StepIdSchema>;
export type KitSseEvent = z.infer<typeof S.KitSseEventSchema>;

export type Gap = z.infer<typeof S.GapSchema>;
export type InsightsResponse = z.infer<typeof S.InsightsResponseSchema>;
export type EnrichmentPreviewResponse = z.infer<typeof S.EnrichmentPreviewResponseSchema>;
export type DemandWatchResponse = z.infer<typeof S.DemandWatchResponseSchema>;

// §2 Commerce Adapter — the only door to marketplace data.
export interface ProductQuery {
  text?: string;
  category?: CategoryId;
  tagsAny?: string[];
  maxPrice?: number;
  limit?: number;
}

export interface CommerceAdapter {
  listShops(): Promise<Shop[]>;
  getProduct(id: string): Promise<Product | null>;
  searchProducts(q: ProductQuery): Promise<Product[]>;
  listVouchers(): Promise<Voucher[]>;
  recordIntent(s: { query: string; plan: KitPlan; source: "live" | "seed" }): Promise<{ sessionId: string }>;
  recordDemandItems(
    sessionId: string,
    items: { item: PlanItem; matchedCount: number; budgetHint: number | null }[],
  ): Promise<void>;
  demandItemsSince(sinceIso: string, filter?: { category?: CategoryId }): Promise<DemandItemRow[]>;
  /** Snapshots the previous version before writing. */
  updateListing(
    productId: string,
    patch: Pick<Product, "title" | "description" | "tags" | "attributes">,
  ): Promise<Product>;
  /** Restores the latest snapshot; null if there is none. */
  undoListing(productId: string): Promise<Product | null>;
}
