"use client";
// Plain-language change to the current kit ("School gives the uniform, cut the budget to 1M") → /api/kit/refine.
import { useState, type FormEvent } from "react";
import { Wand2 } from "lucide-react";

export function RefineBox({ disabled, onRefine }: { disabled: boolean; onRefine: (message: string) => void }) {
  const [msg, setMsg] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const m = msg.trim();
    if (!m || disabled) return;
    onRefine(m);
    setMsg("");
  }
  return (
    <form onSubmit={submit} className="flex gap-2 rounded-2xl bg-white p-2 shadow-sm" aria-label="Refine the kit">
      <input
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        placeholder="Change something, e.g. School gives the uniform, cut the budget to 1M"
        aria-label="Change your kit"
        className="min-w-0 flex-1 rounded-lg px-2 text-sm outline-none"
      />
      <button
        type="submit"
        disabled={disabled || !msg.trim()}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
      >
        <Wand2 className="h-4 w-4" /> Update kit
      </button>
    </form>
  );
}
