"use client";
// /seller: shop selector (?shop=), KPI strip, unmet-demand gap cards with the listing-fix flow
// (Preview fix → drawer → Apply → "Fixed: Undo"), combos and top needs, Refresh (counts after live kit runs).
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import type { EnrichmentPreviewResponse, InsightsResponse, Shop } from "@/contract/types";
import { formatShortDate } from "@/lib/client/format";
import { sellerApi } from "@/lib/client/seller-api";
import { FixDrawer } from "./FixDrawer";
import { GapCard, type FixedListing } from "./GapCard";
import { CombosPanel, KpiStrip, TopNeedsPanel } from "./InsightPanels";

type Toast = { kind: "ok" | "error"; text: string } | null;
type Drawer = { gapKey: string; preview: EnrichmentPreviewResponse; applying: boolean; error: string | null };

const msg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function SellerScreen() {
  const api = useMemo(() => sellerApi(), []);
  const router = useRouter();
  const shopId = useSearchParams().get("shop") || "all";

  const [shops, setShops] = useState<Shop[]>([]);
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Applied fixes by gap key; kept across shop switches and refreshes so Undo stays reachable.
  const [fixed, setFixed] = useState<Record<string, FixedListing>>({});
  const [busyGap, setBusyGap] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const reqId = useRef(0);

  useEffect(() => {
    api.shops().then(setShops, () => setShops([]));
  }, [api]);

  const load = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    api.insights(shopId).then(
      (d) => id === reqId.current && (setData(d), setLoading(false)),
      (e: unknown) => id === reqId.current && (setError(msg(e)), setLoading(false)),
    );
  }, [api, shopId]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  async function preview(gapKey: string, productId: string) {
    setBusyGap(gapKey);
    try {
      setDrawer({ gapKey, preview: await api.preview(productId, gapKey), applying: false, error: null });
    } catch (e) {
      setToast({ kind: "error", text: `Preview failed: ${msg(e)}` });
    } finally {
      setBusyGap(null);
    }
  }

  async function apply() {
    if (!drawer) return;
    setDrawer({ ...drawer, applying: true, error: null });
    try {
      const product = await api.apply(drawer.preview.proposalId);
      setFixed((f) => ({ ...f, [drawer.gapKey]: { productId: product.id, title: product.title } }));
      setDrawer(null);
      setToast({ kind: "ok", text: "Listing updated — buyers with this need can now find it." });
    } catch (e) {
      setDrawer({ ...drawer, applying: false, error: msg(e) });
    }
  }

  async function undo(gapKey: string, productId: string) {
    setBusyGap(gapKey);
    try {
      await api.undo(productId);
      setFixed((f) => {
        const next = { ...f };
        delete next[gapKey];
        return next;
      });
      setToast({ kind: "ok", text: "Undone — the original listing is back." });
    } catch (e) {
      setToast({ kind: "error", text: `Undo failed: ${msg(e)}` });
    } finally {
      setBusyGap(null);
    }
  }

  const shopName = shopId === "all" ? "All shops" : (shops.find((s) => s.id === shopId)?.name ?? shopId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <BarChart3 className="h-5 w-5 text-[var(--accent)]" />
        <h1 className="text-lg font-semibold text-gray-800">Seller Intelligence</h1>
        <span className="text-sm text-gray-500">· what buyers needed and could not find</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            aria-label="Shop"
            value={shopId}
            onChange={(e) =>
              router.replace(`/seller?shop=${encodeURIComponent(e.target.value)}`, { scroll: false })
            }
            className="max-w-[60vw] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="all">All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {shopId !== "all" && !shops.some((s) => s.id === shopId) && (
              <option value={shopId}>{shopId}</option>
            )}
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {data && (
        <p className="text-xs text-gray-500">
          {`${shopName} · this week ${formatShortDate(data.window.thisWeekFrom)} – ${formatShortDate(
            data.window.today,
          )}, compared with the week from ${formatShortDate(data.window.lastWeekFrom)}`}
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          <XCircle className="h-4 w-4" /> Could not load insights: {error}
          <button type="button" onClick={load} className="ml-auto font-medium underline">
            Retry
          </button>
        </div>
      )}

      {!data && loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl bg-white p-10 text-sm text-gray-400 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading this week&apos;s buyer needs and checking
          listings…
        </div>
      )}

      {data && (
        <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          <KpiStrip insights={data} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 space-y-3" aria-label="Unmet demand">
              <h2 className="text-sm font-semibold text-gray-800">Unmet demand</h2>
              {data.gaps.length === 0 && (
                <p className="rounded-2xl bg-white p-4 text-sm text-gray-400 shadow-sm">
                  No unmet needs this week.
                </p>
              )}
              {data.gaps.map((g) => (
                <GapCard
                  key={g.key}
                  gap={g}
                  fixed={fixed[g.key] ?? null}
                  busy={busyGap === g.key}
                  onPreview={(pid) => preview(g.key, pid)}
                  onUndo={(pid) => undo(g.key, pid)}
                />
              ))}
            </section>
            <aside className="space-y-4">
              <CombosPanel combos={data.combos} />
              <TopNeedsPanel topNeeds={data.topNeeds} />
            </aside>
          </div>
        </div>
      )}

      {drawer && (
        <FixDrawer
          preview={drawer.preview}
          applying={drawer.applying}
          error={drawer.error}
          onApply={apply}
          onClose={() => setDrawer(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm text-white shadow-lg ${
            toast.kind === "ok" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.kind === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {toast.text}
        </div>
      )}
    </div>
  );
}
