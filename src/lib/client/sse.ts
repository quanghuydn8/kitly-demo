// Server-Sent Events parsing for POST endpoints (EventSource only does GET): fetch body (ReadableStream) → events.
// Parser follows the WHATWG SSE line rules: LF / CRLF / CR endings, multi-line `data:` joined with "\n",
// comments (":") and unknown fields ignored, events without data dropped, default event name "message".

export interface RawSseEvent {
  event: string;
  data: string;
}

export function createSseParser(onEvent: (e: RawSseEvent) => void) {
  let buf = "";
  let event = "";
  let data: string[] = [];

  function dispatch() {
    if (data.length > 0) onEvent({ event: event || "message", data: data.join("\n") });
    event = "";
    data = [];
  }

  function line(l: string) {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return;
    const i = l.indexOf(":");
    const field = i === -1 ? l : l.slice(0, i);
    let value = i === -1 ? "" : l.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }

  /** Consume complete lines; a trailing "\r" is held back because the next chunk may start with "\n". */
  function drain(final: boolean) {
    for (;;) {
      const m = /\r\n|\r|\n/.exec(buf);
      if (!m) break;
      if (m[0] === "\r" && m.index === buf.length - 1 && !final) break;
      line(buf.slice(0, m.index));
      buf = buf.slice(m.index + m[0].length);
    }
  }

  return {
    push(chunk: string) {
      buf += chunk;
      drain(false);
    },
    /** Stream finished: flush the last line and an event that lacked its blank-line terminator. */
    end() {
      drain(true);
      if (buf) line(buf);
      buf = "";
      dispatch();
    },
  };
}

/** Reads a byte stream to the end, emitting parsed events. UTF-8 safe across chunk boundaries. */
export async function readSseStream(body: ReadableStream<Uint8Array>, onEvent: (e: RawSseEvent) => void) {
  const parser = createSseParser(onEvent);
  const decoder = new TextDecoder();
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
}
