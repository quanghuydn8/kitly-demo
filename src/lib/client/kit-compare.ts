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
