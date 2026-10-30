import type { NextRequest } from "next/server";
import type { ProductsResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { apiError, json } from "@/server/http/json";
import { DEFAULT_PRODUCT_LIMIT, listProductsWithShop } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const sp = request.nextUrl.searchParams;
  const rawLimit = sp.get("limit");
  const limit = rawLimit === null ? DEFAULT_PRODUCT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return apiError(400, "bad_request", "limit must be an integer between 1 and 500");
  }
  const products = await listProductsWithShop(getAdapter(), {
    text: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    limit,
  });
  return json<ProductsResponse>({ products });
}
