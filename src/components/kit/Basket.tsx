// Kitly basket: one row per plan item (chosen product, reason, quantity, line total, alternatives with swap),
// honest "No suitable product yet" gaps (+ "See seller view →", + "Notify me" when onNotify is given), "Skipped for budget" section,
// refine diff highlights.
import Link from "next/link";
import { ArrowLeftRight, ChevronDown, CircleSlash, MinusCircle, Star } from "lucide-react";
import { gapKeyFor } from "@/contract/gap-key";
import type { BasketLine, BasketOption, KitPlan, PlanDiff } from "@/contract/types";
import { formatShortDate, formatVnd } from "@/lib/client/format";
import { noMatchReason } from "@/lib/client/kit-text";
import { TierBadge, UpdatedBadge } from "../Badges";
import { CategoryIcon } from "../CategoryIcon";
import { NotifyMe } from "./NotifyMe";

type DiffKind = "added" | "changed" | null;

const DIFF_STYLE: Record<"added" | "changed", { row: string; chip: string; label: string }> = {
  added: { row: "ring-2 ring-emerald-400", chip: "bg-emerald-100 text-emerald-700", label: "Added" },
  changed: { row: "ring-2 ring-amber-400", chip: "bg-amber-100 text-amber-700", label: "Changed" },
};

export function Basket({
  option,
  plan,
  diff,
  previousPlan = null,
  onSwap,
  onNotify,
}: {
  option: BasketOption;
  plan: KitPlan | null;
  diff: PlanDiff | null;
  previousPlan?: KitPlan | null;
  onSwap?: (itemKey: string, altIndex: number) => void;
  /** Registers a "Notify me" watch for a gap key, resolves to the new watcher count. */
  onNotify?: (gapKey: string) => Promise<number>;
}) {
  const kindOf = (key: string): DiffKind =>
    diff?.added.includes(key) ? "added" : diff?.changed.includes(key) ? "changed" : null;

  // Rows follow the plan order; anything the plan does not list goes last.
  const order = new Map((plan?.items ?? []).map((i, n) => [i.key, n]));
  const rank = (k: string) => order.get(k) ?? Number.MAX_SAFE_INTEGER;
  const rows = [
    ...option.lines.map((l) => ({ key: l.itemKey, line: l, gap: null })),
    ...option.noMatch.map((g) => ({ key: g.itemKey, line: null, gap: g })),
  ].sort((a, b) => rank(a.key) - rank(b.key));

  // The seller-side gap key of a noMatch row = its plan item's category + must-have tags (T07).
  const gapKeyOf = (k: string) => {
    const item = plan?.items.find((i) => i.key === k);
    return item ? gapKeyFor(item.category, item.mustHaveTags) : null;
  };

  const removedLabel = (k: string) => previousPlan?.items.find((i) => i.key === k)?.needLabel ?? k;

  return (
    <section className="space-y-2" aria-label="Basket" data-testid="basket">
      {diff && diff.removed.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-white p-2.5 text-xs shadow-sm">
          {diff.removed.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-700">
              <MinusCircle className="h-3 w-3" /> Removed: {removedLabel(k)}
            </span>
          ))}
        </div>
      )}
      {rows.map((r) =>
        r.line ? (
          <LineRow key={r.key} line={r.line} diff={kindOf(r.key)} onSwap={onSwap} />
        ) : (
          <div
            key={r.key}
            className={`flex items-start gap-3 rounded-2xl border border-dashed border-gray-300 bg-white/60 p-3 ${
              kindOf(r.key) ? DIFF_STYLE[kindOf(r.key)!].row : ""
            }`}
            data-testid={`nomatch-${r.key}`}
            data-diff={kindOf(r.key) ?? undefined}
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
              <CircleSlash className="h-6 w-6" />
            </div>
            <div className="min-w-0 text-sm">
              <div className="font-medium text-gray-700">{r.gap!.needLabel}</div>
              <div className="text-gray-500">No suitable product yet: {noMatchReason(r.gap!, plan)}</div>
              <div className="mt-0.5 text-xs text-gray-400">
                Kitly never invents a product — sellers see this need.{" "}
                <Link href="/seller?shop=all" className="font-medium text-[var(--accent)] hover:underline">
                  See seller view →
                </Link>
              </div>
              {onNotify && gapKeyOf(r.key) && (
                <div className="mt-1.5">
                  <NotifyMe gapKey={gapKeyOf(r.key)!} onNotify={onNotify} />
                </div>
              )}
            </div>
          </div>
        ),
      )}
      {option.skipped.length > 0 && (
        <div className="rounded-2xl bg-white p-3 shadow-sm" data-testid="skipped">
          <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">Skipped for budget</div>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {option.skipped.map((s) => (
              <li
                key={s.itemKey}
                className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                data-testid={`skipped-${s.itemKey}`}
              >
                {s.needLabel}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function LineRow({
  line,
  diff,
  onSwap,
}: {
  line: BasketLine;
  diff: DiffKind;
  onSwap?: (itemKey: string, altIndex: number) => void;
}) {
  const p = line.product;
  const n = line.alternatives.length;
  return (
    <div
      className={`rounded-2xl bg-white p-3 shadow-sm ${diff ? DIFF_STYLE[diff].row : ""}`}
      data-testid={`line-${line.itemKey}`}
      data-diff={diff ?? undefined}
    >
      <div className="flex gap-3">
        <CategoryIcon category={p.category} className="h-14 w-14 shrink-0" iconClassName="h-6 w-6" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            {diff && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${DIFF_STYLE[diff].chip}`}>
                {DIFF_STYLE[diff].label}
              </span>
            )}
            <TierBadge tier={line.shop.tier} />
            {p.updatedForDemandAt && <UpdatedBadge />}
            <span className="text-xs text-gray-500">{line.shop.name}</span>
          </div>
          <Link href={`/product/${p.id}`} className="line-clamp-2 text-sm text-gray-800 hover:underline">
            {p.title}
          </Link>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {p.rating.toFixed(1)} ({p.reviewCount}) · {formatVnd(p.price)}
          </div>
          <div className="mt-1 text-xs text-emerald-700">{line.reason}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-gray-500">×{line.quantity}</div>
          <div className="font-semibold text-[var(--accent)]">{formatVnd(line.lineTotal)}</div>
        </div>
      </div>
      {n > 0 && (
        <details className="group mt-2" data-testid={`alts-${line.itemKey}`}>
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-gray-600">
            <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
            {n} alternative{n > 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {line.alternatives.map((a, i) => (
              <li key={a.product.id} className="flex items-center gap-2 rounded-xl bg-gray-50 p-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-gray-800">{a.product.title}</div>
                  <div className="text-gray-500">
                    {a.shop.name} · ★ {a.product.rating.toFixed(1)}
                    {a.arrivesBy && <> · arrives {formatShortDate(a.arrivesBy)}</>}
                  </div>
                </div>
                <div className="shrink-0 font-medium text-gray-800">{formatVnd(a.product.price)}</div>
                {onSwap && (
                  <button
                    type="button"
                    onClick={() => onSwap(line.itemKey, i)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--accent)] px-2 py-1 text-[var(--accent)] hover:bg-orange-50"
                    aria-label={`Swap to ${a.product.title}`}
                  >
                    <ArrowLeftRight className="h-3 w-3" /> Swap
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
