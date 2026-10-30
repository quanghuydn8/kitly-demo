// Seller Intelligence HTTP client (T12) + the buyer-side Notify me call (CONTRACT §3 Seller Intelligence / Full).
// Every response is parsed with the frozen contract schemas; errors carry the API's { error: { code, message } }.
import {
  EnrichmentPreviewResponseSchema,
  InsightsResponseSchema,
  ProductResponseSchema,
  ShopsResponseSchema,
  WatchResponseSchema,
  type EnrichmentPreviewResponse,
  type InsightsResponse,
  type Product,
  type Shop,
} from "@/contract";

export class SellerApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function json<T>(res: Response, parse: (x: unknown) => T): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new SellerApiError(err?.code ?? `http_${res.status}`, err?.message ?? `Request failed (${res.status})`, res.status);
  }
  return parse(body);
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const sellerApi = {
  async listShops(): Promise<Shop[]> {
    return json(await fetch("/api/shops"), (b) => ShopsResponseSchema.parse(b).shops);
  },
  /** shopId null = All shops. */
  async insights(shopId: string | null): Promise<InsightsResponse> {
    const res = await fetch(`/api/seller/insights?shopId=${encodeURIComponent(shopId ?? "all")}`, { cache: "no-store" });
    return json(res, (b) => InsightsResponseSchema.parse(b));
  },
  async preview(productId: string, gapKey: string): Promise<EnrichmentPreviewResponse> {
    return json(await post("/api/seller/enrichment/preview", { productId, gapKey }), (b) => EnrichmentPreviewResponseSchema.parse(b));
  },
  async apply(proposalId: string): Promise<Product> {
    return json(await post("/api/seller/enrichment/apply", { proposalId }), (b) => ProductResponseSchema.parse(b).product);
  },
  async undo(productId: string): Promise<Product> {
    return json(await post("/api/seller/enrichment/undo", { productId }), (b) => ProductResponseSchema.parse(b).product);
  },
  /** Buyer "Notify me when available" (Full, T07): returns the gap's watcher count. */
  async watch(gapKey: string): Promise<number> {
    return json(await post("/api/demand/watch", { gapKey }), (b) => WatchResponseSchema.parse(b).watchers);
  },
};
