import type { NextRequest } from "next/server";
import { CheckoutRequestSchema, type CheckoutResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { apiError, json } from "@/server/http/json";
import { checkout, CheckoutError } from "@/server/store";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError(400, "bad_request", "Body must be JSON");
  }
  const parsed = CheckoutRequestSchema.safeParse(raw);
  if (!parsed.success)
    return apiError(400, "bad_request", "Body must be { lines: { productId, quantity }[] } with at least one line");
  try {
    const order = await checkout(getAdapter(), parsed.data.lines);
    console.info("[checkout]", order.orderId, order.grandTotal, parsed.data.lines.length, "lines");
    return json<CheckoutResponse>(order);
  } catch (err) {
    if (err instanceof CheckoutError) return apiError(400, "bad_request", err.message);
    throw err;
  }
}
