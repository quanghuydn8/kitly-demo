// Kitly text helpers (T11). The honest no-match sentence follows the PLAN language (en/vi); the rest is English
// chrome. Pure functions, unit-tested.
import type { BasketOption, KitPlan, KitVersion } from "@/contract";
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

/** Vietnamese words for the canonical feature tags (context tags are never must-have). */
const VI_TAG: Record<string, string> = {
  "anti-hunchback": "chống gù",
  lightweight: "siêu nhẹ",
  waterproof: "chống nước",
  "bpa-free": "không BPA",
  insulated: "giữ nhiệt",
  "leak-proof": "chống tràn",
  "non-slip": "chống trượt",
  "organic-cotton": "cotton hữu cơ",
  foldable: "gấp gọn",
  compact: "nhỏ gọn",
  quiet: "êm",
  "energy-saving": "tiết kiệm điện",
  ergonomic: "công thái học",
  adjustable: "điều chỉnh được",
  wireless: "không dây",
  "noise-cancelling": "chống ồn",
  "uv-protection": "chống UV",
  "reef-safe": "an toàn rạn san hô",
  "2-person": "2 người",
  "4-person": "4 người",
  "anti-blue-light": "chống ánh sáng xanh",
  "backpack-cover": "có áo trùm balo",
};

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
  // The planner's label may omit the must-have ("School backpack" / "Balo đi học"); the sentence must still say
  // what is missing, so tags the label does not already mention are named (EN slug as words, VI via VI_TAG).
  const tags = row.reason === "no_product_with_tags" ? (row.closest?.missingTags ?? item?.mustHaveTags ?? []) : [];
  const flat = (s: string) => s.toLowerCase().replace(/[-\s]+/g, " ");
  const words = tags.map((t) => (vi ? (VI_TAG[t] ?? t) : t)).filter((w) => !flat(need).includes(flat(w)));
  if (vi) return `Chưa có ${[need, ...words].join(" ")}${price}`;
  return `No exact match: no ${[...words, need].join(" ")}${price}`;
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

/** Refine diff chips (Beat 2: "Removed: uniform"): removed labels come from the previous plan, added/changed from this one. */
export function diffChips(v: KitVersion, prev: KitVersion | undefined): string[] {
  if (!v.diff) return [];
  const label = (plan: KitPlan | undefined, key: string) => lowerFirst(plan?.items.find((i) => i.key === key)?.needLabel ?? key);
  return [
    ...v.diff.added.map((k) => `Added: ${label(v.plan, k)}`),
    ...v.diff.removed.map((k) => `Removed: ${label(prev?.plan, k)}`),
    ...v.diff.changed.map((k) => `Changed: ${label(v.plan, k)}`),
  ];
}
