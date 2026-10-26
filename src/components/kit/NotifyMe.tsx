"use client";
// Buyer-side "Notify me" on a noMatch row (Full): one POST /api/demand/watch per click, then disabled
// (no auth, so one watch per row per page view — T07 note).
import { useState } from "react";
import { Bell, BellRing } from "lucide-react";

type State = { s: "idle" } | { s: "sending" } | { s: "done"; watchers: number } | { s: "error" };

export function NotifyMe({ gapKey, onNotify }: { gapKey: string; onNotify: (gapKey: string) => Promise<number> }) {
  const [st, setSt] = useState<State>({ s: "idle" });
  if (st.s === "done")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700" role="status">
        <BellRing className="h-3.5 w-3.5" />
        {`We'll notify you · ${st.watchers} waiting`}
      </span>
    );
  return (
    <button
      type="button"
      data-gapkey={gapKey}
      disabled={st.s === "sending"}
      onClick={() => {
        setSt({ s: "sending" });
        onNotify(gapKey).then(
          (watchers) => setSt({ s: "done", watchers }),
          () => setSt({ s: "error" }),
        );
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--accent)] px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-orange-50 disabled:opacity-50"
    >
      <Bell className="h-3.5 w-3.5" />
      {st.s === "error" ? "Try again" : "Notify me"}
    </button>
  );
}
