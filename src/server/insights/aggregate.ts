// Insights aggregation (pure, no I/O): demand rows of the last two weeks → gap stats, combos, top needs.
// Rules (CONTRACT §3 Gap rules): unmet = matchedCount < 2; counts are DISTINCT sessions; all null-category needs
// form ONE gap `none|`; gaps with thisWeek < 3 are dropped by the caller (buildInsights).
import type { CategoryId, DemandItemRow, EventType } from "@/contract";
import { addDays } from "@/server/today";

export const UNMET_BELOW = 2;
export const VISIBLE_FROM = 3;
export const NONE_KEY = "none|";

export interface InsightWindow {
  thisWeekFrom: string;
  lastWeekFrom: string;
  today: string;
}

/** "This week" = the 7 days ending today, "last week" = the 7 days before (DATA.md). */
export function insightWindow(today: string): InsightWindow {
  return { thisWeekFrom: addDays(today, -6), lastWeekFrom: addDays(today, -13), today };
}

type Week = "this" | "last";
function weekOf(createdAt: string, w: InsightWindow): Week | null {
  const day = createdAt.slice(0, 10);
  if (day > w.today) return null;
  if (day >= w.thisWeekFrom) return "this";
  if (day >= w.lastWeekFrom) return "last";
  return null;
}

export const gapKey = (category: CategoryId | null, tags: string[]): string =>
  category === null ? NONE_KEY : `${category}|${[...tags].sort().join(",")}`;

export interface GapStats {
  key: string;
  needLabel: string;
  category: CategoryId | null;
  tags: string[];
  thisWeek: number;
  lastWeek: number;
  priceBand: { p25: number; p75: number } | null;
  neededWith: { category: CategoryId; share: number }[];
}

export interface Aggregate {
  gaps: GapStats[]; // every gap with ≥ 1 session in the window, unfiltered and unsorted
  combos: { categories: CategoryId[]; count: number }[];
  topNeeds: { event: EventType; count: number }[];
}

/** Nearest-rank percentile on sorted values (returns a real budget hint, e.g. 350000). */
const percentile = (sorted: number[], p: number) => sorted[Math.floor((sorted.length - 1) * p)];

/** Most frequent first (by distinct sessions), ties alphabetical. */
function rankLabels(rows: DemandItemRow[]): string[] {
  const sessions = new Map<string, Set<string>>();
  for (const r of rows) sessions.set(r.needLabel, (sessions.get(r.needLabel) ?? new Set()).add(r.sessionId));
  return [...sessions.entries()]
    .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]))
    .map(([label]) => label);
}

const byCountThenName = <T extends { count: number }>(name: (x: T) => string) => (a: T, b: T) =>
  b.count - a.count || name(a).localeCompare(name(b));

export function aggregate(rows: DemandItemRow[], w: InsightWindow): Aggregate {
  const inWindow = rows.flatMap((r) => {
    const week = weekOf(r.createdAt, w);
    return week ? [{ ...r, week }] : [];
  });

  // categories per session this week (met + unmet): neededWith and combos
  const sessionCats = new Map<string, Set<CategoryId>>();
  const sessionEvent = new Map<string, EventType>();
  for (const r of inWindow) {
    if (r.week !== "this") continue;
    sessionEvent.set(r.sessionId, r.event);
    const cats = sessionCats.get(r.sessionId) ?? new Set<CategoryId>();
    if (r.category) cats.add(r.category);
    sessionCats.set(r.sessionId, cats);
  }

  const groups = new Map<string, typeof inWindow>();
  for (const r of inWindow) {
    if (r.matchedCount >= UNMET_BELOW) continue;
    const key = gapKey(r.category, r.tags);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const gaps: GapStats[] = [...groups.entries()].map(([key, group]) => {
    const thisRows = group.filter((r) => r.week === "this");
    const thisSessions = new Set(thisRows.map((r) => r.sessionId));
    const lastSessions = new Set(group.filter((r) => r.week === "last").map((r) => r.sessionId));
    const first = group[0];
    const category = first.category;
    const labels = rankLabels(thisRows.length ? thisRows : group);
    const hints = group.flatMap((r) => (r.budgetHint === null ? [] : [r.budgetHint])).sort((a, b) => a - b);

    const together = new Map<CategoryId, number>();
    for (const s of thisSessions) {
      for (const c of sessionCats.get(s) ?? []) if (c !== category) together.set(c, (together.get(c) ?? 0) + 1);
    }
    const neededWith = [...together.entries()]
      .map(([c, n]) => ({ category: c, count: n }))
      .sort(byCountThenName((x) => x.category))
      .slice(0, 3)
      .map((x) => ({ category: x.category, share: Math.round((x.count / thisSessions.size) * 100) / 100 }));

    return {
      key,
      needLabel: category === null ? `Not in catalog: ${labels.slice(0, 2).join(", ")}` : labels[0],
      category,
      tags: category === null ? [] : [...first.tags].sort(),
      thisWeek: thisSessions.size,
      lastWeek: lastSessions.size,
      priceBand: hints.length ? { p25: percentile(hints, 0.25), p75: percentile(hints, 0.75) } : null,
      neededWith: thisSessions.size ? neededWith : [],
    };
  });

  const pairs = new Map<string, number>();
  for (const cats of sessionCats.values()) {
    const sorted = [...cats].sort();
    for (let i = 0; i < sorted.length; i++)
      for (let j = i + 1; j < sorted.length; j++) {
        const k = `${sorted[i]}+${sorted[j]}`;
        pairs.set(k, (pairs.get(k) ?? 0) + 1);
      }
  }
  const combos = [...pairs.entries()]
    .map(([k, count]) => ({ categories: k.split("+"), count }))
    .sort(byCountThenName((x) => x.categories.join("+")))
    .slice(0, 5);

  const events = new Map<EventType, number>();
  for (const e of sessionEvent.values()) events.set(e, (events.get(e) ?? 0) + 1);
  const topNeeds = [...events.entries()]
    .map(([event, count]) => ({ event, count }))
    .sort(byCountThenName((x) => x.event));

  return { gaps, combos, topNeeds };
}
