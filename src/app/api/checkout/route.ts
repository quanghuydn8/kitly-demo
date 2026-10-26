import type { NextRequest } from "next/server";
import { CheckoutRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { apiError, handle, json } from "@/server/http";
import { checkout, UnknownProductError } from "@/server/store";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: NextRequest) => {
  const parsed = CheckoutRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return apiError(400, "bad_request", "Body must be { lines: { productId, quantity }[] }");
  try {
    return json(await checkout(getAdapter(), parsed.data.lines));
  } catch (e) {
    if (e instanceof UnknownProductError) return apiError(404, "not_found", `Product ${e.message} not found`);
    throw e;
  }
});
