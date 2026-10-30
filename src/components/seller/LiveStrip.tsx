// "Just searched (live)" strip (T12, D35): the newest LIVE unmet needs from insights.recent, newest first,
// with the event colour, a wall-clock age and "Not in catalog" when the need has no category.
import { Radio } from "lucide-react";
import { EVENTS, type InsightsResponse } from "@/contract";
import { agoLabel } from "@/lib/client/seller-text";

type Recent = InsightsResponse["recent"];

export function LiveStrip({ recent, now }: { recent: Recent; now: number }) {
  const rows = [...recent].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section aria-label="Just searched (live)" className="rounded-xl border bg-white px-3 py-2.5">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
        <Radio aria-hidden className="h-4 w-4 animate-pulse text-[var(--kitly-accent)]" />
        Just searched (live)
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No live searches yet — try Kitly</p>
      ) : (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {rows.map((r, i) => {
            const ev = r.event === "other" ? null : EVENTS[r.event];
            return (
              <li key={`${r.createdAt}-${i}`} className="flex shrink-0 items-center gap-1.5 rounded-full border bg-gray-50 px-2.5 py-1 text-xs">
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ev?.color ?? "bg-gray-100 text-gray-600"}`}>
                  {ev?.label ?? "Other"}
                </span>
                <span className="font-medium text-gray-800">{r.needLabel}</span>
                {r.category === null && <span className="rounded bg-gray-200 px-1 text-[10px] text-gray-600">Not in catalog</span>}
                <span className="text-gray-400">{agoLabel(r.createdAt, now)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
