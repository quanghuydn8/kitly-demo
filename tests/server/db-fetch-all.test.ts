// fetchAll (src/server/db/supabase.ts): reads every row of a PostgREST query page by page (max 1,000 rows per request).
// Rehearsal 2 (31/10): the seller insights read 6,799 demand rows as 7 pages one after another (2.3 s) and one page once
// died with "canceling statement due to statement timeout" → the Seller Centre answered 500.
import { describe, expect, it } from "vitest";
import { fetchAll } from "@/server/db/supabase";

function table(n: number, opts: { failOnce?: number[]; failAlways?: number[]; delayMs?: number } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ i }));
  const failed = new Set<number>();
  let inFlight = 0;
  const stats = { calls: 0, maxInFlight: 0 };
  const page = async (from: number, to: number) => {
    stats.calls++;
    inFlight++;
    stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, opts.delayMs ?? 5));
    inFlight--;
    if (opts.failAlways?.includes(from) || (opts.failOnce?.includes(from) && !failed.has(from))) {
      failed.add(from);
      return { data: null, error: { message: "canceling statement due to statement timeout" } };
    }
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { page, stats };
}

describe("fetchAll", () => {
  it("returns every row in order across pages", async () => {
    const t = table(2500);
    const out = await fetchAll(t.page, "test", 1000);
    expect(out.map((r) => r.i)).toEqual(Array.from({ length: 2500 }, (_, i) => i));
  });

  it("asks several pages at once instead of one after another", async () => {
    const t = table(6799);
    const out = await fetchAll(t.page, "test", 1000);
    expect(out).toHaveLength(6799);
    expect(t.stats.maxInFlight).toBeGreaterThan(1);
  });

  it("retries a page that failed once (transient statement timeout)", async () => {
    const t = table(2500, { failOnce: [1000] });
    expect(await fetchAll(t.page, "test", 1000)).toHaveLength(2500);
  });

  it("a page that fails twice throws with the query name", async () => {
    const t = table(2500, { failAlways: [1000] });
    await expect(fetchAll(t.page, "demandItemsSince", 1000)).rejects.toThrow(/demandItemsSince/);
  });

  it("an exact multiple of the page size ends on the empty page", async () => {
    const t = table(2000);
    expect(await fetchAll(t.page, "test", 1000)).toHaveLength(2000);
  });
});
