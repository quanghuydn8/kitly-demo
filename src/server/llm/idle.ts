// withIdleTimeout: wraps an async iterable of deltas; when no item arrives within `idleMs` it calls `onIdle`
// (e.g. abort the HTTP request) and throws LLMTimeoutError. A proxy can hang silently for minutes (AGENTS.md).
import { LLMTimeoutError } from "./types";

export async function* withIdleTimeout<T>(
  source: AsyncIterable<T>,
  idleMs: number,
  onIdle?: () => void,
): AsyncGenerator<T> {
  const it = source[Symbol.asyncIterator]();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    while (true) {
      const idle = new Promise<"idle">((resolve) => {
        timer = setTimeout(() => resolve("idle"), idleMs);
      });
      const next = await Promise.race([it.next(), idle]);
      clearTimeout(timer);
      if (next === "idle") {
        onIdle?.();
        void it.return?.()?.catch(() => {});
        throw new LLMTimeoutError(`no LLM delta for ${idleMs} ms`);
      }
      if (next.done) return;
      yield next.value;
    }
  } finally {
    clearTimeout(timer);
  }
}
