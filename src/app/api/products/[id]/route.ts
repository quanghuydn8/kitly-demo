import type { NextRequest } from "next/server";
import { getAdapter } from "@/server/adapter";
import { apiError, handle, json } from "@/server/http";
import { vouchersForShop } from "@/server/store";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const a = getAdapter();
  const product = await a.getProduct(id);
  if (!product) return apiError(404, "not_found", `Product ${id} not found`);
  const shop = (await a.listShops()).find((s) => s.id === product.shopId);
  if (!shop) return apiError(404, "not_found", `Shop ${product.shopId} not found`);
  return json({ product, shop, vouchers: await vouchersForShop(a, shop.id) });
});
