// KitScreen follow-up swap pill (31/10 on the live site): the "⚙ Switched …" turn must land at the END of the chat and
// name the item by its plan label. Saved turns carry wall-clock timestamps (KitStore records time, not business
// dates), so a local turn stamped with the demo clock (Sep 2) sorted before every saved turn (Oct 31).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import threadsJson from "@/contract/fixtures/threads.sample.json";
import { ThreadsSampleSchema, type KitVersion } from "@/contract";
import type { KitApi } from "@/lib/client/kit-api";

const [hero] = ThreadsSampleSchema.parse(threadsJson);
const threadId = hero.thread.id;
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

// A Vietnamese kit: item keys are slugs ("hop-com"), the label is what the buyer reads.
const last = hero.versions[hero.versions.length - 1];
const line = last.options.find((o) => o.profile === "balanced")!.lines.find((l) => l.alternatives.length > 0)!;
const alt = line.alternatives[0];
const label = "Hộp đựng cơm";
const versions: KitVersion[] = hero.versions.map((v, i) => ({
  ...v,
  createdAt: minutesAgo(10 - i),
  plan: { ...v.plan, items: v.plan.items.map((it) => (it.key === line.itemKey ? { ...it, needLabel: label } : it)) },
  followUp:
    v === last
      ? {
          question: "Đổi sang loại xịn hơn?",
          suggestions: [{ text: "Đổi sang loại xịn hơn", action: { type: "swap", itemKey: line.itemKey, productId: alt.product.id } }, { text: "Giữ nguyên" }],
          source: "llm",
        }
      : v.followUp,
}));
const thread = { ...hero, versions, messages: [] };

const fakeApi = {
  listThreads: async () => [],
  getThread: async () => thread,
  price: async () => last.options.find((o) => o.profile === "balanced")!,
} as unknown as KitApi;

vi.mock("@/lib/client/kit-api", () => ({ kitApi: () => fakeApi }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/kit/t/x" }));
vi.mock("@/lib/client/persona-store", () => ({ usePersona: () => null }));
vi.mock("@/lib/client/cart-store", () => ({ useCart: () => ({ add: vi.fn() }) }));

const { KitScreen } = await import("@/components/kit/KitScreen");

afterEach(cleanup);

describe("KitScreen follow-up swap pill", () => {
  it("the Switched turn comes after the saved turns and names the item by its plan label", async () => {
    render(<KitScreen threadId={threadId} demoToday="2026-09-02" />);
    const pill = await screen.findByRole("button", { name: "Đổi sang loại xịn hơn" });
    fireEvent.click(pill);
    const items = within(screen.getByRole("list", { name: "Conversation" })).getAllByRole("listitem", { hidden: true });
    const switched = items.findIndex((li) => /Switched/.test(li.textContent ?? ""));
    expect(switched).toBeGreaterThan(-1);
    const lastSaved = items.findLastIndex((li) => li.textContent?.includes(last.userText));
    expect(switched).toBeGreaterThan(lastSaved);
    expect(items[switched].textContent).toContain(`Switched ${label.toLowerCase()}`);
  });
});
