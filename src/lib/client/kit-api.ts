// Kitly HTTP client (T11). Live mode calls the contract endpoints; NEXT_PUBLIC_KITLY_MOCK=1 swaps in the
// fixture-backed fake from kit-mock.ts (CONTRACT §4) so the screen works before the pipeline is pushed.
import {
  AdjustResponseSchema,
  PriceResponseSchema,
  ThreadResponseSchema,
  ThreadsResponseSchema,
  type BasketOption,
  type KitChange,
  type KitSelection,
  type KitStreamEvent,
  type KitThreadSummary,
  type KitVersion,
  type ThreadResponse,
} from "@/contract";
import { postSse } from "./sse";
import { mockApi } from "./kit-mock";

export class KitApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface KitApi {
  listThreads(): Promise<KitThreadSummary[]>;
  /** null when the thread does not exist or belongs to another browser (404). */
  getThread(id: string): Promise<ThreadResponse | null>;
  adjust(threadId: string, change: KitChange): Promise<KitVersion>;
  price(threadId: string, selection: KitSelection): Promise<BasketOption>;
  runKit(query: string, onEvent: (e: KitStreamEvent) => void, signal?: AbortSignal): Promise<void>;
  refineKit(
    threadId: string,
    message: string,
    onEvent: (e: KitStreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}

const PROFILES = ["saver", "balanced", "premium"] as const;

async function json<T>(res: Response, parse: (x: unknown) => T): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new KitApiError(
      err?.code ?? `http_${res.status}`,
      err?.message ?? `Request failed (${res.status})`,
      res.status,
    );
  }
  return parse(body);
}

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export const liveApi: KitApi = {
  async listThreads() {
    return json(await fetch("/api/threads", { cache: "no-store" }), (b) => ThreadsResponseSchema.parse(b).threads);
  },
  async getThread(id) {
    const res = await fetch(`/api/threads/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 404) return null;
    // `messages` may be missing on an older server: default to [] rather than failing the whole screen.
    return json(res, (b) => ThreadResponseSchema.parse({ messages: [], ...(b as object) }));
  },
  async adjust(threadId, change) {
    return json(await post("/api/kit/adjust", { threadId, change }), (b) => AdjustResponseSchema.parse(b).version);
  },
  async price(threadId, selection) {
    return json(await post("/api/kit/price", { threadId, selection }), (b) => PriceResponseSchema.parse(b).option);
  },
  runKit(query, onEvent, signal) {
    return postSse("/api/kit", { query, profiles: PROFILES }, onEvent, signal);
  },
  refineKit(threadId, message, onEvent, signal) {
    return postSse("/api/kit/refine", { threadId, message, profiles: PROFILES }, onEvent, signal);
  },
};

export const KITLY_MOCK = process.env.NEXT_PUBLIC_KITLY_MOCK === "1";

export function kitApi(): KitApi {
  return KITLY_MOCK ? mockApi : liveApi;
}
