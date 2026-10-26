"use client";
// Big need input + Run + one example chip per event.
import { useEffect, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";

export const EXAMPLE_NEEDS: { label: string; query: string }[] = [
  {
    label: "Back to school",
    query:
      "My kid starts Grade 1. Budget 1.5M VND, need everything by Aug 25. The backpack must be anti-hunchback, under 400k.",
  },
  { label: "Newborn", query: "We're expecting a baby next month. Newborn essentials under 3M, organic cotton clothes." },
  {
    label: "First apartment",
    query: "Moving into my first apartment by Aug 30, budget 2.5M, need basics for cooking and sleeping.",
  },
  { label: "Camping trip", query: "Camping trip for 2 people on Aug 28, budget 2M, the tent must be waterproof." },
  { label: "Home office", query: "Set up a home office for long workdays, ergonomic chair, budget 6M." },
  { label: "Tết gifts", query: "Tết gifts for 5 relatives, around 500k each, gift-wrapped." },
];

export function NeedForm({
  initial,
  running,
  onRun,
}: {
  initial: string;
  running: boolean;
  onRun: (query: string) => void;
}) {
  const [q, setQ] = useState(initial);
  useEffect(() => setQ(initial), [initial]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (q.trim() && !running) onRun(q.trim());
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          rows={2}
          placeholder="Describe your need in one sentence — English or Vietnamese"
          aria-label="Your need"
          className="min-w-0 flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-base outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={running || !q.trim()}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-5 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> {running ? "Building…" : "Build my kit"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Examples">
        {EXAMPLE_NEEDS.map((x) => (
          <button
            key={x.label}
            type="button"
            disabled={running}
            onClick={() => {
              setQ(x.query);
              onRun(x.query);
            }}
            title={x.query}
            className="rounded-full bg-orange-50 px-2.5 py-1 text-xs text-[var(--accent)] hover:bg-orange-100 disabled:opacity-50"
          >
            {x.label}
          </button>
        ))}
      </div>
    </section>
  );
}
