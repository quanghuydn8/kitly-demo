// Seller screen ↔ server (CONTRACT.md §3): shops, insights, enrichment preview/apply/undo, buyer "Notify me".
// Every response is validated against the contract schemas; errors become ApiCallError with the server's code.
import type { z } from "zod";
import {
  ApiErrorSchema,
  DemandWatchResponseSchema,
  EnrichmentPreviewResponseSchema,
  InsightsResponseSchema,
  ProductResponseSchema,
  ShopsResponseSchema,
} from "@/contract/schemas";
import type { EnrichmentPreviewResponse, InsightsResponse, Product, Shop } from "@/contract/types";

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiCallError";
  }
}

export function sellerApi(fetcher: typeof fetch = (...a) => fetch(...a)) {
  async function call<T>(schema: z.ZodType<T>, path: string, body?: unknown): Promise<T> {
    const res = await fetcher(
      path,
      body === undefined
        ? { cache: "no-store" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = ApiErrorSchema.safeParse(data);
      throw err.success
        ? new ApiCallError(res.status, err.data.error.code, err.data.error.message)
        : new ApiCallError(res.status, "http_error", `Request failed (${res.status})`);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success)
      throw new ApiCallError(res.status, "bad_response", `Unexpected response from ${path}`);
    return parsed.data;
  }

  return {
    shops: async (): Promise<Shop[]> => (await call(ShopsResponseSchema, "/api/shops")).shops,
    insights: (shopId: string): Promise<InsightsResponse> =>
      call(InsightsResponseSchema, `/api/seller/insights?shopId=${encodeURIComponent(shopId)}`),
    preview: (productId: string, gapKey: string): Promise<EnrichmentPreviewResponse> =>
      call(EnrichmentPreviewResponseSchema, "/api/seller/enrichment/preview", { productId, gapKey }),
    apply: async (proposalId: string): Promise<Product> =>
      (await call(ProductResponseSchema, "/api/seller/enrichment/apply", { proposalId })).product,
    undo: async (productId: string): Promise<Product> =>
      (await call(ProductResponseSchema, "/api/seller/enrichment/undo", { productId })).product,
    watch: async (gapKey: string): Promise<number> =>
      (await call(DemandWatchResponseSchema, "/api/demand/watch", { gapKey })).watchers,
  };
}
