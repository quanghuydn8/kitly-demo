import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryKitStore } from "@/server/kitstore/in-memory";
import { getKitStore } from "@/server/kitstore";
import { kitStoreContract } from "./contracts/kit-store";

kitStoreContract("InMemoryKitStore", { make: () => new InMemoryKitStore() });

describe("getKitStore", () => {
  it("returns the in-memory store when KITLY_ADAPTER=memory", () => {
    expect(getKitStore()).toBeInstanceOf(InMemoryKitStore);
  });
});

describe("InMemoryKitStore: same-millisecond writes", () => {
  afterEach(() => vi.useRealTimers());

  // rehearsal 2 (31/10): price-threads-routes "newest first" failed ~1 run in 13 — two threads created in the same ms
  // had equal updatedAt, and the stable sort kept the older one first.
  it("newest first even when two threads share the same timestamp", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-02T10:00:00.000Z"));
    const store = new InMemoryKitStore();
    const a = await store.createThread("o", "first", "lan");
    const b = await store.createThread("o", "second", "lan");
    expect((await store.listThreads("o")).map((t) => t.id)).toEqual([b.threadId, a.threadId]);
  });
});
