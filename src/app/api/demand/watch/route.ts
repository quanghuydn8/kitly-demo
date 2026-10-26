// POST /api/demand/watch (CONTRACT.md §3, Full): { gapKey } → { watchers } after storing one "Notify me" watch.
import { DemandWatchRequestSchema } from "@/contract";
import { getAdapter } from "@/server/adapter";
import { apiError, handle, json } from "@/server/http";
import { normalizeGapKey, watchGap } from "@/server/insights/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const parsed = DemandWatchRequestSchema.safeParse(await req.json().catch(() => null));
  const gapKey = parsed.success ? normalizeGapKey(parsed.data.gapKey) : null;
  if (!gapKey) return apiError(400, "bad_request", 'body must be { gapKey: "<category|none>|<sorted tags>" }');
  return json({ watchers: await watchGap(gapKey, { adapter: getAdapter() }) });
});
