// Basket totals: items, shipping, discounts, grand total vs budget bar, savings lines; over_budget banner.
import { AlertOctagon, PackageSearch, PiggyBank } from "lucide-react";
import type { BasketOption } from "@/contract/types";
import { formatVnd } from "@/lib/client/format";

export function OverBudgetBanner({ option, budget }: { option: BasketOption; budget: number | null }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="over-budget">
      <div className="flex items-center gap-1.5 font-semibold">
        <AlertOctagon className="h-4 w-4" /> Over budget
      </div>
      <p className="mt-1">
        {option.minimumCost !== undefined ? (
          <>
            Your must-haves cost at least <strong>{formatVnd(option.minimumCost)}</strong>
          </>
        ) : (
          <>This basket costs {formatVnd(option.grandTotal)}</>
        )}
        {budget !== null && <> — your budget is {formatVnd(budget)}</>}. Kitly will not hide that with a fake basket.
      </p>
      {option.costDrivers && option.costDrivers.length > 0 && (
        <>
          <div className="mt-2 text-xs font-medium">What drives the cost</div>
          <ul className="mt-0.5 list-disc pl-4 text-xs">
            {option.costDrivers.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function TotalsPanel({ option, budget }: { option: BasketOption; budget: number | null }) {
  const over = option.status === "over_budget";
  const pct = budget ? Math.min(100, Math.round((option.grandTotal / budget) * 100)) : 0;
  // Every need is an honest gap (e.g. an off-catalog need): say so instead of a column of 0₫.
  if (!over && option.lines.length === 0)
    return (
      <section
        className="flex flex-col items-center gap-2 rounded-2xl bg-white p-6 text-center text-sm text-gray-500 shadow-sm"
        aria-label="Totals"
        data-testid="totals"
      >
        <PackageSearch className="h-6 w-6 text-gray-400" />
        <div className="font-medium text-gray-700">Nothing to buy yet</div>
        None of these needs is sold on DemoMart today. Sellers now see them as unmet demand.
      </section>
    );
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm" aria-label="Totals" data-testid="totals">
      {over && <OverBudgetBanner option={option} budget={budget} />}
      <dl className="space-y-1 text-sm">
        <Row label="Items" value={formatVnd(option.itemsTotal)} />
        <Row label="Shipping" value={formatVnd(option.shippingTotal)} />
        <Row
          label="Discounts"
          value={option.discountTotal > 0 ? `-${formatVnd(option.discountTotal)}` : formatVnd(0)}
          accent
        />
        <div className="flex items-baseline justify-between border-t border-gray-100 pt-2">
          <dt className="font-medium text-gray-800">Total</dt>
          <dd className="text-xl font-bold text-[var(--accent)]" data-testid="grand-total">
            {formatVnd(option.grandTotal)}
          </dd>
        </div>
      </dl>
      {budget !== null && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full ${option.grandTotal > budget ? "bg-red-500" : "bg-emerald-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {formatVnd(option.grandTotal)} of {formatVnd(budget)} budget
          </div>
        </div>
      )}
      {option.savings.length > 0 && (
        <div className="rounded-xl bg-emerald-50 p-3" data-testid="savings">
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-800">
            <PiggyBank className="h-3.5 w-3.5" /> Savings
          </div>
          <ul className="mt-1 space-y-1 text-xs text-emerald-900">
            {option.savings.map((s) => (
              <li key={s.label} className="flex justify-between gap-2">
                <span>{s.label}</span>
                <span className="shrink-0 font-medium">-{formatVnd(s.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={accent ? "text-emerald-700" : "text-gray-800"}>{value}</dd>
    </div>
  );
}
