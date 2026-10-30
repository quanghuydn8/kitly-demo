// Kit edits (T15, D28/D29/D32/D33): pure helpers for the buyer's touch edits. Selections are built here and sent to
// POST /api/kit/price; every total shown comes back from the server (no client price maths).
import type { BasketLine, BasketOption, FitSuggestion, KitSelection, KitVersion, Profile } from "@/contract";
import { missingLabel } from "./kit-text";

/** The buyer's selection for `profile`; a selection made for another profile does not carry over. */
function base(selection: KitSelection | null, profile: Profile): KitSelection {
  return selection?.profile === profile ? selection : { profile, picks: {}, dropped: [] };
}

/** Swap or "Add anyway": pick `productId` for `itemKey`. */
export function withPick(selection: KitSelection | null, profile: Profile, itemKey: string, productId: string): KitSelection {
  const b = base(selection, profile);
  return { ...b, picks: { ...b.picks, [itemKey]: productId } };
}

/** Take an "Add anyway" product out again: the item goes back to its No exact match row. */
export function withoutPick(selection: KitSelection | null, profile: Profile, itemKey: string): KitSelection {
  const b = base(selection, profile);
  const picks = { ...b.picks };
  delete picks[itemKey];
  return { ...b, picks };
}

/** Apply a Fit to budget suggestion: its removals join `dropped`, its swaps join `picks`. */
export function withFit(selection: KitSelection | null, profile: Profile, fit: FitSuggestion): KitSelection {
  const b = base(selection, profile);
  const picks = { ...b.picks };
  for (const s of fit.swaps) picks[s.itemKey] = s.productId;
  return { profile, picks, dropped: [...new Set([...b.dropped, ...fit.removeItemKeys])] };
}

/**
 * "Closest match · missing anti-hunchback" when `line` holds the closest product the optimizer offered for that item
 * (the buyer added it anyway), else null. `baseOption` = the version's option before the buyer's edits.
 */
export function closestMatchLabel(baseOption: BasketOption, line: BasketLine): string | null {
  const row = baseOption.noMatch.find((n) => n.itemKey === line.itemKey);
  if (!row?.closest || row.closest.candidate.product.id !== line.product.id) return null;
  const tags = row.closest.missingTags;
  return tags.length > 0 ? `Closest match · ${missingLabel(tags).replace(/^Missing:/, "missing")}` : "Closest match";
}

/** The item a "Removed: X" adjust took out, while the latest version still excludes it (so Undo can bring it back). */
export function undoableRemoval(v: KitVersion, latest: KitVersion): string | null {
  if (v.kind !== "adjust" || v.diff?.removed.length !== 1) return null;
  const key = v.diff.removed[0];
  return v.excludedKeys.includes(key) && latest.excludedKeys.includes(key) ? key : null;
}

/**
 * Budget typed by the buyer, in VND: "1.500.000", "1,2tr", "800k", "2M". Empty = no limit (null);
 * unreadable or ≤ 0 = undefined.
 */
export function parseBudgetInput(text: string): number | null | undefined {
  const t = text.trim().toLowerCase().replace(/\s+/g, "").replace(/₫|vnd|đ$/g, "");
  if (!t) return null;
  const m = /^(\d+(?:[.,]\d+)?)(k|m|tr|triệu)?$/.exec(t);
  if (m) {
    const unit = m[2] === "k" ? 1_000 : m[2] ? 1_000_000 : 1;
    const n = Math.round(Number(m[1].replace(",", ".")) * unit);
    // "1.500" without a unit is a grouped thousand, not 1.5
    const value = unit === 1 ? Number(m[1].replace(/[.,]/g, "")) : n;
    return value > 0 ? value : undefined;
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) {
    const value = Number(t.replace(/[.,]/g, ""));
    return value > 0 ? value : undefined;
  }
  return undefined;
}

/** The refine message an edited assumption chip sends through the composer path (LLM refine, new version). */
export function assumptionCorrection(oldText: string, newText: string): string {
  return `"${oldText}" is wrong: ${newText.trim()}`;
}
