// Insights aggregation (PRD "Insights"): pure code over demand rows — weekly windows, unmet gaps, price band,
// needed-with, combos, top needs. No adapter, no LLM.
import { gapKeyFor, type CategoryId, type DemandItemRow, type EventType } from "@/contract";
import { addDays } from "@/server/today";

/** A plan item is unmet when fewer than this many products matched it (PRD). */
export const UNMET_BELOW = 2;
const COMBOS = 5;
const NEEDED_WITH = 3;
const PAIR_EXPLAINED = 0.8;

export interface InsightWindow {
  thisWeekFrom: string;
  lastWeekFrom: string;
  today: string;
}

/** "This week" = the 7 days ending today, "last week" = the 7 days before (DATA.md). */
export function insightWindow(today: string): InsightWindow {
  return { thisWeekFrom: addDays(today, -6), lastWeekFrom: addDays(today, -13), today };
}

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

export interface DemandAggregate {
  gaps: GapStats[]; // all unmet gaps in the 2-week window, sorted thisWeek desc, lastWeek desc, key asc
  combos: { categories: CategoryId[]; count: number }[];
  topNeeds: { event: EventType; count: number }[];
}

/** Linear-interpolated percentile of a sorted list, rounded to 1,000₫. */
export function percentile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const v = sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (idx - lo);
  return Math.round(v / 1000) * 1000;
}

const byCountThenName =
  <T>(count: (t: T) => number, name: (t: T) => string) =>
  (a: T, b: T) =>
    count(b) - count(a) || name(a).localeCompare(name(b));

/** Most frequent value; ties go to the alphabetically first. */
function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort(
    byCountThenName(
      ([, n]) => n,
      ([v]) => v,
    ),
  )[0][0];
}

function combinations<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return xs.flatMap((x, i) => combinations(xs.slice(i + 1), k - 1).map((rest) => [x, ...rest]));
}

/**
 * Category pairs and triples needed together in this week's sessions, most frequent first (larger set first on
 * ties). A pair is dropped when a triple containing it covers ≥ PAIR_EXPLAINED of its sessions, so the seller
 * sees "backpack + bottle + lunch box" once instead of three near-identical pairs.
 */
function topCombos(sessions: DemandItemRow[][]): DemandAggregate["combos"] {
  const counts = new Map<string, number>();
  for (const rows of sessions) {
    const cats = [...new Set(rows.flatMap((r) => (r.category ? [r.category] : [])))].sort();
    for (const k of [2, 3])
      for (const c of combinations(cats, k)) counts.set(c.join(","), (counts.get(c.join(",")) ?? 0) + 1);
  }
  const all = [...counts].map(([key, count]) => ({ categories: key.split(","), count }));
  const triples = all.filter((c) => c.categories.length === 3);
  return all
    .filter(
      (c) =>
        c.categories.length === 3 ||
        !triples.some(
          (t) => t.count >= PAIR_EXPLAINED * c.count && c.categories.every((x) => t.categories.includes(x)),
        ),
    )
    .sort(
      (a, b) =>
        b.count - a.count ||
        b.categories.length - a.categories.length ||
        a.categories.join().localeCompare(b.categories.join()),
    )
    .slice(0, COMBOS);
}

const groupBy = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
  return m;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Aggregates demand rows (any range; rows outside the window are ignored). */
export function aggregateDemand(rows: DemandItemRow[], w: InsightWindow): DemandAggregate {
  const day = (r: DemandItemRow) => r.createdAt.slice(0, 10);
  const inWindow = rows.filter((r) => day(r) >= w.lastWeekFrom && day(r) <= w.today);
  const isThisWeek = (r: DemandItemRow) => day(r) >= w.thisWeekFrom;
  const sessions = groupBy(inWindow, (r) => r.sessionId);

  const unmet = groupBy(
    inWindow.filter((r) => r.matchedCount < UNMET_BELOW),
    (r) => gapKeyFor(r.category, r.tags),
  );
  const gaps: GapStats[] = [...unmet].map(([key, gapRows]) => {
    const first = gapRows[0];
    const hints = gapRows.flatMap((r) => (r.budgetHint === null ? [] : [r.budgetHint])).sort((a, b) => a - b);
    const gapSessions = [...new Set(gapRows.map((r) => r.sessionId))];
    const withCounts = new Map<CategoryId, number>();
    for (const id of gapSessions) {
      const cats = new Set(
        sessions.get(id)!.flatMap((r) => (r.category && r.category !== first.category ? [r.category] : [])),
      );
      for (const c of cats) withCounts.set(c, (withCounts.get(c) ?? 0) + 1);
    }
    return {
      key,
      needLabel: mode(gapRows.map((r) => r.needLabel)),
      category: first.category,
      tags: [...new Set(first.tags)].sort(),
      thisWeek: gapRows.filter(isThisWeek).length,
      lastWeek: gapRows.filter((r) => !isThisWeek(r)).length,
      priceBand: hints.length ? { p25: percentile(hints, 0.25), p75: percentile(hints, 0.75) } : null,
      neededWith: [...withCounts]
        .sort(
          byCountThenName(
            ([, n]) => n,
            ([c]) => c,
          ),
        )
        .slice(0, NEEDED_WITH)
        .map(([category, n]) => ({ category, share: round2(n / gapSessions.length) })),
    };
  });
  gaps.sort((a, b) => b.thisWeek - a.thisWeek || b.lastWeek - a.lastWeek || a.key.localeCompare(b.key));

  const thisWeekSessions = [...sessions.values()].filter((rs) => isThisWeek(rs[0]));
  const events = new Map<EventType, number>();
  for (const rs of thisWeekSessions) events.set(rs[0].event, (events.get(rs[0].event) ?? 0) + 1);

  return {
    gaps,
    combos: topCombos(thisWeekSessions),
    topNeeds: [...events]
      .sort(
        byCountThenName(
          ([, n]) => n,
          ([e]) => e,
        ),
      )
      .map(([event, count]) => ({ event, count })),
  };
}
