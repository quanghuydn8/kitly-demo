// "Notify me when available" (Full, PRD stories 24 + 39): a buyer watches an unmet need by its gap key;
// sellers see the count as `watchers` on that gap in insights. Through the CommerceAdapter (demand_watches).
import { CATEGORY_IDS, gapKeyFor, type CommerceAdapter } from "@/contract";

const KEY = /^([a-z0-9-]+)\|([a-z0-9,-]*)$/;
const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The canonical gap key (sorted, deduped tags), or null when it is not `${taxonomy id | "none"}|${kebab tags}`. */
export function normalizeGapKey(key: string): string | null {
  const m = KEY.exec(key);
  if (!m) return null;
  const category = m[1] === "none" ? null : m[1];
  if (category !== null && !CATEGORY_IDS.includes(category)) return null;
  const tags = m[2] ? m[2].split(",") : [];
  if (!tags.every((t) => TAG.test(t))) return null;
  return gapKeyFor(category, tags);
}

/** Stores one watch; returns the number of buyers now waiting on that gap. */
export async function watchGap(gapKey: string, deps: { adapter: CommerceAdapter }): Promise<number> {
  return deps.adapter.addDemandWatch(gapKey);
}
