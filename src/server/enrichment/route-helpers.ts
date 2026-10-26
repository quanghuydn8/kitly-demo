// Shared body parsing + error mapping for the three /api/seller/enrichment/* routes.
import type { z } from "zod";
import { apiError, handle, json } from "@/server/http";
import { EnrichmentError } from "./index";

export function enrichmentRoute<T>(schema: z.ZodType<T>, usage: string, run: (body: T) => Promise<unknown>) {
  return handle(async (req: Request) => {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return apiError(400, "bad_request", `body must be ${usage}`);
    try {
      return json(await run(parsed.data));
    } catch (e) {
      if (e instanceof EnrichmentError) return apiError(e.status, e.code, e.message);
      throw e;
    }
  });
}
