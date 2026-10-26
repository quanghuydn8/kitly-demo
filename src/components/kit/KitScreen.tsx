"use client";
// /kit hero screen: need → timeline → plan → basket (+ swap) → totals → explanation → refine → add kit to cart.
// One reducer (kit-state) consumes events from kit-source (live SSE or mock replay).
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { PackageSearch, ShoppingCart, Sparkles, XCircle } from "lucide-react";
import type { BasketOption, KitPlan } from "@/contract/types";
import { cartStore } from "@/lib/client/cart-store";
import { kitToCartItems, swapAlternative } from "@/lib/client/kit-basket";
import { KIT_MOCK, runKit, type KitRun } from "@/lib/client/kit-source";
import { initialKitState, kitReducer, resultView } from "@/lib/client/kit-state";
import { rememberKitQuery } from "@/lib/client/last-query";
import { sellerApi } from "@/lib/client/seller-api";
import { Basket } from "./Basket";
import { ExplanationPanel } from "./ExplanationPanel";
import { KitResultSkeleton } from "./KitResultSkeleton";
import { NeedForm } from "./NeedForm";
import { PlanCard } from "./PlanCard";
import { RefineBox } from "./RefineBox";
import { Timeline } from "./Timeline";
import { TotalsPanel } from "./TotalsPanel";

const notifyMe = (gapKey: string) => sellerApi().watch(gapKey);

const PROFILE_LABEL = { saver: "Saver", balanced: "Balanced", premium: "Premium" } as const;

export function KitScreen() {
  const router = useRouter();
  const q = useSearchParams().get("q") ?? "";
  const [state, dispatch] = useReducer(kitReducer, initialKitState);
  const [tab, setTab] = useState(0);
  // Client-side swaps, valid only for the options array they were made on.
  const [edited, setEdited] = useState<{ src: BasketOption[]; opts: BasketOption[] } | null>(null);
  const [previousPlan, setPreviousPlan] = useState<KitPlan | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRun = useRef<KitRun | null>(null);
  const lastQ = useRef<string | null>(null);

  const start = useCallback((run: KitRun) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    lastRun.current = run;
    if (run.kind === "kit") rememberKitQuery(run.body.query);
    setEdited(null);
    dispatch({ type: "start", refine: run.kind === "refine" });
    runKit(run, (event) => dispatch({ type: "event", event }), ac.signal).catch((e: unknown) => {
      if (ac.signal.aborted) return;
      dispatch({ type: "failed", message: e instanceof Error ? e.message : "Something went wrong" });
    });
  }, []);

  // The URL (?q=) is the single trigger for a fresh run: header search, chips and the form all route through it.
  useEffect(() => {
    if (!q || q === lastQ.current) return;
    lastQ.current = q;
    setPreviousPlan(null);
    setTab(0);
    start({ kind: "kit", body: { query: q } });
  }, [q, start]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function runNeed(query: string) {
    if (query === q) {
      lastQ.current = query;
      start({ kind: "kit", body: { query } });
    } else router.replace(`/kit?q=${encodeURIComponent(query)}`, { scroll: false });
  }

  function refine(message: string) {
    if (!state.sessionId || !state.plan) return;
    setPreviousPlan(state.plan);
    start({ kind: "refine", body: { sessionId: state.sessionId, previousPlan: state.plan, message } });
  }

  const options = edited && edited.src === state.options ? edited.opts : state.options;
  const current = options[Math.min(tab, options.length - 1)] as BasketOption | undefined;
  const running = state.status === "running";
  const view = resultView(state, Boolean(q));

  function swap(itemKey: string, altIndex: number) {
    const i = Math.min(tab, options.length - 1);
    const next = options.map((o, j) => (j === i ? swapAlternative(o, itemKey, altIndex, state.plan?.budget ?? null) : o));
    setEdited({ src: state.options, opts: next });
  }

  function addKitToCart() {
    if (!current || current.lines.length === 0) return;
    cartStore.addMany(kitToCartItems(current));
    router.push("/cart");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[var(--accent)]" />
        <h1 className="text-lg font-semibold text-gray-800">Kitly — tell us your need, get the whole kit</h1>
        {KIT_MOCK && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">mock replay</span>}
      </div>
      <NeedForm initial={q} running={running} onRun={runNeed} />

      {/* With ?q= the timeline shows from the first frame, before the effect starts the run. */}
      {view !== "none" && (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Timeline
              steps={state.steps}
              error={state.error}
              onRetry={lastRun.current ? () => start(lastRun.current!) : undefined}
            />
            {state.plan && <PlanCard plan={state.plan} />}
          </aside>

          <div className={`min-w-0 space-y-4 ${state.refining ? "opacity-50" : ""}`}>
            {options.length > 1 && (
              <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm" role="tablist">
                {options.map((o, i) => (
                  <button
                    key={o.profile}
                    role="tab"
                    aria-selected={i === tab}
                    onClick={() => setTab(i)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-sm ${
                      i === tab ? "bg-[var(--accent)] font-semibold text-white" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {PROFILE_LABEL[o.profile]}
                  </button>
                ))}
              </div>
            )}
            {view === "skeleton" && <KitResultSkeleton />}
            {view === "empty" && (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
                <PackageSearch className="h-6 w-6 text-gray-400" />
                Kitly could not build a basket for this need. Try describing it differently, or add a budget and a
                date.
              </div>
            )}
            {view === "error" && (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
                <XCircle className="h-6 w-6 text-red-400" />
                No basket this time — {state.error?.message ?? "something went wrong"}. Use Retry on the left.
              </div>
            )}
            {view === "basket" && current && (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="min-w-0 space-y-3">
                  <Basket
                    option={current}
                    plan={state.plan}
                    diff={state.diff}
                    previousPlan={previousPlan}
                    onSwap={running ? undefined : swap}
                    onNotify={notifyMe}
                  />
                  {state.sessionId && state.plan && <RefineBox disabled={running} onRefine={refine} />}
                </div>
                <div className="space-y-4">
                  <TotalsPanel option={current} budget={state.plan?.budget ?? null} />
                  {current.lines.length > 0 && (
                    <>
                    <button
                      type="button"
                      onClick={addKitToCart}
                      disabled={running || current.lines.length === 0}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 font-semibold text-white shadow-sm disabled:opacity-50"
                    >
                      <ShoppingCart className="h-5 w-5" /> Add kit to cart
                    </button>
                    <p className="-mt-2 text-center text-xs text-gray-400">
                      The cart shows list prices; Kitly&apos;s voucher savings are listed above.
                    </p>
                    </>
                  )}
                  <ExplanationPanel
                    text={state.explanation}
                    streaming={running && state.steps.some((s) => s.id === "explain" && s.status === "running")}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
