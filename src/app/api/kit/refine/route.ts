// POST /api/kit/refine (CONTRACT §3): { threadId, message } → SSE stream of the refine pipeline; appends a new
// version to the caller's thread. Thread missing or not the caller's → 404 JSON before any stream.
import type { NextRequest } from "next/server";
import { RefineRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { getKitStore } from "@/server/kitstore";
import { getLLM } from "@/server/llm";
import { apiError } from "@/server/http/json";
import { ownerFrom } from "@/server/http/request";
import { runRefine } from "@/server/kit/pipeline";
import { sseResponse } from "@/server/kit/sse";
import { today } from "@/server/today";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest): Promise<Response> {
  const body = RefineRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !body.data.message.trim() || !body.data.threadId) {
    return apiError(400, "bad_request", "Body must be { threadId: string, message: string, profiles?: Profile[] }");
  }
  const owner = ownerFrom(request);
  if (!owner) return apiError(400, "no_owner", "Missing kitly_uid cookie");
  const store = getKitStore();
  const thread = await store.getThread(body.data.threadId, owner);
  if (!thread || !thread.versions.length) return apiError(404, "not_found", "Kit not found");
  const deps = { adapter: getAdapter(), store, llm: getLLM(), today: today() };
  const req = { owner, thread, message: body.data.message.trim(), profiles: body.data.profiles };
  return sseResponse((emit, signal) => runRefine(deps, req, emit, signal));
}
