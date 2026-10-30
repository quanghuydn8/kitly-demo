// Reads a whole SSE response body and validates every event against the contract (kit stream tests).
import { expect } from "vitest";
import { KitStreamEventSchema, type KitStreamEvent } from "@/contract";

export async function sseEvents(res: Response): Promise<KitStreamEvent[]> {
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const text = await res.text();
  return text
    .split("\n\n")
    .filter((b) => b.trim())
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((l) => l.startsWith("event: "))!.slice(7);
      const data = JSON.parse(
        lines
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice(6))
          .join("\n"),
      );
      return KitStreamEventSchema.parse({ event, data });
    });
}
export const eventNames = (evs: KitStreamEvent[]) =>
  evs.map((e) => (e.event === "step" ? `${e.data.id}:${e.data.status}` : e.event));
export const dataOf = <N extends KitStreamEvent["event"]>(evs: KitStreamEvent[], n: N) =>
  evs.find((e) => e.event === n)?.data as Extract<KitStreamEvent, { event: N }>["data"];
