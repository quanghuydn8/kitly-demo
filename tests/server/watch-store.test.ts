import { describe, expect, it } from "vitest";
import { getWatchStore } from "@/server/watchstore";
import { InMemoryWatchStore } from "@/server/watchstore/in-memory";
import { watchStoreContract } from "./contracts/watch-store";

watchStoreContract("InMemoryWatchStore", { make: () => new InMemoryWatchStore() });

describe("getWatchStore", () => {
  it("returns the in-memory store when KITLY_ADAPTER=memory, the same instance each call", () => {
    expect(getWatchStore()).toBeInstanceOf(InMemoryWatchStore);
    expect(getWatchStore()).toBe(getWatchStore());
  });
});
