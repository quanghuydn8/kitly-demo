// JSON helpers for route handlers; errors follow CONTRACT.md §3: { error: { code, message } }.
import { NextResponse } from "next/server";

export const json = <T>(body: T, status = 200) => NextResponse.json(body, { status });

export const apiError = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status });

/** Wraps a handler so unexpected throws become a 500 contract error instead of an HTML page. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      return apiError(500, "internal", e instanceof Error ? e.message : "Unexpected error");
    }
  };
}

/** Streams `{ event, data }` items as Server-Sent Events (`event: x` + one-line JSON `data:`), pulling lazily. */
export function sseResponse(events: AsyncIterable<{ event: string; data: unknown }>): Response {
  const it = events[Symbol.asyncIterator]();
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await it.next();
      if (next.done) return controller.close();
      controller.enqueue(
        enc.encode(`event: ${next.value.event}\ndata: ${JSON.stringify(next.value.data)}\n\n`),
      );
    },
    async cancel() {
      await it.return?.(undefined);
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
