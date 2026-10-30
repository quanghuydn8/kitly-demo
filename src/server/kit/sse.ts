// Server-Sent Events response for the kit streams (CONTRACT §3). The run gets an `emit` and an AbortSignal that fires
// when the client goes away; emits after that are dropped. The stream always closes when the run settles.
import type { KitStreamEvent } from "@/contract";

export type Emit = (e: KitStreamEvent) => void;

export function sseResponse(run: (emit: Emit, signal: AbortSignal) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit: Emit = (e) => {
        if (!open || abort.signal.aborted) return;
        controller.enqueue(encoder.encode(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`));
      };
      try {
        await run(emit, abort.signal);
      } finally {
        open = false;
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
