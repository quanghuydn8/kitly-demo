// POST /api/kit/refine (CONTRACT.md §3): { sessionId, previousPlan, message, profiles? } → the Kit Pipeline events,
// with `plan.diff`. Unknown sessionId → 404 before any model call.
import { RefineRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { apiError, handle, sseResponse } from "@/server/http";
import { runRefine } from "@/server/kit/refine";
import { getLLM } from "@/server/llm";
import { today } from "@/server/today";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = RefineRequestSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "bad_request", "body must be { sessionId, previousPlan: KitPlan, message, profiles? }");
  const adapter = getAdapter();
  if (!(await adapter.getIntentSession(parsed.data.sessionId)))
    return apiError(404, "not_found", `unknown session ${parsed.data.sessionId}`);
  return sseResponse(runRefine(parsed.data, { adapter, llm: getLLM(), today: today() }));
});
