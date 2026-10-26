"use client";
// Store-wide error state (e.g. adapter/DB unreachable): honest message + retry, header stays usable.
import { TriangleAlert } from "lucide-react";

export default function StoreError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-10 text-center shadow-sm">
      <TriangleAlert className="h-10 w-10 text-amber-500" />
      <div className="font-medium text-gray-800">The store could not load right now.</div>
      <div className="max-w-md text-sm text-gray-500">{error.message}</div>
      <button
        onClick={reset}
        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
      >
        Try again
      </button>
    </div>
  );
}
