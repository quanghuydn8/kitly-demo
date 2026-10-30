// InMemoryAdviceStore: insight_advice for tests and KITLY_ADAPTER=memory.
import type { AdviceStore, CachedAdvice } from "./index";

export class InMemoryAdviceStore implements AdviceStore {
  private rows = new Map<string, CachedAdvice>();

  async get(gapKey: string): Promise<CachedAdvice | null> {
    const row = this.rows.get(gapKey);
    return row ? { ...row } : null;
  }

  async put(gapKey: string, countsSignature: string, advice: string): Promise<void> {
    this.rows.set(gapKey, { countsSignature, advice });
  }
}
