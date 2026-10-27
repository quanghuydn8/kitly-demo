// Three baskets side by side (T20b): Saver / Balanced / Premium columns with totals, score stars, the price
// difference against Balanced, the items where profiles disagree highlighted, and "Choose this kit" per column.
// One DOM for both layouts: xl+ shows the three columns; below xl a tab bar shows one column at a time.
import { CircleSlash, MinusCircle, ShoppingCart, Star, StarHalf } from "lucide-react";
import type { BasketOption, KitPlan } from "@/contract/types";
import { formatVnd } from "@/lib/client/format";
import { noMatchPrefix, OVER_BUDGET_REASON } from "@/lib/client/kit-text";
import { compareBaskets, type CompareCell, type CompareColumn, type CompareRow, type Profile } from "@/lib/client/kit-compare";

export function ThreeBaskets({
  options,
  plan,
  selected,
  onSelect,
  onChoose,
  disabled = false,
}: {
  options: BasketOption[];
  plan: KitPlan | null;
  /** Profile whose full basket (swap, refine, explanation) is shown below. */
  selected: Profile;
  onSelect: (p: Profile) => void;
  onChoose: (p: Profile) => void;
  disabled?: boolean;
}) {
  const { columns, rows } = compareBaskets(options, plan);
  return (
    <section className="space-y-2" aria-label="Three baskets" data-testid="three-baskets">
      <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm xl:hidden" role="tablist">
        {columns.map((c) => (
          <button
            key={c.profile}
            type="button"
            role="tab"
            aria-selected={c.profiles.includes(selected)}
            onClick={() => onSelect(c.profile)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm ${
              c.profiles.includes(selected) ? "bg-[var(--accent)] font-semibold text-white" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {c.label}
            <span className="block text-[11px] font-normal opacity-80">{formatVnd(c.option.grandTotal)}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {columns.map((c, i) => (
          <Column
            key={c.profile}
            col={c}
            index={i}
            rows={rows}
            plan={plan}
            selected={c.profiles.includes(selected)}
            onSelect={onSelect}
            onChoose={onChoose}
            disabled={disabled}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400">
        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-100 ring-1 ring-amber-300 align-middle" />
        Highlighted items differ between the baskets.
      </p>
    </section>
  );
}

function Column({
  col,
  index,
  rows,
  plan,
  selected,
  onSelect,
  onChoose,
  disabled,
}: {
  col: CompareColumn;
  index: number;
  rows: CompareRow[];
  plan: KitPlan | null;
  selected: boolean;
  onSelect: (p: Profile) => void;
  onChoose: (p: Profile) => void;
  disabled: boolean;
}) {
  const o = col.option;
  const over = o.status === "over_budget";
  return (
    <div
      className={`${selected ? "flex" : "hidden"} min-w-0 flex-col rounded-2xl bg-white p-3 shadow-sm xl:flex ${
        selected ? "ring-2 ring-[var(--accent)]" : ""
      }`}
      data-testid={`basket-col-${col.profile}`}
    >
      <button type="button" onClick={() => onSelect(col.profile)} className="text-left" title="Show this basket below">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-800">{col.label}</h3>
          {over && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Over budget</span>}
          {selected && <span className="ml-auto text-[10px] text-gray-400">Details below</span>}
        </div>
        <Stars col={col} />
        <div className="mt-1 text-xl font-bold text-[var(--accent)]">{formatVnd(o.grandTotal)}</div>
        <div className="text-xs text-gray-500">
          {col.deltaVsBalanced === null || col.profiles.includes("balanced") ? (
            "Our default trade-off"
          ) : (
            <span className={col.deltaVsBalanced < 0 ? "text-emerald-700" : col.deltaVsBalanced > 0 ? "text-gray-700" : ""}>
              {signedVnd(col.deltaVsBalanced)} vs Balanced
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-gray-400">
          Items {formatVnd(o.itemsTotal)} · Shipping {formatVnd(o.shippingTotal)}
          {o.discountTotal > 0 && <> · Discounts -{formatVnd(o.discountTotal)}</>}
        </div>
      </button>

      <ul className="mt-3 flex-1 space-y-1.5">
        {rows.map((r) => (
          <Cell key={r.itemKey} profile={col.profile} row={r} cell={r.cells[index]} plan={plan} />
        ))}
      </ul>

      <button
        type="button"
        data-testid={`choose-${col.profile}`}
        onClick={() => onChoose(col.profile)}
        disabled={disabled || over || o.lines.length === 0}
        title={over ? OVER_BUDGET_REASON : undefined}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
          selected ? "bg-[var(--accent)] text-white" : "border border-[var(--accent)] text-[var(--accent)] hover:bg-orange-50"
        }`}
      >
        <ShoppingCart className="h-4 w-4" /> Choose this kit
      </button>
      {over && <p className="mt-1 text-center text-[11px] text-red-600">{OVER_BUDGET_REASON}</p>}
    </div>
  );
}

function Cell({ profile, row, cell, plan }: { profile: Profile; row: CompareRow; cell: CompareCell; plan: KitPlan | null }) {
  return (
    <li
      data-testid={`cell-${profile}-${row.itemKey}`}
      data-differs={row.differs ? "true" : "false"}
      className={`rounded-lg px-2 py-1.5 text-xs ${row.differs ? "bg-amber-50 ring-1 ring-amber-300" : "bg-gray-50"}`}
    >
      <div className="text-[10px] tracking-wide text-gray-400 uppercase">{row.needLabel}</div>
      {cell.kind === "line" ? (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="line-clamp-1 text-gray-800" title={cell.line.product.title}>
              {cell.line.product.title}
            </div>
            <div className="text-gray-500">
              ★ {cell.line.product.rating.toFixed(1)} · {cell.line.shop.name}
              {cell.line.quantity > 1 && <> · ×{cell.line.quantity}</>}
            </div>
          </div>
          <div className="shrink-0 font-medium text-gray-800">{formatVnd(cell.line.lineTotal)}</div>
        </div>
      ) : cell.kind === "gap" ? (
        <div className="flex items-center gap-1 text-gray-500">
          <CircleSlash className="h-3 w-3" /> {noMatchPrefix(plan)}
        </div>
      ) : cell.kind === "skipped" ? (
        <div className="flex items-center gap-1 text-gray-500">
          <MinusCircle className="h-3 w-3" /> Skipped for budget
        </div>
      ) : (
        <div className="text-gray-400">—</div>
      )}
    </li>
  );
}

function Stars({ col }: { col: CompareColumn }) {
  const label = col.rating === null ? "Score: no products" : `Score ${col.rating.toFixed(1)} out of 5`;
  return (
    <div className="mt-0.5 flex items-center gap-0.5" aria-label={label} title={label}>
      {[1, 2, 3, 4, 5].map((n) =>
        col.stars >= n ? (
          <Star key={n} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        ) : col.stars >= n - 0.5 ? (
          <StarHalf key={n} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        ) : (
          <Star key={n} className="h-3.5 w-3.5 text-gray-300" />
        ),
      )}
      {col.rating !== null && <span className="ml-1 text-xs text-gray-500">{col.rating.toFixed(1)}</span>}
    </div>
  );
}

/** -210000 → "-210.000₫", 420000 → "+420.000₫" */
const signedVnd = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : "±"}${formatVnd(Math.abs(n))}`;
