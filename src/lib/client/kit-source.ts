// Where Kitly events come from: the live SSE endpoints (POST /api/kit, /api/kit/refine) or, with
// NEXT_PUBLIC_KITLY_MOCK=1, a replay of the recorded Beat 1 stream with 300 ms gaps (CONTRACT.md §4).
import { KitSseEventSchema } from "@/contract/schemas";
import type { KitRequest, KitSseEvent, RefineRequest } from "@/contract/types";
import { readSseStream, type RawSseEvent } from "./sse";

export const KIT_MOCK = process.env.NEXT_PUBLIC_KITLY_MOCK === "1";

const KNOWN = new Set(["step", "plan", "options", "explanation", "done", "error"]);

/** Raw SSE → contract event. null = unknown event name (ignored); throws when a known event breaks the schema. */
function decode(raw: RawSseEvent): KitSseEvent | null {
  if (!KNOWN.has(raw.event)) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.data);
  } catch {
    throw new Error(`Bad "${raw.event}" event from the server (not JSON)`);
  }
  const parsed = KitSseEventSchema.safeParse({ event: raw.event, data });
  if (!parsed.success) throw new Error(`Bad "${raw.event}" event from the server`);
  return parsed.data;
}

/** Live path: reads an SSE body to the end. A stream without a terminal event (done/error) is an error. */
export async function consumeKitStream(body: ReadableStream<Uint8Array>, onEvent: (e: KitSseEvent) => void) {
  let terminal = false;
  await readSseStream(body, (raw) => {
    const e = decode(raw);
    if (!e) return;
    if (e.event === "done" || e.event === "error") terminal = true;
    onEvent(e);
  });
  if (!terminal) throw new Error("The connection ended before the kit was finished");
}

export async function replayKitSample(
  onEvent: (e: KitSseEvent) => void,
  { delayMs = 300, signal }: { delayMs?: number; signal?: AbortSignal } = {},
) {
  // Loaded lazily so the live bundle does not carry the fixtures.
  const { kitSample } = await import("@/contract/fixtures");
  for (const e of kitSample) {
    if (signal?.aborted) return;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    if (signal?.aborted) return;
    onEvent(e);
  }
}

export type KitRun = { kind: "kit"; body: KitRequest } | { kind: "refine"; body: RefineRequest };

/** Runs one kit/refine request to completion. Mock mode replays the sample for both (no recorded refine stream). */
export async function runKit(run: KitRun, onEvent: (e: KitSseEvent) => void, signal?: AbortSignal) {
  if (KIT_MOCK) return replayKitSample(onEvent, { signal });
  const res = await fetch(run.kind === "kit" ? "/api/kit" : "/api/kit/refine", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(run.body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = `Kitly is unavailable (HTTP ${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  await consumeKitStream(res.body, onEvent);
}
