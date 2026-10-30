// InMemoryWatchStore: demand_watches for tests and KITLY_ADAPTER=memory.
import type { WatchStore } from "./index";

export class InMemoryWatchStore implements WatchStore {
  private rows = new Map<string, number>();

  async add(gapKey: string): Promise<number> {
    const n = (this.rows.get(gapKey) ?? 0) + 1;
    this.rows.set(gapKey, n);
    return n;
  }

  async counts(gapKeys: string[]): Promise<Map<string, number>> {
    return new Map(gapKeys.map((k) => [k, this.rows.get(k) ?? 0]));
  }
}
