// KitScreen: a thread read-back that finishes AFTER the buyer already sent the next message must not wipe that
// message's live run (seen on Vercel 31/10: the 3rd user bubble vanished for > 5 s when the refine was typed right
// after an answer turn, because the answer's loadThread resolved late and called setRun(null)).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import threadsJson from "@/contract/fixtures/threads.sample.json";
import { ThreadsSampleSchema, type KitStreamEvent } from "@/contract";
import type { KitApi } from "@/lib/client/kit-api";

const [hero] = ThreadsSampleSchema.parse(threadsJson);
const threadId = hero.thread.id;

let resolveLateRead: (() => void) | null = null;
let getThreadCalls = 0;

const fakeApi = {
  listThreads: async () => [],
  getThread: () => {
    getThreadCalls += 1;
    if (getThreadCalls === 1) return Promise.resolve(hero);
    // The answer turn's read-back: held until the test releases it.
    return new Promise((resolve) => {
      resolveLateRead = () => resolve(hero);
    });
  },
  refineKit: (_id: string, message: string, onEvent: (e: KitStreamEvent) => void) => {
    if (message.startsWith("Is the")) {
      onEvent({ event: "done", data: { sessionId: null, threadId, version: 1, answered: true } });
    }
    // The refine stays in flight (no events yet), like a planner call that takes 10 s.
    return new Promise<void>(() => {});
  },
} as unknown as KitApi;

vi.mock("@/lib/client/kit-api", () => ({ kitApi: () => fakeApi }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/kit/t/x" }));
vi.mock("@/lib/client/persona-store", () => ({ usePersona: () => null }));
vi.mock("@/lib/client/cart-store", () => ({ useCart: () => ({ add: vi.fn() }) }));

const { KitScreen } = await import("@/components/kit/KitScreen");

afterEach(cleanup);

function send(text: string) {
  const box = screen.getByRole("textbox", { name: "Message Kitly" });
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}

describe("KitScreen run vs late thread read-back", () => {
  it("a message sent before the previous turn's read-back returns stays on screen", async () => {
    render(<KitScreen threadId={threadId} demoToday="2026-09-02" />);
    await screen.findAllByTestId("user-bubble");
    const saved = screen.getAllByTestId("user-bubble").length;

    send("Is the Minh An backpack really anti-hunchback?"); // done at once → read-back starts, held
    send("Drop the raincoat too, please."); // the next turn, before the read-back returns
    expect(screen.getAllByText("Drop the raincoat too, please.").length).toBe(1);

    await act(async () => {
      resolveLateRead?.();
    });
    expect(screen.getAllByTestId("user-bubble").length).toBe(saved + 1);
    expect(screen.getAllByText("Drop the raincoat too, please.").length).toBe(1);
  });
});
