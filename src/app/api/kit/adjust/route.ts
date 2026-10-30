// POST /api/kit/adjust (CONTRACT §3 "Kit edits"): { threadId, change } → { version } — a code-only edit of the
// caller's latest version (no LLM, < 1 s). Optional `profiles` (default all three). Not the caller's thread → 404.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { AdjustRequestSchema, ProfileSchema, type AdjustResponse } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { getKitStore } from "@/server/kitstore";
import { apiError, json } from "@/server/http/json";
import { ownerFrom } from "@/server/http/request";
import { AdjustError, adjustKit } from "@/server/kit/adjust";
import { today } from "@/server/today";

export const dynamic = "force-dynamic";

const BodySchema = AdjustRequestSchema.extend({ profiles: z.array(ProfileSchema).optional() });

export async function POST(request: NextRequest): Promise<Response> {
  const t0 = performance.now();
  const body = BodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !body.data.threadId) {
    return apiError(400, "bad_request", "Body must be { threadId: string, change: KitChange, profiles?: Profile[] }");
  }
  const owner = ownerFrom(request);
  if (!owner) return apiError(400, "no_owner", "Missing kitly_uid cookie");
  const store = getKitStore();
  const thread = await store.getThread(body.data.threadId, owner);
  if (!thread || !thread.versions.length) return apiError(404, "not_found", "Kit not found");
  try {
    const version = await adjustKit(
      { adapter: getAdapter(), store, today: today() },
      { owner, thread, change: body.data.change, profiles: body.data.profiles },
    );
    console.info(`[kit] adjust ${body.data.change.type} ${Math.round(performance.now() - t0)}ms`);
    return json<AdjustResponse>({ version });
  } catch (err) {
    if (err instanceof AdjustError) return apiError(400, err.code, err.message);
    throw err;
  }
}
