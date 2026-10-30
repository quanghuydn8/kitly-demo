// Kitly text helpers (T11). The honest no-match sentence follows the PLAN language (en/vi); the rest is English
// chrome. Pure functions, unit-tested.
import type { BasketOption, KitPlan } from "@/contract";
import { formatShortDate, formatVnd } from "./format";

type NoMatch = BasketOption["noMatch"][number];
type Lang = KitPlan["language"];

/** 400000 → "400k", 1500000 → "1.5M", 2000000 → "2M". */
export function kAmount(vnd: number): string {
  if (vnd >= 1_000_000) return `${Number((vnd / 1_000_000).toFixed(1))}M`;
  if (vnd >= 1_000) return `${Math.round(vnd / 1_000)}k`;
  return String(vnd);
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "2026-09-05" → "5/9" (Vietnamese day/month). */
function viDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d}/${m}`;
}

/** "No exact match: no anti-hunchback backpack under 400k" / "Chưa có balo chống gù dưới 400.000 ₫". */
export function noMatchSentence(row: NoMatch, plan: KitPlan): string {
  const item = plan.items.find((i) => i.key === row.itemKey);
  const need = lowerFirst(row.needLabel);
  const max = item?.maxUnitPrice ?? null;
  const vi = plan.language === "vi";
  if (row.reason === "no_category") return vi ? `Cửa hàng chưa bán ${need}` : `Not in store yet: ${need}`;
  if (row.reason === "none_in_time" && plan.deadline) {
    return vi
      ? `Chưa có ${need} giao kịp trước ${viDate(plan.deadline)}`
      : `No exact match: no ${need} arriving by ${formatShortDate(plan.deadline)}`;
  }
  const price = max === null ? "" : vi ? ` dưới ${formatVnd(max)}` : ` under ${kAmount(max)}`;
  return vi ? `Chưa có ${need}${price}` : `No exact match: no ${need}${price}`;
}

export function missingLabel(tags: string[]): string {
  return `Missing: ${tags.join(", ")}`;
}

export function overMaxLabel(amount: number): string {
  return `Over your max price by ${formatVnd(amount)}`;
}

/** Budget question for a loaded `awaiting_budget` version (the live `clarify` event carries its own text). */
export function clarifyQuestion(lang: Lang): string {
  return lang === "vi" ? "Ngân sách của bạn khoảng bao nhiêu?" : "What's your budget?";
}

export const DEFAULT_BUDGET_CHOICES: (number | null)[] = [500_000, 1_000_000, 2_000_000, null];

export function budgetChoiceLabel(choice: number | null): string {
  return choice === null ? "No limit" : formatVnd(choice);
}

/** History sidebar date, counted back from `nowIso` (the demo clock, never business logic). */
export function relativeTime(iso: string, nowIso: string): string {
  const sec = Math.max(0, (Date.parse(nowIso) - Date.parse(iso)) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86_400) return `${Math.floor(sec / 3600)} h ago`;
  const days = Math.floor(sec / 86_400);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
