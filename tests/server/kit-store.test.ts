import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryKitStore } from "@/server/kitstore/in-memory";
import { getKitStore } from "@/server/kitstore";
import type { KitVersion } from "@/contract";
import threadsSample from "@/contract/fixtures/threads.sample.json";

const sampleV1 = threadsSample[0].versions[0] as KitVersion;
const draft = (threadId: string, userText: string, kind: KitVersion["kind"] = "new") => {
  const { version: _v, createdAt: _c, ...rest } = sampleV1;
  return { ...rest, threadId, userText, kind };
};

let store: InMemoryKitStore;
beforeEach(() => {
  store = new InMemoryKitStore();
});

describe("InMemoryKitStore", () => {
  it("create → append 2 versions → getThread returns them in order; another owner gets null", async () => {
    const { threadId } = await store.createThread("owner-a", "My kid starts Grade 1", "lan");
    const v1 = await store.appendVersion(draft(threadId, "My kid starts Grade 1"), "owner-a");
    const v2 = await store.appendVersion(draft(threadId, "cut the budget to 1M", "refine"), "owner-a");
    expect([v1.version, v2.version]).toEqual([1, 2]);

    const got = await store.getThread(threadId, "owner-a");
    expect(got?.versions.map((v) => [v.version, v.userText])).toEqual([
      [1, "My kid starts Grade 1"],
      [2, "cut the budget to 1M"],
    ]);
    expect(got?.thread).toMatchObject({
      id: threadId,
      title: "My kid starts Grade 1",
      versionCount: 2,
      persona: "lan",
    });
    expect(got?.messages).toEqual([]);

    expect(await store.getThread(threadId, "owner-b")).toBeNull();
    expect(await store.getThread("does-not-exist", "owner-a")).toBeNull();
  });

  it("appendVersion / appendMessage / saveSelection refuse another owner's thread", async () => {
    const { threadId } = await store.createThread("owner-a", "t", "lan");
    await expect(store.appendVersion(draft(threadId, "x"), "owner-b")).rejects.toThrow();
    await expect(
      store.appendMessage({ threadId, afterVersion: 1, userText: "q", answer: "a", followUp: null }, "owner-b"),
    ).rejects.toThrow();
    await expect(
      store.saveSelection(threadId, "owner-b", { profile: "balanced", picks: {}, dropped: [] }),
    ).rejects.toThrow();
  });

  it("titles are cut to 60 chars and the thread keeps its persona", async () => {
    const long = "My kid starts Grade 1. Budget 1.5M VND. The backpack must be anti-hunchback, under 400k.";
    const { threadId } = await store.createThread("o", long, "guest");
    const t = (await store.listThreads("o"))[0];
    expect(t.id).toBe(threadId);
    expect(t.title.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(t.title.replace(/…$/, ""))).toBe(true);
    expect(t.persona).toBe("guest");
  });

  it("appendMessage stores answer turns without creating a version", async () => {
    const { threadId } = await store.createThread("o", "t", "lan");
    await store.appendVersion(draft(threadId, "t"), "o");
    const m = await store.appendMessage(
      { threadId, afterVersion: 1, userText: "really?", answer: "yes", followUp: null },
      "o",
    );
    expect(m.createdAt).toBeTruthy();
    const got = await store.getThread(threadId, "o");
    expect(got?.versions).toHaveLength(1);
    expect(got?.messages.map((x) => x.userText)).toEqual(["really?"]);
  });

  it("saveSelection writes on the latest version only", async () => {
    const { threadId } = await store.createThread("o", "t", "lan");
    await store.appendVersion(draft(threadId, "a"), "o");
    await store.appendVersion(draft(threadId, "b", "adjust"), "o");
    const sel = { profile: "premium" as const, picks: { backpack: "prod-minhan-backpack" }, dropped: ["lunch-box"] };
    await store.saveSelection(threadId, "o", sel);
    const got = await store.getThread(threadId, "o");
    expect(got?.versions[0].selection).toBeNull();
    expect(got?.versions[1].selection).toEqual(sel);
  });

  it("listThreads: only the owner's, updatedAt desc, max 30", async () => {
    for (let i = 0; i < 32; i++) await store.createThread("o", `kit ${i}`, "lan");
    await store.createThread("other", "not mine", "lan");
    const list = await store.listThreads("o");
    expect(list).toHaveLength(30);
    expect(list.some((t) => t.title === "not mine")).toBe(false);
    const times = list.map((t) => t.updatedAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it("appending a version moves the thread to the top of the list", async () => {
    const a = await store.createThread("o", "first", "lan");
    await store.createThread("o", "second", "lan");
    await new Promise((r) => setTimeout(r, 5));
    await store.appendVersion(draft(a.threadId, "again", "refine"), "o");
    expect((await store.listThreads("o"))[0].title).toBe("first");
  });

  it("getKitStore() returns the in-memory store when KITLY_ADAPTER=memory", () => {
    expect(getKitStore()).toBeInstanceOf(InMemoryKitStore);
  });
});
