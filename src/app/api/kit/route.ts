// POST /api/kit (CONTRACT.md §3): { query, profiles? } → text/event-stream of the Kit Pipeline events.
import { KitRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { apiError, handle, sseResponse } from "@/server/http";
import { runKit } from "@/server/kit/pipeline";
import { getLLM } from "@/server/llm";
import { today } from "@/server/today";

export const runtime = "nodejs";
export const maxDuration = 120; // Vercel: LLM calls via proxy take 20–40 s
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parsed = KitRequestSchema.safeParse(body);
  if (!parsed.success) return apiError(400, "bad_request", "body must be { query: string, profiles?: Profile[] }");
  return sseResponse(runKit(parsed.data, { adapter: getAdapter(), llm: getLLM(), today: today() }));
});
