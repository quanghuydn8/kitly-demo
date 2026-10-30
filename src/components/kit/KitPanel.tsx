"use client";
// Kit panel (T11, D30): header (event, budget, deadline, version switcher), Saver/Balanced/Premium tabs, basket
// rows with alternatives + Swap, "No exact match" rows with the closest product, "Not in store yet" block,
// "Skipped for budget", totals + savings, over-budget banner, Add kit to cart. All money comes from the server
// (options / re-priced overrides); nothing is computed here. Presentational: KitScreen owns requests.
import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, ChevronDown, PackageX, RotateCcw, ShoppingCart } from "lucide-react";
import { EVENTS, type BasketLine, type BasketOption, type KitPlan, type KitVersion, type Profile } from "@/contract";
import { basketTabs, defaultTabId } from "@/lib/client/kit-compare";
import { missingLabel, noMatchSentence, overMaxLabel } from "@/lib/client/kit-text";
import { formatShortDate, formatVnd } from "@/lib/client/format";
import { MiniProduct } from "./MiniProduct";

export interface KitPanelProps {
  versions: KitVersion[];
  /** null = latest. */
  viewVersion: number | null;
  onViewVersion(v: number | null): void;
  onRestore(v: number): void;
  /** Re-priced options from POST /api/kit/price, keyed `${version}:${profile}`. */
  overrides: Record<string, BasketOption>;
  onSwap(version: number, profile: Profile, itemKey: string, productId: string): void;
  onAddToCart(option: BasketOption): void;
  /** A run is in flight and has no plan yet. */
  building?: boolean;
  busy?: boolean;
  error?: string | null;
}

export function KitPanel(props: KitPanelProps) {
  const { versions, viewVersion, building } = props;
  if (versions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-400">
        {building ? "Building your kit…" : "Your kit will appear here."}
      </div>
    );
  }
  const latest = versions[versions.length - 1];
  const v = versions.find((x) => x.version === viewVersion) ?? latest;
  const readOnly = v.version !== latest.version;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <KitHeader version={v} total={latest.version} onViewVersion={props.onViewVersion} />
      <div className="space-y-4 p-3 sm:p-4">
        {readOnly && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="flex-1">Viewing version {v.version} (read-only).</span>
            <button
              type="button"
              disabled={props.busy}
              onClick={() => props.onRestore(v.version)}
              className="flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              <RotateCcw aria-hidden className="h-3 w-3" />
              Restore this version
            </button>
          </div>
        )}
        {props.error && (
          <p role="status" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {props.error}
          </p>
        )}
        {v.status === "awaiting_budget" ? (
          <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-gray-500">Waiting for your budget</p>
        ) : v.options.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-gray-500">Comparing products…</p>
        ) : (
          <VersionBody key={v.version} version={v} readOnly={readOnly} {...props} />
        )}
      </div>
    </div>
  );
}

function KitHeader({
  version: v,
  total,
  onViewVersion,
}: {
  version: KitVersion;
  total: number;
  onViewVersion(v: number | null): void;
}) {
  const ev = v.plan.event === "other" ? null : EVENTS[v.plan.event];
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-white/95 px-3 py-2.5 text-sm backdrop-blur sm:px-4">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ev?.color ?? "bg-gray-100 text-gray-600"}`}>
        {ev?.label ?? "Other"}
      </span>
      <span className="font-medium">
        {v.status === "awaiting_budget"
          ? "Budget not set yet"
          : v.plan.budget === null
            ? "No budget limit"
            : `Budget ${formatVnd(v.plan.budget)}`}
      </span>
      {v.plan.deadline && <span className="text-gray-600">By {formatShortDate(v.plan.deadline)}</span>}
      <label className="ml-auto flex items-center gap-1 text-xs text-gray-500">
        <span className="sr-only">Version</span>
        <select
          aria-label="Version"
          value={v.version}
          onChange={(e) => {
            const n = Number(e.target.value);
            onViewVersion(n === total ? null : n);
          }}
          className="rounded-md border bg-white px-2 py-1 text-xs font-medium text-gray-700"
        >
          {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              Version {n} of {total}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}

function VersionBody({ version: v, readOnly, overrides, onSwap, onAddToCart, busy }: KitPanelProps & { version: KitVersion; readOnly: boolean }) {
  const tabs = basketTabs(v.options);
  const [tabId, setTabId] = useState(() => {
    const fromSelection = v.selection && tabs.find((t) => t.profiles.includes(v.selection!.profile));
    return fromSelection?.id ?? defaultTabId(tabs);
  });
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  // No tabs ⇒ every option is empty: one honest-gap view of the Balanced (or first) option.
  const base = tab?.option ?? v.options.find((o) => o.profile === "balanced") ?? v.options[0];
  const profile = tab?.profile ?? base.profile;
  const option = overrides[`${v.version}:${profile}`] ?? base;
  const exact = option.noMatch.filter((n) => n.closest);
  const notInStore = option.noMatch.filter((n) => !n.closest);

  return (
    <>
      {tabs.length > 0 && (
        <div role="tablist" aria-label="Baskets" className="grid gap-1.5 sm:grid-cols-3">
          {tabs.map((t) => {
            const selected = t.id === tab?.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTabId(t.id)}
                className={`rounded-lg border px-2.5 py-2 text-left text-xs ${selected ? "border-[var(--kitly-accent)] bg-orange-50 font-medium text-[var(--kitly-accent)]" : "bg-white text-gray-700 hover:border-gray-300"}`}
              >
                {t.label}
                {t.overBudget && <span className="ml-1 text-red-600">⚠</span>}
              </button>
            );
          })}
        </div>
      )}

      {option.status === "over_budget" && (
        <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Over budget by {formatVnd(option.overBy ?? 0)}.
            {option.minimumCost !== undefined && <> The cheapest version of this kit costs {formatVnd(option.minimumCost)}</>}
            {option.costDrivers && option.costDrivers.length > 0 && <>, driven by {option.costDrivers.join(", ")}</>}
            {option.minimumCost !== undefined && "."}
          </p>
        </div>
      )}

      {option.lines.length > 0 && (
        <ul aria-label="Basket" className="divide-y rounded-xl border bg-white">
          {option.lines.map((l) => (
            <BasketRow
              key={l.itemKey}
              line={l}
              readOnly={readOnly}
              busy={busy}
              onSwap={(productId) => onSwap(v.version, profile, l.itemKey, productId)}
            />
          ))}
        </ul>
      )}

      {exact.length > 0 && (
        <ul aria-label="No exact match" className="space-y-2">
          {exact.map((n) => (
            <NoMatchRow key={n.itemKey} row={n} plan={v.plan} />
          ))}
        </ul>
      )}

      {notInStore.length > 0 && (
        <section aria-label={`Not in store yet (${notInStore.length})`} className="rounded-xl border bg-white">
          <details open>
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700">
              <PackageX aria-hidden className="h-4 w-4 text-gray-400" />
              Not in store yet ({notInStore.length})
            </summary>
            <ul className="flex flex-wrap gap-1.5 px-3 pb-3">
              {notInStore.map((n) => (
                <li key={n.itemKey} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700">
                  {n.needLabel}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {option.skipped.length > 0 && (
        <section aria-label="Skipped for budget" className="rounded-xl border bg-white px-3 py-2 text-sm">
          <p className="font-medium text-gray-700">Skipped for budget</p>
          <p className="text-gray-500">{option.skipped.map((s) => s.needLabel).join(", ")}</p>
        </section>
      )}

      <Totals option={option} budget={v.plan.budget} />

      <button
        type="button"
        disabled={readOnly || option.lines.length === 0}
        onClick={() => onAddToCart(option)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--kitly-accent)] px-4 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        <ShoppingCart aria-hidden className="h-4 w-4" />
        Add kit to cart
      </button>
    </>
  );
}

function BasketRow({ line, readOnly, busy, onSwap }: { line: BasketLine; readOnly: boolean; busy?: boolean; onSwap(productId: string): void }) {
  const [open, setOpen] = useState(false);
  const n = line.alternatives.length;
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <MiniProduct product={line.product} shop={line.shop} />
        </div>
        <div className="shrink-0 text-right text-sm">
          <div className="font-semibold">{formatVnd(line.lineTotal)}</div>
          {line.quantity > 1 && <div className="text-xs text-gray-500">× {line.quantity}</div>}
        </div>
      </div>
      <p className="text-xs text-gray-500">{line.reason}</p>
      {n > 0 && !readOnly && (
        <div>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 text-xs font-medium text-[var(--kitly-accent)]"
          >
            <ChevronDown aria-hidden className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            {n} {n === 1 ? "alternative" : "alternatives"}
          </button>
          {open && (
            <ul className="mt-1.5 space-y-1.5">
              {line.alternatives.map((a) => (
                <li key={a.product.id} className="flex items-center gap-2 rounded-lg bg-gray-50 p-2">
                  <div className="min-w-0 flex-1">
                    <MiniProduct product={a.product} shop={a.shop} arrivesBy={a.arrivesBy} />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onSwap(a.product.id)}
                    className="flex shrink-0 items-center gap-1 rounded-md border bg-white px-2 py-1 text-xs font-medium hover:border-[var(--kitly-accent)] disabled:opacity-50"
                  >
                    <ArrowLeftRight aria-hidden className="h-3 w-3" />
                    Swap
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function NoMatchRow({ row, plan }: { row: BasketOption["noMatch"][number]; plan: KitPlan }) {
  const c = row.closest!;
  return (
    <li className="space-y-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2.5">
      <p className="text-sm font-medium text-amber-900">{noMatchSentence(row, plan)}</p>
      <div className="rounded-lg bg-white p-2">
        <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">Closest</p>
        <MiniProduct product={c.candidate.product} shop={c.candidate.shop} arrivesBy={c.candidate.arrivesBy} />
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
          {c.missingTags.length > 0 && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{missingLabel(c.missingTags)}</span>}
          {c.overMaxPriceBy !== null && c.overMaxPriceBy > 0 && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">{overMaxLabel(c.overMaxPriceBy)}</span>
          )}
        </div>
      </div>
    </li>
  );
}

function Totals({ option, budget }: { option: BasketOption; budget: number | null }) {
  const pct = budget ? Math.min(100, Math.round((option.grandTotal / budget) * 100)) : null;
  const over = option.status === "over_budget";
  return (
    <section aria-label="Totals" className="space-y-1.5 rounded-xl border bg-white px-3 py-3 text-sm">
      <Row label="Items" value={formatVnd(option.itemsTotal)} />
      <Row label="Shipping" value={formatVnd(option.shippingTotal)} />
      {option.discountTotal > 0 && <Row label="Discounts" value={`−${formatVnd(option.discountTotal)}`} accent />}
      {option.savings.length > 0 && (
        <ul className="space-y-0.5 pl-3 text-xs text-emerald-700">
          {option.savings.map((s) => (
            <li key={s.label} className="flex justify-between gap-2">
              <span>
                {s.wallet && <span aria-hidden>💛 </span>}
                {s.label}
              </span>
              <span className="shrink-0">−{formatVnd(s.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
        <span>Grand total</span>
        <span className={over ? "text-red-600" : "text-[var(--kitly-accent)]"}>{formatVnd(option.grandTotal)}</span>
      </div>
      {budget !== null && pct !== null && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" role="meter" aria-label="Share of budget" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {over ? "Over" : `${pct}% of`} your {formatVnd(budget)} budget
          </p>
        </div>
      )}
    </section>
  );
}

function Row({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={accent ? "text-emerald-700" : ""}>{value}</span>
    </div>
  );
}
