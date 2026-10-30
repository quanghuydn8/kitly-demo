// GET /api/threads (CONTRACT §3): the caller's kit threads (cookie kitly_uid), newest first, max 30.
import type { NextRequest } from "next/server";
import type { ThreadsResponse } from "@/contract";
import { getKitStore } from "@/server/kitstore";
import { json } from "@/server/http/json";
import { ownerFrom } from "@/server/http/request";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const owner = ownerFrom(request);
  const threads = owner ? await getKitStore().listThreads(owner) : [];
  return json<ThreadsResponse>({ threads });
}
