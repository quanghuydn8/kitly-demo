// Basket tabs (T11, polished in 20b): one tab per DISTINCT basket in Saver → Balanced → Premium order. Identical
// baskets (same grandTotal and same set of productId×quantity lines) merge into one tab, e.g. "Saver = Balanced".
// All options empty ⇒ no tabs (the panel shows the single honest-gap view). Default tab = the one holding Balanced.
import type { BasketOption, Profile } from "@/contract";
import { formatVnd } from "./format";

export const PROFILE_ORDER: Profile[] = ["saver", "balanced", "premium"];
export const PROFILE_NAME: Record<Profile, string> = { saver: "Saver", balanced: "Balanced", premium: "Premium" };
export const PROFILE_MEANING: Record<Profile, string> = {
  saver: "lowest total",
  balanced: "best value",
  premium: "top-rated within budget",
};

export interface BasketTab {
  id: string; // profiles joined by "+", e.g. "saver+balanced"
  profiles: Profile[];
  /** The tab's representative profile (Balanced when merged with it): used for re-pricing a selection. */
  profile: Profile;
  option: BasketOption;
  label: string;
  overBudget: boolean;
}

function basketKey(o: BasketOption): string {
  const lines = o.lines.map((l) => `${l.product.id}x${l.quantity}`).sort();
  return `${o.grandTotal}|${lines.join(",")}`;
}

export function basketTabs(options: BasketOption[]): BasketTab[] {
  if (options.every((o) => o.lines.length === 0)) return [];
  const sorted = [...options].sort((a, b) => PROFILE_ORDER.indexOf(a.profile) - PROFILE_ORDER.indexOf(b.profile));
  const groups: BasketOption[][] = [];
  for (const o of sorted) {
    const g = groups.find((x) => basketKey(x[0]) === basketKey(o));
    if (g) g.push(o);
    else groups.push([o]);
  }
  return groups.map((g) => {
    const profiles = g.map((o) => o.profile);
    const rep = g.find((o) => o.profile === "balanced") ?? g[0];
    const name = profiles.map((p) => PROFILE_NAME[p]).join(" = ");
    return {
      id: profiles.join("+"),
      profiles,
      profile: rep.profile,
      option: rep,
      label: `${name} · ${formatVnd(rep.grandTotal)} · ${PROFILE_MEANING[rep.profile]}`,
      overBudget: g.some((o) => o.status === "over_budget"),
    };
  });
}

export function defaultTabId(tabs: BasketTab[]): string | null {
  return (tabs.find((t) => t.profiles.includes("balanced")) ?? tabs[0])?.id ?? null;
}

const HOW: Record<Profile, string> = { saver: "cheaper", balanced: "other", premium: "higher-rated" };

/** "a", "a and b", "a, b and c", "a, b, c and 2 more" (at most 3 names). */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * 20b: one line on how a basket differs from Balanced, e.g. "−26.000 ₫, cheaper pencils & pens" or
 * "+380.000 ₫, higher-rated school shoes and lunch box". Differing items = item keys whose product differs or that
 * only one basket has, in plan (line) order. Null for Balanced itself or a basket identical to it.
 */
export function differenceLine(option: BasketOption, balanced: BasketOption, needLabel: (itemKey: string) => string): string | null {
  if (option.profile === "balanced") return null;
  const productOf = (o: BasketOption) => new Map(o.lines.map((l) => [l.itemKey, `${l.product.id}x${l.quantity}`]));
  const mine = productOf(option);
  const theirs = productOf(balanced);
  const keys = [...new Set([...theirs.keys(), ...mine.keys()])].filter((k) => mine.get(k) !== theirs.get(k));
  const delta = option.grandTotal - balanced.grandTotal;
  if (!keys.length && delta === 0) return null;
  const money = delta === 0 ? "same total" : `${delta < 0 ? "−" : "+"}${formatVnd(Math.abs(delta))}`;
  if (!keys.length) return money;
  const names = keys.map((k) => {
    const s = needLabel(k);
    return s.charAt(0).toLowerCase() + s.slice(1);
  });
  return `${money}, ${HOW[option.profile]} ${listNames(names)}`;
}
