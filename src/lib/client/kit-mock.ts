// Mock Kitly backend for NEXT_PUBLIC_KITLY_MOCK=1 (CONTRACT §4): replays the recorded SSE fixtures with 300 ms gaps
// and answers history/edit calls from threads.sample.json. Threads made in mock mode are kept in localStorage so a
// reload keeps them. Demo/dev only: totals are never computed here beyond copying fixture values.
import kitSample from "@/contract/fixtures/kit.sample.json";
import clarifySample from "@/contract/fixtures/kit.clarify.sample.json";
import answerSample from "@/contract/fixtures/kit.answer.sample.json";
import threadsSample from "@/contract/fixtures/threads.sample.json";
import {
  KitStreamSchema,
  ThreadsSampleSchema,
  type KitStreamEvent,
  type KitVersion,
  type ThreadResponse,
} from "@/contract";
import type { KitApi } from "./kit-api";
import { applyEvent, runAsVersion, startRun } from "./kit-run";
import { formatVnd } from "./format";

const STORE_KEY = "kitly_mock_threads_v1";
const GAP_MS = 300;

function load(): ThreadResponse[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) return ThreadsSampleSchema.parse(JSON.parse(raw));
  } catch {
    // fall through to the fixtures
  }
  return structuredClone(ThreadsSampleSchema.parse(threadsSample));
}

function save(threads: ThreadResponse[]) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(threads));
  } catch {
    // storage blocked: mock threads live for this page view only
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()));
  });

function nowIso() {
  return new Date().toISOString();
}

function upsertVersion(threads: ThreadResponse[], v: KitVersion, title: string): ThreadResponse[] {
  const existing = threads.find((t) => t.thread.id === v.threadId);
  const versions = [...(existing?.versions ?? []), v];
  const t: ThreadResponse = {
    thread: { id: v.threadId, title, updatedAt: v.createdAt, versionCount: versions.length, persona: "lan" },
    versions,
    messages: existing?.messages ?? [],
  };
  return [t, ...threads.filter((x) => x.thread.id !== v.threadId)];
}

async function replay(
  events: KitStreamEvent[],
  onEvent: (e: KitStreamEvent) => void,
  request: Parameters<typeof startRun>[0],
  title: string,
  signal?: AbortSignal,
) {
  let run = startRun(request);
  for (const e of events) {
    await sleep(GAP_MS, signal);
    if (signal?.aborted) return;
    run = applyEvent(run, e);
    if (e.event === "done") {
      const v = runAsVersion(run);
      if (v) save(upsertVersion(load(), { ...v, createdAt: nowIso() }, title));
      if (run.answered && request.kind === "refine") saveMessage(run, request.threadId, request.message);
    }
    onEvent(e);
  }
}

/** Answer turn (D42): kept as a KitMessage after the thread's current version. */
function saveMessage(run: ReturnType<typeof startRun>, threadId: string, userText: string) {
  const threads = load();
  const t = threads.find((x) => x.thread.id === threadId);
  if (!t) return;
  t.messages.push({
    threadId,
    afterVersion: t.versions.length,
    createdAt: nowIso(),
    userText,
    answer: run.explanation,
    followUp: run.followUp,
  });
  save(threads);
}

function retarget(events: KitStreamEvent[], threadId: string, version: number, refine: boolean): KitStreamEvent[] {
  return events.map((e) => {
    if (e.event === "plan")
      return {
        ...e,
        data: { ...e.data, threadId, version, ...(refine ? { diff: { added: [], removed: [], changed: [] } } : {}) },
      };
    if (e.event === "clarify") return { ...e, data: { ...e.data, threadId, version } };
    if (e.event === "done") return { ...e, data: { ...e.data, threadId, version } };
    return e;
  });
}

export const mockApi: KitApi = {
  async listThreads() {
    return load().map((t) => t.thread);
  },
  async getThread(id) {
    return load().find((t) => t.thread.id === id) ?? null;
  },
  async adjust(threadId, change) {
    const threads = load();
    const t = threads.find((x) => x.thread.id === threadId);
    if (!t) throw new Error("Kit not found");
    const latest = t.versions[t.versions.length - 1];
    const hero = KitStreamSchema.parse(kitSample);
    let base: KitVersion = latest;
    let userText = "Edited the kit";
    let diff: KitVersion["diff"] = null;
    const label = (key: string) =>
      t.versions.flatMap((v) => v.plan.items).find((i) => i.key === key)?.needLabel ?? key;
    if (change.type === "remove_item") {
      // Mock only: drop the item everywhere, keep the fixture totals.
      const k = change.itemKey;
      base = {
        ...latest,
        plan: { ...latest.plan, items: latest.plan.items.filter((i) => i.key !== k) },
        excludedKeys: [...latest.excludedKeys, k],
        options: latest.options.map((o) => ({ ...o, lines: o.lines.filter((l) => l.itemKey !== k), noMatch: o.noMatch.filter((n) => n.itemKey !== k) })),
      };
      userText = `Removed: ${label(k)}`;
      diff = { added: [], removed: [k], changed: [] };
    } else if (change.type === "restore_item") {
      const k = change.itemKey;
      const before = [...t.versions].reverse().find((v) => v.plan.items.some((i) => i.key === k)) ?? latest;
      base = { ...before, excludedKeys: latest.excludedKeys.filter((x) => x !== k) };
      userText = `Restored: ${label(k)}`;
      diff = { added: [k], removed: [], changed: [] };
    } else if (change.type === "set_deadline") {
      base = { ...latest, plan: { ...latest.plan, deadline: change.deadline } };
      userText = change.deadline === null ? "No deadline" : `Deadline: ${change.deadline}`;
    } else if (change.type === "restore_version") {
      base = t.versions.find((v) => v.version === change.version) ?? latest;
      userText = `Restored version ${change.version}`;
    } else if (change.type === "set_budget") {
      const options = hero.flatMap((e) => (e.event === "options" ? e.data.options : []));
      base = { ...latest, status: "ready", options, plan: { ...latest.plan, budget: change.budget } };
      userText = change.budget === null ? "Budget: no limit" : `Budget set to ${formatVnd(change.budget)}`;
    }
    const v: KitVersion = {
      ...base,
      threadId,
      version: latest.version + 1,
      createdAt: nowIso(),
      kind: change.type === "restore_version" ? "restore" : "adjust",
      userText,
      diff,
      selection: null,
      followUp: null,
    };
    save(upsertVersion(threads, v, t.thread.title));
    return v;
  },
  async price(threadId, selection) {
    const t = load().find((x) => x.thread.id === threadId);
    const latest = t?.versions[t.versions.length - 1];
    const option = latest?.options.find((o) => o.profile === selection.profile);
    if (!option) throw new Error("Nothing to price");
    // Mock only: move the picked alternative into the line, Add anyway turns the closest into a line, dropped items
    // go to skipped; the fixture totals are kept.
    // 💛 cart products (D40) are valid picks too.
    const fromCart = (itemKey: string) =>
      option.interests?.find((i) => i.itemKey === itemKey && i.candidate.product.id === selection.picks[itemKey])?.candidate;
    const lines = option.lines
      .filter((l) => !selection.dropped.includes(l.itemKey))
      .map((l) => {
        const alt = l.alternatives.find((a) => a.product.id === selection.picks[l.itemKey]) ?? fromCart(l.itemKey);
        return alt ? { ...l, product: alt.product, shop: alt.shop, reason: "Your pick" } : l;
      });
    const anyway = option.noMatch.filter(
      (n) => (n.closest && n.closest.candidate.product.id === selection.picks[n.itemKey]) || fromCart(n.itemKey),
    );
    for (const n of anyway) {
      const c = fromCart(n.itemKey) ?? n.closest!.candidate;
      lines.unshift({ itemKey: n.itemKey, product: c.product, shop: c.shop, quantity: 1, lineTotal: c.product.price, reason: fromCart(n.itemKey) ? "From your cart" : "Added anyway", alternatives: [] });
    }
    const skipped = [
      ...option.skipped,
      ...option.lines.filter((l) => selection.dropped.includes(l.itemKey)).map((l) => ({ itemKey: l.itemKey, needLabel: l.product.title, reason: "budget" as const })),
    ];
    if (latest && t) {
      latest.selection = selection;
      save(load().map((x) => (x.thread.id === threadId ? t : x)));
    }
    return { ...option, lines, skipped, noMatch: option.noMatch.filter((n) => !anyway.includes(n)) };
  },
  async runKit(query, onEvent, signal) {
    const id = `mock-${Date.now().toString(36)}`;
    const source = /\d/.test(query) ? kitSample : clarifySample;
    await replay(
      retarget(KitStreamSchema.parse(source), id, 1, false),
      onEvent,
      { kind: "new", query },
      query.slice(0, 60),
      signal,
    );
  },
  async refineKit(threadId, message, onEvent, signal) {
    const t = load().find((x) => x.thread.id === threadId);
    // Mock only: a question is answered (no new version), anything else replays the hero kit as a new version.
    if (message.trim().endsWith("?")) {
      const current = t?.versions.length ?? 1;
      await replay(retarget(KitStreamSchema.parse(answerSample), threadId, current, false), onEvent, { kind: "refine", threadId, message }, t?.thread.title ?? message, signal);
      return;
    }
    const next = (t?.versions.length ?? 0) + 1;
    await replay(
      retarget(KitStreamSchema.parse(kitSample), threadId, next, true),
      onEvent,
      { kind: "refine", threadId, message },
      t?.thread.title ?? message.slice(0, 60),
      signal,
    );
  },
};
