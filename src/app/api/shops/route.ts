import type { ShopsResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { json } from "@/server/http/json";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return json<ShopsResponse>({ shops: await getAdapter().listShops() });
}
