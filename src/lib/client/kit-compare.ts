// Three baskets side by side (T20b, PRD story 17): turns BasketOption[] into columns (Saver / Balanced / Premium,
// always in that order) and rows (one per plan item, one cell per column) with the rows where profiles disagree
// flagged, so the UI can highlight the trade-off. Pure; the "score" is the mean product rating of the basket's
// lines (BasketOption carries no score of its own), shown in half stars.
import type { BasketLine, BasketOption, KitPlan } from "@/contract/types";

export type Profile = BasketOption["profile"];
export const KIT_PROFILES: Profile[] = ["saver", "balanced", "premium"];
export const PROFILE_LABEL: Record<Profile, string> = { saver: "Saver", balanced: "Balanced", premium: "Premium" };

export interface CompareColumn {
  /** Representative profile: Balanced when it is in the group, else the first member. */
  profile: Profile;
  /** All profiles this column stands for (several when identical baskets are merged), in Saver/Balanced/Premium order. */
  profiles: Profile[];
  label: string;
  option: BasketOption;
  /** Mean product rating of the lines, null when the basket has no lines. */
  rating: number | null;
  /** rating rounded to the nearest half star (0 when no lines). */
  stars: number;
  /** grandTotal − Balanced grandTotal; null when there is no Balanced option. */
  deltaVsBalanced: number | null;
}

export type CompareCell =
  | { kind: "line"; line: BasketLine }
  | { kind: "gap"; needLabel: string }
  | { kind: "skipped"; needLabel: string }
  | { kind: "absent" };

export interface CompareRow {
  itemKey: string;
  needLabel: string;
  /** One per column, same order as columns. */
  cells: CompareCell[];
  /** True when the columns do not all pick the same thing for this item. */
  differs: boolean;
}

function cellFor(o: BasketOption, key: string): CompareCell {
  const line = o.lines.find((l) => l.itemKey === key);
  if (line) return { kind: "line", line };
  const gap = o.noMatch.find((g) => g.itemKey === key);
  if (gap) return { kind: "gap", needLabel: gap.needLabel };
  const skip = o.skipped.find((s) => s.itemKey === key);
  if (skip) return { kind: "skipped", needLabel: skip.needLabel };
  return { kind: "absent" };
}

const signature = (c: CompareCell) =>
  c.kind === "line" ? `line:${c.line.product.id}x${c.line.quantity}` : c.kind;

function labelFor(cells: CompareCell[], fallback: string): string {
  for (const c of cells) if (c.kind === "gap" || c.kind === "skipped") return c.needLabel;
  return fallback;
}

/** Same product ids + quantities and same grand total ⇒ the buyer sees one basket, not two. */
const basketSignature = (o: BasketOption) =>
  `${o.grandTotal}|${o.lines
    .map((l) => `${l.product.id}x${l.quantity}`)
    .sort()
    .join(",")}`;

export function compareBaskets(options: BasketOption[], plan: KitPlan | null) {
  const sorted = [...options].sort((a, b) => KIT_PROFILES.indexOf(a.profile) - KIT_PROFILES.indexOf(b.profile));
  const balanced = sorted.find((o) => o.profile === "balanced");

  // F8: merge identical baskets into one group (group order = first member's position).
  const groups: BasketOption[][] = [];
  for (const o of sorted) {
    const g = groups.find((grp) => basketSignature(grp[0]) === basketSignature(o));
    if (g) g.push(o);
    else groups.push([o]);
  }
  const ordered = groups.map((g) => g.find((o) => o.profile === "balanced") ?? g[0]);

  const columns: CompareColumn[] = groups.map((g, gi) => {
    const o = ordered[gi];
    const rating = o.lines.length ? o.lines.reduce((s, l) => s + l.product.rating, 0) / o.lines.length : null;
    return {
      profile: o.profile,
      profiles: g.map((m) => m.profile),
      label: g.map((m) => PROFILE_LABEL[m.profile]).join(" = "),
      option: o,
      rating,
      stars: rating === null ? 0 : Math.round(rating * 2) / 2,
      deltaVsBalanced: balanced ? o.grandTotal - balanced.grandTotal : null,
    };
  });

  // Plan order first, then any item a basket mentions that the plan does not list.
  const keys = (plan?.items ?? []).map((i) => i.key);
  for (const o of ordered)
    for (const k of [...o.lines.map((l) => l.itemKey), ...o.noMatch.map((g) => g.itemKey), ...o.skipped.map((s) => s.itemKey)])
      if (!keys.includes(k)) keys.push(k);

  const rows: CompareRow[] = keys.map((key) => {
    const cells = ordered.map((o) => cellFor(o, key));
    const planLabel = plan?.items.find((i) => i.key === key)?.needLabel;
    return {
      itemKey: key,
      needLabel: planLabel ?? labelFor(cells, key),
      cells,
      differs: new Set(cells.map(signature)).size > 1,
    };
  });

  return { columns, rows };
}
