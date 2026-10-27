// Guards for proxy calls that hang without erroring (seen 28/10 via ShopAIKey: a request stalled > 5 min).

/** LLM request timeout (ms) for non-stream calls and stream start; SDK retries once on timeout. */
export const LLM_TIMEOUT_MS = Number(process.env.KITLY_LLM_TIMEOUT_MS) || 45_000;
/** A stream that sends nothing for this long is treated as dead. */
export const STREAM_IDLE_MS = 20_000;

/** Re-yields `source`, throwing if the gap between two deltas (or before the first) exceeds `ms`. */
export async function* withIdleTimeout<T>(source: AsyncIterable<T>, ms: number): AsyncGenerator<T> {
  const it = source[Symbol.asyncIterator]();
  for (;;) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const idle = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`LLM stream: no output for ${ms} ms`)), ms);
    });
    try {
      const next = await Promise.race([it.next(), idle]);
      if (next.done) return;
      yield next.value;
    } catch (e) {
      await it.return?.();
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
