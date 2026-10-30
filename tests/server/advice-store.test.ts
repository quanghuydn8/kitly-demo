import { describe, expect, it } from "vitest";
import { getAdviceStore } from "@/server/advicestore";
import { InMemoryAdviceStore } from "@/server/advicestore/in-memory";
import { adviceStoreContract } from "./contracts/advice-store";

adviceStoreContract("InMemoryAdviceStore", { make: () => new InMemoryAdviceStore() });

describe("getAdviceStore", () => {
  it("returns the in-memory store when KITLY_ADAPTER=memory", () => {
    expect(getAdviceStore()).toBeInstanceOf(InMemoryAdviceStore);
  });
});
