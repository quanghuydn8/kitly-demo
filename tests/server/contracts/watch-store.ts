// WatchStore contract suite (demand_watches, DATA.md §6, Full): the SAME tests run against InMemoryWatchStore and
// SupabaseWatchStore. Gap keys are prefixed per run so a shared database never mixes runs.
import { afterAll, describe, expect, it } from "vitest";
import type { WatchStore } from "@/server/watchstore";

export interface WatchStoreHarness {
  make(): WatchStore;
  cleanup?(keyPrefix: string): Promise<void>;
}

export function watchStoreContract(name: string, h: WatchStoreHarness, opts: { skip?: boolean } = {}): void {
  describe.skipIf(!!opts.skip)(`WatchStore contract: ${name}`, () => {
    const prefix = `contract-${Math.random().toString(36).slice(2)}-`;
    afterAll(async () => {
      await h.cleanup?.(prefix);
    });

    it("add returns the gap's watcher count, incremented on every call", async () => {
      const store = h.make();
      const key = prefix + "school-backpack|anti-hunchback";
      expect(await store.add(key)).toBe(1);
      expect(await store.add(key)).toBe(2);
    });

    it("counts gives every asked key a number (0 when nobody watches) and keeps keys apart", async () => {
      const store = h.make();
      const a = prefix + "kids-raincoat|backpack-cover";
      const b = prefix + "none|";
      await store.add(a);
      await store.add(b);
      await store.add(b);
      const counts = await store.counts([a, b, prefix + "pets|"]);
      expect(Object.fromEntries(counts)).toEqual({ [a]: 1, [b]: 2, [prefix + "pets|"]: 0 });
      expect((await store.counts([])).size).toBe(0);
    });
  });
}
