import type { NextRequest } from "next/server";
import { getAdapter } from "@/server/adapter";
import { apiError, handle, json } from "@/server/http";
import { listProductsWithShop } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const limitRaw = sp.get("limit");
  const limit = limitRaw === null ? 40 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    return apiError(400, "bad_request", "limit must be an integer between 1 and 500");
  }
  const products = await listProductsWithShop(getAdapter(), {
    text: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
    limit,
  });
  return json({ products });
});
