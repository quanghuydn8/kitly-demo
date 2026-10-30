// SSE parser for POST streams (T11 Full): chunk boundaries anywhere, multi-line data, comments, CRLF, no trailing blank.
import { describe, expect, it } from "vitest";
import { createSseParser, type SseMessage } from "@/lib/client/sse";

function parseChunks(chunks: string[], end = true): SseMessage[] {
  const out: SseMessage[] = [];
  const p = createSseParser((m) => out.push(m));
  for (const c of chunks) p.push(c);
  if (end) p.end();
  return out;
}

const STREAM =
  'event: step\ndata: {"id":"plan","status":"running"}\n\n' +
  'event: explanation\ndata: {"delta":"Hi "}\n\n' +
  'event: done\ndata: {"threadId":"t1"}\n\n';

describe("createSseParser", () => {
  it("parses whole events with their event name and data", () => {
    expect(parseChunks([STREAM])).toEqual([
      { event: "step", data: '{"id":"plan","status":"running"}' },
      { event: "explanation", data: '{"delta":"Hi "}' },
      { event: "done", data: '{"threadId":"t1"}' },
    ]);
  });

  it("gives the same result whatever the chunk boundaries (split at every position, and per character)", () => {
    const expected = parseChunks([STREAM]);
    for (let i = 1; i < STREAM.length; i++) {
      expect(parseChunks([STREAM.slice(0, i), STREAM.slice(i)])).toEqual(expected);
    }
    expect(parseChunks(STREAM.split(""))).toEqual(expected);
  });

  it("joins multi-line data with newlines and strips one leading space only", () => {
    expect(parseChunks(["event: explanation\ndata: line one\ndata:  two\ndata:three\n\n"])).toEqual([
      { event: "explanation", data: "line one\n two\nthree" },
    ]);
  });

  it("handles CRLF line endings split across chunks, ignores comments and unknown fields", () => {
    const out = parseChunks([": keep-alive\r", "\nevent: done\r\nid: 7\r\ndata: {}\r", "\n\r\n"]);
    expect(out).toEqual([{ event: "done", data: "{}" }]);
  });

  it("defaults the event name to 'message' and skips blocks without data", () => {
    expect(parseChunks(["data: x\n\nevent: step\n\n"])).toEqual([{ event: "message", data: "x" }]);
  });

  it("flushes a last event that has no trailing blank line on end()", () => {
    expect(parseChunks(['event: done\ndata: {"a":1}'], false)).toEqual([]);
    expect(parseChunks(['event: done\ndata: {"a":1}'])).toEqual([{ event: "done", data: '{"a":1}' }]);
  });
});
