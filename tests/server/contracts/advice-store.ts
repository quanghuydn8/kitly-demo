// AdviceStore contract suite (insight_advice, DATA.md §6): the SAME tests run against InMemoryAdviceStore and
// SupabaseAdviceStore. Gap keys are prefixed per run so a shared database never mixes runs.
import { afterAll, describe, expect, it } from "vitest";
import type { AdviceStore } from "@/server/advicestore";

export interface AdviceStoreHarness {
  make(): AdviceStore;
  cleanup?(keyPrefix: string): Promise<void>;
}

export function adviceStoreContract(name: string, h: AdviceStoreHarness, opts: { skip?: boolean } = {}): void {
  describe.skipIf(!!opts.skip)(`AdviceStore contract: ${name}`, () => {
    const prefix = `contract-${Math.random().toString(36).slice(2)}-`;
    afterAll(async () => {
      await h.cleanup?.(prefix);
    });

    it("get on an unknown gap key is null", async () => {
      expect(await h.make().get(prefix + "nothing|")).toBeNull();
    });

    it("put then get returns the advice and its counts signature; a second put replaces it", async () => {
      const store = h.make();
      const key = prefix + "school-backpack|anti-hunchback";
      await store.put(key, "5|3|1", "Add anti-hunchback to your backpack listing.");
      expect(await store.get(key)).toEqual({ countsSignature: "5|3|1", advice: "Add anti-hunchback to your backpack listing." });
      await store.put(key, "6|3|1", "Demand is rising: tag the backpack now.");
      expect(await store.get(key)).toEqual({ countsSignature: "6|3|1", advice: "Demand is rising: tag the backpack now." });
    });
  });
}
