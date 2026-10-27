// One unmet-demand gap: need, type badge (Listing gap blue / Assortment gap amber), this vs last week ▲%,
// price band, needed-with chips, advice, matching products. Listing gap → candidate + evidence + Preview fix
// (or "Fixed: Undo"); assortment gap → decision support only ("0 shops selling", buyers waiting, no add button).
import { Lightbulb, PackageSearch, Quote, Users } from "lucide-react";
import { categoryById } from "@/contract";
import type { Gap } from "@/contract/types";
import { formatVnd } from "@/lib/client/format";
import { formatTrend, sellingCopy } from "@/lib/client/seller-view";
import { CategoryIcon } from "../CategoryIcon";

export type FixedListing = { productId: string; title: string };

const TYPE = {
  listing_gap: { label: "Listing gap", cls: "bg-blue-100 text-blue-700" },
  assortment_gap: { label: "Assortment gap", cls: "bg-amber-100 text-amber-800" },
} as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function GapCard({
  gap,
  fixed,
  busy = false,
  onPreview,
  onUndo,
}: {
  gap: Gap;
  fixed: FixedListing | null;
  busy?: boolean;
  onPreview: (productId: string) => void;
  onUndo: (productId: string) => void;
}) {
  const t = TYPE[gap.type];
  const trend = formatTrend(gap.thisWeek, gap.lastWeek);
  const up = gap.thisWeek > gap.lastWeek;
  const candidates = gap.candidates ?? [];
  const fixedElsewhere = fixed && !candidates.some((c) => c.productId === fixed.productId);
  const watchers = gap.watchers ?? 0;

  const fixedRow = (f: FixedListing) => (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700">
        Fixed
      </span>
      <span className="min-w-0 flex-1 truncate text-gray-700">{f.title}</span>
      <button
        type="button"
        onClick={() => onUndo(f.productId)}
        disabled={busy}
        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        Undo
      </button>
    </div>
  );

  return (
    <article className="rounded-2xl bg-white p-4 shadow-sm" data-testid={`gap-${gap.key}`}>
      <div className="flex items-start gap-3">
        {gap.category ? (
          <CategoryIcon category={gap.category} className="h-12 w-12 shrink-0" iconClassName="h-6 w-6" />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500"
            role="img"
            aria-label="Not sold on DemoMart yet"
          >
            <PackageSearch className="h-6 w-6" strokeWidth={1.5} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              data-testid="gap-type"
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${t.cls}`}
            >
              {t.label}
            </span>
            {gap.type === "assortment_gap" && watchers > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
                <Users className="h-3 w-3" />
                {`${plural(watchers, "buyer", "buyers")} waiting`}
              </span>
            )}
          </div>
          <h3 className="mt-1 font-semibold text-gray-800">{gap.needLabel}</h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold text-gray-800" data-testid="gap-this-week">
            {gap.thisWeek}
          </div>
          <div
            className="text-[11px] text-gray-500"
            data-testid="gap-last-week"
          >{`this week · ${gap.lastWeek} last week`}</div>
          <div className={`text-xs font-semibold ${up ? "text-emerald-600" : "text-gray-500"}`}>{trend}</div>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        <div className="flex gap-1">
          <dt className="text-gray-500">Price band:</dt>
          <dd className="font-medium text-gray-800" data-testid="gap-price-band">
            {gap.priceBand ? `${formatVnd(gap.priceBand.p25)} – ${formatVnd(gap.priceBand.p75)}` : "—"}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-gray-500">Supply:</dt>
          <dd className="font-medium text-gray-800" data-testid="gap-supply">
            {gap.type === "assortment_gap"
              ? sellingCopy(gap)
              : plural(gap.matchingProducts, "matching product", "matching products")}
          </dd>
        </div>
      </dl>

      {gap.neededWith.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-gray-500">Needed with:</span>
          {gap.neededWith.map((n) => (
            <span key={n.category} className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
              {`${categoryById(n.category)?.label ?? n.category} · ${Math.round(n.share * 100)}%`}
            </span>
          ))}
        </div>
      )}

      {gap.advice && (
        <p className="mt-3 flex gap-1.5 rounded-lg bg-orange-50 p-2 text-sm text-gray-700">
          <Lightbulb className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          <span>{gap.advice}</span>
        </p>
      )}

      {gap.type === "listing_gap" && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {candidates.map((c) =>
            fixed?.productId === c.productId ? (
              <div key={c.productId}>{fixedRow(fixed)}</div>
            ) : (
              <div key={c.productId} className="space-y-1">
                <div className="text-sm font-medium text-gray-800">{c.title}</div>
                <p className="flex gap-1 text-xs text-blue-800">
                  <Quote className="h-3.5 w-3.5 shrink-0" />
                  <span>{`“${c.evidence}”`}</span>
                </p>
                <button
                  type="button"
                  onClick={() => onPreview(c.productId)}
                  disabled={busy}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Working…" : "Preview fix"}
                </button>
              </div>
            ),
          )}
          {fixedElsewhere && fixedRow(fixed)}
        </div>
      )}
      {/* A refresh after Apply can re-classify the gap (the fixed listing is no longer a candidate): keep Undo. */}
      {gap.type === "assortment_gap" && fixed && (
        <div className="mt-3 border-t border-gray-100 pt-3">{fixedRow(fixed)}</div>
      )}
      {gap.type === "assortment_gap" && (
        <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
          Decision support only — stocking a new product is a real-world decision.
        </p>
      )}
    </article>
  );
}
