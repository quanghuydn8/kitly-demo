// POST /api/kit (CONTRACT §3): need sentence → SSE stream of the kit pipeline; creates a thread + version 1.
import type { NextRequest } from "next/server";
import { KitRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { getKitStore } from "@/server/kitstore";
import { getLLM } from "@/server/llm";
import { apiError } from "@/server/http/json";
import { ownerFrom, personaFrom } from "@/server/http/request";
import { runNewKit } from "@/server/kit/pipeline";
import { sseResponse } from "@/server/kit/sse";
import { today } from "@/server/today";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest): Promise<Response> {
  const body = KitRequestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success || !body.data.query.trim()) {
    return apiError(400, "bad_request", "Body must be { query: string, profiles?: Profile[] }");
  }
  const owner = ownerFrom(request);
  if (!owner) return apiError(400, "no_owner", "Missing kitly_uid cookie");
  const deps = { adapter: getAdapter(), store: getKitStore(), llm: getLLM(), today: today() };
  const req = { owner, persona: personaFrom(request), query: body.data.query.trim(), profiles: body.data.profiles };
  return sseResponse((emit, signal) => runNewKit(deps, req, emit, signal));
}
