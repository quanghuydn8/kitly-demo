// GET /api/threads/:id (CONTRACT §3): one of the caller's threads with its versions + answer turns. Another browser's
// thread (or none) → 404.
import type { NextRequest } from "next/server";
import type { ThreadResponse } from "@/contract";
import { getKitStore } from "@/server/kitstore";
import { apiError, json } from "@/server/http/json";
import { ownerFrom } from "@/server/http/request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  const owner = ownerFrom(request);
  const found = owner ? await getKitStore().getThread(id, owner) : null;
  if (!found) return apiError(404, "not_found", "Kit not found");
  return json<ThreadResponse>(found);
}
