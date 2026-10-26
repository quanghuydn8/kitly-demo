// The ONLY source of "today" for business logic (AGENTS.md). Never call new Date() for dates elsewhere.
const DEFAULT_TODAY = "2026-08-20";

/** Demo date as YYYY-MM-DD, from DEMO_TODAY (default 2026-08-20). */
export function today(): string {
  const v = process.env.DEMO_TODAY?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : DEFAULT_TODAY;
}

/** ISO datetime on the demo date with the real time of day — used to timestamp live sessions (DATA.md §6). */
export function todayIso(): string {
  return `${today()}${new Date().toISOString().slice(10)}`;
}

/** Adds n days to a YYYY-MM-DD date (UTC, no timezone drift). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
