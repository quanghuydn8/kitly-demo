// The last need the buyer ran on /kit, remembered per browser so "Back to buyer" on /seller re-runs it
// (DEMO.md Beat 4: back to the buyer, run the Beat 1 query again). Storage may be missing or throw
// (private window, blocked site data) — then the link simply goes to an empty /kit.
const KEY = "kitly:lastQuery";

const browserStorage = (): Storage | undefined => {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

export function rememberKitQuery(query: string, storage: Storage | undefined = browserStorage()): void {
  try {
    storage?.setItem(KEY, query);
  } catch {
    /* per-viewer convenience only */
  }
}

export function recallKitQuery(storage: Storage | undefined = browserStorage()): string | null {
  try {
    return storage?.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function buyerHref(query: string | null): string {
  const q = query?.trim();
  return q ? `/kit?q=${encodeURIComponent(q)}` : "/kit";
}
