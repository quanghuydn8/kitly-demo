// Seller screen side panels: KPI strip, frequently-needed-together combos, top needs by event (simple bars).
import { categoryById } from "@/contract";
import type { InsightsResponse } from "@/contract/types";
import { EVENT_LABELS } from "@/lib/client/events";
import { barWidths, sellerKpis } from "@/lib/client/seller-view";

export function KpiStrip({ insights }: { insights: InsightsResponse }) {
  const k = sellerKpis(insights);
  const up = k.unmetThisWeek > k.unmetLastWeek;
  const tiles = [
    { label: "Unmet needs this week", value: String(k.unmetThisWeek), testId: "kpi-unmet" },
    { label: "Total searches this week", value: String(k.searchesThisWeek), testId: "kpi-searches" },
    { label: "Unmet vs last week", value: k.trend, testId: "kpi-trend", sub: `${k.unmetLastWeek} last week` },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl bg-white p-3 shadow-sm">
          <div className="text-[11px] leading-tight text-gray-500">{t.label}</div>
          <div
            data-testid={t.testId}
            className={`mt-1 text-xl font-bold sm:text-2xl ${
              t.testId === "kpi-trend" && up ? "text-emerald-600" : "text-gray-800"
            }`}
          >
            {t.value}
          </div>
          {t.sub && <div className="text-[11px] text-gray-400">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

const label = (id: string) => categoryById(id)?.label ?? id;

export function CombosPanel({ combos }: { combos: InsightsResponse["combos"] }) {
  const w = barWidths(combos.map((c) => c.count));
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" data-testid="combos">
      <h2 className="text-sm font-semibold text-gray-800">Frequently needed together</h2>
      <p className="text-xs text-gray-400">Marketplace-wide, this week</p>
      {combos.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">No combos yet.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {combos.map((c, i) => (
            <li key={c.categories.join("+")} className="text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-gray-700">{c.categories.map(label).join(" + ")}</span>
                <span className="shrink-0 font-semibold text-gray-800">{c.count}</span>
              </div>
              <div className="mt-0.5 h-1.5 rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full bg-blue-400" style={{ width: `${w[i]}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TopNeedsPanel({ topNeeds }: { topNeeds: InsightsResponse["topNeeds"] }) {
  const w = barWidths(topNeeds.map((n) => n.count));
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm" data-testid="top-needs">
      <h2 className="text-sm font-semibold text-gray-800">Top needs by event</h2>
      <p className="text-xs text-gray-400">Kitly searches this week</p>
      <ul className="mt-2 space-y-2">
        {topNeeds.map((n, i) => (
          <li key={n.event} className="text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-gray-700">{EVENT_LABELS[n.event]}</span>
              <span className="font-semibold text-gray-800">{n.count}</span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-gray-100">
              <div className="h-1.5 rounded-full bg-[var(--accent)]" style={{ width: `${w[i]}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
