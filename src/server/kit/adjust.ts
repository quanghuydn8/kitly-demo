// Kit edits (CONTRACT §3 "Kit edits", seam S6): code-only changes to a thread's latest version — set_budget,
// set_deadline, remove_item / restore_item (D33 excludedKeys), restore_version. Re-runs Matcher + Optimizer on the
// changed plan (no Planner, no Explainer, no LLM at all), writes a code-template explanation in the plan language and
// appends a version (kind "adjust" / "restore"). set_budget on an awaiting_budget version (D32) gives the thread its
// first options and records the demand items, once per thread.
import type { BasketOption, CommerceAdapter, KitChange, KitPlan, KitStore, KitThreadSummary, KitVersion, PlanItem, Profile } from "@/contract";
import { formatVnd, optimize } from "@/server/optimizer";
import { shortDate } from "@/server/optimizer/labels";
import { matchPlan } from "./matcher";
import { diffPlans } from "./diff";
import { ALL_PROFILES, demandRows } from "./pipeline";
import { withInterests } from "./interests";

/** A change the thread cannot take (unknown item / version, bad date or budget) → HTTP 400. */
export class AdjustError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdjustError";
  }
}

export interface AdjustDeps {
  adapter: CommerceAdapter;
  store: KitStore;
  today: string;
}

export interface AdjustRequest {
  owner: string;
  thread: { thread: KitThreadSummary; versions: KitVersion[] };
  change: KitChange;
  profiles?: Profile[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => ISO_DATE.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * Demand items are recorded once per thread (CONTRACT §3): by version 1 when it had options, or by the first
 * set_budget answer to a clarify. Refines never record, so they do not count.
 */
function demandRecorded(versions: KitVersion[]): boolean {
  if (versions[0]?.status === "ready") return true;
  return versions.some((v, i) => i > 0 && v.kind === "adjust" && v.status === "ready" && versions[i - 1].status === "awaiting_budget");
}

/** The item as it was in the most recent version that still had it (restore_item). */
function lastKnownItem(versions: KitVersion[], key: string): { item: PlanItem; order: string[] } | null {
  for (let i = versions.length - 1; i >= 0; i--) {
    const items = versions[i].plan.items;
    const item = items.find((it) => it.key === key);
    if (item) return { item: structuredClone(item), order: items.map((it) => it.key) };
  }
  return null;
}

/** Put the item back where it was: before the first item that followed it then and is still in the plan. */
function reinsert(items: PlanItem[], item: PlanItem, order: string[]): PlanItem[] {
  const after = order.slice(order.indexOf(item.key) + 1);
  const at = items.findIndex((it) => after.includes(it.key));
  return at < 0 ? [...items, item] : [...items.slice(0, at), item, ...items.slice(at)];
}

interface Edited {
  kind: "adjust" | "restore";
  plan: KitPlan;
  excludedKeys: string[];
  /** awaiting_budget carried over (from the latest version, or the restored one) unless the budget was answered. */
  awaiting: boolean;
}

function applyChange(versions: KitVersion[], change: KitChange, today: string): Edited {
  const latest = versions.at(-1)!;
  const plan = structuredClone(latest.plan);
  const excludedKeys = [...latest.excludedKeys];
  const awaiting = latest.status === "awaiting_budget";
  switch (change.type) {
    case "set_budget":
      if (change.budget !== null && change.budget <= 0) throw new AdjustError("bad_budget", "Budget must be positive or null");
      return { kind: "adjust", plan: { ...plan, budget: change.budget }, excludedKeys, awaiting: false };
    case "set_deadline":
      if (change.deadline !== null && (!validDate(change.deadline) || change.deadline < today)) {
        throw new AdjustError("bad_deadline", `Deadline must be a YYYY-MM-DD date on or after ${today}, or null`);
      }
      return { kind: "adjust", plan: { ...plan, deadline: change.deadline }, excludedKeys, awaiting };
    case "remove_item": {
      if (!plan.items.some((it) => it.key === change.itemKey)) throw new AdjustError("unknown_item", `No item ${change.itemKey} in the kit`);
      plan.items = plan.items.filter((it) => it.key !== change.itemKey);
      return { kind: "adjust", plan, excludedKeys: [...excludedKeys, change.itemKey], awaiting };
    }
    case "restore_item": {
      const known = excludedKeys.includes(change.itemKey) ? lastKnownItem(versions, change.itemKey) : null;
      if (!known) throw new AdjustError("not_excluded", `Item ${change.itemKey} was not removed`);
      if (!plan.items.some((it) => it.key === change.itemKey)) plan.items = reinsert(plan.items, known.item, known.order);
      return { kind: "adjust", plan, excludedKeys: excludedKeys.filter((k) => k !== change.itemKey), awaiting };
    }
    case "restore_version": {
      const v = versions.find((x) => x.version === change.version);
      if (!v) throw new AdjustError("unknown_version", `No version ${change.version} in this kit`);
      return {
        kind: "restore",
        plan: structuredClone(v.plan),
        excludedKeys: [...v.excludedKeys],
        awaiting: v.status === "awaiting_budget",
      };
    }
  }
}

function labelOf(versions: KitVersion[], key: string): string {
  return lastKnownItem(versions, key)?.item.needLabel ?? key;
}

/** userText of the version (the chat's ⚙ system line) and the action sentence of the explanation. */
function texts(versions: KitVersion[], change: KitChange, plan: KitPlan): { userText: string; action: string } {
  const vi = plan.language === "vi";
  switch (change.type) {
    case "set_budget":
      if (change.budget === null)
        return vi
          ? { userText: "Không giới hạn ngân sách", action: "Đã bỏ giới hạn ngân sách" }
          : { userText: "No budget limit", action: "Budget limit removed" };
      return vi
        ? { userText: `Ngân sách: ${formatVnd(change.budget)}`, action: `Đã đặt ngân sách ${formatVnd(change.budget)}` }
        : { userText: `Budget: ${formatVnd(change.budget)}`, action: `Budget set to ${formatVnd(change.budget)}` };
    case "set_deadline": {
      if (change.deadline === null)
        return vi ? { userText: "Không có hạn nhận", action: "Đã bỏ hạn nhận" } : { userText: "No deadline", action: "Deadline removed" };
      const d = shortDate(change.deadline, plan.language);
      return vi ? { userText: `Hạn nhận: ${d}`, action: `Đã đặt hạn nhận ${d}` } : { userText: `Deadline: ${d}`, action: `Deadline set to ${d}` };
    }
    case "remove_item": {
      const l = labelOf(versions, change.itemKey);
      return vi ? { userText: `Đã bỏ: ${l}`, action: `Đã bỏ ${l}` } : { userText: `Removed: ${l}`, action: `Removed ${l}` };
    }
    case "restore_item": {
      const l = labelOf(versions, change.itemKey);
      return vi ? { userText: `Đã thêm lại: ${l}`, action: `Đã thêm lại ${l}` } : { userText: `Restored: ${l}`, action: `Restored ${l}` };
    }
    case "restore_version":
      return vi
        ? { userText: `Khôi phục phiên bản ${change.version}`, action: `Đã khôi phục phiên bản ${change.version}` }
        : { userText: `Restored version ${change.version}`, action: `Restored version ${change.version}` };
  }
}

/** "Removed Lunch box. New total 820.000₫." (+ ", over budget by 40.000₫") — totals of the Balanced option. */
function explanationFor(action: string, options: BasketOption[], lang: KitPlan["language"]): string {
  const o = options.find((x) => x.profile === "balanced") ?? options[0];
  if (!o) return `${action}.`;
  const over = o.status === "over_budget" && o.overBy ? o.overBy : null;
  if (lang === "vi") return `${action}. Tổng mới ${formatVnd(o.grandTotal)}${over ? `, vượt ngân sách ${formatVnd(over)}` : ""}.`;
  return `${action}. New total ${formatVnd(o.grandTotal)}${over ? `, over budget by ${formatVnd(over)}` : ""}.`;
}

/** Applies one change to the caller's thread and appends the new version. Throws AdjustError for a bad change. */
export async function adjustKit(deps: AdjustDeps, req: AdjustRequest): Promise<KitVersion> {
  const { adapter, store, today } = deps;
  const { thread, versions } = req.thread;
  const latest = versions.at(-1);
  if (!latest) throw new Error(`thread ${thread.id} has no version`);
  const edited = applyChange(versions, req.change, today);
  const { plan } = edited;
  const { userText, action } = texts(versions, req.change, plan);
  const base = {
    threadId: thread.id,
    kind: edited.kind,
    userText,
    plan,
    excludedKeys: edited.excludedKeys,
    diff: diffPlans(latest.plan, plan),
    selection: null,
    followUp: null,
  };

  if (edited.awaiting && plan.budget === null) {
    return store.appendVersion({ ...base, status: "awaiting_budget", options: [], explanation: "" }, req.owner);
  }

  const [shops, vouchers, persona] = await Promise.all([
    adapter.listShops(),
    adapter.listVouchers(thread.persona),
    adapter.getPersona(thread.persona),
  ]);
  const match = await matchPlan(adapter, plan, { shops, today });
  const profiles = req.profiles?.length ? req.profiles : ALL_PROFILES;
  const options = withInterests(
    optimize({ plan, candidates: match.candidates, noMatch: match.noMatch, shops, vouchers, today }, profiles),
    plan,
    match.pool,
    persona,
    vouchers,
    today,
  );

  // The budget answer to a clarify = the thread's first options: record its demand (once per thread).
  if (req.change.type === "set_budget" && latest.status === "awaiting_budget" && !demandRecorded(versions)) {
    const { sessionId } = await adapter.recordIntent({ query: versions[0].userText, plan, source: "live" });
    await adapter.recordDemandItems(sessionId, demandRows(plan, match));
  }
  return store.appendVersion({ ...base, status: "ready", options, explanation: explanationFor(action, options, plan.language) }, req.owner);
}
