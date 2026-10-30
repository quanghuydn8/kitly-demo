// SSE over POST (T11): EventSource only does GET, so Kitly streams with fetch + ReadableStream and this parser.
// createSseParser is pure (unit-tested on chunk boundaries); postSse validates each event against the contract.
import { KitStreamEventSchema, type KitStreamEvent } from "@/contract";

export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental text/event-stream parser (WHATWG rules: \n, \r\n or \r line ends; multi-line data joined by \n). */
export function createSseParser(onMessage: (m: SseMessage) => void): { push(chunk: string): void; end(): void } {
  let buffer = "";
  let event = "";
  let data: string[] = [];

  function dispatch() {
    if (data.length > 0) onMessage({ event: event || "message", data: data.join("\n") });
    event = "";
    data = [];
  }

  function line(l: string) {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return;
    const i = l.indexOf(":");
    const field = i < 0 ? l : l.slice(0, i);
    let value = i < 0 ? "" : l.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }

  return {
    push(chunk) {
      buffer += chunk;
      // A trailing "\r" may be the first half of "\r\n": keep it until the next chunk.
      const re = /\r\n|\n|\r(?!$)/g;
      let start = 0;
      for (let m = re.exec(buffer); m; m = re.exec(buffer)) {
        line(buffer.slice(start, m.index));
        start = m.index + m[0].length;
      }
      buffer = buffer.slice(start);
    },
    end() {
      if (buffer.endsWith("\r")) buffer = buffer.slice(0, -1);
      if (buffer !== "") line(buffer);
      buffer = "";
      dispatch();
    },
  };
}

/**
 * POST a JSON body and feed every contract SSE event to onEvent. Never throws: HTTP errors, network failures and a
 * stream that ends without `done`/`error` are reported as a terminal `error` event (the UI shows it with Retry).
 */
export async function postSse(
  url: string,
  body: unknown,
  onEvent: (e: KitStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let finished = false;
  const emit = (e: KitStreamEvent) => {
    if (finished) return;
    if (e.event === "done" || e.event === "error") finished = true;
    onEvent(e);
  };
  const fail = (code: string, message: string) => emit({ event: "error", data: { code, message } });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok || !res.body) {
      const err = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
      return fail(err?.error?.code ?? `http_${res.status}`, err?.error?.message ?? `Request failed (${res.status})`);
    }
    const parser = createSseParser((m) => {
      let json: unknown;
      try {
        json = JSON.parse(m.data);
      } catch {
        return;
      }
      const parsed = KitStreamEventSchema.safeParse({ event: m.event, data: json });
      if (parsed.success) emit(parsed.data);
    });
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(value);
    }
    parser.end();
    if (!finished) fail("stream_ended", "The connection closed before the kit was finished.");
  } catch (e) {
    if (signal?.aborted) return;
    fail("network", e instanceof Error ? e.message : "Network error");
  }
}
