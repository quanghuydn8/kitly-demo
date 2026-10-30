import type { NextRequest } from "next/server";
import type { ProductDetailResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { apiError, json } from "@/server/http/json";
import { personaFrom } from "@/server/http/request";
import { productDetail } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const detail = await productDetail(getAdapter(), id, personaFrom(request));
  if (!detail) return apiError(404, "not_found", `Product ${id} not found`);
  return json<ProductDetailResponse>(detail);
}
