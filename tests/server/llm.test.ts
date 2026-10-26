import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { z } from "zod";
import { FakeLLM, OpenAILLM, models } from "@/server/llm";

const Answer = z.object({ city: z.string(), days: z.number().int() });

// A tiny OpenAI-compatible proxy: proves OPENAI_BASE_URL is honoured and that streaming reads raw events.
let server: Server;
let baseURL = "";
const seen: { path: string; body: Record<string, unknown> }[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw);
      seen.push({ path: req.url ?? "", body });
      if (body.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        // ids deliberately differ between events (proxies rewrite them) — the raw-event reader must not care.
        const events = [
          { type: "response.created", response: { id: "resp_a" } },
          { type: "response.output_text.delta", delta: "Hello ", item_id: "x1" },
          { type: "response.output_text.delta", delta: "world", item_id: "x2" },
          { type: "response.completed", response: { id: "resp_b" } },
        ];
        for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "resp_1",
          object: "response",
          status: "completed",
          output: [
            {
              type: "message",
              id: "msg_1",
              role: "assistant",
              status: "completed",
              content: [{ type: "output_text", text: '{"city":"Hanoi","days":3}', annotations: [] }],
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => server.close());

describe("OpenAILLM (through an OpenAI-compatible base URL)", () => {
  it("structured() sends a strict JSON schema and returns the parsed, validated object", async () => {
    const llm = new OpenAILLM({ apiKey: "test", baseURL });
    const out = await llm.structured("model-x", Answer, [{ role: "user", content: "trip?" }], "answer");
    expect(out).toEqual({ city: "Hanoi", days: 3 });
    const call = seen.at(-1)!;
    expect(call.path).toBe("/v1/responses");
    expect(call.body.model).toBe("model-x");
    expect(call.body.text).toMatchObject({ format: { type: "json_schema", name: "answer", strict: true } });
  });

  it("stream() yields output_text deltas from raw events", async () => {
    const llm = new OpenAILLM({ apiKey: "test", baseURL });
    const parts: string[] = [];
    for await (const d of llm.stream("model-y", [{ role: "user", content: "hi" }])) parts.push(d);
    expect(parts).toEqual(["Hello ", "world"]);
    expect(seen.at(-1)!.body).toMatchObject({ model: "model-y", stream: true });
  });
});

describe("FakeLLM", () => {
  it("returns queued structured outputs validated against the schema and records calls", async () => {
    const llm = new FakeLLM({ structured: [{ city: "Hue", days: 2 }] });
    expect(await llm.structured("m", Answer, [{ role: "user", content: "q" }])).toEqual({
      city: "Hue",
      days: 2,
    });
    expect(llm.calls).toHaveLength(1);
    await expect(llm.structured("m", Answer, [])).rejects.toThrow(/no structured output queued/);
  });

  it("rejects a queued output that does not match the schema", async () => {
    const llm = new FakeLLM({ structured: [{ city: 1 }] });
    await expect(llm.structured("m", Answer, [])).rejects.toThrow();
  });

  it("streams the configured chunks", async () => {
    const llm = new FakeLLM({ stream: ["a", "b"] });
    const parts: string[] = [];
    for await (const d of llm.stream("m", [])) parts.push(d);
    expect(parts).toEqual(["a", "b"]);
  });
});

describe("models", () => {
  it("reads model names from env with PRD defaults", () => {
    const prev = { p: process.env.KITLY_MODEL_PLANNER, f: process.env.KITLY_MODEL_FAST };
    delete process.env.KITLY_MODEL_PLANNER;
    delete process.env.KITLY_MODEL_FAST;
    expect(models.planner()).toBe("gpt-6.1-sol");
    expect(models.fast()).toBe("gpt-6-luna");
    process.env.KITLY_MODEL_FAST = "custom";
    expect(models.fast()).toBe("custom");
    process.env.KITLY_MODEL_PLANNER = prev.p;
    process.env.KITLY_MODEL_FAST = prev.f;
    if (prev.p === undefined) delete process.env.KITLY_MODEL_PLANNER;
    if (prev.f === undefined) delete process.env.KITLY_MODEL_FAST;
  });
});
