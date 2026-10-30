"use client";
// Seller Intelligence screen (T12): shop selector (All shops + each shop, default from ?shop=), live strip, KPI strip,
// gap cards in API order (never re-sorted here), combos + top needs by event, Refresh, and the listing-fix flow
// (Preview fix → drawer → Apply → toast; Undo). After Apply/Undo the insights are RE-FETCHED: the "Fixed · Undo" state
// comes from `gap.appliedFix`, so it is the same after a reload. Insights re-fetch every 10 s while the tab is visible.
// "Back to buyer" (T13) → /kit, the buyer's latest kit (Beat 4 starts there with + New kit).
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Loader2, RefreshCw, Store } from "lucide-react";
import { categoryById, EVENTS, type EnrichmentPreviewResponse, type InsightsResponse, type Shop } from "@/contract";
import { sellerApi } from "@/lib/client/seller-api";
import { demoNowMs, kpis } from "@/lib/client/seller-text";
import { formatCount } from "@/lib/client/format";
import { GapCard } from "./GapCard";
import { LiveStrip } from "./LiveStrip";
import { PreviewDrawer } from "./PreviewDrawer";

const POLL_MS = 10_000;
const ALL = "all";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function SellerScreen({ initialShopId, demoToday }: { initialShopId: string | null; demoToday: string }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState<string | null>(initialShopId);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ p: EnrichmentPreviewResponse; needLabel: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => demoNowMs(demoToday, Date.now()));
  const seq = useRef(0);

  useEffect(() => {
    sellerApi.listShops().then(setShops, () => {});
  }, []);

  /** Latest request wins: a slow response for a previous shop never overwrites the current one. */
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await sellerApi.insights(shopId);
      if (mine !== seq.current) return;
      setData(r);
      setError(null);
      setNow(demoNowMs(demoToday, Date.now()));
    } catch (e) {
      if (mine === seq.current) setError(message(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [shopId, demoToday]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const chooseShop = (value: string) => {
    const id = value === ALL ? null : value;
    setShopId(id);
    setData(null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("shop", id);
    else url.searchParams.delete("shop");
    window.history.replaceState(null, "", url);
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setToast(message(e));
    } finally {
      setBusy(false);
    }
  };

  const openPreview = (productId: string, gapKey: string) =>
    run(async () => {
      const p = await sellerApi.preview(productId, gapKey);
      setPreview({ p, needLabel: data?.gaps.find((g) => g.key === gapKey)?.needLabel ?? "" });
    });

  const apply = () =>
    run(async () => {
      if (!preview) return;
      try {
        await sellerApi.apply(preview.p.proposalId);
        setToast(`Listing updated — buyers looking for “${preview.needLabel}” can now find it`);
      } finally {
        // Applied, expired (404) or changed (409): the drawer is stale either way; the API decides the card state.
        setPreview(null);
        await load();
      }
    });

  const undo = (productId: string) =>
    run(async () => {
      try {
        await sellerApi.undo(productId);
        setToast("Fix undone — the original listing is back");
      } finally {
        await load();
      }
    });

  const k = data ? kpis(data) : null;
  const maxCombo = Math.max(1, ...(data?.combos.map((c) => c.count) ?? []));
  const maxNeed = Math.max(1, ...(data?.topNeeds.map((t) => t.count) ?? []));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex flex-1 items-center gap-2 text-xl font-bold text-gray-900">
          <BarChart3 aria-hidden className="h-6 w-6 text-[var(--kitly-accent)]" />
          Seller Intelligence
        </h1>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <Store aria-hidden className="h-4 w-4" />
          <span className="sr-only">Shop</span>
          <select
            aria-label="Shop"
            value={shopId ?? ALL}
            onChange={(e) => chooseShop(e.target.value)}
            className="rounded-lg border bg-white px-2 py-1.5 text-sm text-gray-900"
          >
            <option value={ALL}>All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {shopId && !shops.some((s) => s.id === shopId) && <option value={shopId}>{shopId}</option>}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw aria-hidden className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <Link
          href="/kit"
          className="flex items-center gap-1.5 rounded-lg bg-[var(--kitly-accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          Back to buyer
        </Link>
      </div>

      <LiveStrip recent={data?.recent ?? (error ? [] : null)} now={now} />

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span className="flex-1">Could not load insights: {error}</span>
          <button type="button" onClick={() => void load()} className="font-medium underline">
            Retry
          </button>
        </div>
      )}

      {!data && !error && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          Loading insights…
        </p>
      )}

      {data && k && (
        <>
          <section aria-label="This week" className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Unmet needs this week" value={formatCount(k.unmetThisWeek)} />
            <Kpi label="Kit searches this week" value={formatCount(k.searchesThisWeek)} />
            <Kpi
              label="Unmet trend vs last week"
              value={k.trend.text}
              tone={k.trend.dir === "up" ? "text-emerald-600" : k.trend.dir === "down" ? "text-red-600" : "text-gray-700"}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
            <section aria-label="Unmet demand" className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">Unmet demand</h2>
              {data.gaps.length === 0 ? (
                <p className="rounded-xl border bg-white px-4 py-6 text-center text-sm text-gray-400">
                  No unmet needs with 3+ buyers this week.
                </p>
              ) : (
                data.gaps.map((g) => <GapCard key={g.key} gap={g} busy={busy} onPreview={openPreview} onUndo={undo} />)
              )}
            </section>

            <aside className="space-y-4">
              <section aria-label="Bought together" className="rounded-xl border bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold text-gray-700">Needed together (marketplace)</h2>
                {data.combos.length === 0 ? (
                  <p className="text-xs text-gray-400">No combos yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.combos.map((c) => (
                      <Bar
                        key={c.categories.join("+")}
                        label={c.categories.map((id) => categoryById(id)?.label ?? id).join(" + ")}
                        count={c.count}
                        max={maxCombo}
                      />
                    ))}
                  </ul>
                )}
              </section>
              <section aria-label="Top needs by event" className="rounded-xl border bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold text-gray-700">Top needs by event</h2>
                {data.topNeeds.length === 0 ? (
                  <p className="text-xs text-gray-400">No kit searches this week.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.topNeeds.map((t) => (
                      <Bar key={t.event} label={t.event === "other" ? "Other" : EVENTS[t.event].label} count={t.count} max={maxNeed} />
                    ))}
                  </ul>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      {preview && <PreviewDrawer preview={preview.p} busy={busy} onApply={apply} onClose={() => setPreview(null)} />}

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-40 max-w-[90vw] -translate-x-1/2 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "text-gray-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  return (
    <li className="text-xs">
      <div className="mb-0.5 flex justify-between gap-2 text-gray-700">
        <span className="min-w-0 truncate">{label}</span>
        <span className="font-medium">{count}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100">
        <div className="h-1.5 rounded-full bg-[var(--kitly-accent)]" style={{ width: `${Math.round((count / max) * 100)}%` }} />
      </div>
    </li>
  );
}
