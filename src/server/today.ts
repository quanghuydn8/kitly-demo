// "Today" for all business logic = DEMO_TODAY (default 2026-09-02, D45). Never use new Date() for business dates.
const DEFAULT_TODAY = "2026-09-02";

/** Demo date as YYYY-MM-DD. */
export function today(): string {
  const v = process.env.DEMO_TODAY?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_TODAY;
}

/** DEMO_TODAY + the current wall-clock time of day, as ISO. Live sessions land in "this week" (DATA.md §6). */
export function demoNowIso(): string {
  const timeOfDay = new Date().toISOString().slice(10); // "THH:MM:SS.sssZ"
  return today() + timeOfDay;
}

/** ISO date `days` after (or before, if negative) the given YYYY-MM-DD. */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);
}
