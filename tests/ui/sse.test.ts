// Seam: the browser SSE parser (src/lib/client/sse.ts). Feeds raw text chunks exactly as a ReadableStream delivers
// them (arbitrary boundaries) and asserts the parsed { event, data } sequence.
import { describe, expect, it } from "vitest";
import { createSseParser, readSseStream, type RawSseEvent } from "@/lib/client/sse";

function parseChunks(chunks: string[]): RawSseEvent[] {
  const out: RawSseEvent[] = [];
  const p = createSseParser((e) => out.push(e));
  chunks.forEach((c) => p.push(c));
  p.end();
  return out;
}

const STREAM =
  'event: step\ndata: {"id":"understand","status":"running"}\n\n' +
  'event: explanation\ndata: {"delta":"Hello "}\n\n' +
  'event: done\ndata: {"sessionId":"s1"}\n\n';

describe("createSseParser", () => {
  it("parses whole events in order", () => {
    expect(parseChunks([STREAM])).toEqual([
      { event: "step", data: '{"id":"understand","status":"running"}' },
      { event: "explanation", data: '{"delta":"Hello "}' },
      { event: "done", data: '{"sessionId":"s1"}' },
    ]);
  });

  it("gives the same result whatever the chunk boundaries (every split point, and 1 char at a time)", () => {
    const expected = parseChunks([STREAM]);
    for (let i = 1; i < STREAM.length; i++) {
      expect(parseChunks([STREAM.slice(0, i), STREAM.slice(i)])).toEqual(expected);
    }
    expect(parseChunks(STREAM.split(""))).toEqual(expected);
  });

  it("joins multi-line data with newlines", () => {
    expect(parseChunks(['event: explanation\ndata: {"delta":\ndata: "two lines"}\n\n'])).toEqual([
      { event: "explanation", data: '{"delta":\n"two lines"}' },
    ]);
  });

  it("accepts CRLF and CR line endings, even split between \\r and \\n", () => {
    expect(parseChunks(["event: done\r", '\ndata: {"sessionId":"a"}\r\n\r\n'])).toEqual([
      { event: "done", data: '{"sessionId":"a"}' },
    ]);
    expect(parseChunks(['event: done\rdata: {"sessionId":"b"}\r\r'])).toEqual([
      { event: "done", data: '{"sessionId":"b"}' },
    ]);
  });

  it("ignores comments, unknown fields and events without data; defaults the event name to 'message'", () => {
    expect(parseChunks([": keep-alive\n\nid: 7\nretry: 100\n\nevent: ping\n\ndata:x\n\n"])).toEqual([
      { event: "message", data: "x" },
    ]);
  });

  it("strips exactly one space after the colon", () => {
    expect(parseChunks(["data:  two spaces\n\n"])).toEqual([{ event: "message", data: " two spaces" }]);
  });

  it("flushes a final event that has no trailing blank line when the stream ends", () => {
    expect(parseChunks(['event: done\ndata: {"sessionId":"z"}'])).toEqual([
      { event: "done", data: '{"sessionId":"z"}' },
    ]);
  });
});

describe("readSseStream", () => {
  it("decodes a byte stream split inside a multi-byte UTF-8 character", async () => {
    const bytes = new TextEncoder().encode('event: explanation\ndata: {"delta":"1.000.000₫ — đủ"}\n\n');
    const cut = bytes.indexOf(0xe2) + 1; // inside "₫"
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut));
        c.enqueue(bytes.slice(cut));
        c.close();
      },
    });
    const out: RawSseEvent[] = [];
    await readSseStream(body, (e) => out.push(e));
    expect(out).toEqual([{ event: "explanation", data: '{"delta":"1.000.000₫ — đủ"}' }]);
  });
});
