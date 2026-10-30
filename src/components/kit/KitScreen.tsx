"use client";
// Kitly screen (T11, D30/D31): history sidebar · chat · kit panel. Owns the data: loads the thread, runs new kits
// and refines over SSE, answers clarify with adjust set_budget, restores versions, re-prices swaps. On a new kit the
// URL becomes /kit/t/<threadId> (history.replaceState: no remount, the stream keeps going) when `plan` arrives.
// Mobile (< md): sidebar in a drawer, Chat / Kit tabs.
// T15 edits: ✕ / Undo / inline budget+deadline → POST /api/kit/adjust (new version); Add anyway / take out / Fit to
// budget / its Undo → POST /api/kit/price (selection saved on the latest version, so a reload keeps it).
// T17: answer turns (thread.messages) in the chat, follow-up pills (swap ⇒ price + a local "⚙ Switched … · Undo"
// turn; other ⇒ refine), the 💛 card's Switch to this (price + Undo), "Deliver to" from the THREAD's persona.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import type {
  BasketOption,
  FitSuggestion,
  FollowUp,
  KitChange,
  KitSelection,
  KitStreamEvent,
  KitThreadSummary,
  KitVersion,
  Profile,
  ThreadResponse,
} from "@/contract";
import { kitApi } from "@/lib/client/kit-api";
import { applyEvent, panelVersions as withRunVersion, runSummary, startRun, type RunRequest, type RunState } from "@/lib/client/kit-run";
import { switchedText, type LocalTurn } from "@/lib/client/kit-chat";
import { deliverTo } from "@/lib/client/persona";
import { usePersona } from "@/lib/client/persona-store";
import { useCart } from "@/lib/client/cart-store";
import { withFit, withoutPick, withPick } from "@/lib/client/kit-edits";
import { ChatColumn } from "./ChatColumn";
import { KitPanel } from "./KitPanel";
import { HistorySidebar } from "./HistorySidebar";

type Load = "idle" | "loading" | "notfound" | "error";

/** DEMO_TODAY + the wall-clock time of day (same rule as the server's demoNowIso), for relative dates only. */
function demoNow(demoToday: string): string {
  return demoToday + new Date().toISOString().slice(10);
}

const hasEdits = (s: KitSelection | null) => !!s && (Object.keys(s.picks).length > 0 || s.dropped.length > 0);

/** The title of `productId` anywhere in a version's options (line, alternative, closest, cart interest). */
function productTitle(v: KitVersion | undefined, productId: string): string {
  for (const o of v?.options ?? []) {
    for (const l of o.lines) {
      if (l.product.id === productId) return l.product.title;
      const a = l.alternatives.find((x) => x.product.id === productId);
      if (a) return a.product.title;
    }
    const c = o.noMatch.find((n) => n.closest?.candidate.product.id === productId);
    if (c) return c.closest!.candidate.product.title;
    const i = o.interests?.find((x) => x.candidate.product.id === productId);
    if (i) return i.candidate.product.title;
  }
  return productId;
}

/** Undo for the last price edit (Fit to budget, 💛 switch, follow-up swap); key = `${version}:${profile}`. */
interface PriceUndo {
  key: string;
  selection: KitSelection;
  text: string;
  /** The local chat turn whose Undo this is (follow-up swap). */
  turnId?: string;
}

export function KitScreen({ threadId: initialThreadId, initialQuery, demoToday }: { threadId?: string; initialQuery?: string; demoToday: string }) {
  const api = useMemo(kitApi, []);
  const router = useRouter();
  const pathname = usePathname();
  const { add } = useCart();
  const persona = usePersona();

  const [threads, setThreads] = useState<KitThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string | null>(initialThreadId ?? null);
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [load, setLoad] = useState<Load>(initialThreadId ? "loading" : "idle");
  const [run, setRun] = useState<RunState | null>(null);
  const [summaries, setSummaries] = useState<Record<number, string>>({});
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [overrides, setOverrides] = useState<Record<string, BasketOption>>({});
  const [selection, setSelection] = useState<KitSelection | null>(null);
  /** The selection before the last Fit to budget / cart switch, for its Undo. */
  const [priceUndo, setPriceUndo] = useState<PriceUndo | null>(null);
  /** Follow-up swaps made in this page view (no saved turn), per thread. */
  const [localTurns, setLocalTurns] = useState<(LocalTurn & { threadId: string })[]>([]);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "kit">("chat");
  const [drawer, setDrawer] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const started = useRef(false);

  const refreshThreads = useCallback(() => {
    api.listThreads().then(setThreads, () => {});
  }, [api]);

  /** Re-price a saved selection so a reload shows the buyer's swaps (totals come from the server). */
  const restoreSelection = useCallback(
    (id: string, latest: KitVersion | undefined) => {
      setSelection(latest?.selection ?? null);
      if (!latest || !hasEdits(latest.selection)) return;
      const sel = latest.selection!;
      api.price(id, sel).then(
        (option) => setOverrides((o) => ({ ...o, [`${latest.version}:${sel.profile}`]: option })),
        () => {},
      );
    },
    [api],
  );

  const loadThread = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const t = await api.getThread(id);
        if (!t) {
          setLoad("notfound");
          return false;
        }
        setThread(t);
        setLoad("idle");
        setRun(null);
        restoreSelection(id, t.versions[t.versions.length - 1]);
        return true;
      } catch {
        setLoad("error");
        return false;
      }
    },
    [api, restoreSelection],
  );

  const execute = useCallback(
    (request: RunRequest) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      let current = startRun(request);
      setRun(current);
      setViewVersion(null);
      setEditError(null);
      const onEvent = (e: KitStreamEvent) => {
        if (controller.signal.aborted) return;
        current = applyEvent(current, e);
        setRun(current);
        if (e.event === "plan" && request.kind === "new") {
          setThreadId(e.data.threadId);
          window.history.replaceState(null, "", `/kit/t/${e.data.threadId}`);
          refreshThreads();
        }
        if (e.event === "done") {
          const summary = runSummary(current);
          const v = current.version;
          if (v !== null && summary) setSummaries((s) => ({ ...s, [v]: summary }));
          setThreadId(e.data.threadId);
          void loadThread(e.data.threadId).then((ok) => {
            // Keep showing the finished run if the saved thread cannot be read back.
            if (!ok) setLoad("idle");
          });
          refreshThreads();
        }
        if (e.event === "error") refreshThreads();
      };
      void (request.kind === "new"
        ? api.runKit(request.query, onEvent, controller.signal)
        : api.refineKit(request.threadId, request.message, onEvent, controller.signal));
    },
    [api, loadThread, refreshThreads],
  );

  // First load: history + the thread (or a new kit from ?q=).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    refreshThreads();
    if (initialThreadId) void loadThread(initialThreadId);
    else if (initialQuery?.trim()) execute({ kind: "new", query: initialQuery.trim() });
  }, [initialThreadId, initialQuery, execute, loadThread, refreshThreads]);

  // "+ New kit" while this page already turned into /kit/t/<id> via replaceState: same route, so reset in place.
  useEffect(() => {
    if (pathname === "/kit/new" && threadId && !initialThreadId && run?.status !== "running") {
      abortRef.current?.abort();
      setThreadId(null);
      setThread(null);
      setRun(null);
      setSummaries({});
      setOverrides({});
      setSelection(null);
      setViewVersion(null);
      setPriceUndo(null);
    }
    // only react to navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const savedVersions = thread?.versions ?? [];
  const panelVersions = withRunVersion(savedVersions, run);
  const provisional = panelVersions.length > savedVersions.length;
  const streaming = run?.status === "running";
  const busy = streaming || editBusy;
  const activeThreadId = thread?.thread.id ?? run?.threadId ?? threadId;

  const appendVersion = (v: KitVersion) => {
    setThread((t) =>
      t
        ? { ...t, versions: [...t.versions.filter((x) => x.version !== v.version), v], thread: { ...t.thread, versionCount: v.version } }
        : t,
    );
    setRun(null);
    setViewVersion(null);
    setSelection(null);
    setPriceUndo(null);
  };

  const edit = async (fn: () => Promise<void>) => {
    setEditBusy(true);
    setEditError(null);
    try {
      await fn();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "That change did not go through. Your kit is unchanged.");
    } finally {
      setEditBusy(false);
    }
  };

  const onSend = (text: string) => {
    if (activeThreadId && (thread || run?.threadId)) execute({ kind: "refine", threadId: activeThreadId, message: text });
    else execute({ kind: "new", query: text });
  };

  const onChooseBudget = (budget: number | null) => {
    const id = activeThreadId;
    if (!id) return;
    void edit(async () => {
      if (!thread) await loadThread(id);
      const v = await api.adjust(id, { type: "set_budget", budget });
      appendVersion(v);
      refreshThreads();
    });
  };

  /** adjust → new version (chat gets the ⚙ system line). */
  const adjust = (change: KitChange) => {
    const id = activeThreadId;
    if (!id) return;
    void edit(async () => {
      appendVersion(await api.adjust(id, change));
      refreshThreads();
    });
  };

  const onRestore = (version: number) => adjust({ type: "restore_version", version });

  /** Re-price `next` on the server; the panel shows the returned option. `undo` = keep the old selection for Undo. */
  const price = (version: number, next: KitSelection, undo?: Omit<PriceUndo, "key">, onFail?: () => void) => {
    const id = activeThreadId;
    if (!id) return;
    void edit(async () => {
      try {
        const option = await api.price(id, next);
        setOverrides((o) => ({ ...o, [`${version}:${next.profile}`]: option }));
        setSelection(next);
        setPriceUndo(undo ? { ...undo, key: `${version}:${next.profile}` } : null);
      } catch (e) {
        onFail?.();
        throw e;
      }
    });
  };
  const before = (profile: Profile): KitSelection => (selection?.profile === profile ? selection : { profile, picks: {}, dropped: [] });

  const onSwap = (version: number, profile: Profile, itemKey: string, productId: string) =>
    price(version, withPick(selection, profile, itemKey, productId));
  const onAddAnyway = onSwap;
  const onTakeOut = (version: number, profile: Profile, itemKey: string) => price(version, withoutPick(selection, profile, itemKey));
  const onFit = (version: number, profile: Profile, fit: FitSuggestion) =>
    price(version, withFit(selection, profile, fit), { selection: before(profile), text: "Basket edited to fit your budget." });
  const onUndoPrice = () => {
    if (!priceUndo) return;
    price(Number(priceUndo.key.split(":")[0]), priceUndo.selection);
  };
  /** 💛 card: the cart product becomes the item's pick (D40). */
  const onSwitchInterest = (version: number, profile: Profile, itemKey: string, productId: string) => {
    const v = savedVersions.find((x) => x.version === version);
    const text = `${switchedText(itemKey, productTitle(v, productId))}.`;
    price(version, withPick(selection, profile, itemKey, productId), { selection: before(profile), text });
  };
  /** Follow-up swap pill: no AI — the pill text as a user bubble, then a price call and "⚙ Switched … · Undo". */
  const onFollowUpSwap = (text: string, action: NonNullable<FollowUp["suggestions"][number]["action"]>) => {
    const latest = savedVersions[savedVersions.length - 1];
    const id = activeThreadId;
    if (!latest || !id) return;
    const profile: Profile = selection?.profile ?? "balanced";
    const turnId = `swap-${Date.now().toString(36)}`;
    const systemText = switchedText(action.itemKey, productTitle(latest, action.productId));
    setLocalTurns((t) => [...t, { id: turnId, threadId: id, createdAt: demoNow(demoToday), userText: text, systemText, undoable: true }]);
    price(latest.version, withPick(selection, profile, action.itemKey, action.productId), { selection: before(profile), text: `${systemText}.`, turnId }, () =>
      setLocalTurns((t) => t.map((x) => (x.id === turnId ? { ...x, systemText: "That switch did not go through. Your kit is unchanged." } : x))),
    );
  };

  const onAddToCart = (option: BasketOption) => {
    for (const l of option.lines) {
      add({ productId: l.product.id, title: l.product.title, category: l.product.category, price: l.product.price, quantity: l.quantity, shop: l.shop });
    }
    router.push("/cart");
  };

  const onRetry = () => {
    if (run) execute(run.request);
  };

  const nowIso = demoNow(demoToday);
  // "Deliver to" follows the thread's persona (a new kit's is the current cookie persona).
  const threadPersonaId = thread?.thread.persona ?? persona?.current?.persona.id ?? null;
  const threadAddress = threadPersonaId ? deliverTo(persona?.known[threadPersonaId]) : null;

  if (load === "notfound" || load === "error") {
    return (
      <div className="flex h-full">
        <div className="hidden md:block">
          <HistorySidebar threads={threads} activeId={null} nowIso={nowIso} collapsible />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <h1 className="text-lg font-semibold">{load === "notfound" ? "Kit not found" : "Could not load this kit"}</h1>
          <p className="text-sm text-gray-500">
            {load === "notfound" ? "This kit does not exist or was made in another browser." : "Check your connection and try again."}
          </p>
          <Link href="/kit/new" className="rounded-lg bg-[var(--kitly-accent)] px-4 py-2 text-sm font-medium text-white">
            New kit
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Mobile bar: drawer toggle + Chat / Kit tabs */}
      <div className="flex items-center gap-2 border-b bg-white px-3 py-2 md:hidden">
        <button type="button" aria-label="Open history" onClick={() => setDrawer(true)} className="rounded p-1.5 hover:bg-gray-100">
          <Menu aria-hidden className="h-5 w-5" />
        </button>
        <div role="tablist" aria-label="View" className="flex flex-1 rounded-lg bg-gray-100 p-0.5 text-sm">
          {(["chat", "kit"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={mobileTab === t}
              onClick={() => setMobileTab(t)}
              className={`flex-1 rounded-md py-1 ${mobileTab === t ? "bg-white font-medium shadow-sm" : "text-gray-600"}`}
            >
              {t === "chat" ? "Chat" : "Kit"}
            </button>
          ))}
        </div>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="relative h-full bg-white shadow-xl">
            <HistorySidebar threads={threads} activeId={activeThreadId} nowIso={nowIso} onNavigate={() => setDrawer(false)} />
            <button type="button" aria-label="Close history" onClick={() => setDrawer(false)} className="absolute right-2 top-14 rounded p-1 hover:bg-gray-100">
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <button type="button" aria-label="Close history" className="flex-1 bg-black/30" onClick={() => setDrawer(false)} />
        </div>
      )}

      <div className="hidden md:block">
        <HistorySidebar threads={threads} activeId={activeThreadId} nowIso={nowIso} collapsible />
      </div>

      <section
        aria-label="Chat"
        className={`min-h-0 flex-1 border-r bg-gray-50 md:block md:max-w-[460px] md:flex-[2] ${mobileTab === "chat" ? "block" : "hidden"}`}
      >
        {load === "loading" ? (
          <p className="p-6 text-center text-sm text-gray-400">Loading your kit…</p>
        ) : (
          <ChatColumn
            messages={thread?.messages ?? []}
            localTurns={localTurns
              .filter((t) => t.threadId === activeThreadId)
              .map((t) => ({ ...t, undoable: !!priceUndo && priceUndo.turnId === t.id }))}
            onFollowUpSwap={onFollowUpSwap}
            onUndoLocal={onUndoPrice}
            versions={savedVersions}
            run={run}
            summaries={summaries}
            busy={busy}
            onSend={onSend}
            onChooseBudget={onChooseBudget}
            onRetry={onRetry}
            onRestoreItem={(itemKey) => adjust({ type: "restore_item", itemKey })}
          />
        )}
      </section>

      <section aria-label="Kit" className={`min-h-0 flex-1 bg-gray-50 md:block md:flex-[3] ${mobileTab === "kit" ? "block" : "hidden"}`}>
        <KitPanel
          versions={panelVersions}
          viewVersion={viewVersion}
          onViewVersion={setViewVersion}
          onRestore={onRestore}
          overrides={overrides}
          onSwap={onSwap}
          onAddToCart={onAddToCart}
          building={streaming && !provisional}
          busy={busy}
          error={editError}
          onRemoveItem={(itemKey) => adjust({ type: "remove_item", itemKey })}
          onAddAnyway={onAddAnyway}
          onTakeOut={onTakeOut}
          onFit={onFit}
          onUndoFit={onUndoPrice}
          fitUndoKey={priceUndo?.key ?? null}
          undoText={priceUndo?.text}
          onSwitchInterest={onSwitchInterest}
          activeProfile={selection?.profile ?? null}
          deliverTo={threadAddress}
          onSetBudget={(budget) => adjust({ type: "set_budget", budget })}
          onSetDeadline={(deadline) => adjust({ type: "set_deadline", deadline })}
        />
      </section>
    </div>
  );
}
