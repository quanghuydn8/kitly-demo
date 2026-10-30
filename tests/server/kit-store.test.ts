import { describe, expect, it } from "vitest";
import { InMemoryKitStore } from "@/server/kitstore/in-memory";
import { getKitStore } from "@/server/kitstore";
import { kitStoreContract } from "./contracts/kit-store";

kitStoreContract("InMemoryKitStore", { make: () => new InMemoryKitStore() });

describe("getKitStore", () => {
  it("returns the in-memory store when KITLY_ADAPTER=memory", () => {
    expect(getKitStore()).toBeInstanceOf(InMemoryKitStore);
  });
});
