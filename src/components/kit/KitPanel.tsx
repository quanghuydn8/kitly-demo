"use client";
// Kit panel (T11, D30): header (event, budget, deadline, version switcher), Saver/Balanced/Premium tabs, basket
// rows with alternatives + Swap, "No exact match" rows with the closest product, "Not in store yet" block,
// "Skipped for budget", totals + savings, over-budget banner, Add kit to cart. All money comes from the server
// (options / re-priced overrides); nothing is computed here. Presentational: KitScreen owns requests.
// T15 edits (D28/D29/D32/D33): ✕ per basket row (remove_item), Add anyway on the closest product, Fit to budget
// buttons + Undo under the over-budget banner, inline budget/deadline edit in the header. Never blocked by budget.
// T17 (D40/D44/D46): "💛 In your cart" card under the line / No exact match row of an interest (Switch to this →
// /api/kit/price pick, hidden once it is the line), 🎟 wallet savings first, "Deliver to <district, city>" in the header,
// an Undo note after a price edit (Fit to budget or a cart switch).
import { useState, type KeyboardEvent } from "react";
import { AlertTriangle, ArrowLeftRight, ChevronDown, PackageX, Pencil, Plus, RotateCcw, ShoppingCart, Undo2, X } from "lucide-react";
import {
  EVENTS,
  type BasketLine,
  type BasketOption,
  type FitSuggestion,
  type Interest,
  type KitPlan,
  type KitVersion,
  type Profile,
} from "@/contract";
import { basketTabs, defaultTabId } from "@/lib/client/kit-compare";
import { closestMatchLabel, parseBudgetInput } from "@/lib/client/kit-edits";
import { kAmount, missingLabel, noMatchSentence, overMaxLabel } from "@/lib/client/kit-text";
import { formatCount, formatShortDate, formatVnd } from "@/lib/client/format";
import { demandGapKey } from "@/lib/client/seller-text";
import { MiniProduct } from "./MiniProduct";
import { NotifyMe } from "./NotifyMe";

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
  /** ✕ "I already have this" → adjust remove_item. */
  onRemoveItem?(itemKey: string): void;
  /** Add anyway: pick the item's closest product → /api/kit/price. */
  onAddAnyway?(version: number, profile: Profile, itemKey: string, productId: string): void;
  /** ✕ on an Add-anyway line: drop the pick again. */
  onTakeOut?(version: number, profile: Profile, itemKey: string): void;
  onFit?(version: number, profile: Profile, fit: FitSuggestion): void;
  onUndoFit?(): void;
  /** `${version}:${profile}` of the basket whose last Fit to budget can be undone. */
  fitUndoKey?: string | null;
  /** Text of that Undo note (default "Basket edited to fit your budget."). */
  undoText?: string;
  /** 💛 card "Switch to this": pick the cart product for the item → /api/kit/price. */
  onSwitchInterest?(version: number, profile: Profile, itemKey: string, productId: string): void;
  /** "Cau Giay, Hanoi" for the thread's persona; null/undefined = no delivery line (Guest). */
  deliverTo?: string | null;
  /** Show the tab holding this profile (e.g. after a follow-up swap re-priced it). */
  activeProfile?: Profile | null;
  onSetBudget?(budget: number | null): void;
  onSetDeadline?(deadline: string | null): void;
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
      <KitHeader
        version={v}
        total={latest.version}
        onViewVersion={props.onViewVersion}
        editable={!readOnly}
        busy={props.busy}
        onSetBudget={props.onSetBudget}
        onSetDeadline={props.onSetDeadline}
        deliverTo={props.deliverTo ?? null}
      />
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
  editable,
  busy,
  onSetBudget,
  onSetDeadline,
  deliverTo,
}: {
  version: KitVersion;
  total: number;
  deliverTo: string | null;
  onViewVersion(v: number | null): void;
  editable: boolean;
  busy?: boolean;
  onSetBudget?(budget: number | null): void;
  onSetDeadline?(deadline: string | null): void;
}) {
  const [editing, setEditing] = useState<"budget" | "deadline" | null>(null);
  const ev = v.plan.event === "other" ? null : EVENTS[v.plan.event];
  const budgetText =
    v.status === "awaiting_budget" ? "Budget not set yet" : v.plan.budget === null ? "No budget limit" : `Budget ${formatVnd(v.plan.budget)}`;
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-white/95 px-3 py-2.5 text-sm backdrop-blur sm:px-4">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${ev?.color ?? "bg-gray-100 text-gray-600"}`}>
        {ev?.label ?? "Other"}
      </span>
      {editing === "budget" && onSetBudget ? (
        <BudgetInput
          initial={v.plan.budget === null ? "" : formatCount(v.plan.budget)}
          onDone={(b) => {
            setEditing(null);
            if (b !== undefined) onSetBudget(b);
          }}
        />
      ) : (
        <span className="flex items-center gap-1 font-medium">
          {budgetText}
          {editable && onSetBudget && <PencilButton label="Edit budget" busy={busy} onClick={() => setEditing("budget")} />}
        </span>
      )}
      {editing === "deadline" && onSetDeadline ? (
        <DeadlineInput
          initial={v.plan.deadline ?? ""}
          onDone={(d) => {
            setEditing(null);
            if (d !== undefined) onSetDeadline(d);
          }}
        />
      ) : (
        (v.plan.deadline || (editable && onSetDeadline)) && (
          <span className="flex items-center gap-1 text-gray-600">
            {v.plan.deadline ? `By ${formatShortDate(v.plan.deadline)}` : "No deadline"}
            {editable && onSetDeadline && <PencilButton label="Edit deadline" busy={busy} onClick={() => setEditing("deadline")} />}
          </span>
        )
      )}
      {deliverTo && <span className="text-xs text-gray-500">Deliver to {deliverTo}</span>}
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

function PencilButton({ label, busy, onClick }: { label: string; busy?: boolean; onClick(): void }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={busy} onClick={onClick} className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40">
      <Pencil aria-hidden className="h-3 w-3" />
    </button>
  );
}

/** Enter commits, Escape cancels; `onDone(undefined)` = nothing to send. */
function BudgetInput({ initial, onDone }: { initial: string; onDone(b: number | null | undefined): void }) {
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onDone(undefined);
    if (e.key !== "Enter") return;
    e.preventDefault();
    const b = parseBudgetInput(text);
    if (b === undefined) setInvalid(true);
    else onDone(b);
  };
  return (
    <span className="flex flex-col">
      <input
        aria-label="Budget"
        autoFocus
        value={text}
        onChange={(e) => (setText(e.target.value), setInvalid(false))}
        onKeyDown={onKey}
        onBlur={() => onDone(undefined)}
        placeholder="e.g. 1.5M · empty = no limit"
        className="w-40 rounded-md border px-2 py-0.5 text-sm focus:border-[var(--kitly-accent)] focus:outline-none"
      />
      {invalid && <span className="text-xs text-red-600">Type an amount, e.g. 1.500.000 or 1.5M</span>}
    </span>
  );
}

function DeadlineInput({ initial, onDone }: { initial: string; onDone(d: string | null | undefined): void }) {
  const [value, setValue] = useState(initial);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") onDone(undefined);
    if (e.key !== "Enter") return;
    e.preventDefault();
    onDone(value || null);
  };
  return (
    <input
      type="date"
      aria-label="Deadline"
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={onKey}
      onBlur={() => onDone(undefined)}
      className="rounded-md border px-2 py-0.5 text-sm focus:border-[var(--kitly-accent)] focus:outline-none"
    />
  );
}

function VersionBody({
  version: v,
  readOnly,
  overrides,
  onSwap,
  onAddToCart,
  busy,
  onRemoveItem,
  onAddAnyway,
  onTakeOut,
  onFit,
  onUndoFit,
  fitUndoKey,
  undoText,
  onSwitchInterest,
  activeProfile,
}: KitPanelProps & { version: KitVersion; readOnly: boolean }) {
  const tabs = basketTabs(v.options);
  const [tabId, setTabId] = useState(() => {
    const fromSelection = v.selection && tabs.find((t) => t.profiles.includes(v.selection!.profile));
    return fromSelection?.id ?? defaultTabId(tabs);
  });
  const focusTab = activeProfile ? tabs.find((t) => t.profiles.includes(activeProfile))?.id : undefined;
  const [focused, setFocused] = useState(focusTab);
  if (focusTab !== focused) {
    // activeProfile changed (a follow-up swap re-priced that basket): show it.
    setFocused(focusTab);
    if (focusTab) setTabId(focusTab);
  }
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  // No tabs ⇒ every option is empty: one honest-gap view of the Balanced (or first) option.
  const base = tab?.option ?? v.options.find((o) => o.profile === "balanced") ?? v.options[0];
  const profile = tab?.profile ?? base.profile;
  const key = `${v.version}:${profile}`;
  const option = overrides[key] ?? base;
  const needLabel = (itemKey: string) => v.plan.items.find((i) => i.key === itemKey)?.needLabel ?? itemKey;
  const over = option.status === "over_budget";
  const exact = option.noMatch.filter((n) => n.closest);
  const notInStore = option.noMatch.filter((n) => !n.closest);
  // 💛 cards (D40): from the shown option, never for a product that is already the item's line.
  const interestFor = (itemKey: string): Interest | undefined =>
    (option.interests ?? base.interests ?? []).find(
      (i) => i.itemKey === itemKey && !option.lines.some((l) => l.itemKey === itemKey && l.product.id === i.candidate.product.id),
    );
  const fromCart = (l: BasketLine) =>
    (base.interests ?? []).some((i) => i.itemKey === l.itemKey && i.candidate.product.id === l.product.id) &&
    !base.lines.some((b) => b.itemKey === l.itemKey && b.product.id === l.product.id);
  const cartCard = (itemKey: string) => {
    const i = interestFor(itemKey);
    return (
      i && (
        <InterestCard
          interest={i}
          maxUnitPrice={v.plan.items.find((x) => x.key === itemKey)?.maxUnitPrice ?? null}
          readOnly={readOnly}
          busy={busy}
          onSwitch={() => onSwitchInterest?.(v.version, profile, itemKey, i.candidate.product.id)}
        />
      )
    );
  };

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

      {over && (
        <div role="alert" className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="flex gap-2">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Over budget by {formatVnd(option.overBy ?? 0)}.
              {option.minimumCost !== undefined && <> The cheapest version of this kit costs {formatVnd(option.minimumCost)}</>}
              {option.costDrivers && option.costDrivers.length > 0 && <>, driven by {option.costDrivers.join(", ")}</>}
              {option.minimumCost !== undefined && "."}
            </span>
          </p>
          {!readOnly && option.fit && option.fit.length > 0 && (
            <div role="group" aria-label="Fit to budget" className="flex flex-col gap-1.5">
              {option.fit.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onFit?.(v.version, profile, f)}
                  className="flex flex-wrap items-center gap-1.5 rounded-md border border-red-300 bg-white px-2.5 py-1.5 text-left text-xs font-medium text-gray-800 hover:border-red-500 disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">{f.label}</span>
                  {f.dropsMustHave && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-700">removes a must-have</span>}
                  {!f.fits && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">still over</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!readOnly && fitUndoKey === key && (
        <p className="flex items-center gap-2 text-xs text-gray-600">
          <span>{undoText ?? "Basket edited to fit your budget."}</span>
          <button type="button" disabled={busy} onClick={() => onUndoFit?.()} className="flex items-center gap-1 font-medium text-[var(--kitly-accent)] disabled:opacity-50">
            <Undo2 aria-hidden className="h-3 w-3" />
            Undo
          </button>
        </p>
      )}

      {option.lines.length > 0 && (
        <ul aria-label="Basket" className="divide-y rounded-xl border bg-white">
          {option.lines.map((l) => (
            <BasketRow
              key={l.itemKey}
              line={l}
              needLabel={needLabel(l.itemKey)}
              closestLabel={closestMatchLabel(base, l) ?? (fromCart(l) ? "💛 From your cart" : null)}
              extra={cartCard(l.itemKey)}
              readOnly={readOnly}
              busy={busy}
              onSwap={(productId) => onSwap(v.version, profile, l.itemKey, productId)}
              onRemove={() => onRemoveItem?.(l.itemKey)}
              onTakeOut={() => onTakeOut?.(v.version, profile, l.itemKey)}
            />
          ))}
        </ul>
      )}

      {exact.length > 0 && (
        <ul aria-label="No exact match" className="space-y-2">
          {exact.map((n) => (
            <NoMatchRow
              key={n.itemKey}
              row={n}
              plan={v.plan}
              readOnly={readOnly}
              busy={busy}
              onAddAnyway={() => onAddAnyway?.(v.version, profile, n.itemKey, n.closest!.candidate.product.id)}
              extra={cartCard(n.itemKey)}
            />
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
                <li key={n.itemKey} className="flex items-center gap-1.5 rounded-full bg-gray-100 py-0.5 pl-2.5 pr-1 text-xs text-gray-700">
                  {n.needLabel}
                  <NotifyMe gapKey={gapKeyOf(v.plan, n.itemKey)} needLabel={n.needLabel} />
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
        {over ? `Add kit to cart (over budget by ${formatVnd(option.overBy ?? 0)})` : "Add kit to cart"}
      </button>
    </>
  );
}

function BasketRow({
  line,
  needLabel,
  closestLabel,
  readOnly,
  busy,
  onSwap,
  onRemove,
  onTakeOut,
  extra,
}: {
  line: BasketLine;
  extra?: React.ReactNode;
  needLabel: string;
  /** Set when this line is an Add-anyway closest product. */
  closestLabel: string | null;
  readOnly: boolean;
  busy?: boolean;
  onSwap(productId: string): void;
  onRemove(): void;
  onTakeOut(): void;
}) {
  const [open, setOpen] = useState(false);
  const n = line.alternatives.length;
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      {closestLabel && <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700">{closestLabel}</p>}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <MiniProduct product={line.product} shop={line.shop} />
        </div>
        <div className="shrink-0 text-right text-sm">
          <div className="font-semibold">{formatVnd(line.lineTotal)}</div>
          {line.quantity > 1 && <div className="text-xs text-gray-500">× {line.quantity}</div>}
        </div>
        {!readOnly && (
          <button
            type="button"
            disabled={busy}
            aria-label={closestLabel ? `Take out ${needLabel}` : `Remove ${needLabel} (I already have this)`}
            title={closestLabel ? "Take it out again" : "I already have this"}
            onClick={closestLabel ? onTakeOut : onRemove}
            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        )}
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
      {extra}
    </li>
  );
}

function NoMatchRow({
  row,
  plan,
  readOnly,
  busy,
  onAddAnyway,
  extra,
}: {
  row: BasketOption["noMatch"][number];
  extra?: React.ReactNode;
  plan: KitPlan;
  readOnly: boolean;
  busy?: boolean;
  onAddAnyway(): void;
}) {
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
          {!readOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={onAddAnyway}
              className="ml-auto flex items-center gap-1 rounded-md border border-[var(--kitly-accent)] px-2 py-0.5 font-medium text-[var(--kitly-accent)] hover:bg-orange-50 disabled:opacity-50"
            >
              <Plus aria-hidden className="h-3 w-3" />
              Add anyway
            </button>
          )}
          <NotifyMe gapKey={gapKeyOf(plan, row.itemKey)} needLabel={row.needLabel} />
        </div>
      </div>
      {extra}
    </li>
  );
}

/** The insights gap key of a noMatch item (an item missing from the plan counts as not in catalog). */
const gapKeyOf = (plan: KitPlan, itemKey: string) =>
  demandGapKey(plan.items.find((i) => i.key === itemKey) ?? { category: null, mustHaveTags: [] });

/** "💛 In your cart" (D40): the cart product, its price after the wallet/shop voucher, what it lacks, Switch to this. */
function InterestCard({
  interest: i,
  maxUnitPrice,
  readOnly,
  busy,
  onSwitch,
}: {
  interest: Interest;
  maxUnitPrice: number | null;
  readOnly: boolean;
  busy?: boolean;
  onSwitch(): void;
}) {
  const p = i.candidate.product;
  const discounted = i.priceAfterVoucher < p.price;
  return (
    <section aria-label="In your cart" className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-800">💛 In your cart</p>
      <MiniProduct product={p} shop={i.candidate.shop} arrivesBy={i.candidate.arrivesBy} />
      <p className="text-xs text-gray-700">
        {discounted ? (
          <>
            <span className="line-through">{formatVnd(p.price)}</span> → <strong className="text-gray-900">{formatVnd(i.priceAfterVoucher)}</strong>
            {i.walletVoucherCode && <> with {i.walletVoucherCode}</>}
          </>
        ) : (
          <strong className="text-gray-900">{formatVnd(p.price)}</strong>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {i.overMaxPriceBy !== null && i.overMaxPriceBy > 0 && (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">
            {maxUnitPrice !== null
              ? `over your ${kAmount(maxUnitPrice)} limit by ${formatVnd(i.overMaxPriceBy)}`
              : `over your max price by ${formatVnd(i.overMaxPriceBy)}`}
          </span>
        )}
        {i.missingTags.length > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">missing: {i.missingTags.join(", ")}</span>
        )}
        {!readOnly && (
          <button
            type="button"
            disabled={busy}
            onClick={onSwitch}
            className="ml-auto flex items-center gap-1 rounded-md bg-[var(--kitly-accent)] px-2 py-0.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <ArrowLeftRight aria-hidden className="h-3 w-3" />
            Switch to this
          </button>
        )}
      </div>
    </section>
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
          {[...option.savings.filter((s) => s.wallet), ...option.savings.filter((s) => !s.wallet)].map((s) => (
            <li key={s.label} className="flex justify-between gap-2">
              <span>
                {s.wallet && <span aria-hidden>🎟 </span>}
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
