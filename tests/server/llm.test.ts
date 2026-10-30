// The real OpenAI client against a local OpenAI-compatible HTTP server (OPENAI_BASE_URL), plus FakeLLM.
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { OpenAILLM, FakeLLM, llmModels, LLMTimeoutError } from "@/server/llm";

type Handler = (body: Record<string, unknown>, res: http.ServerResponse) => void;
let handler: Handler;
let lastBody: Record<string, unknown> = {};
let server: http.Server;
let baseURL = "";

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastBody = JSON.parse(raw || "{}");
      handler(lastBody, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
beforeEach(() => {
  lastBody = {};
});

const jsonResponse = (text: string) => ({
  id: "resp_1",
  object: "response",
  status: "completed",
  output: [
    {
      type: "message",
      id: "msg_1",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text, annotations: [] }],
    },
  ],
});
const sse = (res: http.ServerResponse, type: string, data: Record<string, unknown>) =>
  res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);

const Plan = z.object({ items: z.array(z.string()) });

describe("OpenAILLM.structured", () => {
  it("sends the model, a strict json_schema format and reasoning.effort, and returns the parsed object", async () => {
    handler = (_b, res) =>
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(jsonResponse('{"items":["backpack","notebooks"]}')));
    const llm = new OpenAILLM({ apiKey: "test", baseURL });
    const out = await llm.structured("gpt-6-luna", Plan, [{ role: "user", content: "Grade 1" }], {
      effort: "low",
      name: "plan",
    });
    expect(out).toEqual({ items: ["backpack", "notebooks"] });
    expect(lastBody.model).toBe("gpt-6-luna");
    expect(lastBody.reasoning).toEqual({ effort: "low" });
    expect(lastBody.text).toMatchObject({ format: { type: "json_schema", name: "plan", strict: true } });
    expect(lastBody.input).toEqual([{ role: "user", content: "Grade 1" }]);
  });

  it("omits reasoning when no effort is given", async () => {
    handler = (_b, res) =>
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(jsonResponse('{"items":[]}')));
    await new OpenAILLM({ apiKey: "test", baseURL }).structured("m", Plan, [{ role: "user", content: "x" }]);
    expect(lastBody).not.toHaveProperty("reasoning");
  });

  it("rejects output that does not match the schema", async () => {
    handler = (_b, res) =>
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(jsonResponse('{"items":"nope"}')));
    await expect(
      new OpenAILLM({ apiKey: "test", baseURL }).structured("m", Plan, [{ role: "user", content: "x" }]),
    ).rejects.toThrow();
  });
});

describe("OpenAILLM.stream", () => {
  it("streams output_text deltas from raw events with stream:true and effort", async () => {
    handler = (_b, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, "response.created", { response: { id: "resp_x", status: "in_progress", output: [] } });
      sse(res, "response.output_text.delta", { delta: "Hello ", item_id: "m", output_index: 0, content_index: 0 });
      sse(res, "response.output_text.delta", { delta: "Lan", item_id: "m", output_index: 0, content_index: 0 });
      // a proxy that rewrites ids: the completed event carries a different response id
      sse(res, "response.completed", { response: { id: "proxy_rewritten", status: "completed", output: [] } });
      res.end();
    };
    const llm = new OpenAILLM({ apiKey: "test", baseURL });
    const parts: string[] = [];
    for await (const d of llm.stream("gpt-6-luna", [{ role: "user", content: "hi" }], { effort: "low" })) parts.push(d);
    expect(parts.join("")).toBe("Hello Lan");
    expect(lastBody.stream).toBe(true);
    expect(lastBody.reasoning).toEqual({ effort: "low" });
  });

  it("aborts with LLMTimeoutError when no delta arrives within the idle window", async () => {
    handler = (_b, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, "response.output_text.delta", { delta: "Hel", item_id: "m", output_index: 0, content_index: 0 });
      // then hang silently
    };
    const llm = new OpenAILLM({ apiKey: "test", baseURL, streamIdleMs: 150 });
    const parts: string[] = [];
    const run = async () => {
      for await (const d of llm.stream("m", [{ role: "user", content: "hi" }])) parts.push(d);
    };
    await expect(run()).rejects.toBeInstanceOf(LLMTimeoutError);
    expect(parts).toEqual(["Hel"]);
  });

  it("throws when the stream reports a failure", async () => {
    handler = (_b, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      sse(res, "response.failed", { response: { id: "r", status: "failed", error: { message: "boom" }, output: [] } });
      res.end();
    };
    const run = async () => {
      for await (const _ of new OpenAILLM({ apiKey: "test", baseURL }).stream("m", [{ role: "user", content: "x" }]))
        void _;
    };
    await expect(run()).rejects.toThrow(/boom|failed/);
  });
});

describe("llmModels (env)", () => {
  it("reads models and efforts from env with AGENTS.md defaults", () => {
    const saved = { ...process.env };
    delete process.env.KITLY_MODEL_PLANNER;
    delete process.env.KITLY_PLANNER_EFFORT;
    process.env.KITLY_MODEL_FAST = "fast-x";
    process.env.KITLY_FAST_EFFORT = "medium";
    expect(llmModels()).toEqual({
      planner: { model: "gpt-6-luna", effort: "low" },
      fast: { model: "fast-x", effort: "medium" },
    });
    process.env = saved;
  });
});

describe("FakeLLM", () => {
  it("returns queued structured outputs, streams text and records model + effort", async () => {
    const fake = new FakeLLM({ structured: [{ items: ["a"] }], stream: ["one ", "two"] });
    expect(await fake.structured("planner-m", Plan, [{ role: "user", content: "q" }], { effort: "low" })).toEqual({
      items: ["a"],
    });
    const parts: string[] = [];
    for await (const d of fake.stream("fast-m", [{ role: "user", content: "q" }], { effort: "minimal" })) parts.push(d);
    expect(parts).toEqual(["one ", "two"]);
    expect(fake.calls.map((c) => [c.kind, c.model, c.effort])).toEqual([
      ["structured", "planner-m", "low"],
      ["stream", "fast-m", "minimal"],
    ]);
  });

  it("validates queued outputs with the schema and can fail on demand", async () => {
    const fake = new FakeLLM({ structured: [{ items: 1 }, new Error("llm down")] });
    await expect(fake.structured("m", Plan, [])).rejects.toThrow();
    await expect(fake.structured("m", Plan, [])).rejects.toThrow("llm down");
  });
});
