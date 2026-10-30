// POST /api/demand/watch { gapKey } → { watchers } (CONTRACT §3 Full only, ticket 07): "Notify me when available".
// gapKey = an insights gap key (`category|sorted tags`, or `none|`); any well-formed key is accepted, even one below
// the insights threshold, so early watchers are counted. 400 bad_request otherwise.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { WatchRequestSchema, type WatchResponseSchema } from "@/contract";
import { apiError, json } from "@/server/http/json";
import { getWatchStore } from "@/server/watchstore";

export const dynamic = "force-dynamic";

const MAX_KEY = 200;
type WatchResponse = z.infer<typeof WatchResponseSchema>;

export async function POST(request: NextRequest): Promise<Response> {
  const body = WatchRequestSchema.safeParse(await request.json().catch(() => null));
  const gapKey = body.success ? body.data.gapKey.trim() : "";
  if (!gapKey.includes("|") || gapKey.length > MAX_KEY)
    return apiError(400, "bad_request", "Body must be { gapKey: string } with a gap key like 'category|tag'");
  return json<WatchResponse>({ watchers: await getWatchStore().add(gapKey) });
}
