// One unmet-demand gap (T12): badge (Listing gap blue / Assortment gap amber), weeks + trend, price band, needed with,
// advice, supply line. Listing gap: candidate products with the evidence quote and Preview fix, or — when the API
// says `appliedFix` — "Fixed · Undo" (driven by the API so it survives reloads). Assortment gap: decision support only.
import { BellRing, CheckCircle2, Eye, Undo2 } from "lucide-react";
import { categoryById, type Gap } from "@/contract";
import { formatVnd } from "@/lib/client/format";
import { supplyLine, trendLabel } from "@/lib/client/seller-text";

const TREND_COLOR = { up: "text-emerald-600", down: "text-red-600", flat: "text-gray-500" } as const;

export function GapCard({
  gap: g,
  busy,
  onPreview,
  onUndo,
}: {
  gap: Gap;
  busy: boolean;
  onPreview(productId: string, gapKey: string): void;
  onUndo(productId: string): void;
}) {
  const listing = g.type === "listing_gap";
  const trend = trendLabel(g.thisWeek, g.lastWeek);
  return (
    <article aria-label={g.needLabel} className="space-y-2.5 rounded-xl border bg-white p-4 shadow-sm">
      <header className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 flex-1 font-semibold text-gray-900">{g.needLabel}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${listing ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}
        >
          {listing ? "Listing gap" : "Assortment gap"}
        </span>
      </header>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <span className="text-lg font-bold text-gray-900">{g.thisWeek} this week</span>
        <span className="text-gray-500">{g.lastWeek} last week</span>
        <span className={`font-medium ${TREND_COLOR[trend.dir]}`}>{trend.text}</span>
      </div>

      <dl className="grid gap-1 text-xs text-gray-600 sm:grid-cols-[auto_1fr] sm:gap-x-3">
        <dt className="text-gray-400">Price band</dt>
        <dd>{g.priceBand ? `${formatVnd(g.priceBand.p25)} – ${formatVnd(g.priceBand.p75)}` : "No price hints yet"}</dd>
        {g.neededWith.length > 0 && (
          <>
            <dt className="text-gray-400">Needed with</dt>
            <dd className="flex flex-wrap gap-1">
              {g.neededWith.map((n) => (
                <span key={n.category} className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                  {categoryById(n.category)?.label ?? n.category}
                </span>
              ))}
            </dd>
          </>
        )}
        <dt className="text-gray-400">Supply</dt>
        <dd>{supplyLine(g)}</dd>
      </dl>

      {g.advice && <p className="rounded-lg bg-orange-50 px-3 py-2 text-sm text-gray-800">💡 {g.advice}</p>}

      {!listing && g.watchers !== undefined && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
          <BellRing aria-hidden className="h-4 w-4" />
          {g.watchers === 1 ? "1 buyer waiting" : `${g.watchers} buyers waiting`}
        </p>
      )}

      {listing && g.appliedFix && (
        <p className="flex flex-wrap items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 aria-hidden className="h-4 w-4" />
          <span className="font-medium">Fixed</span>
          <span className="min-w-0 truncate text-emerald-700">· {g.appliedFix.title}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onUndo(g.appliedFix!.productId)}
            className="flex items-center gap-1 font-medium text-[var(--kitly-accent)] hover:underline disabled:opacity-50"
          >
            <Undo2 aria-hidden className="h-3.5 w-3.5" />
            Undo
          </button>
        </p>
      )}

      {listing && !g.appliedFix && (g.candidates ?? []).length > 0 && (
        <ul aria-label="Your listings that could match" className="space-y-2">
          {g.candidates!.map((c) => (
            <li key={c.productId} className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5 text-sm">
              <p className="font-medium text-gray-900">{c.title}</p>
              <blockquote className="mt-1 border-l-2 border-blue-300 pl-2 text-xs italic text-gray-600">“{c.evidence}”</blockquote>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPreview(c.productId, g.key)}
                className="mt-2 flex items-center gap-1 rounded-md bg-[var(--kitly-accent)] px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Eye aria-hidden className="h-3.5 w-3.5" />
                Preview fix
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
